/**
 * WorkspaceHud — 图内 HUD 浮层 (wayfinder #126, 决议 #122-2)。
 *
 * 上缘: 玻璃条承载临床信息 (患者/检查/模态/眼别/序列 + ⌘K 提示)。
 * 角落: 等宽数字 + 深色描边 (GSPS OUTLINED 语义) — 左下 窗宽窗位/缩放/预设,
 *       右下 帧号/比例尺。
 * 数据全部来自真实 store (viewerStore) — 非原型假数据。
 */
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { useViewerStore } from '@/stores/viewerStore';
import { useWorkspaceStore, matchPreset } from '@/stores/workspaceStore';
import { ScaleBar } from '@/components/viewer/ScaleBar';
import { Command as CommandIcon, Minimize, Maximize } from 'lucide-react';

export interface HudModel {
  patientName: string;
  patientGender?: string;
  patientAge?: string | null;
  patientMrn?: string;
  studyDate?: string;
  studyDesc?: string;
  physicianName?: string;
  modality: string;
  seriesName?: string;
  eyeLabelKey: string; // i18n key already resolved by caller
}

interface WorkspaceHudProps {
  model: HudModel;
  hasFrames: boolean;
  frameCount: number;
  /** 当前帧的扫描位置 (mm, 来自 dicomFrames 元数据) */
  frameSliceLocation?: number;
  /** 主视口的 viewportId — 用于校准比例尺 (worldToCanvas 测量) */
  viewportId?: string;
  onOpenPalette: () => void;
}

export function WorkspaceHud({ model, hasFrames, frameCount, frameSliceLocation, viewportId, onOpenPalette }: WorkspaceHudProps) {
  const { t } = useTranslation();
  const { viewport, currentFrame } = useViewerStore();
  const { isFullscreen } = useWorkspaceStore();

  const preset = matchPreset(viewport.windowWidth, viewport.windowLevel);
  const zoomPct = Math.round(viewport.zoom * 100);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  };

  return (
    <>
      {/* ── 上缘: 临床信息玻璃条 ── */}
      <div className="glass-surface pointer-events-auto absolute inset-x-3 top-3 z-20 flex h-11 items-center gap-3 rounded-md border border-white/10 px-3 shadow-lg">
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-[13px] font-medium text-white">{model.patientName}</span>
          <span className="ws-hud-text shrink-0 text-[11px] text-white/70">
            {model.patientGender ? t(`viewer.workspace.gender.${model.patientGender}`) : ''}
            {model.patientAge ? ` · ${model.patientAge}` : ''}
          </span>
          <span className="ws-hud-text hud-numeric hidden shrink-0 text-[11px] text-white/60 md:inline">{model.patientMrn}</span>
        </div>
        <div className="h-4 w-px shrink-0 bg-white/15" />
        <div className="flex min-w-0 items-center gap-2">
          <span className="ws-hud-text hud-numeric shrink-0 text-[11px] text-white/80">{model.studyDate}</span>
          <span className="ws-hud-text hidden truncate text-[11px] text-white/70 lg:inline">{model.studyDesc}</span>
          <span className="ws-hud-text hidden shrink-0 text-[11px] text-white/50 xl:inline">{model.physicianName}</span>
        </div>
        <div className="h-4 w-px shrink-0 bg-white/15" />
        <div className="flex min-w-0 items-center gap-2">
          <Badge variant="default" className="h-4 shrink-0 px-1.5 text-[9px]">{model.modality}</Badge>
          <span className="ws-hud-text shrink-0 text-[11px] text-white/75">{t(model.eyeLabelKey)}</span>
          <span className="ws-hud-text hidden truncate text-[11px] text-white/55 lg:inline">{model.seriesName}</span>
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          <button
            onClick={onOpenPalette}
            className="ws-tool-btn flex h-6 items-center gap-1 rounded-sm border border-white/15 px-1.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
          >
            <CommandIcon className="h-3 w-3" /> ⌘K
          </button>
          <button
            onClick={toggleFullscreen}
            className="ws-tool-btn flex h-6 items-center justify-center rounded-sm border border-white/15 px-1.5 text-white/70 hover:bg-white/10 hover:text-white"
            title={t('viewer.workspace.fullscreen')}
          >
            {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
          </button>
        </div>
      </div>

      {/* ── 左下: 窗宽窗位 / 缩放 / 预设 ── */}
      <div className="glass-surface pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-md border border-white/10 px-2.5 py-1.5 shadow-lg">
        <span className="hud-numeric ws-hud-text text-[11px] text-white/90">
          WW <span className="text-teal-300">{Math.round(viewport.windowWidth)}</span> · WL <span className="text-teal-300">{Math.round(viewport.windowLevel)}</span>
        </span>
        <span className="h-3 w-px bg-white/15" />
        <span className="hud-numeric ws-hud-text text-[11px] text-white/90">{zoomPct}%</span>
        {preset && (
          <>
            <span className="h-3 w-px bg-white/15" />
            <span className="ws-hud-text text-[10px] text-amber-300">{t(preset.nameKey)}</span>
          </>
        )}
      </div>

      {/* ── 右下: 帧号 / 比例尺 ── */}
      <div className="glass-surface pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-3 rounded-md border border-white/10 px-2.5 py-1.5 shadow-lg">
        {hasFrames && frameCount > 1 && (
          <>
            <span className="hud-numeric ws-hud-text text-[11px] text-white/90">
              {currentFrame + 1} <span className="text-white/50">/ {frameCount}</span>
            </span>
            <span className="h-3 w-px bg-white/15" />
          </>
        )}
        {/* 比例尺: 有像素间距时真实校准 (worldToCanvas 测量, 随缩放变化);
         * 无间距 (未校准图) 回退固定 5mm display-relative (HUD 惯例) */}
        <ScaleBar viewportId={viewportId} />
        {hasFrames && frameCount > 1 && frameSliceLocation !== undefined && (
          <>
            <span className="h-3 w-px bg-white/15" />
            <span className="ws-hud-text hud-numeric text-[10px] text-white/70">{frameSliceLocation.toFixed(2)} mm</span>
          </>
        )}
      </div>
    </>
  );
}
