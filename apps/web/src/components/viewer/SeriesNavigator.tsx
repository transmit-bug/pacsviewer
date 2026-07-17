import { useState, useEffect } from 'react';
import { studyApi, imageApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Layers, Image as ImageIcon, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Series {
  id: string;
  seriesNumber: number;
  modality: string;
  description?: string;
  imageCount: number;
}

interface SeriesNavigatorProps {
  studyId: string;
  currentSeriesId?: string;
  onSeriesSelect: (seriesId: string) => void;
  className?: string;
}

export function SeriesNavigator({
  studyId,
  currentSeriesId,
  onSeriesSelect,
  className,
}: SeriesNavigatorProps) {
  const [series, setSeries] = useState<Series[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSeries();
  }, [studyId]);

  const loadSeries = async () => {
    try {
      setLoading(true);
      const response = await studyApi.getSeries(studyId);
      const seriesList = response.data || [];
      
      // Get image count for each series
      const seriesWithCount = await Promise.all(
        seriesList.map(async (s: any) => {
          try {
            const imagesRes = await imageApi.search({ seriesId: s.id, pageSize: 1 });
            // API returns { success: true, data: { items: [...], total: number, ... } }
            const imageData = imagesRes.data;
            const imageCount = imageData?.total || imageData?.items?.length || 0;
            return {
              id: s.id,
              seriesNumber: s.seriesNumber || 0,
              modality: s.modality || 'N/A',
              description: s.description,
              imageCount,
            };
          } catch {
            return {
              id: s.id,
              seriesNumber: s.seriesNumber || 0,
              modality: s.modality || 'N/A',
              description: s.description,
              imageCount: 0,
            };
          }
        })
      );

      // Sort by series number
      seriesWithCount.sort((a, b) => a.seriesNumber - b.seriesNumber);
      setSeries(seriesWithCount);
    } catch (error) {
      console.error('Failed to load series:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card className={className}>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm flex items-center gap-2">
            <Layers className="h-4 w-4" />
            系列列表
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2">
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center space-x-2 p-2">
                <Skeleton className="h-8 w-8 rounded" />
                <div className="space-y-1 flex-1">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-2 w-12" />
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  if (series.length <= 1) {
    return null; // Don't show navigator for single series
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4" />
          系列列表
          <span className="text-xs font-normal text-muted-foreground ml-auto">
            {series.length} 个系列
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-1">
            {series.map((s) => {
              const isActive = s.id === currentSeriesId;
              return (
                <button
                  key={s.id}
                  onClick={() => onSeriesSelect(s.id)}
                  className={cn(
                    'w-full flex items-center space-x-2 p-2 rounded text-left transition-colors',
                    isActive
                      ? 'bg-primary text-primary-foreground'
                      : 'hover:bg-accent'
                  )}
                >
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded',
                    isActive ? 'bg-primary-foreground/20' : 'bg-muted'
                  )}>
                    <ImageIcon className={cn(
                      'h-4 w-4',
                      isActive ? 'text-primary-foreground' : 'text-muted-foreground'
                    )} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {s.description || `系列 ${s.seriesNumber}`}
                    </p>
                    <p className={cn(
                      'text-xs truncate',
                      isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'
                    )}>
                      {s.modality} · {s.imageCount} 张图像
                    </p>
                  </div>
                  {isActive && (
                    <ChevronRight className="h-4 w-4 flex-shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
