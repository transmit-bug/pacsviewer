import { create } from 'zustand';

/**
 * 演示走查状态 — 全局组件 (GuidedTour) 与入口按钮 (登录页/顶栏) 共享。
 */

export type TourEntry = 'login' | 'app';

interface TourState {
  active: boolean;
  stepIndex: number;
  /** from='login' 时从「一键登录」引导步开始; from='app' 时直接从仪表盘开始 */
  start: (from?: TourEntry) => void;
  close: () => void;
  next: () => void;
  prev: () => void;
  jumpTo: (index: number) => void;
}

export const TOUR_LOGIN_STEP = 0;
export const TOUR_FIRST_APP_STEP = 1;

export const useTourStore = create<TourState>((set) => ({
  active: false,
  stepIndex: 0,
  start: (from = 'app') =>
    set({ active: true, stepIndex: from === 'login' ? TOUR_LOGIN_STEP : TOUR_FIRST_APP_STEP }),
  close: () => set({ active: false }),
  next: () => set((s) => ({ stepIndex: s.stepIndex + 1 })),
  prev: () => set((s) => ({ stepIndex: Math.max(0, s.stepIndex - 1) })),
  jumpTo: (index) => set({ stepIndex: index }),
}));
