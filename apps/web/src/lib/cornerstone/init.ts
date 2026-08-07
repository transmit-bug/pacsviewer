/**
 * Cornerstone.js initialization and configuration.
 *
 * Sets up the rendering engine, tool service, and image loaders.
 * All images (including converted PNG/JPG) loaded via wadouri: scheme.
 */

import {
  init as csInit,
  RenderingEngine,
  getRenderingEngine as csGetRenderingEngine,
} from '@cornerstonejs/core';
import {
  init as toolsInit,
  addTool,
  WindowLevelTool,
  PanTool,
  ZoomTool,
  LengthTool,
  AngleTool,
  ProbeTool,
  ArrowAnnotateTool,
  EllipticalROITool,
  RectangleROITool,
  PlanarFreehandROITool,
  SplineROITool,
  StackScrollTool,
  MagnifyTool,
  CrosshairsTool,
} from '@cornerstonejs/tools';
import dicomImageLoader from '@cornerstonejs/dicom-image-loader';

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

  // Reuse existing rendering engine if present (prevents WebGL context leak on HMR)
  const existing = csGetRenderingEngine(RENDERING_ENGINE_ID);
  renderingEngine = existing ?? new RenderingEngine(RENDERING_ENGINE_ID);

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
  addTool(PlanarFreehandROITool);
  addTool(SplineROITool);
  addTool(StackScrollTool);
  addTool(MagnifyTool);
  addTool(CrosshairsTool);

  initialized = true;
  console.log('[Cornerstone] Initialized');
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
 * - DICOM images: wadouri:/api/images/{id}/file
 * - Non-DICOM images: wadouri:/api/images/{id}/file?format=dicom (server converts on-the-fly)
 */
export function toCornerstoneImageId(imageId: string, format?: string): string {
  const base = `/api/images/${imageId}/file`;

  if (format === 'dicom') {
    // Native DICOM — no conversion needed
    return `wadouri:${window.location.origin}${base}`;
  }

  // PNG/JPG — request DICOM conversion from server
  return `wadouri:${window.location.origin}${base}?format=dicom`;
}

/**
 * Build a DICOM wadouri imageId directly from a DICOMweb WADO-RS URL.
 */
export function toWadoRsImageId(studyUid: string, seriesUid: string, instanceUid: string): string {
  return `wadouri:${window.location.origin}/dicomweb/studies/${studyUid}/series/${seriesUid}/instances/${instanceUid}`;
}
