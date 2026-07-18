/**
 * OCT Thickness Map Generation
 *
 * Generates 2D thickness maps from OCT volume data.
 * Supports multiple thickness metrics (total retinal thickness, RNFL, etc.)
 */

import { detectRetinalLayers, type LayerId, type RetinalLayerBoundary, type PixelSpacing } from './layers';

/** Thickness map data structure */
export interface ThicknessMapData {
  width: number;
  height: number;
  data: Float32Array;
  stats: ThicknessStats;
}

/** Thickness statistics */
export interface ThicknessStats {
  centerThickness: number;
  averageThickness: number;
  minThickness: number;
  maxThickness: number;
  minPosition: { x: number; y: number };
  maxPosition: { x: number; y: number };
  etdrsRegions: Array<{
    name: string;
    averageThickness: number;
  }>;
}

/** Thickness type to calculate */
export type ThicknessType =
  | 'total'      // ILM to RPE
  | 'retinal'    // ILM to BM
  | 'rnfl'       // NFL (ILM to GCL)
  | 'gcl_ipl'    // GCL+IPL complex
  | 'inl'        // Inner nuclear layer
  | 'opl'        // Outer plexiform layer
  | 'onl'        // Outer nuclear layer
  | 'photoreceptor'; // IS/OS to RPE

/** Layer pairs for thickness calculation */
const THICKNESS_LAYERS: Record<ThicknessType, { upper: LayerId; lower: LayerId }> = {
  total: { upper: 'ILM', lower: 'RPE' },
  retinal: { upper: 'ILM', lower: 'BM' },
  rnfl: { upper: 'ILM', lower: 'GCL' },
  gcl_ipl: { upper: 'GCL', lower: 'INL' },
  inl: { upper: 'INL', lower: 'OPL' },
  opl: { upper: 'OPL', lower: 'ONL' },
  onl: { upper: 'ONL', lower: 'ELM' },
  photoreceptor: { upper: 'ISOS', lower: 'RPE' },
};

/**
 * Generate thickness map from OCT B-scan frames.
 *
 * @param frames - Array of B-scan pixel data (Uint8Array per frame)
 * @param frameWidth - Width of each B-scan
 * @param frameHeight - Height of each B-scan
 * @param pixelSpacing - Pixel spacing [axial, lateral]
 * @param thicknessType - Type of thickness to calculate
 * @returns Thickness map data
 */
export function generateThicknessMap(
  frames: Uint8Array[],
  frameWidth: number,
  frameHeight: number,
  pixelSpacing: PixelSpacing,
  thicknessType: ThicknessType = 'total'
): ThicknessMapData {
  const numFrames = frames.length;
  const thicknessData = new Float32Array(numFrames * frameWidth);

  const { upper, lower } = THICKNESS_LAYERS[thicknessType];

  // Process each B-scan
  for (let frameIdx = 0; frameIdx < numFrames; frameIdx++) {
    const pixels = frames[frameIdx];

    // Detect layers in this frame
    const layers = detectRetinalLayers(pixels, frameWidth, frameHeight, pixelSpacing);

    // Find upper and lower boundaries
    const upperBoundary = layers.find((l) => l.layer === upper);
    const lowerBoundary = layers.find((l) => l.layer === lower);

    if (!upperBoundary || !lowerBoundary) {
      // Skip frame if layers not detected
      continue;
    }

    // Calculate thickness for each A-scan
    for (let x = 0; x < frameWidth; x++) {
      const upperY = upperBoundary.points[x]?.y ?? 0;
      const lowerY = lowerBoundary.points[x]?.y ?? 0;
      const pixelThickness = Math.abs(lowerY - upperY);

      // Convert to μm
      thicknessData[frameIdx * frameWidth + x] = pixelThickness * pixelSpacing.axial * 1000;
    }
  }

  // Calculate statistics
  const stats = calculateThicknessStats(thicknessData, frameWidth, numFrames, pixelSpacing);

  return {
    width: frameWidth,
    height: numFrames,
    data: thicknessData,
    stats,
  };
}

/**
 * Calculate thickness statistics from thickness map data.
 */
function calculateThicknessStats(
  data: Float32Array,
  width: number,
  height: number,
  pixelSpacing: PixelSpacing
): ThicknessStats {
  let sum = 0;
  let count = 0;
  let min = Infinity;
  let max = -Infinity;
  let minPos = { x: 0, y: 0 };
  let maxPos = { x: 0, y: 0 };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = data[y * width + x];
      if (val <= 0) continue;

      sum += val;
      count++;

      if (val < min) {
        min = val;
        minPos = { x, y };
      }
      if (val > max) {
        max = val;
        maxPos = { x, y };
      }
    }
  }

  // Center thickness (center of the map)
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);
  const centerThickness = data[centerY * width + centerX] || 0;

  // Generate ETDRS regions
  const etdrsRegions = generateSimpleETDRS(data, width, height, pixelSpacing);

  return {
    centerThickness,
    averageThickness: count > 0 ? sum / count : 0,
    minThickness: min === Infinity ? 0 : min,
    maxThickness: max === -Infinity ? 0 : max,
    minPosition: minPos,
    maxPosition: maxPos,
    etdrsRegions,
  };
}

/**
 * Simplified ETDRS region generation for statistics.
 */
function generateSimpleETDRS(
  data: Float32Array,
  width: number,
  height: number,
  pixelSpacing: PixelSpacing
): Array<{ name: string; averageThickness: number }> {
  const centerX = width / 2;
  const centerY = height / 2;
  const lateralToMm = pixelSpacing.lateral;

  const innerRadius = 1.5 / lateralToMm;
  const outerRadius = 3.0 / lateralToMm;

  const regions: Map<string, { sum: number; count: number }> = new Map();
  const regionNames = [
    '中心', '内上方', '内鼻侧', '内下方', '内颞侧',
    '外上方', '外鼻侧', '外下方', '外颞侧',
  ];

  for (const name of regionNames) {
    regions.set(name, { sum: 0, count: 0 });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = data[y * width + x];
      if (val <= 0) continue;

      const dx = (x - centerX) * lateralToMm;
      const dy = (y - centerY) * lateralToMm;
      const dist = Math.sqrt(dx * dx + dy * dy);

      let region: string;

      if (dist <= innerRadius) {
        region = '中心';
      } else if (dist <= outerRadius) {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle >= -45 && angle < 45) region = '内鼻侧';
        else if (angle >= 45 && angle < 135) region = '内上方';
        else if (angle >= -135 && angle < -45) region = '内下方';
        else region = '内颞侧';
      } else {
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        if (angle >= -45 && angle < 45) region = '外鼻侧';
        else if (angle >= 45 && angle < 135) region = '外上方';
        else if (angle >= -135 && angle < -45) region = '外下方';
        else region = '外颞侧';
      }

      const r = regions.get(region)!;
      r.sum += val;
      r.count++;
    }
  }

  return regionNames.map((name) => {
    const r = regions.get(name)!;
    return {
      name,
      averageThickness: r.count > 0 ? r.sum / r.count : 0,
    };
  });
}

/**
 * Generate en-face projection from OCT volume.
 *
 * @param frames - Array of B-scan pixel data
 * @param frameWidth - Width of each frame
 * @param frameHeight - Height of each frame
 * @param method - Projection method
 * @returns En-face projection as Uint8Array
 */
export function generateEnfaceProjection(
  frames: Uint8Array[],
  frameWidth: number,
  frameHeight: number,
  method: 'average' | 'maximum' | 'minimum' = 'average'
): Uint8Array {
  const numFrames = frames.length;
  const result = new Uint8Array(frameWidth * frameHeight);

  for (let y = 0; y < frameHeight; y++) {
    for (let x = 0; x < frameWidth; x++) {
      let value: number;

      switch (method) {
        case 'maximum': {
          let max = 0;
          for (let f = 0; f < numFrames; f++) {
            const pixel = frames[f][y * frameWidth + x];
            if (pixel > max) max = pixel;
          }
          value = max;
          break;
        }
        case 'minimum': {
          let min = 255;
          for (let f = 0; f < numFrames; f++) {
            const pixel = frames[f][y * frameWidth + x];
            if (pixel < min) min = pixel;
          }
          value = min;
          break;
        }
        case 'average':
        default: {
          let sum = 0;
          for (let f = 0; f < numFrames; f++) {
            sum += frames[f][y * frameWidth + x];
          }
          value = Math.round(sum / numFrames);
          break;
        }
      }

      result[y * frameWidth + x] = value;
    }
  }

  return result;
}

/**
 * Color maps for thickness visualization
 */
export const COLOR_MAPS = {
  jet: (t: number): [number, number, number] => {
    const r = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 * t - 0.5))));
    const g = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 * (1 - Math.abs(t - 0.5))))));
    const b = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 * (1 - t) - 0.5))));
    return [r, g, b];
  },
  hot: (t: number): [number, number, number] => {
    const r = Math.min(255, Math.round(255 * Math.min(1, t * 3)));
    const g = Math.min(255, Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1))));
    const b = Math.min(255, Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2))));
    return [r, g, b];
  },
  viridis: (t: number): [number, number, number] => {
    // Simplified viridis approximation
    const r = Math.round(68 + t * (253 - 68));
    const g = Math.round(1 + t * (231 - 1));
    const b = Math.round(84 + (1 - t) * (168 - 84));
    return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
  },
  gray: (t: number): [number, number, number] => {
    const v = Math.round(t * 255);
    return [v, v, v];
  },
};

/**
 * Render thickness map as RGBA pixel data for Canvas.
 *
 * @param data - Thickness map data (Float32Array)
 * @param width - Map width
 * @param height - Map height
 * @param colorMap - Color map name
 * @param min - Minimum value for normalization (auto if not specified)
 * @param max - Maximum value for normalization (auto if not specified)
 * @returns RGBA pixel data (Uint8ClampedArray)
 */
export function renderThicknessMap(
  data: Float32Array,
  width: number,
  height: number,
  colorMap: keyof typeof COLOR_MAPS = 'jet',
  min?: number,
  max?: number
): Uint8ClampedArray {
  // Auto-detect range if not specified
  if (min === undefined || max === undefined) {
    let autoMin = Infinity;
    let autoMax = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] > 0) {
        if (data[i] < autoMin) autoMin = data[i];
        if (data[i] > autoMax) autoMax = data[i];
      }
    }
    min = min ?? autoMin;
    max = max ?? autoMax;
  }

  const range = max! - min!;
  const colorFn = COLOR_MAPS[colorMap];
  const result = new Uint8ClampedArray(width * height * 4);

  for (let i = 0; i < width * height; i++) {
    const val = data[i];

    if (val <= 0) {
      // Transparent for no-data
      result[i * 4 + 3] = 0;
      continue;
    }

    // Normalize to 0-1
    const t = range > 0 ? Math.max(0, Math.min(1, (val - min!) / range)) : 0.5;
    const [r, g, b] = colorFn(t);

    result[i * 4] = r;
    result[i * 4 + 1] = g;
    result[i * 4 + 2] = b;
    result[i * 4 + 3] = 255;
  }

  return result;
}
