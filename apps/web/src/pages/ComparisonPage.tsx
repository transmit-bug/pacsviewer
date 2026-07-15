import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { studyApi, imageApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ComparisonView } from '@/components/comparison/ComparisonView';
import { ArrowLeft, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Image {
  id: string;
  filePath: string;
  thumbnailPath?: string;
  width: number;
  height: number;
  format: string;
  instanceNumber: number;
}

interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  studyType: string;
  modality: string;
  patient?: {
    name: string;
    mrn: string;
  };
}

export function ComparisonPage() {
  const [searchParams] = useSearchParams();
  const studyId = searchParams.get('studyId');

  const [study, setStudy] = useState<Study | null>(null);
  const [images, setImages] = useState<Image[]>([]);
  const [selectedImageA, setSelectedImageA] = useState<string | null>(null);
  const [selectedImageB, setSelectedImageB] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState<'A' | 'B'>('A');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (studyId) {
      loadStudy(studyId);
      loadImages(studyId);
    } else {
      setLoading(false);
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
        if (imageList.length >= 2) {
          setSelectedImageA(imageList[0].id);
          setSelectedImageB(imageList[1].id);
        } else if (imageList.length === 1) {
          setSelectedImageA(imageList[0].id);
        }
      }
    } catch (error) {
      console.error('Failed to load images:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImageSelect = (imageId: string) => {
    if (selectionMode === 'A') {
      setSelectedImageA(imageId);
      setSelectionMode('B');
    } else {
      setSelectedImageB(imageId);
      setSelectionMode('A');
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] space-x-4">
      {/* Main comparison view */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Button variant="ghost" size="icon" asChild>
              <Link to={studyId ? `/patients/${study?.patientId}` : '/'}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold">图像对比</h1>
              {study && (
                <p className="text-sm text-muted-foreground">
                  {study.patient?.name} - {study.studyType.toUpperCase()} - {study.studyDate}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Comparison View */}
        <Card className="flex-1 overflow-hidden">
          <CardContent className="p-0 h-full">
            <ComparisonView
              imageIdA={selectedImageA || ''}
              imageIdB={selectedImageB || ''}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - Image selection */}
      <div className="w-80 flex flex-col space-y-4">
        {/* Selection info */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">选择对比图像</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">当前选择:</span>
                <div className="flex gap-1">
                  <Button
                    variant={selectionMode === 'A' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectionMode('A')}
                    className="h-7 text-xs"
                  >
                    图像 A
                  </Button>
                  <Button
                    variant={selectionMode === 'B' ? 'default' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectionMode('B')}
                    className="h-7 text-xs"
                  >
                    图像 B
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-muted rounded p-2">
                  <span className="text-muted-foreground">A:</span>{' '}
                  {selectedImageA
                    ? `#${images.find((i) => i.id === selectedImageA)?.instanceNumber || '?'}`
                    : '未选择'}
                </div>
                <div className="bg-muted rounded p-2">
                  <span className="text-muted-foreground">B:</span>{' '}
                  {selectedImageB
                    ? `#${images.find((i) => i.id === selectedImageB)?.instanceNumber || '?'}`
                    : '未选择'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Image list */}
        <Card className="flex-1 overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">图像列表</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-y-auto max-h-[500px]">
            <div className="grid grid-cols-3 gap-1 p-2">
              {images.map((image) => {
                const isA = selectedImageA === image.id;
                const isB = selectedImageB === image.id;
                const isSelected = isA || isB;

                return (
                  <button
                    key={image.id}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded border-2 transition-colors',
                      isSelected
                        ? isA
                          ? 'border-blue-500'
                          : 'border-green-500'
                        : 'border-transparent hover:border-primary/50'
                    )}
                    onClick={() => handleImageSelect(image.id)}
                  >
                    {image.thumbnailPath ? (
                      <img
                        src={image.thumbnailPath}
                        alt={`Image ${image.instanceNumber}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        <ImageIcon className="h-4 w-4 mr-1" />
                        {image.instanceNumber}
                      </div>
                    )}
                    {isSelected && (
                      <div
                        className={cn(
                          'absolute top-0.5 right-0.5 text-white text-xs px-1 rounded',
                          isA ? 'bg-blue-500' : 'bg-green-500'
                        )}
                      >
                        {isA ? 'A' : 'B'}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
            {images.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">
                暂无图像
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
