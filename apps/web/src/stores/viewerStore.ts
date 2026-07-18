import { create } from 'zustand';

interface ViewportState {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  windowWidth: number;
  windowLevel: number;
  invert: boolean;
}

interface Annotation {
  id: string;
  type: string;
  geometry: Record<string, any>;
  style: Record<string, any>;
  label?: string;
}

interface Layer {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
}

/**
 * DICOM metadata extracted from the loaded image.
 * Used for measurement calibration (pixelSpacing) and display parameters.
 */
export interface DicomImageMetadata {
  pixelSpacing: [number, number] | null;  // [row, col] in mm
  windowCenter: number | number[] | null;
  windowWidth: number | number[] | null;
  rescaleSlope: number;
  rescaleIntercept: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  photometricInterpretation: string;
  numberOfFrames: number;
  modality: string;
  laterality: string;
}

export type PlaybackMode = 'loop' | 'once' | 'pingpong';

interface ViewerState {
  currentImageId: string | null;
  dicomMetadata: DicomImageMetadata | null;
  viewport: ViewportState;
  activeTool: string;
  annotations: Annotation[];
  layers: Layer[];
  // Multi-frame state
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
  playbackFPS: number;
  playbackMode: PlaybackMode;
}

interface ViewerActions {
  setCurrentImage: (id: string) => void;
  setDicomMetadata: (meta: DicomImageMetadata | null) => void;
  setViewport: (viewport: Partial<ViewportState>) => void;
  resetViewport: () => void;
  setActiveTool: (tool: string) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, data: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  // Multi-frame actions
  setPlaying: (playing: boolean) => void;
  setCurrentFrame: (frame: number) => void;
  setTotalFrames: (total: number) => void;
  setPlaybackFPS: (fps: number) => void;
  setPlaybackMode: (mode: PlaybackMode) => void;
  nextFrame: () => void;
  prevFrame: () => void;
  firstFrame: () => void;
  lastFrame: () => void;
}

const defaultViewport: ViewportState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flipH: false,
  flipV: false,
  windowWidth: 400,
  windowLevel: 40,
  invert: false,
};

export const useViewerStore = create<ViewerState & ViewerActions>((set, get) => ({
  currentImageId: null,
  dicomMetadata: null,
  viewport: { ...defaultViewport },
  activeTool: 'pan',
  annotations: [],
  layers: [],
  // Multi-frame
  isPlaying: false,
  currentFrame: 0,
  totalFrames: 0,
  playbackFPS: 10,
  playbackMode: 'loop',

  setCurrentImage: (id) => set({ currentImageId: id }),

  setDicomMetadata: (meta) => set({ dicomMetadata: meta }),

  setViewport: (viewport) =>
    set((state) => ({
      viewport: { ...state.viewport, ...viewport },
    })),

  resetViewport: () => set({ viewport: { ...defaultViewport } }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
    })),

  updateAnnotation: (id, data) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...data } : a
      ),
    })),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    })),

  addLayer: (layer) =>
    set((state) => ({
      layers: [...state.layers, layer],
    })),

  updateLayer: (id, data) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, ...data } : l
      ),
    })),

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
    })),

  setPlaying: (playing) => set({ isPlaying: playing }),

  setCurrentFrame: (frame) => set({ currentFrame: frame }),

  setTotalFrames: (total) => set({ totalFrames: total }),

  setPlaybackFPS: (fps) => set({ playbackFPS: Math.max(1, Math.min(30, fps)) }),

  setPlaybackMode: (mode) => set({ playbackMode: mode }),

  nextFrame: () => {
    const { currentFrame, totalFrames } = get();
    if (totalFrames <= 1) return;
    set({ currentFrame: (currentFrame + 1) % totalFrames });
  },

  prevFrame: () => {
    const { currentFrame, totalFrames } = get();
    if (totalFrames <= 1) return;
    set({ currentFrame: (currentFrame - 1 + totalFrames) % totalFrames });
  },

  firstFrame: () => set({ currentFrame: 0 }),

  lastFrame: () => {
    const { totalFrames } = get();
    set({ currentFrame: Math.max(0, totalFrames - 1) });
  },
}));
