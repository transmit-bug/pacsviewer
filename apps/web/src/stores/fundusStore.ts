/**
 * Fundus Store — manages fundus-specific measurements and annotations.
 *
 * Stores:
 * - Cup/Disc measurements (optic disc and cup boundaries)
 * - AV ratio measurements (arteries and veins)
 * - Lesion markers (microaneurysms, hemorrhages, exudates, etc.)
 */

import { create } from 'zustand';

export type LesionType =
  | 'microaneurysm'
  | 'hemorrhage'
  | 'hard_exudate'
  | 'cotton_wool'
  | 'neovascularization'
  | 'drusen'
  | 'other';

export interface Lesion {
  id: string;
  type: LesionType;
  x: number;
  y: number;
  radius: number;
  area: number;      // mm²
  color: string;
  label?: string;
}

export interface CupDiscMeasurement {
  id: string;
  imageId: string;
  // Disc boundary (ellipse parameters)
  discCenterX: number;
  discCenterY: number;
  discRadiusX: number;
  discRadiusY: number;
  discArea: number;        // mm²
  discDiameter: number;    // mm (average)
  // Cup boundary (ellipse parameters)
  cupCenterX: number;
  cupCenterY: number;
  cupRadiusX: number;
  cupRadiusY: number;
  cupArea: number;         // mm²
  // Ratios
  cdRatio: number;              // area-based C/D ratio
  cdRatioHorizontal: number;    // horizontal C/D
  cdRatioVertical: number;      // vertical C/D
  rimWidth: number[];           // rim width at 8 meridians
}

export interface VesselSegment {
  id: string;
  type: 'artery' | 'vein';
  points: Array<{ x: number; y: number }>;
  diameter: number;  // mm
}

export interface AvRatioMeasurement {
  id: string;
  imageId: string;
  arteries: VesselSegment[];
  veins: VesselSegment[];
  arteryAvgDiameter: number;
  veinAvgDiameter: number;
  avRatio: number;
}

interface FundusState {
  cupDiscMeasurements: CupDiscMeasurement[];
  avRatioMeasurements: AvRatioMeasurement[];
  lesions: Lesion[];
  activeTool: 'cup-disc' | 'av-ratio' | 'lesion' | null;
  activeLesionType: LesionType;
}

interface FundusActions {
  addCupDisc: (m: CupDiscMeasurement) => void;
  removeCupDisc: (id: string) => void;
  addAvRatio: (m: AvRatioMeasurement) => void;
  removeAvRatio: (id: string) => void;
  addLesion: (l: Lesion) => void;
  removeLesion: (id: string) => void;
  clearLesions: () => void;
  setActiveTool: (tool: 'cup-disc' | 'av-ratio' | 'lesion' | null) => void;
  setActiveLesionType: (type: LesionType) => void;
  clearAll: () => void;
}

export const LESION_COLORS: Record<LesionType, string> = {
  microaneurysm: '#ff0000',
  hemorrhage: '#cc0000',
  hard_exudate: '#ffff00',
  cotton_wool: '#ffffff',
  neovascularization: '#ff6600',
  drusen: '#ffcc00',
  other: '#888888',
};

export const LESION_LABELS: Record<LesionType, string> = {
  microaneurysm: '微动脉瘤',
  hemorrhage: '出血',
  hard_exudate: '硬性渗出',
  cotton_wool: '棉絮斑',
  neovascularization: '新生血管',
  drusen: '玻璃膜疣',
  other: '其他',
};

export const useFundusStore = create<FundusState & FundusActions>((set) => ({
  cupDiscMeasurements: [],
  avRatioMeasurements: [],
  lesions: [],
  activeTool: null,
  activeLesionType: 'microaneurysm',

  addCupDisc: (m) =>
    set((state) => ({ cupDiscMeasurements: [...state.cupDiscMeasurements, m] })),

  removeCupDisc: (id) =>
    set((state) => ({
      cupDiscMeasurements: state.cupDiscMeasurements.filter((m) => m.id !== id),
    })),

  addAvRatio: (m) =>
    set((state) => ({ avRatioMeasurements: [...state.avRatioMeasurements, m] })),

  removeAvRatio: (id) =>
    set((state) => ({
      avRatioMeasurements: state.avRatioMeasurements.filter((m) => m.id !== id),
    })),

  addLesion: (l) =>
    set((state) => ({ lesions: [...state.lesions, l] })),

  removeLesion: (id) =>
    set((state) => ({ lesions: state.lesions.filter((l) => l.id !== id) })),

  clearLesions: () => set({ lesions: [] }),

  setActiveTool: (tool) => set({ activeTool: tool }),

  setActiveLesionType: (type) => set({ activeLesionType: type }),

  clearAll: () =>
    set({
      cupDiscMeasurements: [],
      avRatioMeasurements: [],
      lesions: [],
    }),
}));
