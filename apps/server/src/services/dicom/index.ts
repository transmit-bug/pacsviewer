/**
 * DICOM Service — public API for DICOM operations.
 */

export { parseDicomFile, isDicomFile } from './parser';
export type { DicomParseResult, DicomMetadata, PatientMeta, StudyMeta, SeriesMeta, ImageMeta, DicomFrame } from './parser';

export { storeDicomFile, getDicomFilePath, readDicomFile } from './storage';
export type { StoreResult } from './storage';

export { generateDicomThumbnail, getThumbnailPath } from './thumbnail';
export type { ThumbnailResult } from './thumbnail';
