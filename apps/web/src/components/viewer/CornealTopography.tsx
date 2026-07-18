/**
 * CornealTopography — corneal topography viewer component.
 *
 * Renders corneal curvature/thickness maps using Canvas 2D.
 * Supports multiple color maps, contour lines, and parameter display.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  renderCornealMap,
  generateDemoCurvatureData,
  generateDemoThicknessData,
  type ColorMap,
  type CornealMapData,
} from '@/lib/corneal-topography';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Download, Grid3X3, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CornealTopographyProps {
  /** Corneal map data (optional, uses demo data if not provided) */
  mapData?: CornealMapData;
  /** Canvas size in pixels */
  size?: number;
  className?: string;
}

const COLOR_MAPS: { id: ColorMap; label: string }[] = [
  { id: 'jet', label: 'Jet' },
  { id: 'hot', label: 'Hot' },
  { id: 'viridis', label: 'Viridis' },
];

const MAP_TYPES = [
  { type: 'curvature' as const, label: '曲率图', unit: 'D' },
  { type: 'thickness' as const, label: '厚度图', unit: 'μm' },
];

export function CornealTopography({ mapData: externalData, size = 256, className }: CornealTopographyProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [colorMap, setColorMap] = useState<ColorMap>('jet');
  const [showContours, setShowContours] = useState(false);
  const [mapType, setMapType] = useState<'curvature' | 'thickness'>('curvature');
  const [demoData] = useState(() => ({
    curvature: generateDemoCurvatureData(128),
    thickness: generateDemoThicknessData(128),
  }));

  const currentData = externalData ?? demoData[mapType];

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentData) return;

    renderCornealMap({
      canvas,
      mapData: currentData,
      colorMap,
      showContours,
      contourInterval: mapType === 'curvature' ? 1 : 20,
      showParameters: true,
      scale: size / currentData.size,
    });
  }, [currentData, colorMap, showContours, mapType, size]);

  useEffect(() => {
    render();
  }, [render]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `corneal-${mapType}-${colorMap}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Map type */}
        <div className="flex gap-1">
          {MAP_TYPES.map((t) => (
            <Button
              key={t.type}
              variant={mapType === t.type ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMapType(t.type)}
            >
              {t.label}
            </Button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Color map */}
        <div className="flex items-center gap-1">
          <Palette className="h-3.5 w-3.5 text-muted-foreground" />
          {COLOR_MAPS.map((cm) => (
            <Button
              key={cm.id}
              variant={colorMap === cm.id ? 'default' : 'ghost'}
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => setColorMap(cm.id)}
            >
              {cm.label}
            </Button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Contour toggle */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant={showContours ? 'default' : 'ghost'}
              size="sm"
              className="h-7"
              onClick={() => setShowContours(!showContours)}
            >
              <Grid3X3 className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>等高线</TooltipContent>
        </Tooltip>

        {/* Export */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="sm" className="h-7" onClick={handleExport}>
              <Download className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>导出 PNG</TooltipContent>
        </Tooltip>
      </div>

      {/* Canvas */}
      <Card>
        <CardContent className="p-3 flex justify-center">
          <canvas
            ref={canvasRef}
            className="rounded-md"
            style={{ width: size, height: size }}
          />
        </CardContent>
      </Card>

      {/* Parameters */}
      {currentData?.parameters && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">角膜参数</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">眼别</span>
                <span className="font-mono">{currentData.parameters.laterality}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">K1 (平)</span>
                <span className="font-mono">{currentData.parameters.k1.toFixed(2)} D</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">K2 (陡)</span>
                <span className="font-mono">{currentData.parameters.k2.toFixed(2)} D</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">散光</span>
                <span className="font-mono">{currentData.parameters.astigmatism.toFixed(2)} D</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Q 值</span>
                <span className="font-mono">{currentData.parameters.qValue.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">WTW</span>
                <span className="font-mono">{currentData.parameters.whiteToWhite.toFixed(1)} mm</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
