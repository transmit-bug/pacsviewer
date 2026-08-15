/**
 * FilterLayer — Canvas2D filter pipeline for the viewer (wayfinder #109 决议,
 * research #107 §1.3/§2.4).
 *
 * brightness / contrast 走 Cornerstone 原生 WindowLevel (VOI) — applied here via
 * `viewport.setProperties({ voiRange })` from the captured per-image baseline.
 * The other 7 filters (saturation/sharpen/gaussian_blur/median/sobel/canny/
 * histogram_eq) run client-side over the RENDERED pixels: on IMAGE_RENDERED (or
 * filter/image change) we copy the viewport's display canvas into an overlay
 * canvas, run `applyFilters` from lib/imageProcessing, and putImageData back.
 *
 * 生效 → 可见 → 可重置 闭环: enabling a filter visibly changes the image;
 * resetFilters() (一键重置) clears the overlay and restores the baseline VOI.
 *
 * NOTE (known tradeoff): the overlay canvas sits above the Cornerstone element
 * (including its native annotation SVG layer) because it is mounted as a
 * sibling of the viewport in the page. Interactions still reach the viewport
 * (overlay is pointer-events-none); annotations render underneath the filtered
 * pixels. Kept additive — no restructuring of CornerstoneViewport.
 */

import { useCallback, useEffect, useRef } from 'react';
import { Enums, getEnabledElement, getRenderingEngine as csGetRenderingEngine } from '@cornerstonejs/core';
import { applyFilters } from '@/lib/imageProcessing';
import { useEditorStore } from '@/stores/editorStore';
import { useViewerStore } from '@/stores/viewerStore';
import { getViewportElement, subscribeViewportElement, MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import { RENDERING_ENGINE_ID } from '@/lib/cornerstone/init';
import { applyVoiFilters, readViewportVOI, BRIGHTNESS_FILTERS, type VOIRange } from '@/lib/viewer/filterVoi';
import { cn } from '@/lib/utils';

interface FilterLayerProps {
  viewportId?: string;
  className?: string;
}

/** Clamp heavy convolution radii per research #107 §2.3 (demo 性能护栏). */
function clampParams(filters: Array<{ type: string; enabled: boolean; params: Record<string, number> }>) {
  return filters.map((f) => {
    if (!f.enabled) return f;
    if (f.type === 'gaussian_blur') {
      return { ...f, params: { ...f.params, radius: Math.min(f.params.radius ?? 1, 5) } };
    }
    if (f.type === 'median') {
      return { ...f, params: { ...f.params, radius: Math.min(f.params.radius ?? 1, 3) } };
    }
    return f;
  });
}

export function FilterLayer({ viewportId = MAIN_VIEWPORT_ID, className }: FilterLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const filters = useEditorStore((s) => s.filters);
  const imageId = useViewerStore((s) => s.currentImageId);

  // Per-image baseline VOI captured before any filter is applied.
  const baselineRef = useRef<{ imageId: string; voi: VOIRange } | null>(null);
  const rafPendingRef = useRef(false);

  const clearOverlay = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }, []);

  /**
   * Re-run the Canvas2D filter pass over the viewport's rendered pixels.
   * No-op (and clears the overlay) when no canvas filter is enabled.
   */
  const processCanvasFilters = useCallback(() => {
    const canvas = canvasRef.current;
    const element = getViewportElement(viewportId);
    if (!canvas || !element) return;

    let enabled: ReturnType<typeof getEnabledElement>;
    try {
      enabled = getEnabledElement(element);
    } catch {
      clearOverlay();
      return;
    }
    if (!enabled) {
      clearOverlay();
      return;
    }

    const active = filters.filter((f) => f.enabled && !BRIGHTNESS_FILTERS.has(f.type));
    if (active.length === 0) {
      clearOverlay();
      return;
    }

    // The CPU render path paints into a canvas child of the element.
    const srcCanvas = ((enabled as any).canvas as HTMLCanvasElement | undefined) ??
      (element.querySelector('canvas') as HTMLCanvasElement | null);
    if (!srcCanvas || srcCanvas.width === 0 || srcCanvas.height === 0) {
      clearOverlay();
      return;
    }

    // Match overlay pixel size to the source so putImageData aligns 1:1.
    if (canvas.width !== srcCanvas.width || canvas.height !== srcCanvas.height) {
      canvas.width = srcCanvas.width;
      canvas.height = srcCanvas.height;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    try {
      const imageData = srcCanvas.getContext('2d')?.getImageData(0, 0, srcCanvas.width, srcCanvas.height);
      if (!imageData) return;
      ctx.putImageData(imageData, 0, 0);
      applyFilters(ctx, clampParams(active));
    } catch (err) {
      console.warn('[FilterLayer] filter pass failed:', err);
      clearOverlay();
    }
  }, [filters, viewportId, clearOverlay]);

  // Re-process when filters or the image change (immediate, no throttle).
  useEffect(() => {
    processCanvasFilters();
  }, [processCanvasFilters, imageId]);

  // Re-process on Cornerstone renders (pan/zoom/W-L change the displayed pixels),
  // throttled to one pass per animation frame. Subscribes to viewport-element
  // registrations because the element may not exist when this effect first runs.
  useEffect(() => {
    let disposed = false;
    const cleanups: Array<() => void> = [];

    const teardown = () => {
      while (cleanups.length) cleanups.pop()!();
    };

    const setup = () => {
      if (disposed) return;
      const element = getViewportElement(viewportId);
      if (!element) return;

      const onRendered = () => {
        if (rafPendingRef.current) return;
        rafPendingRef.current = true;
        requestAnimationFrame(() => {
          rafPendingRef.current = false;
          processCanvasFilters();
        });
      };

      element.addEventListener(Enums.Events.IMAGE_RENDERED, onRendered);
      cleanups.push(() => element.removeEventListener(Enums.Events.IMAGE_RENDERED, onRendered));
    };

    setup();
    const unsubscribe = subscribeViewportElement(viewportId, () => {
      teardown();
      setup();
    });

    return () => {
      disposed = true;
      unsubscribe();
      teardown();
    };
  }, [processCanvasFilters, viewportId]);

  // ── brightness / contrast → Cornerstone native WindowLevel (VOI) ─────────
  useEffect(() => {
    const element = getViewportElement(viewportId);
    if (!element) return;
    const viewport = csGetRenderingEngine(RENDERING_ENGINE_ID)?.getViewport(viewportId);
    if (!viewport) return;

    // Capture the natural VOI once per image (before any of our changes).
    const baseline = baselineRef.current;
    if (!baseline || baseline.imageId !== imageId) {
      const voi = readViewportVOI(viewport);
      if (voi) {
        baselineRef.current = { imageId: imageId ?? '', voi };
      }
    }

    const b = baselineRef.current;
    if (!b) return;
    applyVoiFilters(viewport, filters, b.voi);
  }, [filters, imageId, viewportId]);

  return (
    <canvas
      ref={canvasRef}
      className={cn('absolute inset-0 pointer-events-none', className)}
      aria-hidden="true"
    />
  );
}
