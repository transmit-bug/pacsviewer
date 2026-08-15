/**
 * 查看器电影级工作台共享小件 (wayfinder #126)。
 * 移植自原型 #123 的 IconBtn/ToolbarGroupSep, 并入生产令牌。
 */
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { LucideIcon } from 'lucide-react';

/** 主视口 id — 与 CornerstoneViewport 默认 viewportId 一致 */
export const MAIN_VIEWPORT_ID = 'viewport-main';

export function IconBtn({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
  side = 'bottom',
}: {
  icon: LucideIcon;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  side?: 'bottom' | 'right';
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          title={label}
          className={cn(
            'ws-tool-btn flex h-8 w-8 items-center justify-center rounded-sm border',
            active
              ? 'border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]'
              : 'border-transparent text-foreground/70 hover:bg-white/10 hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side={side} className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && <kbd className="hud-numeric rounded border border-border bg-black/40 px-1 text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

export function ToolbarGroupSep({ className }: { className?: string }) {
  return <div className={cn('mx-1 h-5 w-px bg-white/10', className)} />;
}

/** bodyPart → 眼别显示 (i18n key) */
export function lateralityKey(bodyPart?: string | null): string {
  switch (bodyPart?.toUpperCase()) {
    case 'OD': return 'viewer.workspace.eyeOD';
    case 'OS': return 'viewer.workspace.eyeOS';
    case 'OU': return 'viewer.workspace.eyeOU';
    default: return 'viewer.workspace.eyeNA';
  }
}

/** 帧位置格式化: -3.0 ~ +3.0 mm */
export function formatMm(value?: number | null): string {
  if (value === undefined || value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(2)} mm`;
}
