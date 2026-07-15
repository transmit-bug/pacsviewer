import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Save } from 'lucide-react';

export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">{t('nav.settings')}</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">常规设置</TabsTrigger>
          <TabsTrigger value="storage">存储设置</TabsTrigger>
          <TabsTrigger value="dicom">DICOM 设置</TabsTrigger>
          <TabsTrigger value="users">用户管理</TabsTrigger>
        </TabsList>

        <TabsContent value="general">
          <Card>
            <CardHeader>
              <CardTitle>常规设置</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>系统名称</Label>
                  <Input defaultValue="PACS Viewer" className="mt-1" />
                </div>
                <div>
                  <Label>语言</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="zh">中文</option>
                    <option value="en">English</option>
                  </select>
                </div>
                <div>
                  <Label>时区</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="Asia/Shanghai">Asia/Shanghai</option>
                    <option value="UTC">UTC</option>
                  </select>
                </div>
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  保存设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="storage">
          <Card>
            <CardHeader>
              <CardTitle>存储设置</CardTitle>
            </CardHeader>
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
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  保存设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dicom">
          <Card>
            <CardHeader>
              <CardTitle>DICOM 设置</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div>
                  <Label>AE Title</Label>
                  <Input defaultValue="PACS_VIEWER" className="mt-1" />
                </div>
                <div>
                  <Label>端口</Label>
                  <Input type="number" defaultValue="11112" className="mt-1" />
                </div>
                <div>
                  <Label>最大连接数</Label>
                  <Input type="number" defaultValue="10" className="mt-1" />
                </div>
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  保存设置
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="users">
          <Card>
            <CardHeader>
              <CardTitle>用户管理</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                用户管理功能开发中...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
