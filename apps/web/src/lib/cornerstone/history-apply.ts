/**
 * History Apply — 应用撤销/重做快照到应用与 Cornerstone (wayfinder #132)。
 *
 * 撤销/重做不只是恢复 store —— Cornerstone 自身持有标注对象 (annotationState),
 * 快照若只回写 store 会导致画布与数据脱节。本模块把快照落地为三件事:
 *   1. 恢复 store: measurementStore (annotations + 派生 measurements) 与
 *      editorStore (layers / activeLayerId / filters)。
 *   2. 镜像到 Cornerstone: 重建 annotationState —— 移除快照中不存在的 CS 标注
 *      对象, 重新添加缺失的标注 (原 annotationUID), 按快照图层显隐恢复
 *      isVisible, 最后 triggerAnnotationRender 触发重绘。
 *   3. 后端持久化 (best-effort): 先恢复图层行 (缺失的按原 id 重建, 多余的
 *      删除, 存在的更新), 再 annotationApi.sync 全量替换标注 —— 顺序重要,
 *      annotations.layer_id 外键要求图层行先存在。
 *
 * 应用期间 historyStore.applying = true: CornerstoneViewport 的标注事件
 * 处理器会跳过自动保存/入栈, 由本模块末尾的显式持久化兜底, 避免半成品
 * 状态被事件驱动地写回后端。
 */

import { annotation, utilities as ToolUtilities } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import { serializeAnnotations, deserializeAnnotations, extractMeasurements } from './annotation-sync';
import { getCsAnnotations, setLayerVisibility } from './layerVisibility';
import { getViewportElement, MAIN_VIEWPORT_ID } from './viewportRegistry';
import { annotationApi, layerApi } from '@/services/api';
import { useMeasurementStore } from '@/stores/measurementStore';
import { useEditorStore } from '@/stores/editorStore';
import { useViewerStore } from '@/stores/viewerStore';
import type { HistorySnapshot } from '@/stores/historyStore';

/** 当前显示帧的 Cornerstone imageId (用于 deserializeAnnotations 的引用绑定)。 */
function getCurrentCsImageId(element: HTMLDivElement): string | null {
  try {
    const enabled = getEnabledElement(element);
    const viewport = enabled?.viewport as any;
    return viewport?.getCurrentImageId?.() ?? null;
  } catch {
    return null;
  }
}

/**
 * 按快照重建 Cornerstone 标注状态 (元素级, 与 serializeAnnotations 同源)。
 * 幂等: 已在 CS 状态中的标注对象原地保留 (仅按需改显隐), 缺失的按原 id
 * 重新 addAnnotation, 多余的 removeAnnotation。
 */
function rebuildCsAnnotations(element: HTMLDivElement, snap: HistorySnapshot): void {
  const desiredIds = new Set(snap.annotations.map((a) => a.id));

  // 1. 移除快照中不存在的 CS 标注对象 (state.removeAnnotation 会触发
  //    ANNOTATION_REMOVED → 应用期间被 applying 标志拦下, 不写回后端)。
  for (const ann of getCsAnnotations(element)) {
    if (!desiredIds.has(ann.annotationUID)) {
      try {
        annotation.state.removeAnnotation(ann.annotationUID);
      } catch {
        // 标注可能正被操作 — 跳过, 下次应用/重载会修正。
      }
    }
  }

  // 2. 重新添加快照中有而 CS 状态中缺失的标注 (原 annotationUID 恢复,
  //    metadata.layerId 随序列化对象带回, 保证图层分组/显隐一致)。
  const existingIds = new Set(getCsAnnotations(element).map((a) => a.annotationUID));
  const toAdd = snap.annotations.filter((a) => !existingIds.has(a.id));
  if (toAdd.length > 0) {
    deserializeAnnotations(getCurrentCsImageId(element) ?? '', toAdd, element);
  }

  // 3. 按快照恢复图层显隐 (AnnotationGroup 显隐 → CS 原生 isVisible)。
  for (const layer of snap.layers) {
    setLayerVisibility(MAIN_VIEWPORT_ID, layer.id, layer.visible);
  }

  // 4. 统一重绘标注层。
  ToolUtilities.triggerAnnotationRenderForViewportIds([MAIN_VIEWPORT_ID]);
}

/**
 * 后端持久化 (best-effort, 失败仅告警 — 与现有 LayerManager 风格一致)。
 * 顺序: 图层 (删除多余的 → 创建缺失的原 id 重建 → 更新存在的) → 标注全量 sync。
 */
async function persistSnapshot(imageId: string, snap: HistorySnapshot): Promise<void> {
  try {
    const resp = (await layerApi.getByImage(imageId)) as any;
    const rows = resp?.data?.data ?? resp?.data ?? [];
    const existingRows = Array.isArray(rows) ? rows : [];
    const existingIds = new Set(existingRows.map((r: any) => r.id));

    // 多余图层 (撤销图层创建后不再存在) — 级联删除其下后端标注。
    for (const row of existingRows) {
      if (!snap.layers.some((l) => l.id === row.id)) {
        try {
          await layerApi.delete(row.id);
        } catch {
          // 后端行可能已被删除 — 忽略。
        }
      }
    }

    // 缺失图层按原 id 重建 (后端 POST /layers 接受可选 id), 存在的更新。
    for (const layer of snap.layers) {
      const payload = {
        id: layer.id,
        name: layer.name,
        type: layer.type,
        visible: layer.visible,
        opacity: layer.opacity,
        locked: layer.locked,
        sortOrder: layer.order,
      };
      if (existingIds.has(layer.id)) {
        await layerApi.update(layer.id, payload);
      } else {
        await layerApi.create(imageId, payload);
      }
    }

    // 标注全量替换 (与 CS 序列化契约一致, 原 id 恢复)。
    await annotationApi.sync(imageId, snap.annotations);
  } catch (err) {
    console.warn('[history] 后端持久化失败:', err);
  }
}

/** 应用一个快照: 恢复 store → 镜像 Cornerstone → 后端持久化。 */
export function applyHistorySnapshot(snap: HistorySnapshot): void {
  // 1. 恢复 store (同步 — 驱动全部 React 视图)。
  useEditorStore.setState({
    layers: snap.layers,
    activeLayerId: snap.activeLayerId,
    filters: snap.filters,
  });
  useMeasurementStore.setState({
    annotations: snap.annotations,
    measurements: extractMeasurements(snap.annotations),
  });

  // 2. 镜像到 Cornerstone (主视口元素可能尚未挂载 — store 恢复仍然生效)。
  const element = getViewportElement(MAIN_VIEWPORT_ID);
  if (element) {
    try {
      rebuildCsAnnotations(element, snap);
      // 以重建后的 CS 状态为准刷新测量 store (源真相 = Cornerstone)。
      const serialized = serializeAnnotations(element);
      useMeasurementStore.getState().setAnnotations(serialized);
      useMeasurementStore.getState().setMeasurements(extractMeasurements(serialized));
    } catch (err) {
      console.warn('[history] Cornerstone 镜像失败:', err);
    }
  }

  // 3. 后端持久化 (异步 best-effort)。
  const imageId = useViewerStore.getState().currentImageId;
  if (imageId) {
    void persistSnapshot(imageId, snap);
  }
}
