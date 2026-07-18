/**
 * ETDRS (Early Treatment Diabetic Retinopathy Study) Grid Utilities
 *
 * Shared logic for ETDRS region calculations used in:
 * - OCT layer thickness analysis
 * - Retinal thickness mapping
 * - Fundus image analysis
 *
 * ETDRS 9 regions:
 *   ┌─────┬─────┬─────┐
 *   │  1  │  2  │  3  │
 *   ├─────┼─────┼─────┤
 *   │  4  │  5  │  6  │  (center = 1mm, inner = 3mm, outer = 6mm)
 *   ├─────┼─────┼─────┤
 *   │  7  │  8  │  9  │
 *   └─────┴─────┴─────┘
 */

/** Standard ETDRS region names (9 regions) */
export const ETDRS_REGION_NAMES = [
  '中心', '内上方', '内鼻侧', '内下方', '内颞侧',
  '外上方', '外鼻侧', '外下方', '外颞侧',
] as const;

/** ETDRS region result */
export interface ETDRSRegion {
  name: string;
  averageThickness: number;
}

/** Pixel spacing with axial and lateral components */
export interface ETDRSPixelSpacing {
  axial: number;
  lateral: number;
}

/**
 * Determine which ETDRS region a point belongs to.
 *
 * @param dx - X distance from center in mm
 * @param dy - Y distance from center in mm
 * @param innerRadius - Inner ring radius in mm (default 1.5 = 3mm diameter)
 * @param outerRadius - Outer ring radius in mm (default 3.0 = 6mm diameter)
 * @returns Region name
 */
export function getETDRSRegion(
  dx: number,
  dy: number,
  innerRadius = 1.5,
  outerRadius = 3.0
): string {
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist <= innerRadius) {
    return '中心';
  }

  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;

  if (dist <= outerRadius) {
    // Inner ring
    if (angle >= -45 && angle < 45) return '内鼻侧';
    if (angle >= 45 && angle < 135) return '内上方';
    if (angle >= -135 && angle < -45) return '内下方';
    return '内颞侧';
  }

  // Outer ring
  if (angle >= -45 && angle < 45) return '外鼻侧';
  if (angle >= 45 && angle < 135) return '外上方';
  if (angle >= -135 && angle < -45) return '外下方';
  return '外颞侧';
}

/**
 * Accumulate values into ETDRS regions from a 2D data array.
 *
 * @param data - 2D data array (Float32Array, row-major)
 * @param width - Data width
 * @param height - Data height
 * @param pixelSpacing - Pixel spacing {axial, lateral} in mm
 * @returns Array of ETDRS regions with average values
 */
export function accumulateETDRSRegions(
  data: Float32Array,
  width: number,
  height: number,
  pixelSpacing: ETDRSPixelSpacing
): ETDRSRegion[] {
  const centerX = width / 2;
  const centerY = height / 2;
  const lateralToMm = pixelSpacing.lateral;

  // ETDRS ring radii in pixels
  const innerRadius = 1.5 / lateralToMm; // 3mm diameter = 1.5mm radius
  const outerRadius = 3.0 / lateralToMm; // 6mm diameter = 3mm radius

  // Accumulate values per region
  const regions: Map<string, { sum: number; count: number }> = new Map();
  for (const name of ETDRS_REGION_NAMES) {
    regions.set(name, { sum: 0, count: 0 });
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const val = data[y * width + x];
      if (val <= 0) continue;

      const dx = (x - centerX) * lateralToMm;
      const dy = (y - centerY) * lateralToMm;

      const region = getETDRSRegion(dx, dy, innerRadius, outerRadius);
      const r = regions.get(region);
      if (r) {
        r.sum += val;
        r.count++;
      }
    }
  }

  // Calculate averages
  return ETDRS_REGION_NAMES.map((name) => {
    const r = regions.get(name)!;
    return {
      name,
      averageThickness: r.count > 0 ? r.sum / r.count : 0,
    };
  });
}

/**
 * Color maps for thickness visualization.
 *
 * Each function maps a normalized value t ∈ [0,1] to an RGB triplet.
 */
export const COLOR_MAPS: Record<string, (t: number) => [number, number, number]> = {
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
