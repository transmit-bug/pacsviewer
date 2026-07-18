/**
 * Corneal Topography Renderer — Canvas 2D rendering for corneal maps.
 *
 * Renders:
 * - Curvature map (Keratometry)
 * - Thickness map (Pachymetry)
 * - Elevation maps (anterior/posterior)
 *
 * Uses Canvas 2D with color mapping (not Cornerstone).
 */

// ─── Color Maps ──────────────────────────────────────────────────────────────

export type ColorMap = 'jet' | 'hot' | 'viridis' | 'inferno' | 'plasma';

/** Jet colormap: blue → cyan → green → yellow → red */
function jetColorMap(t: number): [number, number, number] {
  const r = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 - Math.abs(4 * t - 3)))));
  const g = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 - Math.abs(4 * t - 2)))));
  const b = Math.min(255, Math.max(0, Math.round(255 * Math.min(1, 1.5 - Math.abs(4 * t - 1)))));
  return [r, g, b];
}

/** Hot colormap: black → red → yellow → white */
function hotColorMap(t: number): [number, number, number] {
  const r = Math.min(255, Math.round(255 * Math.min(1, t * 3)));
  const g = Math.min(255, Math.round(255 * Math.max(0, Math.min(1, t * 3 - 1))));
  const b = Math.min(255, Math.round(255 * Math.max(0, Math.min(1, t * 3 - 2))));
  return [r, g, b];
}

/** Viridis approximation */
function viridisColorMap(t: number): [number, number, number] {
  const r = Math.round(68 + t * (253 - 68));
  const g = Math.round(1 + t * (231 - 1));
  const b = Math.round(84 + (1 - t) * (150 - 84));
  return [Math.min(255, r), Math.min(255, g), Math.min(255, b)];
}

const COLOR_MAPS: Record<ColorMap, (t: number) => [number, number, number]> = {
  jet: jetColorMap,
  hot: hotColorMap,
  viridis: viridisColorMap,
  inferno: hotColorMap,    // fallback
  plasma: jetColorMap,     // fallback
};

// ─── Corneal Data Types ──────────────────────────────────────────────────────

export interface CornealParameters {
  /** K1: flat meridian (Diopters) */
  k1: number;
  /** K2: steep meridian (Diopters) */
  k2: number;
  /** Corneal astigmatism (D) */
  astigmatism: number;
  /** Asphericity factor (Q value) */
  qValue: number;
  /** White-to-white diameter (mm) */
  whiteToWhite: number;
  /** Corneal diameter (mm) */
  cornealDiameter: number;
  /** Laterality: left or right eye */
  laterality: 'OD' | 'OS';
}

export interface CornealMapData {
  /** 2D data matrix (NxN) */
  data: number[][];
  /** Matrix dimension (e.g., 128 or 256) */
  size: number;
  /** Map type */
  type: 'curvature' | 'thickness' | 'elevation_anterior' | 'elevation_posterior';
  /** Unit for values */
  unit: string;
  /** Min value in data */
  min: number;
  /** Max value in data */
  max: number;
  /** Corneal parameters */
  parameters?: CornealParameters;
}

// ─── Rendering ───────────────────────────────────────────────────────────────

export interface CornealRenderOptions {
  /** Canvas to render on */
  canvas: HTMLCanvasElement;
  /** Corneal map data */
  mapData: CornealMapData;
  /** Color map to use */
  colorMap?: ColorMap;
  /** Show contour lines */
  showContours?: boolean;
  /** Contour interval (in data units) */
  contourInterval?: number;
  /** Show parameters overlay */
  showParameters?: boolean;
  /** Scale factor for rendering */
  scale?: number;
}

/**
 * Render a corneal topography map on a canvas.
 */
export function renderCornealMap(options: CornealRenderOptions): void {
  const {
    canvas,
    mapData,
    colorMap = 'jet',
    showContours = false,
    contourInterval = 1,
    showParameters = true,
    scale = 1,
  } = options;

  const { data, size, min, max, unit, parameters } = mapData;
  const colorFn = COLOR_MAPS[colorMap];

  const canvasSize = size * scale;
  canvas.width = canvasSize;
  canvas.height = canvasSize;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  // Create image data for fast rendering
  const imageData = ctx.createImageData(canvasSize, canvasSize);
  const pixels = imageData.data;

  const range = max - min || 1;
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  for (let y = 0; y < canvasSize; y++) {
    for (let x = 0; x < canvasSize; x++) {
      const srcX = Math.floor(x / scale);
      const srcY = Math.floor(y / scale);

      // Check if point is within circular cornea boundary
      const dx = srcX - cx;
      const dy = srcY - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      const pixelIdx = (y * canvasSize + x) * 4;

      if (dist <= radius) {
        const value = data[srcY]?.[srcX] ?? 0;
        const t = Math.max(0, Math.min(1, (value - min) / range));
        const [r, g, b] = colorFn(t);

        pixels[pixelIdx] = r;
        pixels[pixelIdx + 1] = g;
        pixels[pixelIdx + 2] = b;
        pixels[pixelIdx + 3] = 255;
      } else {
        // Outside cornea: transparent
        pixels[pixelIdx + 3] = 0;
      }
    }
  }

  ctx.putImageData(imageData, 0, 0);

  // Draw contour lines
  if (showContours && contourInterval > 0) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.lineWidth = 0.5;

    for (let level = Math.ceil(min / contourInterval) * contourInterval; level <= max; level += contourInterval) {
      ctx.beginPath();
      for (let y = 0; y < size - 1; y++) {
        for (let x = 0; x < size - 1; x++) {
          const v00 = data[y][x];
          const v10 = data[y][x + 1];
          const v01 = data[y + 1][x];
          const dx = x - cx;
          const dy = y - cy;
          if (Math.sqrt(dx * dx + dy * dy) > radius) continue;

          // Simple contour detection
          if ((v00 < level && v10 >= level) || (v00 >= level && v10 < level)) {
            const sx = (x + 0.5) * scale;
            const sy = y * scale;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, sy + scale);
          }
          if ((v00 < level && v01 >= level) || (v00 >= level && v01 < level)) {
            const sx = x * scale;
            const sy = (y + 0.5) * scale;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + scale, sy);
          }
        }
      }
      ctx.stroke();
    }
  }

  // Draw parameters overlay
  if (showParameters && parameters) {
    const padding = 8;
    const lineHeight = 14;
    ctx.font = `${11 * scale}px monospace`;

    const lines = [
      `${parameters.laterality} — ${mapData.type === 'curvature' ? '曲率图' : '厚度图'}`,
      `K1: ${parameters.k1.toFixed(2)} D`,
      `K2: ${parameters.k2.toFixed(2)} D`,
      `散光: ${parameters.astigmatism.toFixed(2)} D`,
      `Q值: ${parameters.qValue.toFixed(2)}`,
      `WTW: ${parameters.whiteToWhite.toFixed(1)} mm`,
    ];

    // Background
    const maxWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    ctx.fillRect(padding, padding, maxWidth + padding * 2, lines.length * lineHeight + padding * 2);

    // Text
    ctx.fillStyle = '#ffffff';
    lines.forEach((line, i) => {
      ctx.fillText(line, padding * 2, padding + (i + 1) * lineHeight);
    });
  }

  // Color bar legend
  const barWidth = 12;
  const barHeight = canvasSize * 0.6;
  const barX = canvasSize - barWidth - 8;
  const barY = (canvasSize - barHeight) / 2;

  for (let i = 0; i < barHeight; i++) {
    const t = i / barHeight;
    const [r, g, b] = colorFn(1 - t); // reversed: top = max
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.fillRect(barX, barY + i, barWidth, 1);
  }

  // Legend labels
  ctx.fillStyle = '#ffffff';
  ctx.font = `${9 * scale}px monospace`;
  ctx.fillText(`${max.toFixed(1)}`, barX - ctx.measureText(`${max.toFixed(1)}`).width - 4, barY + 9);
  ctx.fillText(`${min.toFixed(1)}`, barX - ctx.measureText(`${min.toFixed(1)}`).width - 4, barY + barHeight);
  ctx.fillText(unit, barX - ctx.measureText(unit).width - 4, barY + barHeight / 2);
}

// ─── Demo Data Generator ─────────────────────────────────────────────────────

/**
 * Generate demo corneal curvature data for testing.
 */
export function generateDemoCurvatureData(size = 128): CornealMapData {
  const data: number[][] = [];
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Simulate curvature: steeper in center, flatter periphery
        // Plus some astigmatism (elliptical pattern)
        const t = dist / radius;
        const base = 43.5 + 2 * (1 - t * t); // central steepness
        const astig = 0.8 * Math.cos(2 * Math.atan2(dy, dx)); // astigmatism
        const noise = (Math.random() - 0.5) * 0.3;
        row.push(base + astig + noise);
      } else {
        row.push(0);
      }
    }
    data.push(row);
  }

  return {
    data,
    size,
    type: 'curvature',
    unit: 'D',
    min: 39,
    max: 48,
    parameters: {
      k1: 43.2,
      k2: 44.5,
      astigmatism: 1.3,
      qValue: -0.26,
      whiteToWhite: 11.8,
      cornealDiameter: 11.5,
      laterality: 'OD',
    },
  };
}

/**
 * Generate demo corneal thickness data for testing.
 */
export function generateDemoThicknessData(size = 128): CornealMapData {
  const data: number[][] = [];
  const cx = size / 2;
  const cy = size / 2;
  const radius = size / 2 - 2;

  for (let y = 0; y < size; y++) {
    const row: number[] = [];
    for (let x = 0; x < size; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= radius) {
        // Thickness: central ~540μm, peripheral ~620μm
        const t = dist / radius;
        const thickness = 540 + 80 * t * t;
        const noise = (Math.random() - 0.5) * 5;
        row.push(thickness + noise);
      } else {
        row.push(0);
      }
    }
    data.push(row);
  }

  return {
    data,
    size,
    type: 'thickness',
    unit: 'μm',
    min: 500,
    max: 650,
  };
}
