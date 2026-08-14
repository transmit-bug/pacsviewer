import { Check, Calendar } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import { isDemoPatient } from '@/lib/demo';
import type { Patient } from '@/hooks/usePatientSearch';

interface PatientCardProps {
  patient: Patient;
  selected?: boolean;
  onClick: (patientId: string) => void;
}

export function PatientCard({ patient, selected = false, onClick }: PatientCardProps) {
  const { t } = useTranslation();
  const age = patient.birthDate
    ? new Date().getFullYear() - new Date(patient.birthDate).getFullYear()
    : null;

  const genderLabel =
    patient.gender === 'male' ? t('patient.male') : patient.gender === 'female' ? t('patient.female') : null;

  const detailParts = [genderLabel, age && t('patient.age', { count: age })].filter(Boolean);

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
          {isDemoPatient(patient) && (
            <span className="shrink-0 rounded-full border border-brand-400/30 bg-brand-400/10 px-1.5 py-px text-[10px] font-medium leading-4 text-brand-300">
              {t('demo.badge')}
            </span>
          )}
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
          <span>{t('patient.lastVisit')}: {patient.lastStudy.studyDate}</span>
        </div>
      )}
    </button>
  );
}
