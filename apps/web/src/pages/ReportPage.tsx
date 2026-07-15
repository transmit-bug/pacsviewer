import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportApi, reportTemplateApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Save, FileText, Download, Send } from 'lucide-react';

interface Report {
  id: string;
  title: string;
  content: Record<string, any>;
  status: string;
  templateId: string;
}

interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  fields: any[];
}

export function ReportPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const { t } = useTranslation();
  const [report, setReport] = useState<Report | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (studyId) {
      loadReport(studyId);
    }
  }, [studyId]);

  const loadTemplates = async () => {
    try {
      const response = await reportTemplateApi.getAll();
      setTemplates(response.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadReport = async (id: string) => {
    try {
      const response = await reportApi.getAll({ studyId: id });
      if (response.data?.length > 0) {
        setReport(response.data[0]);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await reportApi.update(report.id, report);
    } catch (error) {
      console.error('Failed to save report:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmit = async () => {
    if (!report) return;
    try {
      await reportApi.updateStatus(report.id, 'pending_review');
      setReport({ ...report, status: 'pending_review' });
    } catch (error) {
      console.error('Failed to submit report:', error);
    }
  };

  const handleExportPdf = () => {
    if (!report) return;
    window.open(reportApi.getPdf(report.id), '_blank');
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('report.edit')}</h1>
        <div className="flex items-center space-x-2">
          <Button variant="outline" onClick={handleSave} disabled={saving}>
            <Save className="mr-2 h-4 w-4" />
            {saving ? '保存中...' : '保存'}
          </Button>
          <Button variant="outline" onClick={handleExportPdf}>
            <Download className="mr-2 h-4 w-4" />
            {t('report.export')}
          </Button>
          <Button onClick={handleSubmit}>
            <Send className="mr-2 h-4 w-4" />
            {t('report.submit')}
          </Button>
        </div>
      </div>

      {!report ? (
        <Card>
          <CardHeader>
            <CardTitle>选择报告模板</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {templates.map((template) => (
                <Card
                  key={template.id}
                  className={`cursor-pointer transition-colors ${
                    selectedTemplate === template.id
                      ? 'border-primary'
                      : 'hover:border-primary/50'
                  }`}
                  onClick={() => setSelectedTemplate(template.id)}
                >
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm">{template.name}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">
                      类型: {template.type}
                    </p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <Button className="mt-4" disabled={!selectedTemplate}>
              <FileText className="mr-2 h-4 w-4" />
              创建报告
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs defaultValue="edit">
          <TabsList>
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
          </TabsList>

          <TabsContent value="edit">
            <Card>
              <CardHeader>
                <CardTitle>{report.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* Report content editor - simplified for now */}
                  <div>
                    <Label>诊断结论</Label>
                    <textarea
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={4}
                      value={report.content?.conclusion || ''}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          content: { ...report.content, conclusion: e.target.value },
                        })
                      }
                    />
                  </div>
                  <div>
                    <Label>备注</Label>
                    <textarea
                      className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                      rows={3}
                      value={report.content?.notes || ''}
                      onChange={(e) =>
                        setReport({
                          ...report,
                          content: { ...report.content, notes: e.target.value },
                        })
                      }
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            <Card>
              <CardHeader>
                <CardTitle>报告预览</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="prose dark:prose-invert max-w-none">
                  <h2>{report.title}</h2>
                  <h3>诊断结论</h3>
                  <p>{report.content?.conclusion || '暂无'}</p>
                  <h3>备注</h3>
                  <p>{report.content?.notes || '暂无'}</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
