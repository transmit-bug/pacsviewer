/**
 * WorkspacePanels — 查看器工作台左右面板 (wayfinder #126, 决议 #122)。
 *
 * 左: 序列列表 + 切片缩略图网格 (真实序列/帧数据; 多帧图像显示帧条,
 *     多图序列显示缩略图网格, 悬停放大预览 + teal 当前项高亮)。
 * 右: 标注 / 图层 / 测量 三个 tab — 标注与测量读 measurementStore 实时数据,
 *     图层经 layerApi 读真实图层 (未接线编辑套件的占位形态, #112 衔接)。
 * 两侧均可折叠为玻璃图标窄条 (300ms)。
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { useViewerStore } from '@/stores/viewerStore';
import { useMeasurementStore } from '@/stores/measurementStore';
import { WS_WL_PRESETS } from '@/stores/workspaceStore';
import { useAuthStore } from '@/stores/authStore';
import { layerApi } from '@/services/api';
import { IconBtn } from './workspaceShared';
import { cn } from '@/lib/utils';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Layers,
  Grid3X3,
  Frame,
  Ruler,
  Eye,
} from 'lucide-react';

/* ─── 数据类型 (与 ViewerPage 载入的数据一致) ─────────────── */

export interface WsSeries {
  id: string;
  seriesNumber: number;
  modality: string;
  description?: string;
  imageCount: number;
  bodyPart?: string | null;
}

export interface WsImage {
  id: string;
  instanceNumber: number;
  format: string;
  numberOfFrames?: number | null;
}

export interface WsFrame {
  frameIndex: number;
  sliceLocation?: number | null;
}

/* ─── 左面板: 切片缩略图 ────────────────────────────────── */

function FrameStrip({
  frames,
  currentFrame,
  onFrameSelect,
  thumbnailUrl,
}: {
  frames: WsFrame[];
  currentFrame: number;
  onFrameSelect: (i: number) => void;
  thumbnailUrl?: string;
}) {
  const { t } = useTranslation();
  // 多帧条带: 帧多时降采样 (原型 #123 stride 策略)
  const count = frames.length;
  const stride = count > 64 ? 4 : count > 24 ? 2 : 1;
  const items: number[] = [];
  for (let i = 0; i < count; i += stride) items.push(i);
  if (items[items.length - 1] !== count - 1) items.push(count - 1);

  return (
    <div className="grid grid-cols-3 gap-1.5 p-2.5">
      {items.map((i) => {
        const frame = frames[i];
        const active = i === currentFrame;
        return (
          <Tooltip key={frame.frameIndex}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onFrameSelect(frame.frameIndex)}
                className={cn(
                  'ws-thumb relative aspect-[3/2] overflow-hidden rounded-sm border bg-black',
                  active
                    ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]'
                    : 'border-border/60 hover:border-[hsl(var(--primary))]/60'
                )}
              >
                {thumbnailUrl && (
                  <img src={thumbnailUrl} alt="" className="h-full w-full object-cover opacity-80" draggable={false} />
                )}
                <span className="ws-hud-text hud-numeric absolute bottom-0.5 left-1 text-[10px] text-white/70">
                  {frame.frameIndex + 1}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="w-40">
              {thumbnailUrl && (
                <img src={thumbnailUrl} alt="" className="w-full rounded-sm border border-border" />
              )}
              <div className="mt-1.5 space-y-0.5 text-[11px]">
                <p className="hud-numeric">{t('viewer.workspace.frame', { n: frame.frameIndex + 1, total: count })}</p>
                <p className="text-muted-foreground">
                  {t('viewer.workspace.slicePos')} {frame.sliceLocation != null ? `${frame.sliceLocation.toFixed(2)} mm` : '—'}
                </p>
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function SliceThumbs({
  images,
  currentImageId,
  onImageSelect,
}: {
  images: WsImage[];
  currentImageId: string | null;
  onImageSelect: (id: string) => void;
}) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const urlFor = (id: string) => `/api/images/${id}/thumbnail?token=${token}`;

  if (images.length <= 1) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        {t('viewer.workspace.singleFrameSeries')}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-3 gap-1.5 p-2.5">
      {images.map((img) => {
        const active = img.id === currentImageId;
        return (
          <Tooltip key={img.id}>
            <TooltipTrigger asChild>
              <button
                onClick={() => onImageSelect(img.id)}
                className={cn(
                  'ws-thumb relative aspect-[3/2] overflow-hidden rounded-sm border bg-black',
                  active
                    ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]'
                    : 'border-border/60 hover:border-[hsl(var(--primary))]/60'
                )}
              >
                <img src={urlFor(img.id)} alt="" className="h-full w-full object-cover opacity-80" draggable={false} />
                <span className="ws-hud-text hud-numeric absolute bottom-0.5 left-1 text-[10px] text-white/70">
                  {img.instanceNumber}
                </span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="w-40">
              <img src={urlFor(img.id)} alt="" className="w-full rounded-sm border border-border" />
              <div className="mt-1.5 space-y-0.5 text-[11px]">
                <p className="hud-numeric">{t('viewer.workspace.slice', { n: img.instanceNumber })}</p>
                <p className="text-muted-foreground">{img.format.toUpperCase()}</p>
                {img.numberOfFrames != null && img.numberOfFrames > 1 && (
                  <p className="text-muted-foreground">{t('viewer.workspace.frames', { n: img.numberOfFrames })}</p>
                )}
              </div>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/* ─── 左面板 ────────────────────────────────────────────── */

interface LeftPanelProps {
  series: WsSeries[];
  activeSeriesId?: string;
  onSeriesSelect: (id: string) => void;
  images: WsImage[];
  currentImageId: string | null;
  onImageSelect: (id: string) => void;
  frames: WsFrame[];
  currentFrame: number;
  onFrameSelect: (i: number) => void;
  onCollapse: () => void;
}

function LeftPanel({
  series,
  activeSeriesId,
  onSeriesSelect,
  images,
  currentImageId,
  onImageSelect,
  frames,
  currentFrame,
  onFrameSelect,
  onCollapse,
}: LeftPanelProps) {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const active = series.find((s) => s.id === activeSeriesId);
  const isMultiframe = frames.length > 1;

  return (
    <div className="flex h-full w-64 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          {t('viewer.header.seriesList')}
          <span className="hud-numeric text-[10px]">{series.length}</span>
        </span>
        <button onClick={onCollapse} className="ws-tool-btn rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title={t('viewer.workspace.collapseLeft')}>
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 序列列表 */}
      <div className="shrink-0 space-y-0.5 p-2">
        {series.map((s) => {
          const isActive = s.id === activeSeriesId;
          return (
            <button
              key={s.id}
              onClick={() => onSeriesSelect(s.id)}
              className={cn(
                'ws-tool-btn flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left',
                isActive
                  ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10'
                  : 'border-transparent hover:bg-accent'
              )}
            >
              <Badge variant={isActive ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px]">
                {s.modality}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-xs', isActive ? 'text-[hsl(var(--primary))]' : '')}>
                  {s.description || t('viewer.header.series', { number: s.seriesNumber })}
                </span>
                <span className="block text-[10px] text-muted-foreground">
                  {s.bodyPart} · <span className="hud-numeric">{s.imageCount}</span> {t('viewer.workspace.imagesUnit')}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 切片缩略图 */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t px-2.5 text-[10px] font-medium text-muted-foreground">
        <Grid3X3 className="h-3 w-3" />
        {isMultiframe ? t('viewer.workspace.frameStrip') : t('viewer.workspace.sliceThumbs')}
      </div>
      <div className="min-h-0 flex-1">
        <ScrollArea className="h-full">
          {isMultiframe ? (
            <FrameStrip
              frames={frames}
              currentFrame={currentFrame}
              onFrameSelect={onFrameSelect}
              thumbnailUrl={currentImageId ? `/api/images/${currentImageId}/thumbnail?token=${token}` : undefined}
            />
          ) : (
            <SliceThumbs images={images} currentImageId={currentImageId} onImageSelect={onImageSelect} />
          )}
          {!active && <p className="p-3 text-[11px] text-muted-foreground">{t('viewer.workspace.noSeries')}</p>}
        </ScrollArea>
      </div>
    </div>
  );
}

/* ─── 右面板 ────────────────────────────────────────────── */

interface RightPanelProps {
  currentImageId: string | null;
  selectedAnnoId: string | null;
  onSelectAnno: (id: string | null) => void;
  onCollapse: () => void;
}

function RightPanel({ currentImageId, selectedAnnoId, onSelectAnno, onCollapse }: RightPanelProps) {
  const { t } = useTranslation();
  const { annotations, measurements } = useMeasurementStore();
  const { viewport, setViewport } = useViewerStore();
  const [layers, setLayers] = useState<Array<{ id: string; name: string; visible: boolean; opacity?: number }>>([]);
  const [layersLoaded, setLayersLoaded] = useState(false);

  // 图层: 读真实 layer 数据 (占位形态, 编辑套件 #112 接线后扩展)
  useEffect(() => {
    if (!currentImageId) {
      setLayers([]);
      setLayersLoaded(true);
      return;
    }
    let cancelled = false;
    setLayersLoaded(false);
    layerApi
      .getByImage(currentImageId)
      .then((resp: any) => {
        if (cancelled) return;
        const rows = resp?.data?.items ?? resp?.data ?? [];
        setLayers(Array.isArray(rows) ? rows : []);
      })
      .catch(() => {
        if (!cancelled) setLayers([]);
      })
      .finally(() => {
        if (!cancelled) setLayersLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [currentImageId]);

  const toggleLayer = (layer: { id: string; visible: boolean }) => {
    const next = !layer.visible;
    setLayers((old) => old.map((l) => (l.id === layer.id ? { ...l, visible: next } : l)));
    layerApi
      .update(layer.id, { visible: next } as any)
      .catch(() => console.warn('[WorkspacePanels] 更新图层显隐失败:', layer.id));
  };

  return (
    <div className="flex h-full w-72 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Frame className="h-3.5 w-3.5" />
          {t('viewer.workspace.workbench')}
        </span>
        <button onClick={onCollapse} className="ws-tool-btn rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title={t('viewer.workspace.collapseRight')}>
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>

      <Tabs defaultValue="annotations" className="flex min-h-0 flex-1 flex-col" data-tour="measurement-tools">
        <TabsList className="mx-2 mt-2 grid h-7 grid-cols-3">
          <TabsTrigger value="annotations" className="text-[11px]">{t('viewer.workspace.tabAnnotations')}</TabsTrigger>
          <TabsTrigger value="layers" className="text-[11px]">{t('viewer.workspace.tabLayers')}</TabsTrigger>
          <TabsTrigger value="measure" className="text-[11px]">{t('viewer.workspace.tabMeasurements')}</TabsTrigger>
        </TabsList>

        {/* 标注: measurementStore 实时列表, 点击在 Cornerstone 中选中 (琥珀) */}
        <TabsContent value="annotations" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-1 p-2">
              {annotations.map((a) => {
                const selected = a.id === selectedAnnoId;
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelectAnno(selected ? null : a.id)}
                    className={cn(
                      'ws-tool-btn flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left',
                      selected ? 'border-amber-500/60 bg-amber-500/10' : 'border-transparent hover:bg-accent'
                    )}
                  >
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full border border-white/60', selected ? 'bg-amber-400' : 'bg-teal-400')} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{a.data.label || a.data.text || a.toolName}</span>
                      <span className="block text-[10px] text-muted-foreground">{a.toolName}</span>
                    </span>
                  </button>
                );
              })}
              {annotations.length === 0 && (
                <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t('viewer.workspace.noAnnotationsHint')}
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        {/* 图层: 真实 layer 数据 + 显隐切换 (#112 接线前的占位形态) */}
        <TabsContent value="layers" className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            {layers.map((l, i) => (
              <div key={l.id} className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
                <span className="hud-numeric text-[10px] text-muted-foreground">{i + 1}</span>
                <span className="flex-1 truncate text-xs">{l.name}</span>
                <Switch checked={l.visible} onCheckedChange={() => toggleLayer(l)} />
              </div>
            ))}
            {layersLoaded && layers.length === 0 && (
              <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
                {t('viewer.workspace.noLayersHint')}
              </p>
            )}
            <p className="pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              {t('viewer.workspace.layerOrderHint')}
            </p>
          </div>
        </TabsContent>

        {/* 测量: measurementStore 实时测量值 (tabular-nums) + 窗宽窗位 */}
        <TabsContent value="measure" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-0.5 p-2">
              {measurements.map((m) => (
                <div key={m.id} className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
                  <Ruler className="h-3.5 w-3.5 shrink-0 text-teal-300" />
                  <span className="min-w-0 flex-1 truncate text-xs">{m.label}</span>
                  <span className="hud-numeric text-xs text-foreground/90">{m.displayText}</span>
                </div>
              ))}
              {measurements.length === 0 && (
                <p className="p-3 text-[11px] leading-relaxed text-muted-foreground">
                  {t('viewer.workspace.noMeasurementsHint')}
                </p>
              )}
            </div>

            {/* 窗宽窗位 (驱动真实 Cornerstone VOI) */}
            <div className="mt-2 border-t p-2.5">
              <p className="text-[10px] font-medium text-muted-foreground">{t('viewer.windowLevel')}</p>
              <div className="mt-2 space-y-2">
                <div>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <Label>{t('viewer.windowLevelPanel.width')}</Label>
                    <span className="hud-numeric text-muted-foreground">{Math.round(viewport.windowWidth)}</span>
                  </div>
                  <Slider
                    min={1}
                    max={4096}
                    step={1}
                    value={[Math.round(viewport.windowWidth)]}
                    onValueChange={([v]) => setViewport({ windowWidth: v })}
                  />
                </div>
                <div>
                  <div className="mb-1 flex justify-between text-[11px]">
                    <Label>{t('viewer.windowLevelPanel.level')}</Label>
                    <span className="hud-numeric text-muted-foreground">{Math.round(viewport.windowLevel)}</span>
                  </div>
                  <Slider
                    min={-1024}
                    max={3072}
                    step={1}
                    value={[Math.round(viewport.windowLevel)]}
                    onValueChange={([v]) => setViewport({ windowLevel: v })}
                  />
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                {WS_WL_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setViewport({ windowWidth: p.ww, windowLevel: p.wl })}
                    className={cn(
                      'h-6 rounded-sm px-1.5 text-[10px] transition-colors',
                      viewport.windowWidth === p.ww && viewport.windowLevel === p.wl
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-accent'
                    )}
                  >
                    {t(p.nameKey)}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-muted-foreground">{t('viewer.workspace.tabularHint')}</p>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── 组合导出: 左右可折叠面板 (置于视口两侧) ────────────── */

export interface LeftWorkspacePanelProps extends Omit<LeftPanelProps, 'onCollapse'> {
  open: boolean;
  onToggle: () => void;
}

/** 左侧面板 (序列 + 切片网格, 可折叠为图标窄条) */
export function LeftWorkspacePanel({
  open,
  onToggle,
  ...leftProps
}: LeftWorkspacePanelProps) {
  const { t } = useTranslation();
  const { series, activeSeriesId, onSeriesSelect } = leftProps;

  return (
    <aside
      className={cn(
        'ws-collapse relative z-20 h-full shrink-0 overflow-hidden border-r border-border bg-card',
        open ? 'w-64' : 'w-12'
      )}
    >
      {open ? (
        <LeftPanel {...leftProps} onCollapse={onToggle} />
      ) : (
        <div className="glass-surface flex h-full w-12 flex-col items-center gap-1 border-r border-white/10 py-2">
          <IconBtn icon={PanelLeftOpen} label={t('viewer.workspace.expandLeft')} onClick={onToggle} />
          <div className="my-1 h-px w-5 bg-white/10" />
          {series.map((s) => (
            <IconBtn
              key={s.id}
              icon={Layers}
              label={s.description || t('viewer.header.series', { number: s.seriesNumber })}
              active={s.id === activeSeriesId}
              onClick={() => onSeriesSelect(s.id)}
              side="right"
            />
          ))}
        </div>
      )}
    </aside>
  );
}

export interface RightWorkspacePanelProps {
  open: boolean;
  onToggle: () => void;
  currentImageId: string | null;
  selectedAnnoId: string | null;
  onSelectAnno: (id: string | null) => void;
}

/** 右侧面板 (标注/图层/测量, 可折叠为图标窄条) */
export function RightWorkspacePanel({
  open,
  onToggle,
  currentImageId,
  selectedAnnoId,
  onSelectAnno,
}: RightWorkspacePanelProps) {
  const { t } = useTranslation();

  return (
    <aside
      className={cn(
        'ws-collapse relative z-20 h-full shrink-0 overflow-hidden border-l border-border bg-card',
        open ? 'w-72' : 'w-12'
      )}
    >
      {open ? (
        <RightPanel
          currentImageId={currentImageId}
          selectedAnnoId={selectedAnnoId}
          onSelectAnno={onSelectAnno}
          onCollapse={onToggle}
        />
      ) : (
        <div className="glass-surface flex h-full w-12 flex-col items-center gap-1 border-l border-white/10 py-2">
          <IconBtn icon={PanelRightOpen} label={t('viewer.workspace.expandRight')} onClick={onToggle} />
          <div className="my-1 h-px w-5 bg-white/10" />
          <IconBtn icon={Eye} label={t('viewer.workspace.tabAnnotations')} onClick={onToggle} />
          <IconBtn icon={Layers} label={t('viewer.workspace.tabLayers')} onClick={onToggle} />
          <IconBtn icon={Ruler} label={t('viewer.workspace.tabMeasurements')} onClick={onToggle} />
        </div>
      )}
    </aside>
  );
}
