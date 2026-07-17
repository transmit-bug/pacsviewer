import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { reportApi, reportTemplateApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { StatusBadge } from '@/components/StatusBadge';
import { ReviewNotesDialog } from '@/components/ReviewNotesDialog';
import { VersionHistoryDialog } from '@/components/VersionHistoryDialog';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Save,
  FileText,
  Send,
  CheckCircle,
  XCircle,
  Globe,
  History,
  Printer,
  Image as ImageIcon,
  X,
} from 'lucide-react';

interface Report {
  id: string;
  studyId: string;
  patientId: string;
  templateId: string;
  title: string;
  content: Record<string, any>;
  images?: string[] | null;
  status: string;
  reviewerId?: string;
  reviewNotes?: string;
  publishedAt?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

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

// Helper function to safely get images array
function getReportImages(images: string[] | null | undefined): string[] {
  if (Array.isArray(images)) return images;
  if (typeof images === 'string') {
    try {
      const parsed = JSON.parse(images);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function ReportPage() {
  const { studyId } = useParams<{ studyId: string }>();
  const { t } = useTranslation();
  const [report, setReport] = useState<Report | null>(null);
  const [templates, setTemplates] = useState<ReportTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewAction, setReviewAction] = useState<'reject' | 'approve' | 'publish' | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [addImageDialogOpen, setAddImageDialogOpen] = useState(false);
  const [newImageId, setNewImageId] = useState('');

  useEffect(() => {
    loadTemplates();
  }, []);

  useEffect(() => {
    if (studyId) {
      loadReport(studyId);
    } else {
      setLoading(false);
    }
  }, [studyId]);

  const loadTemplates = async () => {
    try {
      const response = await reportTemplateApi.getAll();
      setTemplates(response.data?.items || response.data || []);
    } catch (error) {
      console.error('Failed to load templates:', error);
    }
  };

  const loadReport = async (id: string) => {
    try {
      const response = await reportApi.getAll({ studyId: id });
      if (response.data?.items?.length > 0) {
        setReport(response.data.items[0]);
        setSelectedTemplate(response.data.items[0].templateId);
      } else if (response.data?.length > 0) {
        setReport(response.data[0]);
        setSelectedTemplate(response.data[0].templateId);
      }
    } catch (error) {
      console.error('Failed to load report:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateReport = async () => {
    if (!selectedTemplate || !studyId) return;
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
      const response = await reportApi.create({
        studyId,
        patientId: '', // Will be resolved by backend from study
        templateId: selectedTemplate,
        title: `${template.name} - ${new Date().toLocaleDateString('zh-CN')}`,
        content: initialContent,
        images: [],
        status: 'draft',
      });
      setReport(response.data);
    } catch (error) {
      console.error('Failed to create report:', error);
    }
  };

  const handleSave = async () => {
    if (!report) return;
    setSaving(true);
    try {
      await reportApi.update(report.id, {
        title: report.title,
        content: report.content,
        images: getReportImages(report.images),
      });
    } catch (error) {
      console.error('Failed to save report:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (status: string, notes?: string) => {
    if (!report) return;
    try {
      await reportApi.updateStatus(report.id, status);
      setReport({ ...report, status, reviewNotes: notes || report.reviewNotes });
    } catch (error) {
      console.error('Failed to update status:', error);
    }
  };

  const handleSubmitForReview = () => {
    handleStatusChange('pending_review');
  };

  const handleApprove = () => {
    setReviewAction('approve');
    setReviewDialogOpen(true);
  };

  const handleReject = () => {
    setReviewAction('reject');
    setReviewDialogOpen(true);
  };

  const handlePublish = () => {
    setReviewAction('publish');
    setReviewDialogOpen(true);
  };

  const handleReviewConfirm = (notes: string) => {
    if (!reviewAction) return;
    const statusMap = {
      approve: 'reviewed',
      reject: 'draft',
      publish: 'published',
    };
    handleStatusChange(statusMap[reviewAction], notes);
    setReviewAction(null);
  };

  const handleExportPdf = () => {
    window.print();
  };

  const handleContentChange = (key: string, value: any) => {
    if (!report) return;
    setReport({
      ...report,
      content: { ...report.content, [key]: value },
    });
  };

  const handleAddImage = () => {
    if (!report || !newImageId.trim()) return;
    setReport({
      ...report,
      images: [...getReportImages(report.images), newImageId.trim()],
    });
    setNewImageId('');
    setAddImageDialogOpen(false);
  };

  const handleRemoveImage = (index: number) => {
    if (!report) return;
    const newImages = [...getReportImages(report.images)];
    newImages.splice(index, 1);
    setReport({ ...report, images: newImages });
  };

  const getTemplate = () => {
    if (!report) return null;
    return templates.find((t) => t.id === report.templateId);
  };

  const renderStatusActions = () => {
    if (!report) return null;

    switch (report.status) {
      case 'draft':
        return (
          <Button onClick={handleSubmitForReview}>
            <Send className="mr-2 h-4 w-4" />
            {t('report.workflow.submitForReview')}
          </Button>
        );
      case 'pending_review':
        return (
          <>
            <Button variant="outline" onClick={handleReject}>
              <XCircle className="mr-2 h-4 w-4" />
              {t('report.workflow.rejectReport')}
            </Button>
            <Button onClick={handleApprove}>
              <CheckCircle className="mr-2 h-4 w-4" />
              {t('report.workflow.approveReport')}
            </Button>
          </>
        );
      case 'reviewed':
        return (
          <Button onClick={handlePublish}>
            <Globe className="mr-2 h-4 w-4" />
            {t('report.workflow.publishReport')}
          </Button>
        );
      default:
        return null;
    }
  };

  const renderStructuredFields = () => {
    const template = getTemplate();
    if (!template?.fields || !Array.isArray(template.fields)) {
      return null;
    }

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('report.structuredFields')}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {template.fields.map((field) => (
              <div key={field.key}>
                <Label>
                  {field.label}
                  {field.required && <span className="text-destructive ml-1">*</span>}
                </Label>
                {field.type === 'textarea' ? (
                  <textarea
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                    value={report?.content?.[field.key] || ''}
                    onChange={(e) => handleContentChange(field.key, e.target.value)}
                    placeholder={field.label}
                  />
                ) : field.type === 'select' ? (
                  <select
                    className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={report?.content?.[field.key] || ''}
                    onChange={(e) => handleContentChange(field.key, e.target.value)}
                  >
                    <option value="">请选择...</option>
                    {field.options?.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className="mt-1"
                    value={report?.content?.[field.key] || ''}
                    onChange={(e) => handleContentChange(field.key, e.target.value)}
                    placeholder={field.label}
                  />
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold">{t('report.edit')}</h1>
          {report && <StatusBadge status={report.status} />}
        </div>
        <div className="flex items-center space-x-2">
          {report && (
            <>
              <Button variant="outline" size="sm" onClick={handleSave} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? t('report.saving') : t('report.save')}
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportPdf}>
                <Printer className="mr-2 h-4 w-4" />
                {t('report.print')}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setHistoryDialogOpen(true)}>
                <History className="mr-2 h-4 w-4" />
                {t('report.history')}
              </Button>
              {renderStatusActions()}
            </>
          )}
        </div>
      </div>

      {/* Template Selector or Report Editor */}
      {!report ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('report.selectTemplate')}</CardTitle>
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
                      {t('report.templateType')}: {template.type}
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
            <Button
              className="mt-4"
              disabled={!selectedTemplate}
              onClick={handleCreateReport}
            >
              <FileText className="mr-2 h-4 w-4" />
              {t('report.createReport')}
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="print-container">
          <Tabs defaultValue="edit">
            <TabsList className="print:hidden">
              <TabsTrigger value="edit">{t('report.edit')}</TabsTrigger>
              <TabsTrigger value="preview">{t('report.preview')}</TabsTrigger>
            </TabsList>

            <TabsContent value="edit">
              <div className="space-y-4">
                {/* Title */}
                <Card>
                  <CardContent className="pt-6">
                    <Label>{t('report.edit')}</Label>
                    <Input
                      className="mt-1 text-lg font-medium"
                      value={report.title}
                      onChange={(e) =>
                        setReport({ ...report, title: e.target.value })
                      }
                    />
                  </CardContent>
                </Card>

                {/* Structured Fields from Template */}
                {renderStructuredFields()}

                {/* Findings - Rich Text Area */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('report.findings')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div
                      className="min-h-[200px] rounded-md border border-input bg-background px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2"
                      contentEditable
                      suppressContentEditableWarning
                      onBlur={(e) =>
                        handleContentChange('findings', e.currentTarget.innerHTML)
                      }
                      dangerouslySetInnerHTML={{
                        __html: report.content?.findings || '',
                      }}
                    />
                  </CardContent>
                </Card>

                {/* Conclusion */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('report.conclusion')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
                      value={report.content?.conclusion || ''}
                      onChange={(e) =>
                        handleContentChange('conclusion', e.target.value)
                      }
                      placeholder={t('report.conclusion')}
                    />
                  </CardContent>
                </Card>

                {/* Notes */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('report.notes')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <textarea
                      className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[80px] resize-y"
                      value={report.content?.notes || ''}
                      onChange={(e) =>
                        handleContentChange('notes', e.target.value)
                      }
                      placeholder={t('report.notes')}
                    />
                  </CardContent>
                </Card>

                {/* Image References */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{t('report.imageReferences')}</CardTitle>
                      <Button variant="outline" size="sm" onClick={() => setAddImageDialogOpen(true)}>
                        <ImageIcon className="mr-2 h-4 w-4" />
                        {t('report.addImage')}
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {getReportImages(report.images).length > 0 ? (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {getReportImages(report.images).map((imageId, index) => (
                          <div
                            key={index}
                            className="relative group rounded-md border overflow-hidden"
                          >
                            <img
                              src={`/api/images/${imageId}/thumbnail`}
                              alt={`Image ${index + 1}`}
                              className="w-full h-24 object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src =
                                  'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2Y1ZjVmNSIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgZm9udC1mYW1pbHk9IkFyaWFsIiBmb250LXNpemU9IjEyIiBmaWxsPSIjOTk5IiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBkeT0iLjNlbSI+SW1hZ2U8L3RleHQ+PC9zdmc+';
                              }}
                            />
                            <button
                              className="absolute top-1 right-1 bg-destructive/80 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                              onClick={() => handleRemoveImage(index)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        {t('report.noImages')}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Review Notes (if any) */}
                {report.reviewNotes && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">{t('report.reviewNotes')}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm whitespace-pre-wrap">{report.reviewNotes}</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            <TabsContent value="preview">
              <Card className="print:shadow-none print:border-0">
                <CardHeader className="print:pb-2">
                  <div className="flex items-center justify-between print:flex-col print:items-start">
                    <CardTitle className="text-2xl">{report.title}</CardTitle>
                    <StatusBadge status={report.status} className="print:hidden" />
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {new Date(report.createdAt).toLocaleString('zh-CN')}
                  </p>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Structured fields preview */}
                  {getTemplate()?.fields?.map((field) => {
                    const value = report.content?.[field.key];
                    if (!value) return null;
                    return (
                      <div key={field.key}>
                        <h3 className="font-medium text-lg mb-2">{field.label}</h3>
                        <p className="text-sm whitespace-pre-wrap">{value}</p>
                      </div>
                    );
                  })}

                  {/* Findings preview */}
                  {report.content?.findings && (
                    <div>
                      <h3 className="font-medium text-lg mb-2">{t('report.findings')}</h3>
                      <div
                        className="prose dark:prose-invert max-w-none text-sm"
                        dangerouslySetInnerHTML={{ __html: report.content.findings }}
                      />
                    </div>
                  )}

                  {/* Conclusion preview */}
                  <div>
                    <h3 className="font-medium text-lg mb-2">{t('report.conclusion')}</h3>
                    <p className="text-sm whitespace-pre-wrap">
                      {report.content?.conclusion || '-'}
                    </p>
                  </div>

                  {/* Notes preview */}
                  {report.content?.notes && (
                    <div>
                      <h3 className="font-medium text-lg mb-2">{t('report.notes')}</h3>
                      <p className="text-sm whitespace-pre-wrap">{report.content.notes}</p>
                    </div>
                  )}

                  {/* Images preview */}
                  {getReportImages(report.images).length > 0 && (
                    <div>
                      <h3 className="font-medium text-lg mb-2">{t('report.imageReferences')}</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {getReportImages(report.images).map((imageId, index) => (
                          <img
                            key={index}
                            src={`/api/images/${imageId}/thumbnail`}
                            alt={`Image ${index + 1}`}
                            className="w-full rounded border"
                          />
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Review Notes */}
                  {report.reviewNotes && (
                    <div>
                      <h3 className="font-medium text-lg mb-2">{t('report.reviewNotes')}</h3>
                      <p className="text-sm whitespace-pre-wrap">{report.reviewNotes}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* Review Notes Dialog */}
      <ReviewNotesDialog
        open={reviewDialogOpen}
        onOpenChange={setReviewDialogOpen}
        title={
          reviewAction === 'approve'
            ? t('report.workflow.approveReport')
            : reviewAction === 'reject'
            ? t('report.workflow.rejectReport')
            : t('report.workflow.publishReport')
        }
        onConfirm={handleReviewConfirm}
        confirmLabel={
          reviewAction === 'approve'
            ? t('report.approve')
            : reviewAction === 'reject'
            ? t('report.reject')
            : t('report.publish')
        }
        showNotes={reviewAction !== 'approve'}
      />

      {/* Version History Dialog */}
      {report && (
        <VersionHistoryDialog
          open={historyDialogOpen}
          onOpenChange={setHistoryDialogOpen}
          reportId={report.id}
        />
      )}

      {/* Add Image Dialog */}
      <Dialog open={addImageDialogOpen} onOpenChange={setAddImageDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加图像</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="imageId">图像 ID</Label>
              <Input
                id="imageId"
                value={newImageId}
                onChange={(e) => setNewImageId(e.target.value)}
                placeholder="请输入图像ID"
                onKeyDown={(e) => e.key === 'Enter' && handleAddImage()}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddImageDialogOpen(false)}>
              取消
            </Button>
            <Button onClick={handleAddImage} disabled={!newImageId.trim()}>
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:hidden {
            display: none !important;
          }
          .print-container {
            padding: 0;
          }
          body * {
            visibility: hidden;
          }
          .print-container, .print-container * {
            visibility: visible;
          }
          .print-container {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
