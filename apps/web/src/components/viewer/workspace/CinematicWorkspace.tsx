/**
 * CinematicWorkspace — 查看器电影级工作台 (wayfinder #126, 演示中心件)。
 *
 * 视口中心化近黑工作台: 双侧可折叠玻璃面板 (300ms) + 上缘 HUD +
 * 浮动底条工具条 (可折叠为垂直窄条) + ⌘K 命令面板 + Cine 播放条 +
 * 真实全屏沉浸 (F)。布局结构沿用原型 #123, 数据全部换成真实
 * Cornerstone 渲染 (CornerstoneViewport) 与真实 store。
 *
 * 组件: 本文件为编排层; WorkspaceHud / WorkspaceToolbar / WorkspacePanels /
 * CommandPalette / CineBar / workspace.css 为子件。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Enums, eventTarget } from '@cornerstonejs/core';
import { annotation, utilities as ToolUtilities } from '@cornerstonejs/tools';
import { Badge } from '@/components/ui/badge';
import { CornerstoneViewport } from '@/components/viewer/CornerstoneViewport';
import { DicomTagViewer } from '@/components/viewer/DicomTagViewer';
import { KeyboardShortcutsHelp } from '@/components/viewer/KeyboardShortcutsHelp';
import { EditorPanel, FilterLayer, AiResultOverlay } from '@/components/editor';
import { useViewerStore } from '@/stores/viewerStore';
import { useWorkspaceStore, WS_WL_PRESETS } from '@/stores/workspaceStore';
import { dicomwebApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { WorkspaceHud, type HudModel } from './WorkspaceHud';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { LeftWorkspacePanel, RightWorkspacePanel, type WsFrame, type WsSeries, type WsImage } from './WorkspacePanels';
import { CommandPalette, type WsCmdGroup } from './CommandPalette';
import { CineBar } from './CineBar';
import { MAIN_VIEWPORT_ID, lateralityKey } from './workspaceShared';
import { cn } from '@/lib/utils';
import './workspace.css';
import { ArrowLeft, Eye, Keyboard, Hand as HandIcon, ZoomIn as ZoomIcon } from 'lucide-react';

/* ─── 数据形状 (与 ViewerPage 载入的数据对齐) ─────────────── */

export interface WsStudy {
  id: string;
  patientId: string;
  studyDate?: string;
  description?: string;
  modality?: string;
  status?: string;
  patient?: {
    name: string;
    gender?: string;
    birthDate?: string;
    mrn?: string;
  };
  physician?: { displayName?: string };
}

interface CinematicWorkspaceProps {
  study: WsStudy;
  series: WsSeries[];
  images: WsImage[];
  currentImageId: string | null;
  /** 当前激活序列 (未传入时取 series[0]) */
  activeSeriesId?: string;
  onSeriesSelect: (seriesId: string) => void;
  onImageSelect: (imageId: string) => void;
}

export function CinematicWorkspace({
  study,
  series,
  images,
  currentImageId,
  activeSeriesId,
  onSeriesSelect,
  onImageSelect,
}: CinematicWorkspaceProps) {
  const { t } = useTranslation();
  const {
    viewport,
    setViewport,
    currentFrame,
    totalFrames,
    setPlaying,
    setCurrentFrame,
    setPlaybackFPS,
  } = useViewerStore();
  const editorPanelOpen = useViewerStore((s) => s.editorPanelOpen);
  const {
    leftOpen,
    rightOpen,
    isFullscreen,
    paletteOpen,
    toggleLeft,
    toggleRight,
    setIsFullscreen,
    setPaletteOpen,
    resetWorkspace,
  } = useWorkspaceStore();
  const token = useAuthStore((s) => s.token);

  /** 当前图像的帧元数据 (dicomFrames) — 演示多帧与帧条/位置显示 */
  const [frames, setFrames] = useState<WsFrame[]>([]);
  const [selectedAnnoId, setSelectedAnnoId] = useState<string | null>(null);
  const [showDicomTags, setShowDicomTags] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const lastWheel = useRef(0);

  const activeSeries = series.find((s) => s.id === activeSeriesId) ?? series[0];
  const isMultiframe = frames.length > 1;
  const currentImage = images.find((i) => i.id === currentImageId);
  const currentFrameSlice =
    frames.length > 1 && frames[currentFrame]
      ? (frames[currentFrame].sliceLocation ?? null)
      : null;

  /* ─── 帧元数据探测 (多帧决策契约: 真实 #frame=N 栈 + 元数据多帧) ─── */
  useEffect(() => {
    if (!currentImageId) {
      setFrames([]);
      return;
    }
    let cancelled = false;
    // 切换图像: 停播 + 回到首帧
    setPlaying(false);
    setCurrentFrame(0);
    dicomwebApi
      .getFrames(currentImageId)
      .then((resp: any) => {
        if (cancelled) return;
        // axios 拦截器已解包 response.data → 服务端体即 { imageId, numberOfFrames, frames }
        // totalFrames 由 CornerstoneViewport 统一按元数据设置 (避免竞争)
        const list: any[] = resp?.frames ?? resp?.data?.frames;
        if (Array.isArray(list) && list.length > 1) {
          setFrames(
            list.map((f) => ({
              frameIndex: f.frameIndex ?? 0,
              sliceLocation: f.sliceLocation ?? f.imagePositionPatient?.[2] ?? null,
            }))
          );
        } else {
          setFrames([]);
        }
      })
      .catch(() => {
        if (!cancelled) setFrames([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentImageId, setPlaying, setCurrentFrame]);

  /* ─── 多帧默认 8fps (决策契约: 默认 8, 1–30 可调) ─── */
  useEffect(() => {
    setPlaybackFPS(8);
  }, [setPlaybackFPS]);

  /* ─── 离开查看器: 重置播放与工作台状态 ─── */
  useEffect(() => {
    return () => {
      setPlaying(false);
      resetWorkspace();
    };
  }, [setPlaying, resetWorkspace]);

  /* ─── 真实全屏沉浸 (F): 进入即收起两侧面板 ─── */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen().catch(() => undefined);
    } else {
      // 决议 #122-7: 全屏自动收面板, 最大化视口
      useWorkspaceStore.getState().setLeftOpen(false);
      useWorkspaceStore.getState().setRightOpen(false);
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, [setIsFullscreen]);

  /* ─── 相机缩放 → HUD (CAMERA_MODIFIED) ─── */
  useEffect(() => {
    const onCamera = (evt: any) => {
      const scale = evt.detail?.camera?.scale;
      if (typeof scale === 'number') {
        const cur = useViewerStore.getState().viewport.zoom;
        if (Math.abs(scale - cur) > 0.005) {
          useViewerStore.getState().setViewport({ zoom: scale });
        }
      }
    };
    eventTarget.addEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
    return () => eventTarget.removeEventListener(Enums.Events.CAMERA_MODIFIED, onCamera);
  }, []);

  /* ─── 帧/图像步进 ─── */
  const stepForward = useCallback(() => {
    if (frames.length > 1) {
      useViewerStore.getState().nextFrame();
    } else if (currentImageId) {
      const idx = images.findIndex((i) => i.id === currentImageId);
      if (idx >= 0 && idx < images.length - 1) onImageSelect(images[idx + 1].id);
    }
  }, [frames.length, currentImageId, images, onImageSelect]);

  const stepBack = useCallback(() => {
    if (frames.length > 1) {
      useViewerStore.getState().prevFrame();
    } else if (currentImageId) {
      const idx = images.findIndex((i) => i.id === currentImageId);
      if (idx > 0) onImageSelect(images[idx - 1].id);
    }
  }, [frames.length, currentImageId, images, onImageSelect]);

  const stepTo = useCallback((i: number) => {
    if (frames.length > 1) {
      useViewerStore.getState().setCurrentFrame(Math.max(0, Math.min(frames.length - 1, i)));
    } else if (images[i]) {
      onImageSelect(images[i].id);
    }
  }, [frames.length, images, onImageSelect]);

  /* ─── 键盘: ⌘K / ←→ 步进 / F 全屏 / 空格播放 / 工具键 ───
   * capture 阶段拦截 ⌘K: 工作台覆盖全应用时, 阻止 Layout 的 GlobalSearch
   * (document 冒泡监听) 同时弹出, 只打开工作台自己的命令面板。 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing =
        target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        e.stopPropagation();
        setPaletteOpen(!useWorkspaceStore.getState().paletteOpen);
        return;
      }
      if (paletteOpen || typing) return;
      const k = e.key.toLowerCase();
      if (e.key === 'ArrowLeft') { e.preventDefault(); stepBack(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stepForward(); }
      else if (k === 'f') { e.preventDefault(); toggleFullscreen(); }
      else if (k === '?') { e.preventDefault(); setShowShortcutsHelp((o) => !o); }
      else if (k === 'escape') { setShowDicomTags(false); setShowShortcutsHelp(false); }
      else if (e.key === ' ') {
        if (totalFrames > 1) { e.preventDefault(); setPlaying(!useViewerStore.getState().isPlaying); }
      } else if (k === 'v') { useViewerStore.getState().setActiveTool('pan'); }
      else if (k === 'z') { useViewerStore.getState().setActiveTool('zoom'); }
      else if (k === 'w') { useViewerStore.getState().setActiveTool('windowLevel'); }
      else if (k === 'e') { useViewerStore.getState().setActiveTool('arrow'); }
      else if (k === 'l') { useViewerStore.getState().setActiveTool('length'); }
      else if (k === 'a') { useViewerStore.getState().setActiveTool('angle'); }
      else if (k === 'p') { useViewerStore.getState().setActiveTool('probe'); }
    };
    window.addEventListener('keydown', onKey, { capture: true });
    return () => window.removeEventListener('keydown', onKey, { capture: true } as EventListenerOptions);
  }, [paletteOpen, stepBack, stepForward, toggleFullscreen, totalFrames, setPaletteOpen, setPlaying, setShowDicomTags, setShowShortcutsHelp]);

  /* ─── 视口滚轮: 单帧步进 ───
   * 用原生 capture 监听 + stopPropagation: 拦截在 CS StackScroll 的
   * element 级 wheel 监听之前, 避免真实多帧栈上双重步进。 */
  const mainRef = useRef<HTMLElement>(null);
  const stepForwardRef = useRef(stepForward);
  const stepBackRef = useRef(stepBack);
  stepForwardRef.current = stepForward;
  stepBackRef.current = stepBack;
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const now = Date.now();
      if (now - lastWheel.current < 80) return;
      lastWheel.current = now;
      e.preventDefault();
      e.stopPropagation();
      if (e.deltaY > 0) stepForwardRef.current();
      else stepBackRef.current();
    };
    el.addEventListener('wheel', onWheel, { capture: true, passive: false });
    return () => el.removeEventListener('wheel', onWheel, { capture: true } as EventListenerOptions);
  }, []);

  /* ─── 标注选中 (右面板列表 → Cornerstone 琥珀选中态) ─── */
  const selectAnno = useCallback((id: string | null) => {
    setSelectedAnnoId(id);
    const selection = annotation.selection;
    if (id) {
      selection.setAnnotationSelected(id, true, false);
    } else {
      const selected = selection.getAnnotationsSelected();
      for (const uid of selected) selection.setAnnotationSelected(uid, false, false);
    }
    ToolUtilities.triggerAnnotationRenderForViewportIds([MAIN_VIEWPORT_ID]);
  }, []);

  /* ─── 切序列: 重置选中 + 停播 ─── */
  const handleSeriesSelect = useCallback((id: string) => {
    setSelectedAnnoId(null);
    setPlaying(false);
    onSeriesSelect(id);
  }, [onSeriesSelect, setPlaying]);

  /* ─── HUD 模型 ─── */
  const hudModel: HudModel = useMemo(() => {
    const p = study.patient;
    let age: string | null = null;
    if (p?.birthDate) {
      const y = new Date(p.birthDate).getFullYear();
      if (!Number.isNaN(y)) age = `${new Date().getFullYear() - y}`;
    }
    return {
      patientName: p?.name || t('viewer.header.patient'),
      patientGender: p?.gender,
      patientAge: age,
      patientMrn: p?.mrn,
      studyDate: study.studyDate,
      studyDesc: study.description,
      physicianName: study.physician?.displayName,
      modality: activeSeries?.modality || study.modality || 'N/A',
      seriesName: activeSeries?.description || (activeSeries ? t('viewer.header.series', { number: activeSeries.seriesNumber }) : ''),
      eyeLabelKey: lateralityKey(activeSeries?.bodyPart),
    };
  }, [study, activeSeries, t]);

  /* ─── ⌘K 命令 (真实数据预览, 决议 #122-4) ─── */
  const commands: WsCmdGroup[] = useMemo(() => {
    const thumbUrl = (id?: string | null) => (id ? `/api/images/${id}/thumbnail?token=${token}` : undefined);
    const strip = (n: number) => {
      if (frames.length > 1) {
        const base = Math.max(0, Math.min(frames.length - 1, currentFrame - Math.floor(n / 2)));
        const out: number[] = [];
        for (let i = 0; i < n; i++) {
          const v = base + i;
          if (v < frames.length) out.push(v);
        }
        return out;
      }
      const curIdx = Math.max(0, images.findIndex((i) => i.id === currentImageId));
      const base = Math.max(0, Math.min(images.length - 1, curIdx - Math.floor(n / 2)));
      const out: number[] = [];
      for (let i = 0; i < n; i++) {
        const v = base + i;
        if (v < images.length) out.push(v);
      }
      return out;
    };
    const frameStripPreview = (n: number) =>
      frames.length > 1 ? (
        <div className="flex gap-1">
          {strip(n).map((i) => (
            <div key={i} className={cn('flex-1 overflow-hidden rounded-sm border', i === currentFrame ? 'border-[hsl(var(--primary))]' : 'border-border/60 opacity-60')}>
              {thumbUrl(currentImageId) && <img src={thumbUrl(currentImageId)} alt="" className="aspect-[3/2] w-full object-cover" />}
              <p className="hud-numeric bg-black/60 py-0.5 text-center text-[9px]">{i + 1}</p>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex gap-1">
          {strip(n).map((i) => (
            <div key={i} className={cn('flex-1 overflow-hidden rounded-sm border', images[i]?.id === currentImageId ? 'border-[hsl(var(--primary))]' : 'border-border/60 opacity-60')}>
              <img src={thumbUrl(images[i]?.id)} alt="" className="aspect-[3/2] w-full object-cover" />
              <p className="hud-numeric bg-black/60 py-0.5 text-center text-[9px]">{images[i]?.instanceNumber ?? i + 1}</p>
            </div>
          ))}
        </div>
      );

    const presetItems = WS_WL_PRESETS.map((p) => ({
      id: `preset-${p.id}`,
      name: `${t('viewer.workspace.cmdPreset')} · ${t(p.nameKey)}`,
      desc: `WW ${p.ww} · WL ${p.wl}`,
      run: () => setViewport({ windowWidth: p.ww, windowLevel: p.wl }),
      preview: (
        <div className="space-y-2">
          <div className="flex items-end justify-between">
            <span className="text-xs text-foreground/80">{t(p.nameKey)}</span>
            <span className="hud-numeric text-[11px] text-muted-foreground">WW {p.ww} · WL {p.wl}</span>
          </div>
          <div className="h-3 rounded-sm" style={{ background: `linear-gradient(90deg, #000, hsl(${200 + p.ww * 0.06} 30% 42%))` }} />
        </div>
      ),
    }));

    return [
      {
        group: t('viewer.workspace.cmdImage'),
        items: [
          {
            id: 'prev-step',
            name: frames.length > 1 ? t('viewer.workspace.cmdPrevFrame') : t('viewer.workspace.cmdPrevImage'),
            desc: frames.length > 1
              ? t('viewer.workspace.cmdFrameOf', { n: currentFrame + 1, total: frames.length })
              : `${Math.max(1, images.findIndex((i) => i.id === currentImageId) + 1)} / ${images.length}`,
            shortcut: '←',
            run: stepBack,
            preview: frameStripPreview(5),
          },
          {
            id: 'next-step',
            name: frames.length > 1 ? t('viewer.workspace.cmdNextFrame') : t('viewer.workspace.cmdNextImage'),
            desc: frames.length > 1
              ? t('viewer.workspace.cmdFrameOf', { n: currentFrame + 1, total: frames.length })
              : `${Math.max(1, images.findIndex((i) => i.id === currentImageId) + 1)} / ${images.length}`,
            shortcut: '→',
            run: stepForward,
            preview: frameStripPreview(5),
          },
        ],
      },
      {
        group: t('viewer.workspace.cmdPreset'),
        items: presetItems,
      },
      {
        group: t('viewer.workspace.cmdPanels'),
        items: [
          {
            id: 'toggle-left',
            name: leftOpen ? t('viewer.workspace.cmdCollapseLeft') : t('viewer.workspace.cmdExpandLeft'),
            desc: t('viewer.workspace.cmdLeftDesc'),
            shortcut: '⌘[',
            run: () => toggleLeft(),
            preview: (
              <div className="flex h-full gap-1.5">
                <div className={cn('w-1/4 rounded-sm border-2', leftOpen ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/20' : 'border-border bg-card')} />
                <div className="flex-1 rounded-sm border border-border bg-black" />
                <div className="w-1/4 rounded-sm border border-border bg-card" />
              </div>
            ),
          },
          {
            id: 'toggle-right',
            name: rightOpen ? t('viewer.workspace.cmdCollapseRight') : t('viewer.workspace.cmdExpandRight'),
            desc: t('viewer.workspace.cmdRightDesc'),
            shortcut: '⌘]',
            run: () => toggleRight(),
            preview: (
              <div className="flex h-full gap-1.5">
                <div className="w-1/4 rounded-sm border border-border bg-card" />
                <div className="flex-1 rounded-sm border border-border bg-black" />
                <div className={cn('w-1/4 rounded-sm border-2', rightOpen ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/20' : 'border-border bg-card')} />
              </div>
            ),
          },
        ],
      },
      {
        group: t('viewer.workspace.cmdInspect'),
        items: [
          {
            id: 'dicom-tags',
            name: t('viewer.header.dicomTags'),
            desc: t('viewer.workspace.cmdTagsDesc'),
            run: () => setShowDicomTags((o) => !o),
            preview: (
              <div className="flex h-full flex-col gap-1 rounded-sm border border-border bg-black/40 p-2">
                <p className="text-[10px] text-muted-foreground">{t('viewer.dicom.title')}</p>
                <div className="space-y-1">{[1, 2, 3].map((i) => (
                  <div key={i} className="h-2.5 rounded-sm bg-white/8" />
                ))}
                </div>
              </div>
            ),
          },
          {
            id: 'shortcuts-help',
            name: t('viewer.keyboard.title'),
            desc: t('viewer.workspace.cmdShortcutsDesc'),
            shortcut: '?',
            run: () => setShowShortcutsHelp((o) => !o),
            preview: (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-border bg-black/60">
                <Keyboard className="h-8 w-8 text-teal-300" />
                <p className="text-[11px] text-muted-foreground">{t('viewer.workspace.cmdShortcutsDesc')}</p>
              </div>
            ),
          },
        ],
      },
      {
        group: t('viewer.workspace.cmdView'),
        items: [
          {
            id: 'fullscreen',
            name: isFullscreen ? t('viewer.workspace.cmdExitFullscreen') : t('viewer.workspace.cmdEnterFullscreen'),
            desc: t('viewer.workspace.cmdFullscreenDesc'),
            shortcut: 'F',
            run: toggleFullscreen,
            preview: (
              <div className="flex h-full flex-col gap-1.5">
                <div className="flex-1 rounded-sm border-2 border-[hsl(var(--primary))] bg-black" />
                <div className="flex justify-center gap-1 text-[10px] text-muted-foreground">
                  {isFullscreen ? t('viewer.workspace.cmdExitFullscreen') : t('viewer.workspace.cmdEnterFullscreen')}
                </div>
              </div>
            ),
          },
          {
            id: 'tool-pan',
            name: `${t('viewer.workspace.cmdTool')} · ${t('viewer.toolbar.pan')}`,
            desc: t('viewer.workspace.cmdToolPanDesc'),
            shortcut: 'V',
            run: () => useViewerStore.getState().setActiveTool('pan'),
            preview: (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-border bg-black/60">
                <HandIcon className="h-8 w-8 text-teal-300" />
                <p className="text-[11px] text-muted-foreground">{t('viewer.toolbar.pan')}</p>
              </div>
            ),
          },
          {
            id: 'tool-zoom',
            name: `${t('viewer.workspace.cmdTool')} · ${t('viewer.toolbar.zoom')}`,
            desc: `${t('viewer.workspace.cmdZoomDesc')} ${Math.round(viewport.zoom * 100)}%`,
            shortcut: 'Z',
            run: () => useViewerStore.getState().setActiveTool('zoom'),
            preview: (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-border bg-black/60">
                <ZoomIcon className="h-8 w-8 text-teal-300" />
                <p className="hud-numeric text-[11px]">{Math.round(viewport.zoom * 100)}%</p>
              </div>
            ),
          },
        ],
      },
    ];
  }, [frames, images, currentImageId, currentFrame, leftOpen, rightOpen, isFullscreen, viewport.zoom, stepBack, stepForward, toggleFullscreen, toggleLeft, toggleRight, setViewport, t, token]);

  return (
    <div className="fixed inset-0 z-40 flex select-none flex-col overflow-hidden bg-background text-foreground">
      {/* ── 工作台顶栏 (极简 chrome) ── */}
      <header className="z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3">
        <Link
          to={`/patients/${study.patientId}`}
          className="ws-tool-btn flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('viewer.workspace.backToPatient')}
        </Link>
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[hsl(var(--primary))]">
          <Eye className="h-3 w-3 text-black" />
        </span>
        <span className="text-xs font-medium tracking-wide">{t('viewer.workspace.appTitle')}</span>
        <Badge variant="outline" className="ml-1 h-4 border-dashed px-1.5 text-[9px] text-muted-foreground">
          {t('viewer.workspace.productionBadge')}
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPaletteOpen(true)}
            className="ws-tool-btn flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Keyboard className="h-3.5 w-3.5" />
            {t('viewer.workspace.commandPalette')}
            <kbd className="hud-numeric ml-1 rounded border border-border bg-black/30 px-1 text-[9px]">⌘K</kbd>
          </button>
        </div>
      </header>

      {/* ── 主工作台 ── */}
      <div className="flex min-h-0 flex-1">
        {/* 左: 序列/切片 (可折叠 → 图标窄条) */}
        <LeftWorkspacePanel
          open={leftOpen}
          onToggle={toggleLeft}
          series={series}
          activeSeriesId={activeSeriesId}
          onSeriesSelect={handleSeriesSelect}
          images={images}
          currentImageId={currentImageId}
          onImageSelect={onImageSelect}
          frames={frames}
          currentFrame={currentFrame}
          onFrameSelect={stepTo}
        />

        {/* 中: 视口 (近黑) + HUD + 工具条 + Cine */}
        <main ref={mainRef} className="ws-viewport-bg relative z-10 min-w-0 flex-1 overflow-hidden">
          {/* 视口层: 200ms 交叉淡入 (keyed, 决议 #122-6) */}
          <div key={currentImageId ?? 'empty'} className="ws-fade-in absolute inset-0">
            <CornerstoneViewport
              imageId={currentImageId || ''}
              imageFormat={currentImage?.format}
            />
            {/* 编辑套件叠加 (#112): 滤镜 Canvas2D 管线 + ai_result SVG 覆盖层 */}
            <FilterLayer viewportId={MAIN_VIEWPORT_ID} />
            <AiResultOverlay viewportId={MAIN_VIEWPORT_ID} />
          </div>

          {/* 编辑工作区 (⌘E): 图层/滤镜/测量 — 视口右侧浮层 (#112) */}
          {editorPanelOpen && (
            <div className="absolute bottom-14 right-2 top-14 z-30 w-80">
              <EditorPanel imageId={currentImageId ?? undefined} className="h-full" />
            </div>
          )}

          {/* HUD 浮层 */}
          <WorkspaceHud
            model={hudModel}
            hasFrames={isMultiframe}
            frameCount={frames.length}
            frameSliceLocation={currentFrameSlice ?? undefined}
            onOpenPalette={() => setPaletteOpen(true)}
          />

          {/* 浮动工具条 (底部居中, 可折叠为垂直窄条) */}
          <WorkspaceToolbar studyId={study.id} />

          {/* Cine 播放条 (多帧; 单帧优雅缺失) */}
          {totalFrames > 1 && (
            <CineBar
              sliceLocation={currentFrameSlice ?? undefined}
              className="absolute bottom-14 left-1/2 z-30 -translate-x-1/2"
            />
          )}

          {/* 沉浸模式提示 */}
          {isFullscreen && (
            <div className="pointer-events-none absolute left-3 top-16 z-30 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-white/70">
              {t('viewer.workspace.fullscreenHint')}
            </div>
          )}

          {/* 交互提示 */}
          <div className="pointer-events-none absolute bottom-1.5 right-2 z-30 flex items-center gap-2 text-[9px] text-white/25">
            <span>← → {frames.length > 1 ? t('viewer.workspace.hintFrame') : t('viewer.workspace.hintImage')}</span>
            <span>{t('viewer.workspace.hintWheel')}</span>
            <span>F {t('viewer.workspace.hintFullscreen')}</span>
            <span>⌘K</span>
          </div>
        </main>

        {/* 右: 工作台面板 (标注/图层/测量, 可折叠 → 图标窄条) */}
        <RightWorkspacePanel
          open={rightOpen}
          onToggle={toggleRight}
          currentImageId={currentImageId}
          selectedAnnoId={selectedAnnoId}
          onSelectAnno={selectAnno}
        />
      </div>

      {/* ⌘K 命令面板 */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />

      {/* DICOM 标签浮层 (继承原 ViewerPage 功能, 不回归) */}
      {showDicomTags && currentImageId && (
        <div className="absolute right-0 top-10 bottom-0 z-50 w-96 border-l bg-background/95">
          <DicomTagViewer imageId={currentImageId} onClose={() => setShowDicomTags(false)} />
        </div>
      )}

      {/* 快捷键浮层 */}
      <KeyboardShortcutsHelp open={showShortcutsHelp} onOpenChange={setShowShortcutsHelp} />
    </div>
  );
}
