/**
 * Annotation Sync — synchronize Cornerstone annotation state with the backend.
 *
 * Handles:
 * - Serializing Cornerstone annotations → backend contract shape (verbatim handles/cachedStats)
 * - Deserializing backend JSON → Cornerstone annotation state (annotation.state.addAnnotation)
 * - Debounced auto-save on annotation changes
 * - Measurement extraction from cachedStats (keyed by targetId)
 *
 * Contract (see docs/plans/followup-comparison-spec.md decision 1):
 *   SerializedAnnotation = { id, toolName, data: { handles, cachedStats?, label?, text? } }
 *   `handles` and `cachedStats` are stored verbatim so restoration is a round-trip.
 */

import { annotation } from '@cornerstonejs/tools';
import { getEnabledElement } from '@cornerstonejs/core';
import type { SerializedAnnotation, MeasurementResult } from '@/stores/measurementStore';

/** Raw annotation shape produced by Cornerstone's annotation state. */
interface CsAnnotation {
  annotationUID: string;
  metadata?: Record<string, any>;
  data?: Record<string, any>;
}

/** getAnnotations(undefined, element) returns the whole group keyed by toolName. */
type AnnotationGroup = Record<string, CsAnnotation[]> | any[];

/**
 * Tools whose annotations cannot be faithfully rebuilt from the
 * { toolName, handles, cachedStats } contract alone — they carry extra state
 * (freehand contours, spline control points) that the contract does not
 * persist. They are skipped on restore to avoid rendering a broken shape.
 * (Known limitation — see ticket #99 comment; contract extension is deferred
 * to the T2 measurement-snapshot work.)
 */
const UNRESTORABLE_TOOLS = new Set(['PlanarFreehandROI', 'SplineROI']);

/**
 * Serialize all Cornerstone annotations rendered on the given element
 * into the backend contract shape.
 */
export function serializeAnnotations(element: HTMLDivElement): SerializedAnnotation[] {
  try {
    const group = (annotation.state.getAnnotations as any)(undefined, element) as AnnotationGroup;
    if (!group || Array.isArray(group)) return [];

    const result: SerializedAnnotation[] = [];

    for (const toolName of Object.keys(group)) {
      const toolAnnotations = group[toolName];
      if (!toolAnnotations) continue;

      for (const ann of toolAnnotations) {
        const data = ann.data;
        if (!data?.handles) continue;

        result.push({
          id: ann.annotationUID,
          toolName: ann.metadata?.toolName ?? toolName,
          // layerId round-trip (#108): written into metadata when the annotation
          // is created on an active layer, persisted by the backend sync, and
          // restored back into metadata on load.
          layerId: ann.metadata?.layerId ?? null,
          data: {
            handles: data.handles,      // verbatim — { points: Point3[], textBox?, ... }
            cachedStats: data.cachedStats,
            label: data.label,
            text: data.text,
          },
        });
      }
    }

    return result;
  } catch (err) {
    console.warn('[annotation-sync] serialize failed:', err);
    return [];
  }
}

/**
 * Restore backend annotations into Cornerstone's annotation state for the
 * given element. Idempotent — annotations whose annotationUID already exist
 * in state are skipped.
 *
 * @returns the number of annotations added.
 */
export function deserializeAnnotations(
  csImageId: string,
  annotations: SerializedAnnotation[],
  element: HTMLDivElement,
): number {
  const enabledElement = getEnabledElement(element);
  if (!enabledElement) {
    console.warn('[annotation-sync] element not enabled, cannot restore');
    return 0;
  }
  const { viewport } = enabledElement;

  // Derive metadata from the viewport itself — the same source tools use at draw
  // time (viewport.getViewReference()), so restored annotations bind to the
  // currently displayed image/frame.
  const viewRef = (viewport.getViewReference as any)?.() ?? {};
  const FrameOfReferenceUID = viewport.getFrameOfReferenceUID();
  const referencedImageId = viewRef.referencedImageId ?? csImageId;

  // Collect existing annotationUIDs so restore is idempotent.
  const existing = new Set<string>();
  const group = (annotation.state.getAnnotations as any)(undefined, element) as AnnotationGroup;
  if (group && !Array.isArray(group)) {
    for (const toolAnnotations of Object.values(group)) {
      for (const a of toolAnnotations) existing.add(a.annotationUID);
    }
  }

  let added = 0;
  for (const serialized of annotations) {
    if (!serialized?.toolName || !serialized.data?.handles?.points) continue;
    if (UNRESTORABLE_TOOLS.has(serialized.toolName)) continue;
    if (existing.has(serialized.id)) continue;

    const csAnnotation: Record<string, any> = {
      annotationUID: serialized.id,
      metadata: {
        toolName: serialized.toolName,
        FrameOfReferenceUID,
        referencedImageId,
        // layerId round-trip (#108): restored so per-layer visibility / ai_result
        // overlays can group annotations again after a reload.
        ...(serialized.layerId ? { layerId: serialized.layerId } : {}),
      },
      data: {
        handles: serialized.data.handles,
        ...(serialized.data.cachedStats ? { cachedStats: serialized.data.cachedStats } : {}),
        ...(serialized.data.label !== undefined ? { label: serialized.data.label } : {}),
        ...(serialized.data.text !== undefined ? { text: serialized.data.text } : {}),
      },
      highlighted: false,
      invalidated: true,
      isVisible: true,
      isLocked: false,
    };

    annotation.state.addAnnotation(csAnnotation as any, element);
    added++;
  }

  return added;
}

/** Unwrap cachedStats (keyed by targetId) to the first target's stats object. */
function firstTargetStats(cachedStats?: Record<string, any>): Record<string, any> | null {
  if (!cachedStats || typeof cachedStats !== 'object') return null;
  for (const key of Object.keys(cachedStats)) {
    const v = cachedStats[key];
    if (v && typeof v === 'object') return v;
  }
  return null;
}

/**
 * Extract display-ready measurement values from serialized annotations.
 * Values live in cachedStats[targetId]: Length→length+unit, Angle→angle,
 * ROI→area+areaUnit, Probe→scalarValue.
 */
export function extractMeasurements(
  annotations: SerializedAnnotation[],
): MeasurementResult[] {
  return annotations
    .map((ann) => {
      const stats = firstTargetStats(ann.data.cachedStats) ?? {};
      const handles = (ann.data.handles?.points as any[]) ?? [];
      let value: number | null = null;
      let unit = '';
      let displayText = '';

      switch (ann.toolName) {
        case 'Length': {
          const length = stats.length ?? stats.distance;
          if (typeof length === 'number') {
            value = length;
            unit = stats.unit || (stats.distanceUnit as string) || 'px';
            displayText = `${length.toFixed(2)} ${unit}`;
          }
          break;
        }
        case 'Angle': {
          const angle = stats.angle;
          if (typeof angle === 'number') {
            value = angle;
            unit = '°';
            displayText = `${angle.toFixed(1)}°`;
          }
          break;
        }
        case 'EllipticalROI':
        case 'RectangleROI': {
          const area = stats.area;
          if (typeof area === 'number') {
            value = area;
            unit = (stats.areaUnit as string) || 'mm²';
            displayText = `${area.toFixed(2)} ${unit}`;
          }
          break;
        }
        case 'Probe': {
          const sp = stats.scalarValue ?? stats.value;
          if (typeof sp === 'number') {
            value = sp;
            unit = (stats.modalityUnit as string) || 'HU';
            displayText = `${sp.toFixed(0)} ${unit}`;
          }
          break;
        }
        default:
          displayText = ann.toolName;
      }

      return {
        id: ann.id,
        toolName: ann.toolName,
        label: ann.data.label ?? ann.data.text ?? ann.toolName,
        value,
        unit,
        displayText,
        handles: handles.map((h: any) => ({
          x: Array.isArray(h) ? h[0] : h?.x ?? 0,
          y: Array.isArray(h) ? h[1] : h?.y ?? 0,
          z: Array.isArray(h) ? h[2] : h?.z ?? 0,
        })),
      };
    })
    .filter((m) => m.value !== null);
}

// ─── Debounced Auto-Save ─────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a debounced save of annotations for an image.
 * Cancels any pending save and schedules a new one after `delay` ms.
 */
export function scheduleAutoSave(
  imageId: string,
  element: HTMLDivElement,
  saveFn: (imageId: string, annotations: SerializedAnnotation[]) => Promise<void>,
  delay = 1500,
): void {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    try {
      const annotations = serializeAnnotations(element);
      await saveFn(imageId, annotations);
    } catch (err) {
      console.error('[annotation-sync] Auto-save failed:', err);
    }
  }, delay);
}

/**
 * Cancel any pending auto-save (e.g. when switching images or unmounting).
 */
export function cancelAutoSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
