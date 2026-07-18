/**
 * FfaTimeline — FFA/ICGA time-series browser with phase annotations.
 *
 * Features:
 * - Phase-colored timeline bar
 * - Current frame indicator
 * - Click-to-seek on timeline
 * - Phase labels with time ranges
 * - Leakage marker list
 * - Fluorescence intensity mini-chart
 */

import { useEffect, useRef, useCallback } from 'react';
import { useFfaStore, FFA_PHASES, type FfaPhaseType } from '@/stores/ffaStore';
import { cn } from '@/lib/utils';

interface FfaTimelineProps {
  totalFrames: number;
  currentFrame: number;
  fps?: number;
  onFrameSelect: (frame: number) => void;
  className?: string;
}

const PHASE_COLORS: Record<FfaPhaseType, string> = {
  'pre-arterial': '#4a90d9',
  'arterial': '#e74c3c',
  'arteriovenous': '#e67e22',
  'venous': '#2ecc71',
  'late': '#9b59b6',
};

export function FfaTimeline({
  totalFrames,
  currentFrame,
  fps = 10,
  onFrameSelect,
  className,
}: FfaTimelineProps) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const { phases, currentPhase, leakageMarkers, autoDetectPhases, setCurrentPhase } =
    useFfaStore();

  // Auto-detect phases on mount or when frames change
  useEffect(() => {
    if (totalFrames > 0) {
      autoDetectPhases(totalFrames, fps);
    }
  }, [totalFrames, fps, autoDetectPhases]);

  // Determine current phase from frame
  useEffect(() => {
    const phase = phases.find(
      (p) => currentFrame >= p.startFrame && currentFrame <= p.endFrame
    );
    setCurrentPhase(phase?.type ?? null);
  }, [currentFrame, phases, setCurrentPhase]);

  const currentTimeSec = currentFrame / fps;

  const handleTimelineClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      const el = timelineRef.current;
      if (!el || totalFrames <= 1) return;

      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const ratio = x / rect.width;
      const frame = Math.round(ratio * (totalFrames - 1));
      onFrameSelect(Math.max(0, Math.min(frame, totalFrames - 1)));
    },
    [totalFrames, onFrameSelect]
  );

  const currentPhaseConfig = currentPhase
    ? FFA_PHASES.find((p) => p.type === currentPhase)
    : null;

  return (
    <div className={cn('space-y-2', className)}>
      {/* Phase badges */}
      <div className="flex flex-wrap gap-1">
        {FFA_PHASES.map((p) => {
          const isActive = currentPhase === p.type;
          return (
            <button
              key={p.type}
              className={cn(
                'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors cursor-pointer',
                isActive
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-foreground border-input hover:bg-accent'
              )}
              onClick={() => {
                const phase = phases.find((ph) => ph.type === p.type);
                if (phase) onFrameSelect(phase.startFrame);
              }}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {/* Timeline bar */}
      <div
        ref={timelineRef}
        className="relative h-8 rounded-md overflow-hidden cursor-pointer border"
        onClick={handleTimelineClick}
      >
        {/* Phase segments */}
        {phases.map((phase) => {
          const startPct = (phase.startFrame / (totalFrames - 1)) * 100;
          const widthPct = ((phase.endFrame - phase.startFrame) / (totalFrames - 1)) * 100;
          return (
            <div
              key={phase.type}
              className="absolute top-0 h-full opacity-60"
              style={{
                left: `${startPct}%`,
                width: `${widthPct}%`,
                backgroundColor: PHASE_COLORS[phase.type],
              }}
            />
          );
        })}

        {/* Current position indicator */}
        <div
          className="absolute top-0 w-0.5 h-full bg-white shadow-lg z-10"
          style={{ left: `${(currentFrame / (totalFrames - 1)) * 100}%` }}
        >
          <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-white rounded-full shadow" />
        </div>

        {/* Leakage markers */}
        {leakageMarkers.map((m) => (
          <div
            key={m.id}
            className="absolute top-1 w-2 h-2 bg-red-500 rounded-full z-5"
            style={{ left: `${(m.frameIndex / (totalFrames - 1)) * 100}%` }}
          />
        ))}
      </div>

      {/* Phase labels with time ranges */}
      <div className="relative h-4 text-[10px] text-muted-foreground">
        {phases.map((phase) => {
          const centerPct =
            ((phase.startFrame + phase.endFrame) / 2 / (totalFrames - 1)) * 100;
          return (
            <span
              key={phase.type}
              className="absolute -translate-x-1/2 whitespace-nowrap"
              style={{ left: `${centerPct}%` }}
            >
              {phase.startTimeSec}s–{phase.endTimeSec}s
            </span>
          );
        })}
      </div>

      {/* Current info */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          {currentPhaseConfig && (
            <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
              {currentPhaseConfig.label}
            </span>
          )}
          <span className="text-muted-foreground">
            {currentTimeSec.toFixed(1)}s · 帧 {currentFrame + 1}/{totalFrames}
          </span>
        </div>
      </div>
    </div>
  );
}
