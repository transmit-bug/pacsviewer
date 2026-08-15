/**
 * CineBar — 多帧播放条 (wayfinder #126 决策契约)。
 *
 * - requestAnimationFrame 驱动 (非 Cornerstone 内部播放器), 状态在 viewerStore;
 * - 默认 8fps, 1–30 可调; 进度条 + 帧号; 循环开关; play/pause/first/last;
 * - 滚轮/方向键单帧步进由 CinematicWorkspace 承接。
 * 多帧来源: 真实 DICOM 多帧 (#frame=N stack, #110 鉴权修复) 或
 * 元数据多帧 (演示数据集 dicomFrames, 图像为占位图)。
 */
import { useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useViewerStore, type PlaybackMode } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';
import { IconBtn, ToolbarGroupSep, formatMm } from './workspaceShared';
import {
  ChevronsLeft,
  ChevronsRight,
  SkipBack,
  SkipForward,
  Play,
  Pause,
  Repeat,
  Repeat1,
} from 'lucide-react';

interface CineBarProps {
  /** 当前帧扫描位置 (mm) — 显示在进度条右侧 */
  sliceLocation?: number;
  className?: string;
}

export function CineBar({ sliceLocation, className }: CineBarProps) {
  const { t } = useTranslation();
  const {
    totalFrames,
    currentFrame,
    isPlaying,
    playbackFPS,
    playbackMode,
    setCurrentFrame,
    setPlaying,
    setPlaybackFPS,
    setPlaybackMode,
    nextFrame,
    prevFrame,
    firstFrame,
    lastFrame,
  } = useViewerStore();

  const animFrameRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  // rAF 播放循环 (决策: 不用 Cornerstone 内部播放器)
  const animate = useCallback(
    (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp;
      const interval = 1000 / playbackFPS;
      if (timestamp - lastTimeRef.current >= interval) {
        lastTimeRef.current = timestamp;
        const state = useViewerStore.getState();
        const { currentFrame: cf, totalFrames: tf, playbackMode: mode } = state;
        if (tf <= 1) {
          setPlaying(false);
          return;
        }
        if (mode === 'once') {
          if (cf + 1 >= tf) {
            setPlaying(false);
            return;
          }
          setCurrentFrame(cf + 1);
        } else {
          // loop
          setCurrentFrame((cf + 1) % tf);
        }
      }
      animFrameRef.current = requestAnimationFrame(animate);
    },
    [playbackFPS, setCurrentFrame, setPlaying]
  );

  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, animate]);

  // 单帧序列不渲染播放条 (优雅缺失)
  if (totalFrames <= 1) return null;

  const cycleLoop = () => {
    const next: PlaybackMode = playbackMode === 'loop' ? 'once' : 'loop';
    setPlaybackMode(next);
  };

  const onProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setCurrentFrame(Math.round(ratio * (totalFrames - 1)));
  };

  return (
    <div className={cn('glass-surface pointer-events-auto flex items-center gap-2 rounded-md border border-white/10 px-2.5 py-1.5 shadow-lg', className)}>
      {/* 帧号 */}
      <span className="hud-numeric ws-hud-text w-14 shrink-0 text-center text-[11px] text-white/90">
        {currentFrame + 1}<span className="text-white/45">/{totalFrames}</span>
      </span>

      {/* 进度条 (可点击跳帧) */}
      <div className="ws-cine-track relative h-1.5 min-w-24 flex-1" onClick={onProgressClick} title={t('viewer.workspace.cineSeek')}>
        <div className="ws-cine-fill absolute inset-y-0 left-0" style={{ width: `${(currentFrame / Math.max(1, totalFrames - 1)) * 100}%` }} />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[hsl(var(--primary))]"
          style={{ left: `${(currentFrame / Math.max(1, totalFrames - 1)) * 100}%` }}
        />
      </div>

      {/* 播放位置 (mm) */}
      {sliceLocation !== undefined && (
        <span className="hud-numeric ws-hud-text hidden w-16 shrink-0 text-[10px] text-white/70 sm:block">
          {formatMm(sliceLocation)}
        </span>
      )}
      <ToolbarGroupSep />

      {/* 传输控制 */}
      <div className="flex items-center gap-0.5">
        <IconBtn icon={ChevronsLeft} label={t('viewer.cine.firstFrame')} onClick={firstFrame} />
        <IconBtn icon={SkipBack} label={t('viewer.cine.prevFrame')} onClick={prevFrame} />
        <button
          onClick={() => setPlaying(!isPlaying)}
          className={cn(
            'ws-tool-btn flex h-8 w-8 items-center justify-center rounded-sm border',
            isPlaying
              ? 'border-[hsl(var(--primary))]/60 bg-[hsl(var(--primary))]/20 text-[hsl(var(--primary))]'
              : 'border-transparent text-white/85 hover:bg-white/10'
          )}
          title={isPlaying ? t('viewer.cine.pause') : t('viewer.cine.play')}
        >
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <IconBtn icon={SkipForward} label={t('viewer.cine.nextFrame')} onClick={nextFrame} />
        <IconBtn icon={ChevronsRight} label={t('viewer.cine.lastFrame')} onClick={lastFrame} />
      </div>
      <ToolbarGroupSep />

      {/* 循环开关 */}
      <IconBtn
        icon={playbackMode === 'loop' ? Repeat : Repeat1}
        label={playbackMode === 'loop' ? t('viewer.cine.loop') : t('viewer.cine.once')}
        active={playbackMode === 'loop'}
        onClick={cycleLoop}
      />

      {/* FPS 1–30 */}
      <div className="flex items-center gap-1.5 border-l border-white/10 pl-2.5">
        <span className="text-[10px] text-white/55">FPS</span>
        <input
          type="range"
          min={1}
          max={30}
          step={1}
          value={playbackFPS}
          onChange={(e) => setPlaybackFPS(Number(e.target.value))}
          className="w-14 accent-[hsl(var(--primary))]"
        />
        <span className="hud-numeric w-5 text-center text-[11px] text-white/90">{playbackFPS}</span>
      </div>
    </div>
  );
}
