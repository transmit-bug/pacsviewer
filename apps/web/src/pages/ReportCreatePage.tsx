import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { reportApi, reportTemplateApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ArrowLeft, FileText } from 'lucide-react';
import { PatientSelector } from '@/components/patient';

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



export function ReportCreatePage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [selectedPatient, setSelectedPatient] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const templatesRes = await reportTemplateApi.getAll();
      setTemplates(templatesRes.data?.items || templatesRes.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (!selectedTemplate || !selectedPatient) {
      toast({
        title: t('report.selectTemplateAndPatient'),
        variant: 'destructive',
      });
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
        title: `${template.name} - ${new Date().toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'zh-CN')}`,
        content: initialContent,
        images: [],
        status: 'draft',
      });
      toast({
        title: t('report.createSuccess'),
      });
      navigate(`/reports/${response.data.studyId || response.data.id}`);
    } catch (error) {
      console.error('Failed to create report:', error);
      toast({
        title: t('report.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-[150px]" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[120px]" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[180px]" />
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-[120px] w-full" />
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/reports">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">{t('report.create')}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t('report.selectPatient')}</CardTitle>
        </CardHeader>
        <CardContent>
          <PatientSelector
            value={selectedPatient}
            onChange={setSelectedPatient}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('report.selectTemplateTitle')}</CardTitle>
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
                    {t('report.templateTypeLabel', { type: template.type })}
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
              {t('report.noTemplates')}
            </div>
          )}

          <Button
            className="mt-4"
            disabled={!selectedTemplate || !selectedPatient || creating}
            onClick={handleCreateReport}
          >
            <FileText className="mr-2 h-4 w-4" />
            {creating ? t('report.creating') : t('report.createReport')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
