/**
 * Follow-up Comparison Workbench (随访对比 T4 / T5)
 *
 * /compare evolved from a single-study image compare into the follow-up
 * workbench: patient + same-modality historical study selectors on top,
 * three comparison modes (side-by-side default / overlay / slider) with
 * synced zoom/pan/window-level (toggleable), and in-comparison measurement
 * attributed per panel to its study (persisted via /annotations/sync, which
 * also feeds measurement_points snapshots).
 *
 * Query params:
 *   ?patientId=<id>&baseline=<studyId>&comparison=<studyId>   (workbench entry)
 *   ?studyId=<id>            (legacy — single study, picks a same-modality pair)
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { patientApi, studyApi, imageApi, annotationApi, followUpApi, measurementApi } from '@/services/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from '@/components/ui/toast';
import { ComparisonView } from '@/components/comparison/ComparisonView';
import type { ComparisonMode } from '@/components/comparison/ComparisonView';
import type { ComparisonLine } from '@/components/comparison/shared';
import { TrendKpiCards } from '@/components/trend/TrendKpiCards';
import type { TrendSeries } from '@/components/trend/trend-utils';
import { TREND_META } from '@/components/trend/trend-utils';import {
  ArrowLeft,
  Image as ImageIcon,
  Save,
  Trash2,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface Image {
  id: string;
  width: number;
  height: number;
  thumbnailPath?: string;
  instanceNumber: number;
}

interface Study {
  id: string;
  patientId: string;
  studyDate: string;
  studyTime?: string;
  modality?: string;
  status: string;
  description?: string;
}

interface DeltaRow {
  label: string;
  baselineValue: number;
  comparisonValue: number;
  delta: number;
  deltaPercent: number;
  unit: string;
  trend: 'improving' | 'stable' | 'worsening';
  isSignificant: boolean;
}

export function ComparisonPage() {
  const [searchParams] = useSearchParams();
  const patientIdParam = searchParams.get('patientId');
  const baselineParam = searchParams.get('baseline');
  const comparisonParam = searchParams.get('comparison');
  const legacyStudyId = searchParams.get('studyId');
  const token = useAuthStore((s) => s.token);

  const [patient, setPatient] = useState<{ id: string; name: string; mrn: string } | null>(null);
  const [studies, setStudies] = useState<Study[]>([]);
  const [baselineStudyId, setBaselineStudyId] = useState<string | null>(baselineParam);
  const [comparisonStudyId, setComparisonStudyId] = useState<string | null>(comparisonParam);
  const [imagesByStudy, setImagesByStudy] = useState<Record<string, Image[]>>({});
  const [selectedImageA, setSelectedImageA] = useState<string | null>(null);
  const [selectedImageB, setSelectedImageB] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Comparison state
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>('side-by-side');
  const [syncViewport, setSyncViewport] = useState(true);
  const [measuring, setMeasuring] = useState(false);
  const [lines, setLines] = useState<ComparisonLine[]>([]);

  // Follow-up save state (T5)
  const [saving, setSaving] = useState(false);
  const [savedRecordId, setSavedRecordId] = useState<string | null>(null);
  const [deltaRows, setDeltaRows] = useState<DeltaRow[] | null>(null);
  const savingRef = useRef(false);
  // Latest lines via ref so persistence never reads a stale closure.
  const linesRef = useRef<ComparisonLine[]>([]);
  linesRef.current = lines;

  // Workbench sidebar trend chart (#91)
  const [trendSeries, setTrendSeries] = useState<TrendSeries[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);

  const patientId = patientIdParam ?? patient?.id ?? null;

  // ── Initial load ───────────────────────────────────────────────────────────

  useEffect(() => {
    (async () => {
      try {
        if (legacyStudyId && !patientIdParam) {
          // Legacy single-study entry: resolve its patient, then load studies.
          const studyRes = await studyApi.getById(legacyStudyId);
          const study = studyRes.data;
          setPatient({ id: study.patientId, name: study.patient?.name ?? '', mrn: study.patient?.mrn ?? '' });
          await loadStudies(study.patientId, legacyStudyId);
        } else if (patientIdParam) {
          const patientRes = await patientApi.getById(patientIdParam);
          setPatient({ id: patientRes.data.id, name: patientRes.data.name, mrn: patientRes.data.mrn });
          await loadStudies(patientIdParam, null);
        }
      } catch (err) {
        console.error('Failed to load workbench:', err);
        toast({ title: '加载失败', variant: 'destructive' });
      } finally {
        setLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientIdParam, legacyStudyId]);

  const loadStudies = async (pid: string, legacyBaseline: string | null) => {
    const res = await patientApi.getStudies(pid);
    const items: Study[] = (res.data || []).map((s: any) => ({
      ...s,
      modality: s.series?.[0]?.modality ?? s.modality ?? undefined,
    }));
    setStudies(items);
    if (items.length === 0) return;

    // Prefill: baseline = earliest, comparison = most recent (same modality).
    const sorted = [...items].sort((a, b) => `${a.studyDate}${a.studyTime ?? ''}`.localeCompare(`${b.studyDate}${b.studyTime ?? ''}`));
    let base = baselineParam ?? legacyBaseline ?? null;
    let comp = comparisonParam ?? null;
    if (!base && sorted.length >= 1) base = sorted[0].id;
    if (!comp) {
      const sameModality = base ? items.filter((s) => s.modality === items.find((x) => x.id === base)?.modality) : items;
      const compCandidates = sameModality.filter((s) => s.id !== base);
      if (compCandidates.length > 0) {
        comp = [...compCandidates].sort((a, b) => `${b.studyDate}${b.studyTime ?? ''}`.localeCompare(`${a.studyDate}${a.studyTime ?? ''}`))[0].id;
      } else if (items.some((s) => s.id !== base)) {
        comp = items.find((s) => s.id !== base)!.id;
      }
    }
    setBaselineStudyId(base);
    setComparisonStudyId(comp);
  };

  // ── Load images when studies change ────────────────────────────────────────

  useEffect(() => {
    if (baselineStudyId) loadImagesForStudy(baselineStudyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineStudyId]);

  useEffect(() => {
    if (comparisonStudyId) loadImagesForStudy(comparisonStudyId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonStudyId]);

  const loadImagesForStudy = async (studyId: string) => {
    try {
      const seriesRes = await studyApi.getSeries(studyId);
      const seriesList = seriesRes.data || [];
      if (seriesList.length === 0) {
        setImagesByStudy((prev) => ({ ...prev, [studyId]: [] }));
        return;
      }
      const imageRes = await imageApi.search({ seriesId: seriesList[0].id });
      const list: Image[] = (imageRes.data?.items ?? imageRes.data ?? []) as Image[];
      setImagesByStudy((prev) => ({ ...prev, [studyId]: list }));
      if (baselineStudyId === studyId && !selectedImageA && list.length > 0) {
        setSelectedImageA(list[0].id);
      }
      if (comparisonStudyId === studyId && !selectedImageB && list.length > 0) {
        setSelectedImageB(list[0].id);
      }
    } catch (err) {
      console.error('Failed to load images for study', studyId, err);
    }
  };

  // When switching baseline study, keep same-modality constraint on comparison.
  const comparisonCandidates = useMemo(() => {
    const base = studies.find((s) => s.id === baselineStudyId);
    if (!base) return studies.filter((s) => s.id !== baselineStudyId);
    return studies.filter((s) => s.id !== baselineStudyId && s.modality === base.modality);
  }, [studies, baselineStudyId]);

  // Reset image selection when study changes
  useEffect(() => {
    setSelectedImageA(null);
    const list = imagesByStudy[baselineStudyId ?? ''] ?? [];
    if (list.length > 0) setSelectedImageA(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [baselineStudyId]);

  useEffect(() => {
    setSelectedImageB(null);
    const list = imagesByStudy[comparisonStudyId ?? ''] ?? [];
    if (list.length > 0) setSelectedImageB(list[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [comparisonStudyId]);

  // ── Measurement in comparison (T4) ────────────────────────────────────────

  useEffect(() => {
    if (patientId) {
      setTrendLoading(true);
      measurementApi
        .getTrends({ patientId })
        .then((res) => setTrendSeries(res.data.series ?? []))
        .catch((err) => console.error('Failed to load workbench trends:', err))
        .finally(() => setTrendLoading(false));
    }
  }, [patientId]);

  const handleDrawLine = useCallback((line: ComparisonLine) => {
    const next = [...linesRef.current, line];
    setLines(next);
    persistLines(next);
  }, []);

  const clearLines = useCallback(() => {
    setLines([]);
    linesRef.current = [];
    // Clear persisted measurements for both images
    if (selectedImageA) annotationApi.sync(selectedImageA, []).catch(() => {});
    if (selectedImageB) annotationApi.sync(selectedImageB, []).catch(() => {});
  }, [selectedImageA, selectedImageB]);

  /** Persist the lines of one panel to its image via the annotation sync
   *  endpoint (also feeds measurement_points snapshots server-side).
   *  Lines are stored as uncalibrated px Length measurements — honest px
   *  degradation per wayfinder #92 (no calibration in this map). */
  const persistLines = async (allLines: ComparisonLine[]) => {
    try {
      const image = selectedImageA ? imagesByStudy[baselineStudyId ?? '']?.find((i) => i.id === selectedImageA) : undefined;
      const baselineLines = allLines.filter((l) => l.owner === 'baseline');
      if (selectedImageA && image) {
        await annotationApi.sync(selectedImageA, serializeLines(baselineLines, image));
      }
      const imageB = selectedImageB ? imagesByStudy[comparisonStudyId ?? '']?.find((i) => i.id === selectedImageB) : undefined;
      const comparisonLines = allLines.filter((l) => l.owner === 'comparison');
      if (selectedImageB && imageB) {
        await annotationApi.sync(selectedImageB, serializeLines(comparisonLines, imageB));
      }
    } catch (err) {
      console.error('Failed to persist comparison measurements:', err);
      toast({ title: '测量保存失败', variant: 'destructive' });
    }
  };

  const serializeLines = (lines: ComparisonLine[], image: Image): any[] => {
    const targetId = `workbench-${image.id}`;
    return lines.map((l) => {
      const x1 = l.x1 * image.width;
      const y1 = l.y1 * image.height;
      const x2 = l.x2 * image.width;
      const y2 = l.y2 * image.height;
      const length = Math.hypot(x2 - x1, y2 - y1);
      return {
        id: l.id,
        toolName: 'Length',
        data: {
          handles: { points: [[x1, y1, 0], [x2, y2, 0]] },
          cachedStats: { [targetId]: { length, unit: 'px', statsArray: [] } },
          label: `对比测量 ${l.owner === 'baseline' ? '基线' : '对比'}`,
        },
        style: { color: l.owner === 'baseline' ? '#fbbf24' : '#34d399', lineWidth: 2 },
      };
    });
  };

  // ── Save follow-up record (T5) ────────────────────────────────────────────

  const handleSaveFollowUp = async () => {
    if (!patientId || !baselineStudyId || !comparisonStudyId || !selectedImageA || !selectedImageB) {
      toast({ title: '请选择患者与两个检查', variant: 'destructive' });
      return;
    }
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const res = await followUpApi.create({
        patientId,
        baselineStudyId,
        comparisonStudyId,
      });
      const data = res.data;
      setSavedRecordId(data.id);
      if (Array.isArray(data.measurements) && data.measurements.length > 0) {
        setDeltaRows(data.measurements as DeltaRow[]);
      }
      toast({
        title: data.updated ? '随访记录已更新(同对检查)' : '随访记录已保存',
      });
    } catch (err) {
      console.error('Failed to save follow-up:', err);
      toast({ title: '保存随访记录失败', variant: 'destructive' });
    } finally {
      setSaving(false);
      savingRef.current = false;
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="space-y-4 p-4">
        <Skeleton className="h-8 w-[200px]" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const baselineStudy = studies.find((s) => s.id === baselineStudyId);
  const comparisonStudy = studies.find((s) => s.id === comparisonStudyId);
  const baselineImages = imagesByStudy[baselineStudyId ?? ''] ?? [];
  const comparisonImages = imagesByStudy[comparisonStudyId ?? ''] ?? [];

  return (
    <div className="flex h-[calc(100vh-8rem)] space-x-4">
      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <div className="flex items-center space-x-3">
            <Button variant="ghost" size="icon" asChild>
              <Link to={patientId ? `/patients/${patientId}` : '/patients'}>
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
            <div>
              <h1 className="text-xl font-bold">随访对比工作台</h1>
              {patient && (
                <p className="text-sm text-muted-foreground">
                  {patient.name} ({patient.mrn}) · {baselineStudy?.studyDate ?? '-'} → {comparisonStudy?.studyDate ?? '-'}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {lines.length > 0 && (
              <Button variant="outline" size="sm" onClick={clearLines}>
                <Trash2 className="h-4 w-4 mr-1" />
                清除测量
              </Button>
            )}
            {savedRecordId && (
              <span className="text-xs text-green-600 flex items-center gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                已保存 #{savedRecordId.slice(0, 8)}
              </span>
            )}
            <Button
              size="sm"
              onClick={handleSaveFollowUp}
              disabled={saving || !selectedImageA || !selectedImageB}
            >
              {saving ? <RefreshCw className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
              保存随访记录
            </Button>
          </div>
        </div>

        {/* Study selectors */}
        <Card className="mb-3">
          <CardContent className="p-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">基线检查:</span>
                <select
                  value={baselineStudyId ?? ''}
                  onChange={(e) => setBaselineStudyId(e.target.value || null)}
                  className="border rounded-md px-2 py-1.5 text-sm bg-background max-w-[260px]"
                >
                  {studies.length === 0 && <option value="">暂无检查</option>}
                  {[...studies]
                    .sort((a, b) => `${a.studyDate}${a.studyTime ?? ''}`.localeCompare(`${b.studyDate}${b.studyTime ?? ''}`))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studyDate} · {s.modality ?? 'N/A'} · {s.status}
                      </option>
                    ))}
                </select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground whitespace-nowrap">对比检查:</span>
                <select
                  value={comparisonStudyId ?? ''}
                  onChange={(e) => setComparisonStudyId(e.target.value || null)}
                  className="border rounded-md px-2 py-1.5 text-sm bg-background max-w-[260px]"
                >
                  <option value="">请选择</option>
                  {comparisonCandidates
                    .sort((a, b) => `${a.studyDate}${a.studyTime ?? ''}`.localeCompare(`${b.studyDate}${b.studyTime ?? ''}`))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.studyDate} · {s.modality ?? 'N/A'} · {s.status}
                      </option>
                    ))}
                </select>
                <span className="text-[11px] text-muted-foreground">
                  {comparisonCandidates.length < studies.length - 1 ? '(同模态)' : ''}
                </span>
              </div>
              {!baselineStudyId || !comparisonStudyId ? (
                <span className="text-xs text-amber-600">需选择两个检查进入对比</span>
              ) : null}
            </div>
          </CardContent>
        </Card>

        {/* Comparison view */}
        <Card className="flex-1 overflow-hidden min-h-[360px]">
          <CardContent className="p-0 h-full">
            <ComparisonView
              imageIdA={selectedImageA ?? ''}
              imageIdB={selectedImageB ?? ''}
              initialMode={comparisonMode}
              onModeChange={(m) => setComparisonMode(m)}
              syncViewport={syncViewport}
              onSyncViewportChange={setSyncViewport}
              measuring={measuring}
              onMeasuringChange={setMeasuring}
              lines={lines}
              onDrawLine={handleDrawLine}
            />
          </CardContent>
        </Card>
      </div>

      {/* Sidebar */}
      <div className="w-80 flex flex-col space-y-4 overflow-y-auto">
        {/* Image selection */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">基线检查图像 ({baselineStudy?.studyDate ?? '-'})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {baselineImages.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">暂无图像</div>
            ) : (
              <div className="grid grid-cols-3 gap-1 p-2">
                {baselineImages.map((image) => (
                  <button
                    key={image.id}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded border-2 transition-colors',
                      selectedImageA === image.id ? 'border-amber-400' : 'border-transparent hover:border-primary/50'
                    )}
                    onClick={() => setSelectedImageA(image.id)}
                  >
                    {image.thumbnailPath ? (
                      <img
                        src={`/api/images/${image.id}/thumbnail?token=${token}`}
                        alt={`#${image.instanceNumber}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        <ImageIcon className="h-4 w-4 mr-1" />
                        {image.instanceNumber}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">对比检查图像 ({comparisonStudy?.studyDate ?? '-'})</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {comparisonImages.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">暂无图像</div>
            ) : (
              <div className="grid grid-cols-3 gap-1 p-2">
                {comparisonImages.map((image) => (
                  <button
                    key={image.id}
                    className={cn(
                      'relative aspect-square overflow-hidden rounded border-2 transition-colors',
                      selectedImageB === image.id ? 'border-emerald-400' : 'border-transparent hover:border-primary/50'
                    )}
                    onClick={() => setSelectedImageB(image.id)}
                  >
                    {image.thumbnailPath ? (
                      <img
                        src={`/api/images/${image.id}/thumbnail?token=${token}`}
                        alt={`#${image.instanceNumber}`}
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                        <ImageIcon className="h-4 w-4 mr-1" />
                        {image.instanceNumber}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Workbench trend overview (#91) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">纵向趋势 (该患者)</CardTitle>
          </CardHeader>
          <CardContent className="p-2">
            {trendLoading ? (
              <div className="space-y-2 p-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : trendSeries.length === 0 ? (
              <div className="text-sm text-muted-foreground p-2">
                暂无趋势数据 —— 保存测量后自动进入趋势。
              </div>
            ) : (
              <TrendKpiCards series={trendSeries} className="grid-cols-1 sm:grid-cols-1 xl:grid-cols-1" />
            )}
          </CardContent>
        </Card>

        {/* Delta table (T5) */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">测量对照 (delta)</CardTitle>
          </CardHeader>
          <CardContent>
            {!deltaRows ? (
              <div className="text-sm text-muted-foreground">
                保存随访记录后显示测量对照表。
                <br />
                <span className="text-xs">
                  基于两检查的 measurement 标注,按 label 匹配计算变化/百分比/趋势。
                </span>
              </div>
            ) : deltaRows.length === 0 ? (
              <div className="text-sm text-muted-foreground">两检查没有可对照的测量标注。</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground border-b">
                      <th className="py-1 pr-2">测量</th>
                      <th className="py-1 pr-2">基线</th>
                      <th className="py-1 pr-2">对比</th>
                      <th className="py-1 pr-2">变化</th>
                      <th className="py-1">趋势</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deltaRows.map((row, i) => {
                      const trend = TREND_META[row.trend] ?? TREND_META.stable;
                      return (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1.5 pr-2">{row.label}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{row.baselineValue} {row.unit}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{row.comparisonValue} {row.unit}</td>
                          <td className="py-1.5 pr-2 tabular-nums">
                            <span className={row.delta >= 0 ? 'text-red-600' : 'text-green-600'}>
                              {row.delta >= 0 ? '+' : ''}{row.delta.toFixed(1)}
                            </span>
                            <span className="text-muted-foreground">
                              {' '}({row.deltaPercent >= 0 ? '+' : ''}{row.deltaPercent.toFixed(1)}%)
                            </span>
                          </td>
                          <td className="py-1.5">
                            <span className={cn('px-1.5 py-0.5 rounded-full', trend.badgeClass)}>{trend.label}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
