import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';

interface ViewportState {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  windowWidth: number;
  windowLevel: number;
  invert: boolean;
}

interface SideBySideModeProps {
  imageIdA: string;
  imageIdB: string;
  orientation?: 'horizontal' | 'vertical';
  syncScroll?: boolean;
  syncZoom?: boolean;
  className?: string;
}

const defaultViewport: ViewportState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flipH: false,
  flipV: false,
  windowWidth: 400,
  windowLevel: 40,
  invert: false,
};

function renderImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  viewport: ViewportState
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = canvas.parentElement?.clientWidth || canvas.width;
  canvas.height = canvas.parentElement?.clientHeight || canvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.rotate((viewport.rotation * Math.PI) / 180);
  if (viewport.flipH) ctx.scale(-1, 1);
  if (viewport.flipV) ctx.scale(1, -1);
  ctx.translate(viewport.pan.x, viewport.pan.y);

  const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
  const x = (-img.width * scale) / 2;
  const y = (-img.height * scale) / 2;

  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

  if (viewport.windowWidth !== 400 || viewport.windowLevel !== 40) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    const min = viewport.windowLevel - viewport.windowWidth / 2;
    const max = viewport.windowLevel + viewport.windowWidth / 2;

    for (let i = 0; i < data.length; i += 4) {
      const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
      const normalized = ((gray - min) / (max - min)) * 255;
      const clamped = Math.max(0, Math.min(255, normalized));
      data[i] = clamped;
      data[i + 1] = clamped;
      data[i + 2] = clamped;
    }
    ctx.putImageData(imageData, 0, 0);
  }

  if (viewport.invert) {
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255 - data[i];
      data[i + 1] = 255 - data[i + 1];
      data[i + 2] = 255 - data[i + 2];
    }
    ctx.putImageData(imageData, 0, 0);
  }

  ctx.restore();
}

export function SideBySideMode({
  imageIdA,
  imageIdB,
  orientation = 'horizontal',
  syncScroll = true,
  syncZoom = true,
  className,
}: SideBySideModeProps) {
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
            <div className="text-white text-sm">加载中...</div>
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
          <div>缩放: {(viewportA.zoom * 100).toFixed(0)}%</div>
          <div>窗宽/窗位: {viewportA.windowWidth}/{viewportA.windowLevel}</div>
        </div>
      </div>

      <div className={cn('bg-border', isHorizontal ? 'w-1' : 'h-1')} />

      <div ref={containerBRef} className="relative flex-1 bg-black overflow-hidden">
        {isLoadingB && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-sm">加载中...</div>
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
          <div>缩放: {(viewportB.zoom * 100).toFixed(0)}%</div>
          <div>窗宽/窗位: {viewportB.windowWidth}/{viewportB.windowLevel}</div>
        </div>
      </div>
    </div>
  );
}
