/**
 * FFA Store — FFA/ICGA time-series state management.
 *
 * Manages:
 * - Phase annotations (pre-arterial, arterial, arteriovenous, venous, late)
 * - Leakage markers
 * - Fluorescence intensity ROIs
 */

import { create } from 'zustand';

export type FfaPhaseType = 'pre-arterial' | 'arterial' | 'arteriovenous' | 'venous' | 'late';

export interface FfaPhase {
  type: FfaPhaseType;
  label: string;
  startFrame: number;
  endFrame: number;
  startTimeSec: number;
  endTimeSec: number;
  color: string;
}

export interface LeakageMarker {
  id: string;
  x: number;
  y: number;
  radius: number;
  frameIndex: number;
  area: number; // mm²
  label?: string;
}

export interface FluorescenceRoi {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
  /** Intensity values per frame */
  intensityCurve: number[];
}

export const FFA_PHASES: Omit<FfaPhase, 'startFrame' | 'endFrame'>[] = [
  { type: 'pre-arterial', label: '动脉前期', startTimeSec: 0, endTimeSec: 10, color: '#4a90d9' },
  { type: 'arterial', label: '动脉期', startTimeSec: 10, endTimeSec: 15, color: '#e74c3c' },
  { type: 'arteriovenous', label: '动静脉期', startTimeSec: 15, endTimeSec: 20, color: '#e67e22' },
  { type: 'venous', label: '静脉期', startTimeSec: 20, endTimeSec: 60, color: '#2ecc71' },
  { type: 'late', label: '晚期', startTimeSec: 60, endTimeSec: 900, color: '#9b59b6' },
];

interface FfaState {
  phases: FfaPhase[];
  leakageMarkers: LeakageMarker[];
  fluorescenceRois: FluorescenceRoi[];
  currentPhase: FfaPhaseType | null;
  totalDurationSec: number;
  fps: number;
}

interface FfaActions {
  setPhases: (phases: FfaPhase[]) => void;
  autoDetectPhases: (totalFrames: number, fps: number) => void;
  addLeakageMarker: (m: LeakageMarker) => void;
  removeLeakageMarker: (id: string) => void;
  addFluorescenceRoi: (r: FluorescenceRoi) => void;
  removeFluorescenceRoi: (id: string) => void;
  updateRoiIntensity: (id: string, frameIndex: number, intensity: number) => void;
  setCurrentPhase: (phase: FfaPhaseType | null) => void;
  clearAll: () => void;
}

export const useFfaStore = create<FfaState & FfaActions>((set) => ({
  phases: [],
  leakageMarkers: [],
  fluorescenceRois: [],
  currentPhase: null,
  totalDurationSec: 0,
  fps: 10,

  setPhases: (phases) => set({ phases }),

  autoDetectPhases: (totalFrames, fps) => {
    const totalSec = totalFrames / fps;
    const phases: FfaPhase[] = FFA_PHASES.map((p) => {
      const startFrame = Math.round((p.startTimeSec / totalSec) * totalFrames);
      const endFrame = Math.min(
        totalFrames - 1,
        Math.round((p.endTimeSec / totalSec) * totalFrames)
      );
      return { ...p, startFrame, endFrame };
    });
    set({ phases, totalDurationSec: totalSec, fps });
  },

  addLeakageMarker: (m) =>
    set((s) => ({ leakageMarkers: [...s.leakageMarkers, m] })),

  removeLeakageMarker: (id) =>
    set((s) => ({ leakageMarkers: s.leakageMarkers.filter((m) => m.id !== id) })),

  addFluorescenceRoi: (r) =>
    set((s) => ({ fluorescenceRois: [...s.fluorescenceRois, r] })),

  removeFluorescenceRoi: (id) =>
    set((s) => ({ fluorescenceRois: s.fluorescenceRois.filter((r) => r.id !== id) })),

  updateRoiIntensity: (id, frameIndex, intensity) =>
    set((s) => ({
      fluorescenceRois: s.fluorescenceRois.map((r) => {
        if (r.id !== id) return r;
        const curve = [...r.intensityCurve];
        curve[frameIndex] = intensity;
        return { ...r, intensityCurve: curve };
      }),
    })),

  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  clearAll: () =>
    set({ phases: [], leakageMarkers: [], fluorescenceRois: [], currentPhase: null }),
}));
