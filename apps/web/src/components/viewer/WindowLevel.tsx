import { useViewerStore } from '@/stores/viewerStore';
import { Label } from '@/components/ui/label';

interface WindowLevelProps {
  className?: string;
}

export function WindowLevel({ className }: WindowLevelProps) {
  const { viewport, setViewport } = useViewerStore();

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <Label>窗宽</Label>
            <span>{viewport.windowWidth}</span>
          </div>
          <input
            type="range"
            className="w-full"
            min="1"
            max="4096"
            value={viewport.windowWidth}
            onChange={(e) =>
              setViewport({ windowWidth: Number(e.target.value) })
            }
          />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <Label>窗位</Label>
            <span>{viewport.windowLevel}</span>
          </div>
          <input
            type="range"
            className="w-full"
            min="-1024"
            max="3072"
            value={viewport.windowLevel}
            onChange={(e) =>
              setViewport({ windowLevel: Number(e.target.value) })
            }
          />
        </div>
        <div className="flex space-x-2">
          <button
            className="flex-1 rounded bg-primary px-2 py-1 text-xs text-primary-foreground"
            onClick={() => setViewport({ windowWidth: 400, windowLevel: 40 })}
          >
            默认
          </button>
          <button
            className="flex-1 rounded bg-secondary px-2 py-1 text-xs"
            onClick={() => setViewport({ windowWidth: 2000, windowLevel: 0 })}
          >
            肺窗
          </button>
          <button
            className="flex-1 rounded bg-secondary px-2 py-1 text-xs"
            onClick={() => setViewport({ windowWidth: 350, windowLevel: 40 })}
          >
            腹部
          </button>
          <button
            className="flex-1 rounded bg-secondary px-2 py-1 text-xs"
            onClick={() => setViewport({ windowWidth: 80, windowLevel: 40 })}
          >
            脑窗
          </button>
        </div>
      </div>
    </div>
  );
}
