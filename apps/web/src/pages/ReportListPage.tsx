import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { StatusBadge } from '@/components/StatusBadge';
import { Plus, Search, FileText, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Report {
  id: string;
  studyId: string;
  patientId: string;
  title: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export function ReportListPage() {
  const { t } = useTranslation();
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  useEffect(() => {
    loadReports();
  }, []);

  const loadReports = async () => {
    try {
      setLoading(true);
      const response = await reportApi.getAll();
      setReports(response.data?.items || []);
    } catch (error) {
      console.error('Failed to load reports:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除这个报告吗？')) return;
    try {
      await reportApi.delete(id);
      setReports(reports.filter((r) => r.id !== id));
    } catch (error) {
      console.error('Failed to delete report:', error);
    }
  };

  const filteredReports = reports.filter((report) => {
    if (activeTab !== 'all' && report.status !== activeTab) return false;
    if (
      searchQuery &&
      !report.title.toLowerCase().includes(searchQuery.toLowerCase())
    )
      return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('nav.reports')}</h1>
        <Button asChild>
          <Link to="/reports/new">
            <Plus className="mr-2 h-4 w-4" />
            {t('report.create')}
          </Link>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder="搜索报告..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="max-w-sm"
        />
        <Button variant="outline" size="icon">
          <Search className="h-4 w-4" />
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="all">全部</TabsTrigger>
          <TabsTrigger value="draft">{t('report.status.draft')}</TabsTrigger>
          <TabsTrigger value="pending_review">{t('report.status.pending_review')}</TabsTrigger>
          <TabsTrigger value="reviewed">{t('report.status.reviewed')}</TabsTrigger>
          <TabsTrigger value="published">{t('report.status.published')}</TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab}>
          <Card>
            <CardHeader>
              <CardTitle>报告列表</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8">加载中...</div>
              ) : filteredReports.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  暂无报告数据
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredReports.map((report) => (
                    <div
                      key={report.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <Link
                        to={`/reports/${report.studyId}`}
                        className="flex-1"
                      >
                        <div className="flex items-center space-x-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded bg-primary/10">
                            <FileText className="h-5 w-5 text-primary" />
                          </div>
                          <div>
                            <p className="font-medium">{report.title}</p>
                            <p className="text-sm text-muted-foreground">
                              创建时间:{' '}
                              {new Date(report.createdAt).toLocaleDateString(
                                'zh-CN'
                              )}
                            </p>
                          </div>
                        </div>
                      </Link>
                      <div className="flex items-center space-x-2">
                        <StatusBadge status={report.status} />
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem asChild>
                              <Link to={`/reports/${report.studyId}`}>
                                查看
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link to={`/reports/${report.studyId}/edit`}>
                                编辑
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => handleDelete(report.id)}
                            >
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
