/**
 * Image-to-DICOM Converter — converts PNG/JPG images to DICOM Part 10 format.
 *
 * Used during upload so that all images (including non-DICOM) are stored as
 * DICOM files and rendered natively by Cornerstone.js via wadouri: scheme.
 */

import sharp from 'sharp';
import dcmjs from 'dcmjs';
import { v4 as uuid } from 'uuid';
import { createHash } from 'node:crypto';
import type { DicomParseResult, DicomMetadata } from './dicom/parser';

const { DicomDict, DicomMetaDictionary } = dcmjs.data;

// Secondary Capture SOP Class UID — used for non-medical images wrapped as DICOM
const SOP_CLASS_UID_SECONDARY_CAPTURE = '1.2.840.10008.5.1.4.1.1.7';
// Explicit VR Little Endian Transfer Syntax
const TRANSFER_SYNTAX_EXPLICIT_VR_LE = '1.2.840.10008.1.2.1';

export interface ConvertImageOptions {
  /** Original image buffer (PNG/JPG/TIFF/BMP) */
  imageBuffer: Buffer;
  /** Original filename (for logging) */
  filename?: string;
  /** Patient info — if not provided, uses defaults */
  patientName?: string;
  patientId?: string;
  /** Study/Series UIDs — if not provided, generates new ones */
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  /** Instance number within the series */
  instanceNumber?: number;
  /** Physical pixel spacing [row, col] in mm/pixel — written to the DICOM PixelSpacing tag. */
  pixelSpacing?: [number, number] | null;
}

export interface ConvertImageResult {
  /** Parsed result compatible with storeDicomFile() */
  parseResult: DicomParseResult;
  /** Generated SOP Instance UID */
  sopInstanceUid: string;
}

/**
 * Convert a PNG/JPG/TIFF/BMP image buffer to a DICOM Part 10 file.
 *
 * Returns a DicomParseResult that can be passed directly to storeDicomFile().
 */
export async function convertImageToDicom(options: ConvertImageOptions): Promise<ConvertImageResult> {
  const {
    imageBuffer,
    filename = 'unknown',
    patientName = 'Anonymous',
    patientId,
    studyInstanceUid,
    seriesInstanceUid,
    instanceNumber = 1,
    pixelSpacing,
  } = options;

  // 1. Decode image to raw pixel data using Sharp
  const image = sharp(imageBuffer);
  const metadata = await image.metadata();

  const width = metadata.width!;
  const height = metadata.height!;
  const channels: number = metadata.channels ?? 3;

  // Determine photometric interpretation and samples per pixel
  let photometricInterpretation: string;
  let samplesPerPixel: number;
  let bitsAllocated: number;

  if ((channels as number) === 1) {
    // Grayscale
    photometricInterpretation = 'MONOCHROME2';
    samplesPerPixel = 1;
    bitsAllocated = 8;
  } else if ((channels as number) === 3 || (channels as number) === 4) {
    // RGB (drop alpha if present)
    photometricInterpretation = 'RGB';
    samplesPerPixel = 3;
    bitsAllocated = 8;
  } else {
    throw new Error(`Unsupported image channels: ${channels}`);
  }

  // Extract raw pixel data (always 8-bit for standard images)
  const rawPixels = await image
    .removeAlpha()
    .raw()
    .toBuffer();

  // 2. Generate UIDs
  const sopInstanceUid = generateUid();
  const finalStudyUid = studyInstanceUid || generateUid();
  const finalSeriesUid = seriesInstanceUid || generateUid();
  const finalPatientId = patientId || `IMG-${sopInstanceUid.substring(0, 8)}`;

  // 3. Build DICOM dataset
  const now = new Date();
  const studyDate = formatDate(now);
  const studyTime = formatTime(now);

  // Build the DICOM dict using dcmjs
  // IMPORTANT: meta (group 0002) and dict (all other groups) must be separate
  const metaDict: Record<string, any> = {};
  const dataDict: Record<string, any> = {};

  // Helper to set a tag by keyword
  function setTag(keyword: string, value: any, isMeta: boolean = false) {
    const entry = DicomMetaDictionary.nameMap?.[keyword];
    if (!entry) return;
    const tag = entry.tag.replace(/[(),]/g, '');
    const vr = entry.vr;
    const target = isMeta ? metaDict : dataDict;
    target[tag] = { vr, Value: Array.isArray(value) ? value : [value] };
  }

  // File Meta Information (group 0002)
  setTag('FileMetaInformationVersion', new Uint8Array([0, 1]), true);
  setTag('MediaStorageSOPClassUID', SOP_CLASS_UID_SECONDARY_CAPTURE, true);
  setTag('MediaStorageSOPInstanceUID', sopInstanceUid, true);
  setTag('TransferSyntaxUID', TRANSFER_SYNTAX_EXPLICIT_VR_LE, true);
  setTag('ImplementationClassUID', '1.2.826.0.1.3680043.10.435.1', true);
  setTag('ImplementationVersionName', 'PACSVIEWER_1_0', true);

  // Patient Module
  setTag('PatientName', patientName);
  setTag('PatientID', finalPatientId);
  setTag('PatientBirthDate', '');
  setTag('PatientSex', '');

  // General Study Module
  setTag('StudyInstanceUID', finalStudyUid);
  setTag('StudyDate', studyDate);
  setTag('StudyTime', studyTime);
  setTag('AccessionNumber', '');
  setTag('ReferringPhysicianName', '');
  setTag('StudyID', '');

  // General Series Module
  setTag('SeriesInstanceUID', finalSeriesUid);
  setTag('SeriesNumber', 1);
  setTag('SeriesDescription', `Converted from ${filename}`);
  setTag('Modality', 'OT'); // Other
  setTag('BodyPartExamined', '');
  setTag('Manufacturer', 'PACSVIEWER');

  // SOP Common Module
  setTag('SOPClassUID', SOP_CLASS_UID_SECONDARY_CAPTURE);
  setTag('SOPInstanceUID', sopInstanceUid);
  setTag('InstanceNumber', instanceNumber);

  // General Image Module
  setTag('ImageType', ['ORIGINAL', 'PRIMARY']);
  setTag('ContentDate', studyDate);
  setTag('ContentTime', studyTime);

  // Image Pixel Module
  setTag('SamplesPerPixel', samplesPerPixel);
  setTag('PhotometricInterpretation', photometricInterpretation);
  setTag('Rows', height);
  setTag('Columns', width);
  setTag('BitsAllocated', bitsAllocated);
  setTag('BitsStored', bitsAllocated);
  setTag('HighBit', bitsAllocated - 1);
  setTag('PixelRepresentation', 0); // unsigned
  setTag('PlanarConfiguration', 0); // pixel interleaved (RGBRGBRGB...)
  if (pixelSpacing) {
    // DS values are encoded as strings (DICOM spec); parser normalizes to numbers.
    setTag('PixelSpacing', [String(pixelSpacing[0]), String(pixelSpacing[1])]);
  }
  setTag('PixelData', rawPixels);

  // 4. Encode DICOM binary
  // Note: DicomDict constructor puts arg into `meta`, so we must set `dict` explicitly
  const dicomDict = new DicomDict({}) as any;
  dicomDict.meta = metaDict;
  dicomDict.dict = dataDict;
  const arrayBuffer = dicomDict.write() as ArrayBuffer;
  const dicomBuffer = Buffer.from(arrayBuffer);

  // 5. Calculate hash
  const hash = createHash('sha256').update(dicomBuffer).digest('hex');

  // 6. Build DicomParseResult compatible with storeDicomFile()
  const imageMeta: DicomMetadata['image'] = {
    sopInstanceUid,
    sopClassUid: SOP_CLASS_UID_SECONDARY_CAPTURE,
    instanceNumber,
    rows: height,
    columns: width,
    bitsAllocated,
    bitsStored: bitsAllocated,
    pixelRepresentation: 0,
    samplesPerPixel,
    photometricInterpretation,
    planarConfiguration: 0,
    pixelSpacing: pixelSpacing ?? null,
    windowCenter: channels === 1 ? 128 : null,
    windowWidth: channels === 1 ? 256 : null,
    rescaleSlope: 1,
    rescaleIntercept: 0,
    transferSyntaxUid: TRANSFER_SYNTAX_EXPLICIT_VR_LE,
    numberOfFrames: 1,
    laterality: '',
    imageType: ['ORIGINAL', 'PRIMARY'],
  };

  const metadataObj: DicomMetadata = {
    patient: {
      patientId: finalPatientId,
      patientName,
      birthDate: '',
      sex: '',
    },
    study: {
      studyInstanceUid: finalStudyUid,
      studyDate,
      studyTime,
      accessionNumber: '',
      modality: '',
      institutionName: '',
      referringPhysicianName: '',
    },
    series: {
      seriesInstanceUid: finalSeriesUid,
      seriesNumber: 1,
      seriesDescription: `Converted from ${filename}`,
      modality: 'OT',
      bodyPart: '',
      manufacturer: 'PACSVIEWER',
    },
    image: imageMeta,
  };

  return {
    parseResult: {
      dataset: dataDict,
      metadata: metadataObj,
      frames: [], // Single-frame image
      hash,
      buffer: dicomBuffer,
    },
    sopInstanceUid,
  };
}

/**
 * Generate a DICOM UID (2.25 prefix for user-generated UIDs per DICOM standard).
 */
function generateUid(): string {
  // Use UUID without hyphens, prefixed with "2.25." per DICOM PS3.5 B.2
  const uuidStr = uuid().replace(/-/g, '');
  // Convert to a numeric string and prefix with 2.25
  const numeric = BigInt(`0x${uuidStr}`).toString();
  return `2.25.${numeric}`;
}

/**
 * Format a Date as DICOM date string (YYYYMMDD).
 */
function formatDate(date: Date): string {
  const y = date.getFullYear().toString();
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}${m}${d}`;
}

/**
 * Format a Date as DICOM time string (HHMMSS.ffffff).
 */
function formatTime(date: Date): string {
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  const ms = (date.getMilliseconds() * 1000).toString().padStart(6, '0');
  return `${h}${m}${s}.${ms}`;
}
