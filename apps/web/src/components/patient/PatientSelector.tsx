import { useState, useCallback, useEffect } from 'react';
import { X, User } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PatientSearchInput } from './PatientSearchInput';
import { PatientList } from './PatientList';
import { usePatientSearch } from '@/hooks/usePatientSearch';
import { cn } from '@/lib/utils';

interface PatientSelectorProps {
  value?: string;
  onChange: (patientId: string) => void;
  disabled?: boolean;
  error?: string;
}

export function PatientSelector({
  value,
  onChange,
  disabled = false,
  error,
}: PatientSelectorProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const {
    patients: searchResults,
    loading: searchLoading,
    search,
    loadRecent,
    recentPatients,
    recentLoading,
  } = usePatientSearch();

  // 获取当前选中的患者信息
  const selectedPatient = value
    ? [...searchResults, ...recentPatients].find((p) => p.id === value)
    : null;

  useEffect(() => {
    loadRecent();
  }, [loadRecent]);

  const handleSearch = useCallback(
    (query: string) => {
      if (query.trim()) {
        search(query);
      }
    },
    [search]
  );

  const handleSelect = useCallback(
    (patientId: string) => {
      onChange(patientId);
      setIsExpanded(false);
      setSearchQuery('');
    },
    [onChange]
  );

  const handleClear = useCallback(() => {
    onChange('');
    setSearchQuery('');
  }, [onChange]);

  // 显示的患者列表：有搜索词显示搜索结果，否则显示最近就诊
  const displayPatients = searchQuery.trim() ? searchResults : recentPatients;
  const isLoading = searchQuery.trim() ? searchLoading : recentLoading;

  // 已选状态 - 卡片展示
  if (selectedPatient && !isExpanded) {
    return (
      <div className="space-y-2">
        <Card
          className={cn(
            'cursor-pointer hover:border-primary/50 transition-colors',
            error && 'border-destructive'
          )}
          onClick={() => !disabled && setIsExpanded(true)}
        >
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{selectedPatient.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedPatient.mrn}
                    {selectedPatient.gender && (
                      <span>
                        {' · '}
                        {selectedPatient.gender === 'male' ? '男' : '女'}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              {!disabled && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleClear();
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  // 展开状态 - 搜索 + 列表
  return (
    <div className="space-y-2">
      <Card className={cn(error && 'border-destructive')}>
        <CardContent className="p-3 space-y-3">
          <PatientSearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            onSearch={handleSearch}
            loading={isLoading}
            disabled={disabled}
            autoFocus
          />

          <div className="text-xs text-muted-foreground px-1">
            {searchQuery.trim() ? '搜索结果' : '最近就诊'}
          </div>

          <PatientList
            patients={displayPatients}
            selectedId={value}
            onSelect={handleSelect}
            loading={isLoading}
            emptyMessage={
              searchQuery.trim() ? '未找到匹配的患者' : '暂无最近就诊记录'
            }
            maxHeight="max-h-48"
          />
        </CardContent>
      </Card>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
