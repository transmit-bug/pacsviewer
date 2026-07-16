/**
 * SettingsPage — System configuration and log management.
 *
 * Tabs:
 * - General: System name, language, timezone
 * - Storage: Storage path, quota, usage
 * - DICOM: AE Title, port, connection settings
 * - Logs: Audit log query with filters and export
 */

import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, Download, Search, FileText, RefreshCw } from 'lucide-react';
import api from '@/services/api';

interface LogEntry {
  id: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  createdAt: string;
  user?: { displayName: string; username: string };
}

export function SettingsPage() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logFilters, setLogFilters] = useState({
    action: '',
    resource: '',
    dateFrom: '',
    dateTo: '',
  });

  const loadLogs = async () => {
    setLogsLoading(true);
    try {
      const response = await api.get('/audit-logs', {
        params: {
          pageSize: 50,
          ...(logFilters.action && { action: logFilters.action }),
          ...(logFilters.resource && { resource: logFilters.resource }),
        },
      });
      setLogs(response.data?.items || response.data || []);
    } catch (error) {
      console.error('Failed to load logs:', error);
    } finally {
      setLogsLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const handleExportLogs = () => {
    const csv = [
      '时间,用户,操作,资源,资源ID,IP地址',
      ...logs.map(l => [
        l.createdAt,
        l.user?.displayName || l.userId,
        l.action,
        l.resource,
        l.resourceId || '',
        l.ipAddress || '',
      ].join(',')),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const getActionBadge = (action: string) => {
    const map: Record<string, { variant: 'success' | 'info' | 'destructive' | 'secondary' | 'warning'; label: string }> = {
      create: { variant: 'success', label: '创建' },
      update: { variant: 'info', label: '更新' },
      delete: { variant: 'destructive', label: '删除' },
      login: { variant: 'secondary', label: '登录' },
      logout: { variant: 'secondary', label: '登出' },
    };
    const cfg = map[action] || { variant: 'secondary' as const, label: action };
    return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('nav.settings')}</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">常规设置</TabsTrigger>
          <TabsTrigger value="storage">存储设置</TabsTrigger>
          <TabsTrigger value="dicom">DICOM 设置</TabsTrigger>
          <TabsTrigger value="logs" className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" />
            系统日志
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader><CardTitle>常规设置</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>系统名称</Label>
                  <Input defaultValue="PACS Viewer" className="mt-1" />
                </div>
                <div>
                  <Label>语言</Label>
                  <Select defaultValue="zh">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="zh">中文</SelectItem>
                      <SelectItem value="en">English</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>时区</Label>
                  <Select defaultValue="Asia/Shanghai">
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Asia/Shanghai">Asia/Shanghai</SelectItem>
                      <SelectItem value="UTC">UTC</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button><Save className="mr-2 h-4 w-4" />保存设置</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage">
          <Card>
            <CardHeader><CardTitle>存储设置</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>存储路径</Label>
                  <Input defaultValue="./data/images" className="mt-1" />
                </div>
                <div>
                  <Label>存储配额 (GB)</Label>
                  <Input type="number" defaultValue="100" className="mt-1" />
                </div>
                <div className="flex items-center justify-between p-4 border rounded-lg">
                  <div>
                    <p className="font-medium">存储使用量</p>
                    <p className="text-sm text-muted-foreground">已使用 25.6 GB / 100 GB</p>
                  </div>
                  <div className="w-32 h-2 bg-muted rounded-full overflow-hidden">
                    <div className="w-1/4 h-full bg-primary rounded-full" />
                  </div>
                </div>
                <Button><Save className="mr-2 h-4 w-4" />保存设置</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dicom">
          <Card>
            <CardHeader><CardTitle>DICOM 设置</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>AE Title</Label>
                  <Input defaultValue="PACSVIEWER" className="mt-1" />
                </div>
                <div>
                  <Label>端口</Label>
                  <Input type="number" defaultValue="11112" className="mt-1" />
                </div>
                <div>
                  <Label>传输语法</Label>
                  <div className="mt-1 space-y-1 text-sm text-muted-foreground">
                    <p>✓ Implicit VR Little Endian (1.2.840.10008.1.2)</p>
                    <p>✓ Explicit VR Little Endian (1.2.840.10008.1.2.1)</p>
                    <p className="text-xs">JPEG/JPEG2000 将在后续版本支持</p>
                  </div>
                </div>
                <Button><Save className="mr-2 h-4 w-4" />保存设置</Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>系统日志</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleExportLogs}>
                  <Download className="mr-1.5 h-3.5 w-3.5" />
                  导出 CSV
                </Button>
                <Button variant="outline" size="sm" onClick={loadLogs}>
                  <RefreshCw className={`mr-1.5 h-3.5 w-3.5 ${logsLoading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {/* Filters */}
              <div className="flex gap-3 mb-4">
                <div className="flex-1">
                  <Input
                    placeholder="按操作筛选 (create, update, delete, login)"
                    value={logFilters.action}
                    onChange={(e) => setLogFilters({ ...logFilters, action: e.target.value })}
                  />
                </div>
                <div className="flex-1">
                  <Input
                    placeholder="按资源类型 (patients, studies, reports)"
                    value={logFilters.resource}
                    onChange={(e) => setLogFilters({ ...logFilters, resource: e.target.value })}
                  />
                </div>
                <Button size="sm" onClick={loadLogs}>
                  <Search className="mr-1.5 h-3.5 w-3.5" />
                  查询
                </Button>
              </div>

              {/* Log table */}
              {logsLoading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : logs.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无日志记录</div>
              ) : (
                <div className="rounded border overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-2 font-medium">时间</th>
                        <th className="text-left p-2 font-medium">用户</th>
                        <th className="text-left p-2 font-medium">操作</th>
                        <th className="text-left p-2 font-medium">资源</th>
                        <th className="text-left p-2 font-medium">IP</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {logs.map((log) => (
                        <tr key={log.id} className="hover:bg-muted/30">
                          <td className="p-2 text-muted-foreground whitespace-nowrap">
                            {new Date(log.createdAt).toLocaleString('zh-CN')}
                          </td>
                          <td className="p-2">
                            {log.user?.displayName || log.userId}
                          </td>
                          <td className="p-2">
                            {getActionBadge(log.action)}
                          </td>
                          <td className="p-2">
                            {log.resource}
                            {log.resourceId && (
                              <span className="text-xs text-muted-foreground ml-1">
                                #{log.resourceId.slice(0, 8)}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-muted-foreground font-mono text-xs">
                            {log.ipAddress || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
