/**
 * VisualFieldViewer — visual field test result viewer.
 *
 * Renders grayscale, total deviation, and pattern deviation maps.
 * Supports 30-2 and 24-2 test patterns with side-by-side comparison.
 */

import { useRef, useEffect, useState, useCallback } from 'react';
import {
  renderVisualField,
  generateDemoVisualFieldData,
  type MapType,
  type TestPattern,
  type VisualFieldData,
} from '@/lib/visual-field';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Download } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VisualFieldViewerProps {
  data?: VisualFieldData;
  size?: number;
  className?: string;
}

const MAP_TYPES: { id: MapType; label: string }[] = [
  { id: 'grayscale', label: '灰度图' },
  { id: 'total-deviation', label: '总偏差' },
  { id: 'pattern-deviation', label: '模式偏差' },
];

const TEST_PATTERNS: { id: TestPattern; label: string }[] = [
  { id: '30-2', label: '30-2' },
  { id: '24-2', label: '24-2' },
];

export function VisualFieldViewer({ data: externalData, size = 320, className }: VisualFieldViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mapType, setMapType] = useState<MapType>('grayscale');
  const [testPattern, setTestPattern] = useState<TestPattern>('30-2');
  const [demoData, setDemoData] = useState<VisualFieldData>(() => generateDemoVisualFieldData('30-2'));

  const currentData = externalData ?? demoData;

  // Regenerate demo data when pattern changes
  useEffect(() => {
    if (!externalData) {
      setDemoData(generateDemoVisualFieldData(testPattern));
    }
  }, [testPattern, externalData]);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentData) return;

    renderVisualField({
      canvas,
      data: currentData,
      mapType,
      size,
    });
  }, [currentData, mapType, size]);

  useEffect(() => {
    render();
  }, [render]);

  const handleExport = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `visual-field-${currentData.eye}-${mapType}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className={cn('flex flex-col gap-3', className)}>
      {/* Controls */}
      <div className="flex items-center gap-2 flex-wrap">
        {/* Test pattern */}
        <div className="flex gap-1">
          {TEST_PATTERNS.map((tp) => (
            <Button
              key={tp.id}
              variant={testPattern === tp.id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setTestPattern(tp.id)}
            >
              {tp.label}
            </Button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Map type */}
        <div className="flex gap-1">
          {MAP_TYPES.map((mt) => (
            <Button
              key={mt.id}
              variant={mapType === mt.id ? 'default' : 'outline'}
              size="sm"
              className="h-7 text-xs"
              onClick={() => setMapType(mt.id)}
            >
              {mt.label}
            </Button>
          ))}
        </div>

        <div className="h-5 w-px bg-border" />

        {/* Export */}
        <Button variant="ghost" size="sm" className="h-7" onClick={handleExport}>
          <Download className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Map */}
      <Card>
        <CardContent className="p-3 flex justify-center">
          <canvas ref={canvasRef} className="rounded-md" />
        </CardContent>
      </Card>

      {/* Global Indices */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">全局指标</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold font-mono">{currentData.md.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">MD (dB)</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{currentData.psd.toFixed(2)}</p>
              <p className="text-xs text-muted-foreground">PSD (dB)</p>
            </div>
            <div>
              <p className="text-2xl font-bold font-mono">{currentData.vfi.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">VFI</p>
            </div>
          </div>

          {/* Reliability */}
          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-muted-foreground mb-1">可靠性</p>
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="flex justify-between">
                <span>固视丢失</span>
                <span className="font-mono">{(currentData.reliability.fixationLoss * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>假阳性</span>
                <span className="font-mono">{(currentData.reliability.falsePositives * 100).toFixed(0)}%</span>
              </div>
              <div className="flex justify-between">
                <span>假阴性</span>
                <span className="font-mono">{(currentData.reliability.falseNegatives * 100).toFixed(0)}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
