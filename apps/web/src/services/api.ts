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

/**
 * 共享的刷新请求（Promise 单例）。
 *
 * 服务端 refresh 会轮换 refresh token（每次刷新写入新的 token/refreshToken），
 * 因此并发 401 如果各自发一次刷新，第一个会成功、其余会因 token 已被轮换而 401，
 * 进而全部走登出逻辑把用户踢下线（表现：点一次、多次刷新、被登出）。
 * 这里让所有并发 401 复用同一个刷新请求，只轮换一次。
 */
let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken } = useAuthStore.getState();
  const response = await axios.post('/api/auth/refresh', { refreshToken });
  const { token, refreshToken: newRefreshToken } = response.data.data;

  // 更新 Zustand store（会自动同步到 localStorage）
  useAuthStore.setState({
    token,
    refreshToken: newRefreshToken,
  });

  return token;
}

function redirectToLogin() {
  // 并发失败时只跳转一次，避免重复整页刷新
  if (!window.location.pathname.startsWith('/login')) {
    window.location.href = '/login';
  }
}

// Response interceptor
api.interceptors.response.use(
  (response) => response.data,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = useAuthStore.getState().refreshToken;
      if (!refreshToken) {
        // 没有 refresh token 无法恢复，直接登出跳转（避免带 null 去刷新的无谓请求）
        useAuthStore.getState().logout();
        redirectToLogin();
        return Promise.reject(error);
      }

      if (!refreshPromise) refreshPromise = refreshAccessToken();
      const currentRefresh = refreshPromise;

      try {
        const token = await currentRefresh;
        originalRequest.headers.Authorization = `Bearer ${token}`;
        // 刷新后重试: 显式 await —— 若重试仍失败 (如孤儿会话: 刷新"成功"
        // 但用户已不存在), 走 catch 登出并跳转登录页, 而不是静默 reject
        // 导致控制台刷 401、主界面空数据且永不跳转 (2026-08-15 排查)。
        return await api(originalRequest);
      } catch (refreshError) {
        // 刷新失败或刷新后重试仍失败: 清除登录状态并跳转
        useAuthStore.getState().logout();
        redirectToLogin();
        return Promise.reject(refreshError);
      } finally {
        if (refreshPromise === currentRefresh) refreshPromise = null;
      }
    }

    // 首登强制改密的残留会话 (#139): 除改密闭环外全部 API 被 403 拦截。
    // 本地存储里的旧会话没有 mustChangePassword 标记时走到这里,
    // 登出后重新登录即可进入强制改密流程。
    if (
      error.response?.status === 403 &&
      typeof error.response?.data?.message === 'string' &&
      error.response.data.message.includes('修改初始密码') &&
      !window.location.pathname.startsWith('/login')
    ) {
      useAuthStore.getState().logout();
      redirectToLogin();
    }

    return Promise.reject(error);
  }
);

export default api;

// API functions
export const authApi = {
  login: (username: string, password: string) =>
    api.post('/auth/login', { username, password }),
  /** 一键演示登录 — 凭据只在服务端, 前端不接触账号密码 */
  demoLogin: () => api.post('/auth/demo-login'),
  logout: () => api.post('/auth/logout'),
  refreshToken: (refreshToken: string) =>
    api.post('/auth/refresh', { refreshToken }),
  getProfile: () => api.get('/auth/me'),
  /** 自助改密 (含首登强制改密) (#139) */
  changePassword: (currentPassword: string, newPassword: string) =>
    api.put('/auth/change-password', { currentPassword, newPassword }),
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

// NOTE: the legacy /compare page's saved-comparisons client (favorites,
// snapshots) was retired when /compare evolved into the follow-up workbench
// (wayfinder #91). The server /api/comparisons route remains for API
// compatibility; no client calls it anymore.

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

/** Measurement dictionary + longitudinal trends (随访对比 T2). */
export const measurementApi = {
  getDefinitions: () => api.get('/measurements/definitions'),
  getDefinition: (key: string) => api.get(`/measurements/definitions/${key}`),
  createDefinition: (data: any) => api.post('/measurements/definitions', data),
  updateDefinition: (key: string, data: any) => api.put(`/measurements/definitions/${key}`, data),
  deleteDefinition: (key: string) => api.delete(`/measurements/definitions/${key}`),
  getTrends: (params: { patientId?: string; studyIds?: string[] }) =>
    api.get('/measurements/trends', {
      params: {
        ...(params.patientId ? { patientId: params.patientId } : {}),
        ...(params.studyIds?.length ? { studyIds: params.studyIds.join(',') } : {}),
      },
    }),
  /** Export measurement points as UTF-8 BOM CSV (browser download, #130). */
  exportCsv: (params: { patientId?: string; studyIds?: string[] }) =>
    api.get('/measurements/export', {
      params: {
        ...(params.patientId ? { patientId: params.patientId } : {}),
        ...(params.studyIds?.length ? { studyIds: params.studyIds.join(',') } : {}),
      },
      responseType: 'blob',
    }),
};

/** Follow-up records (随访对比 T1/T5). */
export const followUpApi = {
  list: (params: { patientId?: string; page?: number; pageSize?: number }) =>
    api.get('/follow-up', { params }),
  getById: (id: string) => api.get(`/follow-up/${id}`),
  create: (data: { patientId: string; baselineStudyId: string; comparisonStudyId: string; notes?: string }) =>
    api.post('/follow-up', data),
  update: (id: string, data: { notes?: string }) => api.put(`/follow-up/${id}`, data),
  delete: (id: string) => api.delete(`/follow-up/${id}`),
  compare: (id: string) => api.get(`/follow-up/${id}/compare`),
};
