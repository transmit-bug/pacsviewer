import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { reportApi } from '@/services/api';
import { StatusBadge } from './StatusBadge';
import { Clock, FileText } from 'lucide-react';

interface ReportVersion {
  id: string;
  reportId: string;
  content: Record<string, any>;
  status: string;
  createdAt: string;
  createdBy: string;
}

interface VersionHistoryDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  reportId: string;
}

export function VersionHistoryDialog({
  open,
  onOpenChange,
  reportId,
}: VersionHistoryDialogProps) {
  const { t } = useTranslation();
  const [versions, setVersions] = useState<ReportVersion[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedVersion, setSelectedVersion] = useState<ReportVersion | null>(null);

  useEffect(() => {
    if (open && reportId) {
      loadVersions();
    }
  }, [open, reportId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const response = await reportApi.getVersions(reportId);
      setVersions(response.data || []);
    } catch (error) {
      console.error('Failed to load versions:', error);
      setVersions([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('report.history')}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-[200px_1fr] gap-4 min-h-[300px]">
          {/* Version list */}
          <div className="border rounded-md overflow-y-auto max-h-[400px]">
            {loading ? (
              <div className="p-4 text-center text-muted-foreground">加载中...</div>
            ) : versions.length === 0 ? (
              <div className="p-4 text-center text-muted-foreground">
                {t('report.noHistory')}
              </div>
            ) : (
              versions.map((version) => (
                <button
                  key={version.id}
                  className={`w-full text-left px-3 py-2 border-b last:border-b-0 hover:bg-accent transition-colors ${
                    selectedVersion?.id === version.id ? 'bg-accent' : ''
                  }`}
                  onClick={() => setSelectedVersion(version)}
                >
                  <div className="flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">
                      {new Date(version.createdAt).toLocaleString('zh-CN')}
                    </span>
                  </div>
                  <div className="mt-1">
                    <StatusBadge status={version.status} />
                  </div>
                </button>
              ))
            )}
          </div>

          {/* Version detail */}
          <div className="border rounded-md p-4 overflow-y-auto max-h-[400px]">
            {selectedVersion ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{t('report.version')} - {new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}</span>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">{t('report.conclusion')}</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedVersion.content?.conclusion || '-'}
                  </p>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium">{t('report.notes')}</h4>
                  <p className="text-sm whitespace-pre-wrap">
                    {selectedVersion.content?.notes || '-'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                选择一个版本查看详情
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('report.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
