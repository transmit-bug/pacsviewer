import { useEffect, useRef, useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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

type BlendMode = 'normal' | 'difference' | 'lighten' | 'darken';

interface OverlayModeProps {
  imageIdA: string;
  imageIdB: string;
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

const BLEND_MODES: { value: BlendMode; label: string }[] = [
  { value: 'normal', label: '正常' },
  { value: 'difference', label: '差异' },
  { value: 'lighten', label: '变亮' },
  { value: 'darken', label: '变暗' },
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

export function OverlayMode({ imageIdA, imageIdB, className }: OverlayModeProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const imgARef = useRef<HTMLImageElement | null>(null);
  const imgBRef = useRef<HTMLImageElement | null>(null);

  const [viewport, setViewport] = useState<ViewportState>({ ...defaultViewport });
  const [opacity, setOpacity] = useState(0.5);
  const [blendMode, setBlendMode] = useState<BlendMode>('normal');
  const [isLoading, setIsLoading] = useState(true);
  const [diffHighlight, setDiffHighlight] = useState(false);

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
    if (canvasRef.current && imgARef.current && imgBRef.current) {
      renderOverlayToCanvas(canvasRef.current, imgARef.current, imgBRef.current, viewport, opacity, blendMode);

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
  }, [viewport, opacity, blendMode, diffHighlight, isLoading]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const startX = e.clientX;
      const startY = e.clientY;
      const startPan = { ...viewport.pan };

      const handleMouseMove = (moveEvent: MouseEvent) => {
        const deltaX = moveEvent.clientX - startX;
        const deltaY = moveEvent.clientY - startY;
        setViewport((prev) => ({
          ...prev,
          pan: {
            x: startPan.x + deltaX / prev.zoom,
            y: startPan.y + deltaY / prev.zoom,
          },
        }));
      };

      const handleMouseUp = () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };

      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    },
    [viewport]
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
          <label className="text-xs text-muted-foreground">透明度</label>
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
          <label className="text-xs text-muted-foreground">混合模式</label>
          <div className="flex gap-1">
            {BLEND_MODES.map((mode) => (
              <Button
                key={mode.value}
                variant={blendMode === mode.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setBlendMode(mode.value)}
                className="text-xs h-7"
              >
                {mode.label}
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
          差异高亮
        </Button>
      </div>

      <div ref={containerRef} className="relative flex-1 bg-black overflow-hidden">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-white text-sm">加载中...</div>
          </div>
        )}
        <canvas
          ref={canvasRef}
          className="w-full h-full cursor-crosshair"
          onMouseDown={handleMouseDown}
          onWheel={handleWheel}
        />
        <div className="absolute bottom-2 left-2 text-xs text-white/70">
          <div>缩放: {(viewport.zoom * 100).toFixed(0)}%</div>
          <div>混合: {BLEND_MODES.find((m) => m.value === blendMode)?.label}</div>
        </div>
      </div>
    </div>
  );
}
