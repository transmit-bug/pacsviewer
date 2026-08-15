/**
 * Calibrated scale bar (wayfinder 遗留缺口 2) — 基于真实像素间距的查看器比例尺。
 *
 * 原理: Cornerstone 视口以世界坐标(mm, 有 PixelSpacing 时)渲染, 通过
 * worldToCanvas 把世界空间两点 (相距 5mm) 投影到画布, 测得的画布距离即
 * 当前缩放下的 px/mm — 无需关心相机内部 (zoom/pan/rotation) 实现细节,
 * 缩放自动跟随, 平移不影响长度。
 *
 * 无像素间距 (上传的普通照片/未校准 DICOM) 时返回 null, 调用方回退到
 * display-relative 固定比例尺 (HUD 惯例)。
 */

import { getRenderingEngine } from '@/lib/cornerstone/init';

export interface ScaleBarSpec {
  /** 比例尺代表的真实长度 (mm) */
  mm: number;
  /** 该长度在当前画布上的像素宽 */
  px: number;
}

/** 候选 "好数" 毫米值 (1-2-5 序列, 覆盖缩放到 200mm 视野) */
const NICE_MM = [0.5, 1, 2, 5, 10, 20, 50, 100, 200] as const;

/** 目标画布长度区间 (px) — 过短看不清, 过长挤占视口 */
const TARGET_MIN_PX = 40;
const TARGET_MAX_PX = 140;

/**
 * 从 px/mm 选一个视觉合适的整数值: 优先落在 40–140px 区间, 否则取最接近的边界值。
 */
export function pickNiceMm(pxPerMm: number): number {
  let best: number = NICE_MM[0];
  for (const mm of NICE_MM) {
    const px = mm * pxPerMm;
    if (px >= TARGET_MIN_PX && px <= TARGET_MAX_PX) return mm;
    if (px < TARGET_MIN_PX) best = mm; // 追着最后一个个仍然太短的
    else break; // 超过区间, 保持 best
  }
  return best;
}

/** Cornerstone viewport 的最小形状 (可测试)。 */
interface ViewportLike {
  getImageData?: () => {
    spacing?: number[];
    dimensions?: number[];
    hasPixelSpacing?: boolean;
  } | null;
  worldToCanvas?: (worldPos: number[]) => number[];
}

/**
 * 纯测量逻辑: 给定视口 (或其替身), 返回校准比例尺; 无真实像素间距时返回 null。
 */
export function measureScaleBar(viewport: ViewportLike | null | undefined, preferredMm?: number): ScaleBarSpec | null {
  if (!viewport || typeof viewport.getImageData !== 'function' || typeof viewport.worldToCanvas !== 'function') {
    return null;
  }
  const imageData = viewport.getImageData();
  const spacing = imageData?.spacing;
  const dims = imageData?.dimensions;
  if (!imageData?.hasPixelSpacing || !spacing || !dims || !spacing[0] || !dims[0]) {
    return null;
  }

  // 世界空间中心点 + 沿 x 轴 5mm 的第二个点 → 画布距离换算 px/mm
  try {
    const cx = (dims[0] * spacing[0]) / 2;
    const cy = (dims[1] * spacing[1]) / 2;
    const p0 = viewport.worldToCanvas([cx, cy, 0]);
    const p1 = viewport.worldToCanvas([cx + 5, cy, 0]);
    const pxPerMm = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) / 5;
    if (!Number.isFinite(pxPerMm) || pxPerMm <= 0) return null;

    const mm = preferredMm ?? pickNiceMm(pxPerMm);
    return { mm, px: Math.round(mm * pxPerMm) };
  } catch {
    // 视口正在销毁/重建时 worldToCanvas 可能抛错 → 按未校准处理
    return null;
  }
}

/**
 * 从渲染引擎取真实视口并测量。视口未就绪 / 图像未加载时返回 null。
 */
export function computeScaleBar(viewportId: string, preferredMm?: number): ScaleBarSpec | null {
  const engine = getRenderingEngine();
  const viewport = engine?.getViewport(viewportId) as ViewportLike | undefined;
  return measureScaleBar(viewport, preferredMm);
}
