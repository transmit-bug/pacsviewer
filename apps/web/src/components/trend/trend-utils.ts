/**
 * Trend chart shared logic (随访对比 T3).
 *
 * Trend direction is driven by the measurement dictionary
 * (measurement_definitions.trend_direction): 'down' = decreasing value is
 * worsening (RNFL thickness…), 'up' = increasing value is worsening (IOP,
 * C/D ratio…). Stability threshold: |relative change| ≤ 5% → stable.
 */

export type TrendStatus = 'improving' | 'stable' | 'worsening';

export interface TrendPoint {
  id: string;
  studyId: string;
  value: number;
  unit: string;
  calibrated: boolean;
  capturedAt: string;
  studyDate: string;
  studyTime?: string;
}

export interface TrendDefinition {
  key: string;
  displayName: string;
  type: string;
  unit: string;
  trendDirection: 'up' | 'down';
  referenceRange: { min?: number; max?: number } | null;
  modality?: string | null;
}

export interface TrendSeries {
  key: string;
  definition: TrendDefinition | null;
  points: TrendPoint[];
}

export interface TrendResult {
  status: TrendStatus;
  /** Relative change vs baseline in percent (latest vs first). */
  pct: number;
  baselineValue: number;
  latestValue: number;
}

export const STABILITY_THRESHOLD_PCT = 5;

// 语义色映射到设计令牌 (CIRRUS 语义: 好转=绿 稳定=灰 恶化=红), 深色下提亮
// color 字段为 SVG stroke / inline style 可用的 hsl(var()) 字符串。
export const TREND_META: Record<TrendStatus, { label: string; color: string; badgeClass: string }> = {
  improving: {
    label: '好转',
    color: 'hsl(var(--status-success))',
    badgeClass: 'bg-[hsl(var(--status-success)/0.12)] text-[hsl(var(--status-success))]',
  },
  stable: {
    label: '稳定',
    color: 'hsl(var(--status-neutral))',
    badgeClass: 'bg-[hsl(var(--status-neutral)/0.15)] text-[hsl(var(--status-neutral))]',
  },
  worsening: {
    label: '恶化',
    color: 'hsl(var(--status-danger))',
    badgeClass: 'bg-[hsl(var(--status-danger)/0.12)] text-[hsl(var(--status-danger))]',
  },
};

// 分面图系列色: 品牌 teal + 语义色 (深色下可辨)
export const FACET_COLORS = [
  'hsl(var(--primary))',
  'hsl(var(--status-info))',
  'hsl(var(--status-progress))',
  'hsl(var(--status-success))',
  'hsl(var(--status-warning))',
  'hsl(var(--status-danger))',
];

/** Direction that counts as worsening, given the definition (default: 'up'). */
export function worseningDirection(def: TrendDefinition | null): 'up' | 'down' {
  return def?.trendDirection ?? 'up';
}

/**
 * Compute the trend status for a series from its first → last point.
 * Requires ≥ 2 points; a single point is 'stable' (no movement to judge).
 */
export function computeTrend(series: TrendSeries): TrendResult {
  const pts = series.points;
  if (pts.length === 0) {
    return { status: 'stable', pct: 0, baselineValue: NaN, latestValue: NaN };
  }
  const baseline = pts[0].value;
  const latest = pts[pts.length - 1].value;
  const pct = baseline !== 0 ? ((latest - baseline) / baseline) * 100 : 0;

  if (pts.length === 1 || Math.abs(pct) <= STABILITY_THRESHOLD_PCT) {
    return { status: 'stable', pct, baselineValue: baseline, latestValue: latest };
  }
  const dir = worseningDirection(series.definition);
  const worse = dir === 'down' ? latest < baseline : latest > baseline;
  return { status: worse ? 'worsening' : 'improving', pct, baselineValue: baseline, latestValue: latest };
}

/** Format a value with its unit for labels (empty unit → bare number). */
export function formatValue(value: number | null | undefined, unit?: string | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  const rounded = Math.abs(value) >= 100 ? value.toFixed(0) : value.toFixed(1);
  return unit ? `${rounded} ${unit}` : `${rounded}`;
}

/** Short date label for chart x-axis (YYYY-MM-DD → MM-DD). */
export function shortDate(studyDate: string): string {
  const m = studyDate.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[2]}-${m[3]}`;
  return studyDate;
}

/** Length-unit conversion factors relative to mm (mm = 1). */
const LENGTH_FACTORS: Record<string, number> = {
  mm: 1,
  cm: 10,
  m: 1000,
  μm: 0.001,
  um: 0.001,
};

/**
 * True when a value measured in `from` can be displayed in `to` without
 * losing meaning (both are length units, neither is pixel space).
 */
export function unitsConvertible(from: string, to: string): boolean {
  if (from === to) return true;
  if (isPixelUnit(from) || isPixelUnit(to)) return false;
  return from in LENGTH_FACTORS && to in LENGTH_FACTORS;
}

/** Convert a value between convertible units (identity when not convertible). */
export function convertUnit(value: number, from: string, to: string): number {
  if (from === to) return value;
  if (!unitsConvertible(from, to)) return value;
  return (value * LENGTH_FACTORS[from]) / LENGTH_FACTORS[to];
}

function isPixelUnit(unit: string): boolean {
  return /px/i.test(unit);
}
