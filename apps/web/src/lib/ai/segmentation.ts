/**
 * Image Segmentation Module
 * 
 * Provides threshold-based, region-growing, and edge-based segmentation
 * algorithms for medical image analysis.
 */

// ============================================================================
// Types
// ============================================================================

export interface SegmentationResult {
  mask: ImageData;
  bounds: BoundingBox;
  area: number;
  confidence: number;
  processingTime: number;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ThresholdConfig {
  min: number;
  max: number;
  invert?: boolean;
}

export interface RegionGrowingConfig {
  seedX: number;
  seedY: number;
  tolerance: number;
  maxIterations?: number;
}

export interface EdgeDetectionConfig {
  method: 'sobel' | 'prewitt' | 'roberts';
  threshold: number;
}

// ============================================================================
// Canvas Utilities
// ============================================================================

/**
 * Get pixel data from image element
 */
export function getImageData(
  source: HTMLImageElement | HTMLCanvasElement
): ImageData {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');

  const width = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const height = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(source, 0, 0);
  
  return ctx.getImageData(0, 0, width, height);
}

/**
 * Convert ImageData to grayscale
 */
export function toGrayscale(imageData: ImageData): ImageData {
  const { data, width, height } = imageData;
  const grayscale = new ImageData(width, height);

  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    grayscale.data[i] = gray;
    grayscale.data[i + 1] = gray;
    grayscale.data[i + 2] = gray;
    grayscale.data[i + 3] = data[i + 3];
  }

  return grayscale;
}

/**
 * Create empty mask with same dimensions
 */
export function createMask(width: number, height: number): ImageData {
  const mask = new ImageData(width, height);
  // Initialize with transparent pixels
  for (let i = 0; i < mask.data.length; i += 4) {
    mask.data[i] = 0;
    mask.data[i + 1] = 0;
    mask.data[i + 2] = 0;
    mask.data[i + 3] = 0;
  }
  return mask;
}

// ============================================================================
// Threshold Segmentation
// ============================================================================

/**
 * Apply threshold segmentation
 */
export function thresholdSegmentation(
  imageData: ImageData,
  config: ThresholdConfig
): SegmentationResult {
  const startTime = performance.now();
  const { data, width, height } = imageData;
  const mask = createMask(width, height);
  
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let pixelCount = 0;

  // Convert to grayscale and apply threshold
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    
    const inRange = gray >= config.min && gray <= config.max;
    const shouldHighlight = config.invert ? !inRange : inRange;

    if (shouldHighlight) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      
      // Set mask pixel (white, fully opaque)
      mask.data[i] = 255;
      mask.data[i + 1] = 255;
      mask.data[i + 2] = 255;
      mask.data[i + 3] = 128; // Semi-transparent

      // Update bounds
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixelCount++;
    }
  }

  const processingTime = performance.now() - startTime;
  const totalPixels = width * height;
  const area = pixelCount / totalPixels;

  return {
    mask,
    bounds: {
      x: minX === width ? 0 : minX,
      y: minY === height ? 0 : minY,
      width: maxX === 0 ? 0 : maxX - minX + 1,
      height: maxY === 0 ? 0 : maxY - minY + 1,
    },
    area,
    confidence: 1.0, // Threshold is deterministic
    processingTime,
  };
}

/**
 * Auto threshold using Otsu's method
 */
export function autoThreshold(imageData: ImageData): number {
  const { data } = imageData;
  const histogram = new Array(256).fill(0);
  
  // Build histogram
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(
      0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]
    );
    histogram[gray]++;
  }
  
  const totalPixels = data.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) {
    sum += i * histogram[i];
  }
  
  let sumB = 0;
  let wB = 0;
  let wF = 0;
  let maxVariance = 0;
  let threshold = 0;
  
  for (let i = 0; i < 256; i++) {
    wB += histogram[i];
    if (wB === 0) continue;
    
    wF = totalPixels - wB;
    if (wF === 0) break;
    
    sumB += i * histogram[i];
    
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    
    const variance = wB * wF * (mB - mF) * (mB - mF);
    
    if (variance > maxVariance) {
      maxVariance = variance;
      threshold = i;
    }
  }
  
  return threshold;
}

// ============================================================================
// Region Growing
// ============================================================================

/**
 * Region growing segmentation
 */
export function regionGrowingSegmentation(
  imageData: ImageData,
  config: RegionGrowingConfig
): SegmentationResult {
  const startTime = performance.now();
  const { data, width, height } = imageData;
  const mask = createMask(width, height);
  const maxIterations = config.maxIterations || 10000;
  
  // Get seed pixel value
  const seedIndex = (config.seedY * width + config.seedX) * 4;
  const seedR = data[seedIndex];
  const seedG = data[seedIndex + 1];
  const seedB = data[seedIndex + 2];
  
  // BFS queue
  const queue: [number, number][] = [[config.seedX, config.seedY]];
  const visited = new Set<number>();
  visited.add(config.seedY * width + config.seedX);
  
  let minX = config.seedX, minY = config.seedY;
  let maxX = config.seedX, maxY = config.seedY;
  let pixelCount = 0;
  let iterations = 0;
  
  // 8-connected neighbors
  const dx = [-1, 0, 1, -1, 1, -1, 0, 1];
  const dy = [-1, -1, -1, 0, 0, 1, 1, 1];
  
  while (queue.length > 0 && iterations < maxIterations) {
    const [x, y] = queue.shift()!;
    iterations++;
    
    const idx = (y * width + x) * 4;
    
    // Check if pixel is within tolerance
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    
    const distance = Math.sqrt(
      (r - seedR) ** 2 + (g - seedG) ** 2 + (b - seedB) ** 2
    );
    
    if (distance > config.tolerance) continue;
    
    // Mark as part of region
    mask.data[idx] = 255;
    mask.data[idx + 1] = 255;
    mask.data[idx + 2] = 255;
    mask.data[idx + 3] = 128;
    
    // Update bounds
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    pixelCount++;
    
    // Add neighbors to queue
    for (let i = 0; i < 8; i++) {
      const nx = x + dx[i];
      const ny = y + dy[i];
      
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const neighborIdx = ny * width + nx;
        if (!visited.has(neighborIdx)) {
          visited.add(neighborIdx);
          queue.push([nx, ny]);
        }
      }
    }
  }
  
  const processingTime = performance.now() - startTime;
  const totalPixels = width * height;
  const area = pixelCount / totalPixels;
  
  return {
    mask,
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    area,
    confidence: iterations < maxIterations ? 1.0 : 0.8,
    processingTime,
  };
}

// ============================================================================
// Edge Detection
// ============================================================================

/**
 * Sobel edge detection
 */
export function sobelEdgeDetection(
  imageData: ImageData,
  threshold: number = 128
): ImageData {
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);
  const edges = createMask(width, height);
  
  // Sobel kernels
  const sobelX = [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]];
  const sobelY = [[-1, -2, -1], [0, 0, 0], [1, 2, 1]];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      // Apply kernels
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const pixel = grayscale.data[idx];
          
          gx += pixel * sobelX[ky + 1][kx + 1];
          gy += pixel * sobelY[ky + 1][kx + 1];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const idx = (y * width + x) * 4;
      
      if (magnitude > threshold) {
        edges.data[idx] = 255;
        edges.data[idx + 1] = 255;
        edges.data[idx + 2] = 255;
        edges.data[idx + 3] = 255;
      }
    }
  }
  
  return edges;
}

/**
 * Edge-based segmentation
 */
export function edgeBasedSegmentation(
  imageData: ImageData,
  config: EdgeDetectionConfig
): SegmentationResult {
  const startTime = performance.now();
  
  let edges: ImageData;
  
  switch (config.method) {
    case 'sobel':
      edges = sobelEdgeDetection(imageData, config.threshold);
      break;
    case 'prewitt':
      edges = prewittEdgeDetection(imageData, config.threshold);
      break;
    case 'roberts':
      edges = robertsEdgeDetection(imageData, config.threshold);
      break;
    default:
      edges = sobelEdgeDetection(imageData, config.threshold);
  }
  
  const { width, height } = edges;
  let minX = width, minY = height, maxX = 0, maxY = 0;
  let pixelCount = 0;
  
  // Find bounds of edge pixels
  for (let i = 0; i < edges.data.length; i += 4) {
    if (edges.data[i] > 0) {
      const pixelIndex = i / 4;
      const x = pixelIndex % width;
      const y = Math.floor(pixelIndex / width);
      
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      pixelCount++;
    }
  }
  
  const processingTime = performance.now() - startTime;
  const totalPixels = width * height;
  const area = pixelCount / totalPixels;
  
  return {
    mask: edges,
    bounds: {
      x: minX === width ? 0 : minX,
      y: minY === height ? 0 : minY,
      width: maxX === 0 ? 0 : maxX - minX + 1,
      height: maxY === 0 ? 0 : maxY - minY + 1,
    },
    area,
    confidence: 0.9,
    processingTime,
  };
}

/**
 * Prewitt edge detection
 */
function prewittEdgeDetection(
  imageData: ImageData,
  threshold: number
): ImageData {
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);
  const edges = createMask(width, height);
  
  const prewittX = [[-1, 0, 1], [-1, 0, 1], [-1, 0, 1]];
  const prewittY = [[-1, -1, -1], [0, 0, 0], [1, 1, 1]];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const pixel = grayscale.data[idx];
          
          gx += pixel * prewittX[ky + 1][kx + 1];
          gy += pixel * prewittY[ky + 1][kx + 1];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const idx = (y * width + x) * 4;
      
      if (magnitude > threshold) {
        edges.data[idx] = 255;
        edges.data[idx + 1] = 255;
        edges.data[idx + 2] = 255;
        edges.data[idx + 3] = 255;
      }
    }
  }
  
  return edges;
}

/**
 * Roberts edge detection
 */
function robertsEdgeDetection(
  imageData: ImageData,
  threshold: number
): ImageData {
  const { width, height } = imageData;
  const grayscale = toGrayscale(imageData);
  const edges = createMask(width, height);
  
  // Roberts cross kernels
  const robertsX = [[1, 0], [0, -1]];
  const robertsY = [[0, 1], [-1, 0]];
  
  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      for (let ky = 0; ky < 2; ky++) {
        for (let kx = 0; kx < 2; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const pixel = grayscale.data[idx];
          
          gx += pixel * robertsX[ky][kx];
          gy += pixel * robertsY[ky][kx];
        }
      }
      
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      const idx = (y * width + x) * 4;
      
      if (magnitude > threshold) {
        edges.data[idx] = 255;
        edges.data[idx + 1] = 255;
        edges.data[idx + 2] = 255;
        edges.data[idx + 3] = 255;
      }
    }
  }
  
  return edges;
}

// ============================================================================
// Mask Operations
// ============================================================================

/**
 * Apply mask overlay to image
 */
export function applyMaskOverlay(
  imageData: ImageData,
  mask: ImageData,
  color: [number, number, number] = [255, 0, 0],
  opacity: number = 0.5
): ImageData {
  const { width, height } = imageData;
  const result = new ImageData(width, height);
  
  // Copy original image
  result.data.set(imageData.data);
  
  // Apply mask overlay
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i] > 0 || mask.data[i + 1] > 0 || mask.data[i + 2] > 0) {
      const alpha = opacity * (mask.data[i + 3] / 255);
      const invAlpha = 1 - alpha;
      
      result.data[i] = Math.round(result.data[i] * invAlpha + color[0] * alpha);
      result.data[i + 1] = Math.round(result.data[i + 1] * invAlpha + color[1] * alpha);
      result.data[i + 2] = Math.round(result.data[i + 2] * invAlpha + color[2] * alpha);
    }
  }
  
  return result;
}

/**
 * Export mask as PNG data URL
 */
export function exportMaskAsDataUrl(mask: ImageData): string {
  const canvas = document.createElement('canvas');
  canvas.width = mask.width;
  canvas.height = mask.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to get canvas context');
  
  ctx.putImageData(mask, 0, 0);
  return canvas.toDataURL('image/png');
}

/**
 * Invert mask
 */
export function invertMask(mask: ImageData): ImageData {
  const { width, height } = mask;
  const inverted = createMask(width, height);
  
  for (let i = 0; i < mask.data.length; i += 4) {
    if (mask.data[i] === 0 && mask.data[i + 1] === 0 && mask.data[i + 2] === 0) {
      inverted.data[i] = 255;
      inverted.data[i + 1] = 255;
      inverted.data[i + 2] = 255;
      inverted.data[i + 3] = 128;
    }
  }
  
  return inverted;
}
