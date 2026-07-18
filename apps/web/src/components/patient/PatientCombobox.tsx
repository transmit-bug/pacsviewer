import { useState, useEffect, useCallback } from 'react';
import { Check, ChevronsUpDown, X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { usePatientSearch } from '@/hooks/usePatientSearch';

interface Patient {
  id: string;
  mrn: string;
  name: string;
  gender?: string;
  birthDate?: string;
  lastStudy?: {
    studyDate: string;
    modality?: string;
  };
}

interface PatientComboboxProps {
  value?: string;
  onChange: (patientId: string) => void;
  disabled?: boolean;
  placeholder?: string;
  error?: string;
  patients?: Patient[]; // 外部传入的患者列表（兼容）
}

export function PatientCombobox({
  value,
  onChange,
  disabled = false,
  placeholder = '选择患者...',
  error,
  patients: externalPatients,
}: PatientComboboxProps) {
  const [open, setOpen] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  const {
    patients: searchResults,
    loading,
    search,
    loadRecent,
    recentPatients,
    recentLoading,
  } = usePatientSearch();

  // 合并外部传入的患者和搜索结果
  const displayPatients = searchResults.length > 0 
    ? searchResults 
    : (externalPatients || recentPatients);

  // 初始加载最近患者
  useEffect(() => {
    if (!externalPatients) {
      loadRecent();
    }
  }, [externalPatients, loadRecent]);

  // 当 value 变化时，查找对应的患者
  useEffect(() => {
    if (!value) {
      setSelectedPatient(null);
      return;
    }
    
    // 在已有列表中查找
    const found = displayPatients.find(p => p.id === value);
    if (found) {
      setSelectedPatient(found);
    } else if (externalPatients) {
      const foundExternal = externalPatients.find(p => p.id === value);
      if (foundExternal) setSelectedPatient(foundExternal);
    }
  }, [value, displayPatients, externalPatients]);

  // 处理选择
  const handleSelect = useCallback((patientId: string) => {
    const patient = displayPatients.find(p => p.id === patientId);
    setSelectedPatient(patient || null);
    onChange(patientId);
    setOpen(false);
  }, [displayPatients, onChange]);

  // 清除选择
  const handleClear = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedPatient(null);
    onChange('');
  }, [onChange]);

  // 格式化患者显示文本
  const formatPatientLabel = (patient: Patient) => {
    const parts = [patient.name];
    if (patient.mrn) parts.push(`MRN: ${patient.mrn}`);
    return parts.join(' · ');
  };

  // 格式化患者详情
  const formatPatientDetail = (patient: Patient) => {
    const parts = [];
    if (patient.gender) parts.push(patient.gender === 'male' ? '男' : patient.gender === 'female' ? '女' : patient.gender);
    if (patient.birthDate) {
      const age = new Date().getFullYear() - new Date(patient.birthDate).getFullYear();
      if (age > 0 && age < 150) parts.push(`${age}岁`);
    }
    if (patient.lastStudy?.studyDate) {
      parts.push(patient.lastStudy.studyDate);
    }
    return parts.join(' · ');
  };

  return (
    <div className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-label={placeholder}
            className={cn(
              'w-full justify-between',
              !selectedPatient && 'text-muted-foreground',
              error && 'border-destructive',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
            disabled={disabled}
          >
            <div className="flex items-center overflow-hidden">
              {selectedPatient ? (
                <span className="truncate">{formatPatientLabel(selectedPatient)}</span>
              ) : (
                <span>{placeholder}</span>
              )}
            </div>
            <div className="flex items-center gap-1">
              {selectedPatient && !disabled && (
                <X
                  className="h-4 w-4 opacity-50 hover:opacity-100"
                  onClick={handleClear}
                />
              )}
              <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
            </div>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[400px] p-0" align="start">
          <Command shouldFilter={false}>
            <CommandInput
              placeholder="搜索患者姓名、病历号或拼音..."
              onValueChange={search}
              className="h-9"
            />
            <CommandList>
              <CommandEmpty>
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span>搜索中...</span>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm">
                    未找到匹配的患者
                  </div>
                )}
              </CommandEmpty>
              
              {/* 最近就诊患者 */}
              {searchResults.length === 0 && recentPatients.length > 0 && (
                <CommandGroup heading="最近就诊">
                  {recentLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                  ) : (
                    recentPatients.map((patient) => (
                      <CommandItem
                        key={patient.id}
                        value={patient.id}
                        onSelect={() => handleSelect(patient.id)}
                        className="flex flex-col items-start py-2"
                      >
                        <div className="flex items-center w-full">
                          <Check
                            className={cn(
                              'mr-2 h-4 w-4',
                              value === patient.id ? 'opacity-100' : 'opacity-0'
                            )}
                          />
                          <span className="font-medium">{patient.name}</span>
                          {patient.mrn && (
                            <span className="ml-2 text-muted-foreground text-xs">
                              MRN: {patient.mrn}
                            </span>
                          )}
                        </div>
                        {formatPatientDetail(patient) && (
                          <span className="text-xs text-muted-foreground ml-6">
                            {formatPatientDetail(patient)}
                          </span>
                        )}
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
              )}

              {/* 搜索结果 */}
              {searchResults.length > 0 && (
                <CommandGroup heading={`搜索结果 (${searchResults.length})`}>
                  {searchResults.map((patient) => (
                    <CommandItem
                      key={patient.id}
                      value={patient.id}
                      onSelect={() => handleSelect(patient.id)}
                      className="flex flex-col items-start py-2"
                    >
                      <div className="flex items-center w-full">
                        <Check
                          className={cn(
                            'mr-2 h-4 w-4',
                            value === patient.id ? 'opacity-100' : 'opacity-0'
                          )}
                        />
                        <span className="font-medium">{patient.name}</span>
                        {patient.mrn && (
                          <span className="ml-2 text-muted-foreground text-xs">
                            MRN: {patient.mrn}
                          </span>
                        )}
                      </div>
                      {formatPatientDetail(patient) && (
                        <span className="text-xs text-muted-foreground ml-6">
                          {formatPatientDetail(patient)}
                        </span>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && (
        <p className="mt-1 text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}
