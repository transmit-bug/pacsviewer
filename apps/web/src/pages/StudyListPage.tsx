import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import i18n from '@/i18n';
import { studyApi } from '@/services/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Plus, Search, MoreHorizontal, ChevronLeft, ChevronRight, Eye, FileText, Trash2, Upload } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { StudyUploadDialog } from '@/components/upload/StudyUploadDialog';

interface Study {
  id: string;
  patientId: string;
  patientName?: string;
  studyDate: string;
  studyTime?: string;
  modality: string;
  device?: string;
  status: string;
  description?: string;
  tags?: string[];
  createdAt: string;
}

const statusColors: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800',
  in_progress: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-gray-100 text-gray-800',
};

const statusKeys: Record<string, string> = {
  pending: 'study.statusPending',
  in_progress: 'study.statusInProgress',
  completed: 'study.statusCompleted',
  cancelled: 'study.statusCancelled',
};

export function StudyListPage() {
  const { t } = useTranslation();
  const [studies, setStudies] = useState<Study[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [studyToDelete, setStudyToDelete] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const pageSize = 10;

  // Upload (wayfinder #131): append images to an existing study
  const [uploadStudy, setUploadStudy] = useState<{ id: string; patientId: string; modality?: string } | null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);

  useEffect(() => {
    loadStudies();
  }, [page, statusFilter]);

  const loadStudies = async () => {
    try {
      setLoading(true);
      const params: any = { page, pageSize };
      if (statusFilter) params.status = statusFilter;
      const response = await studyApi.getAll(params);
      setStudies(response.data?.items || []);
      setTotalPages(response.data?.totalPages || 1);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Failed to load studies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setPage(1);
      loadStudies();
      return;
    }
    try {
      setLoading(true);
      const response = await studyApi.getAll({ search: searchQuery, page: 1, pageSize: 100 });
      setStudies(response.data?.items || []);
      setTotalPages(1);
      setTotal(response.data?.total || 0);
    } catch (error) {
      console.error('Failed to search studies:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteClick = (id: string) => {
    setStudyToDelete(id);
    setDeleteDialogOpen(true);
  };

  const openUpload = (study: Study) => {
    setUploadStudy({
      id: study.id,
      patientId: study.patientId,
      modality: study.modality,
    });
    setUploadOpen(true);
  };

  const handleDeleteConfirm = async () => {
    if (!studyToDelete) return;
    try {
      await studyApi.delete(studyToDelete);
      setStudies(studies.filter(s => s.id !== studyToDelete));
      setTotal(prev => prev - 1);
    } catch (error) {
      console.error('Failed to delete study:', error);
    } finally {
      setDeleteDialogOpen(false);
      setStudyToDelete(null);
    }
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'zh-CN');
    } catch {
      return dateStr;
    }
  };

  const formatTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return t('dashboard.justNow');
    if (diffHours < 24) return t('dashboard.hoursAgo', { count: diffHours });
    if (diffDays < 7) return t('dashboard.daysAgo', { count: diffDays });
    return date.toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'zh-CN');
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold">{t('study.title')}</h1>
        <Button asChild>
          <Link to="/patients">
            <Plus className="mr-2 h-4 w-4" />
            {t('study.create')}
          </Link>
        </Button>
      </div>

      <div className="flex items-center space-x-2">
        <Input
          placeholder={t('study.search')}
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          className="max-w-sm"
        />
        <Button variant="outline" onClick={handleSearch}>
          <Search className="h-4 w-4" />
        </Button>
        <div className="flex space-x-1 ml-4">
          {['', 'pending', 'in_progress', 'completed'].map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setStatusFilter(status);
                setPage(1);
              }}
            >
              {status === '' ? t('study.all') : t(statusKeys[status] || status)}
            </Button>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {t('study.list')} {total > 0 && <span className="text-sm font-normal text-muted-foreground">{t('study.count', { total })}</span>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center space-x-4 p-4 border rounded-lg">
                  <Skeleton className="h-12 w-12 rounded" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-[200px]" />
                    <Skeleton className="h-3 w-[300px]" />
                  </div>
                </div>
              ))}
            </div>
          ) : studies.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground mb-4">{t('study.noData')}</div>
              <Button asChild variant="outline">
                <Link to="/patients">
                  <Plus className="mr-2 h-4 w-4" />
                  {t('study.createFirst')}
                </Link>
              </Button>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {studies.map((study) => (
                  <div
                    key={study.id}
                    className="flex items-center justify-between rounded-lg border p-4 hover:bg-accent/50 transition-colors"
                  >
                    <Link to={`/viewer/${study.id}`} className="flex-1">
                      <div className="flex items-center space-x-4">
                        <div className="flex h-12 w-12 items-center justify-center rounded bg-primary/10">
                          <Eye className="h-6 w-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-medium">
                            {study.description || `${t('common.study')} ${study.id.slice(0, 8)}`}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {study.modality || t('study.unknownModality')} | {formatDate(study.studyDate)} | {formatTimeAgo(study.createdAt)}
                          </p>
                          {study.patientName && (
                            <p className="text-sm text-muted-foreground">
                              {t('study.patient', { name: study.patientName })}
                            </p>
                          )}
                        </div>
                      </div>
                    </Link>
                    <div className="flex items-center space-x-2">
                      <Badge className={statusColors[study.status] || 'bg-gray-100 text-gray-800'}>
                        {t(statusKeys[study.status] || study.status)}
                      </Badge>
                      {study.tags?.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-primary/10 px-2 py-1 text-xs text-primary"
                        >
                          {tag}
                        </span>
                      ))}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/viewer/${study.id}`}>
                              <Eye className="mr-2 h-4 w-4" />
                              {t('study.view')}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openUpload(study)}>
                            <Upload className="mr-2 h-4 w-4" />
                            追加图像
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/reports/${study.id}`}>
                              <FileText className="mr-2 h-4 w-4" />
                              {t('study.report')}
                            </Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive"
                            onClick={() => handleDeleteClick(study.id)}
                          >
                            <Trash2 className="mr-2 h-4 w-4" />
                            {t('study.delete')}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                ))}
              </div>

              {/* Pagination */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-6">
                  <p className="text-sm text-muted-foreground">
                    {t('study.pageInfo', { page, totalPages })}
                  </p>
                  <div className="flex space-x-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page <= 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('study.deleteConfirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('study.deleteConfirmDesc')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t('study.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Append images dialog */}
      <StudyUploadDialog
        study={uploadStudy}
        open={uploadOpen}
        onOpenChange={setUploadOpen}
        onUploaded={loadStudies}
      />
    </div>
  );
}
