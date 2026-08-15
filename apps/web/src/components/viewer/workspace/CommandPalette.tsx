/**
 * CommandPalette — ⌘K 命令面板 (wayfinder #126, 决议 #122-4)。
 *
 * 结构沿用原型 #123: 左命令列表 + 右侧悬浮预览 (200ms 交叉淡入)。
 * 命令内容由调用方 (CinematicWorkspace) 以真实数据构建。
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { Command as CommandIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface WsCmd {
  id: string;
  name: string;
  desc: string;
  shortcut?: string;
  run: () => void;
  preview: ReactNode;
}

export interface WsCmdGroup {
  group: string;
  items: WsCmd[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: WsCmdGroup[];
}

export function CommandPalette({ open, onOpenChange, commands }: CommandPaletteProps) {
  const { t } = useTranslation();
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) setHoveredId(null);
  }, [open]);

  const hovered = useMemo(() => {
    for (const g of commands) {
      const hit = g.items.find((i) => i.id === hoveredId);
      if (hit) return hit;
    }
    return null;
  }, [commands, hoveredId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex">
          <Command
            className="min-w-0 flex-1 rounded-none border-0 bg-popover"
            value={hoveredId ?? undefined}
            onValueChange={setHoveredId}
            filter={(value, search) => {
              // cmdk 默认只按 item value (id) 过滤 — 需按中文名称/描述匹配
              if (!search) return 1;
              const q = search.toLowerCase();
              for (const g of commands) {
                const item = g.items.find((i) => i.id === value);
                if (
                  item &&
                  (item.name.toLowerCase().includes(q) ||
                    item.desc.toLowerCase().includes(q) ||
                    item.id.toLowerCase().includes(q))
                ) {
                  return 1;
                }
              }
              return 0;
            }}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <CommandIcon className="h-4 w-4 text-muted-foreground" />
              <CommandInput
                placeholder={t('viewer.workspace.palettePlaceholder')}
                className="h-12 border-0"
                onKeyDown={(e) => {
                  // 输入部分词条后回车: 直接执行第一个匹配命令 (cmdk 多命中时不自动选中)
                  if (e.key === 'Enter') {
                    const q = (e.target as HTMLInputElement).value.trim().toLowerCase();
                    if (q) {
                      for (const g of commands) {
                        const item = g.items.find(
                          (i) =>
                            i.name.toLowerCase().includes(q) ||
                            i.desc.toLowerCase().includes(q) ||
                            i.id.toLowerCase().includes(q)
                        );
                        if (item) {
                          e.preventDefault();
                          item.run();
                          onOpenChange(false);
                          return;
                        }
                      }
                    }
                  }
                }}
              />
              <kbd className="hud-numeric shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
            </div>
            <CommandList className="max-h-[340px]">
              <CommandEmpty>{t('viewer.workspace.paletteEmpty')}</CommandEmpty>
              {commands.map((g) => (
                <CommandGroup key={g.group} heading={g.group}>
                  {g.items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        c.run();
                        onOpenChange(false);
                      }}
                      onMouseEnter={() => setHoveredId(c.id)}
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1">
                        <span className="block text-sm">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{c.desc}</span>
                      </span>
                      {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            <CommandSeparator />
            <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1">↑↓</kbd> {t('viewer.workspace.paletteSelect')}</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1">↵</kbd> {t('viewer.workspace.paletteRun')}</span>
              <span className="ml-auto">{t('viewer.workspace.palettePreviewHint')}</span>
            </div>
          </Command>
          {/* 悬浮预览: 200ms 交叉淡入 (决议 #122-4) */}
          <div className="hidden w-52 shrink-0 border-l bg-[hsl(var(--card))] sm:block">
            <div className="flex h-full flex-col">
              <div className="flex h-9 items-center border-b px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {t('viewer.workspace.preview')}
              </div>
              <div className="flex-1 overflow-hidden p-2.5">
                {hovered ? (
                  <div key={hovered.id} className={cn('ws-preview-in h-full')}>{hovered.preview}</div>
                ) : (
                  <p className="pt-4 text-center text-[11px] text-muted-foreground">
                    {t('viewer.workspace.palettePreviewEmpty')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
