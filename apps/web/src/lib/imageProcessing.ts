/**
 * Image processing utilities using Canvas API
 */

export interface ProcessedImageData {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Apply brightness adjustment
 */
export function applyBrightness(imageData: ImageData, value: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const factor = (value / 100) * 255;
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, data[i] + factor));
    data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + factor));
    data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + factor));
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply contrast adjustment
 */
export function applyContrast(imageData: ImageData, value: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const factor = (259 * (value + 255)) / (255 * (259 - value));
  
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.min(255, Math.max(0, factor * (data[i] - 128) + 128));
    data[i + 1] = Math.min(255, Math.max(0, factor * (data[i + 1] - 128) + 128));
    data[i + 2] = Math.min(255, Math.max(0, factor * (data[i + 2] - 128) + 128));
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply saturation adjustment
 */
export function applySaturation(imageData: ImageData, value: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const factor = 1 + value / 100;
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
    data[i] = Math.min(255, Math.max(0, gray + factor * (data[i] - gray)));
    data[i + 1] = Math.min(255, Math.max(0, gray + factor * (data[i + 1] - gray)));
    data[i + 2] = Math.min(255, Math.max(0, gray + factor * (data[i + 2] - gray)));
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Apply sharpen filter
 */
export function applySharpen(imageData: ImageData, strength: number = 1): ImageData {
  const kernel = [
    0, -1, 0,
    -1, 5 * strength, -1,
    0, -1, 0,
  ];
  return applyConvolution(imageData, kernel, 3);
}

/**
 * Apply Gaussian blur
 */
export function applyGaussianBlur(imageData: ImageData, radius: number = 1): ImageData {
  const size = Math.ceil(radius * 2) * 2 + 1;
  const kernel = generateGaussianKernel(size, radius);
  return applyConvolution(imageData, kernel, size);
}

/**
 * Apply median filter (noise reduction)
 */
export function applyMedianFilter(imageData: ImageData, radius: number = 1): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const neighbors: number[][] = [[], [], []];
      
      for (let ky = -radius; ky <= radius; ky++) {
        for (let kx = -radius; kx <= radius; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          
          neighbors[0].push(data[idx]);
          neighbors[1].push(data[idx + 1]);
          neighbors[2].push(data[idx + 2]);
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = median(neighbors[0]);
      data[idx + 1] = median(neighbors[1]);
      data[idx + 2] = median(neighbors[2]);
    }
  }
  
  return new ImageData(data, width, height);
}

/**
 * Apply Sobel edge detection
 */
export function applySobel(imageData: ImageData): ImageData {
  const grayscale = toGrayscale(imageData);
  const width = grayscale.width;
  const height = grayscale.height;
  const data = new Uint8ClampedArray(width * height * 4);
  
  const kernelX = [-1, 0, 1, -2, 0, 2, -1, 0, 1];
  const kernelY = [-1, -2, -1, 0, 0, 0, 1, 2, 1];
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let gx = 0;
      let gy = 0;
      
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const idx = ((y + ky) * width + (x + kx)) * 4;
          const val = grayscale.data[idx];
          const ki = (ky + 1) * 3 + (kx + 1);
          gx += val * kernelX[ki];
          gy += val * kernelY[ki];
        }
      }
      
      const magnitude = Math.min(255, Math.sqrt(gx * gx + gy * gy));
      const idx = (y * width + x) * 4;
      data[idx] = data[idx + 1] = data[idx + 2] = magnitude;
      data[idx + 3] = 255;
    }
  }
  
  return new ImageData(data, width, height);
}

/**
 * Apply Canny edge detection
 */
export function applyCanny(imageData: ImageData, lowThreshold: number = 50, highThreshold: number = 150): ImageData {
  // Step 1: Gaussian blur
  const blurred = applyGaussianBlur(imageData, 1.4);
  
  // Step 2: Sobel
  const edges = applySobel(blurred);
  
  // Step 3: Non-maximum suppression and double thresholding
  const width = edges.width;
  const height = edges.height;
  const data = new Uint8ClampedArray(width * height * 4);
  
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const val = edges.data[idx];
      
      if (val >= highThreshold) {
        data[idx] = data[idx + 1] = data[idx + 2] = 255;
      } else if (val >= lowThreshold) {
        // Check neighbors
        let hasStrongNeighbor = false;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const nIdx = ((y + ky) * width + (x + kx)) * 4;
            if (edges.data[nIdx] >= highThreshold) {
              hasStrongNeighbor = true;
              break;
            }
          }
          if (hasStrongNeighbor) break;
        }
        if (hasStrongNeighbor) {
          data[idx] = data[idx + 1] = data[idx + 2] = 255;
        }
      }
      data[idx + 3] = 255;
    }
  }
  
  return new ImageData(data, width, height);
}

/**
 * Apply histogram equalization
 */
export function applyHistogramEqualization(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const totalPixels = width * height;
  
  // Calculate histogram for each channel
  const histograms = [
    new Array(256).fill(0),
    new Array(256).fill(0),
    new Array(256).fill(0),
  ];
  
  for (let i = 0; i < data.length; i += 4) {
    histograms[0][data[i]]++;
    histograms[1][data[i + 1]]++;
    histograms[2][data[i + 2]]++;
  }
  
  // Calculate CDF
  const cdfs = histograms.map((hist) => {
    const cdf = new Array(256);
    cdf[0] = hist[0];
    for (let i = 1; i < 256; i++) {
      cdf[i] = cdf[i - 1] + hist[i];
    }
    return cdf;
  });
  
  // Normalize
  const cdfMins = cdfs.map((cdf) => {
    let min = 0;
    for (let i = 0; i < 256; i++) {
      if (cdf[i] > 0) {
        min = cdf[i];
        break;
      }
    }
    return min;
  });
  
  // Apply equalization
  for (let i = 0; i < data.length; i += 4) {
    for (let c = 0; c < 3; c++) {
      const cdf = cdfs[c];
      const cdfMin = cdfMins[c];
      data[i + c] = Math.round(((cdf[data[i + c]] - cdfMin) / (totalPixels - cdfMin)) * 255);
    }
  }
  
  return new ImageData(data, width, height);
}

/**
 * Helper: Apply convolution kernel
 */
function applyConvolution(imageData: ImageData, kernel: number[], kernelSize: number): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  const width = imageData.width;
  const height = imageData.height;
  const half = Math.floor(kernelSize / 2);
  
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;
      
      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const idx = (py * width + px) * 4;
          const ki = (ky + half) * kernelSize + (kx + half);
          
          r += imageData.data[idx] * kernel[ki];
          g += imageData.data[idx + 1] * kernel[ki];
          b += imageData.data[idx + 2] * kernel[ki];
        }
      }
      
      const idx = (y * width + x) * 4;
      data[idx] = Math.min(255, Math.max(0, r));
      data[idx + 1] = Math.min(255, Math.max(0, g));
      data[idx + 2] = Math.min(255, Math.max(0, b));
    }
  }
  
  return new ImageData(data, width, height);
}

/**
 * Helper: Generate Gaussian kernel
 */
function generateGaussianKernel(size: number, sigma: number): number[] {
  const kernel = new Array(size * size);
  const center = Math.floor(size / 2);
  let sum = 0;
  
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - center;
      const dy = y - center;
      const value = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      kernel[y * size + x] = value;
      sum += value;
    }
  }
  
  // Normalize
  for (let i = 0; i < kernel.length; i++) {
    kernel[i] /= sum;
  }
  
  return kernel;
}

/**
 * Helper: Convert to grayscale
 */
function toGrayscale(imageData: ImageData): ImageData {
  const data = new Uint8ClampedArray(imageData.data);
  
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.2989 * data[i] + 0.5870 * data[i + 1] + 0.1140 * data[i + 2];
    data[i] = data[i + 1] = data[i + 2] = gray;
  }
  
  return new ImageData(data, imageData.width, imageData.height);
}

/**
 * Helper: Calculate median
 */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Apply all active filters to image data
 */
export function applyFilters(
  ctx: CanvasRenderingContext2D,
  filters: Array<{ type: string; enabled: boolean; params: Record<string, number> }>
): void {
  if (!ctx.canvas.width || !ctx.canvas.height) return;
  
  let imageData = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
  
  for (const filter of filters) {
    if (!filter.enabled) continue;
    
    switch (filter.type) {
      case 'brightness':
        imageData = applyBrightness(imageData, filter.params.value || 0);
        break;
      case 'contrast':
        imageData = applyContrast(imageData, filter.params.value || 0);
        break;
      case 'saturation':
        imageData = applySaturation(imageData, filter.params.value || 0);
        break;
      case 'sharpen':
        imageData = applySharpen(imageData, filter.params.strength || 1);
        break;
      case 'gaussian_blur':
        imageData = applyGaussianBlur(imageData, filter.params.radius || 1);
        break;
      case 'median':
        imageData = applyMedianFilter(imageData, filter.params.radius || 1);
        break;
      case 'sobel':
        imageData = applySobel(imageData);
        break;
      case 'canny':
        imageData = applyCanny(imageData, filter.params.low || 50, filter.params.high || 150);
        break;
      case 'histogram_eq':
        imageData = applyHistogramEqualization(imageData);
        break;
    }
  }
  
  ctx.putImageData(imageData, 0, 0);
}
