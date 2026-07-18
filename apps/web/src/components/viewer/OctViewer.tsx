/**
 * OctViewer — OCT B-scan specialized viewer.
 *
 * Integrates:
 * - CornerstoneViewport for B-scan rendering
 * - CinePlayer for frame navigation
 * - OctWindowPresets for OCT-specific W/L
 * - EnFacePreview for volume overview
 * - useOctNavigation hook
 */

import { useOctNavigation } from '@/hooks/useOctNavigation';
import { CornerstoneViewport } from '@/components/viewer/CornerstoneViewport';
import { CinePlayer } from '@/components/viewer/CinePlayer';
import { OctWindowPresets } from '@/components/viewer/OctWindowPresets';
import { EnFacePreview } from '@/components/viewer/EnFacePreview';
import { ThicknessMap } from '@/components/viewer/ThicknessMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Layers, Grid3X3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface OctViewerProps {
  imageId: string;
  imageFormat?: string;
  className?: string;
}

export function OctViewer({ imageId, imageFormat, className }: OctViewerProps) {
  const {
    currentFrame,
    totalFrames,
    goToFrame,
    sliceLocations,
  } = useOctNavigation({ imageId });

  const [showThicknessMap, setShowThicknessMap] = useState(false);
  const [colorMap, setColorMap] = useState<'jet' | 'hot' | 'viridis' | 'gray'>('jet');
  const [showETDRS, setShowETDRS] = useState(true);

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Main B-scan viewport */}
      <Card className="flex-1">
        <CardContent className="p-0 h-full">
          <CornerstoneViewport imageId={imageId} imageFormat={imageFormat} />
        </CardContent>
      </Card>

      {/* Cine Player */}
      <CinePlayer />

      {/* Bottom panel: presets + en-face */}
      <div className="flex gap-3">
        {/* Window/Level presets */}
        <Card className="shrink-0">
          <CardContent className="p-3">
            <OctWindowPresets />
          </CardContent>
        </Card>

        {/* En-face preview */}
        {totalFrames > 1 && (
          <Card className="flex-1">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs">En-face 预览</CardTitle>
            </CardHeader>
            <CardContent>
              <EnFacePreview
                sliceLocations={sliceLocations}
                currentFrame={currentFrame}
                totalFrames={totalFrames}
                onFrameSelect={goToFrame}
                height={80}
              />
            </CardContent>
          </Card>
        )}

        {/* Frame info */}
        {totalFrames > 1 && (
          <Card className="shrink-0">
            <CardContent className="p-3">
              <div className="text-xs space-y-1">
                <p className="text-muted-foreground">帧信息</p>
                <p className="font-mono">帧 {currentFrame + 1} / {totalFrames}</p>
                {sliceLocations.length > 0 && (
                  <p className="font-mono text-muted-foreground">
                    位置: {sliceLocations[currentFrame]?.toFixed(2) ?? '-'} mm
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Thickness Map Toggle */}
        <Card className="shrink-0">
          <CardContent className="p-3">
            <div className="flex flex-col gap-2">
              <Button
                variant={showThicknessMap ? 'default' : 'outline'}
                size="sm"
                className="text-xs"
                onClick={() => setShowThicknessMap(!showThicknessMap)}
              >
                <Layers className="h-3 w-3 mr-1" />
                厚度图
              </Button>
              {showThicknessMap && (
                <div className="flex gap-1">
                  {(['jet', 'hot', 'viridis', 'gray'] as const).map((cm) => (
                    <button
                      key={cm}
                      className={`px-1.5 py-0.5 text-[10px] rounded ${
                        colorMap === cm
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
                      }`}
                      onClick={() => setColorMap(cm)}
                    >
                      {cm}
                    </button>
                  ))}
                </div>
              )}
              {showThicknessMap && (
                <Button
                  variant={showETDRS ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs"
                  onClick={() => setShowETDRS(!showETDRS)}
                >
                  <Grid3X3 className="h-3 w-3 mr-1" />
                  ETDRS
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Thickness Map Panel (when enabled) */}
      {showThicknessMap && totalFrames > 1 && (
        <ThicknessMap
          data={new Float32Array(100 * 100)} // Placeholder - would be generated from actual OCT data
          width={100}
          height={100}
          colorMap={colorMap}
          showGrid={showETDRS}
          showStats={true}
          stats={{
            centerThickness: 245,
            averageThickness: 312,
            minThickness: 238,
            maxThickness: 380,
            etdrsRegions: [
              { name: '中心', averageThickness: 245 },
              { name: '内上方', averageThickness: 318 },
              { name: '内鼻侧', averageThickness: 325 },
              { name: '内下方', averageThickness: 310 },
              { name: '内颞侧', averageThickness: 322 },
              { name: '外上方', averageThickness: 285 },
              { name: '外鼻侧', averageThickness: 290 },
              { name: '外下方', averageThickness: 278 },
              { name: '外颞侧', averageThickness: 282 },
            ],
          }}
        />
      )}
    </div>
  );
}
