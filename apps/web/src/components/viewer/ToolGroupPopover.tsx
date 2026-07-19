/**
 * ToolGroupPopover — 可展开的工具组组件
 *
 * 点击组按钮后，在旁边悬浮展开显示该组的所有工具。
 * 支持：
 * - 显示当前激活的工具
 * - 自动关闭悬浮面板
 * - 可扩展的工具组配置
 */

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface ToolConfig {
  id: string;
  icon: LucideIcon;
  label: string;
  /** 可选：工具的变体样式 */
  variant?: 'default' | 'destructive';
  /** 可选：是否禁用 */
  disabled?: boolean;
  /** 可选：徽章数量 */
  badgeCount?: number;
}

/** 工具组配置 */
export interface ToolGroupConfig {
  id: string;
  icon: LucideIcon;
  label: string;
}

export interface ToolGroupPopoverProps {
  /** 工具组的图标 */
  groupIcon: LucideIcon;
  /** 工具组的标签 */
  groupLabel: string;
  /** 工具组中的工具列表 */
  tools: ToolConfig[];
  /** 当前激活的工具ID */
  activeToolId?: string;
  /** 工具点击回调 */
  onToolClick: (toolId: string) => void;
  /** 可选：显示徽章数量 */
  badgeCount?: number;
  /** 可选：额外的类名 */
  className?: string;
  /** 可选：展开方向，默认 'right' */
  expandDirection?: 'right' | 'left' | 'bottom';
  /** 可选：工具栏布局方向，影响组按钮样式 */
  toolbarDirection?: 'horizontal' | 'vertical';
}

export function ToolGroupPopover({
  groupIcon: GroupIcon,
  groupLabel,
  tools,
  activeToolId,
  onToolClick,
  badgeCount,
  className,
  expandDirection = 'right',
  toolbarDirection = 'vertical',
}: ToolGroupPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  // 检查是否有工具被激活
  const hasActiveTool = tools.some(tool => tool.id === activeToolId);

  const handleToolClick = (toolId: string) => {
    onToolClick(toolId);
    setIsOpen(false);
  };

  const expandPositionClasses = {
    right: 'left-full ml-2 top-0',
    left: 'right-full mr-2 top-0',
    bottom: 'top-full mt-2 left-0',
  };

  // 水平工具栏的展开方向默认为 bottom
  const effectiveExpandDirection = toolbarDirection === 'horizontal' && expandDirection === 'right' ? 'bottom' : expandDirection;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      {/* 组按钮 */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant={hasActiveTool ? 'default' : 'ghost'}
            size="icon"
            className={cn(
              'relative',
              toolbarDirection === 'horizontal' ? 'h-8 w-8' : 'h-8 w-8'
            )}
            onClick={() => setIsOpen(!isOpen)}
          >
            <GroupIcon className="h-4 w-4" />
            {badgeCount !== undefined && badgeCount > 0 && (
              <Badge
                variant="secondary"
                className="absolute -top-1 -right-1 h-4 w-4 p-0 text-xs"
              >
                {badgeCount}
              </Badge>
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{groupLabel}</TooltipContent>
      </Tooltip>

      {/* 展开的工具面板 */}
      {isOpen && (
        <div
          className={cn(
            'absolute z-50 bg-popover border rounded-md shadow-md p-2',
            effectiveExpandDirection === 'bottom' ? 'min-w-[120px]' : 'min-w-[120px]',
            expandPositionClasses[effectiveExpandDirection]
          )}
        >
          <p className="text-xs text-muted-foreground px-1 mb-2">{groupLabel}</p>
          <div className={cn(
            'gap-1',
            effectiveExpandDirection === 'bottom' ? 'flex flex-row flex-wrap' : 'flex flex-col'
          )}>
            {tools.map((tool) => {
              const Icon = tool.icon;
              const isActive = tool.id === activeToolId;
              return (
                <Tooltip key={tool.id}>
                  <TooltipTrigger asChild>
                    <Button
                      variant={isActive ? 'default' : 'ghost'}
                      size="sm"
                      className={cn(
                        'h-8',
                        effectiveExpandDirection === 'bottom' ? 'px-2' : 'justify-start px-2',
                        tool.variant === 'destructive' && 'text-destructive hover:text-destructive'
                      )}
                      onClick={() => handleToolClick(tool.id)}
                      disabled={tool.disabled}
                    >
                      <Icon className="h-4 w-4" />
                      {effectiveExpandDirection !== 'bottom' && (
                        <>
                          <span className="ml-2 text-xs">{tool.label}</span>
                          {tool.badgeCount !== undefined && tool.badgeCount > 0 && (
                            <Badge
                              variant="secondary"
                              className="ml-auto h-4 w-4 p-0 text-xs"
                            >
                              {tool.badgeCount}
                            </Badge>
                          )}
                        </>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent side={effectiveExpandDirection === 'bottom' ? 'bottom' : 'right'}>{tool.label}</TooltipContent>
                </Tooltip>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
