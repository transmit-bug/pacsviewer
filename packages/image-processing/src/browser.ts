/**
 * Browser-safe exports from @pacsviewer/image-processing
 *
 * This entry point exports only pure JS functions that can run in the browser
 * without Node.js dependencies (no sharp, no fs, etc.).
 */

// ETDRS grid utilities
export {
  accumulateETDRSRegions,
  getETDRSRegion,
  ETDRS_REGION_NAMES,
  COLOR_MAPS,
  type ETDRSRegion,
  type ETDRSPixelSpacing,
} from './utils/etdrs';

// Edge detection utilities
export {
  gaussianBlur,
  sobelEdgeDetection,
  findGradientPeaks,
  smoothBoundary,
} from './utils/edge-detection';

// OCT retinal layer detection
export {
  detectRetinalLayers,
  calculateLayerThickness,
  generateETDRSRegions,
  type LayerId,
  type RetinalLayerBoundary,
  type PixelSpacing,
  type LayerDetectionOptions,
} from './oct/layers';

// OCT thickness map generation
export {
  generateThicknessMap,
  generateEnfaceProjection,
  renderThicknessMap,
  type ThicknessMapData,
  type ThicknessStats,
  type ThicknessType,
} from './oct/thickness';
