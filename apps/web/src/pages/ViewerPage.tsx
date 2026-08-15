/**
 * ViewerPage — 查看器入口 (wayfinder #126 工作台 + #112 编辑套件接线)。
 *
 * 数据加载 (检查/序列/图像) 保留原逻辑, 渲染层切换到电影级工作台
 * CinematicWorkspace (视口中心/HUD/浮动底条工具条/⌘K/Cine/全屏)。
 * 编辑套件 (#112) 接线: useMeasurementSync 保持测量 store 与 Cornerstone
 * 实时同步; ⌘E 开关编辑工作区 (图层/滤镜/测量, 面板渲染在
 * CinematicWorkspace 内部视口右侧)。加载期间显示近黑骨架。
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studyApi, imageApi } from '@/services/api';
import { Skeleton } from '@/components/ui/skeleton';
import { useViewerStore } from '@/stores/viewerStore';
import { useHistoryStore } from '@/stores/historyStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMeasurementSync } from '@/hooks/useMeasurementSync';
import { CinematicWorkspace } from '@/components/viewer/workspace/CinematicWorkspace';
import { MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import type { WsSeries, WsImage } from '@/components/viewer/workspace/WorkspacePanels';

interface Study {
  id: string;
  patientId: string;
  studyDate?: string;
  description?: string;
  modality?: string;
  status?: string;
  patient?: {
    name: string;
    gender?: string;
    birthDate?: string;
    mrn?: string;
  };
  physician?: { displayName?: string };
}

export function ViewerPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const { t } = useTranslation();
  const [study, setStudy] = useState<Study | null>(null);
  const [series, setSeries] = useState<WsSeries[]>([]);
  const [images, setImages] = useState<WsImage[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSeriesId, setCurrentSeriesId] = useState<string | undefined>();

  const { currentImageId, setCurrentImage, editorPanelOpen, setEditorPanelOpen } = useViewerStore();

  // Keep the measurement store fed from Cornerstone's live annotation state
  // (measurement list, annotation list, ai_result overlay all read it). (#112)
  useMeasurementSync(MAIN_VIEWPORT_ID);

  // Ctrl/Cmd+E toggles the editor workspace (layers / filters / measurements).
  // 箭头键归工作台帧步进所有 (#126), 此处只留编辑器开关。
  // #132: ⌘Z/⌘⇧Z (Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y) → 撤销/重做快照。
  useKeyboardShortcuts({
    onToggleEditor: () => setEditorPanelOpen(!editorPanelOpen),
    onUndo: () => useHistoryStore.getState().undo(),
    onRedo: () => useHistoryStore.getState().redo(),
  });

  // #132: 历史栈按图像隔离 — 快照含当前图像内标注/图层, 切换图像即清空
  // (跨图像撤销会往新图像恢复旧标注, 无意义且破坏 CS 状态)。
  useEffect(() => {
    useHistoryStore.getState().clear();
  }, [currentImageId]);

  useEffect(() => {
    if (studyId) {
      loadStudy(studyId);
      loadSeries(studyId);
      loadImages(studyId);
    }
  }, [studyId]);

  const loadStudy = async (id: string) => {
    try {
      const response = await studyApi.getById(id);
      setStudy(response.data);
    } catch (error) {
      console.error('Failed to load study:', error);
    }
  };

  const loadSeries = async (id: string) => {
    try {
      const response = await studyApi.getSeries(id);
      const list = (response.data || []).map((s: any) => ({
        id: s.id,
        seriesNumber: s.seriesNumber || 0,
        modality: s.modality || 'N/A',
        description: s.description,
        imageCount: s.imageCount ?? 0,
        bodyPart: s.bodyPart,
      }));
      list.sort((a: WsSeries, b: WsSeries) => a.seriesNumber - b.seriesNumber);
      setSeries(list);
      if (list.length > 0) setCurrentSeriesId((prev) => prev ?? list[0].id);
    } catch (error) {
      console.error('Failed to load series:', error);
    }
  };

  const loadImages = async (id: string, seriesId?: string) => {
    try {
      let targetSeriesId = seriesId;

      if (!targetSeriesId) {
        const seriesResponse = await studyApi.getSeries(id);
        const list = seriesResponse.data || [];
        if (list.length > 0) {
          targetSeriesId = list[0].id;
          setCurrentSeriesId(targetSeriesId);
        }
      }

      if (targetSeriesId) {
        const imagesResponse = await imageApi.search({ seriesId: targetSeriesId });
        const imageList: any[] = imagesResponse.data?.items || [];
        setImages(
          imageList.map((img) => ({
            id: img.id,
            instanceNumber: img.instanceNumber ?? 1,
            format: img.format ?? 'png',
            numberOfFrames: img.numberOfFrames ?? null,
          }))
        );
        if (imageList.length > 0) {
          setCurrentImage(imageList[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSeriesSelect = (seriesId: string) => {
    setCurrentSeriesId(seriesId);
    if (studyId) {
      loadImages(studyId, seriesId);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-40 flex flex-col bg-background text-foreground" role="status" aria-label={t('viewer.header.loading')}>
        <div className="flex h-10 items-center gap-2 border-b border-border bg-background/95 px-3">
          <Skeleton className="h-7 w-24 rounded-sm" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="ml-auto h-7 w-32 rounded-sm" />
        </div>
        <div className="flex min-h-0 flex-1">
          <Skeleton className="h-full w-64 shrink-0 rounded-none border-r border-border" />
          <div className="ws-viewport-bg relative flex-1">
            <div className="skeleton-shimmer absolute inset-6 rounded-lg" />
          </div>
          <Skeleton className="h-full w-72 shrink-0 rounded-none border-l border-border" />
        </div>
      </div>
    );
  }

  if (!study || !currentImageId) {
    return (
      <div className="fixed inset-0 z-40 flex items-center justify-center bg-background text-muted-foreground">
        <p className="text-sm">{t('viewer.header.noImages')}</p>
      </div>
    );
  }

  return (
    <CinematicWorkspace
      study={study}
      series={series}
      images={images}
      currentImageId={currentImageId}
      activeSeriesId={currentSeriesId}
      onSeriesSelect={handleSeriesSelect}
      onImageSelect={setCurrentImage}
    />
  );
}
