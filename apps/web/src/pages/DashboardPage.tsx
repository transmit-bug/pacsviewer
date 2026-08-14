import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
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
        dashboardApi.getRecentStudies(5),
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
    { title: '今日检查', value: stats?.todayStudies ?? 0, icon: Activity, key: 'todayStudies' },
    { title: '患者总数', value: stats?.totalPatients ?? 0, icon: Users, key: 'totalPatients' },
    { title: '待审核报告', value: stats?.pendingReports ?? 0, icon: FileText, key: 'pendingReports' },
    { title: '图像总数', value: stats?.totalImages ?? 0, icon: Image, key: 'totalImages' },
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
              </CardContent>
            </Card>
          );
        })}
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
                {recentStudies.map((study, i) => {
                  const meta = modalityMeta(study.modality);
                  const isLast = i === recentStudies.length - 1;
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
