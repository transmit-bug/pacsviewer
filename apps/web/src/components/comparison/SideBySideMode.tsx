import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { ViewportState, defaultViewport, renderImageToCanvas } from './shared';

interface SideBySideModeProps {
  imageIdA: string;
  imageIdB: string;
  orientation?: 'horizontal' | 'vertical';
  syncScroll?: boolean;
  syncZoom?: boolean;
  className?: string;
}

export function SideBySideMode({
  imageIdA,
  imageIdB,
  orientation = 'horizontal',
  syncScroll = true,
  syncZoom = true,
  className,
}: SideBySideModeProps) {
  const { t } = useTranslation();
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

  const isSyncingRef = useRef(false);

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
      img.src = `/api/images/${imageId}/file`;
    },
    []
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
    }
  }, [viewportA, isLoadingA]);

  useEffect(() => {
    if (canvasBRef.current && imgBRef.current) {
      renderImageToCanvas(canvasBRef.current, imgBRef.current, viewportB);
    }
  }, [viewportB, isLoadingB]);

  const handleMouseDown = useCallback(
    (side: 'A' | 'B') => (e: React.MouseEvent<HTMLCanvasElement>) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const currentViewport = side === 'A' ? viewportA : viewportB;
      const setViewport = side === 'A' ? setViewportA : setViewportB;
      const startPan = { ...currentViewport.pan };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;

        const newPan = {
          x: startPan.x + deltaX / currentViewport.zoom,
          y: startPan.y + deltaY / currentViewport.zoom,
        };

        setViewport((prev) => ({ ...prev, pan: newPan }));

        if (syncScroll && !isSyncingRef.current) {
          isSyncingRef.current = true;
          const otherSet = side === 'A' ? setViewportB : setViewportA;
          otherSet((prev) => ({ ...prev, pan: newPan }));
          isSyncingRef.current = false;
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [viewportA, viewportB, syncScroll]
  );

  const handleWheel = useCallback(
    (side: 'A' | 'B') => (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const currentViewport = side === 'A' ? viewportA : viewportB;
      const setViewport = side === 'A' ? setViewportA : setViewportB;
      const newZoom = Math.max(0.1, Math.min(10, currentViewport.zoom * zoomFactor));

      setViewport((prev) => ({ ...prev, zoom: newZoom }));

      if (syncZoom && !isSyncingRef.current) {
        isSyncingRef.current = true;
        const otherSet = side === 'A' ? setViewportB : setViewportA;
        otherSet((prev) => ({ ...prev, zoom: newZoom }));
        isSyncingRef.current = false;
      }
    },
    [viewportA, viewportB, syncZoom]
  );

  const isHorizontal = orientation === 'horizontal';

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
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown('A')}
          onWheel={handleWheel('A')}
        />
        <div className="absolute top-2 left-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
          A
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
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown('B')}
          onWheel={handleWheel('B')}
        />
        <div className="absolute top-2 left-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
          B
        </div>
        <div className="absolute bottom-2 left-2 text-xs text-white/70">
          <div>{t('viewer.compare.zoom')}: {(viewportB.zoom * 100).toFixed(0)}%</div>
          <div>{t('viewer.compare.windowLevel')}: {viewportB.windowWidth}/{viewportB.windowLevel}</div>
        </div>
      </div>
    </div>
  );
}
