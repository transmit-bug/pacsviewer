/**
 * Device Adapter Architecture - Type Definitions
 * 
 * Defines the interfaces for integrating third-party ophthalmic devices
 * (Zeiss OCT, Heidelberg Spectralis, Topcon, etc.)
 */

/** Adapter type identifiers */
export type AdapterType = 'dicom' | 'rest' | 'file' | 'custom';

/** Runtime status of an adapter */
export type AdapterStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'error' | 'disabled';

/** Events emitted by adapters */
export type AdapterEventType =
  | 'image:received'
  | 'image:error'
  | 'adapter:started'
  | 'adapter:stopped'
  | 'adapter:error'
  | 'adapter:status';

/** Lightweight typed event emitter */
export class AdapterEventEmitter {
  private listeners = new Map<string, Set<(data: any) => void>>();

  on(event: AdapterEventType, listener: (data: any) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);
    return () => this.off(event, listener);
  }

  off(event: AdapterEventType, listener: (data: any) => void): void {
    this.listeners.get(event)?.delete(listener);
  }

  emit(event: AdapterEventType, data: any): void {
    this.listeners.get(event)?.forEach((fn) => {
      try {
        fn(data);
      } catch (err) {
        console.error(`[AdapterEvent] Error in listener for ${event}:`, err);
      }
    });
  }

  removeAllListeners(event?: AdapterEventType): void {
    if (event) {
      this.listeners.delete(event);
    } else {
      this.listeners.clear();
    }
  }
}

/** Shape of an image received from a device */
export interface InboundImageData {
  /** Raw file bytes */
  buffer: Buffer;
  /** Original filename if available */
  filename?: string;
  /** MIME type or file extension */
  format: string;
  /** DICOM metadata or device-specific metadata */
  metadata: Record<string, unknown>;
}

/** Metadata extracted from a received image */
export interface ImageMetadata {
  patientMrn?: string;
  patientName?: string;
  studyDate?: string;
  studyTime?: string;
  studyInstanceUid?: string;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  modality?: string;
  bodyPart?: string;
  laterality?: 'L' | 'R' | 'both';
  manufacturer?: string;
  modelName?: string;
  width?: number;
  height?: number;
  bitsAllocated?: number;
  /** Device-specific extra fields */
  extra?: Record<string, unknown>;
}

/** Patient query criteria */
export interface PatientCriteria {
  mrn?: string;
  name?: string;
  birthDate?: string;
}

/** Simplified patient info returned by query */
export interface PatientQueryResult {
  mrn: string;
  name: string;
  birthDate?: string;
  gender?: string;
}

/** Study query criteria */
export interface StudyCriteria {
  patientMrn?: string;
  studyDate?: string;
  modality?: string;
  studyInstanceUid?: string;
}

/** Simplified study info returned by query */
export interface StudyQueryResult {
  studyInstanceUid: string;
  patientMrn: string;
  studyDate: string;
  modality: string;
  description?: string;
  seriesCount?: number;
}

/** Connection / operational status snapshot */
export interface AdapterStatusInfo {
  id: string;
  name: string;
  type: AdapterType;
  status: AdapterStatus;
  lastError?: string;
  lastImageAt?: string;
  imageCount: number;
  uptime: number; // ms since last start
  config: Record<string, unknown>; // sanitized config (no secrets)
}

/** Configuration block passed to an adapter on init */
export interface AdapterConfig {
  /** Unique adapter instance id (assigned by registry) */
  id: string;
  /** Human-readable name */
  name: string;
  /** Adapter type */
  type: AdapterType;
  /** Whether the adapter is enabled */
  enabled: boolean;

  // DICOM-specific
  dicom?: {
    /** Our AE Title (SCP) */
    aeTitle: string;
    /** Listening port for C-STORE SCP */
    port: number;
    /** Max concurrent associations */
    maxAssociations?: number;
    /** Supported transfer syntaxes (UID list) */
    transferSyntaxes?: string[];
  };

  // REST-specific
  rest?: {
    /** Base URL of the external system to call */
    endpoint?: string;
    /** API key for authenticating inbound uploads */
    apiKey?: string;
    /** Webhook URL we call when an image is received */
    webhookUrl?: string;
    /** Webhook secret for HMAC verification */
    webhookSecret?: string;
  };

  // File-system / custom
  file?: {
    /** Directory to watch for incoming files */
    watchPath: string;
    /** Glob pattern for files to pick up */
    pattern?: string;
    /** Whether to delete files after import */
    deleteAfterImport?: boolean;
  };

  /** Opaque user-defined config for custom adapters */
  custom?: Record<string, unknown>;
}

/** The core adapter interface every device adapter must implement */
export interface DeviceAdapter {
  /** Unique id (set by registry from config) */
  readonly id: string;
  /** Human-readable name */
  readonly name: string;
  /** Adapter type */
  readonly type: AdapterType;

  /** Current runtime status */
  readonly status: AdapterStatus;

  /** Typed event bus */
  readonly events: AdapterEventEmitter;

  /**
   * Prepare the adapter for operation.
   * Must be called exactly once before start().
   */
  initialize(config: AdapterConfig): Promise<void>;

  /** Begin accepting / pulling images. */
  start(): Promise<void>;

  /** Gracefully stop. No more images after this returns. */
  stop(): Promise<void>;

  /** Destroy the adapter, releasing all resources. */
  destroy(): Promise<void>;

  /** Get a status snapshot. */
  getStatus(): AdapterStatusInfo;

  /**
   * Push an image into the system via this adapter.
   * (Used by REST adapter receiving uploads, or file adapter.)
   */
  receiveImage(image: InboundImageData): Promise<void>;

  /**
   * Query patients visible to this adapter / device.
   * Returns empty array if not supported.
   */
  queryPatient(criteria: PatientCriteria): Promise<PatientQueryResult[]>;

  /**
   * Query studies visible to this adapter / device.
   * Returns empty array if not supported.
   */
  queryStudies(criteria: StudyCriteria): Promise<StudyQueryResult[]>;
}
