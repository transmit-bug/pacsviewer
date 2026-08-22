import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import {
  type ViewportState,
  defaultViewport,
  drawMeasurementLines,
  isWwWlGesture,
  applyWlDrag,
  type ComparisonLine,
} from './shared';

type BlendMode = 'normal' | 'difference' | 'lighten' | 'darken';

interface OverlayModeProps {
  imageIdA: string;
  imageIdB: string;
  /** Measurement overlay lines (attributed to the comparison study — top layer). */
  lines?: ComparisonLine[];
  onDrawLine?: (line: ComparisonLine) => void;
  measuring?: boolean;
  className?: string;
}

const BLEND_MODES: { value: BlendMode; labelKey: string }[] = [
  { value: 'normal', labelKey: 'viewer.compare.blendNormal' },
  { value: 'difference', labelKey: 'viewer.compare.blendDifference' },
  { value: 'lighten', labelKey: 'viewer.compare.blendLighten' },
  { value: 'darken', labelKey: 'viewer.compare.blendDarken' },
];

function renderOverlayToCanvas(
  canvas: HTMLCanvasElement,
  imgA: HTMLImageElement,
  imgB: HTMLImageElement,
  viewport: ViewportState,
  opacity: number,
  blendMode: BlendMode
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = canvas.parentElement?.clientWidth || canvas.width;
  canvas.height = canvas.parentElement?.clientHeight || canvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const renderSingleImage = (img: HTMLImageElement, globalAlpha: number) => {
    ctx.save();
    ctx.globalAlpha = globalAlpha;

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
    ctx.restore();
  };

  // Canvas blend mode mapping
  const canvasBlendMode: GlobalCompositeOperation =
    blendMode === 'normal' ? 'source-over' :
    blendMode === 'difference' ? 'difference' :
    blendMode === 'lighten' ? 'lighten' :
    'darken';

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  renderSingleImage(imgA, 1);

  ctx.globalCompositeOperation = canvasBlendMode;
  renderSingleImage(imgB, opacity);

  ctx.globalCompositeOperation = 'source-over';
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
}

export function OverlayMode({ imageIdA, imageIdB, lines = [], onDrawLine, measuring = false, className }: OverlayModeProps) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const [viewport, setViewport] = useState<ViewportState>({ ...defaultViewport });
  const [opacity, setOpacity] = useState(0.5);
  // 差值混合作为默认(wayfinder #88 决策)
  const [blendMode, setBlendMode] = useState<BlendMode>('difference');
  const [isLoading, setIsLoading] = useState(true);
  const [diffHighlight, setDiffHighlight] = useState(false);
  const [draft, setDraft] = useState<ComparisonLine | null>(null);
  const dragRef = useRef<{ kind: 'pan' | 'wl' | 'measure'; startX: number; startY: number; startWw: number; startWl: number; line: ComparisonLine | null } | null>(null);

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
        img.src = `/api/images/${imageId}/file?token=${encodeURIComponent(token ?? '')}`;
      });
    },
    [token]
  );

  useEffect(() => {
    setIsLoading(true);
    Promise.all([loadImage(imageIdA, imgARef), loadImage(imageIdB, imgBRef)]).then(() => {
      setIsLoading(false);
    });
  }, [imageIdA, imageIdB, loadImage]);

  useEffect(() => {
    if (canvasRef.current && imgARef.current && imgBRef.current) {
      renderOverlayToCanvas(canvasRef.current, imgARef.current, imgBRef.current, viewport, opacity, blendMode);
      drawMeasurementLines(canvasRef.current, [...lines, ...(draft ? [draft] : [])]);

      if (diffHighlight) {
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          const imageData = ctx.getImageData(0, 0, canvasRef.current.width, canvasRef.current.height);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i], g = data[i + 1], b = data[i + 2];
            const diff = Math.abs(r - 128) + Math.abs(g - 128) + Math.abs(b - 128);
            if (diff > 60) {
              data[i] = 255;
              data[i + 1] = 50;
              data[i + 2] = 50;
              data[i + 3] = Math.min(255, diff * 3);
            }
          }
          ctx.putImageData(imageData, 0, 0);
        }
      }
    }
  }, [viewport, opacity, blendMode, diffHighlight, isLoading, lines, draft]);

  const normalizePoint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (!canvasRef.current) return;
      e.preventDefault();

      if (measuring) {
        const { x, y } = normalizePoint(e);
        const line: ComparisonLine = {
          id: `ov-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          x1: x, y1: y, x2: x, y2: y,
          owner: 'comparison',
        };
        dragRef.current = { kind: 'measure', startX: e.clientX, startY: e.clientY, startWw: viewport.windowWidth, startWl: viewport.windowLevel, line };
        const handleMove = (moveEvent: MouseEvent) => {
          if (!dragRef.current?.line) return;
          const rect = canvasRef.current?.getBoundingClientRect();
          if (!rect) return;
          const px = Math.max(0, Math.min(1, (moveEvent.clientX - rect.left) / rect.width));
          const py = Math.max(0, Math.min(1, (moveEvent.clientY - rect.top) / rect.height));
          const updated = { ...dragRef.current.line, x2: px, y2: py };
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

      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { ...viewport.pan };
      const startWw = viewport.windowWidth;
      const startWl = viewport.windowLevel;

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        if (isWwWlGesture(e)) {
          setViewport((prev) => ({ ...prev, ...applyWlDrag({ ...prev, windowWidth: startWw, windowLevel: startWl }, deltaX, deltaY) }));
        } else {
          setViewport((prev) => ({
            ...prev,
            pan: {
              x: startPan.x + deltaX / prev.zoom,
              y: startPan.y + deltaY / prev.zoom,
            },
          }));
        }
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [viewport, measuring, onDrawLine, normalizePoint]
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
    <div className={cn('flex flex-col w-full h-full', className)}>
      <div className="flex items-center gap-4 p-2 bg-card border-b">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('viewer.compare.opacity')}</label>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => setOpacity(parseFloat(e.target.value))}
            className="w-32"
          />
          <span className="text-xs text-muted-foreground w-10">{(opacity * 100).toFixed(0)}%</span>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">{t('viewer.compare.blendMode')}</label>
          <div className="flex gap-1">
            {BLEND_MODES.map((mode) => (
              <Button
                key={mode.value}
                variant={blendMode === mode.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBlendMode(mode.value)}
                className="text-xs h-7"
              >
                {t(mode.labelKey)}
              </Button>
            ))}
          </div>
        </div>

        <Button
          variant={diffHighlight ? 'default' : 'ghost'}
          size="sm"
          onClick={() => setDiffHighlight(!diffHighlight)}
          className="text-xs h-7"
        >
          {t('viewer.compare.diffHighlight')}
        </Button>
      </div>

      <div ref={containerRef} className="relative flex-1 bg-black overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-sm">{t('viewer.compare.loading')}</div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className={cn('w-full h-full', measuring ? 'cursor-crosshair' : 'cursor-grab active:cursor-grabbing')}
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
          onContextMenu={(e) => e.preventDefault()}
        />
        <div className="absolute bottom-2 left-2 text-xs text-white/70">
          <div>{t('viewer.compare.zoom')}: {(viewport.zoom * 100).toFixed(0)}%</div>
          <div>{t('viewer.compare.blend')}: {t(BLEND_MODES.find((m) => m.value === blendMode)?.labelKey || '')}</div>
          <div>{t('viewer.compare.windowLevel')}: {viewport.windowWidth}/{viewport.windowLevel}</div>
        </div>
      </div>
    </div>
  );
}
