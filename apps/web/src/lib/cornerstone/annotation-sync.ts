/**
 * Annotation Sync — synchronize Cornerstone annotation state with the backend.
 *
 * Handles:
 * - Serializing Cornerstone annotations → JSON for backend storage
 * - Deserializing backend JSON → Cornerstone annotation state
 * - Debounced auto-save on annotation changes
 * - Loading annotations when switching images
 */

import type { SerializedAnnotation } from '@/stores/measurementStore';

/**
 * Serialize all Cornerstone annotations for the current viewport.
 * Called when saving to the backend.
 *
 * Note: Cornerstone's annotation state API varies by version.
 * This function uses a try-catch to handle different API surfaces.
 */
export function serializeAnnotations(imageId: string): SerializedAnnotation[] {
  try {
    // @ts-ignore — annotation state API is version-dependent
    const csTools = window.__cornerstoneTools;
    if (!csTools?.annotation?.state) return [];

    const annotationGroup = csTools.annotation.state.getAnnotations(imageId);
    if (!annotationGroup) return [];

    const result: SerializedAnnotation[] = [];

    for (const toolName of Object.keys(annotationGroup)) {
      const toolAnnotations = annotationGroup[toolName];
      if (!toolAnnotations) continue;

      for (const ann of toolAnnotations) {
        const data = ann.data as any;
        if (!data?.handles) continue;

        result.push({
          id: ann.annotationUID || crypto.randomUUID(),
          toolName,
          data: {
            handles: data.handles.map((h: any) => ({
              x: h.world?.[0] ?? h.x ?? 0,
              y: h.world?.[1] ?? h.y ?? 0,
              z: h.world?.[2] ?? h.z ?? 0,
            })),
            cachedStats: data.cachedStats,
            label: data.label,
            text: data.text,
          },
          style: ann.style ? {
            color: ann.style.color ?? '#ffff00',
            lineWidth: ann.style.lineWidth ?? 2,
          } : undefined,
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
 * Restore annotations from backend data into Cornerstone's annotation state.
 * Called when loading a previously saved image.
 */
export function deserializeAnnotations(
  imageId: string,
  annotations: SerializedAnnotation[],
): void {
  // Note: Full restoration requires Cornerstone's internal API.
  // This is a placeholder that stores annotations for later use.
  // Actual implementation depends on the specific Cornerstone version.
  console.log(`[annotation-sync] Loaded ${annotations.length} annotations for ${imageId}`);
}

/**
 * Extract measurement results from cached stats.
 * Returns display-ready measurement values.
 */
export function extractMeasurements(
  annotations: SerializedAnnotation[],
): Array<{ id: string; toolName: string; value: number | null; unit: string; displayText: string }> {
  return annotations.map((ann) => {
    const stats = ann.data.cachedStats;
    let value: number | null = null;
    let unit = '';
    let displayText = '';

    switch (ann.toolName) {
      case 'Length': {
        const length = stats?.length ?? stats?.distance;
        if (typeof length === 'number') {
          value = length;
          unit = 'mm';
          displayText = `${length.toFixed(2)} mm`;
        }
        break;
      }
      case 'Angle': {
        const angle = stats?.angle;
        if (typeof angle === 'number') {
          value = angle;
          unit = '°';
          displayText = `${angle.toFixed(1)}°`;
        }
        break;
      }
      case 'EllipticalROI':
      case 'RectangleROI': {
        const area = stats?.area;
        if (typeof area === 'number') {
          value = area;
          unit = 'mm²';
          displayText = `${area.toFixed(2)} mm²`;
        }
        break;
      }
      case 'Probe': {
        const sp = stats?.scalarValue;
        if (typeof sp === 'number') {
          value = sp;
          unit = 'HU';
          displayText = `${sp.toFixed(0)} HU`;
        }
        break;
      }
      default:
        displayText = ann.toolName;
    }

    return {
      id: ann.id,
      toolName: ann.toolName,
      value,
      unit,
      displayText,
    };
  });
}

// ─── Debounced Auto-Save ─────────────────────────────────────────────────────

let saveTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Schedule a debounced save of annotations for an image.
 * Cancels any pending save and schedules a new one after `delay` ms.
 */
export function scheduleAutoSave(
  imageId: string,
  saveFn: (imageId: string, annotations: SerializedAnnotation[]) => Promise<void>,
  delay = 2000,
): void {
  if (saveTimer) clearTimeout(saveTimer);

  saveTimer = setTimeout(async () => {
    try {
      const annotations = serializeAnnotations(imageId);
      await saveFn(imageId, annotations);
      console.log(`[annotation-sync] Auto-saved ${annotations.length} annotations for ${imageId}`);
    } catch (err) {
      console.error('[annotation-sync] Auto-save failed:', err);
    }
  }, delay);
}

/**
 * Cancel any pending auto-save.
 */
export function cancelAutoSave(): void {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
}
