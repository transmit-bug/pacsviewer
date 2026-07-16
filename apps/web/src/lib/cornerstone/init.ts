/**
 * Cornerstone.js initialization and configuration.
 *
 * Sets up the rendering engine, tool service, and image loaders.
 */

import { init as csInit, RenderingEngine, imageLoader } from '@cornerstonejs/core';
import { init as toolsInit, addTool, WindowLevelTool, PanTool, ZoomTool, LengthTool, AngleTool, ProbeTool } from '@cornerstonejs/tools';

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

  // Create rendering engine
  renderingEngine = new RenderingEngine(RENDERING_ENGINE_ID);

  // Register tools with the tool service
  addTool(WindowLevelTool);
  addTool(PanTool);
  addTool(ZoomTool);
  addTool(LengthTool);
  addTool(AngleTool);
  addTool(ProbeTool);

  // Register custom HTTP image loader for non-DICOM images
  imageLoader.registerImageLoader('http', loadImageViaHttp);
  imageLoader.registerImageLoader('https', loadImageViaHttp);

  initialized = true;
  console.log('[Cornerstone] Initialized');
}

/**
 * Custom image loader for regular images (PNG, JPG) via HTTP.
 * Converts to cornerstone Image format.
 */
function loadImageViaHttp(imageId: string): { promise: Promise<any> } {
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);

      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const pixelData = new Uint8Array(imageData.data.buffer);

      const image = {
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

      resolve(image);
    };

    img.onerror = (err) => reject(err);
    img.src = imageId;
  });

  return { promise };
}

/**
 * Get the rendering engine instance.
 */
export function getRenderingEngine(): RenderingEngine | null {
  return renderingEngine;
}

/**
 * Convert our image ID to a Cornerstone imageId.
 * For regular images: http://localhost:3000/api/images/{id}/file
 */
export function toCornerstoneImageId(imageId: string): string {
  return `http://localhost:${location.port || '3000'}/api/images/${imageId}/file`;
}
