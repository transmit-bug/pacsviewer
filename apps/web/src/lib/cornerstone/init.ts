/**
 * Cornerstone.js initialization and configuration.
 *
 * Sets up the rendering engine, tool service, and image loaders.
 * DICOM files loaded via wadouri: scheme (cornerstoneWADOImageLoader).
 * Non-DICOM images (PNG/JPG) loaded via custom HTTP loader.
 */

import { init as csInit, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import { init as toolsInit, addTool, WindowLevelTool, PanTool, ZoomTool, LengthTool, AngleTool, ProbeTool, ArrowAnnotateTool, EllipticalROITool, RectangleROITool, StackScrollTool } from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';
import { useAuthStore } from '@/stores/authStore';

let initialized = false;
let renderingEngine: RenderingEngine | null = null;

export const RENDERING_ENGINE_ID = 'pacsviewer-rendering-engine';
export const VIEWPORT_ID_PREFIX = 'viewport-';

/**
 * Initialize Cornerstone.js (call once at app startup).
 */
export async function initCornerstone(): Promise<void> {
  if (initialized) return;

  // Initialize core and tools
  await csInit();
  await toolsInit();

  // Initialize DICOM image loader (registers wadouri: and wadors: schemes)
  dicomImageLoader.init({
    maxWebWorkers: navigator.hardwareConcurrency || 2,
  });

  // Create rendering engine
  renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

  // Register tools
  addTool(WindowLevelTool);
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(ProbeTool);
  addTool(ArrowAnnotateTool);
  addTool(EllipticalROITool);
  addTool(RectangleROITool);
  addTool(StackScrollTool);

  // Register custom HTTP image loader for non-DICOM images (PNG, JPG)
  imageLoader.registerImageLoader('http', loadImageViaHttp);
  imageLoader.registerImageLoader('https', loadImageViaHttp);

  initialized = true;
  console.log('[Cornerstone] Initialized with DICOM loader');
}

/**
 * Custom image loader for regular images (PNG, JPG) via HTTP.
 */
function loadImageViaHttp(imageId: string): { promise: Promise<any> } {
  const promise = (async () => {
    // Use fetch() with auth token instead of new Image() (which can't send headers)
    const token = useAuthStore.getState().token;
    const headers: Record<string, string> = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const response = await fetch(imageId, { headers });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);

    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = (e) => reject(e);
      img.src = objectUrl;
    });
    URL.revokeObjectURL(objectUrl);

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    const imageData = ctx.getImageData(0, 0, img.width, img.height);
    const pixelData = new Uint8Array(imageData.data.buffer);

    return {
      imageId,
      minPixelValue: 0,
      maxPixelValue: 255,
      slope: 1,
      intercept: 0,
      windowCenter: 128,
      windowWidth: 256,
      getPixelData: () => pixelData,
      rows: img.height,
      columns: img.width,
      height: img.height,
      width: img.width,
      color: true,
      rgba: true,
      sizeInBytes: img.width * img.height * 4,
      columnPixelSpacing: 1,
      rowPixelSpacing: 1,
      invert: false,
      getCanvas: () => {
        const c = document.createElement('canvas');
        c.width = img.width;
        c.height = img.height;
        const cx = c.getContext('2d')!;
        cx.drawImage(img, 0, 0);
        return c;
      },
    };
  })();

  return { promise };
}

/**
 * Get the rendering engine instance.
 */
export function getRenderingEngine(): RenderingEngine | null {
  return renderingEngine;
}

/**
 * Build a Cornerstone imageId for an image stored on the server.
 *
 * - DICOM images: wadouri:/api/images/{id}/file (full DICOM parsing with metadata)
 * - Non-DICOM images: http://localhost:PORT/api/images/{id}/file (canvas-based)
 */
export function toCornerstoneImageId(imageId: string, format?: string): string {
  const base = `/api/images/${imageId}/file`;

  if (format === 'dicom') {
    // wadouri: scheme → cornerstoneWADOImageLoader handles DICOM parsing,
    // extracts PixelSpacing, WindowCenter/Width, RescaleSlope/Intercept, etc.
    return `wadouri:${window.location.origin}${base}`;
  }

  // Fallback: plain HTTP for PNG/JPG
  return `http://${window.location.hostname}:${window.location.port || '3000'}${base}`;
}

/**
 * Build a DICOM wadouri imageId directly from a DICOMweb WADO-RS URL.
 */
export function toWadoRsImageId(studyUid: string, seriesUid: string, instanceUid: string): string {
  return `wadouri:${window.location.origin}/dicomweb/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`;
}
