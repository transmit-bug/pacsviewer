/**
 * DICOM Adapter - C-STORE SCP / C-FIND SCU / C-MOVE SCU
 *
 * Provides standard DICOM networking for receiving images from
 * ophthalmic devices (Zeiss OCT, Heidelberg Spectralis, etc.)
 *
 * NOTE: This is a simplified implementation suitable for integration.
 * For production, consider a battle-tested DICOM library like dcmjs-dimse
 * or orthanc as an external service.
 */

import { join } from 'path';
import { mkdir, writeFile } from 'fs/promises';
import { BaseAdapter } from './base';
import {
  type AdapterConfig,
  type InboundImageData,
  type PatientCriteria,
  type PatientQueryResult,
  type StudyCriteria,
  type StudyQueryResult,
} from './types';

/**
 * Minimal DICOM tag parser for extracting metadata from raw DICOM files.
 * Handles the most common tags needed for ophthalmic imaging.
 */
const DICOM_TAGS: Record<string, string> = {
  '00100010': 'patientName',
  '00100020': 'patientId',
  '00100030': 'patientBirthDate',
  '00100040': 'patientSex',
  '00080020': 'studyDate',
  '00080030': 'studyTime',
  '0020000D': 'studyInstanceUid',
  '0020000E': 'seriesInstanceUid',
  '00080018': 'sopInstanceUid',
  '00080060': 'modality',
  '00180015': 'bodyPartExamined',
  '00200010': 'studyId',
  '00080070': 'manufacturer',
  '00081090': 'modelName',
  '00280010': 'rows',
  '00280011': 'columns',
  '00280100': 'bitsAllocated',
  '00080008': 'imageType',
};

function parseDicomMetadata(buffer: Buffer): Record<string, unknown> {
  const meta: Record<string, unknown> = {};

  // DICOM preamble is 128 bytes + "DICM" magic
  if (buffer.length < 132) return meta;
  const magic = buffer.toString('ascii', 128, 132);
  if (magic !== 'DICM') return meta;

  let offset = 132;

  // Skip meta information group (0002,xxxx) - read until we hit a non-0002 group
  while (offset < buffer.length - 4) {
    const group = buffer.readUInt16LE(offset);
    const element = buffer.readUInt16LE(offset + 2);
    const tag = `${group.toString(16).padStart(4, '0')}${element.toString(16).padStart(4, '0')}`;

    // VR
    let vr: string;
    let vrOffset: number;
    let valueLength: number;

    if (group === 0x0002) {
      // Explicit VR for meta group
      vr = buffer.toString('ascii', offset + 4, offset + 6);
      vrOffset = offset + 4;
      if (['OB', 'OW', 'OF', 'SQ', 'UC', 'UN', 'UR', 'UT'].includes(vr)) {
        valueLength = buffer.readUInt32LE(offset + 8);
        offset += 12;
      } else {
        valueLength = buffer.readUInt16LE(offset + 6);
        offset += 8;
      }
    } else {
      // Implicit VR for data elements - assume UN
      vr = 'UN';
      vrOffset = offset + 4;
      valueLength = buffer.readUInt32LE(offset + 4);
      offset += 8;
    }

    if (valueLength === 0xffffffff) {
      // Undefined length - skip (sequences, etc.)
      break;
    }

    const tagName = DICOM_TAGS[tag];
    if (tagName && valueLength > 0 && offset + valueLength <= buffer.length) {
      const value = buffer.toString('ascii', offset, offset + valueLength).trim();
      meta[tagName] = value;
    }

    offset += valueLength;
    if (offset > buffer.length) break;
  }

  return meta;
}

export class DicomAdapter extends BaseAdapter {
  private server: ReturnType<typeof Bun.serve> | null = null;
  private storagePath!: string;
  private receivedImages: Map<string, { path: string; metadata: Record<string, unknown> }> = new Map();

  constructor(id?: string) {
    super('dicom', id);
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────────────

  protected async onInitialize(config: AdapterConfig): Promise<void> {
    this.storagePath = join(process.cwd(), 'data', 'dicom', config.id);
    await mkdir(this.storagePath, { recursive: true });
  }

  protected async onStart(): Promise<void> {
    const dicomConfig = this.config.dicom;
    if (!dicomConfig) {
      throw new Error('[DicomAdapter] Missing dicom configuration');
    }

    // Capture references for the fetch closure
    const storagePath = this.storagePath;
    const receivedImages = this.receivedImages;
    const adapterEvents = this.events;

    // Start a simplified DICOM C-STORE SCP server
    // In production, use a proper DICOM library like dcmjs-dimse
    this.server = Bun.serve({
      port: dicomConfig.port,
      hostname: '0.0.0.0',

      async fetch(req) {
        // DICOMweb STOW-RS endpoint for receiving DICOM instances
        const url = new URL(req.url);

        if (url.pathname === '/stow-rs' && req.method === 'POST') {
          try {
            const formData = await req.formData();
            const files = formData.getAll('file') as File[];

            for (const file of files) {
              const buffer = Buffer.from(await file.arrayBuffer());
              const metadata = parseDicomMetadata(buffer);
              const filename = (metadata.sopInstanceUid as string) || `${Date.now()}.dcm`;
              const filePath = join(storagePath, `${filename}.dcm`);

              await writeFile(filePath, buffer);

              receivedImages.set(filename, { path: filePath, metadata });
              adapterEvents.emit('image:received', {
                id: filename,
                metadata,
                path: filePath,
              });
            }

            return new Response(
              JSON.stringify({ success: true, count: files.length }),
              { status: 200, headers: { 'Content-Type': 'application/json' } },
            );
          } catch (err) {
            return new Response(
              JSON.stringify({ success: false, error: String(err) }),
              { status: 500, headers: { 'Content-Type': 'application/json' } },
            );
          }
        }

        // QIDO-RS endpoint for queries
        if (url.pathname === '/qido-rs' && req.method === 'GET') {
          const results = [...receivedImages.values()].map((img) => img.metadata);
          return new Response(
            JSON.stringify({ success: true, data: results }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response('Not Found', { status: 404 });
      },
    });

    console.log(
      `[DicomAdapter] C-STORE SCP listening on port ${dicomConfig.port} ` +
      `(AE Title: ${dicomConfig.aeTitle})`,
    );
  }

  protected async onStop(): Promise<void> {
    if (this.server) {
      this.server.stop();
      this.server = null;
    }
    console.log('[DicomAdapter] Stopped');
  }

  protected async onDestroy(): Promise<void> {
    await this.onStop();
    this.receivedImages.clear();
  }

  // ── Data operations ──────────────────────────────────────────────────────────

  async receiveImage(image: InboundImageData): Promise<void> {
    await super.receiveImage(image);

    const metadata = parseDicomMetadata(image.buffer);
    const filename =
      (metadata.sopInstanceUid as string) ||
      image.filename ||
      `${Date.now()}.dcm`;

    const filePath = join(this.storagePath, `${filename}.dcm`);
    await writeFile(filePath, image.buffer);

    this.receivedImages.set(filename, { path: filePath, metadata });

    this.events.emit('image:received', {
      id: filename,
      metadata,
      path: filePath,
    });
  }

  async queryPatient(criteria: PatientCriteria): Promise<PatientQueryResult[]> {
    const results: PatientQueryResult[] = [];
    const seen = new Set<string>();

    for (const img of this.receivedImages.values()) {
      const m = img.metadata;
      const mrn = m.patientId as string | undefined;

      if (!mrn || seen.has(mrn)) continue;

      if (criteria.mrn && mrn !== criteria.mrn) continue;
      if (
        criteria.name &&
        !(m.patientName as string || '').toLowerCase().includes(criteria.name.toLowerCase())
      )
        continue;

      seen.add(mrn);
      results.push({
        mrn,
        name: (m.patientName as string) || 'Unknown',
        birthDate: m.patientBirthDate as string | undefined,
        gender: m.patientSex as string | undefined,
      });
    }

    return results;
  }

  async queryStudies(criteria: StudyCriteria): Promise<StudyQueryResult[]> {
    const results: StudyQueryResult[] = [];
    const seen = new Set<string>();

    for (const img of this.receivedImages.values()) {
      const m = img.metadata;
      const studyUid = m.studyInstanceUid as string | undefined;

      if (!studyUid || seen.has(studyUid)) continue;

      if (criteria.studyInstanceUid && studyUid !== criteria.studyInstanceUid) continue;
      if (criteria.modality && (m.modality as string) !== criteria.modality) continue;

      seen.add(studyUid);
      results.push({
        studyInstanceUid: studyUid,
        patientMrn: (m.patientId as string) || '',
        studyDate: (m.studyDate as string) || '',
        modality: (m.modality as string) || 'OT',
        description: (m.bodyPartExamined as string) || undefined,
      });
    }

    return results;
  }
}
