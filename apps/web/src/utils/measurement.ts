/**
 * Measurement Utilities — convert pixel measurements to real-world units.
 *
 * Uses DICOM PixelSpacing to calibrate measurements from pixel coordinates
 * to physical units (mm, μm, cm).
 */

/** Pixel spacing from DICOM metadata [row, column] in mm */
export type PixelSpacing = [number, number];

export type LengthUnit = 'mm' | 'cm' | 'μm';
export type AreaUnit = 'mm²' | 'cm²' | 'μm²';

/** Conversion factors to mm */
const TO_MM: Record<LengthUnit, number> = {
  'mm': 1,
  'cm': 0.1,
  'μm': 1000,
};

const AREA_TO_MM2: Record<AreaUnit, number> = {
  'mm²': 1,
  'cm²': 0.01,
  'μm²': 1000000,
};

/**
 * Calculate Euclidean distance between two points in pixel coordinates.
 */
export function pixelDistance(
  p1: { x: number; y: number },
  p2: { x: number; y: number }
): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Convert pixel distance to real-world distance.
 *
 * @param pixelDist - Distance in pixels
 * @param pixelSpacing - [rowSpacing, colSpacing] in mm/pixel
 * @param unit - Target unit
 * @returns Distance in specified unit
 */
export function pixelToRealDistance(
  pixelDist: number,
  pixelSpacing: PixelSpacing,
  unit: LengthUnit = 'mm'
): number {
  // Average row and column spacing for isotropic measurement
  const avgSpacing = (pixelSpacing[0] + pixelSpacing[1]) / 2;
  const mmDist = pixelDist * avgSpacing;
  return mmDist * TO_MM[unit];
}

/**
 * Convert pixel area to real-world area.
 *
 * @param pixelArea - Area in pixels²
 * @param pixelSpacing - [rowSpacing, colSpacing] in mm/pixel
 * @param unit - Target unit
 * @returns Area in specified unit
 */
export function pixelToRealArea(
  pixelArea: number,
  pixelSpacing: PixelSpacing,
  unit: AreaUnit = 'mm²'
): number {
  const areaMm2 = pixelArea * pixelSpacing[0] * pixelSpacing[1];
  return areaMm2 * AREA_TO_MM2[unit];
}

/**
 * Calculate length measurement between two points.
 *
 * @returns Object with pixel value, real value, and formatted string
 */
export function calculateLength(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  pixelSpacing: PixelSpacing | null,
  unit: LengthUnit = 'mm'
): { pixelValue: number; realValue: number | null; displayText: string } {
  const pixelValue = pixelDistance(p1, p2);

  if (!pixelSpacing) {
    return {
      pixelValue,
      realValue: null,
      displayText: `${pixelValue.toFixed(1)} px`,
    };
  }

  const realValue = pixelToRealDistance(pixelValue, pixelSpacing, unit);
  return {
    pixelValue,
    realValue,
    displayText: formatMeasurement(realValue, unit),
  };
}

/**
 * Calculate area of an ellipse from its radii.
 */
export function calculateEllipseArea(
  radiusX: number,
  radiusY: number,
  pixelSpacing: PixelSpacing | null,
  unit: AreaUnit = 'mm²'
): { pixelValue: number; realValue: number | null; displayText: string } {
  const pixelArea = Math.PI * radiusX * radiusY;

  if (!pixelSpacing) {
    return {
      pixelValue: pixelArea,
      realValue: null,
      displayText: `${pixelArea.toFixed(1)} px²`,
    };
  }

  const realValue = pixelToRealArea(pixelArea, pixelSpacing, unit);
  return {
    pixelValue: pixelArea,
    realValue,
    displayText: formatMeasurement(realValue, unit),
  };
}

/**
 * Calculate area of a rectangle.
 */
export function calculateRectangleArea(
  width: number,
  height: number,
  pixelSpacing: PixelSpacing | null,
  unit: AreaUnit = 'mm²'
): { pixelValue: number; realValue: number | null; displayText: string } {
  const pixelArea = width * height;

  if (!pixelSpacing) {
    return {
      pixelValue: pixelArea,
      realValue: null,
      displayText: `${pixelArea.toFixed(1)} px²`,
    };
  }

  const realValue = pixelToRealArea(pixelArea, pixelSpacing, unit);
  return {
    pixelValue: pixelArea,
    realValue,
    displayText: formatMeasurement(realValue, unit),
  };
}

/**
 * Calculate angle between three points (vertex at p2).
 */
export function calculateAngle(
  p1: { x: number; y: number },
  p2: { x: number; y: number },
  p3: { x: number; y: number }
): { degrees: number; displayText: string } {
  const v1 = { x: p1.x - p2.x, y: p1.y - p2.y };
  const v2 = { x: p3.x - p2.x, y: p3.y - p2.y };

  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
  const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

  if (mag1 === 0 || mag2 === 0) {
    return { degrees: 0, displayText: '0.0°' };
  }

  const cosAngle = Math.max(-1, Math.min(1, dot / (mag1 * mag2)));
  const degrees = (Math.acos(cosAngle) * 180) / Math.PI;

  return {
    degrees,
    displayText: `${degrees.toFixed(1)}°`,
  };
}

/**
 * Format a measurement value with appropriate precision.
 */
export function formatMeasurement(value: number, unit: string): string {
  if (unit === '°') {
    return `${value.toFixed(1)}°`;
  }

  // Adaptive precision based on value magnitude
  if (Math.abs(value) < 0.01) {
    return `${value.toExponential(2)} ${unit}`;
  } else if (Math.abs(value) < 1) {
    return `${value.toFixed(3)} ${unit}`;
  } else if (Math.abs(value) < 100) {
    return `${value.toFixed(2)} ${unit}`;
  } else {
    return `${value.toFixed(1)} ${unit}`;
  }
}

/**
 * Convert between length units.
 */
export function convertLength(
  value: number,
  fromUnit: LengthUnit,
  toUnit: LengthUnit
): number {
  const mmValue = value / TO_MM[fromUnit];
  return mmValue * TO_MM[toUnit];
}

/**
 * Convert between area units.
 */
export function convertArea(
  value: number,
  fromUnit: AreaUnit,
  toUnit: AreaUnit
): number {
  const mm2Value = value / AREA_TO_MM2[fromUnit];
  return mm2Value * AREA_TO_MM2[toUnit];
}

/**
 * Check if pixel spacing is available and valid.
 */
export function hasValidPixelSpacing(
  pixelSpacing: PixelSpacing | null | undefined
): pixelSpacing is PixelSpacing {
  return (
    pixelSpacing !== null &&
    pixelSpacing !== undefined &&
    pixelSpacing[0] > 0 &&
    pixelSpacing[1] > 0
  );
}
