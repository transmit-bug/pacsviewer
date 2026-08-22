/**
 * Trend facet chart (随访对比 T3) — one measurement per mini chart with
 * real-unit y-axis, baseline dashed line, reference-range band, trend badge
 * and % change vs baseline. Built with recharts.
 *
 * Unit handling: snapshots store Cornerstone's real unit (e.g. mm for a
 * Length tool); the dictionary declares the conventional display unit (μm for
 * RNFL). When convertible (length units), values are converted for display so
 * the reference band is meaningful. Pixel-space (uncalibrated) points are
 * plotted as-is and flagged; the band is skipped when units don't match.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ReferenceArea,
} from 'recharts';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import {
  type TrendSeries,
  computeTrend,
  TREND_META,
  formatValue,
  shortDate,
  unitsConvertible,
  convertUnit,
} from './trend-utils';

interface TrendFacetChartProps {
  series: TrendSeries;
  color?: string;
}

export function TrendFacetChart({ series, color = '#2563eb' }: TrendFacetChartProps) {
  const { t } = useTranslation();
  const trend = computeTrend(series);
  const meta = TREND_META[trend.status];
  const def = series.definition;

  // Display unit: dictionary unit when it is convertible from the recorded
  // unit (μm ↔ mm …), otherwise the recorded unit itself.
  const recordedUnit = series.points[0]?.unit ?? '';
  const targetUnit = def?.unit
    ? unitsConvertible(recordedUnit, def.unit)
      ? def.unit
      : recordedUnit
    : recordedUnit;
  const range = def?.referenceRange ?? null;
  // Reference band only meaningful when it uses the same unit as the axis.
  const bandUsable = !!range && !!def?.unit && def.unit === targetUnit;

  const data = series.points.map((p) => ({
    x: shortDate(p.studyDate),
    fullLabel: `${p.studyDate}${p.studyTime ? ` ${p.studyTime}` : ''}`,
    value: convertUnit(p.value, p.unit || recordedUnit, targetUnit),
    calibrated: p.calibrated,
  }));

  const values = data.map((d) => d.value).filter((v) => Number.isFinite(v));
  const dataMin = values.length > 0 ? Math.min(...values) : 0;
  const dataMax = values.length > 0 ? Math.max(...values) : 1;
  const pad = (dataMax - dataMin) * 0.15 || 1;
  const domainMin = range?.min !== undefined && bandUsable ? Math.min(range.min, dataMin) - pad : dataMin - pad;
  const domainMax = range?.max !== undefined && bandUsable ? Math.max(range.max, dataMax) + pad : dataMax + pad;
  const bandY1 = bandUsable && range?.min !== undefined ? range.min : (bandUsable && range?.max !== undefined ? domainMin : undefined);
  const bandY2 = bandUsable && range?.max !== undefined ? range.max : (bandUsable && range?.min !== undefined ? domainMax : undefined);

  const singlePoint = data.length <= 1;
  const baselineDisplay = trend.baselineValue !== null && !Number.isNaN(trend.baselineValue)
    ? convertUnit(trend.baselineValue, recordedUnit, targetUnit)
    : NaN;
  const latestDisplay = series.points.length > 0
    ? convertUnit(series.points[series.points.length - 1].value, recordedUnit, targetUnit)
    : NaN;
  const firstDisplay = series.points.length > 0
    ? convertUnit(series.points[0].value, recordedUnit, targetUnit)
    : NaN;

  return (
    <div className="border rounded-xl p-3 bg-card">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium">{def?.displayName ?? series.key}</span>
        <span className={cn('text-xs px-1.5 py-0.5 rounded-full', meta.badgeClass)}>{t(meta.labelKey)}</span>
      </div>

      <div className="h-[140px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            {t('trend.noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="x" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} tickLine={false} axisLine={{ stroke: 'hsl(var(--border))' }} />
              <YAxis
                tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                tickLine={false}
                axisLine={false}
                width={38}
                domain={[domainMin, domainMax]}
                unit={targetUnit ? ` ${targetUnit}` : undefined}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'hsl(var(--popover))',
                  border: '1px solid hsl(var(--border))',
                  borderRadius: 'var(--radius)',
                  fontSize: 12,
                  boxShadow: 'var(--shadow-md)',
                }}
                labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                itemStyle={{ color: 'hsl(var(--foreground))' }}
                formatter={(value: any) => [formatValue(Number(value), targetUnit), t('trend.measurementValue')]}
                labelFormatter={(label, payload) => payload?.[0]?.payload?.fullLabel ?? label}
              />
              {bandY1 !== undefined && bandY2 !== undefined && bandY1 < bandY2 && (
                <ReferenceArea
                  y1={bandY1}
                  y2={bandY2}
                  fill="hsl(var(--status-neutral))"
                  fillOpacity={0.12}
                  stroke="none"
                />
              )}
              {!singlePoint && Number.isFinite(baselineDisplay) && (
                <ReferenceLine
                  y={baselineDisplay}
                  stroke="hsl(var(--status-neutral))"
                  strokeDasharray="4 3"
                  strokeWidth={1}
                  label={{ value: t('trend.baseline'), position: 'insideTopRight', fontSize: 9, fill: 'hsl(var(--status-neutral))' }}
                />
              )}
              <Line
                type="monotone"
                dataKey="value"
                stroke={color}
                strokeWidth={2}
                dot={{ r: 3, fill: color, strokeWidth: 0 }}
                activeDot={{ r: 4 }}
                connectNulls
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="flex justify-between text-xs text-muted-foreground mt-1">
        <span className="tabular-nums">
          {series.points.length > 0
            ? `${series.points[0].studyDate} ${formatValue(firstDisplay, targetUnit)} → ${series.points[series.points.length - 1].studyDate} ${formatValue(latestDisplay, targetUnit)}`
            : '—'}
        </span>
        <span className={cn('tabular-nums font-medium', Math.abs(trend.pct) > 5 ? (trend.pct >= 0 ? 'text-[hsl(var(--status-danger))]' : 'text-[hsl(var(--status-success))]') : '')}>
          {trend.pct >= 0 ? '+' : ''}{Number.isFinite(trend.pct) ? trend.pct.toFixed(1) : '—'}%
        </span>
      </div>

      {bandUsable && (range!.min !== undefined || range!.max !== undefined) && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {t('trend.referenceRange')}: {range!.min !== undefined ? `≥ ${range!.min}${def!.unit}` : ''}{range!.min !== undefined && range!.max !== undefined ? ' · ' : ''}{range!.max !== undefined ? `≤ ${range!.max}${def!.unit}` : ''}
        </div>
      )}
      {series.points.some((p) => !p.calibrated) && (
        <div className="text-[10px] text-[hsl(var(--status-warning))] mt-0.5">{t('trend.containsUncalibrated')}</div>
      )}
      {def?.unit && def.unit !== targetUnit && (
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {t('trend.displayedIn', { unit: targetUnit, dictUnit: def.unit })}
        </div>
      )}
    </div>
  );
}
