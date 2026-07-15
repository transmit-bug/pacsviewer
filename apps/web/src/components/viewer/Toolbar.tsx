import { useTranslation } from 'react-i18next';
import { useViewerStore } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import {
  ZoomIn,
  RotateCw,
  FlipHorizontal,
  FlipVertical,
  Maximize,
  Move,
  Ruler,
  Type,
  Square,
  Circle,
  Layers,
  Sliders,
  Columns,
} from 'lucide-react';

interface ToolbarProps {
  className?: string;
}

export function Toolbar({ className }: ToolbarProps) {
  const { t } = useTranslation();
  const { activeTool, setActiveTool, viewport, setViewport, resetViewport } = useViewerStore();

  const tools = [
    { id: 'pan', icon: Move, label: t('viewer.pan') },
    { id: 'zoom', icon: ZoomIn, label: t('viewer.zoom') },
    { id: 'rotate', icon: RotateCw, label: t('viewer.rotate') },
    { id: 'flipH', icon: FlipHorizontal, label: '水平翻转' },
    { id: 'flipV', icon: FlipVertical, label: '垂直翻转' },
    { id: 'fit', icon: Maximize, label: '适配窗口' },
    { id: 'measure', icon: Ruler, label: t('viewer.measure') },
    { id: 'annotate', icon: Type, label: t('viewer.annotate') },
    { id: 'rect', icon: Square, label: '矩形ROI' },
    { id: 'ellipse', icon: Circle, label: '椭圆ROI' },
  ];

  const handleToolClick = (toolId: string) => {
    switch (toolId) {
      case 'fit':
        resetViewport();
        break;
      case 'rotate':
        setViewport({ rotation: (viewport.rotation + 90) % 360 });
        break;
      case 'flipH':
        setViewport({ flipH: !viewport.flipH });
        break;
      case 'flipV':
        setViewport({ flipV: !viewport.flipV });
        break;
      case 'zoom':
        setViewport({ zoom: Math.min(10, viewport.zoom * 1.2) });
        break;
      default:
        setActiveTool(toolId);
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center space-x-1">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = activeTool === tool.id;
          return (
            <Button
              key={tool.id}
              variant={isActive ? 'default' : 'ghost'}
              size="icon"
              onClick={() => handleToolClick(tool.id)}
              title={tool.label}
            >
              <Icon className="h-4 w-4" />
            </Button>
          );
        })}
        
        <div className="mx-2 h-6 w-px bg-border" />
        
        <Button variant="ghost" size="icon" title={t('viewer.layers')}>
          <Layers className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title={t('viewer.filters')}>
          <Sliders className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="icon" title={t('viewer.compare')}>
          <Columns className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
