/**
 * WorkspaceToolbar — 浮动底条工具条 (wayfinder #126, #123 决议修订:
 * 工具条 = 浮动底条, 可折叠成左侧垂直图标窄条)。
 *
 * 分组: 导航 / 标注 / 测量 / 窗口预设(真实 Cornerstone VOI) /
 *       导出 CSV(#130 保留) / 全屏。
 */
import { useTranslation } from 'react-i18next';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useViewerStore } from '@/stores/viewerStore';
import { useWorkspaceStore, WS_WL_PRESETS } from '@/stores/workspaceStore';
import { measurementApi } from '@/services/api';
import { downloadBlob, measurementsCsvFilename } from '@/utils/download';
import { IconBtn, ToolbarGroupSep } from './workspaceShared';
import {
  Hand,
  ZoomIn,
  SlidersHorizontal,
  ArrowUpRight,
  Circle,
  Ruler,
  CornerDownRight,
  Crosshair,
  FileSpreadsheet,
  Maximize,
  Minimize,
  ChevronRight,
  Frame,
  PenTool,
} from 'lucide-react';

interface WorkspaceToolbarProps {
  studyId?: string;
}

export function WorkspaceToolbar({ studyId }: WorkspaceToolbarProps) {
  const { t } = useTranslation();
  const { activeTool, setActiveTool, setViewport } = useViewerStore();
  const { toolbarCollapsed, toggleToolbarCollapsed, isFullscreen } = useWorkspaceStore();

  const applyPreset = (id: string) => {
    const p = WS_WL_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setViewport({ windowWidth: p.ww, windowLevel: p.wl });
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  const exportCsv = () => {
    if (!studyId) return;
    measurementApi
      .exportCsv({ studyIds: [studyId] })
      .then((response) => downloadBlob(response as unknown as Blob, measurementsCsvFilename()))
      .catch((error) => console.error('Failed to export measurements CSV:', error));
  };

  const selectTool = (id: string) => setActiveTool(id === activeTool ? 'pan' : id);

  const navTools = [
    { id: 'pan', icon: Hand, label: t('viewer.toolbar.pan'), shortcut: 'V' },
    { id: 'zoom', icon: ZoomIn, label: t('viewer.toolbar.zoom'), shortcut: 'Z' },
    { id: 'windowLevel', icon: SlidersHorizontal, label: t('viewer.toolbar.windowLevel'), shortcut: 'W' },
  ];
  const annoTools = [
    { id: 'arrow', icon: ArrowUpRight, label: t('viewer.toolbar.arrow'), shortcut: 'E' },
    { id: 'ellipticalROI', icon: Circle, label: t('viewer.toolbar.ellipticalROI') },
    { id: 'rectangleROI', icon: Circle, label: t('viewer.toolbar.rectangleROI') },
  ];
  const measureTools = [
    { id: 'length', icon: Ruler, label: t('viewer.toolbar.length'), shortcut: 'L' },
    { id: 'angle', icon: CornerDownRight, label: t('viewer.toolbar.angle'), shortcut: 'A' },
    { id: 'probe', icon: Crosshair, label: t('viewer.toolbar.probe'), shortcut: 'P' },
  ];

  if (toolbarCollapsed) {
    // 垂直图标窄条 (决议 #123 修订: 折叠形态)
    const rail = [
      { icon: Hand, label: t('viewer.toolbar.pan'), onClick: () => setActiveTool('pan') },
      { icon: PenTool, label: t('viewer.toolbar.annotation'), onClick: () => setActiveTool('arrow') },
      { icon: Ruler, label: t('viewer.toolbar.measurement'), onClick: () => setActiveTool('length') },
      { icon: SlidersHorizontal, label: t('viewer.workspace.wlPresets'), onClick: () => applyPreset(WS_WL_PRESETS[0].id) },
    ];
    return (
      <div className="glass-surface absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-md border border-white/10 p-1.5 shadow-lg">
        {rail.map((r) => (
          <IconBtn key={r.label} icon={r.icon} label={r.label} onClick={r.onClick} />
        ))}
        <ToolbarGroupSep />
        <IconBtn icon={Frame} label={t('viewer.workspace.expandToolbar')} onClick={toggleToolbarCollapsed} />
      </div>
    );
  }

  return (
    <div className="glass-surface absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 shadow-lg">
      <span className="pr-1 text-[10px] font-medium tracking-wide text-white/40">{t('viewer.workspace.tools')}</span>

      {/* 导航 */}
      <div className="flex items-center gap-0.5">
        {navTools.map((tool) => (
          <IconBtn
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.id}
            onClick={() => selectTool(tool.id)}
          />
        ))}
      </div>
      <ToolbarGroupSep />

      {/* 标注 */}
      <div className="flex items-center gap-0.5">
        {annoTools.map((tool) => (
          <IconBtn
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.id}
            onClick={() => selectTool(tool.id)}
          />
        ))}
      </div>
      <ToolbarGroupSep />

      {/* 测量 */}
      <div className="flex items-center gap-0.5">
        {measureTools.map((tool) => (
          <IconBtn
            key={tool.id}
            icon={tool.icon}
            label={tool.label}
            shortcut={tool.shortcut}
            active={activeTool === tool.id}
            onClick={() => selectTool(tool.id)}
          />
        ))}
      </div>
      <ToolbarGroupSep />

      {/* 窗口预设 → 真实 Cornerstone VOI */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="ws-tool-btn flex h-8 items-center gap-1.5 rounded-sm border border-transparent px-2 text-[11px] text-foreground/70 hover:bg-white/10 hover:text-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            {t('viewer.workspace.wlPresets')}
            <ChevronRight className="h-3 w-3 -rotate-90 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-48">
          <DropdownMenuLabel className="text-[11px]">{t('viewer.workspace.wlPresets')}</DropdownMenuLabel>
          {WS_WL_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => applyPreset(p.id)} className="flex items-center justify-between">
              <span className="text-xs">{t(p.nameKey)}</span>
              <span className="hud-numeric text-[10px] text-muted-foreground">WW {p.ww} · WL {p.wl}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
            {t('viewer.workspace.presetDrivesVoi')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarGroupSep />

      {/* 导出 CSV (#130 保留) */}
      <IconBtn
        icon={FileSpreadsheet}
        label={t('viewer.toolbar.exportCsv')}
        onClick={exportCsv}
      />
      <ToolbarGroupSep />

      {/* 全屏 */}
      <IconBtn
        icon={isFullscreen ? Minimize : Maximize}
        label={isFullscreen ? t('viewer.workspace.exitFullscreen') : t('viewer.workspace.fullscreen')}
        shortcut="F"
        onClick={toggleFullscreen}
      />

      <ToolbarGroupSep />
      <IconBtn icon={Frame} label={t('viewer.workspace.collapseToolbar')} onClick={toggleToolbarCollapsed} />
    </div>
  );
}
