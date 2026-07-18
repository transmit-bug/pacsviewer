import { Check, Calendar } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Patient } from '@/hooks/usePatientSearch';

interface PatientCardProps {
  patient: Patient;
  selected?: boolean;
  onClick: (patientId: string) => void;
}

export function PatientCard({ patient, selected = false, onClick }: PatientCardProps) {
  const age = patient.birthDate
    ? new Date().getFullYear() - new Date(patient.birthDate).getFullYear()
    : null;

  const genderLabel =
    patient.gender === 'male' ? '男' : patient.gender === 'female' ? '女' : null;

  const detailParts = [genderLabel, age && `${age}岁`].filter(Boolean);

  return (
    <button
      type="button"
      onClick={() => onClick(patient.id)}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-md transition-colors',
        'hover:bg-accent focus:outline-none focus:bg-accent',
        selected && 'bg-accent border border-primary/20'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <Check
            className={cn(
              'h-4 w-4 shrink-0',
              selected ? 'opacity-100 text-primary' : 'opacity-0'
            )}
          />
          <span className="font-medium truncate">{patient.name}</span>
          {detailParts.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {detailParts.join(' · ')}
            </span>
          )}
        </div>
        <span className="text-xs text-muted-foreground shrink-0">
          {patient.mrn}
        </span>
      </div>
      {patient.lastStudy?.studyDate && (
        <div className="ml-6 mt-1 flex items-center gap-1 text-xs text-muted-foreground">
          <Calendar className="h-3 w-3" />
          <span>最近就诊: {patient.lastStudy.studyDate}</span>
        </div>
      )}
    </button>
  );
}
