/**
 * ViewportToolbar — 视图操作工具栏
 *
 * 提供视图控制工具：
 * - 导航工具：平移、缩放、窗宽窗位
 * - 变换工具：旋转、翻转、适配窗口
 *
 * 水平工具栏，所有工具直接显示
 */

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

/** 视图工具栏配置 */
const TOOL_GROUPS: (ToolGroupConfig & { tools: ToolConfig[] })[] = [
  {
    id: 'navigation',
    icon: Move,
    label: '导航',
    tools: [
      { id: 'pan', icon: Move, label: '平移' },
      { id: 'zoom', icon: ZoomIn, label: '缩放' },
      { id: 'windowLevel', icon: SlidersHorizontal, label: '窗宽窗位' },
    ],
  },
  {
    id: 'transform',
    icon: RotateCw,
    label: '变换',
    tools: [
      { id: 'rotate', icon: RotateCw, label: '旋转 90°' },
      { id: 'flipH', icon: FlipHorizontal, label: '水平翻转' },
      { id: 'flipV', icon: FlipVertical, label: '垂直翻转' },
      { id: 'fit', icon: Maximize, label: '适配窗口' },
    ],
  },
];

export function ViewportToolbar({ className }: ViewportToolbarProps) {
  const { activeTool, setActiveTool, viewport, setViewport, resetViewport } = useViewerStore();

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


