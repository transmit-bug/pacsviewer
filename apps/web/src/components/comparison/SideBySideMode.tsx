import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import {
  type ViewportState,
  defaultViewport,
  renderImageToCanvas,
  drawMeasurementLines,
  isWwWlGesture,
  applyWlDrag,
  type ComparisonLine,
} from './shared';

interface SideBySideModeProps {
  imageIdA: string;
  imageIdB: string;
  orientation?: 'horizontal' | 'vertical';
  /** When true, pan / zoom / window-level are mirrored to the other panel. */
  syncViewport?: boolean;
  /** When true, drag draws a measurement line attributed to the panel's owner. */
  measuring?: boolean;
  linesA?: ComparisonLine[];
  linesB?: ComparisonLine[];
  /** Called when a measurement line completes (owner set by the panel). */
  onDrawLine?: (line: ComparisonLine) => void;
  className?: string;
}

export function SideBySideMode({
  imageIdA,
  imageIdB,
  orientation = 'horizontal',
  syncViewport = true,
  measuring = false,
  linesA = [],
  linesB = [],
  onDrawLine,
  className,
}: SideBySideModeProps) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const canvasARef = useRef<HTMLCanvasElement>(null);
  const canvasBRef = useRef<HTMLCanvasElement>(null);
  const containerARef = useRef<HTMLDivElement>(null);
  const containerBRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const [viewportA, setViewportA] = useState<ViewportState>({ ...defaultViewport });
  const [viewportB, setViewportB] = useState<ViewportState>({ ...defaultViewport });
  const [isLoadingA, setIsLoadingA] = useState(true);
  const [isLoadingB, setIsLoadingB] = useState(true);
  // In-progress measurement line (live preview before commit).
  const [draftA, setDraftA] = useState<ComparisonLine | null>(null);
  const [draftB, setDraftB] = useState<ComparisonLine | null>(null);

  const isSyncingRef = useRef(false);
  const dragRef = useRef<{
    kind: 'pan' | 'wl' | 'measure';
    startX: number;
    startY: number;
    startPan: { x: number; y: number };
    startWw: number;
    startWl: number;
    line: ComparisonLine | null;
  } | null>(null);

  const loadImage = useCallback(
    (imageId: string, imgRef: React.MutableRefObject<HTMLImageElement | null>, setLoaded: (v: boolean) => void) => {
      if (!imageId) return;
      setLoaded(false);
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imgRef.current = img;
        setLoaded(true);
      };
      img.onerror = () => {
        imgRef.current = null;
        setLoaded(false);
      };
      img.src = `/api/images/${imageId}/file?token=${encodeURIComponent(token ?? '')}`;
    },
    [token]
  );

  useEffect(() => {
    loadImage(imageIdA, imgARef, setIsLoadingA);
  }, [imageIdA, loadImage]);

  useEffect(() => {
    loadImage(imageIdB, imgBRef, setIsLoadingB);
  }, [imageIdB, loadImage]);

  useEffect(() => {
    if (canvasARef.current && imgARef.current) {
      renderImageToCanvas(canvasARef.current, imgARef.current, viewportA);
      drawMeasurementLines(canvasARef.current, [...linesA, ...(draftA ? [draftA] : [])]);
    }
  }, [viewportA, isLoadingA, linesA, draftA]);

  useEffect(() => {
    if (canvasBRef.current && imgBRef.current) {
      renderImageToCanvas(canvasBRef.current, imgBRef.current, viewportB);
      drawMeasurementLines(canvasBRef.current, [...linesB, ...(draftB ? [draftB] : [])]);
    }
  }, [viewportB, isLoadingB, linesB, draftB]);

  /** Mirror a partial viewport update to the other panel when sync is on. */
  const mirrorTo = useCallback(
    (from: 'A' | 'B', patch: (prev: ViewportState) => ViewportState) => {
      if (!syncViewport || isSyncingRef.current) return;
      isSyncingRef.current = true;
      if (from === 'A') setViewportB((prev) => patch(prev));
      else setViewportA((prev) => patch(prev));
      isSyncingRef.current = false;
    },
    [syncViewport]
  );

  const normalizePoint = useCallback((canvas: HTMLCanvasElement, e: { clientX: number; clientY: number }) => {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback(
    (side: 'A' | 'B') => (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = side === 'A' ? canvasARef.current : canvasBRef.current;
      if (!canvas) return;
      e.preventDefault();

      const currentViewport = side === 'A' ? viewportA : viewportB;

      if (measuring) {
        const { x, y } = normalizePoint(canvas, e);
        const line: ComparisonLine = {
          id: `${side}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x1: x, y1: y, x2: x, y2: y,
          owner: side === 'A' ? 'baseline' : 'comparison',
        };
        dragRef.current = { kind: 'measure', startX: e.clientX, startY: e.clientY, startPan: currentViewport.pan, startWw: currentViewport.windowWidth, startWl: currentViewport.windowLevel, line };

        const handleMove = (moveEvent: MouseEvent) => {
          if (!dragRef.current?.line) return;
          const p = normalizePoint(canvas, moveEvent);
          const updated = { ...dragRef.current.line, x2: p.x, y2: p.y };
          dragRef.current.line = updated;
          if (side === 'A') setDraftA(updated);
          else setDraftB(updated);
        };
        const handleUp = () => {
          const line = dragRef.current?.line;
          dragRef.current = null;
          if (side === 'A') setDraftA(null);
          else setDraftB(null);
          if (line && onDrawLine && (Math.abs(line.x2 - line.x1) > 0.005 || Math.abs(line.y2 - line.y1) > 0.005)) {
            onDrawLine(line);
          }
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return;
      }

      if (isWwWlGesture(e)) {
        dragRef.current = { kind: 'wl', startX: e.clientX, startY: e.clientY, startPan: currentViewport.pan, startWw: currentViewport.windowWidth, startWl: currentViewport.windowLevel, line: null };
        const setViewport = side === 'A' ? setViewportA : setViewportB;
        const handleMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - dragRef.current!.startX;
          const dy = moveEvent.clientY - dragRef.current!.startY;
          const wl = applyWlDrag({ ...currentViewport, windowWidth: dragRef.current!.startWw, windowLevel: dragRef.current!.startWl }, dx, dy);
          setViewport((prev) => ({ ...prev, ...wl }));
          mirrorTo(side, (prev) => ({ ...prev, ...wl }));
        };
        const handleUp = () => {
          dragRef.current = null;
          window.removeEventListener('mousemove', handleMove);
          window.removeEventListener('mouseup', handleUp);
        };
        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return;
      }

      // Pan
      dragRef.current = { kind: 'pan', startX: e.clientX, startY: e.clientY, startPan: { ...currentViewport.pan }, startWw: currentViewport.windowWidth, startWl: currentViewport.windowLevel, line: null };
      const setViewport = side === 'A' ? setViewportA : setViewportB;
      const handleMove = (moveEvent: MouseEvent) => {
        const dx = moveEvent.clientX - dragRef.current!.startX;
        const dy = moveEvent.clientY - dragRef.current!.startY;
        const newPan = {
          x: dragRef.current!.startPan.x + dx / currentViewport.zoom,
          y: dragRef.current!.startPan.y + dy / currentViewport.zoom,
        };
        setViewport((prev) => ({ ...prev, pan: newPan }));
        mirrorTo(side, (prev) => ({ ...prev, pan: newPan }));
      };
      const handleUp = () => {
        dragRef.current = null;
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('mouseup', handleUp);
      };
      window.addEventListener('mousemove', handleMove);
      window.addEventListener('mouseup', handleUp);
    },
    [viewportA, viewportB, measuring, syncViewport, mirrorTo, normalizePoint, onDrawLine]
  );

  const handleWheel = useCallback(
    (side: 'A' | 'B') => (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const setViewport = side === 'A' ? setViewportA : setViewportB;
      setViewport((prev) => ({ ...prev, zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)) }));
      mirrorTo(side, (prev) => ({ ...prev, zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)) }));
    },
    [mirrorTo]
  );

  const handleContextMenu = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
  }, []);

  const isHorizontal = orientation === 'horizontal';
  const cursorClass = measuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing';

  return (
    <div
      className={cn(
        'flex w-full h-full',
        isHorizontal ? 'flex-row' : 'flex-col',
        className
      )}
    >
      <div ref={containerARef} className="relative flex-1 bg-black overflow-hidden">
        {isLoadingA && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-sm">{t('viewer.compare.loading')}</div>
          </div>
        )}
        <canvas
          ref={canvasARef}
          className={cn('w-full h-full', cursorClass)}
          onMouseDown={handleMouseDown('A')}
          onWheel={handleWheel('A')}
          onContextMenu={handleContextMenu}
        />
        <div className="absolute top-2 left-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
          A · {t('comparison.baselineTag')}
        </div>
        <div className="absolute bottom-2 left-2 text-xs text-white/70">
          <div>{t('viewer.compare.zoom')}: {(viewportA.zoom * 100).toFixed(0)}%</div>
          <div>{t('viewer.compare.windowLevel')}: {viewportA.windowWidth}/{viewportA.windowLevel}</div>
        </div>
      </div>

      <div className={cn('bg-border', isHorizontal ? 'w-1' : 'h-1')} />

      <div ref={containerBRef} className="relative flex-1 bg-black overflow-hidden">
        {isLoadingB && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-sm">{t('viewer.compare.loading')}</div>
          </div>
        )}
        <canvas
          ref={canvasBRef}
          className={cn('w-full h-full', cursorClass)}
          onMouseDown={handleMouseDown('B')}
          onWheel={handleWheel('B')}
          onContextMenu={handleContextMenu}
        />
        <div className="absolute top-2 left-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
          B · {t('comparison.comparisonTag')}
        </div>
        <div className="absolute bottom-2 left-2 text-xs text-white/70">
          <div>{t('viewer.compare.zoom')}: {(viewportB.zoom * 100).toFixed(0)}%</div>
          <div>{t('viewer.compare.windowLevel')}: {viewportB.windowWidth}/{viewportB.windowLevel}</div>
        </div>
      </div>
    </div>
  );
}
