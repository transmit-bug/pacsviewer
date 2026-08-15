/**
 * 演示模式工具 — 演示数据识别 + 走查持久化。
 *
 * 演示数据识别: seed 给演示患者 (主角 周建国 + 配角 钱美玉/冯志刚/潘玉兰)
 * 的 notes 统一以「演示数据集-」开头, 前端据此打角标, 无需服务端改动。
 * (图像级 DEV_FALLBACK 标识已由 #110 的 isFallback 字段覆盖, 查看器 HUD 有角标。)
 */

export function isDemoPatient(p?: { notes?: string | null } | null): boolean {
  return !!p?.notes && p.notes.includes('演示数据集');
}

const TOUR_DISMISS_KEY = 'pacsviewer.demoTour.dismissed';

/** 用户是否已跳过/完成过演示走查 (本地持久化, 不再打扰) */
export function hasDismissedTour(): boolean {
  try {
    return localStorage.getItem(TOUR_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissTour(): void {
  try {
    localStorage.setItem(TOUR_DISMISS_KEY, '1');
  } catch {
    /* 隐私模式等场景忽略 */
  }
}
