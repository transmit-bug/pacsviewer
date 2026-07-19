/**
 * ImageToolsToolbar — 图像工具工具栏
 *
 * 提供图像分析工具：
 * - 测量工具：长度、角度、探针
 * - 标注工具：箭头
 * - ROI工具：椭圆、矩形、自由画笔、样条曲线
 * - 操作：列表、导出、清除（折叠显示）
 */

import { useState } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { Button } from '@/components/ui/button';
import { ToolbarGroup } from './ToolbarGroup';
import type { ToolConfig, ToolGroupConfig } from './ToolGroupPopover';
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
  Layers,
} from 'lucide-react';

interface ImageToolsToolbarProps {
  className?: string;
}

/** 图像工具组配置 */
const TOOL_GROUPS: (ToolGroupConfig & { tools: ToolConfig[]; displayMode: 'direct' | 'collapsed' })[] = [
  {
    id: 'measurement',
    icon: Ruler,
    label: '测量',
    displayMode: 'direct',
    tools: [
      { id: 'length', icon: Ruler, label: '长度测量' },
      { id: 'angle', icon: CornerDownRight, label: '角度测量' },
      { id: 'probe', icon: Crosshair, label: '像素探针' },
    ],
  },
  {
    id: 'annotation',
    icon: ArrowUpRight,
    label: '标注',
    displayMode: 'direct',
    tools: [
      { id: 'arrow', icon: ArrowUpRight, label: '箭头标注' },
    ],
  },
  {
    id: 'roi',
    icon: Circle,
    label: 'ROI',
    displayMode: 'direct',
    tools: [
      { id: 'ellipticalROI', icon: Circle, label: '椭圆 ROI' },
      { id: 'rectangleROI', icon: Square, label: '矩形 ROI' },
      { id: 'freehand', icon: Pencil, label: '自由画笔' },
      { id: 'spline', icon: Spline, label: '样条曲线' },
    ],
  },
  {
    id: 'action',
    icon: Layers,
    label: '操作',
    displayMode: 'collapsed',
    tools: [], // 动态生成
  },
];

export function ImageToolsToolbar({ className }: ImageToolsToolbarProps) {
  const { activeTool, setActiveTool } = useViewerStore();
  const { measurements, annotations, removeAnnotation, clearAll } = useMeasurementStore();
  const [showList, setShowList] = useState(false);

  const handleToolClick = (toolId: string) => {
    setActiveTool(toolId === activeTool ? 'pan' : toolId);
  };

  const handleActionClick = (actionId: string) => {
    switch (actionId) {
      case 'list':
        setShowList(!showList);
        break;
      case 'export':
        const data = JSON.stringify(measurements, null, 2);
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `measurements-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        break;
      case 'clear':
        clearAll();
        break;
    }
  };

  // 动态生成操作工具组
  const actionTools: ToolConfig[] = [
    { id: 'list', icon: List, label: '标注列表', badgeCount: annotations.length },
    { id: 'export', icon: Download, label: '导出测量结果', disabled: measurements.length === 0 },
    { id: 'clear', icon: Trash2, label: '清除全部', variant: 'destructive', disabled: annotations.length === 0 },
  ];

  return (
    <div className={className}>
      <div className="flex flex-col gap-1 p-2">
        {TOOL_GROUPS.map((group, index) => (
          <div key={group.id}>
            {index > 0 && <div className="h-px bg-border my-1" />}
            <ToolbarGroup
              groupIcon={group.icon}
              groupLabel={group.label}
              tools={group.id === 'action' ? actionTools : group.tools}
              activeToolId={activeTool}
              onToolClick={group.id === 'action' ? handleActionClick : handleToolClick}
              displayMode={group.displayMode}
              toolbarDirection="vertical"
              badgeCount={group.id === 'action' ? annotations.length : undefined}
            />
          </div>
        ))}

        {/* 标注列表面板 */}
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


