import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';

interface ReviewNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onConfirm: (notes: string) => void;
  confirmLabel?: string;
  showNotes?: boolean;
}

export function ReviewNotesDialog({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  confirmLabel,
  showNotes = true,
}: ReviewNotesDialogProps) {
  const { t } = useTranslation();
  const [notes, setNotes] = useState('');

  const handleConfirm = () => {
    onConfirm(notes);
    setNotes('');
    onOpenChange(false);
  };

  const handleCancel = () => {
    setNotes('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {showNotes && (
          <div className="space-y-2">
            <Label>{t('report.reviewNotes')}</Label>
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[100px] resize-y"
              placeholder={t('report.reviewNotesPlaceholder')}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={handleCancel}>
            {t('report.cancel')}
          </Button>
          <Button onClick={handleConfirm}>
            {confirmLabel || t('report.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
