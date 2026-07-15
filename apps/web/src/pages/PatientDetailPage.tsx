import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { patientApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowLeft, Edit, Plus } from 'lucide-react';

interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender: string;
  birthDate: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
  tags: string[];
}

interface Study {
  id: string;
  studyDate: string;
  studyType: string;
  modality: string;
  status: string;
  description?: string;
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (id) {
      loadPatient(id);
      loadStudies(id);
    }
  }, [id]);

  const loadPatient = async (patientId: string) => {
    try {
      const response = await patientApi.getById(patientId);
      setPatient(response.data);
    } catch (error) {
      console.error('Failed to load patient:', error);
    }
  };

  const loadStudies = async (patientId: string) => {
    try {
      const response = await patientApi.getStudies(patientId);
      setStudies(response.data || []);
    } catch (error) {
      console.error('Failed to load studies:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">加载中...</div>;
  }

  if (!patient) {
    return <div className="text-center py-8">患者未找到</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/patients">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <h1 className="text-3xl font-bold">{patient.name}</h1>
        </div>
        <Button asChild>
          <Link to={`/patients/${id}/edit`}>
            <Edit className="mr-2 h-4 w-4" />
            {t('patient.edit')}
          </Link>
        </Button>
      </div>

      <Tabs defaultValue="info">
        <TabsList>
          <TabsTrigger value="info">基本信息</TabsTrigger>
          <TabsTrigger value="studies">检查记录</TabsTrigger>
          <TabsTrigger value="timeline">时间轴</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>患者信息</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <p className="text-sm text-muted-foreground">{t('patient.mrn')}</p>
                  <p className="font-medium">{patient.mrn}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('patient.name')}</p>
                  <p className="font-medium">{patient.name}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('patient.gender')}</p>
                  <p className="font-medium">
                    {patient.gender === 'male' ? t('patient.male') : t('patient.female')}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('patient.birthDate')}</p>
                  <p className="font-medium">{patient.birthDate}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">{t('patient.phone')}</p>
                  <p className="font-medium">{patient.phone || '-'}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">邮箱</p>
                  <p className="font-medium">{patient.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">地址</p>
                  <p className="font-medium">{patient.address || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">备注</p>
                  <p className="font-medium">{patient.notes || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">标签</p>
                  <div className="flex flex-wrap gap-2 mt-1">
                    {patient.tags?.map((tag) => (
                      <span
                        key={tag}
                        className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="studies">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>检查记录</CardTitle>
              <Button size="sm">
                <Plus className="mr-2 h-4 w-4" />
                新建检查
              </Button>
            </CardHeader>
            <CardContent>
              {studies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  暂无检查记录
                </div>
              ) : (
                <div className="space-y-4">
                  {studies.map((study) => (
                    <div
                      key={study.id}
                      className="flex items-center justify-between rounded-lg border p-4"
                    >
                      <Link to={`/viewer/${study.id}`} className="flex-1">
                        <div>
                          <p className="font-medium">{study.studyType.toUpperCase()}</p>
                          <p className="text-sm text-muted-foreground">
                            {study.studyDate} | {study.modality}
                          </p>
                          {study.description && (
                            <p className="text-sm text-muted-foreground mt-1">
                              {study.description}
                            </p>
                          )}
                        </div>
                      </Link>
                      <div className="flex items-center space-x-2">
                        <span
                          className={`rounded-full px-2 py-1 text-xs ${
                            study.status === 'reported'
                              ? 'bg-green-500/10 text-green-500'
                              : study.status === 'diagnosed'
                              ? 'bg-blue-500/10 text-blue-500'
                              : 'bg-yellow-500/10 text-yellow-500'
                          }`}
                        >
                          {study.status === 'reported'
                            ? '已报告'
                            : study.status === 'diagnosed'
                            ? '已诊断'
                            : '待处理'}
                        </span>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/viewer/${study.id}`}>查看</Link>
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="timeline">
          <Card>
            <CardHeader>
              <CardTitle>时间轴</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                时间轴功能开发中...
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
