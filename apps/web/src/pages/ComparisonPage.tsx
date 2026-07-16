import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { studyApi, imageApi, comparisonApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ComparisonView } from '@/components/comparison/ComparisonView';
import type { ComparisonMode } from '@/components/comparison/ComparisonView';
import {
  ArrowLeft,
  Image as ImageIcon,
  Save,
  FolderOpen,
  Star,
  StarOff,
  Camera,
  Trash2,
  Clock,
  Heart,
} from 'lucide-react';
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

interface Series {
  id: string;
  modality: string;
  seriesNumber: number;
}

interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  patient?: {
    name: string;
    mrn: string;
  };
  series?: Series[];
}

interface SavedComparison {
  id: string;
  name: string;
  type: string;
  config: any;
  imageIds: string[];
  isFavorite: boolean;
  snapshotPath?: string;
  createdAt: string;
  updatedAt: string;
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

  // Persistence state
  const [comparisonName, setComparisonName] = useState('');
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('side-by-side');
  const [currentComparisonId, setCurrentComparisonId] = useState<string | null>(null);
  const [savedComparisons, setSavedComparisons] = useState<SavedComparison[]>([]);
  const [showSavedPanel, setShowSavedPanel] = useState(false);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [saving, setSaving] = useState(false);

  const comparisonViewRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (studyId) {
      loadStudy(studyId);
      loadImages(studyId);
    } else {
      setLoading(false);
    }
  }, [studyId]);

  useEffect(() => {
    loadSavedComparisons();
  }, [showFavoritesOnly]);

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

  const loadSavedComparisons = async () => {
    try {
      const params: any = {};
      if (studyId && study) {
        params.patientId = study.patientId;
      }

      const response = showFavoritesOnly
        ? await comparisonApi.getFavorites()
        : await comparisonApi.getAll(params);
      setSavedComparisons(response.data || []);
    } catch (error) {
      console.error('Failed to load saved comparisons:', error);
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

  const handleSave = async () => {
    if (!selectedImageA || !selectedImageB) {
      toast({
        title: '请先选择两张图像',
        variant: 'destructive',
      });
      return;
    }

    const name = comparisonName.trim() || `对比 ${new Date().toLocaleString('zh-CN')}`;

    setSaving(true);
    try {
      const config = {
        imageIdA: selectedImageA,
        imageIdB: selectedImageB,
        mode: comparisonMode,
      };

      if (currentComparisonId) {
        await comparisonApi.update(currentComparisonId, {
          name,
          config,
          imageIds: [selectedImageA, selectedImageB],
          type: comparisonMode === 'side-by-side' ? 'side_by_side' : comparisonMode,
        });
        toast({
          title: '对比已更新',
        });
      } else {
        const response = await comparisonApi.create({
          name,
          type: comparisonMode === 'side-by-side' ? 'side_by_side' : comparisonMode,
          config,
          imageIds: [selectedImageA, selectedImageB],
          patientId: study?.patientId,
        });
        setCurrentComparisonId(response.data.id);
        toast({
          title: '对比已保存',
        });
      }

      loadSavedComparisons();
    } catch (error) {
      console.error('Failed to save comparison:', error);
      toast({
        title: '保存失败',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleLoad = (saved: SavedComparison) => {
    const config = saved.config;
    if (config.imageIdA) setSelectedImageA(config.imageIdA);
    if (config.imageIdB) setSelectedImageB(config.imageIdB);
    if (config.mode) {
      setComparisonMode(config.mode as ComparisonMode);
    }
    setCurrentComparisonId(saved.id);
    setComparisonName(saved.name);
    setShowSavedPanel(false);
    toast({
      title: '已加载对比配置',
    });
  };

  const handleDelete = async (id: string) => {
    try {
      await comparisonApi.delete(id);
      if (currentComparisonId === id) {
        setCurrentComparisonId(null);
        setComparisonName('');
      }
      loadSavedComparisons();
      toast({
        title: '已删除',
      });
    } catch (error) {
      console.error('Failed to delete comparison:', error);
      toast({
        title: '删除失败',
        variant: 'destructive',
      });
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      await comparisonApi.toggleFavorite(id);
      loadSavedComparisons();
    } catch (error) {
      console.error('Failed to toggle favorite:', error);
    }
  };

  const handleSnapshot = async () => {
    if (!currentComparisonId) {
      toast({
        title: '请先保存对比配置',
        variant: 'destructive',
      });
      return;
    }

    // Capture the comparison view as a snapshot
    const viewElement = comparisonViewRef.current;
    if (!viewElement) return;

    try {
      // Use html2canvas-style approach: find canvas elements within the view
      const canvasElements = viewElement.querySelectorAll('canvas');
      if (canvasElements.length === 0) {
        toast({
          title: '未找到可截取的画布',
          variant: 'destructive',
        });
        return;
      }

      // Create a composite canvas
      const compositeCanvas = document.createElement('canvas');
      const firstCanvas = canvasElements[0];
      compositeCanvas.width = firstCanvas.width * (canvasElements.length > 1 ? 2 : 1);
      compositeCanvas.height = firstCanvas.height;
      const ctx = compositeCanvas.getContext('2d');

      if (ctx) {
        canvasElements.forEach((canvas, index) => {
          ctx.drawImage(canvas, index * firstCanvas.width, 0);
        });

        const imageData = compositeCanvas.toDataURL('image/png');
        await comparisonApi.saveSnapshot(currentComparisonId, imageData);
        toast({
          title: '快照已保存',
        });
      }
    } catch (error) {
      console.error('Failed to take snapshot:', error);
      toast({
        title: '快照失败',
        variant: 'destructive',
      });
    }
  };

  const handleNewComparison = () => {
    setCurrentComparisonId(null);
    setComparisonName('');
  };

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
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
                  {study.patient?.name} - {study.series?.map(s => s.modality).filter(Boolean).join(', ').toUpperCase() || 'N/A'} - {study.studyDate}
                </p>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleNewComparison}>
              新建
            </Button>
            <Button variant="outline" size="sm" onClick={() => setShowSavedPanel(!showSavedPanel)}>
              <FolderOpen className="h-4 w-4 mr-1" />
              历史对比
            </Button>
            <Button variant="outline" size="sm" onClick={handleSnapshot} disabled={!currentComparisonId}>
              <Camera className="h-4 w-4 mr-1" />
              快照
            </Button>
            <Button size="sm" onClick={handleSave} disabled={saving || !selectedImageA || !selectedImageB}>
              <Save className="h-4 w-4 mr-1" />
              {saving ? '保存中...' : currentComparisonId ? '更新' : '保存'}
            </Button>
          </div>
        </div>

        {/* Save name input */}
        <div className="flex items-center gap-2 mb-2">
          <Label htmlFor="comparison-name" className="text-sm whitespace-nowrap">
            名称:
          </Label>
          <Input
            id="comparison-name"
            value={comparisonName}
            onChange={(e) => setComparisonName(e.target.value)}
            placeholder="输入对比名称（可选）"
            className="h-8 text-sm"
          />
          {currentComparisonId && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleFavorite(currentComparisonId)}
              className="h-8 px-2"
            >
              <Star className="h-4 w-4" />
            </Button>
          )}
        </div>

        {/* Comparison View */}
        <Card className="flex-1 overflow-hidden" ref={comparisonViewRef}>
          <CardContent className="p-0 h-full">
            <ComparisonView
              imageIdA={selectedImageA || ''}
              imageIdB={selectedImageB || ''}
              initialMode={comparisonMode}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar - Image selection + Saved comparisons */}
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
          <CardContent className="p-0 overflow-y-auto max-h-[300px]">
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

        {/* Saved Comparisons Panel */}
        {showSavedPanel && (
          <Card className="flex-1 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">历史对比</CardTitle>
                <Button
                  variant={showFavoritesOnly ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                  className="h-7 text-xs"
                >
                  {showFavoritesOnly ? (
                    <Heart className="h-3 w-3 mr-1 fill-current" />
                  ) : (
                    <Heart className="h-3 w-3 mr-1" />
                  )}
                  收藏
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0 overflow-y-auto max-h-[300px]">
              {savedComparisons.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground text-sm">
                  {showFavoritesOnly ? '暂无收藏' : '暂无保存的对比'}
                </div>
              ) : (
                <div className="space-y-1 p-2">
                  {savedComparisons.map((saved) => (
                    <div
                      key={saved.id}
                      className={cn(
                        'flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer group',
                        currentComparisonId === saved.id && 'bg-accent'
                      )}
                      onClick={() => handleLoad(saved)}
                    >
                      {saved.snapshotPath ? (
                        <img
                          src={comparisonApi.getSnapshotUrl(saved.id)}
                          alt={saved.name}
                          className="w-12 h-12 object-cover rounded border"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded border bg-muted flex items-center justify-center">
                          <ImageIcon className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">{saved.name}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {new Date(saved.updatedAt).toLocaleDateString('zh-CN')}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleFavorite(saved.id);
                          }}
                        >
                          {saved.isFavorite ? (
                            <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />
                          ) : (
                            <StarOff className="h-3 w-3" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0 text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDelete(saved.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
