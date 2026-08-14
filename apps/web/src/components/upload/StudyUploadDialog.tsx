import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { studyApi } from '@/services/api';
import { ImageUpload } from './ImageUpload';
import { Layers } from 'lucide-react';

/** Target series for the upload: an existing series, or a new auto-created one. */
const NEW_SERIES = '__new__';

interface SeriesOption {
  id: string;
  seriesNumber: number;
  modality: string;
  seriesDescription?: string | null;
  imageCount?: number;
}

interface StudyUploadDialogProps {
  /** The study to append images to. null hides the dialog. */
  study: { id: string; patientId: string; modality?: string } | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called after a successful upload so the parent can refresh its lists. */
  onUploaded?: () => void;
}

const MODALITIES = ['OCT', 'Fundus', 'FFA', 'ICGA', 'VF', 'UBM', 'B-Scan'];

/**
 * 追加图像 dialog — multi-file batch upload into a study. Lets the user append
 * to an existing series or auto-create a new series under the study.
 */
export function StudyUploadDialog({ study, open, onOpenChange, onUploaded }: StudyUploadDialogProps) {
  const [seriesList, setSeriesList] = useState<SeriesOption[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(false);
  const [targetSeriesId, setTargetSeriesId] = useState<string>(NEW_SERIES);
  const [modality, setModality] = useState('OCT');
  const [uploadKey, setUploadKey] = useState(0);

  useEffect(() => {
    if (open && study) {
      setSeriesList([]);
      setTargetSeriesId(NEW_SERIES);
      setModality((study.modality || 'OCT').toUpperCase());
      setUploadKey((k) => k + 1);
      loadSeries(study.id);
    }
  }, [open, study?.id]);

  const loadSeries = async (studyId: string) => {
    try {
      setSeriesLoading(true);
      const response = await studyApi.getSeries(studyId);
      const items: SeriesOption[] = (response.data || []).map((s: any) => ({
        id: s.id,
        seriesNumber: s.seriesNumber,
        modality: s.modality,
        seriesDescription: s.seriesDescription,
        imageCount: s.imageCount,
      }));
      items.sort((a, b) => a.seriesNumber - b.seriesNumber);
      setSeriesList(items);
    } catch (error) {
      console.error('Failed to load series:', error);
    } finally {
      setSeriesLoading(false);
    }
  };

  if (!study) return null;

  const isNewSeries = targetSeriesId === NEW_SERIES;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="h-5 w-5" />
            追加图像
          </DialogTitle>
          <DialogDescription>
            选择图像后自动上传，支持批量多选。上传完成后列表自动刷新，新图像可在查看器中打开。
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Target series */}
          <div className="space-y-2">
            <Label htmlFor="target-series">目标序列</Label>
            {seriesLoading ? (
              <Skeleton className="h-10 w-full" />
            ) : (
              <select
                id="target-series"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={targetSeriesId}
                onChange={(e) => setTargetSeriesId(e.target.value)}
              >
                <option value={NEW_SERIES}>
                  新建序列（自动创建）
                  {seriesList.length > 0 ? ` — 当前 ${seriesList.length} 个序列` : ''}
                </option>
                {seriesList.map((s) => (
                  <option key={s.id} value={s.id}>
                    序列 {s.seriesNumber} · {s.modality}（{s.imageCount ?? 0} 张）
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Modality for a new series */}
          {isNewSeries && (
            <div className="space-y-2">
              <Label htmlFor="upload-modality">检查类型（新序列）</Label>
              <select
                id="upload-modality"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={modality}
                onChange={(e) => setModality(e.target.value)}
              >
                {MODALITIES.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Upload widget */}
        <ImageUpload
          key={uploadKey}
          studyId={study.id}
          patientId={study.patientId}
          seriesId={isNewSeries ? undefined : targetSeriesId}
          modality={isNewSeries ? modality : undefined}
          createSeries={isNewSeries}
          onUploadComplete={(imageIds) => {
            if (imageIds.length > 0) onUploaded?.();
          }}
        />

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            完成
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
