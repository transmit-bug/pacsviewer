import { create } from 'zustand';
import type { SegmentationResult } from '@/lib/ai/segmentation';
import type { DetectionResult } from '@/lib/ai/detection';

// ============================================================================
// Types
// ============================================================================

export type SegmentationMethod = 'threshold' | 'region_growing' | 'edge';
export type DetectionModel = 'retinal_disease' | 'optic_disc' | 'vessel';
export type HeatmapColormap = 'jet' | 'hot' | 'viridis' | 'plasma';

interface SegmentationConfig {
  method: SegmentationMethod;
  thresholdMin: number;
  thresholdMax: number;
  autoThreshold: boolean;
  tolerance: number;
  edgeMethod: 'sobel' | 'prewitt' | 'roberts';
  edgeThreshold: number;
}

interface DetectionConfig {
  model: DetectionModel;
  heatmapOpacity: number;
  heatmapThreshold: number;
  colormap: HeatmapColormap;
}

interface AIState {
  // Initialization
  isInitialized: boolean;
  isLoading: boolean;
  error: string | null;

  // Segmentation
  segmentationConfig: SegmentationConfig;
  segmentationResult: SegmentationResult | null;
  isSegmenting: boolean;

  // Detection
  detectionConfig: DetectionConfig;
  detectionResult: DetectionResult | null;
  isDetecting: boolean;

  // Visualization
  showOverlay: boolean;
  overlayOpacity: number;
  selectedPrediction: number | null;

  // History
  history: Array<{
    id: string;
    type: 'segmentation' | 'detection';
    timestamp: number;
    result: SegmentationResult | DetectionResult;
  }>;
}

interface AIActions {
  // Initialization
  initialize: () => Promise<void>;
  setError: (error: string | null) => void;

  // Segmentation
  setSegmentationConfig: (config: Partial<SegmentationConfig>) => void;
  setSegmentationResult: (result: SegmentationResult | null) => void;
  setSegmenting: (isSegmenting: boolean) => void;

  // Detection
  setDetectionConfig: (config: Partial<DetectionConfig>) => void;
  setDetectionResult: (result: DetectionResult | null) => void;
  setDetecting: (isDetecting: boolean) => void;

  // Visualization
  toggleOverlay: () => void;
  setOverlayOpacity: (opacity: number) => void;
  setSelectedPrediction: (index: number | null) => void;

  // History
  addToHistory: (entry: Omit<AIState['history'][0], 'id' | 'timestamp'>) => void;
  clearHistory: () => void;

  // Reset
  reset: () => void;
}

// ============================================================================
// Default Configurations
// ============================================================================

const defaultSegmentationConfig: SegmentationConfig = {
  method: 'threshold',
  thresholdMin: 0,
  thresholdMax: 128,
  autoThreshold: true,
  tolerance: 30,
  edgeMethod: 'sobel',
  edgeThreshold: 128,
};

const defaultDetectionConfig: DetectionConfig = {
  model: 'retinal_disease',
  heatmapOpacity: 0.6,
  heatmapThreshold: 0.3,
  colormap: 'jet',
};

// ============================================================================
// Store
// ============================================================================

export const useAIStore = create<AIState & AIActions>((set) => ({
  // Initial state
  isInitialized: false,
  isLoading: false,
  error: null,

  segmentationConfig: { ...defaultSegmentationConfig },
  segmentationResult: null,
  isSegmenting: false,

  detectionConfig: { ...defaultDetectionConfig },
  detectionResult: null,
  isDetecting: false,

  showOverlay: true,
  overlayOpacity: 0.6,
  selectedPrediction: null,

  history: [],

  // Actions
  initialize: async () => {
    set({ isLoading: true, error: null });
    try {
      // Import dynamically to avoid SSR issues
      const { initializeTensorFlow } = await import('@/lib/ai/tensorflow');
      await initializeTensorFlow();
      set({ isInitialized: true, isLoading: false });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : 'AI initialization failed',
        isLoading: false,
      });
    }
  },

  setError: (error) => set({ error }),

  setSegmentationConfig: (config) =>
    set((state) => ({
      segmentationConfig: { ...state.segmentationConfig, ...config },
    })),

  setSegmentationResult: (result) => set({ segmentationResult: result }),

  setSegmenting: (isSegmenting) => set({ isSegmenting }),

  setDetectionConfig: (config) =>
    set((state) => ({
      detectionConfig: { ...state.detectionConfig, ...config },
    })),

  setDetectionResult: (result) => set({ detectionResult: result }),

  setDetecting: (isDetecting) => set({ isDetecting }),

  toggleOverlay: () => set((state) => ({ showOverlay: !state.showOverlay })),

  setOverlayOpacity: (opacity) => set({ overlayOpacity: opacity }),

  setSelectedPrediction: (index) => set({ selectedPrediction: index }),

  addToHistory: (entry) =>
    set((state) => ({
      history: [
        {
          id: crypto.randomUUID(),
          timestamp: Date.now(),
          ...entry,
        },
        ...state.history,
      ].slice(0, 50), // Keep last 50 entries
    })),

  clearHistory: () => set({ history: [] }),

  reset: () =>
    set({
      segmentationResult: null,
      detectionResult: null,
      selectedPrediction: null,
      showOverlay: true,
      overlayOpacity: 0.6,
    }),
}));
