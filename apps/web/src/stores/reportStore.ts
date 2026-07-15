import { create } from 'zustand';
import { reportApi, reportTemplateApi } from '@/services/api';

interface Report {
  id: string;
  studyId: string;
  patientId: string;
  templateId: string;
  title: string;
  content: Record<string, any>;
  images: string[];
  status: string;
  reviewerId?: string;
  reviewNotes?: string;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  fields: Record<string, any>[];
  layout: Record<string, any>;
  isSystem: boolean;
}

interface ReportState {
  reports: Report[];
  selectedReport: Report | null;
  templates: ReportTemplate[];
  selectedTemplate: ReportTemplate | null;
  loading: boolean;
  error: string | null;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

interface ReportActions {
  loadReports: (page?: number) => Promise<void>;
  loadReport: (id: string) => Promise<void>;
  createReport: (data: Partial<Report>) => Promise<void>;
  updateReport: (id: string, data: Partial<Report>) => Promise<void>;
  deleteReport: (id: string) => Promise<void>;
  updateStatus: (id: string, status: string) => Promise<void>;
  loadTemplates: () => Promise<void>;
  setSelectedReport: (report: Report | null) => void;
  setSelectedTemplate: (template: ReportTemplate | null) => void;
  clearError: () => void;
}

export const useReportStore = create<ReportState & ReportActions>((set, get) => ({
  reports: [],
  selectedReport: null,
  templates: [],
  selectedTemplate: null,
  loading: false,
  error: null,
  pagination: {
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 0,
  },

  loadReports: async (page = 1) => {
    set({ loading: true, error: null });
    try {
      const response = await reportApi.getAll({ page, pageSize: 20 });
      set({
        reports: response.data.items,
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
        error: error instanceof Error ? error.message : '加载报告失败',
        loading: false,
      });
    }
  },

  loadReport: async (id: string) => {
    set({ loading: true, error: null });
    try {
      const response = await reportApi.getById(id);
      set({
        selectedReport: response.data,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载报告失败',
        loading: false,
      });
    }
  },

  createReport: async (data: Partial<Report>) => {
    set({ loading: true, error: null });
    try {
      await reportApi.create(data);
      await get().loadReports();
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '创建报告失败',
        loading: false,
      });
    }
  },

  updateReport: async (id: string, data: Partial<Report>) => {
    set({ loading: true, error: null });
    try {
      await reportApi.update(id, data);
      await get().loadReport(id);
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新报告失败',
        loading: false,
      });
    }
  },

  deleteReport: async (id: string) => {
    set({ loading: true, error: null });
    try {
      await reportApi.delete(id);
      set((state) => ({
        reports: state.reports.filter((r) => r.id !== id),
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '删除报告失败',
        loading: false,
      });
    }
  },

  updateStatus: async (id: string, status: string) => {
    set({ loading: true, error: null });
    try {
      await reportApi.updateStatus(id, status);
      set((state) => ({
        reports: state.reports.map((r) => (r.id === id ? { ...r, status } : r)),
        selectedReport:
          state.selectedReport?.id === id
            ? { ...state.selectedReport, status }
            : state.selectedReport,
        loading: false,
      }));
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '更新状态失败',
        loading: false,
      });
    }
  },

  loadTemplates: async () => {
    set({ loading: true, error: null });
    try {
      const response = await reportTemplateApi.getAll();
      set({
        templates: response.data.items || response.data,
        loading: false,
      });
    } catch (error) {
      set({
        error: error instanceof Error ? error.message : '加载模板失败',
        loading: false,
      });
    }
  },

  setSelectedReport: (report) => set({ selectedReport: report }),
  setSelectedTemplate: (template) => set({ selectedTemplate: template }),
  clearError: () => set({ error: null }),
}));
