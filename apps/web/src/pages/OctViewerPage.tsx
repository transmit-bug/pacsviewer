/**
 * OctViewerPage — OCT 专用厚度图工作台 (遗留缺口 1 修复)。
 *
 * 生产 OctViewer 组件 (B-scan 视口 + Cine 播放 + OCT 窗宽预设 +
 * En-face 预览 + 厚度图) 的页面级包装: 加载检查/序列/图像, 提供
 * 序列切换 + 图像缩略图切换 + 返回导航。布局沿用电影级工作台的
 * 近黑分层与玻璃浮层令牌 (workspace.css 由 OctViewer 引入)。
 */
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studyApi, imageApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { OctViewer } from '@/components/viewer/OctViewer';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { ArrowLeft, ScanEye } from 'lucide-react';

interface Study {
  id: string;
  patientId: string;
  studyDate?: string;
  description?: string;
  modality?: string;
  patient?: { name: string; mrn?: string };
}

interface SeriesItem {
  id: string;
  seriesNumber: number;
  modality: string;
  description?: string;
  imageCount?: number;
}

interface ImageItem {
  id: string;
  instanceNumber: number;
  format: string;
}

export function OctViewerPage() {
  const { studyId, imageId } = useParams<{ studyId: string; imageId: string }>();
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);

  const [study, setStudy] = useState<Study | null>(null);
  const [series, setSeries] = useState<SeriesItem[]>([]);
  /** seriesId → 该序列图像列表 (预载全部序列, 支持深度链接正确落位) */
  const [imagesBySeries, setImagesBySeries] = useState<Record<string, ImageItem[]>>({});
  const [currentSeriesId, setCurrentSeriesId] = useState<string | undefined>();
  const [currentImageId, setCurrentImageId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studyId) {
      void loadStudy(studyId);
      void loadSeries(studyId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studyId]);

  const loadStudy = async (id: string) => {
    try {
      const response = await studyApi.getById(id);
      setStudy(response.data);
    } catch (error) {
      console.error('[OctViewerPage] Failed to load study:', error);
    }
  };

  const loadSeries = async (id: string) => {
    try {
      const response = await studyApi.getSeries(id);
      const list: SeriesItem[] = (response.data || []).map((s: any) => ({
        id: s.id,
        seriesNumber: s.seriesNumber || 0,
        modality: s.modality || 'N/A',
        description: s.seriesDescription ?? s.description,
        imageCount: s.imageCount ?? 0,
      }));
      list.sort((a, b) => a.seriesNumber - b.seriesNumber);
      setSeries(list);
      if (list.length === 0) {
        setLoading(false);
        return;
      }
      await loadAllImages(list);
    } catch (error) {
      console.error('[OctViewerPage] Failed to load series:', error);
      setLoading(false);
    }
  };

  /** 预载全部序列图像; 深度链接 imageId 命中的序列优先, 否则取首个序列。 */
  const loadAllImages = async (seriesList: SeriesItem[]) => {
    const entries = await Promise.all(
      seriesList.map(async (s) => {
        try {
          const res = await imageApi.search({ seriesId: s.id });
          const list: ImageItem[] = (res.data?.items || [])
            .map((img: any) => ({
              id: img.id,
              instanceNumber: img.instanceNumber ?? 1,
              format: img.format ?? 'png',
            }))
            .sort((a: ImageItem, b: ImageItem) => a.instanceNumber - b.instanceNumber);
          return [s.id, list] as const;
        } catch {
          return [s.id, [] as ImageItem[]] as const;
        }
      })
    );
    const map = Object.fromEntries(entries);
    setImagesBySeries(map);

    const deep = entries.find(([, imgs]) => imageId && imgs.some((i) => i.id === imageId));
    const targetSeriesId = deep?.[0] ?? seriesList[0]?.id;
    const imgs = (targetSeriesId && map[targetSeriesId]) || [];
    setCurrentSeriesId(targetSeriesId);
    setCurrentImageId(imageId && imgs.some((i) => i.id === imageId) ? imageId : (imgs[0]?.id ?? null));
    setLoading(false);
  };

  const handleSeriesSelect = (seriesId: string) => {
    setCurrentSeriesId(seriesId);
    setCurrentImageId(imagesBySeries[seriesId]?.[0]?.id ?? null);
  };

  const currentImage = (currentSeriesId ? imagesBySeries[currentSeriesId] : []).find(
    (i) => i.id === currentImageId
  );
  const images = (currentSeriesId ? imagesBySeries[currentSeriesId] : []) as ImageItem[];

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground" role="status">
        <div className="flex h-10 items-center gap-2 border-b border-border bg-background/95 px-3">
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-7 w-32 rounded-sm" />
        </div>
        <div className="ws-viewport-bg flex min-h-0 flex-1">
          <div className="skeleton-shimmer absolute inset-6 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!study || !currentImageId || !currentImage) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center bg-background text-muted-foreground">
        <ScanEye className="mb-2 h-8 w-8 opacity-40" />
        <p className="text-sm">{t('viewer.header.noImages')}</p>
        {studyId && (
          <Link
            to={`/viewer/${studyId}`}
            className="mt-4 flex h-8 items-center gap-1.5 rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('viewer.oct.backToViewer')}
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex select-none flex-col overflow-hidden bg-background text-foreground">
      {/* ── 顶栏: 返回导航 + 检查信息 ── */}
      <header className="z-30 flex h-10 shrink-0 items-center gap-2 border-b border-border bg-background/95 px-3">
        <Link
          to={`/viewer/${study.id}`}
          className="ws-tool-btn flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('viewer.oct.backToViewer')}
        </Link>
        <Link
          to={`/patients/${study.patientId}`}
          className="ws-tool-btn flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('viewer.workspace.backToPatient')}
        </Link>
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[hsl(var(--primary))]">
          <ScanEye className="h-3 w-3 text-black" />
        </span>
        <span className="text-xs font-medium tracking-wide">{t('viewer.oct.title')}</span>
        <Badge variant="outline" className="ml-1 h-4 border-dashed px-1.5 text-[9px] text-muted-foreground">
          OCT
        </Badge>
        <div className="ml-auto flex min-w-0 items-center gap-2 text-[11px] text-muted-foreground">
          <span className="hud-numeric shrink-0 text-white/80">{study.studyDate}</span>
          <span className="hidden truncate lg:inline">{study.description}</span>
          <span className="hidden shrink-0 text-white/50 xl:inline">{study.patient?.name}</span>
        </div>
      </header>

      {/* ── 序列切换 (pills) ── */}
      <div className="z-20 flex shrink-0 items-center gap-2 overflow-x-auto border-b border-border bg-background/80 px-3 py-2 backdrop-blur">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
          {t('viewer.oct.series')}
        </span>
        {series.map((s) => (
          <button
            key={s.id}
            onClick={() => handleSeriesSelect(s.id)}
            className={cn(
              'shrink-0 rounded-sm border px-2 py-1 text-[11px] transition-colors',
              s.id === currentSeriesId
                ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/15 text-foreground'
                : 'border-border bg-muted/40 text-muted-foreground hover:bg-accent hover:text-foreground'
            )}
          >
            <span className="hud-numeric">S{s.seriesNumber}</span>
            <span className="mx-1">·</span>
            {s.modality}
            {s.description ? ` · ${s.description}` : ''}
          </button>
        ))}
      </div>

      {/* ── 主区: OCT 工作台 ── */}
      <main className="ws-viewport-bg flex min-h-0 flex-1 flex-col p-3">
        <div className="flex min-h-0 flex-1">
          <OctViewer
            imageId={currentImage.id}
            imageFormat={currentImage.format}
            className="min-h-0 w-full"
          />
        </div>

        {/* 图像缩略图条 */}
        {images.length > 0 && (
          <div className="mt-3 flex shrink-0 items-center gap-2 overflow-x-auto">
            <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
              {t('viewer.oct.images')}
            </span>
            {images.map((img) => (
              <button
                key={img.id}
                onClick={() => setCurrentImageId(img.id)}
                title={`#${img.instanceNumber}`}
                className={cn(
                  'shrink-0 overflow-hidden rounded-sm border transition-all',
                  img.id === currentImageId
                    ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]'
                    : 'border-border/60 opacity-70 hover:opacity-100'
                )}
              >
                <img
                  src={`/api/images/${img.id}/thumbnail?token=${token}`}
                  alt={`#${img.instanceNumber}`}
                  className="h-12 w-16 object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
