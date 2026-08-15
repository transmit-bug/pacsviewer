import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientApi, studyApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ImageUpload } from '@/components/upload/ImageUpload';
import { ArrowLeft, Save } from 'lucide-react';

export function StudyCreatePage() {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [patient, setPatient] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [studyId, setStudyId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    modality: 'OCT',
    description: '',
    studyDate: new Date().toISOString().split('T')[0],
  });

  useEffect(() => {
    if (patientId) {
      loadPatient(patientId);
    }
  }, [patientId]);

  const loadPatient = async (id: string) => {
    try {
      const response = await patientApi.getById(id);
      setPatient(response.data);
    } catch (error) {
      console.error('Failed to load patient:', error);
      toast({
        title: t('study.loadPatientFailed'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateStudy = async () => {
    if (!patientId) return;

    try {
      setSaving(true);
      const response = await studyApi.create({
        patientId,
        modality: formData.modality,
        description: formData.description || `${formData.modality} ${t('common.study')}`,
        studyDate: formData.studyDate,
        status: 'pending',
      });
      setStudyId(response.data.id);
      toast({
        title: t('study.createSuccess'),
        description: t('study.createSuccessDesc'),
      });
    } catch (error) {
      console.error('Failed to create study:', error);
      toast({
        title: t('study.createFailed'),
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleUploadComplete = (imageIds: string[]) => {
    toast({
      title: t('study.uploadSuccess', { count: imageIds.length }),
    });
  };

  const handleFinish = () => {
    if (studyId) {
      navigate(`/viewer/${studyId}`);
    } else {
      navigate(`/patients/${patientId}`);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Skeleton className="h-10 w-10" />
          <Skeleton className="h-8 w-[200px]" />
        </div>
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-[150px]" />
          </CardHeader>
          <CardContent className="space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!patient) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground mb-4">{t('study.patientNotFound')}</p>
        <Button asChild variant="outline">
          <Link to="/patients">{t('study.backToPatients')}</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center space-x-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to={`/patients/${patientId}`}>
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">{t('study.create')}</h1>
          <p className="text-sm text-muted-foreground">
            {t('study.patient', { name: patient.name })} ({patient.mrn})
          </p>
        </div>
      </div>

      {/* Step 1: Study Info */}
      {!studyId && (
        <Card>
          <CardHeader>
            <CardTitle>{t('study.info')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="modality">{t('study.type')}</Label>
                <select
                  id="modality"
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.modality}
                  onChange={(e) => setFormData({ ...formData, modality: e.target.value })}
                >
                  <option value="OCT">{t('study.modalityOCT')}</option>
                  <option value="Fundus">{t('study.modalityFundus')}</option>
                  <option value="FFA">{t('study.modalityFFA')}</option>
                  <option value="ICGA">{t('study.modalityICGA')}</option>
                  <option value="VF">{t('study.modalityVF')}</option>
                  <option value="UBM">{t('study.modalityUBM')}</option>
                  <option value="B-Scan">{t('study.modalityBScan')}</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="studyDate">{t('study.date')}</Label>
                <Input
                  id="studyDate"
                  type="date"
                  value={formData.studyDate}
                  onChange={(e) => setFormData({ ...formData, studyDate: e.target.value })}
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="description">{t('study.description')}</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder={t('study.descriptionPlaceholder')}
                />
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={handleCreateStudy} disabled={saving}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? t('study.creating') : t('study.createBtn')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Upload Images */}
      {studyId && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{t('study.uploadImages')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ImageUpload
                studyId={studyId}
                patientId={patientId}
                modality={formData.modality}
                onUploadComplete={handleUploadComplete}
              />
            </CardContent>
          </Card>

          <div className="flex justify-end space-x-2">
            <Button variant="outline" onClick={handleFinish}>
              {t('study.uploadLater')}
            </Button>
            <Button onClick={handleFinish}>
              {t('study.finishAndView')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
