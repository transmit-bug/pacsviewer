export interface ViewportState {
  zoom: number;
  pan: { x: number; y: number };
  rotation: number;
  flipH: boolean;
  flipV: boolean;
  windowWidth: number;
  windowLevel: number;
  invert: boolean;
}

export const defaultViewport: ViewportState = {
  zoom: 1,
  pan: { x: 0, y: 0 },
  rotation: 0,
  flipH: false,
  flipV: false,
  windowWidth: 400,
  windowLevel: 40,
  invert: false,
};

/**
 * Apply window/level adjustment to canvas image data.
 */
export function applyWindowLevel(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewport: ViewportState
): void {
  if (viewport.windowWidth === 400 && viewport.windowLevel === 40) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const min = viewport.windowLevel - viewport.windowWidth / 2;
  const max = viewport.windowLevel + viewport.windowWidth / 2;

  for (let i = 0; i < data.length; i += 4) {
    const gray = (data[i] + data[i + 1] + data[i + 2]) / 3;
    const normalized = ((gray - min) / (max - min)) * 255;
    const clamped = Math.max(0, Math.min(255, normalized));
    data[i] = clamped;
    data[i + 1] = clamped;
    data[i + 2] = clamped;
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Apply invert filter to canvas image data.
 */
export function applyInvert(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  viewport: ViewportState
): void {
  if (!viewport.invert) return;

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];
    data[i + 1] = 255 - data[i + 1];
    data[i + 2] = 255 - data[i + 2];
  }
  ctx.putImageData(imageData, 0, 0);
}

/**
 * Render a single image to a canvas with viewport transforms applied.
 * This is the shared rendering logic used by SideBySideMode and SliderMode.
 */
export function renderImageToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  viewport: ViewportState
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = canvas.parentElement?.clientWidth || canvas.width;
  canvas.height = canvas.parentElement?.clientHeight || canvas.height;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.rotate((viewport.rotation * Math.PI) / 180);
  if (viewport.flipH) ctx.scale(-1, 1);
  if (viewport.flipV) ctx.scale(1, -1);
  ctx.translate(viewport.pan.x, viewport.pan.y);

  const scale = Math.min(canvas.width / img.width, canvas.height / img.height) * 0.9;
  const x = (-img.width * scale) / 2;
  const y = (-img.height * scale) / 2;

  ctx.drawImage(img, x, y, img.width * scale, img.height * scale);

  applyWindowLevel(ctx, canvas, viewport);
  applyInvert(ctx, canvas, viewport);

  ctx.restore();
}
