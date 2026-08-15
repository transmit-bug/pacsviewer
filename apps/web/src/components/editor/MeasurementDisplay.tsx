import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useMeasurementSync, highlightAnnotation, removeCsAnnotation } from '@/hooks/useMeasurementSync';
import { MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Ruler } from 'lucide-react';
import { hasValidPixelSpacing } from '@/utils/measurement';
import { cn } from '@/lib/utils';

interface MeasurementDisplayProps {
  className?: string;
}

const UNIT_OPTIONS: { value: 'mm' | 'μm' | 'cm'; label: string }[] = [
  { value: 'mm', label: 'mm' },
  { value: 'μm', label: 'μm' },
  { value: 'cm', label: 'cm' },
];

/** Whether a Cornerstone tool produces a numeric measurement (vs. plain annotation). */
const MEASUREMENT_TOOLS = new Set(['Length', 'Angle', 'EllipticalROI', 'RectangleROI', 'Probe', 'Bidirectional']);

const TOOL_LABEL_KEYS: Record<string, string> = {
  Length: 'viewer.measurement.toolLength',
  Angle: 'viewer.measurement.toolAngle',
  EllipticalROI: 'viewer.measurement.toolEllipse',
  RectangleROI: 'viewer.measurement.toolRect',
  Probe: 'viewer.measurement.toolProbe',
  Bidirectional: 'viewer.measurement.toolBiDir',
  ArrowAnnotate: 'viewer.measurement.toolArrow',
};

/** Convert a CS display value (mm / mm²) to the selected unit preference. */
function convertDisplay(displayText: string, value: number | null, fromUnit: string, toUnit: 'mm' | 'μm' | 'cm'): string {
  if (value === null || toUnit === 'mm') return displayText;
  const isArea = /²/.test(fromUnit);
  let factor = 0;
  if (!isArea) {
    factor = toUnit === 'μm' ? 1000 : toUnit === 'cm' ? 0.1 : 1;
  } else {
    factor = toUnit === 'μm' ? 1_000_000 : toUnit === 'cm' ? 0.01 : 1;
  }
  const converted = value * factor;
  const unit = isArea
    ? toUnit === 'μm' ? 'μm²' : toUnit === 'cm' ? 'cm²' : 'mm²'
    : toUnit === 'μm' ? 'μm' : toUnit === 'cm' ? 'cm' : 'mm';
  return `${converted.toFixed(converted >= 1000 ? 0 : 2)} ${unit}`;
}

export function MeasurementDisplay({ className }: MeasurementDisplayProps) {
  const { t } = useTranslation();

  // Keep the store populated from Cornerstone's live annotation state.
  useMeasurementSync(MAIN_VIEWPORT_ID);

  const { annotations, measurements, unit, setUnit, removeAnnotation } = useMeasurementStore();
  const { dicomMetadata } = useViewerStore();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCalibrationWarning, setShowCalibrationWarning] = useState(true);

  const pixelSpacing = dicomMetadata?.pixelSpacing ?? null;
  const hasCalibration = hasValidPixelSpacing(pixelSpacing);

  // Measurements = Cornerstone tools with numeric values; the rest are plain annotations.
  const measurementAnnotations = measurements.filter((m) => MEASUREMENT_TOOLS.has(m.toolName));
  const otherAnnotations = annotations.filter((a) => !MEASUREMENT_TOOLS.has(a.toolName));

  const handleExport = () => {
    const data = {
      measurements: measurementAnnotations,
      annotations: otherAnnotations,
      unit,
      pixelSpacing,
      exportDate: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `measurements-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSelect = (id: string) => {
    const next = selectedId === id ? null : id;
    setSelectedId(next);
    highlightAnnotation(MAIN_VIEWPORT_ID, id, !!next);
  };

  const handleDelete = (id: string) => {
    // #132: 变更前记录 pre-op (列表删除标注/测量 = 一次完整操作, 撤销恢复画布 + 列表)。
    useHistoryStore.getState().recordBefore();
    removeCsAnnotation(MAIN_VIEWPORT_ID, id);
    removeAnnotation(id);
    if (selectedId === id) setSelectedId(null);
  };

  const toolLabel = (toolName: string): string => {
    const key = TOOL_LABEL_KEYS[toolName];
    return key ? t(key) : toolName;
  };

  return (
    <div className={cn(className)}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {t('viewer.measurement.title')}
            </CardTitle>
            <div className="flex items-center space-x-1">
              {/* Unit selector */}
              <div className="flex rounded-md border overflow-hidden">
                {UNIT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    className={`px-1.5 py-0.5 text-xs transition-colors ${
                      unit === opt.value
                        ? 'bg-primary text-primary-foreground'
                        : 'hover:bg-muted'
                    }`}
                    onClick={() => setUnit(opt.value)}
                    title={t('viewer.measurement.switchUnit', { unit: opt.label })}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={handleExport}
                title={t('viewer.measurement.export')}
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {/* Calibration warning */}
          {!hasCalibration && showCalibrationWarning && annotations.length > 0 && (
            <div className="mb-2 p-1.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
              <div className="flex items-center justify-between">
                <span>{t('viewer.measurement.noPixelSpacing')}</span>
                <button
                  className="hover:opacity-70"
                  onClick={() => setShowCalibrationWarning(false)}
                  aria-label={t('common.close')}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              {t('viewer.measurement.empty')}
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {/* Measurements */}
              {measurementAnnotations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-muted-foreground mb-1">
                    {t('viewer.measurement.measurements')}
                  </h5>
                  {measurementAnnotations.map((m) => (
                    <div
                      key={m.id}
                      className={cn(
                        'flex items-center justify-between p-1.5 rounded mb-1 cursor-pointer transition-colors',
                        selectedId === m.id ? 'bg-primary/10 ring-1 ring-primary/40' : 'bg-muted/50 hover:bg-muted'
                      )}
                      onClick={() => handleSelect(m.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <div>
                          <p className="text-xs font-medium">{toolLabel(m.toolName)}</p>
                          <p className="text-xs font-mono text-primary">
                            {convertDisplay(m.displayText, m.value, m.unit, unit)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(m.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Annotations */}
              {otherAnnotations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-muted-foreground mb-1">
                    {t('viewer.measurement.annotations')}
                  </h5>
                  {otherAnnotations.map((ann) => (
                    <div
                      key={ann.id}
                      className={cn(
                        'flex items-center justify-between p-1.5 rounded bg-muted/50 mb-1 cursor-pointer transition-colors',
                        selectedId === ann.id ? 'bg-primary/10 ring-1 ring-primary/40' : 'hover:bg-muted'
                      )}
                      onClick={() => handleSelect(ann.id)}
                    >
                      <div className="flex items-center space-x-2">
                        <div>
                          <p className="text-xs font-medium">{toolLabel(ann.toolName)}</p>
                          {ann.data?.label && (
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {ann.data.label}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(ann.id);
                        }}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Statistics */}
      {annotations.length > 0 && (
        <Card className="mt-2">
          <CardContent className="p-2">
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">{t('viewer.measurement.countMeasurements')}:</span>
                <span className="ml-1 font-medium">{measurementAnnotations.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">{t('viewer.measurement.countAnnotations')}:</span>
                <span className="ml-1 font-medium">{otherAnnotations.length}</span>
              </div>
              {hasCalibration && (
                <div className="col-span-2 pt-1 border-t">
                  <span className="text-muted-foreground">{t('viewer.measurement.calibration')}:</span>
                  <span className="ml-1 font-mono text-green-600 dark:text-green-400">
                    ✓ {pixelSpacing![0].toFixed(3)} × {pixelSpacing![1].toFixed(3)} mm/px
                  </span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
