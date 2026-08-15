import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studyApi, imageApi, annotationApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import { ViewportToolbar } from '@/components/viewer/Toolbar';
import { ImageToolsToolbar } from '@/components/viewer/AnnotationToolbar';
import { CinePlayer } from '@/components/viewer/CinePlayer';
import { ImageList } from '@/components/viewer/ImageList';
import { WindowLevel } from '@/components/viewer/WindowLevel';
import { DicomTagViewer } from '@/components/viewer/DicomTagViewer';
import { SeriesNavigator } from '@/components/viewer/SeriesNavigator';
import { KeyboardShortcutsHelp } from '@/components/viewer/KeyboardShortcutsHelp';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useViewerStore } from '@/stores/viewerStore';
import { useKeyboardShortcuts } from '@/hooks/useKeyboardShortcuts';
import { useMeasurementSync } from '@/hooks/useMeasurementSync';
import { EditorPanel, FilterLayer, AiResultOverlay } from '@/components/editor';
import { MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import { ArrowLeft, FileText, Tag, Keyboard } from 'lucide-react';

interface Series {
  id: string;
  modality: string;
  seriesNumber: number;
}

interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  status: string;
  patient?: {
    name: string;
    mrn: string;
  };
  series?: Series[];
}

interface Image {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  width: number;
  height: number;
  format: string;
  instanceNumber: number;
}

export function ViewerPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const { t } = useTranslation();
  const [study, setStudy] = useState<Study | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentSeriesId, setCurrentSeriesId] = useState<string | undefined>();
  const [showDicomTags, setShowDicomTags] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  
  const { currentImageId, setCurrentImage, editorPanelOpen, setEditorPanelOpen } = useViewerStore();

  // Keep the measurement store fed from Cornerstone's live annotation state
  // (measurement list, annotation list, ai_result overlay all read it).
  useMeasurementSync(MAIN_VIEWPORT_ID);
  const [studyAnnotations, setStudyAnnotations] = useState<any[]>([]);

  useEffect(() => {
    if (studyId) {
      loadStudy(studyId);
      loadImages(studyId);
      loadStudyAnnotations(studyId);
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

  const loadImages = async (id: string, seriesId?: string) => {
    try {
      let targetSeriesId = seriesId;
      
      if (!targetSeriesId) {
        const seriesResponse = await studyApi.getSeries(id);
        const series = seriesResponse.data || [];
        if (series.length > 0) {
          targetSeriesId = series[0].id;
          setCurrentSeriesId(targetSeriesId);
        }
      }

      if (targetSeriesId) {
        const imagesResponse = await imageApi.search({ seriesId: targetSeriesId });
        const imageList = imagesResponse.data?.items || [];
        setImages(imageList);
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

  const loadStudyAnnotations = async (id: string) => {
    try {
      const response = await annotationApi.getByStudy(id);
      setStudyAnnotations(response.data || []);
    } catch (error) {
      console.error('Failed to load study annotations:', error);
    }
  };

  const handleSeriesSelect = (seriesId: string) => {
    setCurrentSeriesId(seriesId);
    if (studyId) {
      loadImages(studyId, seriesId);
    }
  };

  const handleNextImage = () => {
    if (!currentImageId || images.length === 0) return;
    const currentIndex = images.findIndex(i => i.id === currentImageId);
    if (currentIndex < images.length - 1) {
      setCurrentImage(images[currentIndex + 1].id);
    }
  };

  const handlePrevImage = () => {
    if (!currentImageId || images.length === 0) return;
    const currentIndex = images.findIndex(i => i.id === currentImageId);
    if (currentIndex > 0) {
      setCurrentImage(images[currentIndex - 1].id);
    }
  };

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onNextImage: handleNextImage,
    onPrevImage: handlePrevImage,
    onToggleHelp: () => setShowShortcutsHelp(prev => !prev),
    onToggleEditor: () => setEditorPanelOpen(!editorPanelOpen),
    onEscape: () => {
      setShowDicomTags(false);
      setShowShortcutsHelp(false);
      if (editorPanelOpen) setEditorPanelOpen(false);
    },
  });

  if (loading) {
    return (
      <div className="flex h-[calc(100vh-8rem)] space-x-4" role="status" aria-label={t('viewer.header.loading')}>
        {/* 主查看区骨架 */}
        <div className="flex flex-1 flex-col space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Skeleton className="h-9 w-9 rounded-md" />
              <div className="space-y-2">
                <Skeleton className="h-6 w-64" />
                <Skeleton className="h-3 w-40" />
              </div>
            </div>
            <Skeleton className="h-8 w-32" />
          </div>
          <Skeleton className="h-10 w-full rounded-md" />
          <div className="flex flex-1 gap-4">
            <Skeleton className="w-16 shrink-0 rounded-md" />
            <Skeleton className="flex-1 rounded-md" />
          </div>
          <Skeleton className="h-8 w-full rounded-md" />
        </div>

        {/* 侧栏骨架 */}
        <div className="flex w-80 flex-col space-y-4">
          <Skeleton className="h-36 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
          <Skeleton className="h-28 w-full rounded-md" />
          <Skeleton className="flex-1 rounded-md" />
          <Skeleton className="h-24 w-full rounded-md" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] space-x-4">
      {/* Main viewer */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={`/patients/${study?.patientId}`}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">
                {study?.patient?.name || t('viewer.header.patient')} - {study?.series?.map(s => s.modality).filter(Boolean).join(', ').toUpperCase() || 'N/A'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {study?.studyDate} | {study?.patient?.mrn}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowDicomTags(!showDicomTags)}
            >
              <Tag className="mr-2 h-4 w-4" />
              {t('viewer.header.dicomTags')}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowShortcutsHelp(true)}
              title={t('viewer.header.keyboardShortcuts')}
            >
              <Keyboard className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* 视图工具栏 */}
        <Card className="mb-4">
          <CardContent className="p-2">
            <ViewportToolbar />
          </CardContent>
        </Card>

        {/* 图像工具栏 */}
        <div className="flex gap-4 flex-1">
          <Card className="w-16 shrink-0">
            <CardContent className="p-1">
              <ImageToolsToolbar studyId={studyId} />
            </CardContent>
          </Card>

          {/* Image canvas */}
          <Card className="flex-1">
            <CardContent className="p-0 h-full">
              <div className="relative w-full h-full">
                <ImageViewer imageId={currentImageId || ''} imageFormat={images.find(i => i.id === currentImageId)?.format} />
                {/* 滤镜 Canvas2D 管线 + ai_result SVG overlay (#112) */}
                <FilterLayer viewportId={MAIN_VIEWPORT_ID} />
                <AiResultOverlay viewportId={MAIN_VIEWPORT_ID} />
              </div>
            </CardContent>
          </Card>

          {/* Cine Player (multi-frame navigation) */}
          <CinePlayer className="mt-2" />
        </div>

        {/* Image info */}
        <Card className="mt-4">
          <CardContent className="p-2">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                {currentImageId
                  ? `${images.find(i => i.id === currentImageId)?.width || 0} x ${images.find(i => i.id === currentImageId)?.height || 0}`
                  : '-'}
              </span>
              <span>
                {currentImageId
                  ? `${images.findIndex(i => i.id === currentImageId) + 1} / ${images.length}`
                  : '-'}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="w-80 flex flex-col space-y-4">
        {/* Series Navigator */}
        <SeriesNavigator
          studyId={studyId || ''}
          currentSeriesId={currentSeriesId}
          onSeriesSelect={handleSeriesSelect}
        />

        {/* Study info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('viewer.header.studyInfo')}</CardTitle>
          </CardHeader>
          <CardContent>
            {study && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('viewer.header.studyType')}</span>
                  <span>{study.series?.map(s => s.modality).filter(Boolean).join(', ').toUpperCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('viewer.header.studyDate')}</span>
                  <span>{study.studyDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('viewer.header.modality')}</span>
                  <span>{study.series?.map(s => s.modality).filter(Boolean).join(', ') || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t('viewer.header.status')}</span>
                  <Badge variant={study.status === 'reported' ? 'default' : study.status === 'diagnosed' ? 'secondary' : 'outline'}>
                    {study.status === 'reported' ? t('viewer.header.statusReported') :
                     study.status === 'diagnosed' ? t('viewer.header.statusDiagnosed') : t('viewer.header.statusPending')}
                  </Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Study-level annotations */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <FileText className="h-3.5 w-3.5" />
              {t('viewer.header.studyLevelAnnotations')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studyAnnotations.length === 0 ? (
              <p className="text-xs text-muted-foreground">{t('viewer.header.noAnnotations')}</p>
            ) : (
              <div className="space-y-2">
                {studyAnnotations.map((ann) => (
                  <div key={ann.id} className="rounded border p-2 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{ann.label || ann.type}</span>
                      <span className="text-muted-foreground">{ann.user?.displayName || ''}</span>
                    </div>
                    {ann.notes && (
                      <p className="text-muted-foreground mt-1">{ann.notes}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Image list */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('viewer.header.imageList')}</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[400px]">
            <ImageList images={images} />
          </CardContent>
        </Card>

        {/* Window/Level */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{t('viewer.windowLevel')}</CardTitle>
          </CardHeader>
          <CardContent>
            <WindowLevel />
          </CardContent>
        </Card>

        {/* 编辑工作区: 图层 / 滤镜 / 测量 (工具栏"编辑"分组 / ⌘E 开关, ⌘K 被全局搜索占用) */}
        {editorPanelOpen && (
          <EditorPanel imageId={currentImageId || undefined} />
        )}
      </div>

      {/* DICOM Tags Panel */}
      {showDicomTags && currentImageId && (
        <div className="w-96 border-l">
          <DicomTagViewer
            imageId={currentImageId}
            onClose={() => setShowDicomTags(false)}
          />
        </div>
      )}

      {/* Keyboard Shortcuts Help */}
      <KeyboardShortcutsHelp
        open={showShortcutsHelp}
        onOpenChange={setShowShortcutsHelp}
      />
    </div>
  );
}
