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
