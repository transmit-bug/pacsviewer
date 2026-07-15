import { useViewerStore } from '@/stores/viewerStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Trash2, Download } from 'lucide-react';

interface MeasurementDisplayProps {
  className?: string;
}

export function MeasurementDisplay({ className }: MeasurementDisplayProps) {
  const { annotations, removeAnnotation } = useViewerStore();

  const measurementAnnotations = annotations.filter(a => 
    ['length', 'angle', 'area', 'probe'].includes(a.type)
  );

  const annotationAnnotations = annotations.filter(a => 
    ['arrow', 'text', 'freehand', 'rect', 'ellipse', 'polygon'].includes(a.type)
  );

  const handleExport = () => {
    const data = {
      measurements: measurementAnnotations,
      annotations: annotationAnnotations,
      exportDate: new Date().toISOString(),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `annotations-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getAnnotationIcon = (type: string) => {
    switch (type) {
      case 'length': return '📏';
      case 'angle': return '📐';
      case 'area': return '⬜';
      case 'probe': return '📍';
      case 'arrow': return '➡️';
      case 'text': return '📝';
      case 'freehand': return '✏️';
      case 'rect': return '🔲';
      case 'ellipse': return '⭕';
      case 'polygon': return '⬡';
      default: return '❓';
    }
  };

  const getAnnotationTypeName = (type: string) => {
    switch (type) {
      case 'length': return '长度';
      case 'angle': return '角度';
      case 'area': return '面积';
      case 'probe': return '探针';
      case 'arrow': return '箭头';
      case 'text': return '文字';
      case 'freehand': return '画笔';
      case 'rect': return '矩形';
      case 'ellipse': return '椭圆';
      case 'polygon': return '多边形';
      default: return '未知';
    }
  };

  return (
    <div className={className}>
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">测量与标注</CardTitle>
            <div className="flex space-x-1">
              <Button 
                variant="ghost" 
                size="icon" 
                className="h-6 w-6"
                onClick={handleExport}
                title="导出"
              >
                <Download className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-2">
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
                          {annotation.label && (
                            <p className="text-xs text-muted-foreground">
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
                <span className="ml-1 font-medium">{measurementAnnotations.length}</span>
              </div>
              <div>
                <span className="text-muted-foreground">标注数:</span>
                <span className="ml-1 font-medium">{annotationAnnotations.length}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
