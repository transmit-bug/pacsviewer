/**
 * Toolbar — Cornerstone.js tool selection bar.
 *
 * Provides the 6 tools specified in the PRD:
 * Zoom, Pan, WindowLevel, Length, Angle, Probe
 */

import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import {
  Move,
  ZoomIn,
  SlidersHorizontal,
  Ruler,
  CornerDownRight,
  Crosshair,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
} from 'lucide-react';

interface ToolbarProps {
  className?: string;
}

const TOOLS = [
  { id: 'pan', icon: Move, labelKey: 'viewer.pan', label: '平移' },
  { id: 'zoom', icon: ZoomIn, labelKey: 'viewer.zoom', label: '缩放' },
  { id: 'windowLevel', icon: SlidersHorizontal, labelKey: 'viewer.windowLevel', label: '窗宽窗位' },
  { id: 'length', icon: Ruler, labelKey: 'viewer.measure', label: '长度测量' },
  { id: 'angle', icon: CornerDownRight, labelKey: 'viewer.angle', label: '角度测量' },
  { id: 'probe', icon: Crosshair, labelKey: 'viewer.probe', label: '像素探针' },
] as const;

export function Toolbar({ className }: ToolbarProps) {
  const { t } = useTranslation();
  const { activeTool, setActiveTool, viewport, setViewport, resetViewport } = useViewerStore();

  const handleToolClick = (toolId: string) => {
    if (toolId === 'fit') {
      resetViewport();
      return;
    }
    setActiveTool(toolId);
  };

  return (
    <div className={className}>
      <div className="flex items-center space-x-1">
        {TOOLS.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          const label = t(tool.labelKey, tool.label);
          return (
            <Button
              key={tool.id}
              variant={isActive ? 'default' : 'ghost'}
              size="icon"
              onClick={() => handleToolClick(tool.id)}
              title={label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}

        <div className="mx-2 h-6 w-px bg-border" />

        {/* Viewport operations */}
        <Button
          variant="ghost"
          size="icon"
          title="旋转 90°"
          onClick={() => setViewport({ rotation: (viewport.rotation + 90) % 360 })}
        >
          <RotateCw className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="水平翻转"
          onClick={() => setViewport({ flipH: !viewport.flipH })}
        >
          <FlipHorizontal className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="垂直翻转"
          onClick={() => setViewport({ flipV: !viewport.flipV })}
        >
          <FlipVertical className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          title="适配窗口"
          onClick={resetViewport}
        >
          <Maximize className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
