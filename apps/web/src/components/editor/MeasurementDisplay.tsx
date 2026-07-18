import { useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Download, Ruler } from 'lucide-react';
import {
  calculateLength,
  calculateAngle,
  calculateEllipseArea,
  calculateRectangleArea,
  hasValidPixelSpacing,
  type LengthUnit,
} from '@/utils/measurement';

interface MeasurementDisplayProps {
  className?: string;
}

const UNIT_OPTIONS: { value: LengthUnit; label: string }[] = [
  { value: 'mm', label: 'mm' },
  { value: 'μm', label: 'μm' },
  { value: 'cm', label: 'cm' },
];

export function MeasurementDisplay({ className }: MeasurementDisplayProps) {
  const { annotations, removeAnnotation, dicomMetadata } = useViewerStore();
  const { unit, setUnit } = useMeasurementStore();
  const [showCalibrationWarning, setShowCalibrationWarning] = useState(true);

  const pixelSpacing = dicomMetadata?.pixelSpacing ?? null;
  const hasCalibration = hasValidPixelSpacing(pixelSpacing);

  const measurementAnnotations = annotations.filter((a) =>
    ['length', 'angle', 'area', 'probe'].includes(a.type)
  );

  const annotationAnnotations = annotations.filter((a) =>
    ['arrow', 'text', 'freehand', 'rect', 'ellipse', 'polygon'].includes(a.type)
  );

  /**
   * Extract measurement value from annotation geometry
   */
  const getMeasurementValue = (annotation: any): string => {
    const { type, geometry } = annotation;

    try {
      switch (type) {
        case 'length': {
          if (!geometry?.start || !geometry?.end) return '—';
          const result = calculateLength(geometry.start, geometry.end, pixelSpacing, unit);
          return result.displayText;
        }

        case 'angle': {
          if (!geometry?.start || !geometry?.vertex || !geometry?.end) return '—';
          const result = calculateAngle(geometry.start, geometry.vertex, geometry.end);
          return result.displayText;
        }

        case 'area': {
          if (geometry?.radiusX !== undefined && geometry?.radiusY !== undefined) {
            // Ellipse
            const result = calculateEllipseArea(
              geometry.radiusX,
              geometry.radiusY,
              pixelSpacing,
              `${unit}²` as any
            );
            return result.displayText;
          }
          if (geometry?.width !== undefined && geometry?.height !== undefined) {
            // Rectangle
            const result = calculateRectangleArea(
              geometry.width,
              geometry.height,
              pixelSpacing,
              `${unit}²` as any
            );
            return result.displayText;
          }
          return '—';
        }

        case 'probe': {
          if (geometry?.position) {
            return `(${geometry.position.x.toFixed(0)}, ${geometry.position.y.toFixed(0)})`;
          }
          return '—';
        }

        default:
          return '—';
      }
    } catch {
      return '—';
    }
  };

  const handleExport = () => {
    const data = {
      measurements: measurementAnnotations.map((a) => ({
        ...a,
        value: getMeasurementValue(a),
      })),
      annotations: annotationAnnotations,
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

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'length':
        return '📏';
      case 'angle':
        return '📐';
      case 'area':
        return '⬜';
      case 'probe':
        return '📍';
      case 'arrow':
        return '➡️';
      case 'text':
        return '📝';
      case 'freehand':
        return '✏️';
      case 'rect':
        return '🔲';
      case 'ellipse':
        return '⭕';
      case 'polygon':
        return '⬡';
      default:
        return '❓';
    }
  };

  const getAnnotationTypeName = (type: string) => {
    switch (type) {
      case 'length':
        return '长度';
      case 'angle':
        return '角度';
      case 'area':
        return '面积';
      case 'probe':
        return '探针';
      case 'arrow':
        return '箭头';
      case 'text':
        return '文字';
      case 'freehand':
        return '画笔';
      case 'rect':
        return '矩形';
      case 'ellipse':
        return '椭圆';
      case 'polygon':
        return '多边形';
      default:
        return '未知';
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              测量与标注
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
                    title={`切换单位: ${opt.label}`}
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
                title="导出测量数据"
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
          {/* Calibration warning */}
          {!hasCalibration && showCalibrationWarning && measurementAnnotations.length > 0 && (
            <div className="mb-2 p-1.5 rounded bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-600 dark:text-yellow-400">
              <div className="flex items-center justify-between">
                <span>⚠️ 无 PixelSpacing 数据，显示像素值</span>
                <button
                  className="hover:opacity-70"
                  onClick={() => setShowCalibrationWarning(false)}
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {annotations.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-4">
              暂无测量或标注
            </p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {/* Measurements */}
              {measurementAnnotations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-muted-foreground mb-1">
                    测量
                  </h5>
                  {measurementAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-center justify-between p-1.5 rounded bg-muted/50 mb-1"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">
                          {getAnnotationIcon(annotation.type)}
                        </span>
                        <div>
                          <p className="text-xs font-medium">
                            {getAnnotationTypeName(annotation.type)}
                          </p>
                          <p className="text-xs font-mono text-primary">
                            {getMeasurementValue(annotation)}
                          </p>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => removeAnnotation(annotation.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {/* Annotations */}
              {annotationAnnotations.length > 0 && (
                <div>
                  <h5 className="text-xs font-medium text-muted-foreground mb-1">
                    标注
                  </h5>
                  {annotationAnnotations.map((annotation) => (
                    <div
                      key={annotation.id}
                      className="flex items-center justify-between p-1.5 rounded bg-muted/50 mb-1"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-sm">
                          {getAnnotationIcon(annotation.type)}
                        </span>
                        <div>
                          <p className="text-xs font-medium">
                            {getAnnotationTypeName(annotation.type)}
                          </p>
                          {annotation.label && (
                            <p className="text-xs text-muted-foreground truncate max-w-[120px]">
                              {annotation.label}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5"
                        onClick={() => removeAnnotation(annotation.id)}
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
                <span className="text-muted-foreground">测量数:</span>
                <span className="ml-1 font-medium">
                  {measurementAnnotations.length}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">标注数:</span>
                <span className="ml-1 font-medium">
                  {annotationAnnotations.length}
                </span>
              </div>
              {hasCalibration && (
                <div className="col-span-2 pt-1 border-t">
                  <span className="text-muted-foreground">校准:</span>
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
