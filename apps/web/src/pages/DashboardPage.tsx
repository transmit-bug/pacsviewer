import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Activity, Users, FileText, Image } from 'lucide-react';

export function DashboardPage() {
  const { t } = useTranslation();

  const stats = [
    { title: '今日检查', value: '24', icon: Activity, change: '+12%' },
    { title: '患者总数', value: '1,234', icon: Users, change: '+5%' },
    { title: '待审核报告', value: '8', icon: FileText, change: '-2%' },
    { title: '图像总数', value: '45,678', icon: Image, change: '+8%' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('nav.dashboard')}</h1>
      
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {stat.title}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">
                  {stat.change} 较昨日
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>最近检查</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">患者 {i}</p>
                    <p className="text-sm text-muted-foreground">OCT 检查</p>
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {i} 小时前
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>待处理任务</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div>
                    <p className="font-medium">报告审核 #{i}</p>
                    <p className="text-sm text-muted-foreground">患者 {i + 10}</p>
                  </div>
                  <Badge variant="warning" className="text-xs">待审核</Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
