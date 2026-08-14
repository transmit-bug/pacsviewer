/**
 * Trend facet grid (随访对比 T3) — one mini chart per measurement key.
 */
import { useTranslation } from 'react-i18next';
import { TrendSeries, FACET_COLORS } from './trend-utils';
import { TrendFacetChart } from './TrendFacetChart';
import { cn } from '@/lib/utils';

interface TrendFacetGridProps {
  series: TrendSeries[];
  className?: string;
}

export function TrendFacetGrid({ series, className }: TrendFacetGridProps) {
  const { t } = useTranslation();

  if (series.length === 0) {
    return (
      <div className="text-center py-10 text-muted-foreground text-sm">
        {t('trend.noDataLong')}
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
