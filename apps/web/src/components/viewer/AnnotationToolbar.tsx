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
import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { measurementApi } from '@/services/api';
import { downloadBlob, measurementsCsvFilename } from '@/utils/download';
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
  FileSpreadsheet,
  List,
  X,
  Layers,
} from 'lucide-react';

interface ImageToolsToolbarProps {
  className?: string;
  /** Current study id — used to scope the measurements CSV export. */
  studyId?: string;
}

export function ImageToolsToolbar({ className, studyId }: ImageToolsToolbarProps) {
  const { t } = useTranslation();

  /** 图像工具组配置 */
  const TOOL_GROUPS: (ToolGroupConfig & { tools: ToolConfig[]; displayMode: 'direct' | 'collapsed' })[] = [
    {
      id: 'measurement',
      icon: Ruler,
      label: t('viewer.toolbar.measurement'),
      displayMode: 'direct',
      tools: [
        { id: 'length', icon: Ruler, label: t('viewer.toolbar.length') },
        { id: 'angle', icon: CornerDownRight, label: t('viewer.toolbar.angle') },
        { id: 'probe', icon: Crosshair, label: t('viewer.toolbar.probe') },
      ],
    },
    {
      id: 'annotation',
      icon: ArrowUpRight,
      label: t('viewer.toolbar.annotation'),
      displayMode: 'direct',
      tools: [
        { id: 'arrow', icon: ArrowUpRight, label: t('viewer.toolbar.arrow') },
      ],
    },
    {
      id: 'roi',
      icon: Circle,
      label: 'ROI',
      displayMode: 'direct',
      tools: [
        { id: 'ellipticalROI', icon: Circle, label: t('viewer.toolbar.ellipticalROI') },
        { id: 'rectangleROI', icon: Square, label: t('viewer.toolbar.rectangleROI') },
        { id: 'freehand', icon: Pencil, label: t('viewer.toolbar.freehand') },
        { id: 'spline', icon: Spline, label: t('viewer.toolbar.spline') },
      ],
    },
    {
      id: 'action',
      icon: Layers,
      label: t('viewer.toolbar.actions'),
      displayMode: 'collapsed',
      tools: [], // 动态生成
    },
  ];

  const { activeTool, setActiveTool } = useViewerStore();
  const { measurements, annotations, removeAnnotation, clearAll } = useMeasurementStore();
  const [showList, setShowList] = useState(false);

  /** 图像工具组配置 */
  const TOOL_GROUPS: (ToolGroupConfig & { tools: ToolConfig[]; displayMode: 'direct' | 'collapsed' })[] = [
    {
      id: 'measurement',
      icon: Ruler,
      label: t('viewer.toolbar.measurement'),
      displayMode: 'direct',
      tools: [
        { id: 'length', icon: Ruler, label: t('viewer.toolbar.length') },
        { id: 'angle', icon: CornerDownRight, label: t('viewer.toolbar.angle') },
        { id: 'probe', icon: Crosshair, label: t('viewer.toolbar.probe') },
      ],
    },
    {
      id: 'annotation',
      icon: ArrowUpRight,
      label: t('viewer.toolbar.annotation'),
      displayMode: 'direct',
      tools: [
        { id: 'arrow', icon: ArrowUpRight, label: t('viewer.toolbar.arrow') },
      ],
    },
    {
      id: 'roi',
      icon: Circle,
      label: 'ROI',
      displayMode: 'direct',
      tools: [
        { id: 'ellipticalROI', icon: Circle, label: t('viewer.toolbar.ellipticalROI') },
        { id: 'rectangleROI', icon: Square, label: t('viewer.toolbar.rectangleROI') },
        { id: 'freehand', icon: Pencil, label: t('viewer.toolbar.freehand') },
        { id: 'spline', icon: Spline, label: t('viewer.toolbar.spline') },
      ],
    },
    {
      id: 'action',
      icon: Layers,
      label: t('viewer.toolbar.actions'),
      displayMode: 'collapsed',
      tools: [], // 动态生成
    },
  ];

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
      case 'exportCsv':
        if (!studyId) return;
        measurementApi
          .exportCsv({ studyIds: [studyId] })
          .then((response) => downloadBlob(response as unknown as Blob, measurementsCsvFilename()))
          .catch((error) => console.error('Failed to export measurements CSV:', error));
        break;
      case 'clear':
        clearAll();
        break;
    }
  };

  // 动态生成操作工具组
  const actionTools: ToolConfig[] = [
    { id: 'list', icon: List, label: t('viewer.toolbar.annotationList'), badgeCount: annotations.length },
    { id: 'export', icon: Download, label: t('viewer.toolbar.exportMeasurements'), disabled: measurements.length === 0 },
    { id: 'exportCsv', icon: FileSpreadsheet, label: t('viewer.toolbar.exportCsv'), disabled: !studyId },
    { id: 'clear', icon: Trash2, label: t('viewer.toolbar.clearAll'), variant: 'destructive', disabled: annotations.length === 0 },

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
              <p className="text-xs font-medium">{t('viewer.toolbar.annotationList')}</p>
              <Button variant="ghost" size="icon" className="h-5 w-5" onClick={() => setShowList(false)}>
                <X className="h-3 w-3" />
              </Button>
            </div>
            {measurements.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-2">{t('viewer.toolbar.noAnnotations')}</p>
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


