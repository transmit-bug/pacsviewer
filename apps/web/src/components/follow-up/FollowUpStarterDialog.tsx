/**
 * Follow-up starter dialog (随访对比 T5) — one-step pair selector.
 *
 * Lists the patient's historical studies, pre-fills 基线 = earliest and
 * 对比 = most recent (same modality — wayfinder #89), the doctor can adjust,
 * then confirm → jump straight into the comparison workbench.
 */
import { useState, useMemo, useEffect } from 'react';
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
          <DialogTitle>发起随访对比</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <div className="text-sm font-medium mb-1.5">基线检查 (最早)</div>
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {sorted.length === 0 && <div className="p-3 text-sm text-muted-foreground">该患者暂无检查记录</div>}
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
                  {baselineId === s.id && <span className="ml-2 text-xs text-primary">基线</span>}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-sm font-medium mb-1.5">对比检查 (最近, 同模态)</div>
            <div className="max-h-36 overflow-y-auto border rounded-md divide-y">
              {comparisonOptions.length === 0 && (
                <div className="p-3 text-sm text-muted-foreground">
                  {sorted.length === 0 ? '该患者暂无检查记录' : '无可选的同模态检查'}
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
                  {comparisonId === s.id && <span className="ml-2 text-xs text-primary">对比</span>}
                </button>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            预填规则: 基线 = 最早的检查, 对比 = 同模态最近的检查 (医生可改)。
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            disabled={!canStart}
            onClick={() => {
              if (baselineId && comparisonId) onStart(baselineId, comparisonId);
            }}
          >
            进入对比工作台
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
