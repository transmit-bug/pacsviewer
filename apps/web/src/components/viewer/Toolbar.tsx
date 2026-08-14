/**
 * ViewportToolbar — 视图操作工具栏
 *
 * 提供视图控制工具：
 * - 导航工具：平移、缩放、窗宽窗位
 * - 变换工具：旋转、翻转、适配窗口
 *
 * 水平工具栏，所有工具直接显示
 */

import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/stores/viewerStore';
import { ToolbarGroup } from './ToolbarGroup';
import type { ToolConfig, ToolGroupConfig } from './ToolGroupPopover';
import {
  Move,
  ZoomIn,
  SlidersHorizontal,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
} from 'lucide-react';

interface ViewportToolbarProps {
  className?: string;
}

export function ViewportToolbar({ className }: ViewportToolbarProps) {
  const { t } = useTranslation();
  const { activeTool, setActiveTool, viewport, setViewport, resetViewport } = useViewerStore();

  /** 视图工具栏配置 */
  const TOOL_GROUPS: (ToolGroupConfig & { tools: ToolConfig[] })[] = [
    {
      id: 'navigation',
      icon: Move,
      label: t('viewer.toolbar.navigation'),
      tools: [
        { id: 'pan', icon: Move, label: t('viewer.toolbar.pan') },
        { id: 'zoom', icon: ZoomIn, label: t('viewer.toolbar.zoom') },
        { id: 'windowLevel', icon: SlidersHorizontal, label: t('viewer.toolbar.windowLevel') },
      ],
    },
    {
      id: 'transform',
      icon: RotateCw,
      label: t('viewer.toolbar.transform'),
      tools: [
        { id: 'rotate', icon: RotateCw, label: t('viewer.toolbar.rotate90') },
        { id: 'flipH', icon: FlipHorizontal, label: t('viewer.toolbar.flipH') },
        { id: 'flipV', icon: FlipVertical, label: t('viewer.toolbar.flipV') },
        { id: 'fit', icon: Maximize, label: t('viewer.toolbar.fit') },
      ],
    },
  ];

  const handleToolClick = (toolId: string) => {
    switch (toolId) {
      case 'rotate':
        setViewport({ rotation: (viewport.rotation + 90) % 360 });
        break;
      case 'flipH':
        setViewport({ flipH: !viewport.flipH });
        break;
      case 'flipV':
        setViewport({ flipV: !viewport.flipV });
        break;
      case 'fit':
        resetViewport();
        break;
      default:
        setActiveTool(toolId);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center space-x-1">
        {TOOL_GROUPS.map((group, index) => (
          <div key={group.id} className="flex items-center">
            {index > 0 && <div className="mx-2 h-6 w-px bg-border" />}
            <ToolbarGroup
              groupIcon={group.icon}
              groupLabel={group.label}
              tools={group.tools}
              activeToolId={activeTool}
              onToolClick={handleToolClick}
              displayMode="direct"
              toolbarDirection="horizontal"
            />
          </div>
        ))}
      </div>
    </div>
  );
}


