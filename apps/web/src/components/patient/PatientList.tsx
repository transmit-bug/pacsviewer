import { Loader2, Users } from 'lucide-react';
import { PatientCard } from './PatientCard';
import { cn } from '@/lib/utils';
import type { Patient } from '@/hooks/usePatientSearch';

interface PatientListProps {
  patients: Patient[];
  selectedId?: string;
  onSelect: (patientId: string) => void;
  loading?: boolean;
  emptyMessage?: string;
  maxHeight?: string;
}

export function PatientList({
  patients,
  selectedId,
  onSelect,
  loading = false,
  emptyMessage = '暂无患者数据',
  maxHeight = 'max-h-64',
}: PatientListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin mr-2 text-muted-foreground" />
        <span className="text-sm text-muted-foreground">搜索中...</span>
      </div>
    );
  }

  if (patients.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Users className="h-8 w-8 mb-2" />
        <p className="text-sm">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={cn('overflow-y-auto', maxHeight)}>
      <div className="space-y-0.5">
        {patients.map((patient) => (
          <PatientCard
            key={patient.id}
            patient={patient}
            selected={selectedId === patient.id}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
