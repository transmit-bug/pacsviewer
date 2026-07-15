import { create } from 'zustand';
import { patientApi } from '@/services/api';

interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender: string;
  birthDate: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

interface PatientState {
  patients: Patient[];
  selectedPatient: Patient | null;
  loading: boolean;
  error: string | null;
  searchQuery: string;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface PatientActions {
  loadPatients: (page?: number) => Promise<void>;
  searchPatients: (query: string) => Promise<void>;
  loadPatient: (id: string) => Promise<void>;
  createPatient: (data: Partial<Patient>) => Promise<void>;
  updatePatient: (id: string, data: Partial<Patient>) => Promise<void>;
  deletePatient: (id: string) => Promise<void>;
  setSelectedPatient: (patient: Patient | null) => void;
  setSearchQuery: (query: string) => void;
  clearError: () => void;
}

export const usePatientStore = create<PatientState & PatientActions>((set, get) => ({
  patients: [],
  selectedPatient: null,
  loading: false,
  error: null,
  searchQuery: '',
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },

  loadPatients: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const response = await patientApi.getAll({ page, pageSize: 20 });
      set({
        patients: response.data.items,
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
        error: error instanceof Error ? error.message : '加载患者失败',
        loading: false,
      });
    }
  },

  searchPatients: async (query: string) => {
    set({ loading: true, error: null, searchQuery: query });
    try {
      const response = await patientApi.search(query);
      set({
        patients: response.data,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '搜索失败',
        loading: false,
      });
    }
  },

  loadPatient: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await patientApi.getById(id);
      set({
        selectedPatient: response.data,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载患者失败',
        loading: false,
      });
    }
  },

  createPatient: async (data: Partial<Patient>) => {
    set({ loading: true, error: null });
    try {
      await patientApi.create(data);
      await get().loadPatients();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '创建患者失败',
        loading: false,
      });
    }
  },

  updatePatient: async (id: string, data: Partial<Patient>) => {
    set({ loading: true, error: null });
    try {
      await patientApi.update(id, data);
      await get().loadPatient(id);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新患者失败',
        loading: false,
      });
    }
  },

  deletePatient: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await patientApi.delete(id);
      set((state) => ({
        patients: state.patients.filter(p => p.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '删除患者失败',
        loading: false,
      });
    }
  },

  setSelectedPatient: (patient) => set({ selectedPatient: patient }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  clearError: () => set({ error: null }),
}));
