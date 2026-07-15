/**
 * REST API Adapter
 *
 * Provides a REST endpoint for uploading images from ophthalmic devices
 * that don't support DICOM or where DICOM is impractical.
 *
 * Also supports webhook callbacks to notify external systems when images
 * are received.
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

/** Result of processing an upload */
export interface UploadResult {
  id: string;
  filename: string;
  size: number;
  metadata: Record<string, unknown>;
}

export class RestAdapter extends BaseAdapter {
  private storagePath!: string;
  private webhookUrl?: string;
  private webhookSecret?: string;
  private apiKey?: string;
  private receivedImages: Map<string, { path: string; metadata: Record<string, unknown> }> = new Map();

  constructor(id?: string) {
    super('rest', id);
  }

  // ── Lifecycle hooks ──────────────────────────────────────────────────────────

  protected async onInitialize(config: AdapterConfig): Promise<void> {
    this.storagePath = join(process.cwd(), 'data', 'rest', config.id);
    await mkdir(this.storagePath, { recursive: true });

    if (config.rest) {
      this.webhookUrl = config.rest.webhookUrl;
      this.webhookSecret = config.rest.webhookSecret;
      this.apiKey = config.rest.apiKey;
    }
  }

  protected async onStart(): Promise<void> {
    // REST adapter does not start its own server; it is mounted on the main Hono app.
    // The route handler is registered via the adapter routes module.
    console.log(`[RestAdapter] "${this.config.name}" ready to receive uploads`);
  }

  protected async onStop(): Promise<void> {
    console.log(`[RestAdapter] "${this.config.name}" stopped`);
  }

  protected async onDestroy(): Promise<void> {
    this.receivedImages.clear();
  }

  // ── Data operations ──────────────────────────────────────────────────────────

  /**
   * Process an uploaded file (called from the route handler).
   * Validates API key, stores the file, fires webhook.
   */
  async processUpload(
    file: { buffer: Buffer; filename: string; mimetype: string },
    metadata: Record<string, unknown> = {},
  ): Promise<UploadResult> {
    if (this._status !== 'running') {
      throw new Error(`[RestAdapter] Adapter is not running (status: ${this._status})`);
    }

    const id = `${Date.now()}-${file.filename}`;
    const filePath = join(this.storagePath, id);

    await writeFile(filePath, file.buffer);

    const fullMetadata = {
      ...metadata,
      originalFilename: file.filename,
      mimetype: file.mimetype,
      size: file.buffer.length,
      uploadedAt: new Date().toISOString(),
    };

    this.receivedImages.set(id, { path: filePath, metadata: fullMetadata });

    // Update base class counters
    this._lastImageAt = new Date().toISOString();
    this._imageCount++;

    this.events.emit('image:received', {
      id,
      metadata: fullMetadata,
      path: filePath,
    });

    // Fire webhook if configured
    if (this.webhookUrl) {
      this.fireWebhook(id, fullMetadata).catch((err) => {
        console.error(`[RestAdapter] Webhook failed for ${id}:`, err);
      });
    }

    return {
      id,
      filename: file.filename,
      size: file.buffer.length,
      metadata: fullMetadata,
    };
  }

  /**
   * Receive an image directly (e.g., from another adapter or internal pipeline).
   */
  async receiveImage(image: InboundImageData): Promise<void> {
    await super.receiveImage(image);

    const id = image.filename || `${Date.now()}`;
    const filePath = join(this.storagePath, id);

    await writeFile(filePath, image.buffer);

    this.receivedImages.set(id, { path: filePath, metadata: image.metadata });

    this.events.emit('image:received', {
      id,
      metadata: image.metadata,
      path: filePath,
    });
  }

  async queryPatient(criteria: PatientCriteria): Promise<PatientQueryResult[]> {
    const results: PatientQueryResult[] = [];
    const seen = new Set<string>();

    for (const img of this.receivedImages.values()) {
      const m = img.metadata;
      const mrn = (m.patientMrn as string) || (m.patientId as string) || undefined;

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
      const studyUid = (m.studyInstanceUid as string) || (m.studyId as string) || undefined;

      if (!studyUid || seen.has(studyUid)) continue;

      if (criteria.studyInstanceUid && studyUid !== criteria.studyInstanceUid) continue;
      if (criteria.modality && (m.modality as string) !== criteria.modality) continue;

      seen.add(studyUid);
      results.push({
        studyInstanceUid: studyUid,
        patientMrn: (m.patientMrn as string) || (m.patientId as string) || '',
        studyDate: (m.studyDate as string) || '',
        modality: (m.modality as string) || 'OT',
      });
    }

    return results;
  }

  // ── Webhook ──────────────────────────────────────────────────────────────────

  private async fireWebhook(
    imageId: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!this.webhookUrl) return;

    const payload = JSON.stringify({
      event: 'image.received',
      adapterId: this.id,
      imageId,
      metadata,
      timestamp: new Date().toISOString(),
    });

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // HMAC-SHA256 signature if secret is configured
    if (this.webhookSecret) {
      const crypto = await import('crypto');
      const signature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(payload)
        .digest('hex');
      headers['X-Webhook-Signature'] = `sha256=${signature}`;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });

      if (!response.ok) {
        console.warn(
          `[RestAdapter] Webhook returned ${response.status} for image ${imageId}`,
        );
      }
    } catch (err) {
      console.error(`[RestAdapter] Webhook request failed for image ${imageId}:`, err);
    }
  }

  /** Validate an incoming API key against the configured one. */
  validateApiKey(provided: string | undefined): boolean {
    if (!this.apiKey) return true; // no key configured = open access
    return provided === this.apiKey;
  }
}
