import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useEditorStore, ImageFilter } from '@/stores/editorStore';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Plus, Trash2, RotateCcw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ImageFiltersProps {
  className?: string;
}

const availableFilters: Array<{
  type: ImageFilter['type'];
  nameKey: string;
  params: Array<{ key: string; labelKey: string; min: number; max: number; default: number }>;
}> = [
  {
    type: 'brightness',
    nameKey: 'viewer.filter.brightness',
    params: [{ key: 'value', labelKey: 'viewer.filter.param.value', min: -100, max: 100, default: 0 }],
  },
  {
    type: 'contrast',
    nameKey: 'viewer.filter.contrast',
    params: [{ key: 'value', labelKey: 'viewer.filter.param.value', min: -100, max: 100, default: 0 }],
  },
  {
    type: 'saturation',
    nameKey: 'viewer.filter.saturation',
    params: [{ key: 'value', labelKey: 'viewer.filter.param.value', min: -100, max: 100, default: 0 }],
  },
  {
    type: 'sharpen',
    nameKey: 'viewer.filter.sharpen',
    params: [{ key: 'strength', labelKey: 'viewer.filter.param.strength', min: 0, max: 5, default: 1 }],
  },
  {
    type: 'gaussian_blur',
    nameKey: 'viewer.filter.gaussianBlur',
    params: [{ key: 'radius', labelKey: 'viewer.filter.param.radius', min: 1, max: 20, default: 1 }],
  },
  {
    type: 'median',
    nameKey: 'viewer.filter.median',
    params: [{ key: 'radius', labelKey: 'viewer.filter.param.radius', min: 1, max: 5, default: 1 }],
  },
  {
    type: 'sobel',
    nameKey: 'viewer.filter.sobel',
    params: [],
  },
  {
    type: 'canny',
    nameKey: 'viewer.filter.canny',
    params: [
      { key: 'low', labelKey: 'viewer.filter.param.lowThreshold', min: 0, max: 255, default: 50 },
      { key: 'high', labelKey: 'viewer.filter.param.highThreshold', min: 0, max: 255, default: 150 },
    ],
  },
  {
    type: 'histogram_eq',
    nameKey: 'viewer.filter.histogramEq',
    params: [],
  },
];

export function ImageFilters({ className }: ImageFiltersProps) {
  const { t } = useTranslation();
  const {
    filters,
    addFilter,
    removeFilter,
    toggleFilter,
    setFilterParam,
    resetFilters,
  } = useEditorStore();

  const [selectedFilterType, setSelectedFilterType] = useState<ImageFilter['type']>('sharpen');

  const handleAddFilter = () => {
    const filterDef = availableFilters.find((f) => f.type === selectedFilterType);
    if (!filterDef) return;

    // Check if filter already exists
    if (filters.some((f) => f.type === selectedFilterType)) {
      return;
    }

    const params: Record<string, number> = {};
    filterDef.params.forEach((p) => {
      params[p.key] = p.default;
    });

    const newFilter: ImageFilter = {
      id: `filter-${Date.now()}`,
      type: selectedFilterType,
      name: t(filterDef.nameKey),
      enabled: true,
      params,
    };

    addFilter(newFilter);
  };

  const getFilterDef = (type: ImageFilter['type']) => {
    return availableFilters.find((f) => f.type === type);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center justify-between">
        <Label className="text-sm font-semibold">{t('viewer.filters')}</Label>
        <Button
          variant="ghost"
          size="sm"
          onClick={resetFilters}
          className="h-7 px-2 text-xs"
        >
          <RotateCcw className="h-3 w-3 mr-1" />
          {t('viewer.filter.reset')}
        </Button>
      </div>

      {/* Add filter */}
      <div className="flex space-x-2">
        <select
          value={selectedFilterType}
          onChange={(e) => setSelectedFilterType(e.target.value as ImageFilter['type'])}
          className="flex-1 h-8 rounded border bg-background px-2 text-xs"
        >
          {availableFilters.map((f) => (
            <option
              key={f.type}
              value={f.type}
              disabled={filters.some((sf) => sf.type === f.type)}
            >
              {t(f.nameKey)}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          onClick={handleAddFilter}
          disabled={filters.some((f) => f.type === selectedFilterType)}
          className="h-8 px-2"
        >
          <Plus className="h-3 w-3" />
        </Button>
      </div>

      {/* Active filters */}
      <div className="space-y-3 max-h-[400px] overflow-y-auto">
        {filters.length === 0 ? (
          <div className="text-center py-4 text-muted-foreground text-xs">
            {t('viewer.filter.empty')}
          </div>
        ) : (
          filters.map((filter) => {
            const filterDef = getFilterDef(filter.type);
            
            return (
              <div
                key={filter.id}
                className={cn(
                  'p-3 rounded-md border transition-colors',
                  filter.enabled ? 'bg-primary/5 border-primary/20' : 'bg-muted/50'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={filter.enabled}
                      onCheckedChange={() => toggleFilter(filter.id)}
                      className="scale-75"
                    />
                    <span className="text-sm font-medium">{filter.name}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive hover:text-destructive"
                    onClick={() => removeFilter(filter.id)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>

                {/* Filter parameters */}
                {filterDef && filterDef.params.length > 0 && (
                  <div className="space-y-2 mt-2">
                    {filterDef.params.map((param) => (
                      <div key={param.key}>
                        <div className="flex justify-between text-xs mb-1">
                          <span className="text-muted-foreground">{t(param.labelKey)}</span>
                          <span>{filter.params[param.key] ?? param.default}</span>
                        </div>
                        <input
                          type="range"
                          className="w-full"
                          min={param.min}
                          max={param.max}
                          value={filter.params[param.key] ?? param.default}
                          onChange={(e) =>
                            setFilterParam(filter.id, param.key, Number(e.target.value))
                          }
                          disabled={!filter.enabled}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
