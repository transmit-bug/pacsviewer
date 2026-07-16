import { useViewerStore } from '@/stores/viewerStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

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
        <Button
          key={image.id}
          variant="outline"
          className={cn(
            'relative aspect-square overflow-hidden p-0 h-auto w-auto',
            currentImageId === image.id
              ? 'border-primary ring-2 ring-primary'
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
        </Button>
      ))}
    </div>
  );
}
