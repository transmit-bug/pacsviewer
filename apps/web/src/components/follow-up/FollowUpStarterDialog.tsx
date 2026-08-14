/**
 * Follow-up starter dialog (随访对比 T5) — one-step pair selector.
 *
 * Lists the patient's historical studies, pre-fills 基线 = earliest and
 * 对比 = most recent (same modality — wayfinder #89), the doctor can adjust,
 * then confirm → jump straight into the comparison workbench.
 */
import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export interface FollowUpStudyOption {
  id: string;
  studyDate: string;
  studyTime?: string;
  modality?: string;
  status: string;
  description?: string;
}

interface FollowUpStarterDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studies: FollowUpStudyOption[];
  /** Existing pair (when re-opening from a saved record). */
  initialBaselineId?: string | null;
  initialComparisonId?: string | null;
  onStart: (baselineStudyId: string, comparisonStudyId: string) => void;
}

function studyLabel(s: FollowUpStudyOption): string {
  return `${s.studyDate}${s.studyTime ? ' ' + s.studyTime.slice(0, 5) : ''} · ${s.modality ?? 'N/A'} · ${s.status}`;
}

export function FollowUpStarterDialog({
  open,
  onOpenChange,
  studies,
  initialBaselineId,
  initialComparisonId,
  onStart,
}: FollowUpStarterDialogProps) {
  const { t } = useTranslation();
  const sorted = useMemo(
    () =>
      [...studies].sort((a, b) =>
        `${a.studyDate}${a.studyTime ?? ''}`.localeCompare(`${b.studyDate}${b.studyTime ?? ''}`)
      ),
    [studies]
  );

  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [comparisonId, setComparisonId] = useState<string | null>(null);

  // Prefill whenever the dialog opens (rules from #89).
  useEffect(() => {
    if (!open) return;
    const base = initialBaselineId ?? sorted[0]?.id ?? null;
    const baseStudy = sorted.find((s) => s.id === base);
    const candidates = sorted.filter(
      (s) => s.id !== base && (!baseStudy?.modality || s.modality === baseStudy.modality)
    );
    const comp = initialComparisonId ?? (candidates.length > 0 ? candidates[candidates.length - 1].id : null);
    setBaselineId(base);
    setComparisonId(comp);
  }, [open, sorted, initialBaselineId, initialComparisonId]);

  const baseModality = sorted.find((s) => s.id === baselineId)?.modality;
  const comparisonOptions = sorted.filter(
    (s) => s.id !== baselineId && (!baseModality || s.modality === baseModality)
  );

  const canStart = !!baselineId && !!comparisonId && baselineId !== comparisonId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('followUp.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <div className="text-sm font-medium mb-1.5">{t('followUp.baselineLabel')}</div>
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {sorted.length === 0 && <div className="p-3 text-sm text-muted-foreground">{t('followUp.noStudies')}</div>}
              {sorted.map((s) => (
                <button
                  key={s.id}
                  onClick={() => {
                    setBaselineId(s.id);
                    if (comparisonId === s.id) setComparisonId(null);
                  }}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors',
                    baselineId === s.id && 'bg-primary/10'
                  )}
                >
                  <span className="font-medium">{studyLabel(s)}</span>
                  {baselineId === s.id && <span className="ml-2 text-xs text-primary">{t('followUp.baselineTag')}</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">{t('followUp.comparisonLabel')}</div>
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {comparisonOptions.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  {sorted.length === 0 ? t('followUp.noStudies') : t('followUp.noSameModality')}
                </div>
              )}
              {comparisonOptions.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setComparisonId(s.id)}
                  className={cn(
                    'w-full text-left px-3 py-2 text-sm hover:bg-accent transition-colors',
                    comparisonId === s.id && 'bg-primary/10'
                  )}
                >
                  <span className="font-medium">{studyLabel(s)}</span>
                  {comparisonId === s.id && <span className="ml-2 text-xs text-primary">{t('followUp.comparisonTag')}</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            {t('followUp.prefillRule')}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('followUp.cancel')}
          </Button>
          <Button
            disabled={!canStart}
            onClick={() => {
              if (baselineId && comparisonId) onStart(baselineId, comparisonId);
            }}
          >
            {t('followUp.start')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
