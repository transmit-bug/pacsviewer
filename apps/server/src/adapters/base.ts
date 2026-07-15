/**
 * Base Adapter - Abstract base class with common lifecycle logic.
 * 
 * Concrete adapters (DICOM, REST, File, Custom) extend this class.
 */

import { v4 as uuid } from 'uuid';
import {
  type AdapterConfig,
  type AdapterStatus,
  type AdapterStatusInfo,
  type AdapterType,
  type DeviceAdapter,
  type InboundImageData,
  type PatientCriteria,
  type PatientQueryResult,
  type StudyCriteria,
  type StudyQueryResult,
  AdapterEventEmitter,
} from './types';

export abstract class BaseAdapter implements DeviceAdapter {
  readonly id: string;
  readonly name: string;
  readonly type: AdapterType;
  readonly events = new AdapterEventEmitter();

  protected config!: AdapterConfig;
  protected _status: AdapterStatus = 'idle';
  protected _lastError?: string;
  protected _lastImageAt?: string;
  protected _imageCount = 0;
  protected _startedAt?: number;

  constructor(type: AdapterType, id?: string) {
    this.type = type;
    this.id = id ?? uuid();
    this.name = '';
  }

  get status(): AdapterStatus {
    return this._status;
  }

  /** Hook: called during initialize() after config is stored. */
  protected abstract onInitialize(config: AdapterConfig): Promise<void>;

  /** Hook: called during start() */
  protected abstract onStart(): Promise<void>;

  /** Hook: called during stop() */
  protected abstract onStop(): Promise<void>;

  /** Hook: called during destroy() */
  protected abstract onDestroy(): Promise<void>;

  async initialize(config: AdapterConfig): Promise<void> {
    if (this._status !== 'idle' && this._status !== 'disabled') {
      throw new Error(
        `[${this.id}] Cannot initialize adapter in status "${this._status}"`,
      );
    }
    this.config = config;
    // Apply name from config; subclasses can override in onInitialize.
    (this as any).name = config.name;
    this._setStatus('idle');
    await this.onInitialize(config);
  }

  async start(): Promise<void> {
    if (this._status === 'running') return;
    if (this._status !== 'idle' && this._status !== 'disabled') {
      throw new Error(
        `[${this.id}] Cannot start adapter in status "${this._status}"`,
      );
    }
    this._setStatus('starting');
    try {
      await this.onStart();
      this._startedAt = Date.now();
      this._setStatus('running');
      this.events.emit('adapter:started', { id: this.id });
    } catch (err) {
      this._lastError = err instanceof Error ? err.message : String(err);
      this._setStatus('error');
      this.events.emit('adapter:error', { id: this.id, error: this._lastError });
      throw err;
    }
  }

  async stop(): Promise<void> {
    if (this._status !== 'running') return;
    this._setStatus('stopping');
    try {
      await this.onStop();
      this._startedAt = undefined;
      this._setStatus('idle');
      this.events.emit('adapter:stopped', { id: this.id });
    } catch (err) {
      this._lastError = err instanceof Error ? err.message : String(err);
      this._setStatus('error');
      this.events.emit('adapter:error', { id: this.id, error: this._lastError });
      throw err;
    }
  }

  async destroy(): Promise<void> {
    if (this._status === 'running') {
      await this.stop();
    }
    await this.onDestroy();
    this.events.removeAllListeners();
    this._setStatus('disabled');
  }

  getStatus(): AdapterStatusInfo {
    return {
      id: this.id,
      name: this.config?.name ?? this.name,
      type: this.type,
      status: this._status,
      lastError: this._lastError,
      lastImageAt: this._lastImageAt,
      imageCount: this._imageCount,
      uptime: this._startedAt ? Date.now() - this._startedAt : 0,
      config: this.sanitizeConfig(),
    };
  }

  async receiveImage(image: InboundImageData): Promise<void> {
    if (this._status !== 'running') {
      throw new Error(
        `[${this.id}] Adapter is not running (status: ${this._status})`,
      );
    }
    this._lastImageAt = new Date().toISOString();
    this._imageCount++;
  }

  async queryPatient(_criteria: PatientCriteria): Promise<PatientQueryResult[]> {
    return [];
  }

  async queryStudies(_criteria: StudyCriteria): Promise<StudyQueryResult[]> {
    return [];
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  protected _setStatus(status: AdapterStatus): void {
    this._status = status;
    this.events.emit('adapter:status', { id: this.id, status });
  }

  /** Strip secrets from config before exposing via getStatus(). */
  protected sanitizeConfig(): Record<string, unknown> {
    if (!this.config) return {};
    const { rest, ...restConfig } = this.config;
    const safeRest = rest
      ? { ...rest, apiKey: rest.apiKey ? '***' : undefined, webhookSecret: rest.webhookSecret ? '***' : undefined }
      : undefined;
    return { ...restConfig, rest: safeRest };
  }
}
