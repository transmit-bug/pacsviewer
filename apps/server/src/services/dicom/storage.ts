/**
 * DICOM Storage — file storage and database operations for DICOM images.
 *
 * Stores DICOM files in a hierarchy: data/dicom/{studyUID}/{seriesUID}/{sopUID}.dcm
 * Creates/updates database records for Patient → Study → Series → Image.
 */

import { join } from 'path';
import { mkdir, writeFile, readFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { v4 as uuid } from 'uuid';
import { eq, and } from 'drizzle-orm';
import { db } from '../../db';
import {
  patients, studies, series, images, dicomFrames,
} from '../../db/schema';
import type { DicomMetadata, DicomParseResult } from './parser';
import { parseDicomFile, isDicomFile } from './parser';

const DICOM_STORE_DIR = join(process.cwd(), 'data', 'dicom');

export interface StoreResult {
  imageId: string;
  patientId: string;
  studyId: string;
  seriesId: string;
  sopInstanceUid: string;
  isNew: boolean;
}

/**
 * Store a parsed DICOM file and create/update database records.
 */
export async function storeDicomFile(parseResult: DicomParseResult): Promise<StoreResult> {
  const { metadata, buffer, hash } = parseResult;
  const { patient, study, series: seriesMeta, image } = metadata;

  // 1. Find or create Patient
  const patientId = await findOrCreatePatient(patient);

  // 2. Find or create Study
  const { studyId, isNew: isNewStudy } = await findOrCreateStudy(patientId, study);

  // 3. Find or create Series
  const { seriesId, isNew: isNewSeries } = await findOrCreateSeries(studyId, seriesMeta);

  // 4. Check if image already exists (by SOPInstanceUID)
  const existingImage = await db.query.images.findFirst({
    where: eq(images.sopInstanceUid, image.sopInstanceUid),
  });

  if (existingImage) {
    return {
      imageId: existingImage.id,
      patientId,
      studyId,
      seriesId,
      sopInstanceUid: image.sopInstanceUid,
      isNew: false,
    };
  }

  // 5. Store file to disk
  const filePath = await storeFile(study.studyInstanceUid, seriesMeta.seriesInstanceUid, image.sopInstanceUid, buffer);

  // 6. Create Image record
  const imageId = uuid();
  await db.insert(images).values({
    id: imageId,
    seriesId,
    sopInstanceUid: image.sopInstanceUid,
    sopClassUid: image.sopClassUid,
    transferSyntaxUid: image.transferSyntaxUid,
    instanceNumber: image.instanceNumber,
    filePath,
    fileSize: buffer.length,
    fileHash: hash,
    format: 'dicom',
    width: image.columns,
    height: image.rows,
    bitsAllocated: image.bitsAllocated,
    pixelSpacing: image.pixelSpacing,
    windowCenter: image.windowCenter,
    windowWidth: image.windowWidth,
    rescaleSlope: image.rescaleSlope,
    rescaleIntercept: image.rescaleIntercept,
    photometricInterpretation: image.photometricInterpretation,
    numberOfFrames: image.numberOfFrames,
    metadata: parseResult.dataset,
  });

  // 7. Update series image count
  await db.update(series)
    .set({ imageCount: await getImageCount(seriesId) })
    .where(eq(series.id, seriesId));

  // 8. Store per-frame metadata for multi-frame DICOM
  if (parseResult.frames.length > 0) {
    const frameRows = parseResult.frames.map((frame) => ({
      id: uuid(),
      imageId,
      frameIndex: frame.frameIndex,
      frameType: frame.frameType || null,
      instanceNumber: frame.instanceNumber ?? null,
      temporalPositionIdentifier: frame.temporalPositionIdentifier ?? null,
      frameAcquisitionDateTime: frame.frameAcquisitionDateTime || null,
      sliceLocation: frame.sliceLocation ?? null,
      imagePositionPatient: frame.imagePositionPatient || null,
      imageOrientationPatient: frame.imageOrientationPatient || null,
      metadata: frame.metadata || null,
    }));
    await db.insert(dicomFrames).values(frameRows);
  }

  return {
    imageId,
    patientId,
    studyId,
    seriesId,
    sopInstanceUid: image.sopInstanceUid,
    isNew: true,
  };
}

/**
 * Find or create a patient based on DICOM PatientID.
 */
async function findOrCreatePatient(patient: DicomMetadata['patient']): Promise<string> {
  if (patient.patientId) {
    const existing = await db.query.patients.findFirst({
      where: eq(patients.mrn, patient.patientId),
    });
    if (existing) return existing.id;
  }

  // Create new patient
  const patientId = uuid();
  await db.insert(patients).values({
    id: patientId,
    mrn: patient.patientId || `DICOM-${patientId.substring(0, 8)}`,
    name: patient.patientName || 'Unknown',
    gender: parseGender(patient.sex),
    birthDate: formatDate(patient.birthDate) || '1900-01-01',
  });

  return patientId;
}

/**
 * Find or create a study based on StudyInstanceUID.
 */
async function findOrCreateStudy(patientId: string, study: DicomMetadata['study']): Promise<{ studyId: string; isNew: boolean }> {
  if (study.studyInstanceUid) {
    const existing = await db.query.studies.findFirst({
      where: eq(studies.studyInstanceUid, study.studyInstanceUid),
    });
    if (existing) return { studyId: existing.id, isNew: false };
  }

  // Create new study
  const studyId = uuid();
  await db.insert(studies).values({
    id: studyId,
    patientId,
    studyInstanceUid: study.studyInstanceUid,
    accessionNumber: study.accessionNumber || null,
    studyDate: formatDate(study.studyDate) || new Date().toISOString().split('T')[0],
    studyTime: study.studyTime || null,
    modality: study.modality || null,
  });

  return { studyId, isNew: true };
}

/**
 * Find or create a series based on SeriesInstanceUID.
 */
async function findOrCreateSeries(studyId: string, seriesMeta: DicomMetadata['series']): Promise<{ seriesId: string; isNew: boolean }> {
  if (seriesMeta.seriesInstanceUid) {
    const existing = await db.query.series.findFirst({
      where: eq(series.seriesInstanceUid, seriesMeta.seriesInstanceUid),
    });
    if (existing) return { seriesId: existing.id, isNew: false };
  }

  // Create new series
  const seriesId = uuid();
  await db.insert(series).values({
    id: seriesId,
    studyId,
    seriesInstanceUid: seriesMeta.seriesInstanceUid,
    seriesNumber: seriesMeta.seriesNumber || 1,
    seriesDescription: seriesMeta.seriesDescription || null,
    modality: seriesMeta.modality || 'OT',
    bodyPart: seriesMeta.bodyPart || null,
  });

  return { seriesId, isNew: true };
}

/**
 * Store a DICOM file to disk in the study/series hierarchy.
 * Returns the relative path from the DICOM store root.
 */
async function storeFile(
  studyUid: string,
  seriesUid: string,
  sopUid: string,
  buffer: Buffer,
): Promise<string> {
  const dir = join(DICOM_STORE_DIR, studyUid, seriesUid);
  await mkdir(dir, { recursive: true });

  const filename = `${sopUid}.dcm`;
  const filePath = join(dir, filename);
  await writeFile(filePath, buffer);

  // Return relative path from data/dicom/
  return join(studyUid, seriesUid, filename);
}

/**
 * Get the absolute path of a stored DICOM file.
 */
export function getDicomFilePath(relativePath: string): string {
  return join(DICOM_STORE_DIR, relativePath);
}

/**
 * Read a stored DICOM file.
 */
export async function readDicomFile(relativePath: string): Promise<Buffer> {
  const fullPath = getDicomFilePath(relativePath);
  return readFile(fullPath);
}

/**
 * Get the count of images in a series.
 */
async function getImageCount(seriesId: string): Promise<number> {
  const result = await db
    .select({ count: db.$count(images, eq(images.seriesId, seriesId)) })
    .from(images)
    .where(eq(images.seriesId, seriesId));
  return result[0]?.count ?? 0;
}

// --- Helpers ---

function parseGender(sex: string): 'male' | 'female' | 'other' {
  if (sex === 'M') return 'male';
  if (sex === 'F') return 'female';
  return 'other';
}

function formatDate(dicomDate: string): string | null {
  if (!dicomDate) return null;
  // DICOM date format: YYYYMMDD (but may have dots or dashes)
  const cleaned = dicomDate.replace(/[^0-9]/g, '');
  if (cleaned.length < 8) return null;
  return `${cleaned.substring(0, 4)}-${cleaned.substring(4, 6)}-${cleaned.substring(6, 8)}`;
}
