import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { reportApi, reportTemplateApi, patientApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { ArrowLeft, FileText } from 'lucide-react';

interface ReportTemplate {
  id: string;
  name: string;
  type: string;
  description?: string;
  fields: Array<{
    key: string;
    label: string;
    type: string;
    required?: boolean;
    options?: string[];
  }>;
}

interface Patient {
  id: string;
  mrn: string;
  name: string;
}

export function ReportCreatePage() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const [templatesRes, patientsRes] = await Promise.all([
        reportTemplateApi.getAll(),
        patientApi.getAll(),
      ]);
      setTemplates(templatesRes.data?.items || templatesRes.data || []);
      setPatients(patientsRes.data?.items || patientsRes.data || []);
    } catch (error) {
      console.error('Failed to load data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (!selectedTemplate || !selectedPatient) {
      alert('请选择模板和患者');
      return;
    }

    const template = templates.find((t) => t.id === selectedTemplate);
    if (!template) return;

    // Initialize content with empty fields from template
    const initialContent: Record<string, any> = {};
    if (template.fields && Array.isArray(template.fields)) {
      template.fields.forEach((field) => {
        initialContent[field.key] = field.type === 'select' ? '' : '';
      });
    }

    try {
      setCreating(true);
      const response = await reportApi.create({
        patientId: selectedPatient,
        templateId: selectedTemplate,
        title: `${template.name} - ${new Date().toLocaleDateString('zh-CN')}`,
        content: initialContent,
        images: [],
        status: 'draft',
      });
      alert('报告创建成功');
      navigate(`/reports/${response.data.studyId || response.data.id}`);
    } catch (error) {
      console.error('Failed to create report:', error);
      alert('创建报告失败');
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">创建报告</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>选择患者</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Label htmlFor="patient">患者</Label>
            <select
              id="patient"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={selectedPatient}
              onChange={(e) => setSelectedPatient(e.target.value)}
            >
              <option value="">请选择患者...</option>
              {patients.map((patient) => (
                <option key={patient.id} value={patient.id}>
                  {patient.name} ({patient.mrn})
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

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
                    模板类型: {template.type}
                  </p>
                  {template.description && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {template.description}
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {templates.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              暂无可用的报告模板
            </div>
          )}

          <Button
            className="mt-4"
            disabled={!selectedTemplate || !selectedPatient || creating}
            onClick={handleCreateReport}
          >
            <FileText className="mr-2 h-4 w-4" />
            {creating ? '创建中...' : '创建报告'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
