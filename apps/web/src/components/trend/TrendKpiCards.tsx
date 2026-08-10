/**
 * Trend KPI cards (随访对比 T3) — current value + change vs baseline + mini
 * sparkline. Report-embed friendly compact form.
 */
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  ReferenceLine,
} from 'recharts';
import { cn } from '@/lib/utils';
import {
  TrendSeries,
  computeTrend,
  TREND_META,
  formatValue,
  FACET_COLORS,
  unitsConvertible,
  convertUnit,
} from './trend-utils';

interface TrendKpiCardsProps {
  series: TrendSeries[];
  className?: string;
}

export function TrendKpiCards({ series, className }: TrendKpiCardsProps) {
  if (series.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">暂无测量数据</div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3', className)}>
      {series.map((s, i) => {
        const trend = computeTrend(s);
        const meta = TREND_META[trend.status];
        const color = FACET_COLORS[i % FACET_COLORS.length];
        const def = s.definition;
        const recordedUnit = s.points[0]?.unit ?? '';
        const unit = def?.unit && unitsConvertible(recordedUnit, def.unit) ? def.unit : recordedUnit;
        const toDisplay = (v: number, from: string) => convertUnit(v, from || recordedUnit, unit);
        const data = s.points.map((p) => ({ x: p.studyDate.slice(5), value: toDisplay(p.value, p.unit) }));
        const last = s.points[s.points.length - 1];
        const base = s.points[0];

        return (
          <div key={s.key} className="border rounded-xl p-4 bg-card">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{def?.displayName ?? s.key}</span>
              <span className={cn('text-xs px-1.5 py-0.5 rounded-full', meta.badgeClass)}>{meta.label}</span>
            </div>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-3xl font-semibold tabular-nums">
                {last ? formatValue(toDisplay(last.value, last.unit), '') : '—'}
              </span>
              <span className="text-sm text-muted-foreground">{unit}</span>
            </div>
            <div className="text-xs mt-0.5">
              <span className={cn('tabular-nums', Math.abs(trend.pct) > 5 ? (trend.pct >= 0 ? 'text-red-600' : 'text-green-600') : '')}>
                {trend.pct >= 0 ? '▲' : '▼'} {Number.isFinite(trend.pct) ? Math.abs(trend.pct).toFixed(1) : '—'}%
              </span>
              <span className="text-muted-foreground">
                {' '}vs 基线 {base ? formatValue(toDisplay(base.value, base.unit), unit) : '—'}
              </span>
            </div>
            {s.points.length >= 2 && (
              <div className="h-10 mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
                    <YAxis hide domain={['auto', 'auto']} />
                    <XAxis hide dataKey="x" />
                    <ReferenceLine
                      y={trend.baselineValue}
                      stroke="#94a3b8"
                      strokeDasharray="3 2"
                      strokeWidth={1}
                    />
                    <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="text-[10px] text-muted-foreground text-center -mt-0.5">
              {s.points.map((p) => p.studyDate.slice(5)).join(' → ')}
            </div>
          </div>
        );
      })}
    </div>
  );
}
