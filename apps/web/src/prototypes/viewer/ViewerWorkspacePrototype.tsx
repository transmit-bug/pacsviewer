/**
 * 🧪 PROTOTYPE — 扔弃代码。wayfinder #123「查看器深色工作台原型」。
 *
 * 目的：给 #126（实施票）验证「电影级深色查看器工作台」的布局与手感：
 *   1. 视口中心化 + 左右可折叠面板（三级近黑分层、1px 低对比描边）
 *   2. HUD：上缘临床信息（glass 浮层）+ 角落状态（等宽数字 + 描边）
 *   3. 工具条：分组图标化 + 悬浮提示 + 快捷键，可折叠成图标窄条
 *   4. ⌘K 命令面板：悬浮预览 + 200ms 交叉淡入
 *   5. 标注视觉：teal 默认 + 白描边，选中琥珀（决议 #122-5）
 *   6. 全屏沉浸模式（Fullscreen API，隐藏面板）
 *   7. html.dark 强制深色
 *
 * 动效全部 CSS（framer-motion 是 #134 特批依赖，此处不引入；
 * ⌘K 300ms spring、页面级动效在 #126/#134 落位）。
 * 生产组件 ViewerPage/OctViewer/CornerstoneViewport 未触碰。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { cn } from '@/lib/utils';
import { MOCK_SERIES, MOCK_PATIENT, getMockImageUrl, mockSignalStrength } from './mockImaging';
import './prototype-viewer.css';
import {
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Maximize,
  Minimize,
  Command as CommandIcon,
  Keyboard,
  ChevronRight,
  Hand,
  ZoomIn,
  SlidersHorizontal,
  PenTool,
  Crosshair,
  Ruler,
  ScanLine,
  Layers,
  Eye,
  Grid3X3,
  Frame,
  Circle as CircleIcon,
} from 'lucide-react';

/* ─── 类型 ─────────────────────────────────────────────── */

interface Annotation {
  id: string;
  type: 'ellipse' | 'caliper' | 'segline';
  layer: '标注' | '测量' | '分割';
  label: string;
  value?: string;
  // 视口百分比坐标（0..1）
  x?: number;
  y?: number;
  rx?: number;
  ry?: number;
  x1?: number;
  y1?: number;
  x2?: number;
  y2?: number;
}

const ANNOTATIONS: Annotation[] = [
  { id: 'a1', type: 'ellipse', layer: '标注', label: '玻璃体混浊', x: 0.33, y: 0.2, rx: 0.075, ry: 0.052 },
  { id: 'a2', type: 'caliper', layer: '测量', label: '视网膜厚度', value: '142 μm', x1: 0.5, y1: 0.34, x2: 0.585, y2: 0.42 },
  { id: 'a3', type: 'segline', layer: '分割', label: 'RPE 分割线', x1: 0.09, y1: 0.47, x2: 0.91, y2: 0.5 },
];

const LAYER_ORDER = ['分割', '测量', '标注'] as const;
type LayerId = (typeof LAYER_ORDER)[number];

const WL_PRESETS = [
  { id: 'standard', name: '标准', ww: 400, wl: 40 },
  { id: 'fundus', name: '眼底', ww: 256, wl: 48 },
  { id: 'bone', name: '骨窗', ww: 1500, wl: 300 },
  { id: 'vessel', name: '血管', ww: 120, wl: 40 },
];

const TOOLS = [
  { id: 'pan', name: '平移', shortcut: 'V', icon: Hand },
  { id: 'zoom', name: '缩放', shortcut: 'Z', icon: ZoomIn },
  { id: 'wl', name: '窗宽窗位', shortcut: 'W', icon: SlidersHorizontal },
] as const;
type ToolId = (typeof TOOLS)[number]['id'];
type ActiveTool = ToolId | (typeof ANNO_TOOLS)[number]['id'] | (typeof MEASURE_TOOLS)[number]['id'];

const ANNO_TOOLS = [
  { id: 'ellipse', name: '椭圆标注', shortcut: 'E', icon: CircleIcon },
  { id: 'caliper', name: '卡尺测量', shortcut: 'C', icon: Crosshair },
] as const;

const MEASURE_TOOLS = [
  { id: 'length', name: '长度', shortcut: 'L', icon: Ruler },
  { id: 'area', name: '面积', shortcut: 'A', icon: ScanLine },
] as const;

/* ─── 子组件：左面板（序列 + 切片缩略图） ─────────────── */

function SliceThumbs({
  series,
  slice,
  onSelect,
}: {
  series: (typeof MOCK_SERIES)[number];
  slice: number;
  onSelect: (i: number) => void;
}) {
  const count = series.sliceCount;
  if (count <= 1) {
    return (
      <div className="p-3 text-xs text-muted-foreground">
        单帧序列，无切片导航
      </div>
    );
  }
  // 128 层取步长 4，避免原型首次渲染生成过多 dataURL
  const stride = count > 64 ? 4 : 1;
  const items: number[] = [];
  for (let i = 0; i < count; i += stride) items.push(i);
  if (items[items.length - 1] !== count - 1) items.push(count - 1);

  return (
    <ScrollArea className="h-full">
      <div className="grid grid-cols-3 gap-1.5 p-2.5">
        {items.map((i) => {
          const active = i === slice;
          return (
            <Tooltip key={i}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onSelect(i)}
                  className={cn(
                    'pv-thumb relative aspect-[3/2] overflow-hidden rounded-sm border bg-black',
                    active ? 'border-[hsl(var(--primary))] ring-1 ring-[hsl(var(--primary))]' : 'border-border/60 hover:border-[hsl(var(--primary))]/60'
                  )}
                >
                  <img src={getMockImageUrl(series.id, i)} alt={`切片 ${i + 1}`} className="h-full w-full object-cover opacity-80" draggable={false} />
                  <span
                    className={cn(
                      'pv-hud-text hud-numeric absolute bottom-0.5 left-1 text-[10px]',
                      active ? 'text-[hsl(var(--primary))]' : 'text-white/70'
                    )}
                  >
                    {i + 1}
                  </span>
                </button>
              </TooltipTrigger>
              <TooltipContent side="right" className="w-40">
                <img src={getMockImageUrl(series.id, i)} alt="" className="w-full rounded-sm border border-border" />
                <div className="mt-1.5 space-y-0.5 text-[11px]">
                  <p className="hud-numeric">切片 {i + 1} / {count}</p>
                  <p className="text-muted-foreground">位置 {(i / count * 6).toFixed(2)} mm</p>
                  <p className="text-muted-foreground">SS {mockSignalStrength(i)}</p>
                </div>
              </TooltipContent>
            </Tooltip>
          );
        })}
      </div>
    </ScrollArea>
  );
}

function LeftPanel({
  activeSeriesId,
  onSeriesSelect,
  slice,
  onSliceSelect,
  onCollapse,
}: {
  activeSeriesId: string;
  onSeriesSelect: (id: string) => void;
  slice: number;
  onSliceSelect: (i: number) => void;
  onCollapse: () => void;
}) {
  const active = MOCK_SERIES.find((s) => s.id === activeSeriesId)!;
  return (
    <div className="flex h-full w-64 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Layers className="h-3.5 w-3.5" />
          序列
          <span className="hud-numeric text-[10px]">{MOCK_SERIES.length}</span>
        </span>
        <button onClick={onCollapse} className="pv-tool-btn rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="折叠左侧面板">
          <PanelLeftClose className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* 序列列表 */}
      <div className="shrink-0 space-y-0.5 p-2">
        {MOCK_SERIES.map((s) => {
          const isActive = s.id === activeSeriesId;
          return (
            <button
              key={s.id}
              onClick={() => onSeriesSelect(s.id)}
              className={cn(
                'pv-tool-btn flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left',
                isActive
                  ? 'border-[hsl(var(--primary))]/40 bg-[hsl(var(--primary))]/10'
                  : 'border-transparent hover:bg-accent'
              )}
            >
              <Badge variant={isActive ? 'default' : 'secondary'} className="h-4 px-1.5 text-[10px]">
                {s.modality}
              </Badge>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate text-xs', isActive ? 'text-[hsl(var(--primary))]' : '')}>{s.name}</span>
                <span className="block text-[10px] text-muted-foreground">
                  {s.eye} · <span className="hud-numeric">{s.sliceCount}</span> 帧
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* 切片缩略图 */}
      <div className="flex h-8 shrink-0 items-center gap-1.5 border-t px-2.5 text-[10px] font-medium text-muted-foreground">
        <Grid3X3 className="h-3 w-3" />
        切片（滚轮快切 / 悬停预览）
      </div>
      <div className="min-h-0 flex-1">
        <SliceThumbs series={active} slice={slice} onSelect={onSliceSelect} />
      </div>
    </div>
  );
}

/* ─── 子组件：右面板（标注 / 图层 / 测量） ─────────────── */

function RightPanel({
  annotations,
  layers,
  onToggleLayer,
  selectedAnnoId,
  onSelectAnno,
  ww,
  wl,
  onCollapse,
}: {
  annotations: Annotation[];
  layers: Record<LayerId, boolean>;
  onToggleLayer: (l: LayerId) => void;
  selectedAnnoId: string | null;
  onSelectAnno: (id: string | null) => void;
  ww: number;
  wl: number;
  onCollapse: () => void;
}) {
  const visible = annotations.filter((a) => layers[a.layer]);
  return (
    <div className="flex h-full w-72 flex-col bg-card">
      <div className="flex h-9 shrink-0 items-center justify-between border-b px-2.5">
        <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Frame className="h-3.5 w-3.5" />
          工作台
        </span>
        <button onClick={onCollapse} className="pv-tool-btn rounded-sm p-1 text-muted-foreground hover:bg-accent hover:text-foreground" title="折叠右侧面板">
          <PanelRightClose className="h-3.5 w-3.5" />
        </button>
      </div>
      <Tabs defaultValue="annotations" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-2 mt-2 grid h-7 grid-cols-3">
          <TabsTrigger value="annotations" className="text-[11px]">标注</TabsTrigger>
          <TabsTrigger value="layers" className="text-[11px]">图层</TabsTrigger>
          <TabsTrigger value="measure" className="text-[11px]">测量</TabsTrigger>
        </TabsList>
        <TabsContent value="annotations" className="min-h-0 flex-1">
          <ScrollArea className="h-full">
            <div className="space-y-1 p-2">
              {visible.map((a) => {
                const selected = a.id === selectedAnnoId;
                return (
                  <button
                    key={a.id}
                    onClick={() => onSelectAnno(selected ? null : a.id)}
                    className={cn(
                      'pv-tool-btn flex w-full items-center gap-2 rounded-sm border px-2 py-1.5 text-left',
                      selected ? 'border-amber-500/60 bg-amber-500/10' : 'border-transparent hover:bg-accent'
                    )}
                  >
                    <span
                      className={cn('h-2.5 w-2.5 shrink-0 rounded-full border border-white/60', selected ? 'bg-amber-400' : 'bg-teal-400')}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs">{a.label}</span>
                      <span className="block text-[10px] text-muted-foreground">
                        {a.type === 'caliper' ? '卡尺' : a.type === 'ellipse' ? '椭圆' : '分割线'} · {a.layer} 层
                      </span>
                    </span>
                    {a.value && <span className="hud-numeric text-[10px] text-foreground/80">{a.value}</span>}
                  </button>
                );
              })}
              {visible.length === 0 && (
                <p className="p-3 text-[11px] text-muted-foreground">当前图层全部隐藏。</p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>
        <TabsContent value="layers" className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            {LAYER_ORDER.map((l, i) => (
              <div key={l} className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
                <span className="hud-numeric text-[10px] text-muted-foreground">{i + 1}</span>
                <span className="flex-1 text-xs">{l}层</span>
                <Switch checked={layers[l]} onCheckedChange={() => onToggleLayer(l)} />
              </div>
            ))}
            <p className="pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
              层序对齐 DICOM GSPS：分割 &lt; 测量 &lt; 标注，互不遮挡、可整体显隐。
            </p>
          </div>
        </TabsContent>
        <TabsContent value="measure" className="min-h-0 flex-1">
          <div className="space-y-0.5 p-2">
            <div className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
              <Ruler className="h-3.5 w-3.5 text-teal-300" />
              <span className="flex-1 text-xs">视网膜厚度</span>
              <span className="hud-numeric text-xs text-foreground/90">142 μm</span>
            </div>
            <div className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
              <ScanLine className="h-3.5 w-3.5 text-teal-300" />
              <span className="flex-1 text-xs">黄斑中心凹厚度</span>
              <span className="hud-numeric text-xs text-foreground/90">238 μm</span>
            </div>
            <div className="flex items-center gap-2 rounded-sm border border-transparent px-2 py-1.5 hover:bg-accent/60">
              <Crosshair className="h-3.5 w-3.5 text-teal-300" />
              <span className="flex-1 text-xs">视盘直径</span>
              <span className="hud-numeric text-xs text-foreground/90">1.84 mm</span>
            </div>
            <div className="mt-2 border-t pt-2">
              <p className="text-[10px] text-muted-foreground">窗宽窗位（全局演示）</p>
              <p className="hud-numeric mt-1 text-xs">
                WW <span className="text-foreground/90">{ww}</span> · WL <span className="text-foreground/90">{wl}</span>
              </p>
              <p className="mt-1 text-[10px] text-muted-foreground">测量列已开 tabular-nums，数字等宽对齐。</p>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

/* ─── 子组件：标注 SVG 覆盖层 ─────────────────────────── */

const TEAL = '#2dd4bf';
const AMBER = '#f59e0b';

function AnnotationOverlay({
  annotations,
  layers,
  selectedId,
  onSelect,
}: {
  annotations: Annotation[];
  layers: Record<LayerId, boolean>;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  return (
    <svg className="absolute inset-0 z-10 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none" onPointerDown={() => onSelect(null)}>
      {annotations
        .filter((a) => layers[a.layer])
        .map((a) => {
          const sel = a.id === selectedId;
          const color = sel ? AMBER : TEAL;
          const common = {
            onPointerDown: (e: React.PointerEvent) => {
              e.stopPropagation();
              onSelect(sel ? null : a.id);
            },
            style: { cursor: 'pointer' },
          };
          return (
            <g key={a.id}>
              {a.type === 'ellipse' && (
                <>
                  {/* 白描边（GSPS OUTLINED 语义） → 主色 */}
                  <ellipse cx={a.x! * 100} cy={a.y! * 100} rx={a.rx! * 100} ry={a.ry! * 100} fill="rgba(0,0,0,0.12)" stroke="#ffffff" strokeWidth={sel ? 0.7 : 0.5} vectorEffect="non-scaling-stroke" {...common} />
                  <ellipse cx={a.x! * 100} cy={a.y! * 100} rx={a.rx! * 100} ry={a.ry! * 100} fill="none" stroke={color} strokeWidth={sel ? 0.4 : 0.28} vectorEffect="non-scaling-stroke" {...common} />
                  <text x={a.x! * 100} y={a.y! * 100 - a.ry! * 100 - 1.6} textAnchor="middle" fontSize={sel ? 3.4 : 3} fill={color} stroke="#000" strokeWidth={0.55} paintOrder="stroke" className="pv-anno-label" vectorEffect="non-scaling-stroke">
                    {a.label}
                  </text>
                  {/* 手柄：主色圆点 + 白环 */}
                  {[
                    [a.x! - a.rx!, a.y!],
                    [a.x! + a.rx!, a.y!],
                  ].map(([hx, hy], i) => (
                    <circle key={i} cx={hx * 100} cy={hy * 100} r={sel ? 1.1 : 0.8} fill={color} stroke="#fff" strokeWidth={0.3} vectorEffect="non-scaling-stroke" {...common} />
                  ))}
                </>
              )}
              {a.type === 'caliper' && (
                <>
                  <line x1={a.x1! * 100} y1={a.y1! * 100} x2={a.x2! * 100} y2={a.y2! * 100} stroke="#ffffff" strokeWidth={sel ? 0.65 : 0.5} vectorEffect="non-scaling-stroke" {...common} />
                  <line x1={a.x1! * 100} y1={a.y1! * 100} x2={a.x2! * 100} y2={a.y2! * 100} stroke={color} strokeWidth={sel ? 0.38 : 0.26} vectorEffect="non-scaling-stroke" {...common} />
                  {/* 端点卡尺刻度 */}
                  {[
                    [a.x1!, a.y1!],
                    [a.x2!, a.y2!],
                  ].map(([ex, ey], i) => (
                    <g key={i} {...common}>
                      <line x1={ex * 100 - 1.6} y1={ey * 100 - 1.1} x2={ex * 100 + 1.6} y2={ey * 100 - 1.1} stroke={color} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
                      <line x1={ex * 100 - 1.6} y1={ey * 100 + 1.1} x2={ex * 100 + 1.6} y2={ey * 100 + 1.1} stroke={color} strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
                      <circle cx={ex * 100} cy={ey * 100} r={sel ? 1.2 : 0.9} fill={color} stroke="#fff" strokeWidth={0.3} vectorEffect="non-scaling-stroke" />
                    </g>
                  ))}
                  <text x={a.x2! * 100} y={a.y2! * 100 - 2.2} textAnchor="middle" fontSize={sel ? 3.4 : 3} fill={color} stroke="#000" strokeWidth={0.55} paintOrder="stroke" className="pv-anno-label" vectorEffect="non-scaling-stroke">
                    {a.value}
                  </text>
                  <text x={(a.x1! * 100 + a.x2! * 100) / 2} y={(a.y1! * 100 + a.y2! * 100) / 2 - 2.4} textAnchor="middle" fontSize={2.8} fill="#e6e9ec" stroke="#000" strokeWidth={0.55} paintOrder="stroke" className="pv-anno-label" vectorEffect="non-scaling-stroke">
                    {a.label}
                  </text>
                </>
              )}
              {a.type === 'segline' && (
                <>
                  <line x1={a.x1! * 100} y1={a.y1! * 100} x2={a.x2! * 100} y2={a.y2! * 100} stroke="#ffffff" strokeWidth={sel ? 0.7 : 0.55} strokeDasharray="2 1.2" vectorEffect="non-scaling-stroke" {...common} />
                  <line x1={a.x1! * 100} y1={a.y1! * 100} x2={a.x2! * 100} y2={a.y2! * 100} stroke={color} strokeWidth={sel ? 0.4 : 0.3} strokeDasharray="2 1.2" vectorEffect="non-scaling-stroke" {...common} />
                  <text x={a.x1! * 100 + 0.8} y={a.y1! * 100 - 1.8} fontSize={2.8} fill={color} stroke="#000" strokeWidth={0.55} paintOrder="stroke" className="pv-anno-label" vectorEffect="non-scaling-stroke">
                    {a.label}
                  </text>
                </>
              )}
            </g>
          );
        })}
    </svg>
  );
}

/* ─── 子组件：浮动工具条（分组、可折叠成图标窄条） ─────── */

function IconBtn({
  icon: Icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          title={label}
          className={cn(
            'pv-tool-btn flex h-8 w-8 items-center justify-center rounded-sm border',
            active
              ? 'border-[hsl(var(--primary))]/50 bg-[hsl(var(--primary))]/15 text-[hsl(var(--primary))]'
              : 'border-transparent text-foreground/70 hover:bg-white/10 hover:text-foreground'
          )}
        >
          <Icon className="h-4 w-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="flex items-center gap-2">
        <span>{label}</span>
        {shortcut && <kbd className="hud-numeric rounded border border-border bg-black/40 px-1 text-[10px]">{shortcut}</kbd>}
      </TooltipContent>
    </Tooltip>
  );
}

function ToolbarGroupSep() {
  return <div className="mx-1 h-5 w-px bg-white/10" />;
}

function FloatingToolbar({
  activeTool,
  onTool,
  onPreset,
  collapsed,
  onToggleCollapsed,
}: {
  activeTool: ActiveTool;
  onTool: (t: ActiveTool) => void;
  onPreset: (id: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}) {
  const presetLabel = (id: string) => WL_PRESETS.find((p) => p.id === id)?.name ?? '';
  if (collapsed) {
    // 图标窄条（决议 #122-3：可折叠成 slim rail）
    const rail = [
      { icon: Hand, label: '导航', onClick: () => onTool('pan') },
      { icon: PenTool, label: '标注', onClick: () => onTool('ellipse') },
      { icon: Ruler, label: '测量', onClick: () => onTool('caliper') },
      { icon: SlidersHorizontal, label: '窗口预设', onClick: () => onPreset('fundus') },
    ];
    return (
      <div className="pv-glass absolute left-3 top-1/2 z-30 flex -translate-y-1/2 flex-col items-center gap-1 rounded-md border border-white/10 p-1.5 shadow-lg">
        {rail.map((r) => (
          <IconBtn key={r.label} icon={r.icon} label={r.label} onClick={r.onClick} />
        ))}
        <ToolbarGroupSep />
        <IconBtn icon={Frame} label="展开工具条" onClick={onToggleCollapsed} />
      </div>
    );
  }
  return (
    <div className="pv-glass absolute bottom-3 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-md border border-white/10 px-2 py-1.5 shadow-lg">
      <span className="pr-1 text-[10px] font-medium tracking-wide text-white/40">工具</span>
      <div className="flex items-center gap-0.5">
        {TOOLS.map((t) => (
          <IconBtn key={t.id} icon={t.icon} label={t.name} shortcut={t.shortcut} active={activeTool === t.id} onClick={() => onTool(t.id)} />
        ))}
      </div>
      <ToolbarGroupSep />
      <div className="flex items-center gap-0.5">
        {ANNO_TOOLS.map((t) => (
          <IconBtn key={t.id} icon={t.icon} label={t.name} shortcut={t.shortcut} active={activeTool === t.id} onClick={() => onTool(t.id)} />
        ))}
      </div>
      <ToolbarGroupSep />
      <div className="flex items-center gap-0.5">
        {MEASURE_TOOLS.map((t) => (
          <IconBtn key={t.id} icon={t.icon} label={t.name} shortcut={t.shortcut} active={activeTool === t.id} onClick={() => onTool(t.id)} />
        ))}
      </div>
      <ToolbarGroupSep />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="pv-tool-btn flex h-8 items-center gap-1.5 rounded-sm border border-transparent px-2 text-[11px] text-foreground/70 hover:bg-white/10 hover:text-foreground">
            <SlidersHorizontal className="h-4 w-4" />
            预设
            <ChevronRight className="h-3 w-3 -rotate-90 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="center" side="top" className="w-44">
          <DropdownMenuLabel className="text-[11px]">窗口预设</DropdownMenuLabel>
          {WL_PRESETS.map((p) => (
            <DropdownMenuItem key={p.id} onClick={() => onPreset(p.id)} className="flex items-center justify-between">
              <span className="text-xs">{p.name}</span>
              <span className="hud-numeric text-[10px] text-muted-foreground">{presetLabel(p.id) && `WW ${p.ww} · WL ${p.wl}`}</span>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled className="text-[10px] text-muted-foreground">
            预设仅演示窗宽窗位视觉
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ToolbarGroupSep />
      <IconBtn icon={Frame} label="折叠为图标窄条" onClick={onToggleCollapsed} />
    </div>
  );
}

/* ─── ⌘K 命令面板 ─────────────────────────────────────── */

interface Cmd {
  id: string;
  name: string;
  desc: string;
  shortcut?: string;
  run: () => void;
  preview: React.ReactNode;
}

function CommandPalette({
  open,
  onOpenChange,
  commands,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  commands: { group: string; items: Cmd[] }[];
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  useEffect(() => {
    if (!open) setHoveredId(null);
  }, [open]);
  const hovered = useMemo(() => {
    for (const g of commands) {
      const hit = g.items.find((i) => i.id === hoveredId);
      if (hit) return hit;
    }
    return null;
  }, [commands, hoveredId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-2xl gap-0 overflow-hidden p-0 sm:rounded-lg"
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex">
          <Command
            className="min-w-0 flex-1 rounded-none border-0 bg-popover"
            value={hoveredId ?? undefined}
            onValueChange={setHoveredId}
          >
            <div className="flex items-center gap-2 border-b px-3">
              <CommandIcon className="h-4 w-4 text-muted-foreground" />
              <CommandInput placeholder="输入命令或搜索患者 / 工具 / 图像…" className="h-12 border-0" />
              <kbd className="hud-numeric shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">Esc</kbd>
            </div>
            <CommandList className="max-h-[340px]">
              <CommandEmpty>未找到匹配命令</CommandEmpty>
              {commands.map((g) => (
                <CommandGroup key={g.group} heading={g.group}>
                  {g.items.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={c.id}
                      onSelect={() => {
                        c.run();
                        onOpenChange(false);
                      }}
                      onMouseEnter={() => setHoveredId(c.id)}
                      className="flex items-center gap-2"
                    >
                      <span className="flex-1">
                        <span className="block text-sm">{c.name}</span>
                        <span className="block text-[11px] text-muted-foreground">{c.desc}</span>
                      </span>
                      {c.shortcut && <CommandShortcut>{c.shortcut}</CommandShortcut>}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
            </CommandList>
            <CommandSeparator />
            <div className="flex items-center gap-3 px-3 py-2 text-[10px] text-muted-foreground">
              <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1">↑↓</kbd> 选择</span>
              <span className="flex items-center gap-1"><kbd className="rounded border border-border bg-muted px-1">↵</kbd> 执行</span>
              <span className="ml-auto">悬浮右侧预览</span>
            </div>
          </Command>
          {/* 悬浮预览：200ms 交叉淡入（决议 #122-4） */}
          <div className="hidden w-52 shrink-0 border-l bg-[hsl(var(--card))] sm:block">
            <div className="flex h-full flex-col">
              <div className="flex h-9 items-center border-b px-3 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                预览
              </div>
              <div className="flex-1 overflow-hidden p-2.5">
                {hovered ? (
                  <div key={hovered.id} className="pv-preview-in h-full">{hovered.preview}</div>
                ) : (
                  <p className="pt-4 text-center text-[11px] text-muted-foreground">← 悬停或 ↑↓ 选择命令</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─── 主页面 ───────────────────────────────────────────── */

export default function ViewerWorkspacePrototype() {
  const [activeSeriesId, setActiveSeriesId] = useState(MOCK_SERIES[0].id);
  const [slice, setSlice] = useState(0);
  const [prevImg, setPrevImg] = useState<{ url: string; key: string } | null>(null);
  const [leftOpen, setLeftOpen] = useState(true);
  const [rightOpen, setRightOpen] = useState(true);
  const [toolbarCollapsed, setToolbarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [activeTool, setActiveTool] = useState<ActiveTool>('pan');
  const [layers, setLayers] = useState<Record<LayerId, boolean>>({ 分割: true, 测量: true, 标注: true });
  const [selectedAnnoId, setSelectedAnnoId] = useState<string | null>(null);
  const [ww, setWw] = useState(400);
  const [wl, setWl] = useState(40);
  const [presetName, setPresetName] = useState('标准');
  const [zoom, setZoom] = useState(100);
  const lastWheel = useRef(0);

  const activeSeries = MOCK_SERIES.find((s) => s.id === activeSeriesId)!;
  const isOct = activeSeries.kind === 'oct';

  /* 强制深色（html.dark），离开原型页还原 */
  useEffect(() => {
    const root = document.documentElement;
    const hadDark = root.classList.contains('dark');
    root.classList.add('dark');
    return () => {
      if (!hadDark) root.classList.remove('dark');
    };
  }, []);

  /* 全屏沉浸：进入即收起两侧面板（决议 #122-7） */
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      setLeftOpen(false);
      setRightOpen(false);
      void document.documentElement.requestFullscreen().catch(() => undefined);
    }
  }, []);
  useEffect(() => {
    const onFs = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const imgUrl = useMemo(() => getMockImageUrl(activeSeriesId, slice), [activeSeriesId, slice]);

  const changeSlice = useCallback(
    (next: number) => {
      const s = Math.max(0, Math.min(activeSeries.sliceCount - 1, next));
      if (s === slice) return;
      setPrevImg({ url: getMockImageUrl(activeSeriesId, slice), key: `${activeSeriesId}-${slice}` });
      setSlice(s);
    },
    [activeSeries.sliceCount, activeSeriesId, slice]
  );

  useEffect(() => {
    if (!prevImg) return;
    const t = setTimeout(() => setPrevImg(null), 240);
    return () => clearTimeout(t);
  }, [prevImg]);

  const selectSeries = useCallback((id: string) => {
    setActiveSeriesId(id);
    setSlice(0);
    setPrevImg(null);
    setSelectedAnnoId(null);
  }, []);

  const applyPreset = useCallback((id: string) => {
    const p = WL_PRESETS.find((x) => x.id === id);
    if (p) {
      setWw(p.ww);
      setWl(p.wl);
      setPresetName(p.name);
    }
  }, []);

  /* 键盘快捷键：⌘K / ←→ 切层 / F 全屏 / 数字选工具 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((o) => !o);
        return;
      }
      if (paletteOpen) return;
      if (e.key === 'ArrowLeft') { e.preventDefault(); changeSlice(slice - 1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); changeSlice(slice + 1); }
      else if (e.key.toLowerCase() === 'f') toggleFullscreen();
      else if (e.key.toLowerCase() === 'v') setActiveTool('pan');
      else if (e.key.toLowerCase() === 'z') setActiveTool('zoom');
      else if (e.key.toLowerCase() === 'w') setActiveTool('wl');
      else if (e.key.toLowerCase() === 'e') setActiveTool('ellipse');
      else if (e.key.toLowerCase() === 'c') setActiveTool('caliper');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, slice, changeSlice, toggleFullscreen]);

  /* 视口滚轮快切（OCT 序列） */
  const onViewportWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!isOct) return;
      const now = Date.now();
      if (now - lastWheel.current < 80) return;
      lastWheel.current = now;
      changeSlice(slice + (e.deltaY > 0 ? 1 : -1));
    },
    [changeSlice, isOct, slice]
  );

  /* 图像窗宽窗位视觉近似（仅原型：CSS filter） */
  const wlFilter = `brightness(${1 + wl / 160}) contrast(${1 + (ww - 256) / 420})`;

  /* ⌘K 命令清单（含悬浮预览） */
  const commands: { group: string; items: Cmd[] }[] = useMemo(() => {
    const strip = (n: number) => {
      const base = Math.max(0, Math.min(activeSeries.sliceCount - 1, slice - Math.floor(n / 2)));
      const items: number[] = [];
      for (let i = 0; i < n; i++) {
        const v = base + i;
        if (v < activeSeries.sliceCount) items.push(v);
      }
      return items;
    };
    return [
      {
        group: '图像',
        items: [
          {
            id: 'prev-slice',
            name: '切换图像 · 上一张',
            desc: isOct ? `当前 ${slice + 1} / ${activeSeries.sliceCount}` : '当前序列仅 1 帧',
            shortcut: '←',
            run: () => changeSlice(slice - 1),
            preview: (
              <div className="flex gap-1">
                {strip(5).map((i) => (
                  <div key={i} className={cn('flex-1 overflow-hidden rounded-sm border', i === slice ? 'border-[hsl(var(--primary))]' : 'border-border/60 opacity-60')}>
                    <img src={getMockImageUrl(activeSeriesId, i)} alt="" className="aspect-[3/2] w-full object-cover" />
                    <p className="hud-numeric bg-black/60 py-0.5 text-center text-[9px]">{i + 1}</p>
                  </div>
                ))}
              </div>
            ),
          },
          {
            id: 'next-slice',
            name: '切换图像 · 下一张',
            desc: isOct ? `当前 ${slice + 1} / ${activeSeries.sliceCount}` : '当前序列仅 1 帧',
            shortcut: '→',
            run: () => changeSlice(slice + 1),
            preview: (
              <div className="flex gap-1">
                {strip(5).map((i) => (
                  <div key={i} className={cn('flex-1 overflow-hidden rounded-sm border', i === slice ? 'border-[hsl(var(--primary))]' : 'border-border/60 opacity-60')}>
                    <img src={getMockImageUrl(activeSeriesId, i)} alt="" className="aspect-[3/2] w-full object-cover" />
                    <p className="hud-numeric bg-black/60 py-0.5 text-center text-[9px]">{i + 1}</p>
                  </div>
                ))}
              </div>
            ),
          },
        ],
      },
      {
        group: '窗口预设',
        items: WL_PRESETS.map((p) => ({
          id: `preset-${p.id}`,
          name: `窗口预设 · ${p.name}`,
          desc: `WW ${p.ww} · WL ${p.wl}`,
          run: () => applyPreset(p.id),
          preview: (
            <div className="space-y-2">
              <div className="flex items-end justify-between">
                <span className="text-xs text-foreground/80">{p.name}</span>
                <span className="hud-numeric text-[11px] text-muted-foreground">WW {p.ww} · WL {p.wl}</span>
              </div>
              <div className="h-3 rounded-sm" style={{ background: `linear-gradient(90deg, #000, hsl(${200 + p.ww * 0.06} 30% 42%))` }} />
              <div className="flex justify-between text-[9px] text-muted-foreground"><span>-{p.ww / 2 + p.wl}</span><span>{p.ww / 2 - p.wl}</span></div>
            </div>
          ),
        })),
      },
      {
        group: '面板',
        items: [
          {
            id: 'toggle-left',
            name: leftOpen ? '面板 · 折叠左侧序列' : '面板 · 展开左侧序列',
            desc: '序列 / 切片缩略图',
            shortcut: '⌘[',
            run: () => setLeftOpen((o) => !o),
            preview: (
              <div className="flex h-full gap-1.5">
                <div className={cn('w-1/4 rounded-sm border-2', leftOpen ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/20' : 'border-border bg-card')} />
                <div className="flex-1 rounded-sm border border-border bg-black" />
                <div className="w-1/4 rounded-sm border border-border bg-card" />
              </div>
            ),
          },
          {
            id: 'toggle-right',
            name: rightOpen ? '面板 · 折叠右侧工作台' : '面板 · 展开右侧工作台',
            desc: '标注 / 图层 / 测量',
            shortcut: '⌘]',
            run: () => setRightOpen((o) => !o),
            preview: (
              <div className="flex h-full gap-1.5">
                <div className="w-1/4 rounded-sm border border-border bg-card" />
                <div className="flex-1 rounded-sm border border-border bg-black" />
                <div className={cn('w-1/4 rounded-sm border-2', rightOpen ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/20' : 'border-border bg-card')} />
              </div>
            ),
          },
        ],
      },
      {
        group: '视图',
        items: [
          {
            id: 'fullscreen',
            name: isFullscreen ? '全屏 · 退出沉浸模式' : '全屏 · 沉浸模式',
            desc: '最大化视口，自动收起面板',
            shortcut: 'F',
            run: toggleFullscreen,
            preview: (
              <div className="flex h-full flex-col gap-1.5">
                <div className="flex-1 rounded-sm border-2 border-[hsl(var(--primary))] bg-black" />
                <div className="flex justify-center gap-1 text-[10px] text-muted-foreground">
                  <Frame className="h-3 w-3" /> {isFullscreen ? '退出全屏' : '进入全屏'}
                </div>
              </div>
            ),
          },
          {
            id: 'tool-pan',
            name: '工具 · 平移',
            desc: '拖动图像',
            shortcut: 'V',
            run: () => setActiveTool('pan'),
            preview: (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-border bg-black/60">
                <Hand className="h-8 w-8 text-teal-300" />
                <p className="text-[11px] text-muted-foreground">平移工具已选中</p>
              </div>
            ),
          },
          {
            id: 'tool-zoom',
            name: '工具 · 缩放',
            desc: `当前 ${zoom}%`,
            shortcut: 'Z',
            run: () => { setZoom((z) => (z >= 200 ? 100 : z + 50)); setActiveTool('zoom'); },
            preview: (
              <div className="flex h-full flex-col items-center justify-center gap-2 rounded-sm border border-border bg-black/60">
                <ZoomIn className="h-8 w-8 text-teal-300" />
                <p className="hud-numeric text-[11px]">{zoom}%</p>
              </div>
            ),
          },
        ],
      },
    ];
  }, [activeSeries, activeSeriesId, applyPreset, changeSlice, isFullscreen, isOct, leftOpen, rightOpen, slice, toggleFullscreen, zoom]);

  const signal = mockSignalStrength(slice);

  return (
    <div className="fixed inset-0 flex select-none flex-col overflow-hidden bg-background text-foreground">
      {/* ── 应用 chrome（极简） ── */}
      <header className="z-30 flex h-10 shrink-0 items-center gap-2 border-b bg-background/95 px-3">
        <span className="flex h-5 w-5 items-center justify-center rounded-sm bg-[hsl(var(--primary))]">
          <Eye className="h-3 w-3 text-black" />
        </span>
        <span className="text-xs font-medium tracking-wide">明瞳眼科影像 · 查看器</span>
        <Badge variant="outline" className="ml-1 h-4 border-dashed px-1.5 text-[9px] text-muted-foreground">
          #123 原型
        </Badge>
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setPaletteOpen(true)}
            className="pv-tool-btn flex h-7 items-center gap-1.5 rounded-sm border border-border bg-muted/40 px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Keyboard className="h-3.5 w-3.5" />
            命令面板
            <kbd className="hud-numeric ml-1 rounded border border-border bg-black/30 px-1 text-[9px]">⌘K</kbd>
          </button>
          <button onClick={toggleFullscreen} className="pv-tool-btn flex h-7 w-7 items-center justify-center rounded-sm text-muted-foreground hover:bg-accent hover:text-foreground" title="全屏沉浸模式 (F)">
            {isFullscreen ? <Minimize className="h-3.5 w-3.5" /> : <Maximize className="h-3.5 w-3.5" />}
          </button>
        </div>
      </header>

      {/* ── 主工作台 ── */}
      <div className="flex min-h-0 flex-1">
        {/* 左：序列/切片（可折叠 → 图标窄条） */}
        <aside className={cn('pv-collapse relative z-20 h-full shrink-0 overflow-hidden border-r', leftOpen ? 'w-64' : 'w-12', 'border-border bg-card')}>
          {leftOpen ? (
            <LeftPanel
              activeSeriesId={activeSeriesId}
              onSeriesSelect={selectSeries}
              slice={slice}
              onSliceSelect={changeSlice}
              onCollapse={() => setLeftOpen(false)}
            />
          ) : (
            <div className="pv-glass flex h-full w-12 flex-col items-center gap-1 border-r border-white/10 py-2">
              <IconBtn icon={PanelLeftOpen} label="展开序列面板" onClick={() => setLeftOpen(true)} />
              <div className="my-1 h-px w-5 bg-white/10" />
              {MOCK_SERIES.map((s) => (
                <IconBtn key={s.id} icon={Layers} label={s.name} active={s.id === activeSeriesId} onClick={() => selectSeries(s.id)} />
              ))}
            </div>
          )}
        </aside>

        {/* 中：视口（近黑）+ HUD + 标注 + 工具条 */}
        <main
          className="pv-viewport-bg relative z-10 min-w-0 flex-1 overflow-hidden"
          onWheel={onViewportWheel}
          onClick={() => setSelectedAnnoId(null)}
        >
          {/* 图像层：交叉淡入（200ms） */}
          {prevImg && (
            <img key={`prev-${prevImg.key}`} src={prevImg.url} alt="" className="absolute inset-0 h-full w-full object-contain" draggable={false} />
          )}
          <img
            key={`cur-${activeSeriesId}-${slice}`}
            src={imgUrl}
            alt=""
            className="pv-fade-in absolute inset-0 h-full w-full object-contain"
            style={{ filter: wlFilter }}
            draggable={false}
          />

          {/* 标注覆盖层 */}
          <AnnotationOverlay annotations={ANNOTATIONS} layers={layers} selectedId={selectedAnnoId} onSelect={setSelectedAnnoId} />

          {/* HUD 上缘：临床信息（glass 浮层） */}
          <div className="pv-glass absolute inset-x-3 top-3 z-20 flex h-11 items-center gap-3 rounded-md border border-white/10 px-3 shadow-lg">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-medium text-white">{MOCK_PATIENT.name}</span>
              <span className="pv-hud-text text-[11px] text-white/70">
                {MOCK_PATIENT.gender} · {MOCK_PATIENT.age} 岁
              </span>
              <span className="pv-hud-text hud-numeric hidden text-[11px] text-white/60 md:inline">{MOCK_PATIENT.id}</span>
            </div>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-2">
              <span className="pv-hud-text hud-numeric text-[11px] text-white/80">{MOCK_PATIENT.studyDate}</span>
              <span className="pv-hud-text hidden text-[11px] text-white/70 lg:inline">{MOCK_PATIENT.studyDesc}</span>
              <span className="pv-hud-text hidden text-[11px] text-white/50 xl:inline">{MOCK_PATIENT.physician}</span>
            </div>
            <div className="h-4 w-px bg-white/15" />
            <div className="flex items-center gap-2">
              <Badge variant="default" className="h-4 px-1.5 text-[9px]">{activeSeries.modality}</Badge>
              <span className="pv-hud-text text-[11px] text-white/75">{activeSeries.eye}</span>
              <span className="pv-hud-text hidden text-[11px] text-white/55 lg:inline">{activeSeries.name}</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <button
                onClick={() => setPaletteOpen(true)}
                className="pv-tool-btn flex h-6 items-center gap-1 rounded-sm border border-white/15 px-1.5 text-[10px] text-white/70 hover:bg-white/10 hover:text-white"
              >
                <CommandIcon className="h-3 w-3" /> ⌘K
              </button>
              <button
                onClick={toggleFullscreen}
                className="pv-tool-btn flex h-6 items-center justify-center rounded-sm border border-white/15 px-1.5 text-white/70 hover:bg-white/10 hover:text-white"
                title="全屏 (F)"
              >
                {isFullscreen ? <Minimize className="h-3 w-3" /> : <Maximize className="h-3 w-3" />}
              </button>
            </div>
          </div>

          {/* HUD 角落状态：左下 窗宽窗位/缩放 */}
          <div className="pv-glass pointer-events-none absolute bottom-3 left-3 z-20 flex items-center gap-3 rounded-md border border-white/10 px-2.5 py-1.5 shadow-lg">
            <span className="hud-numeric pv-hud-text text-[11px] text-white/90">
              WW <span className="text-teal-300">{ww}</span> · WL <span className="text-teal-300">{wl}</span>
            </span>
            <span className="h-3 w-px bg-white/15" />
            <span className="hud-numeric pv-hud-text text-[11px] text-white/90">{zoom}%</span>
            {presetName !== '标准' && (
              <>
                <span className="h-3 w-px bg-white/15" />
                <span className="pv-hud-text text-[10px] text-amber-300">{presetName}</span>
              </>
            )}
          </div>

          {/* HUD 角落状态：右下 帧/比例尺/信号强度 */}
          <div className="pv-glass pointer-events-none absolute bottom-3 right-3 z-20 flex items-center gap-3 rounded-md border border-white/10 px-2.5 py-1.5 shadow-lg">
            {isOct && (
              <>
                <span className="hud-numeric pv-hud-text text-[11px] text-white/90">
                  {slice + 1} <span className="text-white/50">/ {activeSeries.sliceCount}</span>
                </span>
                <span className="h-3 w-px bg-white/15" />
              </>
            )}
            {/* 比例尺 */}
            <div className="flex flex-col items-center">
              <div className="flex items-end">
                <div className="h-1.5 w-px bg-white/80" />
                <div className="h-px w-14 bg-white/80" />
                <div className="h-1.5 w-px bg-white/80" />
              </div>
              <span className="pv-hud-text hud-numeric mt-0.5 text-[9px] text-white/70">1 mm</span>
            </div>
            {isOct && (
              <>
                <span className="h-3 w-px bg-white/15" />
                <span className="hud-numeric pv-hud-text text-[11px] text-white/90">
                  SS <span className={signal >= 60 ? 'text-emerald-300' : signal >= 50 ? 'text-yellow-300' : 'text-red-300'}>{signal}</span>
                </span>
              </>
            )}
          </div>

          {/* 浮动工具条（可折叠） */}
          <FloatingToolbar
            activeTool={activeTool}
            onTool={setActiveTool}
            onPreset={applyPreset}
            collapsed={toolbarCollapsed}
            onToggleCollapsed={() => setToolbarCollapsed((c) => !c)}
          />

          {/* 全屏沉浸提示 */}
          {isFullscreen && (
            <div className="pointer-events-none absolute left-3 top-16 z-30 rounded-md border border-white/10 bg-black/60 px-2 py-1 text-[10px] text-white/70">
              沉浸模式 · Esc 退出 · F 切换面板提示
            </div>
          )}
        </main>

        {/* 右：工作台（标注/图层/测量，可折叠 → 图标窄条） */}
        <aside className={cn('pv-collapse relative z-20 h-full shrink-0 overflow-hidden border-l', rightOpen ? 'w-72' : 'w-12', 'border-border bg-card')}>
          {rightOpen ? (
            <RightPanel
              annotations={ANNOTATIONS}
              layers={layers}
              onToggleLayer={(l) => setLayers((old) => ({ ...old, [l]: !old[l] }))}
              selectedAnnoId={selectedAnnoId}
              onSelectAnno={setSelectedAnnoId}
              ww={ww}
              wl={wl}
              onCollapse={() => setRightOpen(false)}
            />
          ) : (
            <div className="pv-glass flex h-full w-12 flex-col items-center gap-1 border-l border-white/10 py-2">
              <IconBtn icon={PanelRightOpen} label="展开工作台面板" onClick={() => setRightOpen(true)} />
              <div className="my-1 h-px w-5 bg-white/10" />
              <IconBtn icon={Eye} label="标注" active={layers.标注} onClick={() => setLayers((l) => ({ ...l, 标注: !l.标注 }))} />
              <IconBtn icon={Layers} label="图层" active={layers.分割} onClick={() => setLayers((l) => ({ ...l, 分割: !l.分割 }))} />
              <IconBtn icon={Ruler} label="测量" active={layers.测量} onClick={() => setLayers((l) => ({ ...l, 测量: !l.测量 }))} />
            </div>
          )}
        </aside>
      </div>

      {/* ⌘K 命令面板 */}
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} commands={commands} />

      {/* 交互提示（底部角标） */}
      <div className="pointer-events-none absolute bottom-1.5 right-2 z-30 flex items-center gap-2 text-[9px] text-white/25">
        <span>← → 切层</span>
        <span>滚轮快切</span>
        <span>F 全屏</span>
        <span>⌘K 命令</span>
      </div>
    </div>
  );
}
