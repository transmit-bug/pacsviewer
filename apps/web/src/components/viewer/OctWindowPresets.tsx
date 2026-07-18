/**
 * OctWindowPresets — OCT-specific window/level preset buttons.
 *
 * Provides quick access to common OCT display presets:
 * - Standard: general-purpose OCT view
 * - High Contrast: enhanced layer differentiation
 * - Low Noise: reduced noise appearance
 * - RNFL: optimized for retinal nerve fiber layer
 */

import { useViewerStore } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface OctPreset {
  id: string;
  label: string;
  windowWidth: number;
  windowCenter: number;
  description: string;
}

const OCT_PRESETS: OctPreset[] = [
  { id: 'standard', label: '标准', windowWidth: 300, windowCenter: 150, description: '通用 OCT 视图' },
  { id: 'high-contrast', label: '高对比', windowWidth: 200, windowCenter: 100, description: '增强层间对比' },
  { id: 'low-noise', label: '低噪声', windowWidth: 400, windowCenter: 200, description: '减少噪声' },
  { id: 'rnfl', label: 'RNFL', windowWidth: 250, windowCenter: 125, description: 'RNFL 专用' },
];

interface OctWindowPresetsProps {
  className?: string;
}

export function OctWindowPresets({ className }: OctWindowPresetsProps) {
  const { viewport, setViewport } = useViewerStore();

  const handlePreset = (preset: OctPreset) => {
    setViewport({
      windowWidth: preset.windowWidth,
      windowLevel: preset.windowCenter,
    });
  };

  const isCurrentPreset = (preset: OctPreset) => {
    return viewport.windowWidth === preset.windowWidth && viewport.windowLevel === preset.windowCenter;
  };

  return (
    <div className={className}>
      <p className="text-xs text-muted-foreground mb-2">OCT 预设</p>
      <div className="flex flex-wrap gap-1">
        {OCT_PRESETS.map((preset) => {
          const active = isCurrentPreset(preset);
          return (
            <Tooltip key={preset.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={active ? 'default' : 'outline'}
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handlePreset(preset)}
                >
                  {preset.label}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{preset.description}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
