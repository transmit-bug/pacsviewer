import { create } from 'zustand';
import { studyApi } from '@/services/api';

interface Series {
  id: string;
  modality: string;
  seriesNumber: number;
  seriesDescription?: string;
}

interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  studyTime?: string;
  modality: string;
  device?: string;
  physicianId?: string;
  status: string;
  description?: string;
  tags?: string[];
  series?: Series[];
  createdAt: string;
  updatedAt: string;
}

interface StudyState {
  studies: Study[];
  selectedStudy: Study | null;
  loading: boolean;
  error: string | null;
  filters: {
    patientId?: string;
    status?: string;
  };
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface StudyActions {
  loadStudies: (page?: number) => Promise<void>;
  loadStudy: (id: string) => Promise<void>;
  createStudy: (data: Partial<Study>) => Promise<void>;
  updateStudy: (id: string, data: Partial<Study>) => Promise<void>;
  deleteStudy: (id: string) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  setSelectedStudy: (study: Study | null) => void;
  setFilters: (filters: Partial<StudyState['filters']>) => void;
  clearError: () => void;
}

export const useStudyStore = create<StudyState & StudyActions>((set, get) => ({
  studies: [],
  selectedStudy: null,
  loading: false,
  error: null,
  filters: {},
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },

  loadStudies: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const { filters } = get();
      const response = await studyApi.getAll({ page, pageSize: 20, ...filters });
      set({
        studies: response.data.items,
        pagination: {
          page: response.data.page,
          pageSize: response.data.pageSize,
          total: response.data.total,
          totalPages: response.data.totalPages,
        },
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载检查失败',
        loading: false,
      });
    }
  },

  loadStudy: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await studyApi.getById(id);
      set({
        selectedStudy: response.data,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载检查失败',
        loading: false,
      });
    }
  },

  createStudy: async (data: Partial<Study>) => {
    set({ loading: true, error: null });
    try {
      await studyApi.create(data);
      await get().loadStudies();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '创建检查失败',
        loading: false,
      });
    }
  },

  updateStudy: async (id: string, data: Partial<Study>) => {
    set({ loading: true, error: null });
    try {
      await studyApi.update(id, data);
      await get().loadStudy(id);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新检查失败',
        loading: false,
      });
    }
  },

  deleteStudy: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await studyApi.delete(id);
      set((state) => ({
        studies: state.studies.filter(s => s.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '删除检查失败',
        loading: false,
      });
    }
  },

  updateStatus: async (id: string, status: string) => {
    set({ loading: true, error: null });
    try {
      await studyApi.updateStatus(id, status);
      set((state) => ({
        studies: state.studies.map(s => 
          s.id === id ? { ...s, status } : s
        ),
        selectedStudy: state.selectedStudy?.id === id 
          ? { ...state.selectedStudy, status } 
          : state.selectedStudy,
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新状态失败',
        loading: false,
      });
    }
  },

  setSelectedStudy: (study) => set({ selectedStudy: study }),
  setFilters: (filters) => set((state) => ({ filters: { ...state.filters, ...filters } })),
  clearError: () => set({ error: null }),
}));
