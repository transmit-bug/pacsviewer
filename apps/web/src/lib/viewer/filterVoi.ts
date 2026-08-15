/**
 * VOI filter application — brightness / contrast 走 Cornerstone 原生 WindowLevel
 * (wayfinder #109 决议, research #107 §4.1).
 *
 * brightness ≈ 移动窗口中心, contrast ≈ 改变窗宽. We keep a per-image baseline
 * voiRange captured from the viewport when the filter is first engaged (or the
 * image changes), then apply the delta computed from the editorStore filters.
 * Disabling/resetting restores the baseline — 生效 → 可见 → 可重置 闭环.
 */

import type { ImageFilter } from '@/stores/editorStore';

export interface VOIRange {
  lower: number;
  upper: number;
}

/** Enabled brightness/contrast filter params (already split out of the 9). */
export interface VoiFilterValues {
  brightness?: number;
  contrast?: number;
}

export const BRIGHTNESS_FILTERS = new Set(['brightness', 'contrast']);

/** Extract enabled brightness/contrast values from the editorStore filter list. */
export function getVoiFilterValues(filters: ImageFilter[]): VoiFilterValues {
  const out: VoiFilterValues = {};
  for (const f of filters) {
    if (!f.enabled) continue;
    if (f.type === 'brightness') out.brightness = f.params.value ?? 0;
    else if (f.type === 'contrast') out.contrast = f.params.value ?? 0;
  }
  return out;
}

/** True when any canvas (non-VOI) filter is enabled. */
export function hasCanvasFilters(filters: ImageFilter[]): boolean {
  return filters.some((f) => f.enabled && !BRIGHTNESS_FILTERS.has(f.type));
}

/**
 * Compute the target voiRange for the current filter values.
 * brightness: center += value (value ∈ [-100, 100], mapped to half of the window)
 * contrast:   width  *= 1 + value/100 (value ∈ [-100, 100], clamped to ≥ 1)
 * Returns null when neither filter is active (caller should restore baseline).
 */
export function computeTargetVOI(baseline: VOIRange, values: VoiFilterValues): VOIRange | null {
  const width = Math.max(1, baseline.upper - baseline.lower);
  const center = (baseline.upper + baseline.lower) / 2;

  let newWidth = width;
  let newCenter = center;

  if (values.brightness !== undefined) {
    newCenter = center + values.brightness * (width / 100) * 0.5;
  }
  if (values.contrast !== undefined) {
    const factor = Math.max(-0.98, Math.min(5, 1 + values.contrast / 100));
    newWidth = Math.max(1, width * factor);
  }

  // No-op when nothing moved.
  if (Math.abs(newCenter - center) < 0.01 && Math.abs(newWidth - width) < 0.01) {
    return null;
  }

  const half = newWidth / 2;
  return { lower: newCenter - half, upper: newCenter + half };
}

/**
 * Apply VOI filters to a Cornerstone viewport.
 *
 * @param viewport   the (stack) viewport
 * @param filters    full editorStore filter list
 * @param baseline   baseline voiRange captured for the current image
 * @returns the effective voiRange that was set, or null when unchanged
 */
export function applyVoiFilters(
  viewport: any,
  filters: ImageFilter[],
  baseline: VOIRange | null,
): VOIRange | null {
  if (!viewport || !baseline) return null;

  const values = getVoiFilterValues(filters);
  const hasVoi = values.brightness !== undefined || values.contrast !== undefined;

  let target: VOIRange | null;
  if (hasVoi) {
    target = computeTargetVOI(baseline, values);
  } else {
    target = baseline; // restore original
  }
  if (!target) return null;

  try {
    viewport.setProperties({ voiRange: target });
    // setProperties only marks the viewport PRE_RENDER; the engine may not have
    // an active render loop in all embedders, so force an explicit render.
    viewport.render?.();
  } catch (err) {
    console.warn('[filterVoi] setProperties failed:', err);
    return null;
  }
  return target;
}

/** Derive the current viewport voiRange (from getProperties), fallback to width/center math. */
export function readViewportVOI(viewport: any): VOIRange | null {
  try {
    const props = viewport?.getProperties?.();
    if (props?.voiRange && Number.isFinite(props.voiRange.lower) && Number.isFinite(props.voiRange.upper)) {
      return { lower: props.voiRange.lower, upper: props.voiRange.upper };
    }
  } catch {
    /* fall through */
  }
  return null;
}
