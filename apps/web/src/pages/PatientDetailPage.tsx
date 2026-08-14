import { useState, useEffect, useCallback } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { patientApi, followUpApi, measurementApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ArrowLeft, Edit, Plus, GitCompareArrows, LineChart as LineChartIcon } from 'lucide-react';
import { TrendFacetGrid } from '@/components/trend/TrendFacetGrid';
import { TrendKpiCards } from '@/components/trend/TrendKpiCards';
import type { TrendSeries } from '@/components/trend/trend-utils';
import { FollowUpStarterDialog } from '@/components/follow-up/FollowUpStarterDialog';

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

interface Series {
  id: string;
  modality: string;
  seriesNumber: number;
}

interface Study {
  id: string;
  studyDate: string;
  studyTime?: string;
  status: string;
  modality?: string;
  description?: string;
  series?: Series[];
}

interface FollowUpRecord {
  id: string;
  baselineStudyId: string;
  comparisonStudyId: string;
  createdAt: string;
  notes?: string;
  measurements: any[];
  baselineStudy?: { id: string; studyDate: string; modality?: string };
  comparisonStudy?: { id: string; studyDate: string; modality?: string };
}

export function PatientDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);

  // Follow-up starter (T5)
  const [starterOpen, setStarterOpen] = useState(false);
  const [starterInitial, setStarterInitial] = useState<{ baseline: string | null; comparison: string | null }>({
    baseline: null,
    comparison: null,
  });

  // Trends (T3)
  const [trendSeries, setTrendSeries] = useState<TrendSeries[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendView, setTrendView] = useState<'grid' | 'kpi'>('grid');

  // Follow-up records (T5 timeline)
  const [followUpRecords, setFollowUpRecords] = useState<FollowUpRecord[]>([]);
  const [followUpLoading, setFollowUpLoading] = useState(false);

  useEffect(() => {
    if (id) {
      loadPatient(id);
      loadStudies(id);
      loadFollowUpRecords(id);
      loadTrends(id);
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
      const items: Study[] = (response.data || []).map((s: any) => ({
        ...s,
        modality: s.series?.[0]?.modality ?? s.modality ?? undefined,
      }));
      setStudies(items);
    } catch (error) {
      console.error('Failed to load studies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTrends = useCallback(async (patientId: string) => {
    setTrendLoading(true);
    try {
      const res = await measurementApi.getTrends({ patientId });
      setTrendSeries(res.data.series ?? []);
    } catch (error) {
      console.error('Failed to load trends:', error);
      toast({ title: t('patient.trendLoadFailed'), variant: 'destructive' });
    } finally {
      setTrendLoading(false);
    }
  }, []);

  const loadFollowUpRecords = async (patientId: string) => {
    setFollowUpLoading(true);
    try {
      const res = await followUpApi.list({ patientId, pageSize: 50 });
      setFollowUpRecords(res.data?.items ?? []);
    } catch (error) {
      console.error('Failed to load follow-up records:', error);
    } finally {
      setFollowUpLoading(false);
    }
  };

  const handleStartComparison = (baselineStudyId: string, comparisonStudyId: string) => {
    setStarterOpen(false);
    navigate(`/compare?patientId=${id}&baseline=${baselineStudyId}&comparison=${comparisonStudyId}`);
  };

  const handleDeleteFollowUp = async (recordId: string) => {
    try {
      await followUpApi.delete(recordId);
      if (id) loadFollowUpRecords(id);
      toast({ title: t('patient.recordDeleted') });
    } catch (error) {
      toast({ title: t('patient.deleteFailed'), variant: 'destructive' });
    }
  };

  const openStarter = (studyId: string) => {
    setStarterInitial({ baseline: studyId, comparison: null });
    setStarterOpen(true);
  };

  if (loading) {
    return <div className="text-center py-8">{t('patient.loading')}</div>;
  }

  if (!patient) {
    return <div className="text-center py-8">{t('patient.patientNotFound')}</div>;
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
          <TabsTrigger value="info">{t('patient.basicInfo')}</TabsTrigger>
          <TabsTrigger value="studies">{t('patient.studies')}</TabsTrigger>
          <TabsTrigger value="timeline">{t('patient.timeline')}</TabsTrigger>
          <TabsTrigger value="trend">{t('patient.followUpTrend')}</TabsTrigger>
        </TabsList>

        <TabsContent value="info">
          <Card>
            <CardHeader>
              <CardTitle>{t('patient.info')}</CardTitle>
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
                  <p className="text-sm text-muted-foreground">{t('patient.email')}</p>
                  <p className="font-medium">{patient.email || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">{t('patient.address')}</p>
                  <p className="font-medium">{patient.address || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">{t('patient.notes')}</p>
                  <p className="font-medium">{patient.notes || '-'}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="text-sm text-muted-foreground">{t('patient.tags')}</p>
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
              <CardTitle>{t('patient.studies')}</CardTitle>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => { setStarterInitial({ baseline: null, comparison: null }); setStarterOpen(true); }}>
                  <GitCompareArrows className="mr-2 h-4 w-4" />
                  {t('patient.startFollowUp')}
                </Button>
                <Button size="sm" asChild>
                  <Link to={`/patients/${id}/new-study`}>
                    <Plus className="mr-2 h-4 w-4" />
                    {t('patient.newStudy')}
                  </Link>
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {studies.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('study.noData')}
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
                          <p className="font-medium">
                            {study.modality?.toUpperCase() ?? 'N/A'}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {study.studyDate}
                            {study.studyTime ? ' ' + study.studyTime.slice(0, 5) : ''}
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
                            ? t('patient.statusReported')
                            : study.status === 'diagnosed'
                            ? t('patient.statusDiagnosed')
                            : t('patient.statusPending')}
                        </span>
                        <Button variant="outline" size="sm" onClick={() => openStarter(study.id)}>
                          <GitCompareArrows className="mr-1 h-4 w-4" />
                          {t('patient.followUpCompare')}
                        </Button>
                        <Button variant="ghost" size="sm" asChild>
                          <Link to={`/viewer/${study.id}`}>{t('study.view')}</Link>
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
              <CardTitle>{t('patient.followUpRecords')}</CardTitle>
            </CardHeader>
            <CardContent>
              {followUpLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-12 w-full" />
                  <Skeleton className="h-12 w-full" />
                </div>
              ) : followUpRecords.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {t('patient.noFollowUpRecords')}
                </div>
              ) : (
                <div className="space-y-2">
                  {followUpRecords.map((record) => (
                    <div
                      key={record.id}
                      className="flex items-center justify-between rounded-lg border p-3 hover:bg-accent cursor-pointer transition-colors"
                      onClick={() =>
                        navigate(
                          `/compare?patientId=${patient.id}&baseline=${record.baselineStudyId}&comparison=${record.comparisonStudyId}`
                        )
                      }
                    >
                      <div className="flex items-center gap-3">
                        <GitCompareArrows className="h-5 w-5 text-muted-foreground" />
                        <div>
                          <p className="text-sm font-medium">
                            {record.baselineStudy?.studyDate ?? '?'} → {record.comparisonStudy?.studyDate ?? '?'}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {record.baselineStudy?.modality ?? ''} · {new Date(record.createdAt).toLocaleString(i18n.language === 'en' ? 'en-US' : 'zh-CN')}
                            {record.measurements?.length > 0 ? ` · ${t('patient.countComparison', { count: record.measurements.length })}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(
                              `/compare?patientId=${patient.id}&baseline=${record.baselineStudyId}&comparison=${record.comparisonStudyId}`
                            );
                          }}
                        >
                          {t('patient.openWorkbench')}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteFollowUp(record.id);
                          }}
                        >
                          {t('patient.deleteRecord')}
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trend">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{t('patient.followUpTrend')}</CardTitle>
              <div className="flex gap-1">
                <Button
                  size="sm"
                  variant={trendView === 'grid' ? 'default' : 'ghost'}
                  onClick={() => {
                    setTrendView('grid');
                    if (id) loadTrends(id);
                  }}
                >
                  {t('patient.facetGrid')}
                </Button>
                <Button
                  size="sm"
                  variant={trendView === 'kpi' ? 'default' : 'ghost'}
                  onClick={() => {
                    setTrendView('kpi');
                    if (id) loadTrends(id);
                  }}
                >
                  {t('patient.kpiCards')}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {trendLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-32 w-full" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : trendSeries.length === 0 && !trendLoading ? (
                <div className="text-center py-10">
                  <LineChartIcon className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-muted-foreground text-sm">
                    {t('patient.noTrendData')}
                  </p>
                  <Button
                    className="mt-3"
                    variant="outline"
                    size="sm"
                    onClick={() => id && loadTrends(id)}
                  >
                    {t('common.refresh')}
                  </Button>
                </div>
              ) : (
                <div>
                  {trendView === 'grid' ? (
                    <TrendFacetGrid series={trendSeries} />
                  ) : (
                    <TrendKpiCards series={trendSeries} />
                  )}
                  <div className="text-xs text-muted-foreground mt-4 flex items-center justify-between">
                    <span>{t('patient.trendDrivenBy')}</span>
                    <Button variant="ghost" size="sm" onClick={() => id && loadTrends(id)}>
                      {t('common.refresh')}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <FollowUpStarterDialog
        open={starterOpen}
        onOpenChange={setStarterOpen}
        studies={studies}
        initialBaselineId={starterInitial.baseline}
        initialComparisonId={starterInitial.comparison}
        onStart={handleStartComparison}
      />
    </div>
  );
}
