/**
 * EditorPanel — 编辑工作区侧栏面板 (wayfinder #112): 图层 / 滤镜 / 测量展示.
 *
 * Mounts the orphaned editor components (LayerManager / ImageFilters /
 * MeasurementDisplay) into the viewer workspace as tabbed cards. Opened via the
 * toolbar "编辑" group or ⌘K (viewerStore.editorPanelOpen).
 */

import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Layers, SlidersHorizontal, Ruler } from 'lucide-react';
import { LayerManager } from './LayerManager';
import { ImageFilters } from './ImageFilters';
import { MeasurementDisplay } from './MeasurementDisplay';

interface EditorPanelProps {
  className?: string;
  /** Current image id — scopes layers to the image (and annotations round-trip). */
  imageId?: string;
}

export function EditorPanel({ className, imageId }: EditorPanelProps) {
  const { t } = useTranslation();

  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{t('viewer.editor.title')}</CardTitle>
      </CardHeader>
      <CardContent className="p-2">
        <Tabs defaultValue="layers">
          <TabsList className="grid w-full grid-cols-3 h-8">
            <TabsTrigger value="layers" className="text-xs flex items-center gap-1">
              <Layers className="h-3 w-3" />
              {t('viewer.editor.tabLayers')}
            </TabsTrigger>
            <TabsTrigger value="filters" className="text-xs flex items-center gap-1">
              <SlidersHorizontal className="h-3 w-3" />
              {t('viewer.editor.tabFilters')}
            </TabsTrigger>
            <TabsTrigger value="measurements" className="text-xs flex items-center gap-1">
              <Ruler className="h-3 w-3" />
              {t('viewer.editor.tabMeasurements')}
            </TabsTrigger>
          </TabsList>
          <TabsContent value="layers" className="mt-3">
            <LayerManager imageId={imageId} />
          </TabsContent>
          <TabsContent value="filters" className="mt-3">
            <ImageFilters />
          </TabsContent>
          <TabsContent value="measurements" className="mt-3">
            <MeasurementDisplay />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}
