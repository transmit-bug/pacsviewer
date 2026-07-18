/**
 * OCT Retinal Layer Detection
 *
 * Detects retinal layer boundaries in OCT B-scan images using
 * edge detection and continuity constraints.
 *
 * Layer structure (top to bottom):
 *   ILM   - Inner Limiting Membrane
 *   NFL   - Nerve Fiber Layer
 *   GCL   - Ganglion Cell Layer
 *   IPL   - Inner Plexiform Layer
 *   INL   - Inner Nuclear Layer
 *   OPL   - Outer Plexiform Layer
 *   ONL   - Outer Nuclear Layer
 *   ELM   - External Limiting Membrane
 *   IS/OS - Inner/Outer Segment Junction
 *   RPE   - Retinal Pigment Epithelium
 *   BM    - Bruch's Membrane
 */

import {
  gaussianBlur,
  sobelEdgeDetection,
  findGradientPeaks,
  smoothBoundary,
} from '../utils/edge-detection';

/** Retinal layer identifiers */
export type LayerId =
  | 'ILM'
  | 'NFL'
  | 'GCL'
  | 'IPL'
  | 'INL'
  | 'OPL'
  | 'ONL'
  | 'ELM'
  | 'ISOS'
  | 'RPE'
  | 'BM';

/** Layer boundary with points */
export interface RetinalLayerBoundary {
  layer: LayerId;
  points: Array<{ x: number; y: number }>;
}

/** Pixel spacing [axial, lateral] in mm/pixel */
export interface PixelSpacing {
  axial: number;
  lateral: number;
}

/** Layer detection options */
export interface LayerDetectionOptions {
  /** Gaussian blur kernel size (default: 5) */
  blurSize?: 3 | 5;
  /** Minimum gradient magnitude threshold (default: 15) */
  gradientThreshold?: number;
  /** Minimum distance between peaks in A-scan (default: 8) */
  minPeakDistance?: number;
  /** Smoothing window size for boundaries (default: 7) */
  smoothWindow?: number;
  /** Expected layer order (top to bottom) */
  layerOrder?: LayerId[];
}

const DEFAULT_LAYER_ORDER: LayerId[] = [
  'ILM', 'NFL', 'GCL', 'IPL', 'INL', 'OPL', 'ONL', 'ELM', 'ISOS', 'RPE', 'BM',
];

/**
 * Detect retinal layer boundaries in an OCT B-scan image.
 *
 * Algorithm:
 * 1. Gaussian blur for noise reduction
 * 2. Vertical Sobel edge detection (layers are mostly horizontal)
 * 3. For each A-scan (column), find gradient peaks
 * 4. Assign peaks to layers based on expected order
 * 5. Enforce continuity between adjacent A-scans
 * 6. Smooth boundaries
 *
 * @param pixels - Grayscale pixel data (row-major)
 * @param width - Image width (A-scans)
 * @param height - Image height (depth)
 * @param pixelSpacing - Pixel spacing [axial, lateral]
 * @param options - Detection options
 * @returns Array of detected layer boundaries
 */
export function detectRetinalLayers(
  pixels: Uint8Array,
  width: number,
  height: number,
  pixelSpacing: PixelSpacing,
  options: LayerDetectionOptions = {}
): RetinalLayerBoundary[] {
  const {
    blurSize = 5,
    gradientThreshold = 15,
    minPeakDistance = 8,
    smoothWindow = 7,
    layerOrder = DEFAULT_LAYER_ORDER,
  } = options;

  // Step 1: Gaussian blur
  const blurred = gaussianBlur(pixels, width, height, blurSize);

  // Step 2: Vertical Sobel (detect horizontal edges)
  const { magnitude } = sobelEdgeDetection(blurred, width, height, 'horizontal');

  // Step 3: Find peaks in each A-scan
  const allPeaks: Map<LayerId, Array<{ x: number; y: number }>> = new Map();
  for (const layer of layerOrder) {
    allPeaks.set(layer, []);
  }

  // Track previous A-scan peaks for continuity
  let prevPeaks: Map<LayerId, number> = new Map();

  for (let x = 0; x < width; x++) {
    // Extract column magnitude
    const column = new Float32Array(height);
    for (let y = 0; y < height; y++) {
      column[y] = magnitude[y * width + x];
    }

    // Find gradient peaks
    const peaks = findGradientPeaks(column, height, minPeakDistance, gradientThreshold);

    // Assign peaks to layers
    const assigned = assignPeaksToLayers(
      peaks,
      column,
      prevPeaks,
      layerOrder,
      height
    );

    // Update tracking
    prevPeaks = new Map();
    for (const [layer, y] of assigned) {
      prevPeaks.set(layer, y);
      allPeaks.get(layer)?.push({ x, y });
    }
  }

  // Step 4: Smooth boundaries
  const result: RetinalLayerBoundary[] = [];

  for (const layer of layerOrder) {
    const points = allPeaks.get(layer);
    if (!points || points.length === 0) continue;

    // Interpolate missing points
    const interpolated = interpolateBoundary(points, width);

    // Smooth
    const smoothed = smoothBoundary(interpolated, smoothWindow);

    result.push({
      layer,
      points: smoothed,
    });
  }

  return result;
}

/**
 * Assign gradient peaks to retinal layers based on expected order.
 *
 * Uses the previous A-scan as a guide and enforces:
 * 1. Layers must be in order (top to bottom)
 * 2. Layers must be within expected range of previous position
 * 3. Layers must have sufficient gradient magnitude
 */
function assignPeaksToLayers(
  peaks: number[],
  magnitudes: Float32Array,
  prevPeaks: Map<LayerId, number>,
  layerOrder: LayerId[],
  height: number
): Map<LayerId, number> {
  const assigned = new Map<LayerId, number>();
  const maxJump = height * 0.15; // Maximum allowed jump between A-scans

  let lastAssignedY = 0;

  for (const layer of layerOrder) {
    const prevY = prevPeaks.get(layer);

    // Find best matching peak
    let bestPeak = -1;
    let bestScore = Infinity;

    for (const peak of peaks) {
      if (peak <= lastAssignedY) continue; // Must be below previous layer

      // Score based on:
      // 1. Distance from expected position (if we have previous)
      // 2. Gradient magnitude
      let score = 0;

      if (prevY !== undefined) {
        const dist = Math.abs(peak - prevY);
        if (dist > maxJump) continue; // Too far from expected
        score += dist * 2;
      }

      // Prefer stronger edges
      score -= magnitudes[peak] * 0.5;

      if (score < bestScore) {
        bestScore = score;
        bestPeak = peak;
      }
    }

    if (bestPeak >= 0) {
      assigned.set(layer, bestPeak);
      lastAssignedY = bestPeak;
    }
  }

  return assigned;
}

/**
 * Interpolate missing boundary points.
 *
 * @param points - Existing boundary points
 * @param width - Total width to interpolate to
 * @returns Interpolated boundary points
 */
function interpolateBoundary(
  points: Array<{ x: number; y: number }>,
  width: number
): Array<{ x: number; y: number }> {
  if (points.length === 0) return [];
  if (points.length === 1) {
    // Fill entire width with single value
    return Array.from({ length: width }, (_, x) => ({ x, y: points[0].y }));
  }

  const result: Array<{ x: number; y: number }> = [];
  let pointIdx = 0;

  for (let x = 0; x < width; x++) {
    // Find surrounding points
    while (pointIdx < points.length - 1 && points[pointIdx + 1].x < x) {
      pointIdx++;
    }

    if (pointIdx >= points.length - 1) {
      // Extrapolate from last point
      result.push({ x, y: points[points.length - 1].y });
    } else if (points[pointIdx].x === x) {
      // Exact match
      result.push({ x, y: points[pointIdx].y });
    } else {
      // Linear interpolation
      const p1 = points[pointIdx];
      const p2 = points[pointIdx + 1];
      const t = (x - p1.x) / (p2.x - p1.x);
      result.push({
        x,
        y: p1.y + t * (p2.y - p1.y),
      });
    }
  }

  return result;
}

/**
 * Calculate layer thickness between two boundaries.
 *
 * @param upper - Upper boundary points
 * @param lower - Lower boundary points
 * @param pixelSpacing - Pixel spacing [axial, lateral]
 * @returns Array of thickness values in μm
 */
export function calculateLayerThickness(
  upper: Array<{ x: number; y: number }>,
  lower: Array<{ x: number; y: number }>,
  pixelSpacing: PixelSpacing
): number[] {
  const thickness: number[] = [];
  const axialToUm = pixelSpacing.axial * 1000; // mm to μm

  const len = Math.min(upper.length, lower.length);

  for (let i = 0; i < len; i++) {
    const pixelThickness = Math.abs(lower[i].y - upper[i].y);
    thickness.push(pixelThickness * axialToUm);
  }

  return thickness;
}

/**
 * Generate ETDRS thickness map from layer boundaries.
 *
 * ETDRS 9 regions:
 *   ┌─────┬─────┬─────┐
 *   │  1  │  2  │  3  │
 *   ├─────┼─────┼─────┤
 *   │  4  │  5  │  6  │  (center = 1mm, inner = 3mm, outer = 6mm)
 *   ├─────┼─────┼─────┤
 *   │  7  │  8  │  9  │
 *   └─────┴─────┴─────┘
 *
 * @param thicknessMap - 2D thickness array
 * @param mapWidth - Map width
 * @param mapHeight - Map height
 * @param pixelSpacing - Pixel spacing [axial, lateral]
 * @returns ETDRS region averages
 */
export function generateETDRSRegions(
  thicknessMap: Float32Array,
  mapWidth: number,
  mapHeight: number,
  pixelSpacing: PixelSpacing
): Array<{ name: string; averageThickness: number }> {
  const centerX = mapWidth / 2;
  const centerY = mapHeight / 2;
  const lateralToMm = pixelSpacing.lateral;

  // ETDRS ring radii in pixels
  const innerRadius = 1.5 / lateralToMm; // 3mm diameter = 1.5mm radius
  const outerRadius = 3.0 / lateralToMm; // 6mm diameter = 3mm radius

  // Accumulate thickness values per region
  const regions: Map<string, { sum: number; count: number }> = new Map();
  const regionNames = [
    '中心', '内上方', '内鼻侧', '内下方', '内颞侧',
    '外上方', '外鼻侧', '外下方', '外颞侧',
  ];
  for (const name of regionNames) {
    regions.set(name, { sum: 0, count: 0 });
  }

  for (let y = 0; y < mapHeight; y++) {
    for (let x = 0; x < mapWidth; x++) {
      const dx = (x - centerX) * lateralToMm;
      const dy = (y - centerY) * lateralToMm;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const thickness = thicknessMap[y * mapWidth + x];

      if (thickness <= 0) continue;

      let region: string;

      if (dist <= innerRadius) {
        region = '中心';
      } else if (dist <= outerRadius) {
        // Determine octant
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle >= -45 && angle < 45) {
          region = '内鼻侧';
        } else if (angle >= 45 && angle < 135) {
          region = '内上方';
        } else if (angle >= -135 && angle < -45) {
          region = '内下方';
        } else {
          region = '内颞侧';
        }
      } else {
        // Outside outer ring - use outer regions
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle >= -45 && angle < 45) {
          region = '外鼻侧';
        } else if (angle >= 45 && angle < 135) {
          region = '外上方';
        } else if (angle >= -135 && angle < -45) {
          region = '外下方';
        } else {
          region = '外颞侧';
        }
      }

      const r = regions.get(region);
      if (r) {
        r.sum += thickness;
        r.count++;
      }
    }
  }

  // Calculate averages
  return regionNames.map((name) => {
    const r = regions.get(name)!;
    return {
      name,
      averageThickness: r.count > 0 ? r.sum / r.count : 0,
    };
  });
}
