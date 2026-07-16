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
      <h1 className="text-3xl font-bold">{t('nav.dashboard')}</h1>
      
      {/* Stats Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.key}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {loading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Studies */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>最近检查</CardTitle>
            <Link to="/studies" className="text-sm text-primary hover:underline flex items-center">
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
              <p className="text-sm text-muted-foreground text-center py-4">暂无检查记录</p>
            ) : (
              <div className="space-y-4">
                {recentStudies.map((study) => (
                  <Link
                    key={study.id}
                    to={`/viewer/${study.id}`}
                    className="flex items-center justify-between hover:bg-accent/50 p-2 -mx-2 rounded transition-colors"
                  >
                    <div>
                      <p className="font-medium">{study.description || `检查 ${study.id.slice(0, 8)}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {study.modality || '未知模态'}
                      </p>
                    </div>
                    <span className="text-sm text-muted-foreground">
                      {formatTimeAgo(study.createdAt)}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pending Tasks */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>待处理任务</CardTitle>
            <Link to="/reports" className="text-sm text-primary hover:underline flex items-center">
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
              <p className="text-sm text-muted-foreground text-center py-4">暂无待处理任务</p>
            ) : (
              <div className="space-y-4">
                {pendingTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/reports/${task.id}`}
                    className="flex items-center justify-between hover:bg-accent/50 p-2 -mx-2 rounded transition-colors"
                  >
                    <div>
                      <p className="font-medium">{task.title || `报告 ${task.id.slice(0, 8)}`}</p>
                      <p className="text-sm text-muted-foreground">
                        {formatTimeAgo(task.createdAt)}
                      </p>
                    </div>
                    <Badge variant="warning" className="text-xs">待审核</Badge>
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
