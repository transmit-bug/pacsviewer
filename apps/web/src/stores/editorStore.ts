import { create } from 'zustand';

export interface Layer {
  id: string;
  name: string;
  type: 'image' | 'annotation' | 'ai_result';
  visible: boolean;
  opacity: number;
  locked: boolean;
  order: number;
}

export interface ImageFilter {
  id: string;
  type: 'sharpen' | 'gaussian_blur' | 'median' | 'sobel' | 'canny' | 'histogram_eq' | 'brightness' | 'contrast' | 'saturation';
  name: string;
  enabled: boolean;
  params: Record<string, number>;
}

export type EditorTool = 'select' | 'brush' | 'eraser' | 'text' | 'shape';

interface EditorState {
  layers: Layer[];
  activeLayerId: string | null;
  filters: ImageFilter[];
  activeTool: EditorTool;
  brushSize: number;
  brushColor: string;
}

interface EditorActions {
  // Layer actions
  addLayer: (layer: Layer) => void;
  removeLayer: (id: string) => void;
  updateLayer: (id: string, updates: Partial<Layer>) => void;
  reorderLayers: (fromIndex: number, toIndex: number) => void;
  setActiveLayer: (id: string | null) => void;
  toggleLayerVisibility: (id: string) => void;
  toggleLayerLock: (id: string) => void;
  setLayerOpacity: (id: string, opacity: number) => void;

  // Filter actions
  addFilter: (filter: ImageFilter) => void;
  removeFilter: (id: string) => void;
  updateFilter: (id: string, updates: Partial<ImageFilter>) => void;
  toggleFilter: (id: string) => void;
  setFilterParam: (id: string, param: string, value: number) => void;
  resetFilters: () => void;

  // Tool actions
  setActiveTool: (tool: EditorTool) => void;
  setBrushSize: (size: number) => void;
  setBrushColor: (color: string) => void;
}

const defaultFilters: ImageFilter[] = [
  { id: 'brightness', type: 'brightness', name: '亮度', enabled: false, params: { value: 0 } },
  { id: 'contrast', type: 'contrast', name: '对比度', enabled: false, params: { value: 0 } },
  { id: 'saturation', type: 'saturation', name: '饱和度', enabled: false, params: { value: 0 } },
];

export const useEditorStore = create<EditorState & EditorActions>((set) => ({
  layers: [],
  activeLayerId: null,
  filters: [...defaultFilters],
  activeTool: 'select',
  brushSize: 5,
  brushColor: '#ff0000',

  // Layer actions
  addLayer: (layer) =>
    set((state) => ({
      layers: [...state.layers, layer].sort((a, b) => a.order - b.order),
      activeLayerId: layer.id,
    })),

  removeLayer: (id) =>
    set((state) => ({
      layers: state.layers.filter((l) => l.id !== id),
      activeLayerId: state.activeLayerId === id ? null : state.activeLayerId,
    })),

  updateLayer: (id, updates) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, ...updates } : l
      ),
    })),

  reorderLayers: (fromIndex, toIndex) =>
    set((state) => {
      const newLayers = [...state.layers];
      const [moved] = newLayers.splice(fromIndex, 1);
      newLayers.splice(toIndex, 0, moved);
      return {
        layers: newLayers.map((l, i) => ({ ...l, order: i })),
      };
    }),

  setActiveLayer: (id) => set({ activeLayerId: id }),

  toggleLayerVisibility: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, visible: !l.visible } : l
      ),
    })),

  toggleLayerLock: (id) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, locked: !l.locked } : l
      ),
    })),

  setLayerOpacity: (id, opacity) =>
    set((state) => ({
      layers: state.layers.map((l) =>
        l.id === id ? { ...l, opacity: Math.max(0, Math.min(1, opacity)) } : l
      ),
    })),

  // Filter actions
  addFilter: (filter) =>
    set((state) => ({
      filters: [...state.filters, filter],
    })),

  removeFilter: (id) =>
    set((state) => ({
      filters: state.filters.filter((f) => f.id !== id),
    })),

  updateFilter: (id, updates) =>
    set((state) => ({
      filters: state.filters.map((f) =>
        f.id === id ? { ...f, ...updates } : f
      ),
    })),

  toggleFilter: (id) =>
    set((state) => ({
      filters: state.filters.map((f) =>
        f.id === id ? { ...f, enabled: !f.enabled } : f
      ),
    })),

  setFilterParam: (id, param, value) =>
    set((state) => ({
      filters: state.filters.map((f) =>
        f.id === id
          ? { ...f, params: { ...f.params, [param]: value } }
          : f
      ),
    })),

  resetFilters: () => set({ filters: [...defaultFilters] }),

  // Tool actions
  setActiveTool: (tool) => set({ activeTool: tool }),
  setBrushSize: (size) => set({ brushSize: Math.max(1, Math.min(100, size)) }),
  setBrushColor: (color) => set({ brushColor: color }),
}));
