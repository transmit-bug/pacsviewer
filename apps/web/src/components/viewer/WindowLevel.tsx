import { useViewerStore } from '@/stores/viewerStore';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';

interface WindowLevelProps {
  className?: string;
}

const PRESETS = [
  { label: '默认', windowWidth: 400, windowLevel: 40 },
  { label: '肺窗', windowWidth: 2000, windowLevel: 0 },
  { label: '腹部', windowWidth: 350, windowLevel: 40 },
  { label: '脑窗', windowWidth: 80, windowLevel: 40 },
] as const;

export function WindowLevel({ className }: WindowLevelProps) {
  const { viewport, setViewport } = useViewerStore();

  return (
    <div className={className}>
      <div className="space-y-4">
        <div>
          <div className="flex justify-between text-sm mb-1">
            <Label>窗宽</Label>
            <span className="text-muted-foreground">{viewport.windowWidth}</span>
          </div>
          <Slider
            min={1}
            max={4096}
            step={1}
            value={[viewport.windowWidth]}
            onValueChange={([val]) => setViewport({ windowWidth: val })}
          />
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <Label>窗位</Label>
            <span className="text-muted-foreground">{viewport.windowLevel}</span>
          </div>
          <Slider
            min={-1024}
            max={3072}
            step={1}
            value={[viewport.windowLevel]}
            onValueChange={([val]) => setViewport({ windowLevel: val })}
          />
        </div>
        <div className="flex space-x-2">
          {PRESETS.map((preset) => (
            <Button
              key={preset.label}
              variant={
                viewport.windowWidth === preset.windowWidth &&
                viewport.windowLevel === preset.windowLevel
                  ? 'default'
                  : 'secondary'
              }
              size="sm"
              className="flex-1"
              onClick={() =>
                setViewport({
                  windowWidth: preset.windowWidth,
                  windowLevel: preset.windowLevel,
                })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
