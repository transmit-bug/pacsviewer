/**
 * AnnotationToolbar — Cornerstone-native annotation toolbar.
 *
 * Replaces the Canvas 2D AnnotationTools.tsx and MeasurementTools.tsx.
 * All tools use Cornerstone's built-in annotation API with world coordinates.
 *
 * Features:
 * - Measurement tools (Length, Angle, Probe)
 * - ROI tools (Elliptical, Rectangle, Freehand, Spline)
 * - Annotation tools (Arrow, Text)
 * - Annotation list with delete
 * - Export annotations
 */

import { useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import {
  Ruler,
  CornerDownRight,
  Crosshair,
  ArrowUpRight,
  Circle,
  Square,
  Pencil,
  Spline,
  Trash2,
  Download,
  List,
  X,
} from 'lucide-react';

interface AnnotationToolbarProps {
  className?: string;
}

/** Tool groups for the annotation toolbar */
const MEASUREMENT_TOOLS = [
  { id: 'length', icon: Ruler, label: '长度测量' },
  { id: 'angle', icon: CornerDownRight, label: '角度测量' },
  { id: 'probe', icon: Crosshair, label: '像素探针' },
] as const;

const ROI_TOOLS = [
  { id: 'ellipticalROI', icon: Circle, label: '椭圆 ROI' },
  { id: 'rectangleROI', icon: Square, label: '矩形 ROI' },
  { id: 'freehand', icon: Pencil, label: '自由画笔' },
  { id: 'spline', icon: Spline, label: '样条曲线' },
] as const;

const ANNOTATION_TOOLS = [
  { id: 'arrow', icon: ArrowUpRight, label: '箭头标注' },
] as const;

export function AnnotationToolbar({ className }: AnnotationToolbarProps) {
  const { activeTool, setActiveTool } = useViewerStore();
  const { measurements, annotations, removeAnnotation, clearAll } = useMeasurementStore();
  const [showList, setShowList] = useState(false);

  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId === activeTool ? 'pan' : toolId);
  };

  const renderToolGroup = (
    tools: ReadonlyArray<{ id: string; icon: any; label: string }>,
    label: string,
  ) => (
    <div className="space-y-1">
      <p className="text-xs text-muted-foreground px-1">{label}</p>
      <div className="flex flex-wrap gap-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleToolClick(tool.id)}
                >
                  <Icon className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );

  return (
    <div className={className}>
      <div className="flex flex-col gap-3 p-2">
        {/* Tool buttons */}
        {renderToolGroup(MEASUREMENT_TOOLS, '测量')}
        <div className="h-px bg-border" />
        {renderToolGroup(ROI_TOOLS, 'ROI')}
        <div className="h-px bg-border" />
        {renderToolGroup(ANNOTATION_TOOLS, '标注')}

        {/* Actions */}
        <div className="h-px bg-border" />
        <div className="flex gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowList(!showList)}
              >
                <List className="h-4 w-4" />
                {annotations.length > 0 && (
                  <Badge variant="secondary" className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs">
                    {annotations.length}
                  </Badge>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>标注列表</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={clearAll}
                disabled={annotations.length === 0}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>清除全部</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  // Export measurements as JSON
                  const data = JSON.stringify(measurements, null, 2);
                  const blob = new Blob([data], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `measurements-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
                disabled={measurements.length === 0}
              >
                <Download className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>导出测量结果</TooltipContent>
          </Tooltip>
        </div>

        {/* Annotation list panel */}
        {showList && (
          <div className="border rounded-md p-2 max-h-64 overflow-y-auto space-y-1">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-medium">标注列表</p>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowList(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {measurements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">暂无标注</p>
            ) : (
              measurements.map((m) => (
                <div key={m.id} className="flex items-center justify-between gap-2 text-xs p-1 hover:bg-muted rounded">
                  <div className="flex-1 min-w-0">
                    <span className="font-medium">{m.toolName}</span>
                    {m.displayText && (
                      <span className="ml-2 text-muted-foreground">{m.displayText}</span>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => removeAnnotation(m.id)}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
