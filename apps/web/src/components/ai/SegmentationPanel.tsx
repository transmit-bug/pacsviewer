import { useState, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '@/stores/aiStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  thresholdSegmentation,
  regionGrowingSegmentation,
  edgeBasedSegmentation,
  autoThreshold,
  exportMaskAsDataUrl,
  invertMask,
  getImageData,
  type SegmentationResult,
} from '@/lib/ai/segmentation';
import { Layers, Download, RotateCcw, Eye, EyeOff } from 'lucide-react';

interface SegmentationPanelProps {
  sourceImage: HTMLImageElement | HTMLCanvasElement | null;
  onResult?: (result: SegmentationResult) => void;
}

export function SegmentationPanel({ sourceImage, onResult }: SegmentationPanelProps) {
  useTranslation();
  const {
    segmentationConfig,
    segmentationResult,
    isSegmenting,
    showOverlay,
    overlayOpacity,
    setSegmentationConfig,
    setSegmentationResult,
    setSegmenting,
    toggleOverlay,
    setOverlayOpacity,
    addToHistory,
  } = useAIStore();

  const [seedPoint, setSeedPoint] = useState<{ x: number; y: number } | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleSegment = useCallback(async () => {
    if (!sourceImage) return;

    setSegmenting(true);
    try {
      const imageData = getImageData(sourceImage);
      let result: SegmentationResult;

      switch (segmentationConfig.method) {
        case 'threshold':
          if (segmentationConfig.autoThreshold) {
            const threshold = autoThreshold(imageData);
            result = thresholdSegmentation(imageData, {
              min: 0,
              max: threshold,
            });
          } else {
            result = thresholdSegmentation(imageData, {
              min: segmentationConfig.thresholdMin,
              max: segmentationConfig.thresholdMax,
            });
          }
          break;

        case 'region_growing':
          if (!seedPoint) {
            // Use center point as default seed
            setSeedPoint({
              x: Math.floor(imageData.width / 2),
              y: Math.floor(imageData.height / 2),
            });
            return;
          }
          result = regionGrowingSegmentation(imageData, {
            seedX: seedPoint.x,
            seedY: seedPoint.y,
            tolerance: segmentationConfig.tolerance,
          });
          break;

        case 'edge':
          result = edgeBasedSegmentation(imageData, {
            method: segmentationConfig.edgeMethod,
            threshold: segmentationConfig.edgeThreshold,
          });
          break;

        default:
          throw new Error('Unknown segmentation method');
      }

      setSegmentationResult(result);
      addToHistory({ type: 'segmentation', result });
      onResult?.(result);
    } catch (error) {
      console.error('Segmentation failed:', error);
    } finally {
      setSegmenting(false);
    }
  }, [sourceImage, segmentationConfig, seedPoint, setSegmenting, setSegmentationResult, addToHistory, onResult]);

  const handleCanvasClick = useCallback(
    (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (segmentationConfig.method !== 'region_growing') return;

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = Math.floor((e.clientX - rect.left) * (canvas.width / rect.width));
      const y = Math.floor((e.clientY - rect.top) * (canvas.height / rect.height));

      setSeedPoint({ x, y });
    },
    [segmentationConfig.method]
  );

  const handleExportMask = useCallback(() => {
    if (!segmentationResult) return;

    const dataUrl = exportMaskAsDataUrl(segmentationResult.mask);
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = 'segmentation_mask.png';
    link.click();
  }, [segmentationResult]);

  const handleInvertMask = useCallback(() => {
    if (!segmentationResult) return;

    const inverted = invertMask(segmentationResult.mask);
    setSegmentationResult({
      ...segmentationResult,
      mask: inverted,
    });
  }, [segmentationResult, setSegmentationResult]);

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Layers className="h-4 w-4" />
          图像分割
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Method Selection */}
        <div className="space-y-2">
          <Label>分割方法</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['threshold', 'region_growing', 'edge'] as const).map((method) => (
              <Button
                key={method}
                variant={segmentationConfig.method === method ? 'default' : 'outline'}
                size="sm"
                onClick={() => setSegmentationConfig({ method })}
              >
                {method === 'threshold' ? '阈值' : method === 'region_growing' ? '区域生长' : '边缘'}
              </Button>
            ))}
          </div>
        </div>

        {/* Method-specific controls */}
        {segmentationConfig.method === 'threshold' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>自动阈值</Label>
              <Button
                variant={segmentationConfig.autoThreshold ? 'default' : 'outline'}
                size="sm"
                onClick={() =>
                  setSegmentationConfig({ autoThreshold: !segmentationConfig.autoThreshold })
                }
              >
                {segmentationConfig.autoThreshold ? '开启' : '关闭'}
              </Button>
            </div>

            {!segmentationConfig.autoThreshold && (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>最小值</span>
                    <span>{segmentationConfig.thresholdMin}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={segmentationConfig.thresholdMin}
                    onChange={(e) =>
                      setSegmentationConfig({ thresholdMin: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span>最大值</span>
                    <span>{segmentationConfig.thresholdMax}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="255"
                    value={segmentationConfig.thresholdMax}
                    onChange={(e) =>
                      setSegmentationConfig({ thresholdMax: Number(e.target.value) })
                    }
                    className="w-full"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {segmentationConfig.method === 'region_growing' && (
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>容差</Label>
              <div className="flex justify-between text-sm">
                <span>{segmentationConfig.tolerance}</span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={segmentationConfig.tolerance}
                onChange={(e) =>
                  setSegmentationConfig({ tolerance: Number(e.target.value) })
                }
                className="w-full"
              />
            </div>

            <div className="text-sm text-muted-foreground">
              {seedPoint
                ? `种子点: (${seedPoint.x}, ${seedPoint.y})`
                : '点击图像选择种子点'}
            </div>

            {sourceImage && (
              <canvas
                ref={canvasRef}
                className="w-full border rounded cursor-crosshair"
                onClick={handleCanvasClick}
                width={sourceImage instanceof HTMLImageElement ? sourceImage.naturalWidth : sourceImage.width}
                height={sourceImage instanceof HTMLImageElement ? sourceImage.naturalHeight : sourceImage.height}
              />
            )}
          </div>
        )}

        {segmentationConfig.method === 'edge' && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>边缘检测方法</Label>
              <div className="grid grid-cols-3 gap-2">
                {(['sobel', 'prewitt', 'roberts'] as const).map((method) => (
                  <Button
                    key={method}
                    variant={segmentationConfig.edgeMethod === method ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setSegmentationConfig({ edgeMethod: method })}
                  >
                    {method.charAt(0).toUpperCase() + method.slice(1)}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>阈值</span>
                <span>{segmentationConfig.edgeThreshold}</span>
              </div>
              <input
                type="range"
                min="0"
                max="255"
                value={segmentationConfig.edgeThreshold}
                onChange={(e) =>
                  setSegmentationConfig({ edgeThreshold: Number(e.target.value) })
                }
                className="w-full"
              />
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            onClick={handleSegment}
            disabled={!sourceImage || isSegmenting}
            className="flex-1"
          >
            {isSegmenting ? '处理中...' : '开始分割'}
          </Button>
        </div>

        {/* Results */}
        {segmentationResult && (
          <div className="space-y-3 pt-3 border-t">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span className="text-muted-foreground">区域面积:</span>
                <span className="ml-1 font-medium">
                  {(segmentationResult.area * 100).toFixed(1)}%
                </span>
              </div>
              <div>
                <span className="text-muted-foreground">处理时间:</span>
                <span className="ml-1 font-medium">
                  {segmentationResult.processingTime.toFixed(0)}ms
                </span>
              </div>
            </div>

            {/* Visualization Controls */}
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={toggleOverlay}
              >
                {showOverlay ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
              </Button>

              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>透明度</span>
                  <span>{Math.round(overlayOpacity * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={overlayOpacity}
                  onChange={(e) => setOverlayOpacity(Number(e.target.value))}
                  className="w-full"
                />
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={handleInvertMask}>
                <RotateCcw className="h-4 w-4 mr-1" />
                反转
              </Button>
              <Button variant="outline" size="sm" onClick={handleExportMask}>
                <Download className="h-4 w-4 mr-1" />
                导出掩码
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
