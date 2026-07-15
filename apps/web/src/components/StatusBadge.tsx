import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';

const statusConfig: Record<string, { key: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' | 'success' | 'warning' | 'info' }> = {
  draft: { key: 'report.status.draft', variant: 'secondary' },
  pending_review: { key: 'report.status.pending_review', variant: 'warning' },
  reviewed: { key: 'report.status.reviewed', variant: 'info' },
  published: { key: 'report.status.published', variant: 'success' },
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status] || { key: status, variant: 'outline' as const };
  return (
    <Badge variant={config.variant} className={className}>
      {t(config.key)}
    </Badge>
  );
}
