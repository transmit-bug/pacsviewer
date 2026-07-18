/**
 * FundusTools — fundus photography analysis tool panel.
 *
 * Tools:
 * - Cup/Disc marker: mark optic disc and cup boundaries
 * - AV ratio: mark arteries and veins for diameter comparison
 * - Lesion marker: classify and mark fundus lesions
 */

import { useState } from 'react';
import {
  useFundusStore,
  LESION_COLORS,
  LESION_LABELS,
  type LesionType,
} from '@/stores/fundusStore';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Circle,
  Minus,
  Target,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface FundusToolsProps {
  className?: string;
}

export function FundusTools({ className }: FundusToolsProps) {
  const {
    activeTool,
    setActiveTool,
    activeLesionType,
    setActiveLesionType,
    cupDiscMeasurements,
    avRatioMeasurements,
    lesions,
    removeLesion,
    clearAll,
  } = useFundusStore();

  const [expanded, setExpanded] = useState(true);

  return (
    <div className={className}>
      <div className="border rounded-md overflow-hidden">
        {/* Header */}
        <button
          className="flex items-center justify-between w-full px-3 py-2 bg-muted/50 hover:bg-muted"
          onClick={() => setExpanded(!expanded)}
        >
          <span className="text-sm font-medium">眼底分析</span>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {expanded && (
          <div className="p-3 space-y-3">
            {/* Cup/Disc tool */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">杯盘比</p>
              <div className="flex gap-1">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant={activeTool === 'cup-disc' ? 'default' : 'outline'}
                      size="sm"
                      className="h-8"
                      onClick={() => setActiveTool(activeTool === 'cup-disc' ? null : 'cup-disc')}
                    >
                      <Circle className="h-3.5 w-3.5 mr-1" />
                      标记视盘/视杯
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>标记视盘和视杯边界，自动计算 C/D 比</TooltipContent>
                </Tooltip>
              </div>

              {/* Cup/Disc results */}
              {cupDiscMeasurements.length > 0 && (
                <div className="mt-2 space-y-1">
                  {cupDiscMeasurements.map((m) => (
                    <div key={m.id} className="text-xs bg-muted/50 rounded p-1.5">
                      <div className="flex justify-between">
                        <span>C/D 比</span>
                        <span className="font-mono font-medium">{m.cdRatio.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>水平/垂直</span>
                        <span className="font-mono">{m.cdRatioHorizontal.toFixed(2)} / {m.cdRatioVertical.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>盘面积</span>
                        <span className="font-mono">{m.discArea.toFixed(2)} mm²</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* AV Ratio tool */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">动静脉比</p>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant={activeTool === 'av-ratio' ? 'default' : 'outline'}
                    size="sm"
                    className="h-8"
                    onClick={() => setActiveTool(activeTool === 'av-ratio' ? null : 'av-ratio')}
                  >
                    <Minus className="h-3.5 w-3.5 mr-1" />
                    标记血管
                  </Button>
                </TooltipTrigger>
                <TooltipContent>标记动脉和静脉，计算 AV 比</TooltipContent>
              </Tooltip>

              {avRatioMeasurements.length > 0 && (
                <div className="mt-2">
                  {avRatioMeasurements.map((m) => (
                    <div key={m.id} className="text-xs bg-muted/50 rounded p-1.5">
                      <div className="flex justify-between">
                        <span>A/V 比</span>
                        <span className="font-mono font-medium">{m.avRatio.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-muted-foreground">
                        <span>动脉/静脉直径</span>
                        <span className="font-mono">
                          {m.arteryAvgDiameter.toFixed(3)} / {m.veinAvgDiameter.toFixed(3)} mm
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Lesion marker */}
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">病灶标记</p>
              <div className="flex flex-wrap gap-1 mb-2">
                {(Object.entries(LESION_LABELS) as [LesionType, string][]).map(([type, label]) => (
                  <Tooltip key={type}>
                    <TooltipTrigger asChild>
                      <Button
                        variant={activeTool === 'lesion' && activeLesionType === type ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 text-xs px-2"
                        onClick={() => {
                          setActiveLesionType(type);
                          setActiveTool(activeTool === 'lesion' && activeLesionType === type ? null : 'lesion');
                        }}
                      >
                        <span
                          className="w-2.5 h-2.5 rounded-full mr-1 shrink-0"
                          style={{ backgroundColor: LESION_COLORS[type] }}
                        />
                        {label}
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>点击标记 {label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>

              {/* Lesion count */}
              {lesions.length > 0 && (
                <div className="text-xs bg-muted/50 rounded p-1.5">
                  <div className="flex items-center justify-between mb-1">
                    <span>病灶统计</span>
                    <Badge variant="secondary" className="text-xs">{lesions.length} 个</Badge>
                  </div>
                  {Object.entries(
                    lesions.reduce((acc, l) => {
                      acc[l.type] = (acc[l.type] || 0) + 1;
                      return acc;
                    }, {} as Record<string, number>)
                  ).map(([type, count]) => (
                    <div key={type} className="flex justify-between text-muted-foreground">
                      <span>{LESION_LABELS[type as LesionType] || type}</span>
                      <span>{count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Clear all */}
            <div className="pt-1 border-t">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-destructive"
                onClick={clearAll}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                清除全部
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
