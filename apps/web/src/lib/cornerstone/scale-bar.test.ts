import { describe, test, expect } from 'bun:test';
import { measureScaleBar, pickNiceMm } from './scale-bar';

/**
 * Minimal viewport double. Real Cornerstone viewports map world coords (mm,
 * when PixelSpacing exists) → canvas px via the camera; the per-axis factor is
 * exactly the "px per world mm" we measure. `scale` below is that factor.
 */
function makeViewport(opts: {
  spacing: [number, number, number];
  dims: [number, number, number];
  /** px per world mm (camera projection factor) */
  scale: number;
  hasPixelSpacing?: boolean;
}) {
  const { spacing, dims, scale, hasPixelSpacing = true } = opts;
  return {
    getImageData: () => ({ spacing, dimensions: dims, hasPixelSpacing }),
    worldToCanvas: ([x, y]: number[]) => [x * scale, y * scale],
  } as any;
}

describe('pickNiceMm', () => {
  test('picks a round mm value whose px length lands in the 40–140px target band', () => {
    expect(pickNiceMm(29)).toBe(2); // 2mm → 58px
    expect(pickNiceMm(58)).toBe(1); // 1mm → 58px
    expect(pickNiceMm(12)).toBe(5); // 5mm → 60px
    expect(pickNiceMm(0.2)).toBe(200); // zoomed way out → 200mm = 40px
    expect(pickNiceMm(200)).toBe(0.5); // zoomed in heavily → 0.5mm = 100px
  });
});

describe('measureScaleBar', () => {
  test('returns null when the viewport has no imageData', () => {
    expect(measureScaleBar({} as any)).toBeNull();
    expect(measureScaleBar({ getImageData: () => undefined } as any)).toBeNull();
  });

  test('returns null when the image has no real pixel spacing (uncalibrated)', () => {
    const vp = makeViewport({ spacing: [1, 1, 1], dims: [512, 512, 1], scale: 1.17, hasPixelSpacing: false });
    expect(measureScaleBar(vp)).toBeNull();
  });

  test('computes a calibrated bar from the camera projection', () => {
    // Fit of a 512px @0.04 mm/px fundus into a ~700px canvas → ~34 px/mm
    const vp = makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 34.2 });
    const bar = measureScaleBar(vp);
    expect(bar).not.toBeNull();
    expect(bar!.mm).toBe(2); // 2mm × 34.2 = 68px
    expect(bar!.px).toBe(68);
  });

  test('bar px length grows with zoom for the same nominal mm', () => {
    const base = measureScaleBar(makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 34.2 }), 2);
    const zoomed = measureScaleBar(makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 68.4 }), 2);
    expect(base!.px).toBe(68);
    expect(zoomed!.px).toBe(137);
    expect(zoomed!.px).toBeGreaterThan(base!.px);
  });

  test('without a preferred mm, zoom keeps the bar size stable and shrinks the label (map-scale behavior)', () => {
    const base = measureScaleBar(makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 34.2 }));
    const zoomed = measureScaleBar(makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 68.4 }));
    expect(base!.mm).toBe(2);
    expect(zoomed!.mm).toBe(1);
    expect(zoomed!.px).toBeLessThanOrEqual(base!.px + 1);
  });

  test('respects an explicit preferredMm', () => {
    const vp = makeViewport({ spacing: [0.04, 0.04, 1], dims: [512, 512, 1], scale: 34.2 });
    const bar = measureScaleBar(vp, 5);
    expect(bar!.mm).toBe(5);
    expect(bar!.px).toBe(171); // Math.round(5 × 34.2)
  });

  test('anisotropic spacing is honored through the world x-axis', () => {
    // OCT B-scan: x 0.011, y 0.0039 mm/px. Horizontal bar must follow the x
    // (column) spacing — here it shows up as a different px/mm than isotropic.
    const aniso = makeViewport({ spacing: [0.011, 0.0039, 1], dims: [1000, 512, 1], scale: 63.6 });
    const bar = measureScaleBar(aniso);
    expect(bar).not.toBeNull();
    expect(bar!.mm).toBe(1); // 1mm × 63.6 = 64px
    expect(bar!.px).toBe(64);
  });
});
