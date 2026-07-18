import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface PatientCardProps {
  patient: Patient;
  selected?: boolean;
  onClick: (patientId: string) => void;
  showLastStudy?: boolean;
}

export function PatientCard({
  patient,
  selected = false,
  onClick,
  showLastStudy = true,
}: PatientCardProps) {
  const age = patient.birthDate
    ? new Date().getFullYear() - new Date(patient.birthDate).getFullYear()
    : null;

  const genderLabel =
    patient.gender === 'male' ? '男' : patient.gender === 'female' ? '女' : null;

  return (
    <button
      type="button"
      onClick={() => onClick(patient.id)}
      className={cn(
        'w-full text-left px-3 py-2 rounded-md transition-colors',
        'hover:bg-accent focus:outline-none focus:bg-accent',
        selected && 'bg-accent'
      )}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Check
            className={cn(
              'h-4 w-4 shrink-0',
              selected ? 'opacity-100 text-primary' : 'opacity-0'
            )}
          />
          <span className="font-medium truncate">{patient.name}</span>
        </div>
        {patient.mrn && (
          <span className="text-xs text-muted-foreground shrink-0 ml-2">
            {patient.mrn}
          </span>
        )}
      </div>
      <div className="ml-6 text-xs text-muted-foreground">
        {[genderLabel, age && `${age}岁`].filter(Boolean).join(' · ')}
        {showLastStudy && patient.lastStudy?.studyDate && (
          <span className="ml-2">最近就诊: {patient.lastStudy.studyDate}</span>
        )}
      </div>
    </button>
  );
}
