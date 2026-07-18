/**
 * CinePlayer — multi-frame navigation and Cine playback controls.
 *
 * Features:
 * - Frame slider for manual navigation
 * - Play/Pause with FPS control
 * - Loop modes: loop, once, pingpong
 * - Keyboard shortcuts: ←/→ frame, Space play/pause, Home/End first/last
 *
 * Only visible when totalFrames > 1.
 */

import { useEffect, useRef, useCallback } from 'react';
import { useViewerStore, type PlaybackMode } from '@/stores/viewerStore';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  ChevronsLeft,
  ChevronsRight,
  Repeat,
  Repeat1,
  ArrowRightLeft,
} from 'lucide-react';

interface CinePlayerProps {
  className?: string;
}

const PLAYBACK_MODES: { mode: PlaybackMode; icon: any; label: string }[] = [
  { mode: 'loop', icon: Repeat, label: '循环' },
  { mode: 'once', icon: Repeat1, label: '单次' },
  { mode: 'pingpong', icon: ArrowRightLeft, label: '往复' },
];

export function CinePlayer({ className }: CinePlayerProps) {
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
  const directionRef = useRef<1 | -1>(1);

  // Don't render for single-frame images
  if (totalFrames <= 1) return null;

  // Cine playback loop
  const animate = useCallback((timestamp: number) => {
    if (!lastTimeRef.current) lastTimeRef.current = timestamp;

    const interval = 1000 / playbackFPS;
    const elapsed = timestamp - lastTimeRef.current;

    if (elapsed >= interval) {
      lastTimeRef.current = timestamp;

      const state = useViewerStore.getState();
      const { currentFrame: cf, totalFrames: tf, playbackMode: mode } = state;

      if (mode === 'pingpong') {
        const next = cf + directionRef.current;
        if (next >= tf - 1) {
          directionRef.current = -1;
          setCurrentFrame(tf - 1);
        } else if (next <= 0) {
          directionRef.current = 1;
          setCurrentFrame(0);
        } else {
          setCurrentFrame(next);
        }
      } else {
        const next = cf + 1;
        if (next >= tf) {
          if (mode === 'loop') {
            setCurrentFrame(0);
          } else {
            // once — stop
            setPlaying(false);
            return;
          }
        } else {
          setCurrentFrame(next);
        }
      }
    }

    animFrameRef.current = requestAnimationFrame(animate);
  }, [playbackFPS, setCurrentFrame, setPlaying]);

  // Start/stop playback
  useEffect(() => {
    if (isPlaying) {
      lastTimeRef.current = 0;
      directionRef.current = 1;
      animFrameRef.current = requestAnimationFrame(animate);
    } else {
      cancelAnimationFrame(animFrameRef.current);
    }

    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, animate]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't capture when typing in inputs
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      switch (e.key) {
        case 'ArrowLeft':
          e.preventDefault();
          e.stopImmediatePropagation();
          prevFrame();
          break;
        case 'ArrowRight':
          e.preventDefault();
          e.stopImmediatePropagation();
          nextFrame();
          break;
        case ' ':
          e.preventDefault();
          e.stopImmediatePropagation();
          setPlaying(!useViewerStore.getState().isPlaying);
          break;
        case 'Home':
          e.preventDefault();
          e.stopImmediatePropagation();
          firstFrame();
          break;
        case 'End':
          e.preventDefault();
          e.stopImmediatePropagation();
          lastFrame();
          break;
        case '[':
          e.preventDefault();
          e.stopImmediatePropagation();
          setPlaybackFPS(Math.max(1, playbackFPS - 2));
          break;
        case ']':
          e.preventDefault();
          e.stopImmediatePropagation();
          setPlaybackFPS(Math.min(30, playbackFPS + 2));
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);  // capture phase
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [playbackFPS, nextFrame, prevFrame, firstFrame, lastFrame, setPlaying, setPlaybackFPS]);

  const cyclePlaybackMode = () => {
    const modes: PlaybackMode[] = ['loop', 'once', 'pingpong'];
    const idx = modes.indexOf(playbackMode);
    setPlaybackMode(modes[(idx + 1) % modes.length]);
  };

  const currentModeConfig = PLAYBACK_MODES.find(m => m.mode === playbackMode)!;
  const ModeIcon = currentModeConfig.icon;

  return (
    <div className={className}>
      <div className="flex items-center gap-3 px-3 py-2 bg-card border rounded-lg shadow-sm">
        {/* Frame info */}
        <div className="text-xs text-muted-foreground w-20 shrink-0 text-center font-mono">
          {currentFrame + 1} / {totalFrames}
        </div>

        {/* Slider */}
        <Slider
          value={[currentFrame]}
          min={0}
          max={totalFrames - 1}
          step={1}
          onValueChange={([v]) => setCurrentFrame(v)}
          className="flex-1"
        />

        {/* Transport controls */}
        <div className="flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={firstFrame}>
                <ChevronsLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>第一帧 (Home)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={prevFrame}>
                <SkipBack className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>上一帧 (←)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant={isPlaying ? 'default' : 'ghost'}
                size="icon"
                className="h-8 w-8"
                onClick={() => setPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{isPlaying ? '暂停 (Space)' : '播放 (Space)'}</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={nextFrame}>
                <SkipForward className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>下一帧 (→)</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={lastFrame}>
                <ChevronsRight className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>最后一帧 (End)</TooltipContent>
          </Tooltip>
        </div>

        {/* FPS control */}
        <div className="flex items-center gap-2 border-l pl-3">
          <span className="text-xs text-muted-foreground">FPS</span>
          <Slider
            value={[playbackFPS]}
            min={1}
            max={30}
            step={1}
            onValueChange={([v]) => setPlaybackFPS(v)}
            className="w-16"
          />
          <span className="text-xs font-mono w-5 text-center">{playbackFPS}</span>
        </div>

        {/* Playback mode */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cyclePlaybackMode}>
              <ModeIcon className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent>{currentModeConfig.label} ([ ] 切换)</TooltipContent>
        </Tooltip>
      </div>
    </div>
  );
}
