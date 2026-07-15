import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAIStore } from '@/stores/aiStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  detectRetinalDisease,
  segmentOpticDisc,
  segmentVessels,
  generateHeatmap,
  applyHeatmapOverlay,
  exportDetectionResult,
  type DetectionResult,
  type LesionClass,
} from '@/lib/ai/detection';
import { getImageData } from '@/lib/ai/segmentation';
import { Brain, Download, Eye, EyeOff, AlertCircle } from 'lucide-react';

interface DetectionPanelProps {
  sourceImage: HTMLImageElement | HTMLCanvasElement | null;
  onResult?: (result: DetectionResult) => void;
}

const LESION_LABELS: Record<LesionClass, string> = {
  optic_disc: '视盘',
  optic_cup: '视杯',
  retinal_vessel: '视网膜血管',
  microaneurysm: '微动脉瘤',
  hemorrhage: '出血',
  hard_exudate: '硬性渗出',
  soft_exudate: '软性渗出',
  neovascularization: '新生血管',
  normal: '正常',
};

const LESION_COLORS: Record<LesionClass, string> = {
  optic_disc: 'text-blue-500',
  optic_cup: 'text-purple-500',
  retinal_vessel: 'text-green-500',
  microaneurysm: 'text-red-500',
  hemorrhage: 'text-red-600',
  hard_exudate: 'text-yellow-500',
  soft_exudate: 'text-orange-500',
  neovascularization: 'text-pink-500',
  normal: 'text-gray-500',
};

export function DetectionPanel({ sourceImage, onResult }: DetectionPanelProps) {
  useTranslation();
  const {
    detectionConfig,
    detectionResult,
    isDetecting,
    showOverlay,
    overlayOpacity,
    selectedPrediction,
    isInitialized,
    setDetectionConfig,
    setDetectionResult,
    setDetecting,
    toggleOverlay,
    setOverlayOpacity,
    setSelectedPrediction,
    addToHistory,
    initialize,
  } = useAIStore();

  const [error, setError] = useState<string | null>(null);

  // Initialize TensorFlow on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const handleDetect = useCallback(async () => {
    if (!sourceImage) return;

    setDetecting(true);
    setError(null);

    try {
      let result: DetectionResult;

      switch (detectionConfig.model) {
        case 'retinal_disease':
          result = await detectRetinalDisease(sourceImage);
          break;
        case 'optic_disc':
          const discResult = await segmentOpticDisc(sourceImage);
          // Convert to DetectionResult format
          const imageData = getImageData(sourceImage);
          const heatmap = generateHeatmap(imageData, {
            colormap: detectionConfig.colormap,
            opacity: detectionConfig.heatmapOpacity,
            threshold: detectionConfig.heatmapThreshold,
          });
          result = {
            predictions: [
              {
                label: '视盘',
                confidence: 0.95,
                bounds: discResult.discBounds,
                class: 'optic_disc',
              },
              {
                label: '视杯',
                confidence: 0.9,
                bounds: discResult.cupBounds,
                class: 'optic_cup',
              },
            ],
            heatmap,
            overlay: applyHeatmapOverlay(imageData, heatmap),
            processingTime: discResult.processingTime,
            modelUsed: 'optic_disc',
          };
          break;
        case 'vessel':
          const vesselResult = await segmentVessels(sourceImage);
          const vesselImageData = getImageData(sourceImage);
          const vesselHeatmap = generateHeatmap(vesselImageData, {
            colormap: detectionConfig.colormap,
            opacity: detectionConfig.heatmapOpacity,
            threshold: detectionConfig.heatmapThreshold,
          });
          result = {
            predictions: [
              {
                label: '视网膜血管',
                confidence: 0.85,
                bounds: { x: 0, y: 0, width: 0, height: 0 },
                class: 'retinal_vessel',
              },
            ],
            heatmap: vesselHeatmap,
            overlay: applyHeatmapOverlay(vesselImageData, vesselHeatmap),
            processingTime: vesselResult.processingTime,
            modelUsed: 'vessel',
          };
          break;
        default:
          throw new Error('Unknown detection model');
      }

      setDetectionResult(result);
      addToHistory({ type: 'detection', result });
      onResult?.(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Detection failed';
      setError(message);
      console.error('Detection failed:', err);
    } finally {
      setDetecting(false);
    }
  }, [
    sourceImage,
    detectionConfig,
    setDetecting,
    setDetectionResult,
    addToHistory,
    onResult,
  ]);

  const handleExport = useCallback(() => {
    if (!detectionResult) return;

    const { heatmapUrl, overlayUrl } = exportDetectionResult(detectionResult);

    // Download heatmap
    const heatmapLink = document.createElement('a');
    heatmapLink.href = heatmapUrl;
    heatmapLink.download = 'detection_heatmap.png';
    heatmapLink.click();

    // Download overlay
    setTimeout(() => {
      const overlayLink = document.createElement('a');
      overlayLink.href = overlayUrl;
      overlayLink.download = 'detection_overlay.png';
      overlayLink.click();
    }, 100);
  }, [detectionResult]);

  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'text-green-500';
    if (confidence >= 0.6) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Brain className="h-4 w-4" />
          AI 检测
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Model Selection */}
        <div className="space-y-2">
          <Label>检测模型</Label>
          <div className="grid grid-cols-3 gap-2">
            {(['retinal_disease', 'optic_disc', 'vessel'] as const).map((model) => (
              <Button
                key={model}
                variant={detectionConfig.model === model ? 'default' : 'outline'}
                size="sm"
                onClick={() => setDetectionConfig({ model })}
              >
                {model === 'retinal_disease'
                  ? '眼底病变'
                  : model === 'optic_disc'
                  ? '视盘/杯'
                  : '血管'}
              </Button>
            ))}
          </div>
        </div>

        {/* Heatmap Configuration */}
        <div className="space-y-3">
          <Label>热力图设置</Label>
          
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>透明度</span>
              <span>{Math.round(detectionConfig.heatmapOpacity * 100)}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={detectionConfig.heatmapOpacity}
              onChange={(e) =>
                setDetectionConfig({ heatmapOpacity: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>阈值</span>
              <span>{detectionConfig.heatmapThreshold.toFixed(1)}</span>
            </div>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={detectionConfig.heatmapThreshold}
              onChange={(e) =>
                setDetectionConfig({ heatmapThreshold: Number(e.target.value) })
              }
              className="w-full"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-xs">颜色映射</Label>
            <div className="grid grid-cols-4 gap-1">
              {(['jet', 'hot', 'viridis', 'plasma'] as const).map((colormap) => (
                <Button
                  key={colormap}
                  variant={detectionConfig.colormap === colormap ? 'default' : 'outline'}
                  size="sm"
                  className="text-xs"
                  onClick={() => setDetectionConfig({ colormap })}
                >
                  {colormap}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <Button
          onClick={handleDetect}
          disabled={!sourceImage || isDetecting || !isInitialized}
          className="w-full"
        >
          {isDetecting ? '检测中...' : !isInitialized ? '加载模型...' : '开始检测'}
        </Button>

        {/* Error Display */}
        {error && (
          <div className="flex items-center gap-2 p-2 text-sm text-red-500 bg-red-50 rounded">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        )}

        {/* Results */}
        {detectionResult && (
          <div className="space-y-3 pt-3 border-t">
            {/* Model Info */}
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">模型:</span>
              <span className="font-medium">{detectionResult.modelUsed}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">处理时间:</span>
              <span className="font-medium">
                {detectionResult.processingTime.toFixed(0)}ms
              </span>
            </div>

            {/* Predictions */}
            {detectionResult.predictions.length > 0 && (
              <div className="space-y-2">
                <Label>检测结果</Label>
                <div className="space-y-1">
                  {detectionResult.predictions.map((pred, index) => (
                    <div
                      key={index}
                      className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                        selectedPrediction === index
                          ? 'bg-primary/10'
                          : 'hover:bg-muted'
                      }`}
                      onClick={() => setSelectedPrediction(index)}
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            pred.confidence >= 0.8
                              ? 'bg-green-500'
                              : pred.confidence >= 0.6
                              ? 'bg-yellow-500'
                              : 'bg-red-500'
                          }`}
                        />
                        <span className={`text-sm ${LESION_COLORS[pred.class]}`}>
                          {LESION_LABELS[pred.class]}
                        </span>
                      </div>
                      <span
                        className={`text-sm font-medium ${getConfidenceColor(
                          pred.confidence
                        )}`}
                      >
                        {(pred.confidence * 100).toFixed(1)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Visualization Controls */}
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={toggleOverlay}>
                {showOverlay ? (
                  <Eye className="h-4 w-4" />
                ) : (
                  <EyeOff className="h-4 w-4" />
                )}
              </Button>

              <div className="flex-1 space-y-1">
                <div className="flex justify-between text-xs">
                  <span>叠加透明度</span>
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

            {/* Export Button */}
            <Button variant="outline" size="sm" onClick={handleExport} className="w-full">
              <Download className="h-4 w-4 mr-1" />
              导出结果
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
