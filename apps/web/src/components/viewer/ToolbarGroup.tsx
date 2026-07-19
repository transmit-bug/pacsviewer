/**
 * ToolbarGroup — 统一的工具栏组组件
 *
 * 支持两种显示模式：
 * 1. 直接显示：工具按钮直接显示在工具栏上
 * 2. 折叠显示：点击组按钮后展开显示工具
 *
 * 适用于水平和垂直工具栏
 */

import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { ToolGroupPopover } from './ToolGroupPopover';
import type { ToolConfig } from './ToolGroupPopover';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

export interface ToolbarGroupProps {
  /** 工具组的图标（用于折叠模式） */
  groupIcon: LucideIcon;
  /** 工具组的标签 */
  groupLabel: string;
  /** 工具组中的工具列表 */
  tools: ToolConfig[];
  /** 当前激活的工具ID */
  activeToolId?: string;
  /** 工具点击回调 */
  onToolClick: (toolId: string) => void;
  /** 显示模式：'direct' 直接显示 | 'collapsed' 折叠显示 */
  displayMode?: 'direct' | 'collapsed';
  /** 可选：显示徽章数量 */
  badgeCount?: number;
  /** 可选：工具栏方向 */
  toolbarDirection?: 'horizontal' | 'vertical';
  /** 可选：额外的类名 */
  className?: string;
}

export function ToolbarGroup({
  groupIcon,
  groupLabel,
  tools,
  activeToolId,
  onToolClick,
  displayMode = 'direct',
  badgeCount,
  toolbarDirection = 'vertical',
  className,
}: ToolbarGroupProps) {
  if (displayMode === 'collapsed') {
    return (
      <ToolGroupPopover
        groupIcon={groupIcon}
        groupLabel={groupLabel}
        tools={tools}
        activeToolId={activeToolId}
        onToolClick={onToolClick}
        badgeCount={badgeCount}
        toolbarDirection={toolbarDirection}
        className={className}
      />
    );
  }

  // 直接显示模式
  return (
    <div className={cn(
      'space-y-1',
      toolbarDirection === 'horizontal' && 'flex items-center space-x-1 space-y-0',
      className
    )}>
      {toolbarDirection === 'vertical' && (
        <p className="text-xs text-muted-foreground px-1">{groupLabel}</p>
      )}
      <div className={cn(
        'gap-1',
        toolbarDirection === 'horizontal' ? 'flex' : 'flex flex-wrap'
      )}>
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isActive = tool.id === activeToolId;
          return (
            <Tooltip key={tool.id}>
              <TooltipTrigger asChild>
                <Button
                  variant={isActive ? 'default' : 'ghost'}
                  size="icon"
                  className={cn(
                    'h-8 w-8',
                    tool.variant === 'destructive' && 'text-destructive hover:text-destructive'
                  )}
                  onClick={() => onToolClick(tool.id)}
                  disabled={tool.disabled}
                >
                  <Icon className="h-4 w-4" />
                  {tool.badgeCount !== undefined && tool.badgeCount > 0 && (
                    <span className="absolute -top-1 -right-1 h-4 w-4 flex items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px]">
                      {tool.badgeCount}
                    </span>
                  )}
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tool.label}</TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}
