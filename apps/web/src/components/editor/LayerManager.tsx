import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore, Layer } from '@/stores/editorStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
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

export function LayerManager({ className }: LayerManagerProps) {
  const { t } = useTranslation();

  const {
    layers,
    activeLayerId,
    addLayer,
    removeLayer,
    reorderLayers,
    setActiveLayer,
    toggleLayerVisibility,
    toggleLayerLock,
    setLayerOpacity,
  } = useEditorStore();

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [newLayerName, setNewLayerName] = useState('');
  const [newLayerType, setNewLayerType] = useState<Layer['type']>('annotation');

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

  const handleAddLayer = () => {
    if (!newLayerName.trim()) return;

    const newLayer: Layer = {
      id: `layer-${Date.now()}`,
      name: newLayerName,
      type: newLayerType,
      visible: true,
      opacity: 1,
      locked: false,
      order: layers.length,
    };

    addLayer(newLayer);
    setNewLayerName('');
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{t('viewer.layers')}</Label>
      </div>

      {/* Add new layer */}
      <div className="flex space-x-2">
        <Input
          value={newLayerName}
          onChange={(e) => setNewLayerName(e.target.value)}
          placeholder={t('viewer.layer.name')}
          className="flex-1 h-8 text-xs"
          onKeyDown={(e) => e.key === 'Enter' && handleAddLayer()}
        />
        <select
          value={newLayerType}
          onChange={(e) => setNewLayerType(e.target.value as Layer['type'])}
          className="h-8 rounded border bg-background px-2 text-xs"
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
          disabled={!newLayerName.trim()}
          className="h-8 px-2"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

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
                        toggleLayerVisibility(layer.id);
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
                        removeLayer(layer.id);
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
    </div>
  );
}
