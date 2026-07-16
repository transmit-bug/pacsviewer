import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { studyApi, imageApi, annotationApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ImageViewer } from '@/components/viewer/ImageViewer';
import { Toolbar } from '@/components/viewer/Toolbar';
import { ImageList } from '@/components/viewer/ImageList';
import { WindowLevel } from '@/components/viewer/WindowLevel';
import { useViewerStore } from '@/stores/viewerStore';
import { ArrowLeft, FileText } from 'lucide-react';
import { Link } from 'react-router-dom';

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
  
  const { currentImageId, setCurrentImage } = useViewerStore();
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

  const loadImages = async (id: string) => {
    try {
      const seriesResponse = await studyApi.getSeries(id);
      const series = seriesResponse.data || [];
      if (series.length > 0) {
        const imagesResponse = await imageApi.search({ seriesId: series[0].id });
        const imageList = imagesResponse.data || [];
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

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
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
                {study?.patient?.name || '患者'} - {study?.series?.map(s => s.modality).filter(Boolean).join(', ').toUpperCase() || 'N/A'}
              </h1>
              <p className="text-sm text-muted-foreground">
                {study?.studyDate} | {study?.patient?.mrn}
              </p>
            </div>
          </div>
        </div>

        {/* Toolbar */}
        <Card className="mb-4">
          <CardContent className="p-2">
            <Toolbar />
          </CardContent>
        </Card>

        {/* Image canvas */}
        <Card className="flex-1">
          <CardContent className="p-0 h-full">
            <ImageViewer imageId={currentImageId || ''} />
          </CardContent>
        </Card>

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
        {/* Study info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">检查信息</CardTitle>
          </CardHeader>
          <CardContent>
            {study && (
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">检查类型</span>
                  <span>{study.series?.map(s => s.modality).filter(Boolean).join(', ').toUpperCase() || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">检查日期</span>
                  <span>{study.studyDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">模态</span>
                  <span>{study.series?.map(s => s.modality).filter(Boolean).join(', ') || 'N/A'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">状态</span>
                  <span className={`px-2 py-0.5 rounded text-xs ${
                    study.status === 'reported' ? 'bg-green-500/10 text-green-500' :
                    study.status === 'diagnosed' ? 'bg-blue-500/10 text-blue-500' :
                    'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {study.status === 'reported' ? '已报告' :
                     study.status === 'diagnosed' ? '已诊断' : '待处理'}
                  </span>
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
              检查级标注
            </CardTitle>
          </CardHeader>
          <CardContent>
            {studyAnnotations.length === 0 ? (
              <p className="text-xs text-muted-foreground">暂无检查级标注</p>
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
            <CardTitle className="text-sm">图像列表</CardTitle>
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
      </div>
    </div>
  );
}
