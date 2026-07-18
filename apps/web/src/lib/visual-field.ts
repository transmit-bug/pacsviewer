/**
 * Visual Field Renderer — Canvas 2D rendering for perimetry results.
 *
 * Renders:
 * - Grayscale map (threshold sensitivity)
 * - Total Deviation map
 * - Pattern Deviation map
 * - MD/PSD/VFI global indices
 *
 * Supports 30-2 and 24-2 test patterns (76 / 54 test points).
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export type TestPattern = '30-2' | '24-2';

export interface VisualFieldPoint {
  /** X position in visual field (degrees) */
  x: number;
  /** Y position in visual field (degrees) */
  y: number;
  /** Threshold sensitivity (dB) */
  sensitivity: number;
  /** Total deviation from age normal (dB) */
  totalDeviation: number;
  /** Pattern deviation (dB) */
  patternDeviation: number;
  /** Probability for total deviation */
  tdProb: 'ns' | 'p5' | 'p2' | 'p1' | 'p0.5';
  /** Probability for pattern deviation */
  pdProb: 'ns' | 'p5' | 'p2' | 'p1' | 'p0.5';
  /** Is this a central 10° point? */
  isCentral: boolean;
}

export interface VisualFieldData {
  patientId: string;
  eye: 'OD' | 'OS';
  testPattern: TestPattern;
  testDate: string;
  points: VisualFieldPoint[];
  /** Mean Deviation */
  md: number;
  /** Pattern Standard Deviation */
  psd: number;
  /** Visual Field Index (%) */
  vfi: number;
  /** Reliability indices */
  reliability: {
    fixationLoss: number;
    falsePositives: number;
    falseNegatives: number;
  };
}

// ─── Test Point Layouts ──────────────────────────────────────────────────────

/** 30-2 test pattern: 76 points at 6° intervals within 30° */
const POINTS_30_2: Array<{ x: number; y: number; isCentral: boolean }> = [];
for (let j = -5; j <= 5; j++) {
  for (let i = -5; i <= 5; i++) {
    const x = i * 6;
    const y = j * 6;
    const dist = Math.sqrt(x * x + y * y);
    if (dist <= 30) {
      POINTS_30_2.push({ x, y, isCentral: dist <= 10 });
    }
  }
}

/** 24-2 test pattern: 54 points at 6° intervals within 24° */
const POINTS_24_2: Array<{ x: number; y: number; isCentral: boolean }> = [];
for (let j = -4; j <= 4; j++) {
  for (let i = -4; i <= 4; i++) {
    const x = i * 6;
    const y = j * 6;
    const dist = Math.sqrt(x * x + y * y);
    if (dist <= 24) {
      POINTS_24_2.push({ x, y, isCentral: dist <= 10 });
    }
  }
}

export function getTestPoints(pattern: TestPattern) {
  return pattern === '30-2' ? POINTS_30_2 : POINTS_24_2;
}

// ─── Age Normal Values (simplified) ──────────────────────────────────────────

/**
 * Get age-normal sensitivity for a point.
 * Simplified model: sensitivity decreases ~0.08 dB/year from age 20.
 * Base sensitivity at center ~32 dB, periphery ~28 dB.
 */
function getAgeNormalSensitivity(age: number, x: number, y: number): number {
  const dist = Math.sqrt(x * x + y * y);
  const baseSensitivity = dist <= 10 ? 32 : 30 - (dist - 10) * 0.1;
  const ageEffect = Math.max(0, (age - 20) * 0.08);
  return Math.max(0, baseSensitivity - ageEffect);
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export type MapType = 'grayscale' | 'total-deviation' | 'pattern-deviation';

export interface VisualFieldRenderOptions {
  canvas: HTMLCanvasElement;
  data: VisualFieldData;
  mapType: MapType;
  /** Patient age for normal value calculation */
  patientAge?: number;
  /** Canvas size */
  size?: number;
}

const PROB_COLORS = {
  ns: '#ffffff',
  p5: '#cccccc',
  p2: '#999999',
  p1: '#666666',
  'p0.5': '#000000',
};

const PROB_SYMBOLS = {
  ns: '',
  p5: '<5%',
  p2: '<2%',
  p1: '<1%',
  'p0.5': '<0.5%',
};

/**
 * Render a visual field map.
 */
export function renderVisualField(options: VisualFieldRenderOptions): void {
  const { canvas, data, mapType, size = 400 } = options;

  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const padding = 40;
  const plotSize = size - padding * 2;
  const maxEccentricity = data.testPattern === '30-2' ? 30 : 24;
  const scale = plotSize / (maxEccentricity * 2);

  // Background
  ctx.fillStyle = '#1a1a1a';
  ctx.fillRect(0, 0, size, size);

  // Draw concentric circles (10°, 20°, 30°)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 0.5;
  for (const deg of [10, 20, 30]) {
    if (deg > maxEccentricity) break;
    const r = deg * scale;
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Draw crosshairs
  ctx.beginPath();
  ctx.moveTo(size / 2, padding);
  ctx.lineTo(size / 2, size - padding);
  ctx.moveTo(padding, size / 2);
  ctx.lineTo(size - padding, size / 2);
  ctx.stroke();

  // Draw test points
  const pointRadius = Math.max(8, plotSize / 25);

  for (const point of data.points) {
    const cx = size / 2 + point.x * scale;
    const cy = size / 2 - point.y * scale; // Y is inverted

    let value: number;
    let prob: string;

    switch (mapType) {
      case 'grayscale':
        value = point.sensitivity;
        // Grayscale: 0 dB = black, 35+ dB = white
        const gray = Math.round((Math.min(35, value) / 35) * 255);
        ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray})`;
        prob = 'ns';
        break;

      case 'total-deviation':
        value = point.totalDeviation;
        prob = point.tdProb;
        if (value >= 0) {
          const g = Math.round(128 + (value / 10) * 127);
          ctx.fillStyle = `rgb(${Math.min(255, g)}, ${Math.min(255, g)}, ${Math.min(255, g)})`;
        } else {
          const intensity = Math.round(128 + (value / 10) * 128);
          ctx.fillStyle = `rgb(${Math.max(0, intensity)}, ${Math.max(0, intensity)}, ${Math.max(0, intensity)})`;
        }
        break;

      case 'pattern-deviation':
        value = point.patternDeviation;
        prob = point.pdProb;
        if (value >= 0) {
          const g = Math.round(128 + (value / 5) * 127);
          ctx.fillStyle = `rgb(${Math.min(255, g)}, ${Math.min(255, g)}, ${Math.min(255, g)})`;
        } else {
          const intensity = Math.round(128 + (value / 5) * 128);
          ctx.fillStyle = `rgb(${Math.max(0, intensity)}, ${Math.max(0, intensity)}, ${Math.max(0, intensity)})`;
        }
        break;
    }

    // Draw point circle
    ctx.beginPath();
    ctx.arc(cx, cy, pointRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw probability marker (deviation maps only)
    if (mapType !== 'grayscale' && prob !== 'ns') {
      ctx.fillStyle = PROB_COLORS[prob as keyof typeof PROB_COLORS];
      ctx.font = `${Math.max(7, pointRadius * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(PROB_SYMBOLS[prob as keyof typeof PROB_SYMBOLS], cx, cy);
    }

    // Draw sensitivity value (grayscale map)
    if (mapType === 'grayscale') {
      ctx.fillStyle = point.sensitivity > 18 ? '#000' : '#fff';
      ctx.font = `${Math.max(7, pointRadius * 0.7)}px monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(point.sensitivity).toString(), cx, cy);
    }
  }

  // Draw fixation cross
  ctx.strokeStyle = '#ff0000';
  ctx.lineWidth = 1;
  const fcSize = 6;
  ctx.beginPath();
  ctx.moveTo(size / 2 - fcSize, size / 2);
  ctx.lineTo(size / 2 + fcSize, size / 2);
  ctx.moveTo(size / 2, size / 2 - fcSize);
  ctx.lineTo(size / 2, size / 2 + fcSize);
  ctx.stroke();

  // Title
  ctx.fillStyle = '#ffffff';
  ctx.font = '12px sans-serif';
  ctx.textAlign = 'left';
  const titles: Record<MapType, string> = {
    grayscale: '灰度图',
    'total-deviation': '总偏差图',
    'pattern-deviation': '模式偏差图',
  };
  ctx.fillText(`${data.eye} — ${titles[mapType]}`, padding, 20);

  // Global indices
  ctx.font = '11px monospace';
  ctx.fillText(`MD: ${data.md.toFixed(2)} dB`, padding, size - 20);
  ctx.fillText(`PSD: ${data.psd.toFixed(2)} dB`, padding + 120, size - 20);
  ctx.fillText(`VFI: ${data.vfi.toFixed(1)}%`, padding + 240, size - 20);
}

// ─── Demo Data ───────────────────────────────────────────────────────────────

/**
 * Generate demo visual field data for testing.
 */
export function generateDemoVisualFieldData(pattern: TestPattern = '30-2'): VisualFieldData {
  const testPoints = getTestPoints(pattern);
  const points: VisualFieldPoint[] = testPoints.map((tp) => {
    const normal = getAgeNormalSensitivity(55, tp.x, tp.y);
    const noise = (Math.random() - 0.5) * 4;
    const sensitivity = Math.max(0, normal + noise);
    const totalDev = sensitivity - normal;
    const patternDev = totalDev + (Math.random() - 0.5) * 2;

    const getProb = (dev: number): VisualFieldPoint['tdProb'] => {
      if (Math.abs(dev) < 2) return 'ns';
      if (Math.abs(dev) < 3) return 'p5';
      if (Math.abs(dev) < 4) return 'p2';
      if (Math.abs(dev) < 5) return 'p1';
      return 'p0.5';
    };

    return {
      x: tp.x,
      y: tp.y,
      sensitivity,
      totalDeviation: totalDev,
      patternDeviation: patternDev,
      tdProb: getProb(totalDev),
      pdProb: getProb(patternDev),
      isCentral: tp.isCentral,
    };
  });

  const md = points.reduce((sum, p) => sum + p.totalDeviation, 0) / points.length;
  const psd = Math.sqrt(
    points.reduce((sum, p) => sum + p.patternDeviation ** 2, 0) / points.length
  );
  const vfi = Math.max(0, Math.min(100, 100 + md * 3));

  return {
    patientId: 'demo',
    eye: 'OD',
    testPattern: pattern,
    testDate: new Date().toISOString().split('T')[0],
    points,
    md,
    psd,
    vfi,
    reliability: {
      fixationLoss: 0.05,
      falsePositives: 0.03,
      falseNegatives: 0.02,
    },
  };
}
