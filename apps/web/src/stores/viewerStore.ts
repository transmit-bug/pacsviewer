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

interface ViewerState {
  currentImageId: string | null;
  viewport: ViewportState;
  activeTool: string;
  annotations: Annotation[];
  layers: Layer[];
  isPlaying: boolean;
  currentFrame: number;
  totalFrames: number;
}

interface ViewerActions {
  setCurrentImage: (id: string) => void;
  setViewport: (viewport: Partial<ViewportState>) => void;
  resetViewport: () => void;
  setActiveTool: (tool: string) => void;
  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, data: Partial<Annotation>) => void;
  removeAnnotation: (id: string) => void;
  addLayer: (layer: Layer) => void;
  updateLayer: (id: string, data: Partial<Layer>) => void;
  removeLayer: (id: string) => void;
  setPlaying: (playing: boolean) => void;
  setCurrentFrame: (frame: number) => void;
  setTotalFrames: (total: number) => void;
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

export const useViewerStore = create<ViewerState & ViewerActions>((set) => ({
  currentImageId: null,
  viewport: { ...defaultViewport },
  activeTool: 'pan',
  annotations: [],
  layers: [],
  isPlaying: false,
  currentFrame: 0,
  totalFrames: 0,

  setCurrentImage: (id) => set({ currentImageId: id }),

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
}));
