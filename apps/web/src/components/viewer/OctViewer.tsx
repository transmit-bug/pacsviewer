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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

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
      </div>
    </div>
  );
}
