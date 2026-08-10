import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  ViewportState,
  defaultViewport,
  drawMeasurementLines,
  isWwWlGesture,
  applyWlDrag,
  ComparisonLine,
} from './shared';

interface SliderModeProps {
  imageIdA: string;
  imageIdB: string;
  orientation?: 'horizontal' | 'vertical';
  /** Measurement overlay lines (attributed to the comparison study). */
  lines?: ComparisonLine[];
  onDrawLine?: (line: ComparisonLine) => void;
  measuring?: boolean;
  className?: string;
}

export function SliderMode({
  imageIdA,
  imageIdB,
  orientation = 'horizontal',
  lines = [],
  onDrawLine,
  measuring = false,
  className,
}: SliderModeProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const [viewport, setViewport] = useState<ViewportState>({ ...defaultViewport });
  const [sliderPosition, setSliderPosition] = useState(0.5);
  const [isLoading, setIsLoading] = useState(true);
  const [draft, setDraft] = useState<ComparisonLine | null>(null);
  const dragRef = useRef<{ kind: 'slider' | 'wl' | 'measure'; startX: number; startY: number; startWw: number; startWl: number; line: ComparisonLine | null } | null>(null);

  const loadImage = useCallback(
    (imageId: string, imgRef: React.MutableRefObject<HTMLImageElement | null>) => {
      return new Promise<void>((resolve) => {
        if (!imageId) { resolve(); return; }
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          imgRef.current = img;
          resolve();
        };
        img.onerror = () => {
          imgRef.current = null;
          resolve();
        };
        img.src = `/api/images/${imageId}/file`;
      });
    },
    []
  );

  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadImage(imageIdA, imgARef), loadImage(imageIdB, imgBRef)]).then(() => {
      setIsLoading(false);
    });
  }, [imageIdA, imageIdB, loadImage]);

  useEffect(() => {
    if (!canvasRef.current || !imgARef.current || !imgBRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const container = containerRef.current;
    if (container) {
      canvas.width = container.clientWidth;
      canvas.height = container.clientHeight;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isHorizontal = orientation === 'horizontal';
    const splitPoint = isHorizontal
      ? Math.floor(canvas.width * sliderPosition)
      : Math.floor(canvas.height * sliderPosition);

    // Draw image A on one side
    ctx.save();
    if (isHorizontal) {
      ctx.beginPath();
      ctx.rect(0, 0, splitPoint, canvas.height);
    } else {
      ctx.beginPath();
      ctx.rect(0, 0, canvas.width, splitPoint);
    }
    ctx.clip();

    // Inline render for A
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.rotate((viewport.rotation * Math.PI) / 180);
    if (viewport.flipH) ctx.scale(-1, 1);
    if (viewport.flipV) ctx.scale(1, -1);
    ctx.translate(viewport.pan.x, viewport.pan.y);

    const imgA = imgARef.current;
    const scaleA = Math.min(canvas.width / imgA.width, canvas.height / imgA.height) * 0.9;
    ctx.drawImage(
      imgA,
      (-imgA.width * scaleA) / 2,
      (-imgA.height * scaleA) / 2,
      imgA.width * scaleA,
      imgA.height * scaleA
    );
    ctx.restore();

    // Draw image B on other side
    ctx.save();
    if (isHorizontal) {
      ctx.beginPath();
      ctx.rect(splitPoint, 0, canvas.width - splitPoint, canvas.height);
    } else {
      ctx.beginPath();
      ctx.rect(0, splitPoint, canvas.width, canvas.height - splitPoint);
    }
    ctx.clip();

    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.rotate((viewport.rotation * Math.PI) / 180);
    if (viewport.flipH) ctx.scale(-1, 1);
    if (viewport.flipV) ctx.scale(1, -1);
    ctx.translate(viewport.pan.x, viewport.pan.y);

    const imgB = imgBRef.current;
    const scaleB = Math.min(canvas.width / imgB.width, canvas.height / imgB.height) * 0.9;
    ctx.drawImage(
      imgB,
      (-imgB.width * scaleB) / 2,
      (-imgB.height * scaleB) / 2,
      imgB.width * scaleB,
      imgB.height * scaleB
    );
    ctx.restore();

    // Draw slider line
    ctx.save();
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    if (isHorizontal) {
      ctx.beginPath();
      ctx.moveTo(splitPoint, 0);
      ctx.lineTo(splitPoint, canvas.height);
      ctx.stroke();

      // Slider handle
      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(splitPoint, canvas.height / 2, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⇔', splitPoint, canvas.height / 2);
    } else {
      ctx.beginPath();
      ctx.moveTo(0, splitPoint);
      ctx.lineTo(canvas.width, splitPoint);
      ctx.stroke();

      ctx.fillStyle = '#3b82f6';
      ctx.beginPath();
      ctx.arc(canvas.width / 2, splitPoint, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('⇕', canvas.width / 2, splitPoint);
    }

    ctx.setLineDash([]);
    ctx.restore();

    // Apply window/level
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

    // Measurement overlay (crisp, in canvas coords)
    drawMeasurementLines(canvas, [...lines, ...(draft ? [draft] : [])]);
  }, [viewport, sliderPosition, orientation, isLoading, lines, draft]);

  const updateSliderFromEvent = useCallback(
    (clientX: number, clientY: number) => {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();

      if (orientation === 'horizontal') {
        const x = clientX - rect.left;
        setSliderPosition(Math.max(0, Math.min(1, x / rect.width)));
      } else {
        const y = clientY - rect.top;
        setSliderPosition(Math.max(0, Math.min(1, y / rect.height)));
      }
    },
    [orientation]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();

      if (measuring) {
        const rect = canvasRef.current.getBoundingClientRect();
        const nx = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
        // Attribution follows the panel half the line starts in: left/top
        // shows the baseline image, right/bottom the comparison image.
        const owner: 'baseline' | 'comparison' =
          orientation === 'horizontal' ? (nx < sliderPosition ? 'baseline' : 'comparison') : (ny < sliderPosition ? 'baseline' : 'comparison');
        const line: ComparisonLine = {
          id: `sl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x1: nx, y1: ny, x2: 0, y2: 0,
          owner,
        };
        dragRef.current = { kind: 'measure', startX: e.clientX, startY: e.clientY, startWw: viewport.windowWidth, startWl: viewport.windowLevel, line };
        const handleMove = (moveEvent: MouseEvent) => {
          if (!dragRef.current?.line || !canvasRef.current) return;
          const r = canvasRef.current.getBoundingClientRect();
          const updated = {
            ...dragRef.current.line,
            x2: Math.max(0, Math.min(1, (moveEvent.clientX - r.left) / r.width)),
            y2: Math.max(0, Math.min(1, (moveEvent.clientY - r.top) / r.height)),
          };
          dragRef.current.line = updated;
          setDraft(updated);
        };
        const handleUp = () => {
          const line = dragRef.current?.line;
          dragRef.current = null;
          setDraft(null);
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
        const startWw = viewport.windowWidth;
        const startWl = viewport.windowLevel;
        dragRef.current = { kind: 'wl', startX: e.clientX, startY: e.clientY, startWw, startWl, line: null };
        const handleMove = (moveEvent: MouseEvent) => {
          const dx = moveEvent.clientX - dragRef.current!.startX;
          const dy = moveEvent.clientY - dragRef.current!.startY;
          setViewport((prev) => ({ ...prev, ...applyWlDrag({ ...prev, windowWidth: startWw, windowLevel: startWl }, dx, dy) }));
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

      updateSliderFromEvent(e.clientX, e.clientY);

      const handleMouseMove = (moveEvent: MouseEvent) => {
        updateSliderFromEvent(moveEvent.clientX, moveEvent.clientY);
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [updateSliderFromEvent, measuring, viewport, onDrawLine, orientation, sliderPosition]
  );

  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLCanvasElement>) => {
      e.preventDefault();
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      setViewport((prev) => ({
        ...prev,
        zoom: Math.max(0.1, Math.min(10, prev.zoom * zoomFactor)),
      }));
    },
    []
  );

  return (
    <div ref={containerRef} className={cn('relative w-full h-full bg-black overflow-hidden', className)}>
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-white text-sm">{t('viewer.compare.loading')}</div>
        </div>
      )}
      <canvas
        ref={canvasRef}
        className={cn('w-full h-full', measuring ? 'cursor-crosshair' : 'cursor-ew-resize')}
        onMouseDown={handleMouseDown}
        onWheel={handleWheel}
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="absolute top-2 left-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
        A
      </div>
      <div className="absolute top-2 right-2 text-xs text-white/70 bg-black/50 px-2 py-1 rounded">
        B
      </div>
      <div className="absolute bottom-2 left-2 text-xs text-white/70">
        <div>{t('viewer.compare.zoom')}: {(viewport.zoom * 100).toFixed(0)}%</div>
        <div>{t('viewer.compare.sliderPosition')}: {(sliderPosition * 100).toFixed(0)}%</div>
        <div>窗宽/窗位: {viewport.windowWidth}/{viewport.windowLevel}</div>
      </div>
    </div>
  );
}
