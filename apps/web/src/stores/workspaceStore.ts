/**
 * WorkspaceStore — 查看器电影级工作台的 UI 状态 (wayfinder #126).
 *
 * 仅承载工作台自身的呈现状态: 面板开合、工具条折叠、全屏沉浸、
 * ⌘K 面板、当前窗口预设标记。图像/工具/测量等业务状态仍在
 * viewerStore / measurementStore (与 #132 撤销快照保持同一数据源)。
 */
import { create } from 'zustand';

/** 窗口预设 (真实驱动 Cornerstone VOI, 经 viewerStore.viewport → CornerstoneViewport) */
export interface WsWlPreset {
  id: string;
  nameKey: string; // i18n key: viewer.workspace.preset.*
  ww: number;
  wl: number;
}

export const WS_WL_PRESETS: WsWlPreset[] = [
  { id: 'standard', nameKey: 'viewer.workspace.presetStandard', ww: 300, wl: 150 },
  { id: 'high-contrast', nameKey: 'viewer.workspace.presetHighContrast', ww: 200, wl: 100 },
  { id: 'low-noise', nameKey: 'viewer.workspace.presetLowNoise', ww: 400, wl: 200 },
  { id: 'rnfl', nameKey: 'viewer.workspace.presetRnfl', ww: 250, wl: 125 },
];

/** 找与当前 WW/WL 匹配的预设 (HUD 角标显示预设名) */
export function matchPreset(ww: number, wl: number): WsWlPreset | null {
  return WS_WL_PRESETS.find((p) => p.ww === ww && p.wl === wl) ?? null;
}

interface WorkspaceState {
  leftOpen: boolean;
  rightOpen: boolean;
  toolbarCollapsed: boolean;
  isFullscreen: boolean;
  paletteOpen: boolean;
}

interface WorkspaceActions {
  setLeftOpen: (open: boolean) => void;
  toggleLeft: () => void;
  setRightOpen: (open: boolean) => void;
  toggleRight: () => void;
  setToolbarCollapsed: (collapsed: boolean) => void;
  toggleToolbarCollapsed: () => void;
  setIsFullscreen: (fs: boolean) => void;
  setPaletteOpen: (open: boolean) => void;
  /** 重置工作台 UI 状态 (离开查看器 / 切换检查时调用) */
  resetWorkspace: () => void;
}

const initial = {
  leftOpen: true,
  rightOpen: true,
  toolbarCollapsed: false,
  isFullscreen: false,
  paletteOpen: false,
};

export const useWorkspaceStore = create<WorkspaceState & WorkspaceActions>((set, get) => ({
  ...initial,

  setLeftOpen: (open) => set({ leftOpen: open }),
  toggleLeft: () => set({ leftOpen: !get().leftOpen }),
  setRightOpen: (open) => set({ rightOpen: open }),
  toggleRight: () => set({ rightOpen: !get().rightOpen }),
  setToolbarCollapsed: (collapsed) => set({ toolbarCollapsed: collapsed }),
  toggleToolbarCollapsed: () => set({ toolbarCollapsed: !get().toolbarCollapsed }),
  setIsFullscreen: (fs) => set({ isFullscreen: fs }),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  resetWorkspace: () => set({ ...initial }),
}));
