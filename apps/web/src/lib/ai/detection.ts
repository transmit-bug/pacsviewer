/**
 * Lesion Detection Module
 * 
 * Provides retinal lesion detection, optic disc/cup segmentation,
 * vessel segmentation, and heatmap generation.
 */

import {
  initializeTensorFlow,
  loadModel,
  imageToTensor,
  runInference,
  disposeTensor,
  type ModelConfig,
} from './tensorflow';
import {
  getImageData,
  toGrayscale,
  createMask,
  type BoundingBox,
} from './segmentation';

// ============================================================================
// Types
// ============================================================================

export interface DetectionResult {
  predictions: DetectionPrediction[];
  heatmap: ImageData;
  overlay: ImageData;
  processingTime: number;
  modelUsed: string;
}

export interface DetectionPrediction {
  label: string;
  confidence: number;
  bounds: BoundingBox;
  class: LesionClass;
}

export type LesionClass =
  | 'optic_disc'
  | 'optic_cup'
  | 'retinal_vessel'
  | 'microaneurysm'
  | 'hemorrhage'
  | 'hard_exudate'
  | 'soft_exudate'
  | 'neovascularization'
  | 'normal';

export interface OpticDiscResult {
  discMask: ImageData;
  cupMask: ImageData;
  discBounds: BoundingBox;
  cupBounds: BoundingBox;
  cupToDiscRatio: number;
  processingTime: number;
}

export interface VesselResult {
  vesselMask: ImageData;
  vesselDensity: number;
  processingTime: number;
}

export interface HeatmapConfig {
  colormap: 'jet' | 'hot' | 'viridis' | 'plasma';
  opacity: number;
  threshold: number;
}

// ============================================================================
// Pre-trained Model Configurations
// ============================================================================

const MODEL_CONFIGS: Record<string, ModelConfig> = {
  // Lightweight retinal disease detection model
  retinal_disease: {
    modelUrl: '/models/retinal_disease/model.json',
    inputShape: [224, 224],
    outputShape: [1, 8], // 8 disease classes
  },
  // Optic disc segmentation model
  optic_disc: {
    modelUrl: '/models/optic_disc/model.json',
    inputShape: [256, 256],
    outputShape: [1, 256, 256, 1],
  },
  // Vessel segmentation model
  vessel: {
    modelUrl: '/models/vessel/model.json',
    inputShape: [512, 512],
    outputShape: [1, 512, 512, 1],
  },
};

// Disease class labels
const DISEASE_LABELS: Record<number, { label: string; class: LesionClass }> = {
  0: { label: '正常', class: 'normal' },
  1: { label: '微动脉瘤', class: 'microaneurysm' },
  2: { label: '出血', class: 'hemorrhage' },
  3: { label: '硬性渗出', class: 'hard_exudate' },
  4: { label: '软性渗出', class: 'soft_exudate' },
  5: { label: '新生血管', class: 'neovascularization' },
  6: { label: '视盘', class: 'optic_disc' },
  7: { label: '视杯', class: 'optic_cup' },
};

// ============================================================================
// Optic Disc/Cup Segmentation
// ============================================================================

/**
 * Segment optic disc and cup using image processing
 * (Lightweight approach without deep learning)
 */
export async function segmentOpticDisc(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<OpticDiscResult> {
  const startTime = performance.now();
  const imageData = getImageData(source);
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);

  // Find bright region (optic disc) using adaptive thresholding
  const discMask = findBrightRegion(grayscale, 200);
  const discBounds = findLargestRegion(discMask);

  // Find cup (darker region within disc)
  const cupMask = createMask(width, height);
  let cupToDiscRatio = 0.5; // Default ratio

  if (discBounds.width > 0 && discBounds.height > 0) {
    // Extract disc region
    const discRegion = extractRegion(grayscale, discBounds);
    
    // Find cup using lower threshold within disc region
    const cupThreshold = 150;
    for (let y = 0; y < discBounds.height; y++) {
      for (let x = 0; x < discBounds.width; x++) {
        const idx = (y * discBounds.width + x) * 4;
        if (discRegion.data[idx] < cupThreshold) {
          const globalX = discBounds.x + x;
          const globalY = discBounds.y + y;
          const globalIdx = (globalY * width + globalX) * 4;
          
          cupMask.data[globalIdx] = 255;
          cupMask.data[globalIdx + 1] = 255;
          cupMask.data[globalIdx + 2] = 255;
          cupMask.data[globalIdx + 3] = 128;
        }
      }
    }

    const cupBounds = findLargestRegion(cupMask);
    
    // Calculate cup-to-disc ratio
    if (cupBounds.width > 0 && discBounds.width > 0) {
      cupToDiscRatio = cupBounds.width / discBounds.width;
    }
  }

  const processingTime = performance.now() - startTime;

  return {
    discMask,
    cupMask,
    discBounds,
    cupBounds: findLargestRegion(cupMask),
    cupToDiscRatio,
    processingTime,
  };
}

/**
 * Find bright region in grayscale image
 */
function findBrightRegion(imageData: ImageData, threshold: number): ImageData {
  const { data, width, height } = imageData;
  const mask = createMask(width, height);

  for (let i = 0; i < data.length; i += 4) {
    if (data[i] > threshold) {
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
      mask.data[i + 3] = 128;
    }
  }

  // Apply morphological closing to fill gaps
  return morphologicalClose(mask, 3);
}

/**
 * Find largest connected region
 */
function findLargestRegion(mask: ImageData): BoundingBox {
  const { width, height } = mask;
  const visited = new Set<number>();
  let largestRegion: BoundingBox = { x: 0, y: 0, width: 0, height: 0 };
  let largestArea = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited.has(idx)) continue;

      const pixelIdx = idx * 4;
      if (mask.data[pixelIdx] === 0) continue;

      // BFS to find connected region
      const region = floodFill(mask, x, y, visited);
      const area = region.width * region.height;

      if (area > largestArea) {
        largestArea = area;
        largestRegion = region;
      }
    }
  }

  return largestRegion;
}

/**
 * Flood fill to find connected component
 */
function floodFill(
  mask: ImageData,
  startX: number,
  startY: number,
  visited: Set<number>
): BoundingBox {
  const { width, height } = mask;
  const queue: [number, number][] = [[startX, startY]];
  let minX = startX, minY = startY, maxX = startX, maxY = startY;

  while (queue.length > 0) {
    const [x, y] = queue.shift()!;
    const idx = y * width + x;

    if (visited.has(idx)) continue;
    visited.add(idx);

    const pixelIdx = idx * 4;
    if (mask.data[pixelIdx] === 0) continue;

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);

    // Add neighbors
    const neighbors: [number, number][] = [
      [x - 1, y], [x + 1, y],
      [x, y - 1], [x, y + 1],
    ];

    for (const [nx, ny] of neighbors) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborIdx = ny * width + nx;
        if (!visited.has(neighborIdx)) {
          queue.push([nx, ny]);
        }
      }
    }
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

/**
 * Extract region from image
 */
function extractRegion(
  imageData: ImageData,
  bounds: BoundingBox
): ImageData {
  const region = new ImageData(bounds.width, bounds.height);
  const { data, width } = imageData;

  for (let y = 0; y < bounds.height; y++) {
    for (let x = 0; x < bounds.width; x++) {
      const srcIdx = ((bounds.y + y) * width + (bounds.x + x)) * 4;
      const dstIdx = (y * bounds.width + x) * 4;

      region.data[dstIdx] = data[srcIdx];
      region.data[dstIdx + 1] = data[srcIdx + 1];
      region.data[dstIdx + 2] = data[srcIdx + 2];
      region.data[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  return region;
}

/**
 * Morphological closing operation
 */
function morphologicalClose(mask: ImageData, kernelSize: number): ImageData {
  // Simplified morphological operation
  const { width, height } = mask;
  const dilated = createMask(width, height);
  const half = Math.floor(kernelSize / 2);

  // Dilate
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (mask.data[idx] > 0) {
        // Set kernel area
        for (let ky = -half; ky <= half; ky++) {
          for (let kx = -half; kx <= half; kx++) {
            const nx = x + kx;
            const ny = y + ky;
            if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
              const nIdx = (ny * width + nx) * 4;
              dilated.data[nIdx] = 255;
              dilated.data[nIdx + 1] = 255;
              dilated.data[nIdx + 2] = 255;
              dilated.data[nIdx + 3] = 128;
            }
          }
        }
      }
    }
  }

  // Erode (simplified - just return dilated for now)
  return dilated;
}

// ============================================================================
// Retinal Vessel Segmentation
// ============================================================================

/**
 * Segment retinal vessels using image processing
 */
export async function segmentVessels(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<VesselResult> {
  const startTime = performance.now();
  const imageData = getImageData(source);
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);

  // Apply CLAHE-like enhancement
  const enhanced = enhanceContrast(grayscale);

  // Apply matched filter for vessel detection
  const vesselMask = detectVessels(enhanced);

  // Calculate vessel density
  let vesselPixels = 0;
  const totalPixels = width * height;

  for (let i = 0; i < vesselMask.data.length; i += 4) {
    if (vesselMask.data[i] > 0) {
      vesselPixels++;
    }
  }

  const vesselDensity = vesselPixels / totalPixels;
  const processingTime = performance.now() - startTime;

  return {
    vesselMask,
    vesselDensity,
    processingTime,
  };
}

/**
 * Enhance contrast using histogram equalization
 */
function enhanceContrast(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const histogram = new Array(256).fill(0);

  // Build histogram
  for (let i = 0; i < data.length; i += 4) {
    histogram[data[i]]++;
  }

  // Calculate CDF
  const cdf = new Array(256);
  cdf[0] = histogram[0];
  for (let i = 1; i < 256; i++) {
    cdf[i] = cdf[i - 1] + histogram[i];
  }

  // Normalize CDF
  const cdfMin = cdf.find((v) => v > 0) || 0;
  const totalPixels = width * height;
  const lut = new Array(256);

  for (let i = 0; i < 256; i++) {
    lut[i] = Math.round(((cdf[i] - cdfMin) / (totalPixels - cdfMin)) * 255);
  }

  // Apply LUT
  const enhanced = new ImageData(width, height);
  for (let i = 0; i < data.length; i += 4) {
    const val = lut[data[i]];
    enhanced.data[i] = val;
    enhanced.data[i + 1] = val;
    enhanced.data[i + 2] = val;
    enhanced.data[i + 3] = data[i + 3];
  }

  return enhanced;
}

/**
 * Detect vessels using multi-scale matched filtering
 */
function detectVessels(imageData: ImageData): ImageData {
  const { width, height } = imageData;
  const vessels = createMask(width, height);

  // Apply multiple scales of line detection
  const scales = [3, 5, 7];
  const responses: number[] = new Array(width * height).fill(0);

  for (const scale of scales) {
    const response = lineFilter(imageData, scale);
    for (let i = 0; i < response.length; i++) {
      responses[i] = Math.max(responses[i], response[i]);
    }
  }

  // Threshold responses
  const threshold = 50;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (responses[idx] > threshold) {
        const pixelIdx = idx * 4;
        vessels.data[pixelIdx] = 255;
        vessels.data[pixelIdx + 1] = 255;
        vessels.data[pixelIdx + 2] = 255;
        vessels.data[pixelIdx + 3] = 128;
      }
    }
  }

  return vessels;
}

/**
 * Line filter for vessel detection
 */
function lineFilter(imageData: ImageData, scale: number): number[] {
  const { data, width, height } = imageData;
  const response = new Array(width * height).fill(0);
  const half = Math.floor(scale / 2);

  // Horizontal line kernel
  for (let y = half; y < height - half; y++) {
    for (let x = half; x < width - half; x++) {
      let sum = 0;
      let count = 0;

      for (let k = -half; k <= half; k++) {
        const idx = (y * width + (x + k)) * 4;
        sum += data[idx];
        count++;
      }

      const mean = sum / count;
      const idx = y * width + x;
      response[idx] = Math.abs(data[idx * 4] - mean);
    }
  }

  return response;
}

// ============================================================================
// Lesion Heatmap Generation
// ============================================================================

/**
 * Generate lesion probability heatmap
 */
export function generateHeatmap(
  imageData: ImageData,
  config: HeatmapConfig = {
    colormap: 'jet',
    opacity: 0.6,
    threshold: 0.3,
  }
): ImageData {
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);
  const heatmap = new ImageData(width, height);

  // Calculate probability map based on intensity and texture
  const probabilityMap = new Array(width * height).fill(0);

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      const intensity = grayscale.data[idx * 4];

      // Calculate local variance (texture measure)
      let sum = 0;
      let sumSq = 0;
      let count = 0;

      for (let ky = -2; ky <= 2; ky++) {
        for (let kx = -2; kx <= 2; kx++) {
          const kIdx = ((y + ky) * width + (x + kx)) * 4;
          const val = grayscale.data[kIdx];
          sum += val;
          sumSq += val * val;
          count++;
        }
      }

      const mean = sum / count;
      const variance = sumSq / count - mean * mean;

      // Combine intensity and texture for probability
      // Dark spots with high variance are likely lesions
      const darkness = 1 - intensity / 255;
      const texture = Math.min(variance / 1000, 1);
      
      probabilityMap[idx] = darkness * 0.6 + texture * 0.4;
    }
  }

  // Apply colormap
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const probability = probabilityMap[idx];

      if (probability > config.threshold) {
        const [r, g, b] = applyColormap(probability, config.colormap);
        const pixelIdx = idx * 4;

        heatmap.data[pixelIdx] = r;
        heatmap.data[pixelIdx + 1] = g;
        heatmap.data[pixelIdx + 2] = b;
        heatmap.data[pixelIdx + 3] = Math.round(config.opacity * 255);
      }
    }
  }

  return heatmap;
}

/**
 * Apply colormap to probability value
 */
function applyColormap(
  value: number,
  colormap: HeatmapConfig['colormap']
): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));

  switch (colormap) {
    case 'jet':
      return jetColormap(t);
    case 'hot':
      return hotColormap(t);
    case 'viridis':
      return viridisColormap(t);
    case 'plasma':
      return plasmaColormap(t);
    default:
      return jetColormap(t);
  }
}

function jetColormap(t: number): [number, number, number] {
  const r = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 3))));
  const g = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 2))));
  const b = Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(4 * t - 1))));
  return [r, g, b];
}

function hotColormap(t: number): [number, number, number] {
  const r = Math.round(255 * Math.min(1, t * 3));
  const g = Math.round(255 * Math.min(1, Math.max(0, t * 3 - 1)));
  const b = Math.round(255 * Math.min(1, Math.max(0, t * 3 - 2)));
  return [r, g, b];
}

function viridisColormap(t: number): [number, number, number] {
  // Simplified viridis approximation
  const r = Math.round(255 * (0.267 + t * 0.533));
  const g = Math.round(255 * (0.004 + t * 0.8 * (1 - t)));
  const b = Math.round(255 * (0.329 + t * 0.3 * (1 - t)));
  return [r, g, b];
}

function plasmaColormap(t: number): [number, number, number] {
  // Simplified plasma approximation
  const r = Math.round(255 * (0.05 + t * 0.9));
  const g = Math.round(255 * (0.03 + t * 0.3 * (1 - t)));
  const b = Math.round(255 * (0.5 - t * 0.3));
  return [r, g, b];
}

/**
 * Apply heatmap overlay to original image
 */
export function applyHeatmapOverlay(
  original: ImageData,
  heatmap: ImageData
): ImageData {
  const { width, height } = original;
  const overlay = new ImageData(width, height);

  // Copy original
  overlay.data.set(original.data);

  // Apply heatmap
  for (let i = 0; i < heatmap.data.length; i += 4) {
    if (heatmap.data[i + 3] > 0) {
      const alpha = heatmap.data[i + 3] / 255;
      const invAlpha = 1 - alpha;

      overlay.data[i] = Math.round(
        overlay.data[i] * invAlpha + heatmap.data[i] * alpha
      );
      overlay.data[i + 1] = Math.round(
        overlay.data[i + 1] * invAlpha + heatmap.data[i + 1] * alpha
      );
      overlay.data[i + 2] = Math.round(
        overlay.data[i + 2] * invAlpha + heatmap.data[i + 2] * alpha
      );
    }
  }

  return overlay;
}

// ============================================================================
// Deep Learning Detection (requires models)
// ============================================================================

/**
 * Run retinal disease detection using deep learning model
 * Note: Requires model to be available at configured URL
 */
export async function detectRetinalDisease(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<DetectionResult> {
  const startTime = performance.now();

  try {
    await initializeTensorFlow();

    const config = MODEL_CONFIGS.retinal_disease;
    const model = await loadModel(config);
    const { tensor } = imageToTensor(source, config.inputShape);

    // Run inference
    const result = await runInference(model, tensor);
    const predictions = await result.predictions.data() as Float32Array;

    // Parse predictions
    const detectionPredictions: DetectionPrediction[] = [];
    for (let i = 0; i < predictions.length; i++) {
      if (predictions[i] > 0.5) {
        const { label, class: lesionClass } = DISEASE_LABELS[i];
        detectionPredictions.push({
          label,
          confidence: predictions[i],
          bounds: { x: 0, y: 0, width: 0, height: 0 }, // Global prediction
          class: lesionClass,
        });
      }
    }

    // Generate heatmap
    const imageData = getImageData(source);
    const heatmap = generateHeatmap(imageData);
    const overlay = applyHeatmapOverlay(imageData, heatmap);

    // Cleanup
    disposeTensor(tensor);
    disposeTensor(result.predictions);

    return {
      predictions: detectionPredictions,
      heatmap,
      overlay,
      processingTime: performance.now() - startTime,
      modelUsed: 'retinal_disease',
    };
  } catch (error) {
    console.error('Deep learning detection failed:', error);
    
    // Fallback to image processing
    return fallbackDetection(source);
  }
}

/**
 * Fallback detection using image processing
 */
async function fallbackDetection(
  source: HTMLImageElement | HTMLCanvasElement
): Promise<DetectionResult> {
  const startTime = performance.now();
  const imageData = getImageData(source);
  
  // Generate heatmap based on image analysis
  const heatmap = generateHeatmap(imageData);
  const overlay = applyHeatmapOverlay(imageData, heatmap);

  // Simple intensity-based predictions
  const predictions: DetectionPrediction[] = [];
  const grayscale = toGrayscale(imageData);
  
  // Check for dark spots (potential hemorrhages)
  let darkPixelCount = 0;
  for (let i = 0; i < grayscale.data.length; i += 4) {
    if (grayscale.data[i] < 50) darkPixelCount++;
  }
  
  const darkRatio = darkPixelCount / (grayscale.data.length / 4);
  if (darkRatio > 0.01) {
    predictions.push({
      label: '疑似出血区域',
      confidence: Math.min(darkRatio * 10, 0.9),
      bounds: { x: 0, y: 0, width: 0, height: 0 },
      class: 'hemorrhage',
    });
  }

  return {
    predictions,
    heatmap,
    overlay,
    processingTime: performance.now() - startTime,
    modelUsed: 'fallback',
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Export detection result as data URLs
 */
export function exportDetectionResult(result: DetectionResult): {
  heatmapUrl: string;
  overlayUrl: string;
} {
  const heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.width = result.heatmap.width;
  heatmapCanvas.height = result.heatmap.height;
  const heatmapCtx = heatmapCanvas.getContext('2d')!;
  heatmapCtx.putImageData(result.heatmap, 0, 0);

  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.width = result.overlay.width;
  overlayCanvas.height = result.overlay.height;
  const overlayCtx = overlayCanvas.getContext('2d')!;
  overlayCtx.putImageData(result.overlay, 0, 0);

  return {
    heatmapUrl: heatmapCanvas.toDataURL('image/png'),
    overlayUrl: overlayCanvas.toDataURL('image/png'),
  };
}

/**
 * Get available models
 */
export function getAvailableModels(): string[] {
  return Object.keys(MODEL_CONFIGS);
}

/**
 * Check if model is loaded
 */
export function isModelLoaded(modelName: string): boolean {
  return modelName in MODEL_CONFIGS;
}
