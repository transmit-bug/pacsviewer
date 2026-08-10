/**
 * Trend facet grid (随访对比 T3) — one mini chart per measurement key.
 */
import { TrendSeries, FACET_COLORS } from './trend-utils';
import { TrendFacetChart } from './TrendFacetChart';
import { cn } from '@/lib/utils';

interface TrendFacetGridProps {
  series: TrendSeries[];
  className?: string;
}

export function TrendFacetGrid({ series, className }: TrendFacetGridProps) {
  if (series.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        暂无纵向测量数据 —— 在查看器/对比工作台中保存测量后,这里会显示各项测量随时间的趋势。
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-3', className)}>
      {series.map((s, i) => (
        <TrendFacetChart key={s.key} series={s} color={FACET_COLORS[i % FACET_COLORS.length]} />
      ))}
    </div>
  );
}
