/**
 * ImageViewer — delegates to CornerstoneViewport for medical image rendering.
 *
 * This component wraps CornerstoneViewport and provides the application-level
 * integration (loading state, error handling, etc.)
 */

import { CornerstoneViewport } from './CornerstoneViewport';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  imageId: string;
  imageFormat?: string;  // 'dicom' | 'jpeg' | 'png' etc.
  className?: string;
}

export function ImageViewer({ imageId, imageFormat, className }: ImageViewerProps) {
  const { t } = useTranslation();
  if (!imageId) {
    return (
      <div className={cn('flex items-center justify-center w-full h-full bg-black', className)}>
        <p className="text-white/50 text-sm">{t('viewer.header.selectImage')}</p>
      </div>
    );
  }

  return <CornerstoneViewport imageId={imageId} imageFormat={imageFormat} className={className} />;
}
