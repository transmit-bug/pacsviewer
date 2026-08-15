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
import { Card, CardContent } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useState, useCallback } from 'react';
import { Layers, Grid3X3, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ThicknessType } from '@pacsviewer/image-processing/browser';
import './workspace/workspace.css'; // 继承工作台动效/HUD 视觉层 (#126)

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
      {/* Main B-scan viewport (近黑视口 + HUD 帧角标, #126 令牌化) */}
      <div className="ws-viewport-bg relative flex-1 overflow-hidden rounded-md border border-border">
        <CornerstoneViewport imageId={imageId} imageFormat={imageFormat} />
        {totalFrames > 1 && (
          <div className="glass-surface pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-2 rounded-md border border-white/10 px-2 py-1 shadow-lg">
            <span className="hud-numeric ws-hud-text text-[11px] text-white/90">
              {currentFrame + 1} <span className="text-white/50">/ {totalFrames}</span>
            </span>
            {sliceLocations.length > 0 && (
              <>
                <span className="h-3 w-px bg-white/15" />
                <span className="ws-hud-text hud-numeric text-[10px] text-white/70">
                  {(sliceLocations[currentFrame] ?? 0).toFixed(2)} mm
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Cine Player */}
      <CinePlayer />

      {/* Bottom panel: presets + en-face (玻璃浮层化, 逻辑不变) */}
      <div className="glass-surface flex flex-wrap gap-3 rounded-md border border-white/10 p-2.5 shadow-lg">
        {/* Window/Level presets */}
        <div className="shrink-0">
          <OctWindowPresets />
        </div>

        {/* En-face preview */}
        {totalFrames > 1 && (
          <div className="min-w-48 flex-1">
            <p className="mb-1 text-xs">En-face 预览</p>
            <EnFacePreview
              sliceLocations={sliceLocations}
              currentFrame={currentFrame}
              totalFrames={totalFrames}
              onFrameSelect={goToFrame}
              height={80}
            />
          </div>
        )}

        {/* Frame info */}
        {totalFrames > 1 && (
          <div className="shrink-0">
            <div className="text-xs space-y-1">
              <p className="text-muted-foreground">帧信息</p>
              <p className="font-mono">帧 {currentFrame + 1} / {totalFrames}</p>
              {sliceLocations.length > 0 && (
                <p className="font-mono text-muted-foreground">
                  位置: {sliceLocations[currentFrame]?.toFixed(2) ?? '-'} mm
                </p>
              )}
            </div>
          </div>
        )}

        {/* Thickness Map Toggle */}
        <div className="shrink-0">
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
        </div>
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
