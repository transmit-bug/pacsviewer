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
import { Clock, FileText, GitCompare, ChevronRight } from 'lucide-react';

interface ReportVersion {
  id: string;
  reportId: string;
  version: number;
  status: string;
  content: Record<string, any>;
  images: string[];
  changeNotes?: string;
  createdBy: string;
  createdAt: string;
}

interface VersionDiff {
  from: { version: number; status: string; createdAt: string; creator?: { displayName: string } };
  to: { version: number; status: string; createdAt: string; creator?: { displayName: string } };
  diff: Record<string, { old: any; new: any; changed: boolean }>;
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
  const [compareMode, setCompareMode] = useState(false);
  const [compareFrom, setCompareFrom] = useState<ReportVersion | null>(null);
  const [diff, setDiff] = useState<VersionDiff | null>(null);

  useEffect(() => {
    if (open && reportId) {
      loadVersions();
    }
    if (!open) {
      setSelectedVersion(null);
      setCompareMode(false);
      setCompareFrom(null);
      setDiff(null);
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

  const handleCompare = async (from: ReportVersion, to: ReportVersion) => {
    try {
      const response = await reportApi.getVersionDiff(reportId, from.version, to.version);
      setDiff(response.data);
    } catch (error) {
      console.error('Failed to compare versions:', error);
    }
  };

  const handleSelectForCompare = (version: ReportVersion) => {
    if (!compareFrom) {
      setCompareFrom(version);
    } else {
      handleCompare(compareFrom, version);
      setCompareMode(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{t('report.history')}</span>
            <Button
              variant={compareMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => {
                setCompareMode(!compareMode);
                setCompareFrom(null);
                setDiff(null);
              }}
            >
              <GitCompare className="mr-1.5 h-3.5 w-3.5" />
              {compareMode ? '选择第二版本...' : '版本对比'}
            </Button>
          </DialogTitle>
        </DialogHeader>

        {diff ? (
          /* Diff view */
          <div className="space-y-4 min-h-[300px] max-h-[500px] overflow-y-auto">
            <div className="flex items-center gap-2 text-sm p-3 bg-muted rounded-md">
              <span className="font-medium">v{diff.from.version}</span>
              <StatusBadge status={diff.from.status} />
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium">v{diff.to.version}</span>
              <StatusBadge status={diff.to.status} />
            </div>

            <div className="space-y-2">
              {Object.entries(diff.diff).map(([key, value]) => (
                <div key={key} className="rounded border p-3">
                  <div className="text-xs font-medium text-muted-foreground mb-1 uppercase">
                    {key}
                  </div>
                  {value.changed ? (
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="rounded bg-red-50 dark:bg-red-950/20 p-2">
                        <div className="text-xs text-red-600 dark:text-red-400 mb-1">旧值</div>
                        <div className="whitespace-pre-wrap break-words">
                          {typeof value.old === 'object' ? JSON.stringify(value.old, null, 2) : String(value.old ?? '-')}
                        </div>
                      </div>
                      <div className="rounded bg-green-50 dark:bg-green-950/20 p-2">
                        <div className="text-xs text-green-600 dark:text-green-400 mb-1">新值</div>
                        <div className="whitespace-pre-wrap break-words">
                          {typeof value.new === 'object' ? JSON.stringify(value.new, null, 2) : String(value.new ?? '-')}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-muted-foreground">无变更</div>
                  )}
                </div>
              ))}
            </div>

            <Button variant="outline" size="sm" onClick={() => setDiff(null)}>
              返回版本列表
            </Button>
          </div>
        ) : (
          /* Version list view */
          <div className="grid grid-cols-[220px_1fr] gap-4 min-h-[300px]">
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
                    } ${compareFrom?.id === version.id ? 'bg-blue-50 dark:bg-blue-950/30 ring-1 ring-blue-300' : ''}`}
                    onClick={() => {
                      if (compareMode) {
                        handleSelectForCompare(version);
                      } else {
                        setSelectedVersion(version);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3 text-muted-foreground" />
                      <span className="text-xs text-muted-foreground">
                        {new Date(version.createdAt).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs font-medium">v{version.version}</span>
                      <StatusBadge status={version.status} />
                    </div>
                    {version.changeNotes && (
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {version.changeNotes}
                      </p>
                    )}
                  </button>
                ))
              )}
            </div>

            {/* Version detail */}
            <div className="border rounded-md p-4 overflow-y-auto max-h-[400px]">
              {selectedVersion ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FileText className="h-4 w-4" />
                      <span>版本 {selectedVersion.version}</span>
                    </div>
                    <StatusBadge status={selectedVersion.status} />
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {new Date(selectedVersion.createdAt).toLocaleString('zh-CN')}
                  </div>
                  {selectedVersion.changeNotes && (
                    <div className="rounded bg-muted p-2 text-sm">
                      <span className="text-xs font-medium">变更说明: </span>
                      {selectedVersion.changeNotes}
                    </div>
                  )}
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">{t('report.conclusion')}</h4>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-2">
                      {selectedVersion.content?.conclusion || '-'}
                    </p>
                  </div>
                  <div className="space-y-2">
                    <h4 className="font-medium text-sm">{t('report.notes')}</h4>
                    <p className="text-sm whitespace-pre-wrap bg-muted/50 rounded p-2">
                      {selectedVersion.content?.notes || '-'}
                    </p>
                  </div>
                  {selectedVersion.images && selectedVersion.images.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="font-medium text-sm">包含图像 ({selectedVersion.images.length})</h4>
                      <div className="flex flex-wrap gap-1">
                        {selectedVersion.images.map((img, i) => (
                          <span key={i} className="text-xs bg-muted rounded px-2 py-0.5">
                            {typeof img === 'string' ? img.slice(0, 12) + '...' : JSON.stringify(img).slice(0, 20)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : compareMode ? (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  {compareFrom ? '选择第二个版本进行对比' : '选择第一个版本开始对比'}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground text-sm">
                  选择一个版本查看详情
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('report.cancel') || '关闭'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
