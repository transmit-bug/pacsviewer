/**
 * AiResultOverlay — ai_result 层独立 SVG overlay (wayfinder #108 决议 C).
 *
 * Annotations that belong to a layer of type `ai_result` (tagged via
 * metadata.layerId at draw time, restored from the backend on load) are drawn
 * here as dashed cyan bounding boxes + labels — a distinct "AI 分析结果"
 * presentation, separate from the regular annotation canvas. The overlay only
 * renders when the owning ai_result layer is visible, so LayerManager 显隐
 * controls it like any other layer.
 *
 * Keep minimal on purpose: the full AI pipeline (aiStore detection/segmentation
 * overlays) is not wired into the viewer yet — this component renders whatever
 * ai_result-tagged annotations exist today and hides gracefully otherwise.
 */

import { useMemo } from 'react';
import { getEnabledElement } from '@cornerstonejs/core';
import { useEditorStore } from '@/stores/editorStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { getViewportElement, MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import { cn } from '@/lib/utils';

interface AiResultOverlayProps {
  viewportId?: string;
  className?: string;
}

interface Box {
  id: string;
  label: string;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Map a Cornerstone handle point ([x,y,z] or {x,y,z}) to element-local canvas CSS px. */
function toElementPoint(
  p: any,
  worldToCanvas?: (point: number[]) => number[],
): { x: number; y: number } | null {
  if (!p) return null;
  const x = Array.isArray(p) ? p[0] : p.x;
  const y = Array.isArray(p) ? p[1] : p.y;
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;

  if (worldToCanvas) {
    try {
      const canvas = worldToCanvas([x, y, Array.isArray(p) ? p[2] ?? 0 : p.z ?? 0]);
      if (canvas && Number.isFinite(canvas[0]) && Number.isFinite(canvas[1])) {
        return { x: canvas[0], y: canvas[1] };
      }
    } catch {
      /* fall back to raw coords */
    }
  }
  return { x, y };
}

export function AiResultOverlay({ viewportId = MAIN_VIEWPORT_ID, className }: AiResultOverlayProps) {
  const layers = useEditorStore((s) => s.layers);
  const annotations = useMeasurementStore((s) => s.annotations);

  const boxes: Box[] = useMemo(() => {
    const visibleAiLayerIds = new Set(
      layers.filter((l) => l.type === 'ai_result' && l.visible).map((l) => l.id),
    );
    if (visibleAiLayerIds.size === 0) return [];

    const element = getViewportElement(viewportId);
    let worldToCanvas: ((point: number[]) => number[]) | undefined;
    if (element) {
      try {
        const viewport = (getEnabledElement(element) as any)?.viewport;
        if (viewport?.worldToCanvas) {
          worldToCanvas = (p: number[]) => (viewport.worldToCanvas as (pt: number[]) => number[])(p);
        }
      } catch {
        worldToCanvas = undefined;
      }
    }

    const out: Box[] = [];
    for (const ann of annotations) {
      if (!ann.layerId || !visibleAiLayerIds.has(ann.layerId)) continue;
      // Cornerstone handles come in two shapes: an array under `points`
      // (Length/Angle/ArrowAnnotate/...) or start/end pair (RectangleROI /
      // EllipticalROI/...). Normalize both into a point list.
      const handles = ann.data?.handles ?? {};
      const rawPoints =
        Array.isArray(handles.points) && handles.points.length > 0
          ? handles.points
          : [handles.start, handles.end].filter(Boolean);
      if (rawPoints.length === 0) continue;

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      let mapped = 0;
      for (const p of rawPoints) {
        const pt = toElementPoint(p, worldToCanvas);
        if (!pt) continue;
        minX = Math.min(minX, pt.x);
        minY = Math.min(minY, pt.y);
        maxX = Math.max(maxX, pt.x);
        maxY = Math.max(maxY, pt.y);
        mapped++;
      }
      if (mapped === 0) continue;

      // Pad the box a little so thin shapes (lines/arrows) stay visible.
      out.push({
        id: ann.id,
        label: ann.data?.label ?? ann.data?.text ?? 'AI',
        minX: minX - 4,
        minY: minY - 4,
        maxX: maxX + 4,
        maxY: maxY + 4,
      });
    }
    return out;
  }, [layers, annotations, viewportId]);

  if (boxes.length === 0) return null;

  return (
    <svg
      className={cn('absolute inset-0 pointer-events-none overflow-visible', className)}
      width="100%"
      height="100%"
      aria-hidden="true"
    >
      {boxes.map((box) => (
        <g key={box.id}>
          <rect
            x={box.minX}
            y={box.minY}
            width={Math.max(1, box.maxX - box.minX)}
            height={Math.max(1, box.maxY - box.minY)}
            fill="none"
            stroke="#22d3ee"
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
          <text
            x={box.minX}
            y={Math.max(12, box.minY - 4)}
            fontSize={11}
            fill="#22d3ee"
            style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.8)', strokeWidth: 3 }}
          >
            {box.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
