/**
 * ImageViewer — delegates to CornerstoneViewport for medical image rendering.
 *
 * This component wraps CornerstoneViewport and provides the application-level
 * integration (loading state, error handling, etc.)
 */

import { CornerstoneViewport } from './CornerstoneViewport';
import { cn } from '@/lib/utils';

interface ImageViewerProps {
  imageId: string;
  className?: string;
}

export function ImageViewer({ imageId, className }: ImageViewerProps) {
  if (!imageId) {
    return (
      <div className={cn('flex items-center justify-center w-full h-full bg-black', className)}>
        <p className="text-white/50 text-sm">选择图像以查看</p>
      </div>
    );
  }

  return <CornerstoneViewport imageId={imageId} className={className} />;
}
