import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';

interface ImageListProps {
  images: Array<{
    id: string;
    thumbnailPath?: string;
    instanceNumber: number;
  }>;
  className?: string;
}

export function ImageList({ images, className }: ImageListProps) {
  const { currentImageId, setCurrentImage } = useViewerStore();

  return (
    <div className={cn('grid grid-cols-3 gap-1 p-2', className)}>
      {images.map((image) => (
        <button
          key={image.id}
          className={cn(
            'relative aspect-square overflow-hidden rounded border-2 transition-colors',
            currentImageId === image.id
              ? 'border-primary'
              : 'border-transparent hover:border-primary/50'
          )}
          onClick={() => setCurrentImage(image.id)}
        >
          {image.thumbnailPath ? (
            <img
              src={image.thumbnailPath}
              alt={`Image ${image.instanceNumber}`}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-muted text-xs text-muted-foreground">
              {image.instanceNumber}
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
