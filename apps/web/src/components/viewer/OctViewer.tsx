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
import { useOctThicknessMap } from '@/hooks/useOctThicknessMap';
import { CornerstoneViewport } from '@/components/viewer/CornerstoneViewport';
import { CinePlayer } from '@/components/viewer/CinePlayer';
import { OctWindowPresets } from '@/components/viewer/OctWindowPresets';
import { EnFacePreview } from '@/components/viewer/EnFacePreview';
import { ThicknessMap } from '@/components/viewer/ThicknessMap';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { Layers, Grid3X3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThicknessType } from '@pacsviewer/image-processing/browser';

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

  // Thickness map integration
  const {
    thicknessData,
    isGenerating,
    error: thicknessError,
    generate: generateThicknessMap,
    thicknessType,
    setThicknessType,
  } = useOctThicknessMap({ imageId, thicknessType: 'total' });

  const handleToggleThicknessMap = useCallback(() => {
    const next = !showThicknessMap;
    setShowThicknessMap(next);
    // Auto-generate when first enabling and no data exists
    if (next && !thicknessData && !isGenerating) {
      generateThicknessMap();
    }
  }, [showThicknessMap, thicknessData, isGenerating, generateThicknessMap]);

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
                onClick={handleToggleThicknessMap}
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                ) : (
                  <Layers className="h-3 w-3 mr-1" />
                )}
                {isGenerating ? '生成中...' : '厚度图'}
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
      {showThicknessMap && (
        <>
          {/* Thickness type selector */}
          <Card>
            <CardContent className="p-2">
              <div className="flex flex-wrap gap-1">
                {([
                  ['total', '全层'],
                  ['retinal', '视网膜'],
                  ['rnfl', 'RNFL'],
                  ['gcl_ipl', 'GCL+IPL'],
                  ['inl', 'INL'],
                  ['opl', 'OPL'],
                  ['onl', 'ONL'],
                  ['photoreceptor', '感光细胞'],
                ] as const).map(([type, label]) => (
                  <button
                    key={type}
                    className={`px-2 py-1 text-[10px] rounded transition-colors ${
                      thicknessType === type
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                    onClick={() => {
                      setThicknessType(type as ThicknessType);
                      generateThicknessMap();
                    }}
                    disabled={isGenerating}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Thickness map visualization */}
          {isGenerating && (
            <Card>
              <CardContent className="p-6 flex items-center justify-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span className="text-sm text-muted-foreground">正在生成厚度图...</span>
              </CardContent>
            </Card>
          )}

          {thicknessError && !isGenerating && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-destructive text-center">
                  {thicknessError}
                </p>
                <div className="flex justify-center mt-2">
                  <Button variant="outline" size="sm" onClick={generateThicknessMap}>
                    重试
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {thicknessData && !isGenerating && (
            <ThicknessMap
              data={thicknessData.data}
              width={thicknessData.width}
              height={thicknessData.height}
              colorMap={colorMap}
              showGrid={showETDRS}
              showStats={true}
              stats={thicknessData.stats}
              displayWidth={400}
              displayHeight={300}
            />
          )}
        </>
      )}
    </div>
  );
}
