/**
 * Layer Visibility Sync — maps application layer visibility (wayfinder #108,
 * AnnotationGroup 显隐) onto Cornerstone's native annotation visibility.
 *
 * Annotations carry `metadata.layerId` (set at draw time on the active layer,
 * restored from the backend on load — see annotation-sync.ts). When a layer is
 * toggled hidden/visible we flip `annotation.visibility.setAnnotationVisibility`
 * for every annotation on that layer and trigger a re-render, so hiding a layer
 * hides its annotations on the canvas without destroying them.
 */

import { annotation, utilities as ToolUtilities } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import type { SerializedAnnotation } from '@/stores/measurementStore';
import { getViewportElement } from './viewportRegistry';

/** Read the raw Cornerstone annotation group for an element. */
function getCsAnnotationGroup(element: HTMLDivElement): Record<string, any[]> | null {
  try {
    const group = (annotation.state.getAnnotations as any)(undefined, element);
    if (!group || Array.isArray(group)) return null;
    return group as Record<string, any[]>;
  } catch {
    return null;
  }
}

/** All Cornerstone annotations for the element (flattened across tools). */
export function getCsAnnotations(element: HTMLDivElement): any[] {
  const group = getCsAnnotationGroup(element);
  if (!group) return [];
  const out: any[] = [];
  for (const toolAnnotations of Object.values(group)) {
    if (Array.isArray(toolAnnotations)) out.push(...toolAnnotations);
  }
  return out;
}

/** Serialize annotations of one layer from Cornerstone state (mirror of serializeAnnotations, filtered). */
export function serializeLayerAnnotations(element: HTMLDivElement, layerId: string): SerializedAnnotation[] {
  const out: SerializedAnnotation[] = [];
  for (const ann of getCsAnnotations(element)) {
    if (ann.metadata?.layerId !== layerId) continue;
    const data = ann.data;
    if (!data?.handles) continue;
    out.push({
      id: ann.annotationUID,
      toolName: ann.metadata?.toolName,
      layerId,
      data: {
        handles: data.handles,
        cachedStats: data.cachedStats,
        label: data.label,
        text: data.text,
      },
    });
  }
  return out;
}

/**
 * Apply a layer's visibility to its Cornerstone annotations.
 *
 * @param viewportId  viewport whose element holds the annotations
 * @param layerId     layer to toggle
 * @param visible     desired visibility
 * @returns number of annotations affected
 */
export function setLayerVisibility(viewportId: string, layerId: string, visible: boolean): number {
  const element = getViewportElement(viewportId);
  if (!element) return 0;

  let affected = 0;
  for (const ann of getCsAnnotations(element)) {
    if (ann.metadata?.layerId !== layerId) continue;
    try {
      annotation.visibility.setAnnotationVisibility(ann.annotationUID, visible);
      affected++;
    } catch {
      // Annotation may be mid-manipulation — skip, next toggle will fix it.
    }
  }

  if (affected > 0) {
    ToolUtilities.triggerAnnotationRenderForViewportIds([viewportId]);
  }
  return affected;
}

/** True when the element has a live (enabled) Cornerstone viewport. */
export function isViewportEnabled(viewportId: string): boolean {
  const element = getViewportElement(viewportId);
  if (!element) return false;
  try {
    return !!getEnabledElement(element);
  } catch {
    return false;
  }
}
