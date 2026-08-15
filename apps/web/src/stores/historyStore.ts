/**
 * History Store — 撤销/重做快照机制 (wayfinder #132, 依 #129 决议)。
 *
 * 决议映射 (#129 grilling 定案):
 *   1. 方案形态   — 状态快照: 对整个可撤销状态深拷贝压栈; 撤销 = 弹栈恢复,
 *                  重做 = 恢复已撤销栈。
 *   2. 覆盖范围   — 标注/测量全量 (创建/移动/删除/编辑) + 编辑套件
 *                  (滤镜/图层显隐/增删); 图像导航与窗宽窗位不纳入。
 *   3. 粒度       — 一次交互完成即快照 (拖拽松手/确认/删除); 拖拽中间态
 *                  不压栈; 撤销一步 = 一次完整操作 (MODIFIED 走尾部去抖)。
 *   4. 步数/内存  — 上限 50 步 FIFO 淘汰; 轻量深拷贝。
 *   5. 交互       — ⌘Z / ⌘⇧Z (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) + 工具条
 *                  撤销/重做图标按钮 (栈空置灰)。
 *   6. 解耦       — 本模块只负责栈与快照; 应用快照 (store 恢复 + Cornerstone
 *                  镜像 + 后端持久化) 由 lib/cornerstone/history-apply.ts 承担。
 *
 * 语义: past 栈 = 各次操作的"前状态" (要回退到的状态)。压栈时机决定了正确性:
 *   - store 驱动操作 (图层/滤镜/列表删除): 变更前调用 recordBefore() 压栈。
 *   - Cornerstone 事件驱动操作 (画/拖/删标注): 事件在变更"后"才触发, 因此
 *     在交互起点 (视口 mousedown) 用 beginInteraction() 记忆 pre-op 状态,
 *     事件到来时 recordInteraction() 压入该记忆; 删除走重建路径。
 * undo: 弹 past 栈顶并应用; redo: 弹 future 栈顶并应用。
 * 快照去重: 与栈顶深相等则跳过 (空操作事件/重复记录不会污染历史)。
 */

import { create } from 'zustand';
import type { SerializedAnnotation } from './measurementStore';
import type { Layer, ImageFilter } from './editorStore';
import { useMeasurementStore } from './measurementStore';
import { useEditorStore } from './editorStore';
import { applyHistorySnapshot } from '@/lib/cornerstone/history-apply';

/** 一次可撤销操作捕获的完整应用状态 (#129: 标注全量 + 编辑套件状态)。 */
export interface HistorySnapshot {
  /** Cornerstone 序列化标注 (含 layerId 往返) — 与 measurementStore.annotations 同形。 */
  annotations: SerializedAnnotation[];
  /** 图层列表 (含 visible/opacity/order/locked)。 */
  layers: Layer[];
  /** 当前激活图层 (图层增删会改变它, 快照一并恢复)。 */
  activeLayerId: string | null;
  /** 编辑套件滤镜状态 (#129: 滤镜纳入撤销范围)。 */
  filters: ImageFilter[];
}

/** 历史栈深度上限 (#129 决议: 50 步 FIFO 淘汰)。 */
const MAX_STEPS = 50;

/** 轻量深拷贝 — 快照数据均为纯 JSON (handles/cachedStats/stats)。 */
function deepClone<T>(value: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return Array.isArray(value)
      ? ([...value] as unknown as T)
      : { ...(value as Record<string, unknown>) } as unknown as T;
  }
}

function deepEqual(a: unknown, b: unknown): boolean {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}

interface HistoryState {
  /** 可撤销栈: 元素 = 各次操作的前状态 (栈顶 = 最近一次撤销目标)。 */
  past: HistorySnapshot[];
  /** 已撤销栈: 撤销时压入, 重做时弹出恢复。 */
  future: HistorySnapshot[];
  canUndo: boolean;
  canRedo: boolean;
  /** 应用快照进行中 — 事件驱动的 record 与自动保存需跳过 (防循环)。 */
  applying: boolean;
}

interface HistoryActions {
  /**
   * 交互起点: 记忆当前状态作为 pre-op (视口 mousedown / 滑杆 pointerdown)。
   * 随后的事件 (ANNOTATION_COMPLETED/MODIFIED) 用 recordInteraction 压入它。
   */
  beginInteraction: () => void;
  /**
   * 变更前调用: 把当前状态作为 pre-op 直接压栈 (图层/滤镜/列表删除等
   * store 驱动操作在变更前调用, 快照即操作前状态)。
   */
  recordBefore: () => void;
  /**
   * 事件驱动操作完成: 压入交互起点记忆的 pre-op。
   * 'removed' 无记忆时跳过 (列表删除已由调用方 recordBefore 记录)。
   */
  recordInteraction: (_opKind?: 'completed' | 'modified' | 'removed') => void;
  /** 尾部去抖的 recordInteraction — 拖拽/滑杆中间态不压栈, 交互结束后记录一次。 */
  recordDebounced: (delay?: number) => void;
  /** 冲刷待处理的去抖记录 (undo/redo 前调用, 确保交互被记录)。 */
  flush: () => void;
  /** 撤销: 弹 past 栈顶 → 应用。 */
  undo: () => void;
  /** 重做: 弹 future 栈顶 → 应用。 */
  redo: () => void;
  /** 清空历史 (切换图像 / 卸载时 — 快照含图像内标注, 跨图像撤销无意义)。 */
  clear: () => void;
}

let recordTimer: ReturnType<typeof setTimeout> | null = null;
/** 交互起点记忆的 pre-op 状态 (mousedown 捕获, 事件到来时压栈)。 */
let pendingPreOp: HistorySnapshot | null = null;

/** 从当前 store 捕获可撤销快照。 */
function captureSnapshot(): HistorySnapshot {
  const m = useMeasurementStore.getState();
  const e = useEditorStore.getState();
  return {
    annotations: deepClone(m.annotations),
    layers: deepClone(e.layers),
    activeLayerId: e.activeLayerId,
    filters: deepClone(e.filters),
  };
}

export const useHistoryStore = create<HistoryState & HistoryActions>((set, get) => ({
  past: [],
  future: [],
  canUndo: false,
  canRedo: false,
  applying: false,

  beginInteraction: () => {
    if (get().applying) return;
    pendingPreOp = captureSnapshot();
  },

  recordBefore: () => {
    const { past, applying } = get();
    if (applying) return;
    const snap = captureSnapshot();
    const top = past[past.length - 1];
    if (top && deepEqual(top, snap)) return;
    set({
      past: [...past, snap].slice(-MAX_STEPS),
      future: [],
      canUndo: true,
      canRedo: false,
    });
  },

  recordInteraction: (_opKind) => {
    const { past, applying } = get();
    if (applying) return;

    // 无交互记忆 → 跳过: 事件驱动的操作必须始于交互起点 (视口 mousedown)。
    // 无记忆的 MODIFIED (如创建完成后的统计重算) / REMOVED (程序化删除,
    // 调用方已 recordBefore) 压入当前状态会污染历史 (撤销变成空操作)。
    if (!pendingPreOp) {
      pendingPreOp = null;
      return;
    }
    const snap = pendingPreOp;
    pendingPreOp = null;

    const top = past[past.length - 1];
    if (top && deepEqual(top, snap)) return;
    set({
      past: [...past, snap].slice(-MAX_STEPS),
      future: [],
      canUndo: true,
      canRedo: false,
    });
  },

  recordDebounced: (delay = 400) => {
    const { applying } = get();
    if (applying) return;
    if (recordTimer) clearTimeout(recordTimer);
    recordTimer = setTimeout(() => {
      recordTimer = null;
      useHistoryStore.getState().recordInteraction('modified');
    }, delay);
  },

  flush: () => {
    if (recordTimer) {
      clearTimeout(recordTimer);
      recordTimer = null;
      useHistoryStore.getState().recordInteraction('modified');
    }
  },

  undo: () => {
    get().flush();
    const { past, future, applying } = get();
    if (applying || past.length === 0) return;

    const current = captureSnapshot();
    const target = past[past.length - 1];

    set({
      past: past.slice(0, -1),
      future: [...future, current].slice(-MAX_STEPS),
      canUndo: past.length - 1 > 0,
      canRedo: true,
      applying: true,
    });

    applyHistorySnapshot(target);
    set({ applying: false });
  },

  redo: () => {
    get().flush();
    const { past, future, applying } = get();
    if (applying || future.length === 0) return;

    const current = captureSnapshot();
    const target = future[future.length - 1];

    set({
      past: [...past, current].slice(-MAX_STEPS),
      future: future.slice(0, -1),
      canUndo: true,
      canRedo: future.length - 1 > 0,
      applying: true,
    });

    applyHistorySnapshot(target);
    set({ applying: false });
  },

  clear: () => {
    get().flush();
    pendingPreOp = null;
    set({ past: [], future: [], canUndo: false, canRedo: false });
  },
}));

/** Cornerstone 事件处理等外部代码查询"是否正在应用快照" (跳过自动保存/入栈)。 */
export function isHistoryApplying(): boolean {
  return useHistoryStore.getState().applying;
}
