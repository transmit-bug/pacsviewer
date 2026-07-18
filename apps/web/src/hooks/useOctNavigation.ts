/**
 * useOctNavigation — OCT B-scan frame navigation hook.
 *
 * Wraps viewerStore multi-frame state with OCT-specific logic:
 * - Automatic FPS defaults for OCT (10 fps)
 * - Frame metadata from dicomFrames table
 * - En-face position tracking
 */

import { useEffect, useState, useCallback } from 'react';
import { useViewerStore } from '@/stores/viewerStore';
import { dicomwebApi } from '@/services/api';

export interface OctFrame {
  frameIndex: number;
  sliceLocation?: number;
  imagePositionPatient?: [number, number, number];
  temporalPositionIdentifier?: number;
  metadata?: Record<string, any>;
}

interface UseOctNavigationOptions {
  imageId: string;
  autoLoad?: boolean;
}

interface UseOctNavigationReturn {
  frames: OctFrame[];
  currentFrame: number;
  totalFrames: number;
  isPlaying: boolean;
  playbackFPS: number;
  goToFrame: (index: number) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  firstFrame: () => void;
  lastFrame: () => void;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  setFPS: (fps: number) => void;
  /** Slice locations for en-face preview */
  sliceLocations: number[];
  /** Current slice index in sorted order */
  currentSliceIndex: number;
}

export function useOctNavigation({ imageId, autoLoad = true }: UseOctNavigationOptions): UseOctNavigationReturn {
  const {
    currentFrame,
    totalFrames,
    isPlaying,
    playbackFPS,
    setCurrentFrame,
    setTotalFrames,
    setPlaying,
    setPlaybackFPS,
    nextFrame,
    prevFrame,
    firstFrame,
    lastFrame,
  } = useViewerStore();

  const [frames, setFrames] = useState<OctFrame[]>([]);

  // Load frame metadata from backend
  useEffect(() => {
    if (!imageId || !autoLoad) return;

    const loadFrames = async () => {
      try {
        const resp = await dicomwebApi.getFrames(imageId);
        if (resp.data?.frames) {
          setFrames(resp.data.frames);
          if (resp.data.numberOfFrames > 1) {
            setTotalFrames(resp.data.numberOfFrames);
          }
        }
      } catch {
        // Single-frame image or no frame data — that's fine
        setFrames([]);
      }
    };

    loadFrames();
  }, [imageId, autoLoad, setTotalFrames]);

  // Set OCT default FPS on mount
  useEffect(() => {
    setPlaybackFPS(10);
  }, [setPlaybackFPS]);

  const goToFrame = useCallback((index: number) => {
    setCurrentFrame(Math.max(0, Math.min(index, totalFrames - 1)));
  }, [setCurrentFrame, totalFrames]);

  const play = useCallback(() => setPlaying(true), [setPlaying]);
  const pause = useCallback(() => setPlaying(false), [setPlaying]);
  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  const setFPS = useCallback((fps: number) => {
    setPlaybackFPS(Math.max(1, Math.min(30, fps)));
  }, [setPlaybackFPS]);

  // Extract slice locations for en-face preview
  const sliceLocations = frames
    .map(f => f.sliceLocation ?? f.imagePositionPatient?.[2] ?? f.frameIndex)
    .sort((a, b) => a - b);

  const currentSliceIndex = frames[currentFrame]
    ? sliceLocations.indexOf(
        frames[currentFrame].sliceLocation ??
        frames[currentFrame].imagePositionPatient?.[2] ??
        frames[currentFrame].frameIndex
      )
    : currentFrame;

  return {
    frames,
    currentFrame,
    totalFrames,
    isPlaying,
    playbackFPS,
    goToFrame,
    nextFrame,
    prevFrame,
    firstFrame,
    lastFrame,
    play,
    pause,
    togglePlay,
    setFPS,
    sliceLocations,
    currentSliceIndex,
  };
}
