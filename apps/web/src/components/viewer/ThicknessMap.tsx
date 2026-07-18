/**
 * ThicknessMap — OCT retinal thickness heatmap visualization.
 *
 * Renders a 2D heatmap of retinal thickness with:
 * - Configurable color maps (jet, hot, viridis, gray)
 * - ETDRS grid overlay
 * - Thickness statistics display
 * - Export to PNG
 */

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, BarChart3 } from 'lucide-react';
import { COLOR_MAPS } from '@pacsviewer/image-processing/browser';

interface ThicknessMapProps {
  /** Thickness data (Float32Array, row-major) */
  data: Float32Array;
  /** Map width */
  width: number;
  /** Map height */
  height: number;
  /** Color map name */
  colorMap?: 'jet' | 'hot' | 'viridis' | 'gray';
  /** Show ETDRS grid overlay */
  showGrid?: boolean;
  /** Show statistics */
  showStats?: boolean;
  /** Thickness statistics */
  stats?: {
    centerThickness: number;
    averageThickness: number;
    minThickness: number;
    maxThickness: number;
    etdrsRegions?: Array<{
      name: string;
      averageThickness: number;
    }>;
  };
  /** Display width */
  displayWidth?: number;
  /** Display height */
  displayHeight?: number;
  className?: string;
}

export function ThicknessMap({
  data,
  width,
  height,
  colorMap = 'jet',
  showGrid = false,
  showStats = true,
  stats,
  displayWidth = 300,
  displayHeight = 300,
  className,
}: ThicknessMapProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number } | null>(null);

  // Find min/max for normalization
  const { min, max } = useMemo(() => {
    let autoMin = Infinity;
    let autoMax = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) {
        if (data[i] < autoMin) autoMin = data[i];
        if (data[i] > autoMax) autoMax = data[i];
      }
    }
    return { min: autoMin === Infinity ? 0 : autoMin, max: autoMax === -Infinity ? 100 : autoMax };
  }, [data]);

  // Draw heatmap
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = displayWidth;
    canvas.height = displayHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Create offscreen canvas for the heatmap
    const offscreen = document.createElement('canvas');
    offscreen.width = width;
    offscreen.height = height;
    const offCtx = offscreen.getContext('2d');
    if (!offCtx) return;

    // Render heatmap
    const imageData = offCtx.createImageData(width, height);
    const range = max - min;
    const colorFn = COLOR_MAPS[colorMap];

    for (let i = 0; i < width * height; i++) {
      const val = data[i];
      if (val <= 0) {
        // Transparent for no-data
        imageData.data[i * 4 + 3] = 0;
        continue;
      }

      const t = range > 0 ? Math.max(0, Math.min(1, (val - min) / range)) : 0.5;
      const [r, g, b] = colorFn(t);

      imageData.data[i * 4] = r;
      imageData.data[i * 4 + 1] = g;
      imageData.data[i * 4 + 2] = b;
      imageData.data[i * 4 + 3] = 255;
    }

    offCtx.putImageData(imageData, 0, 0);

    // Draw scaled to display size
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(offscreen, 0, 0, displayWidth, displayHeight);

    // Draw ETDRS grid overlay
    if (showGrid) {
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.lineWidth = 1;

      const centerX = displayWidth / 2;
      const centerY = displayHeight / 2;
      const innerRadius = Math.min(displayWidth, displayHeight) * 0.15;
      const outerRadius = Math.min(displayWidth, displayHeight) * 0.35;

      // Draw circles
      ctx.beginPath();
      ctx.arc(centerX, centerY, innerRadius, 0, Math.PI * 2);
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(centerX, centerY, outerRadius, 0, Math.PI * 2);
      ctx.stroke();

      // Draw cross lines
      ctx.beginPath();
      ctx.moveTo(centerX - outerRadius, centerY);
      ctx.lineTo(centerX + outerRadius, centerY);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX, centerY - outerRadius);
      ctx.lineTo(centerX, centerY + outerRadius);
      ctx.stroke();

      // Label regions
      ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.font = '10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('中心', centerX, centerY + 4);
    }
  }, [data, width, height, colorMap, showGrid, displayWidth, displayHeight, min, max]);

  useEffect(() => {
    draw();
  }, [draw]);

  // Handle mouse move for hover values
  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor(((e.clientX - rect.left) / rect.width) * width);
      const y = Math.floor(((e.clientY - rect.top) / rect.height) * height);

      if (x >= 0 && x < width && y >= 0 && y < height) {
        const value = data[y * width + x];
        setHoverValue(value > 0 ? value : null);
        setHoverPos({ x, y });
      } else {
        setHoverValue(null);
        setHoverPos(null);
      }
    },
    [data, width, height]
  );

  // Export to PNG
  const handleExport = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `thickness-map-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-1">
            <BarChart3 className="h-3.5 w-3.5" />
            视网膜厚度图
          </CardTitle>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleExport} title="导出 PNG">
              <Download className="h-3 w-3" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-2">
        {/* Heatmap canvas */}
        <div className="relative">
          <canvas
            ref={canvasRef}
            className="w-full rounded border"
            style={{ aspectRatio: `${width}/${height}` }}
            onMouseMove={handleMouseMove}
            onMouseLeave={() => {
              setHoverValue(null);
              setHoverPos(null);
            }}
          />

          {/* Hover tooltip */}
          {hoverValue !== null && hoverPos && (
            <div className="absolute top-2 right-2 bg-black/80 text-white text-xs px-2 py-1 rounded">
              <p>({hoverPos.x}, {hoverPos.y})</p>
              <p className="font-mono">{hoverValue.toFixed(1)} μm</p>
            </div>
          )}
        </div>

        {/* Color bar legend */}
        <div className="mt-2 flex items-center gap-2">
          <span className="text-xs text-muted-foreground">{min.toFixed(0)}</span>
          <div
            className="flex-1 h-2 rounded"
            style={{
              background: `linear-gradient(to right, ${Array.from({ length: 10 }, (_, i) => {
                const t = i / 9;
                const [r, g, b] = COLOR_MAPS[colorMap](t);
                return `rgb(${r},${g},${b})`;
              }).join(', ')})`,
            }}
          />
          <span className="text-xs text-muted-foreground">{max.toFixed(0)}</span>
          <span className="text-xs text-muted-foreground">μm</span>
        </div>

        {/* Statistics */}
        {showStats && stats && (
          <div className="mt-3 space-y-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="p-1.5 rounded bg-muted/50">
                <span className="text-muted-foreground">中心凹:</span>
                <span className="ml-1 font-mono font-medium">
                  {stats.centerThickness.toFixed(0)} μm
                </span>
              </div>
              <div className="p-1.5 rounded bg-muted/50">
                <span className="text-muted-foreground">平均:</span>
                <span className="ml-1 font-mono font-medium">
                  {stats.averageThickness.toFixed(0)} μm
                </span>
              </div>
              <div className="p-1.5 rounded bg-muted/50">
                <span className="text-muted-foreground">最薄:</span>
                <span className="ml-1 font-mono font-medium text-blue-500">
                  {stats.minThickness.toFixed(0)} μm
                </span>
              </div>
              <div className="p-1.5 rounded bg-muted/50">
                <span className="text-muted-foreground">最厚:</span>
                <span className="ml-1 font-mono font-medium text-red-500">
                  {stats.maxThickness.toFixed(0)} μm
                </span>
              </div>
            </div>

            {/* ETDRS regions */}
            {stats.etdrsRegions && stats.etdrsRegions.length > 0 && (
              <div>
                <h5 className="text-xs font-medium text-muted-foreground mb-1">ETDRS 分区</h5>
                <div className="grid grid-cols-3 gap-1 text-xs">
                  {stats.etdrsRegions.map((region) => (
                    <div key={region.name} className="p-1 rounded bg-muted/50 text-center">
                      <div className="text-muted-foreground text-[10px]">{region.name}</div>
                      <div className="font-mono">{region.averageThickness.toFixed(0)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
