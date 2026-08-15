import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore, Layer } from '@/stores/editorStore';
import { layerApi, annotationApi } from '@/services/api';
import { setLayerVisibility } from '@/lib/cornerstone/layerVisibility';
import { MAIN_VIEWPORT_ID } from '@/lib/cornerstone/viewportRegistry';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Trash2,
  Plus,
  GripVertical,
  Image,
  Pen,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayerManagerProps {
  className?: string;
  /** Current image — layers are loaded from / persisted to the backend scoped to it. */
  imageId?: string;
}

const layerTypeIcons = {
  image: Image,
  annotation: Pen,
  ai_result: Cpu,
};

const layerTypeLabelKeys: Record<Layer['type'], string> = {
  image: 'viewer.layer.image',
  annotation: 'viewer.layer.annotation',
  ai_result: 'viewer.layer.aiResult',
};

/** Map a backend layer row to the editorStore Layer shape. */
function fromBackend(row: any): Layer {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    visible: row.visible,
    opacity: row.opacity,
    locked: row.locked,
    order: row.sortOrder ?? 0,
  };
}

export function LayerManager({ className, imageId }: LayerManagerProps) {
  const { t } = useTranslation();

  const {
    layers,
    activeLayerId,
    addLayer,
    removeLayer,
    reorderLayers,
    setActiveLayer,
    setLayers,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
  } = useEditorStore();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState<Layer['type']>('annotation');
  const [deleteTarget, setDeleteTarget] = useState<Layer | null>(null);
  const [deleteCount, setDeleteCount] = useState(0);
  const [deleting, setDeleting] = useState(false);
  const [loadingLayers, setLoadingLayers] = useState(false);

  // ── Load layers from the backend when the image changes (#108 闭环: 重载恢复) ──
  useEffect(() => {
    if (!imageId) {
      setLayers([]);
      return;
    }
    let cancelled = false;
    setLoadingLayers(true);
    layerApi
      .getByImage(imageId)
      .then((resp: any) => {
        if (cancelled) return;
        const rows = resp?.data?.data ?? resp?.data ?? [];
        setLayers(Array.isArray(rows) ? rows.map(fromBackend) : []);
      })
      .catch((err: unknown) => {
        console.warn('[LayerManager] 加载图层失败:', err);
        if (!cancelled) setLayers([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingLayers(false);
      });
    return () => {
      cancelled = true;
    };
  }, [imageId, setLayers]);

  const handleDragStart = (index: number) => {
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== index) {
      reorderLayers(dragIndex, index);
      setDragIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDragIndex(null);
  };

  const handleAddLayer = useCallback(async () => {
    if (!imageId || !newLayerName.trim()) return;

    const payload = {
      name: newLayerName,
      type: newLayerType,
      visible: true,
      opacity: 1,
      locked: false,
      sortOrder: layers.length,
    };

    try {
      const resp = await layerApi.create(imageId, payload) as any;
      const row = resp?.data?.data ?? resp?.data;
      if (row?.id) {
        addLayer(fromBackend(row));
        setNewLayerName('');
      }
    } catch (err) {
      console.warn('[LayerManager] 创建图层失败:', err);
    }
  }, [imageId, newLayerName, newLayerType, layers.length, addLayer]);

  const handleToggleVisibility = useCallback(
    async (layer: Layer) => {
      toggleLayerVisibility(layer.id);
      const nextVisible = !layer.visible;
      // AnnotationGroup 显隐: flip Cornerstone annotation visibility for the layer.
      setLayerVisibility(MAIN_VIEWPORT_ID, layer.id, nextVisible);
      try {
        await layerApi.update(layer.id, { visible: nextVisible });
      } catch (err) {
        console.warn('[LayerManager] 更新图层可见性失败:', err);
      }
    },
    [toggleLayerVisibility],
  );

  /** Count annotations that would be cascade-deleted with the layer (backend rows). */
  const countLayerAnnotations = useCallback(
    async (layerId: string): Promise<number> => {
      if (!imageId) return 0;
      try {
        const resp = await annotationApi.list({ imageId }) as any;
        const rows = resp?.data?.data ?? resp?.data ?? [];
        return Array.isArray(rows) ? rows.filter((r: any) => r.layerId === layerId).length : 0;
      } catch {
        return 0;
      }
    },
    [imageId],
  );

  const handleDeleteClick = useCallback(
    async (layer: Layer) => {
      const count = await countLayerAnnotations(layer.id);
      setDeleteCount(count);
      setDeleteTarget(layer);
    },
    [countLayerAnnotations],
  );

  const confirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      // 后端级联: 图层 + 该图层下标注一并删除 (#108 决议).
      await layerApi.delete(deleteTarget.id);
      removeLayer(deleteTarget.id);
      setDeleteTarget(null);
    } catch (err) {
      console.warn('[LayerManager] 删除图层失败:', err);
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, removeLayer]);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{t('viewer.layers')}</Label>
        {loadingLayers && <span className="text-xs text-muted-foreground">…</span>}
      </div>

      {/* Add new layer */}
      <div className="flex space-x-2">
        <Input
          value={newLayerName}
          onChange={(e) => setNewLayerName(e.target.value)}
          placeholder={t('viewer.layer.name')}
          className="flex-1 h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && handleAddLayer()}
          disabled={!imageId}
        />
        <select
          value={newLayerType}
          onChange={(e) => setNewLayerType(e.target.value as Layer['type'])}
          className="h-8 rounded border bg-background px-2 text-xs"
          disabled={!imageId}
        >
          {Object.entries(layerTypeLabelKeys).map(([value, labelKey]) => (
            <option key={value} value={value}>
              {t(labelKey)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={handleAddLayer}
          disabled={!newLayerName.trim() || !imageId}
          className="h-8 px-2"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {!imageId && (
        <p className="text-xs text-muted-foreground">{t('viewer.layer.needImage')}</p>
      )}

      {/* Layer list */}
      <div className="space-y-1 max-h-[300px] overflow-y-auto">
        {layers.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-xs">
            {t('viewer.layer.empty')}
          </div>
        ) : (
          [...layers]
            .sort((a, b) => b.order - a.order)
            .map((layer, index) => {
              const Icon = layerTypeIcons[layer.type];
              const isActive = layer.id === activeLayerId;

              return (
                <div
                  key={layer.id}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnd={handleDragEnd}
                  onClick={() => setActiveLayer(layer.id)}
                  className={cn(
                    'flex items-center space-x-2 p-2 rounded-md cursor-pointer transition-colors',
                    isActive
                      ? 'bg-primary/10 border border-primary/30'
                      : 'hover:bg-muted',
                    dragIndex === index && 'opacity-50'
                  )}
                >
                  <GripVertical className="h-3 w-3 text-muted-foreground cursor-grab" />

                  <Icon className="h-4 w-4 text-muted-foreground" />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm truncate">{layer.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {t(layerTypeLabelKeys[layer.type])}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleVisibility(layer);
                      }}
                      title={layer.visible ? t('viewer.layer.hide') : t('viewer.layer.show')}
                    >
                      {layer.visible ? (
                        <Eye className="h-3 w-3" />
                      ) : (
                        <EyeOff className="h-3 w-3 text-muted-foreground" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleLayerLock(layer.id);
                      }}
                      title={layer.locked ? t('viewer.layer.unlock') : t('viewer.layer.lock')}
                    >
                      {layer.locked ? (
                        <Lock className="h-3 w-3 text-yellow-500" />
                      ) : (
                        <Unlock className="h-3 w-3" />
                      )}
                    </Button>

                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteClick(layer);
                      }}
                      title={t('viewer.layer.delete')}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })
        )}
      </div>

      {/* Opacity slider for active layer */}
      {activeLayerId && (
        <div className="pt-2 border-t">
          <div className="flex justify-between text-xs mb-1">
            <Label>{t('viewer.layer.opacity')}</Label>
            <span>{Math.round((layers.find((l) => l.id === activeLayerId)?.opacity || 1) * 100)}%</span>
          </div>
          <input
            type="range"
            className="w-full"
            min="0"
            max="100"
            value={Math.round((layers.find((l) => l.id === activeLayerId)?.opacity || 1) * 100)}
            onChange={(e) => setLayerOpacity(activeLayerId, Number(e.target.value) / 100)}
          />
        </div>
      )}

      {/* Delete confirm — cascade delete layer + its annotations */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('viewer.layer.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteCount > 0
                ? t('viewer.layer.deleteConfirmWithCount', { name: deleteTarget?.name ?? '', count: deleteCount })
                : t('viewer.layer.deleteConfirm', { name: deleteTarget?.name ?? '' })}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? '…' : t('common.confirm')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
