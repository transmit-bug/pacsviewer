/**
 * DICOM Parser — parse DICOM binary files using dcmjs.
 *
 * Provides high-level API for parsing DICOM files and extracting
 * structured metadata (Patient, Study, Series, Image levels).
 */

import dcmjs from 'dcmjs';
import { createHash } from 'crypto';

const { DicomMessage, DicomMetaDictionary } = dcmjs.data;

export interface DicomParseResult {
  /** Parsed DICOM dataset (tag → entry) */
  dataset: Record<string, any>;
  /** Extracted metadata at all four levels */
  metadata: DicomMetadata;
  /** File hash (SHA-256) */
  hash: string;
  /** Raw DICOM buffer (for storage) */
  buffer: Buffer;
}

export interface DicomMetadata {
  patient: PatientMeta;
  study: StudyMeta;
  series: SeriesMeta;
  image: ImageMeta;
}

export interface PatientMeta {
  patientId: string;
  patientName: string;
  birthDate: string;
  sex: string;
}

export interface StudyMeta {
  studyInstanceUid: string;
  studyDate: string;
  studyTime: string;
  accessionNumber: string;
  modality: string;
  institutionName: string;
  referringPhysicianName: string;
}

export interface SeriesMeta {
  seriesInstanceUid: string;
  seriesNumber: number;
  seriesDescription: string;
  modality: string;
  bodyPart: string;
  manufacturer: string;
}

export interface ImageMeta {
  sopInstanceUid: string;
  sopClassUid: string;
  instanceNumber: number;
  rows: number;
  columns: number;
  bitsAllocated: number;
  bitsStored: number;
  pixelRepresentation: number;
  samplesPerPixel: number;
  photometricInterpretation: string;
  planarConfiguration: number;
  pixelSpacing: [number, number] | null;
  windowCenter: number | number[] | null;
  windowWidth: number | number[] | null;
  rescaleSlope: number;
  rescaleIntercept: number;
  transferSyntaxUid: string;
  numberOfFrames: number;
  laterality: string;
  imageType: string[];
}

/**
 * Convert DicomMetaDictionary tag format "(XXXX,XXXX)" to dcmjs dict key "XXXXXXXX".
 */
function tagToKey(tag: string): string {
  return tag.replace(/[(),]/g, '');
}

/**
 * Get the dcmjs dict key for a DICOM keyword (e.g., "PatientName" → "00100010").
 */
function keywordToTagKey(keyword: string): string | null {
  const entry = DicomMetaDictionary.nameMap?.[keyword];
  if (!entry?.tag) return null;
  return tagToKey(entry.tag);
}

/**
 * Extract a value from the dcmjs dict by DICOM keyword.
 *
 * dcmjs dict format: { "00100010": { vr: "PN", Value: [...] } }
 */
function getValue(dataset: Record<string, any>, keyword: string, defaultVal: any = ''): any {
  const tagKey = keywordToTagKey(keyword);
  if (!tagKey) return defaultVal;

  const entry = dataset[tagKey];
  if (!entry) return defaultVal;

  const val = entry.Value;
  if (val === undefined || val === null) return defaultVal;

  // Single value → unwrap
  if (Array.isArray(val) && val.length === 1) {
    const v = val[0];
    // PersonName → extract Alphabetic
    if (typeof v === 'object' && v !== null && 'Alphabetic' in v) {
      return v.Alphabetic;
    }
    return v;
  }

  // PersonName array
  if (Array.isArray(val)) {
    return val.map(v => {
      if (typeof v === 'object' && v !== null && 'Alphabetic' in v) {
        return v.Alphabetic;
      }
      return v;
    });
  }

  // PersonName object
  if (typeof val === 'object' && val !== null && 'Alphabetic' in val) {
    return val.Alphabetic;
  }

  return val;
}

/**
 * Extract structured metadata from a parsed DICOM dataset.
 */
function extractMetadata(dataset: Record<string, any>): DicomMetadata {
  // Parse numeric array from DICOM (e.g., "1.0\2.0" → [1.0, 2.0])
  function parseNumberArray(val: any): number[] | null {
    if (val == null) return null;
    if (typeof val === 'number') return [val];
    if (typeof val === 'string') return val.split('\\').map(Number).filter(n => !isNaN(n));
    if (Array.isArray(val)) return val.map(Number).filter(n => !isNaN(n));
    return null;
  }

  // Parse pixel spacing
  function parsePixelSpacing(val: any): [number, number] | null {
    const arr = parseNumberArray(val);
    if (!arr || arr.length === 0) return null;
    if (arr.length === 1) return [arr[0], arr[0]];
    return [arr[0], arr[1]];
  }

  // Parse window center/width
  function parseWindowValue(val: any): number | number[] | null {
    if (val == null) return null;
    const arr = parseNumberArray(val);
    if (!arr) return null;
    if (arr.length === 1) return arr[0];
    return arr;
  }

  // Parse DICOM PersonName: "Family^Given^Middle^Prefix^Suffix" → "Family Given"
  function parseName(val: any): string {
    if (typeof val !== 'string') return String(val || '');
    return val.replace(/\^/g, ' ').trim();
  }

  const g = (keyword: string, defaultVal?: any) => getValue(dataset, keyword, defaultVal);

  return {
    patient: {
      patientId: g('PatientID'),
      patientName: parseName(g('PatientName')),
      birthDate: g('PatientBirthDate', ''),
      sex: g('PatientSex', ''),
    },
    study: {
      studyInstanceUid: g('StudyInstanceUID'),
      studyDate: g('StudyDate', ''),
      studyTime: g('StudyTime', ''),
      accessionNumber: g('AccessionNumber', ''),
      modality: g('Modality', ''),
      institutionName: g('InstitutionName', ''),
      referringPhysicianName: parseName(g('ReferringPhysicianName')),
    },
    series: {
      seriesInstanceUid: g('SeriesInstanceUID'),
      seriesNumber: Number(g('SeriesNumber', 0)),
      seriesDescription: g('SeriesDescription', ''),
      modality: g('Modality', ''),
      bodyPart: g('BodyPartExamined', ''),
      manufacturer: g('Manufacturer', ''),
    },
    image: {
      sopInstanceUid: g('SOPInstanceUID'),
      sopClassUid: g('SOPClassUID'),
      instanceNumber: Number(g('InstanceNumber', 0)),
      rows: Number(g('Rows', 0)),
      columns: Number(g('Columns', 0)),
      bitsAllocated: Number(g('BitsAllocated', 8)),
      bitsStored: Number(g('BitsStored', 8)),
      pixelRepresentation: Number(g('PixelRepresentation', 0)),
      samplesPerPixel: Number(g('SamplesPerPixel', 1)),
      photometricInterpretation: g('PhotometricInterpretation', 'MONOCHROME2'),
      planarConfiguration: Number(g('PlanarConfiguration', 0)),
      pixelSpacing: parsePixelSpacing(g('PixelSpacing')),
      windowCenter: parseWindowValue(g('WindowCenter')),
      windowWidth: parseWindowValue(g('WindowWidth')),
      rescaleSlope: Number(g('RescaleSlope', 1)),
      rescaleIntercept: Number(g('RescaleIntercept', 0)),
      transferSyntaxUid: g('TransferSyntaxUID', '1.2.840.10008.1.2'),
      numberOfFrames: Number(g('NumberOfFrames', 1)),
      laterality: g('Laterality', ''),
      imageType: (() => {
        const v = g('ImageType');
        if (typeof v === 'string') return v.split('\\');
        if (Array.isArray(v)) return v;
        return [];
      })(),
    },
  };
}

/**
 * Parse a DICOM file buffer and extract all metadata.
 */
export function parseDicomFile(buffer: Buffer): DicomParseResult {
  // Parse DICOM binary data
  const arrayBuffer = buffer.buffer.slice(
    buffer.byteOffset,
    buffer.byteOffset + buffer.byteLength
  ) as ArrayBuffer;
  const dicomData = DicomMessage.readFile(arrayBuffer);

  const dataset = dicomData.dict;
  const metadata = extractMetadata(dataset);

  // Calculate file hash
  const hash = createHash('sha256').update(buffer).digest('hex');

  return { dataset, metadata, hash, buffer };
}

/**
 * Check if a buffer is a DICOM file by looking for the DICM preamble.
 */
export function isDicomFile(buffer: Buffer): boolean {
  if (buffer.length < 132) return false;
  return buffer.subarray(128, 132).toString() === 'DICM';
}
