import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import i18n from '@/i18n';

interface AuthState {
  user: any | null;
  token: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  /** 是否通过一键演示登录进入 (演示模式全局标识的依据) */
  isDemo: boolean;
  /** 首登强制改密: 登录响应携带 mustChangePassword 时为 true (#139) */
  mustChangePassword: boolean;
  isLoading: boolean;
  isHydrated: boolean;
  error: string | null;
}

interface AuthActions {
  login: (username: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  /** 自助改密 (含首登强制改密): 成功返回 true (#139) */
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  logout: () => void;
  refreshTokenAction: () => Promise<void>;
  setUser: (user: any) => void;
  clearError: () => void;
  setHydrated: (hydrated: boolean) => void;
}

/** 登录成功后的会话落库 (login / demoLogin 共用) */
function applySession(set: any, data: any, extra?: Partial<AuthState>) {
  set({
    user: data.user,
    token: data.token,
    refreshToken: data.refreshToken,
    mustChangePassword: !!data.mustChangePassword,
    isAuthenticated: true,
    isLoading: false,
    error: null,
    ...extra,
  });
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      refreshToken: null,
      isAuthenticated: false,
      isDemo: false,
      mustChangePassword: false,
      isLoading: false,
      isHydrated: false,
      error: null,

      login: async (username: string, password: string) => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password }),
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || i18n.t('auth.loginFailed'));
          }

          applySession(set, (await response.json()).data);
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : '登录失败',
            isLoading: false,
          });
        }
      },

      demoLogin: async () => {
        set({ isLoading: true, error: null });
        try {
          const response = await fetch('/api/auth/demo-login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '登录失败');
          }

          applySession(set, (await response.json()).data, { isDemo: true });
        } catch (error) {
          set({
            error: error instanceof Error ? error.message : i18n.t('auth.loginFailed'),
            isLoading: false,
          });
        }
      },

      changePassword: async (currentPassword: string, newPassword: string) => {
        const { token } = get();
        if (!token) return false;
        try {
          const response = await fetch('/api/auth/change-password', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ currentPassword, newPassword }),
          });
          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || '密码修改失败');
          }
          // 改密成功: 清除强制标记, 用户可正常使用系统
          set({
            mustChangePassword: false,
            error: null,
            user: get().user ? { ...get().user, mustChangePassword: false } : null,
          });
          return true;
        } catch (error) {
          set({ error: error instanceof Error ? error.message : '密码修改失败' });
          return false;
        }
      },

      logout: () => {
        set({
          user: null,
          token: null,
          refreshToken: null,
          isAuthenticated: false,
          isDemo: false,
          mustChangePassword: false,
        });
      },

      refreshTokenAction: async () => {
        const { refreshToken } = get();
        if (!refreshToken) return;

        try {
          const response = await fetch('/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refreshToken }),
          });

          if (!response.ok) {
            throw new Error(i18n.t('auth.refreshTokenFailed'));
          }

          const responseData = await response.json();
          const data = responseData.data;
          set({
            token: data.token,
            refreshToken: data.refreshToken,
          });
        } catch (error) {
          get().logout();
        }
      },

      setUser: (user: any) => set({ user }),
      clearError: () => set({ error: null }),
      setHydrated: (hydrated: boolean) => set({ isHydrated: hydrated }),
    }),
    {
      name: 'auth-storage',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        refreshToken: state.refreshToken,
        isAuthenticated: state.isAuthenticated,
        isDemo: state.isDemo,
      }),
      onRehydrateStorage: () => (state) => {
        if (state) {
          state.setHydrated(true);
        }
      },
    }
  )
);
