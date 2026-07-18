import axios from 'axios';
import { useAuthStore } from '@/stores/authStore';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor - 从 Zustand store 读取 token
api.interceptors.request.use(
  (config) => {
    const token = useAuthStore.getState().token;
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = useAuthStore.getState().refreshToken;
        const response = await axios.post('/api/auth/refresh', { refreshToken });
        const { token, refreshToken: newRefreshToken } = response.data.data;

        // 更新 Zustand store（会自动同步到 localStorage）
        useAuthStore.setState({
          token,
          refreshToken: newRefreshToken,
        });

        originalRequest.headers.Authorization = `Bearer ${token}`;
        return api(originalRequest);
      } catch (refreshError) {
        // 刷新失败，清除登录状态并跳转
        useAuthStore.getState().logout();
        window.location.href = '/login';
        return Promise.reject(refreshError);
      }
    }

    return Promise.reject(error);
  }
);

export default api;

// API functions
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  logout: () => api.post('/auth/logout'),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  getProfile: () => api.get('/auth/me'),
};

export const patientApi = {
  getAll: (params?: any) => api.get('/patients', { params }),
  getById: (id: string) => api.get(`/patients/${id}`),
  create: (data: any) => api.post('/patients', data),
  update: (id: string, data: any) => api.put(`/patients/${id}`, data),
  delete: (id: string) => api.delete(`/patients/${id}`),
  search: (query: string, limit?: number) => api.get('/patients/search', { params: { q: query, ...(limit && { limit }) } }),
  getRecent: (limit?: number) => api.get('/patients/recent', { params: { limit } }),
  getStudies: (id: string) => api.get(`/patients/${id}/studies`),
  getTimeline: (id: string) => api.get(`/patients/${id}/timeline`),
};

export const studyApi = {
  getAll: (params?: any) => api.get('/studies', { params }),
  getById: (id: string) => api.get(`/studies/${id}`),
  create: (data: any) => api.post('/studies', data),
  update: (id: string, data: any) => api.put(`/studies/${id}`, data),
  delete: (id: string) => api.delete(`/studies/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put(`/studies/${id}/status`, { status }),
  getSeries: (id: string) => api.get(`/studies/${id}/series`),
};

export const imageApi = {
  upload: (formData: FormData) =>
    api.post('/images/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadDicom: (formData: FormData) =>
    api.post('/images/upload-dicom', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  uploadBatch: (formData: FormData) =>
    api.post('/images/upload/batch', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getById: (id: string) => api.get(`/images/${id}`),
  getMetadata: (id: string) => api.get(`/images/${id}/dicom-metadata`),
  getFile: (id: string) => `/api/images/${id}/file`,
  getThumbnail: (id: string) => `/api/images/${id}/thumbnail`,
  delete: (id: string) => api.delete(`/images/${id}`),
  search: (params: any) => api.get('/images/search', { params }),
  export: (params: any) => api.post('/images/export', params),
};

export const dicomwebApi = {
  getFrames: (imageId: string) => api.get(`/dicomweb/images/${imageId}/frames`),
};

export const reportApi = {
  getAll: (params?: any) => api.get('/reports', { params }),
  getById: (id: string) => api.get(`/reports/${id}`),
  create: (data: any) => api.post('/reports', data),
  update: (id: string, data: any) => api.put(`/reports/${id}`, data),
  delete: (id: string) => api.delete(`/reports/${id}`),
  updateStatus: (id: string, status: string) =>
    api.put(`/reports/${id}/status`, { status }),
  getPdf: (id: string) => `/api/reports/${id}/pdf`,
  getVersions: (id: string) => api.get(`/reports/${id}/versions`),
  getVersionDiff: (id: string, v1: number, v2: number) =>
    api.get(`/reports/${id}/versions/diff`, { params: { v1, v2 } }),
};

export const reportTemplateApi = {
  getAll: () => api.get('/report-templates'),
  getById: (id: string) => api.get(`/report-templates/${id}`),
  create: (data: any) => api.post('/report-templates', data),
  update: (id: string, data: any) => api.put(`/report-templates/${id}`, data),
  delete: (id: string) => api.delete(`/report-templates/${id}`),
};

export const annotationApi = {
  getByImage: (imageId: string) => api.get(`/images/${imageId}/annotations`),
  create: (imageId: string, data: any) =>
    api.post(`/images/${imageId}/annotations`, data),
  update: (id: string, data: any) => api.put(`/annotations/${id}`, data),
  delete: (id: string) => api.delete(`/annotations/${id}`),
  // Study-level annotations
  getByStudy: (studyId: string) => api.get(`/annotations/study/${studyId}`),
  createStudyLevel: (data: any) => api.post(`/annotations`, data),
  list: (params?: { imageId?: string; studyId?: string }) =>
    api.get('/annotations', { params }),
  // Cornerstone annotation sync (batch)
  sync: (imageId: string, annotations: any[]) =>
    api.post('/annotations/sync', { imageId, annotations }),
  // Get annotations in SerializedAnnotation format
  getForImage: (imageId: string) => api.get(`/annotations/image/${imageId}`),
};

export const layerApi = {
  getByImage: (imageId: string) => api.get(`/images/${imageId}/layers`),
  create: (imageId: string, data: any) =>
    api.post(`/images/${imageId}/layers`, data),
  update: (id: string, data: any) => api.put(`/layers/${id}`, data),
  delete: (id: string) => api.delete(`/layers/${id}`),
  updateOrder: (id: string, order: number) =>
    api.put(`/layers/${id}/order`, { order }),
};

export const userApi = {
  getAll: (params?: any) => api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  create: (data: any) => api.post('/users', data),
  update: (id: string, data: any) => api.put(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
  updatePassword: (id: string, data: any) =>
    api.put(`/users/${id}/password`, data),
  updateStatus: (id: string, status: string) =>
    api.put(`/users/${id}/status`, { status }),
};

export const roleApi = {
  getAll: () => api.get('/roles'),
  create: (data: any) => api.post('/roles', data),
  update: (id: string, data: any) => api.put(`/roles/${id}`, data),
  delete: (id: string) => api.delete(`/roles/${id}`),
};

export const auditLogApi = {
  getAll: (params?: any) => api.get('/audit-logs', { params }),
  export: (params?: any) => api.get('/audit-logs/export', { params, responseType: 'blob' }),
};

export const comparisonApi = {
  getAll: (params?: { patientId?: string; isFavorite?: boolean }) =>
    api.get('/comparisons', { params }),
  getFavorites: () => api.get('/comparisons/favorites'),
  getById: (id: string) => api.get(`/comparisons/${id}`),
  create: (data: {
    name: string;
    type: 'side_by_side' | 'overlay' | 'slider';
    config: any;
    imageIds?: string[];
    patientId?: string;
    isFavorite?: boolean;
  }) => api.post('/comparisons', data),
  update: (id: string, data: any) => api.put(`/comparisons/${id}`, data),
  delete: (id: string) => api.delete(`/comparisons/${id}`),
  toggleFavorite: (id: string) => api.put(`/comparisons/${id}/favorite`),
  saveSnapshot: (id: string, image: string) =>
    api.post(`/comparisons/${id}/snapshot`, { image }),
  getSnapshotUrl: (id: string) => `/api/comparisons/${id}/snapshot`,
};

export const deviceApi = {
  getAll: (params?: any) => api.get('/devices', { params }),
  getById: (id: string) => api.get(`/devices/${id}`),
  create: (data: any) => api.post('/devices', data),
  update: (id: string, data: any) => api.put(`/devices/${id}`, data),
  delete: (id: string) => api.delete(`/devices/${id}`),
  getTransfers: (deviceId: string) => api.get(`/devices/${deviceId}/transfers`),
};

export const transferApi = {
  getAll: (params?: { page?: number; pageSize?: number; status?: string; deviceId?: string }) =>
    api.get('/transfers', { params }),
  getById: (id: string) => api.get(`/transfers/${id}`),
  updateStatus: (id: string, data: { status: string; processedCount?: number; errorCount?: number }) =>
    api.put(`/transfers/${id}/status`, data),
  retry: (id: string) => api.post(`/transfers/${id}/retry`),
};

export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getRecentStudies: (limit?: number) => api.get('/dashboard/recent-studies', { params: { limit } }),
  getPendingTasks: (limit?: number) => api.get('/dashboard/pending-tasks', { params: { limit } }),
};
