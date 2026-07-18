/**
 * Measurement Store — manages Cornerstone native measurements with real units.
 *
 * Replaces the Canvas 2D annotation system. All measurements use Cornerstone's
 * world coordinate system and are calibrated via DICOM PixelSpacing.
 *
 * Data flows:
 *   Cornerstone annotationState → SerializedAnnotation[] → backend
 *   backend → SerializedAnnotation[] → annotationState.restore()
 */

import { create } from 'zustand';

/** Serialized annotation from Cornerstone's annotation state */
export interface SerializedAnnotation {
  id: string;
  toolName: string;   // Length, Angle, EllipticalROI, RectangleROI, etc.
  data: {
    handles: Array<{ x: number; y: number; z: number }>;  // world coordinates
    cachedStats?: Record<string, any>;  // measurement results (length, area, etc.)
    label?: string;
    text?: string;   // for ArrowAnnotate
  };
  style?: {
    color: string;
    lineWidth: number;
  };
}

/** Display-ready measurement result */
export interface MeasurementResult {
  id: string;
  toolName: string;
  label: string;
  value: number | null;       // numeric value (mm, mm², degrees)
  unit: string;               // 'mm' | 'mm²' | '°' | ''
  displayText: string;        // formatted string for UI
  handles: Array<{ x: number; y: number; z: number }>;
}

interface MeasurementState {
  /** Serialized annotations from Cornerstone */
  annotations: SerializedAnnotation[];

  /** Display-ready measurement results */
  measurements: MeasurementResult[];

  /** Current image ID that annotations belong to */
  currentImageId: string | null;

  /** Measurement unit preference */
  unit: 'mm' | 'cm' | 'μm';

  /** Default annotation style */
  defaultStyle: {
    color: string;
    lineWidth: number;
  };
}

interface MeasurementActions {
  /** Load annotations from backend */
  setAnnotations: (annotations: SerializedAnnotation[]) => void;

  /** Add a single annotation */
  addAnnotation: (annotation: SerializedAnnotation) => void;

  /** Update an annotation */
  updateAnnotation: (id: string, updates: Partial<SerializedAnnotation>) => void;

  /** Remove an annotation */
  removeAnnotation: (id: string) => void;

  /** Set all measurements */
  setMeasurements: (measurements: MeasurementResult[]) => void;

  /** Set current image ID */
  setCurrentImageId: (id: string | null) => void;

  /** Set measurement unit */
  setUnit: (unit: 'mm' | 'cm' | 'μm') => void;

  /** Set default style */
  setDefaultStyle: (style: { color: string; lineWidth: number }) => void;

  /** Clear all annotations */
  clearAll: () => void;
}

export const useMeasurementStore = create<MeasurementState & MeasurementActions>((set) => ({
  annotations: [],
  measurements: [],
  currentImageId: null,
  unit: 'mm',
  defaultStyle: {
    color: '#ffff00',
    lineWidth: 2,
  },

  setAnnotations: (annotations) => set({ annotations }),

  addAnnotation: (annotation) =>
    set((state) => ({
      annotations: [...state.annotations, annotation],
    })),

  updateAnnotation: (id, updates) =>
    set((state) => ({
      annotations: state.annotations.map((a) =>
        a.id === id ? { ...a, ...updates } : a
      ),
    })),

  removeAnnotation: (id) =>
    set((state) => ({
      annotations: state.annotations.filter((a) => a.id !== id),
    })),

  setMeasurements: (measurements) => set({ measurements }),

  setCurrentImageId: (id) => set({ currentImageId: id }),

  setUnit: (unit) => set({ unit }),

  setDefaultStyle: (style) => set({ defaultStyle: style }),

  clearAll: () => set({ annotations: [], measurements: [] }),
}));
