/**
 * Edge Detection Utilities for Image Processing
 *
 * Implements Sobel and Canny edge detection algorithms
 * optimized for OCT retinal layer boundary detection.
 *
 * All functions work on grayscale (Uint8Array) pixel data.
 */

/**
 * Apply Gaussian blur for noise reduction.
 *
 * @param pixels - Grayscale pixel data (row-major)
 * @param width - Image width
 * @param height - Image height
 * @param kernelSize - Kernel size (3 or 5)
 * @returns Blurred pixel data
 */
export function gaussianBlur(
  pixels: Uint8Array,
  width: number,
  height: number,
  kernelSize: 3 | 5 = 3
): Uint8Array {
  const result = new Uint8Array(width * height);

  // Gaussian kernels
  const kernel3 = [1, 2, 1, 2, 4, 2, 1, 2, 1];
  const kernelSum3 = 16;

  const kernel5 = [
    1, 4, 6, 4, 1,
    4, 16, 24, 16, 4,
    6, 24, 36, 24, 6,
    4, 16, 24, 16, 4,
    1, 4, 6, 4, 1,
  ];
  const kernelSum5 = 256;

  const kernel = kernelSize === 3 ? kernel3 : kernel5;
  const kernelSum = kernelSize === 3 ? kernelSum3 : kernelSum5;
  const half = Math.floor(kernelSize / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;

      for (let ky = -half; ky <= half; ky++) {
        for (let kx = -half; kx <= half; kx++) {
          const px = Math.min(width - 1, Math.max(0, x + kx));
          const py = Math.min(height - 1, Math.max(0, y + ky));
          const ki = (ky + half) * kernelSize + (kx + half);
          sum += pixels[py * width + px] * kernel[ki];
        }
      }

      result[y * width + x] = Math.round(sum / kernelSum);
    }
  }

  return result;
}

/**
 * Sobel edge detection.
 *
 * @param pixels - Grayscale pixel data
 * @param width - Image width
 * @param height - Image height
 * @param direction - Edge direction to detect
 * @returns Object with magnitude and direction arrays
 */
export function sobelEdgeDetection(
  pixels: Uint8Array,
  width: number,
  height: number,
  direction: 'horizontal' | 'vertical' | 'both' = 'both'
): { magnitude: Float32Array; direction: Float32Array } {
  const magnitude = new Float32Array(width * height);
  const dir = new Float32Array(width * height);

  // Sobel kernels
  const gx = [-1, 0, 1, -2, 0, 2, -1, 0, 1]; // Vertical edges
  const gy = [-1, -2, -1, 0, 0, 0, 1, 2, 1]; // Horizontal edges

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sumX = 0;
      let sumY = 0;

      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          const pixel = pixels[(y + ky) * width + (x + kx)];
          const ki = (ky + 1) * 3 + (kx + 1);
          sumX += pixel * gx[ki];
          sumY += pixel * gy[ki];
        }
      }

      const idx = y * width + x;

      switch (direction) {
        case 'horizontal':
          magnitude[idx] = Math.abs(sumY);
          dir[idx] = Math.atan2(0, sumY);
          break;
        case 'vertical':
          magnitude[idx] = Math.abs(sumX);
          dir[idx] = Math.atan2(sumX, 0);
          break;
        case 'both':
          magnitude[idx] = Math.sqrt(sumX * sumX + sumY * sumY);
          dir[idx] = Math.atan2(sumY, sumX);
          break;
      }
    }
  }

  return { magnitude, direction: dir };
}

/**
 * Non-maximum suppression for edge thinning.
 *
 * @param magnitude - Edge magnitude array
 * @param direction - Edge direction array (radians)
 * @param width - Image width
 * @param height - Image height
 * @returns Thinned edge magnitude
 */
export function nonMaxSuppression(
  magnitude: Float32Array,
  direction: Float32Array,
  width: number,
  height: number
): Float32Array {
  const result = new Float32Array(width * height);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const angle = (direction[idx] * 180) / Math.PI;
      const mag = magnitude[idx];

      // Normalize angle to 0-180
      const normAngle = ((angle % 180) + 180) % 180;

      let neighbor1: number;
      let neighbor2: number;

      // Quantize direction to 4 possibilities
      if (normAngle < 22.5 || normAngle >= 157.5) {
        // Horizontal edge
        neighbor1 = magnitude[y * width + (x - 1)];
        neighbor2 = magnitude[y * width + (x + 1)];
      } else if (normAngle < 67.5) {
        // Diagonal /
        neighbor1 = magnitude[(y - 1) * width + (x + 1)];
        neighbor2 = magnitude[(y + 1) * width + (x - 1)];
      } else if (normAngle < 112.5) {
        // Vertical edge
        neighbor1 = magnitude[(y - 1) * width + x];
        neighbor2 = magnitude[(y + 1) * width + x];
      } else {
        // Diagonal \
        neighbor1 = magnitude[(y - 1) * width + (x - 1)];
        neighbor2 = magnitude[(y + 1) * width + (x + 1)];
      }

      // Suppress non-maximum
      result[idx] = mag >= neighbor1 && mag >= neighbor2 ? mag : 0;
    }
  }

  return result;
}

/**
 * Hysteresis thresholding for edge tracking.
 *
 * @param magnitude - Edge magnitude after NMS
 * @param width - Image width
 * @param height - Image height
 * @param lowThreshold - Low threshold for weak edges
 * @param highThreshold - High threshold for strong edges
 * @returns Binary edge map
 */
export function hysteresisThreshold(
  magnitude: Float32Array,
  width: number,
  height: number,
  lowThreshold: number,
  highThreshold: number
): Uint8Array {
  const result = new Uint8Array(width * height);

  // Mark strong and weak edges
  const STRONG = 255;
  const WEAK = 128;

  for (let i = 0; i < width * height; i++) {
    if (magnitude[i] >= highThreshold) {
      result[i] = STRONG;
    } else if (magnitude[i] >= lowThreshold) {
      result[i] = WEAK;
    }
  }

  // Track edges: weak edges connected to strong edges become strong
  let changed = true;
  while (changed) {
    changed = false;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (result[idx] !== WEAK) continue;

        // Check 8 neighbors for strong edge
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (result[(y + dy) * width + (x + dx)] === STRONG) {
              result[idx] = STRONG;
              changed = true;
              break;
            }
          }
          if (result[idx] === STRONG) break;
        }
      }
    }
  }

  // Suppress remaining weak edges
  for (let i = 0; i < width * height; i++) {
    if (result[i] === WEAK) {
      result[i] = 0;
    }
  }

  return result;
}

/**
 * Canny edge detection — complete pipeline.
 *
 * @param pixels - Grayscale pixel data
 * @param width - Image width
 * @param height - Image height
 * @param lowThreshold - Low threshold (default: 20)
 * @param highThreshold - High threshold (default: 50)
 * @param blurSize - Gaussian blur kernel size (default: 5)
 * @returns Binary edge map
 */
export function cannyEdgeDetection(
  pixels: Uint8Array,
  width: number,
  height: number,
  lowThreshold = 20,
  highThreshold = 50,
  blurSize: 3 | 5 = 5
): Uint8Array {
  // Step 1: Gaussian blur
  const blurred = gaussianBlur(pixels, width, height, blurSize);

  // Step 2: Sobel edge detection
  const { magnitude, direction } = sobelEdgeDetection(blurred, width, height, 'both');

  // Step 3: Non-maximum suppression
  const suppressed = nonMaxSuppression(magnitude, direction, width, height);

  // Step 4: Hysteresis thresholding
  return hysteresisThreshold(suppressed, width, height, lowThreshold, highThreshold);
}

/**
 * Find gradient peaks in a column (A-scan) for layer detection.
 *
 * @param magnitude - Edge magnitude column data
 * @param height - Column height
 * @param minDistance - Minimum distance between peaks
 * @param threshold - Minimum magnitude threshold
 * @returns Array of peak positions (y coordinates)
 */
export function findGradientPeaks(
  magnitude: Float32Array | number[],
  height: number,
  minDistance = 5,
  threshold = 10
): number[] {
  const peaks: number[] = [];

  for (let y = minDistance; y < height - minDistance; y++) {
    const mag = magnitude[y];
    if (mag < threshold) continue;

    // Check if local maximum
    let isPeak = true;
    for (let dy = -minDistance; dy <= minDistance; dy++) {
      if (dy === 0) continue;
      if (magnitude[y + dy] > mag) {
        isPeak = false;
        break;
      }
    }

    if (isPeak) {
      peaks.push(y);
    }
  }

  return peaks;
}

/**
 * Smooth a boundary using moving average.
 *
 * @param points - Array of {x, y} points
 * @param windowSize - Smoothing window size
 * @returns Smoothed points
 */
export function smoothBoundary(
  points: Array<{ x: number; y: number }>,
  windowSize = 5
): Array<{ x: number; y: number }> {
  if (points.length < windowSize) return [...points];

  const smoothed: Array<{ x: number; y: number }> = [];
  const half = Math.floor(windowSize / 2);

  for (let i = 0; i < points.length; i++) {
    let sumY = 0;
    let count = 0;

    for (let j = -half; j <= half; j++) {
      const idx = i + j;
      if (idx >= 0 && idx < points.length) {
        sumY += points[idx].y;
        count++;
      }
    }

    smoothed.push({
      x: points[i].x,
      y: sumY / count,
    });
  }

  return smoothed;
}
