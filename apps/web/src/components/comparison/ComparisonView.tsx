import { useState } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SideBySideMode } from './SideBySideMode';
import { OverlayMode } from './OverlayMode';
import { SliderMode } from './SliderMode';
import {
  Columns,
  Layers,
  SlidersHorizontal,
} from 'lucide-react';

export type ComparisonMode = 'side-by-side' | 'overlay' | 'slider';

interface ComparisonViewProps {
  imageIdA: string;
  imageIdB: string;
  initialMode?: ComparisonMode;
  className?: string;
}

const MODE_OPTIONS: { value: ComparisonMode; label: string; icon: typeof Columns }[] = [
  { value: 'side-by-side', label: '并排对比', icon: Columns },
  { value: 'overlay', label: '叠加对比', icon: Layers },
  { value: 'slider', label: '滑动对比', icon: SlidersHorizontal },
];

export function ComparisonView({
  imageIdA,
  imageIdB,
  initialMode = 'side-by-side',
  className,
}: ComparisonViewProps) {
  const [mode, setMode] = useState<ComparisonMode>(initialMode);
  const [sideOrientation, setSideOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [sliderOrientation, setSliderOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  if (!imageIdA || !imageIdB) {
    return (
      <div className={cn('flex items-center justify-center bg-black text-white', className)}>
        <div className="text-center">
          <p className="text-lg font-medium">请选择两张图像进行对比</p>
          <p className="text-sm text-muted-foreground mt-1">从图像列表中选择图像 A 和图像 B</p>
        </div>
      </div>
    );
  }

  return (
    <div className={cn('flex flex-col w-full h-full', className)}>
      {/* Mode selector */}
      <div className="flex items-center gap-2 p-2 bg-card border-b">
        <div className="flex gap-1">
          {MODE_OPTIONS.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.value}
                variant={mode === option.value ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setMode(option.value)}
                className="text-xs h-8"
              >
                <Icon className="h-4 w-4 mr-1" />
                {option.label}
              </Button>
            );
          })}
        </div>

        {mode === 'side-by-side' && (
          <div className="flex gap-1 ml-2">
            <Button
              variant={sideOrientation === 'horizontal' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSideOrientation('horizontal')}
              className="text-xs h-7"
            >
              左右
            </Button>
            <Button
              variant={sideOrientation === 'vertical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSideOrientation('vertical')}
              className="text-xs h-7"
            >
              上下
            </Button>
          </div>
        )}

        {mode === 'slider' && (
          <div className="flex gap-1 ml-2">
            <Button
              variant={sliderOrientation === 'horizontal' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSliderOrientation('horizontal')}
              className="text-xs h-7"
            >
              水平
            </Button>
            <Button
              variant={sliderOrientation === 'vertical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSliderOrientation('vertical')}
              className="text-xs h-7"
            >
              垂直
            </Button>
          </div>
        )}
      </div>

      {/* Comparison content */}
      <div className="flex-1 overflow-hidden">
        {mode === 'side-by-side' && (
          <SideBySideMode
            imageIdA={imageIdA}
            imageIdB={imageIdB}
            orientation={sideOrientation}
          />
        )}
        {mode === 'overlay' && (
          <OverlayMode imageIdA={imageIdA} imageIdB={imageIdB} />
        )}
        {mode === 'slider' && (
          <SliderMode
            imageIdA={imageIdA}
            imageIdB={imageIdB}
            orientation={sliderOrientation}
          />
        )}
      </div>
    </div>
  );
}
