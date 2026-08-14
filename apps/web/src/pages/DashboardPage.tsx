import { useMemo, useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from 'recharts';
import { dashboardApi } from '@/services/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Activity, Users, FileText, Image, ArrowRight } from 'lucide-react';

interface DashboardStats {
  todayStudies: number;
  totalPatients: number;
  pendingReports: number;
  totalImages: number;
}

interface RecentStudy {
  id: string;
  patientId: string;
  studyDate: string;
  modality: string;
  status: string;
  description: string;
  createdAt: string;
}

interface PendingTask {
  id: string;
  title: string;
  status: string;
  createdAt: string;
}

interface ModalitySlice {
  name: string;
  value: number;
  color: string;
}

interface DayCount {
  /** YYYY-MM-DD (本地时区) */
  key: string;
  /** MM-DD 轴标签 */
  label: string;
  count: number;
}

/** 最近动态时间轴最多展示条数 */
const TIMELINE_LIMIT = 5;
/** 模态占比/趋势聚合拉取的检查数上限 */
const CHART_STUDIES_LIMIT = 300;
/** 检查量趋势窗口（天） */
const TREND_DAYS = 14;
/** 今日检查卡片 sparkline 窗口（天） */
const SPARK_DAYS = 7;

/** 模态 → 语义色 Badge (展示层映射, 不改动数据) */
function modalityMeta(modality?: string | null): { label: string; variant: 'default' | 'secondary' | 'warning' | 'progress' | 'info' | 'neutral' } {
  const m = (modality || '').toLowerCase();
  if (m.includes('octa')) return { label: 'OCTA', variant: 'default' };
  if (m.includes('oct')) return { label: 'OCT', variant: 'default' };
  if (m.includes('ffa')) return { label: 'FFA', variant: 'warning' };
  if (m.includes('icga')) return { label: 'ICGA', variant: 'progress' };
  if (m.includes('fundus') || m.includes('眼底') || m.includes('color')) return { label: '眼底', variant: 'info' };
  if (m.includes('视野') || m.includes('vf') || m.includes('visual') || m.includes('perim')) return { label: '视野', variant: 'neutral' };
  return { label: modality || '未知模态', variant: 'secondary' };
}

/** 确定性配色: 品牌 teal + 语义色; 未知/其他模态一律归 neutral (深色下可辨) */
const MODALITY_COLORS: Record<string, string> = {
  OCT: 'hsl(var(--primary))',
  OCTA: 'hsl(var(--status-success))',
  FFA: 'hsl(var(--status-warning))',
  ICGA: 'hsl(var(--status-progress))',
  眼底: 'hsl(var(--status-info))',
  视野: 'hsl(var(--status-neutral))',
};
const UNKNOWN_MODALITY_COLOR = 'hsl(var(--status-neutral))';

/** 模态 → 分片标签 + 颜色 (与 modalityMeta 的归类逻辑保持一致) */
function modalityBucket(modality?: string | null): { label: string; color: string } {
  const m = (modality || '').toLowerCase();
  if (m.includes('octa')) return { label: 'OCTA', color: MODALITY_COLORS.OCTA };
  if (m.includes('oct')) return { label: 'OCT', color: MODALITY_COLORS.OCT };
  if (m.includes('ffa')) return { label: 'FFA', color: MODALITY_COLORS.FFA };
  if (m.includes('icga')) return { label: 'ICGA', color: MODALITY_COLORS.ICGA };
  if (m.includes('fundus') || m.includes('眼底') || m.includes('color')) return { label: '眼底', color: MODALITY_COLORS.眼底 };
  if (m.includes('视野') || m.includes('vf') || m.includes('visual') || m.includes('perim')) return { label: '视野', color: MODALITY_COLORS.视野 };
  return { label: '未知模态', color: UNKNOWN_MODALITY_COLOR };
}

/** 模态分布聚合: 按 label 归桶, 降序, 未知归 neutral 灰 */
function aggregateModalities(studies: RecentStudy[]): ModalitySlice[] {
  const buckets = new Map<string, { count: number; color: string }>();
  for (const s of studies) {
    const { label, color } = modalityBucket(s.modality);
    const existing = buckets.get(label);
    if (existing) {
      existing.count += 1;
    } else {
      buckets.set(label, { count: 1, color });
    }
  }
  return [...buckets.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .map(([name, { count, color }]) => ({ name, value: count, color }));
}

/** 本地时区 YYYY-MM-DD */
function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** 按本地日历日聚合检查量, 最近 days 天, 无检查的天补 0 */
function buildDailyCounts(studies: RecentStudy[], days: number): DayCount[] {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - (days - 1));
  const counts = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    const d = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    counts.set(localDayKey(d), 0);
  }
  for (const s of studies) {
    const d = new Date(s.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = localDayKey(d);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return [...counts.entries()].map(([key, count]) => ({ key, label: key.slice(5), count }));
}

/** 深色 token 风格 tooltip (与 TrendFacetChart 一致) */
const chartTooltipStyle = {
  backgroundColor: 'hsl(var(--popover))',
  border: '1px solid hsl(var(--border))',
  borderRadius: 'var(--radius)',
  fontSize: 12,
  boxShadow: 'var(--shadow-md)',
};

export function DashboardPage() {
  const { t } = useTranslation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentStudies, setRecentStudies] = useState<RecentStudy[]>([]);
  const [pendingTasks, setPendingTasks] = useState<PendingTask[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      const [statsRes, studiesRes, tasksRes] = await Promise.allSettled([
        dashboardApi.getStats(),
        dashboardApi.getRecentStudies(CHART_STUDIES_LIMIT),
        dashboardApi.getPendingTasks(5),
      ]);

      if (statsRes.status === 'fulfilled') {
        setStats(statsRes.value.data);
      }
      if (studiesRes.status === 'fulfilled') {
        setRecentStudies(studiesRes.value.data || []);
      }
      if (tasksRes.status === 'fulfilled') {
        setPendingTasks(tasksRes.value.data?.reports || []);
      }
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // 全部图表共享同一份 recent-studies 数据 (单次拉取)
  const hasAnyStudies = recentStudies.length > 0;
  const timelineStudies = recentStudies.slice(0, TIMELINE_LIMIT);
  const modalitySlices = useMemo(() => aggregateModalities(recentStudies), [recentStudies]);
  const trendData = useMemo(() => buildDailyCounts(recentStudies, TREND_DAYS), [recentStudies]);
  const sparkData = useMemo(() => buildDailyCounts(recentStudies, SPARK_DAYS), [recentStudies]);

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return '刚刚';
    if (diffHours < 24) return `${diffHours} 小时前`;
    if (diffDays < 7) return `${diffDays} 天前`;
    return date.toLocaleDateString('zh-CN');
  };

  const statCards = [
    { title: '今日检查', value: stats?.todayStudies ?? 0, icon: Activity, key: 'todayStudies', spark: true },
    { title: '患者总数', value: stats?.totalPatients ?? 0, icon: Users, key: 'totalPatients', spark: false },
    { title: '待审核报告', value: stats?.pendingReports ?? 0, icon: FileText, key: 'pendingReports', spark: false },
    { title: '图像总数', value: stats?.totalImages ?? 0, icon: Image, key: 'totalImages', spark: false },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold tracking-tight">{t('nav.dashboard')}</h1>

      {/* Stats Cards — HUD 数字 + teal 图标 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card
              key={stat.key}
              className="group relative overflow-hidden transition-colors duration-normal hover:border-primary/40"
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3 pt-5">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <div className="flex h-8 w-8 items-center justify-center rounded-md border border-primary/15 bg-primary/10 text-primary transition-colors duration-normal group-hover:bg-primary/20">
                  <Icon className="h-4 w-4" />
                </div>
              </CardHeader>
              <CardContent className="pb-5">
                {loading ? (
                  <Skeleton className="h-9 w-24" />
                ) : (
                  <div className="hud-numeric text-3xl font-semibold leading-none text-foreground">
                    {stat.value.toLocaleString()}
                  </div>
                )}

                {/* KPI sparkline: 今日检查有真实 7 日序列, 其余卡片无历史数据 → 虚线占位 */}
                {stat.spark ? (
                  <>
                    <div className="mt-3 h-11">
                      {loading ? (
                        <Skeleton className="h-full w-full" />
                      ) : hasAnyStudies ? (
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                            <defs>
                              <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                              </linearGradient>
                            </defs>
                            <Area
                              type="monotone"
                              dataKey="count"
                              stroke="hsl(var(--primary))"
                              strokeWidth={1.5}
                              fill="url(#sparkFill)"
                              isAnimationActive={false}
                            />
                          </AreaChart>
                        </ResponsiveContainer>
                      ) : (
                        <div className="flex h-full items-center justify-center text-[11px] text-muted-foreground">
                          暂无数据
                        </div>
                      )}
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">近7日检查量</p>
                  </>
                ) : (
                  <>
                    <div className="mt-3 flex h-11 items-end">
                      <span className="h-px w-full border-t border-dashed border-border/60" />
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">暂无历史数据</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 可视化行 — 模态占比 + 检查量趋势 (共享同一份 recent-studies 数据) */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* 模态占比 — donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">模态占比</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-center justify-center gap-10">
                <Skeleton className="h-44 w-44 shrink-0 rounded-full" />
                <div className="w-full max-w-[10rem] space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-4 w-full" />
                  ))}
                </div>
              </div>
            ) : !hasAnyStudies ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <div className="flex flex-col items-center gap-5 sm:flex-row sm:items-center">
                <div className="relative h-52 w-52 shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={modalitySlices}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={62}
                        outerRadius={92}
                        paddingAngle={2}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                        isAnimationActive={false}
                      >
                        {modalitySlices.map((slice) => (
                          <Cell key={slice.name} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={chartTooltipStyle}
                        labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                        itemStyle={{ color: 'hsl(var(--foreground))' }}
                        formatter={(value: any, name: any) => [`${value} 项`, name]}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* 中心合计 */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="hud-numeric text-2xl font-semibold text-foreground">
                      {recentStudies.length}
                    </span>
                    <span className="text-[11px] text-muted-foreground">检查</span>
                  </div>
                </div>

                {/* 图例: 色块 + 名称 + 数量 + 占比 */}
                <ul className="flex w-full min-w-0 flex-col gap-2.5">
                  {modalitySlices.map((slice) => {
                    const pct = (slice.value / recentStudies.length) * 100;
                    return (
                      <li key={slice.name} className="flex items-center justify-between gap-3 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-sm"
                            style={{ backgroundColor: slice.color }}
                          />
                          <span className="truncate text-muted-foreground">{slice.name}</span>
                        </span>
                        <span className="flex shrink-0 items-baseline gap-2">
                          <span className="tabular-nums text-foreground">{slice.value}</span>
                          <span className="hud-numeric text-xs text-muted-foreground">
                            {pct.toFixed(1)}%
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 检查量趋势 — 近 14 天 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">检查量趋势</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex h-64 items-end gap-2 px-2 pb-1">
                {Array.from({ length: 14 }).map((_, i) => (
                  <Skeleton
                    key={i}
                    className="flex-1 rounded-sm"
                    style={{ height: `${30 + ((i * 13) % 55)}%` }}
                  />
                ))}
              </div>
            ) : !hasAnyStudies ? (
              <div className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={trendData} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                    <defs>
                      <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.32} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={{ stroke: 'hsl(var(--border))' }}
                      minTickGap={22}
                      tickMargin={6}
                    />
                    <YAxis
                      allowDecimals={false}
                      width={28}
                      tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <Tooltip
                      contentStyle={chartTooltipStyle}
                      labelStyle={{ color: 'hsl(var(--muted-foreground))' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(value: any) => [`${value} 项`, '检查量']}
                      labelFormatter={(label, payload) => payload?.[0]?.payload?.key ?? label}
                    />
                    <Area
                      type="monotone"
                      dataKey="count"
                      stroke="hsl(var(--primary))"
                      strokeWidth={2}
                      fill="url(#trendFill)"
                      dot={false}
                      activeDot={{ r: 4 }}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 最近检查 — 动态时间轴 */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">最近检查</CardTitle>
            <Link to="/studies" className="flex items-center text-sm text-primary hover:underline">
              查看全部 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-3 w-16" />
                  </div>
                ))}
              </div>
            ) : recentStudies.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">暂无检查记录</p>
            ) : (
              <ul>
                {timelineStudies.map((study, i) => {
                  const meta = modalityMeta(study.modality);
                  const isLast = i === timelineStudies.length - 1;
                  return (
                    <li key={study.id} className="flex gap-3 pb-3 last:pb-0">
                      {/* 时间轴轨道 */}
                      <span className="relative flex flex-col items-center">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full border border-primary/50 bg-primary/25" />
                        {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
                      </span>
                      <Link
                        to={`/viewer/${study.id}`}
                        className="min-w-0 flex-1 rounded-md px-1 pb-2 transition-colors duration-fast hover:bg-accent/40"
                      >
                        <p className="truncate text-sm font-medium">
                          {study.description || `检查 ${study.id.slice(0, 8)}`}
                        </p>
                        <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={meta.variant} className="px-1.5 py-0 text-[10px]">
                            {meta.label}
                          </Badge>
                          <span className="tabular-nums">{formatTimeAgo(study.createdAt)}</span>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">待处理任务</CardTitle>
            <Link to="/reports" className="flex items-center text-sm text-primary hover:underline">
              查看全部 <ArrowRight className="ml-1 h-4 w-4" />
            </Link>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="space-y-2">
                      <Skeleton className="h-4 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-6 w-16" />
                  </div>
                ))}
              </div>
            ) : pendingTasks.length === 0 ? (
              <p className="py-4 text-center text-sm text-muted-foreground">暂无待处理任务</p>
            ) : (
              <div className="space-y-1">
                {pendingTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/reports/${task.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-2.5 transition-colors duration-fast hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {task.title || `报告 ${task.id.slice(0, 8)}`}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                        {formatTimeAgo(task.createdAt)}
                      </p>
                    </div>
                    <Badge variant="warning" className="ml-3 shrink-0 text-xs">
                      待审核
                    </Badge>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
