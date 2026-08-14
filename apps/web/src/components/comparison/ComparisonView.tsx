import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { SideBySideMode } from './SideBySideMode';
import { OverlayMode } from './OverlayMode';
import { SliderMode } from './SliderMode';
import type { ComparisonLine } from './shared';
import {
  Columns,
  Layers,
  SlidersHorizontal,
  Ruler,
  Link2,
  Link2Off,
} from 'lucide-react';

export type ComparisonMode = 'side-by-side' | 'overlay' | 'slider';

interface ComparisonViewProps {
  imageIdA: string;
  imageIdB: string;
  initialMode?: ComparisonMode;
  /** Controlled mode (optional — falls back to internal state). */
  mode?: ComparisonMode;
  onModeChange?: (mode: ComparisonMode) => void;
  /** Mirror pan / zoom / window-level between panels (side-by-side only). */
  syncViewport?: boolean;
  onSyncViewportChange?: (v: boolean) => void;
  /** When true, drag draws a measurement line attributed to the panel's study. */
  measuring?: boolean;
  onMeasuringChange?: (v: boolean) => void;
  /** Measurement lines drawn during comparison. */
  lines?: ComparisonLine[];
  onDrawLine?: (line: ComparisonLine) => void;
  className?: string;
}

export function ComparisonView({
  imageIdA,
  imageIdB,
  initialMode = 'side-by-side',
  mode: controlledMode,
  onModeChange,
  syncViewport = true,
  onSyncViewportChange,
  measuring = false,
  onMeasuringChange,
  lines = [],
  onDrawLine,
  className,
}: ComparisonViewProps) {
  const { t } = useTranslation();

  const MODE_OPTIONS: { value: ComparisonMode; label: string; icon: typeof Columns }[] = [
    { value: 'side-by-side', label: t('comparison.modeSideBySide'), icon: Columns },
    { value: 'overlay', label: t('comparison.modeOverlay'), icon: Layers },
    { value: 'slider', label: t('comparison.modeSlider'), icon: SlidersHorizontal },
  ];

  const [internalMode, setInternalMode] = useState<ComparisonMode>(initialMode);
  const mode = controlledMode ?? internalMode;
  const setMode = (m: ComparisonMode) => {
    setInternalMode(m);
    onModeChange?.(m);
  };
  const [sideOrientation, setSideOrientation] = useState<'horizontal' | 'vertical'>('horizontal');
  const [sliderOrientation, setSliderOrientation] = useState<'horizontal' | 'vertical'>('horizontal');

  if (!imageIdA || !imageIdB) {
    return (
      <div className={cn('flex items-center justify-center bg-black text-white', className)}>
        <div className="text-center">
          <p className="text-lg font-medium">{t('comparison.selectImagesHint')}</p>
          <p className="text-sm text-muted-foreground mt-1">{t('comparison.selectFromTop')}</p>
        </div>
      </div>
    );
  }

  const linesA = lines.filter((l) => l.owner === 'baseline');
  const linesB = lines.filter((l) => l.owner === 'comparison');

  return (
    <div className={cn('flex flex-col w-full h-full', className)}>
      {/* Mode selector */}
      <div className="flex flex-wrap items-center gap-2 p-2 bg-card border-b">
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
              {t('comparison.leftRight')}
            </Button>
            <Button
              variant={sideOrientation === 'vertical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSideOrientation('vertical')}
              className="text-xs h-7"
            >
              {t('comparison.topBottom')}
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
              {t('comparison.horizontal')}
            </Button>
            <Button
              variant={sliderOrientation === 'vertical' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setSliderOrientation('vertical')}
              className="text-xs h-7"
            >
              {t('comparison.vertical')}
            </Button>
          </div>
        )}

        <div className="flex-1" />

        {/* Sync toggle */}
        {mode === 'side-by-side' && onSyncViewportChange && (
          <Button
            variant={syncViewport ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => onSyncViewportChange(!syncViewport)}
            className="text-xs h-7"
            title={t('comparison.syncTitle')}
          >
            {syncViewport ? <Link2 className="h-3.5 w-3.5 mr-1" /> : <Link2Off className="h-3.5 w-3.5 mr-1" />}
            {syncViewport ? t('comparison.sync') : t('comparison.notSync')}
          </Button>
        )}

        {/* Measure toggle */}
        {onMeasuringChange && (
          <Button
            variant={measuring ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onMeasuringChange(!measuring)}
            className="text-xs h-7"
            title={t('comparison.measureTitle')}
          >
            <Ruler className="h-3.5 w-3.5 mr-1" />
            {measuring ? t('comparison.measuringOn') : t('comparison.measuring')}
          </Button>
        )}
      </div>

      {/* Comparison content */}
      <div className="flex-1 overflow-hidden relative">
        {mode === 'side-by-side' && (
          <SideBySideMode
            imageIdA={imageIdA}
            imageIdB={imageIdB}
            orientation={sideOrientation}
            syncViewport={syncViewport}
            measuring={measuring}
            linesA={linesA}
            linesB={linesB}
            onDrawLine={onDrawLine}
          />
        )}
        {mode === 'overlay' && (
          <OverlayMode
            imageIdA={imageIdA}
            imageIdB={imageIdB}
            lines={lines}
            onDrawLine={onDrawLine}
            measuring={measuring}
          />
        )}
        {mode === 'slider' && (
          <SliderMode
            imageIdA={imageIdA}
            imageIdB={imageIdB}
            orientation={sliderOrientation}
            lines={lines}
            onDrawLine={onDrawLine}
            measuring={measuring}
          />
        )}
        {measuring && (
          <div className="absolute bottom-2 right-2 z-10 text-[11px] text-white/80 bg-black/50 px-2 py-1 rounded pointer-events-none">
            {t('comparison.measureHint')}
          </div>
        )}
      </div>
    </div>
  );
}
