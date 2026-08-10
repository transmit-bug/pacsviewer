/**
 * Measurement extraction — typed extraction from Cornerstone annotation
 * serialization (wayfinder #92 contract) into measurement snapshot rows.
 *
 * Pure functions, no DB access, so they are directly unit-testable
 * (see apps/server/tests/measurement-points.test.ts).
 *
 * Contract input (one serialized annotation):
 *   {
 *     id, toolName: 'Length' | 'Angle' | 'EllipticalROI' | 'RectangleROI' | 'Probe' | ...,
 *     data: { handles: { points }, cachedStats?: { [targetId]: stats }, label?, text? },
 *   }
 *
 * cachedStats are the real Cornerstone results; units are whatever Cornerstone
 * reported (mm / ° / mm² ...). When no calibration exists, Cornerstone reports
 * px — we record it honestly and flag `calibrated: false`.
 */

export interface ExtractedMeasurement {
  measurementKey: string;
  type: string;
  value: number;
  unit: string;
  calibrated: boolean;
}

export interface MeasurementDefinitionLookup {
  key: string;
  displayName: string;
}

/** Tool names that produce a numeric measurement we can snapshot. */
const MEASURING_TOOLS = new Set([
  'Length',
  'Angle',
  'EllipticalROI',
  'RectangleROI',
  'Probe',
]);

/** Map Cornerstone toolName → snapshot type label. */
export function toolToType(toolName: string): string {
  switch (toolName) {
    case 'Length':
      return 'length';
    case 'Angle':
      return 'angle';
    case 'EllipticalROI':
    case 'RectangleROI':
      return 'area';
    case 'Probe':
      return 'probe';
    default:
      return toolName;
  }
}

/** Unwrap cachedStats (keyed by targetId) to the first target's stats object. */
export function firstTargetStats(cachedStats?: Record<string, any>): Record<string, any> | null {
  if (!cachedStats || typeof cachedStats !== 'object') return null;
  for (const key of Object.keys(cachedStats)) {
    const v = cachedStats[key];
    if (v && typeof v === 'object') return v;
  }
  return null;
}

/**
 * Resolve the controlled dictionary key for an annotation label.
 * Matches dictionary `key` or `displayName` (case-insensitive, ignoring
 * surrounding whitespace). Falls back to a slugified label so free-form
 * measurements still aggregate; tool name is the last resort.
 */
export function resolveMeasurementKey(
  label: string | null | undefined,
  toolName: string,
  definitions: MeasurementDefinitionLookup[],
): string {
  const raw = (label || '').trim();
  if (raw) {
    const lower = raw.toLowerCase();
    for (const def of definitions) {
      if (def.key.toLowerCase() === lower) return def.key;
      if (def.displayName.toLowerCase() === lower) return def.key;
    }
    return slugify(raw);
  }
  return slugify(toolName);
}

/** Slugify a Chinese/ASCII label into a stable dictionary-ish key. */
export function slugify(text: string): string {
  const s = text
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return s || 'unclassified';
}

/** True when the unit is pixel-space (uncalibrated). */
export function isPixelUnit(unit: string | null | undefined): boolean {
  return !!unit && /px/i.test(unit);
}

/**
 * Extract a numeric snapshot from one serialized annotation.
 *
 * @returns ExtractedMeasurement or null when the tool/value is not numeric.
 */
export function extractMeasurementValue(
  annotation: {
    toolName: string;
    data?: { cachedStats?: Record<string, any>; label?: string; text?: string };
  },
  definitions: MeasurementDefinitionLookup[],
): ExtractedMeasurement | null {
  const toolName = annotation.toolName;
  if (!MEASURING_TOOLS.has(toolName)) return null;

  const stats = firstTargetStats(annotation.data?.cachedStats);
  if (!stats) return null;

  let value: number | null = null;
  let unit = '';

  switch (toolName) {
    case 'Length': {
      const v = stats.length ?? stats.distance;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      value = v;
      unit = typeof stats.unit === 'string' && stats.unit ? stats.unit
        : typeof stats.distanceUnit === 'string' && stats.distanceUnit ? stats.distanceUnit
        : 'px';
      break;
    }
    case 'Angle': {
      const v = stats.angle;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      value = v;
      unit = '°';
      break;
    }
    case 'EllipticalROI':
    case 'RectangleROI': {
      const v = stats.area;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      value = v;
      unit = typeof stats.areaUnit === 'string' && stats.areaUnit ? stats.areaUnit : 'px²';
      break;
    }
    case 'Probe': {
      const v = stats.scalarValue ?? stats.value;
      if (typeof v !== 'number' || !Number.isFinite(v)) return null;
      value = v;
      unit = typeof stats.unit === 'string' && stats.unit ? stats.unit
        : typeof stats.modalityUnit === 'string' && stats.modalityUnit ? stats.modalityUnit
        : 'unknown';
      break;
    }
    default:
      return null;
  }

  return {
    measurementKey: resolveMeasurementKey(
      annotation.data?.label ?? annotation.data?.text,
      toolName,
      definitions,
    ),
    type: toolToType(toolName),
    value,
    unit,
    calibrated: !isPixelUnit(unit),
  };
}

/** Extract measurements from a batch of serialized annotations. */
export function extractMeasurements(
  annotations: Array<{
    toolName: string;
    data?: { cachedStats?: Record<string, any>; label?: string; text?: string };
  }>,
  definitions: MeasurementDefinitionLookup[],
): ExtractedMeasurement[] {
  return annotations
    .map((a) => extractMeasurementValue(a, definitions))
    .filter((m): m is ExtractedMeasurement => m !== null);
}
