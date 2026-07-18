/**
 * DICOM SCP Server
 *
 * Main entry point for the DICOM network service.
 * Listens for incoming DICOM connections and routes them
 * to appropriate service handlers (C-STORE, C-FIND, C-ECHO).
 *
 * Reference: ADR-005-dicom-network-protocol.md
 */

import { createServer, Server, Socket } from 'net';
import { Association } from './ulp/association';
import { AssociateRq, PDataTf, Abort, PresentationContextResult } from './ulp/pdu';
import { createCStoreHandler } from './services/cstore';
import { createCEchoHandler } from './services/cecho';
import { createCFindHandler } from './services/cfind';

// ─── SOP Class UIDs ──────────────────────────────────────────────────────────

const SOP_CLASSES = {
  // Verification (C-ECHO)
  VERIFICATION: '1.2.840.10008.1.1',

  // Storage (C-STORE)
  CT_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.2',
  MR_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.4',
  US_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.6.1',
  XA_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.12.1',
  CR_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.1',
  DX_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.1.1',
  MG_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.1.2',
  NM_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.20',
  PET_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.128',
  OT_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.9999',
  OCT_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.77.1.5.4',
  FUNDUS_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.77.1.5.1',

  // Secondary Capture
  SECONDARY_CAPTURE: '1.2.840.10008.5.1.4.1.1.7',

  // Grayscale/Color Softcopy
  VL_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.77.1.1',
  VL_PHOTO_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.77.1.4',

  // Worklist (C-FIND)
  MODALITY_WORKLIST: '1.2.840.10008.5.1.4.31',
} as const;

// ─── Server Configuration ────────────────────────────────────────────────────

export interface DicomServerConfig {
  port: number;
  aeTitle: string;
  maxConnections: number;
  maxPduLength: number;
}

const DEFAULT_CONFIG: DicomServerConfig = {
  port: 11112,
  aeTitle: 'PACSVIEWER',
  maxConnections: 50,
  maxPduLength: 16384,
};

// ─── DICOM Server ────────────────────────────────────────────────────────────

export class DicomServer {
  private server: Server | null = null;
  private config: DicomServerConfig;
  private connections: Map<string, Association> = new Map();
  private isRunning: boolean = false;

  constructor(config: Partial<DicomServerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Start the DICOM server.
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[DICOM] Server is already running');
      return;
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((socket: Socket) => {
        this.handleNewConnection(socket);
      });

      this.server.on('error', (err: Error) => {
        console.error('[DICOM] Server error:', err);
        reject(err);
      });

      this.server.listen(this.config.port, () => {
        this.isRunning = true;
        console.log(
          `[DICOM] SCP server started on port ${this.config.port}\n` +
          `  AE Title: ${this.config.aeTitle}\n` +
          `  Max connections: ${this.config.maxConnections}\n` +
          `  Max PDU length: ${this.config.maxPduLength}`
        );
        resolve();
      });
    });
  }

  /**
   * Stop the DICOM server.
   */
  async stop(): Promise<void> {
    if (!this.isRunning || !this.server) {
      return;
    }

    // Close all active connections
    for (const [id, association] of this.connections) {
      association.close();
      this.connections.delete(id);
    }

    return new Promise((resolve) => {
      this.server!.close(() => {
        this.isRunning = false;
        this.server = null;
        console.log('[DICOM] Server stopped');
        resolve();
      });
    });
  }

  /**
   * Check if the server is running.
   */
  isServerRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get number of active connections.
   */
  getConnectionCount(): number {
    return this.connections.size;
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private handleNewConnection(socket: Socket): void {
    const connectionId = `${socket.remoteAddress}:${socket.remotePort}`;

    // Check connection limit
    if (this.connections.size >= this.config.maxConnections) {
      console.warn(`[DICOM] Connection limit reached, rejecting ${connectionId}`);
      socket.destroy();
      return;
    }

    console.log(`[DICOM] New connection from ${connectionId}`);

    // Create handlers for this connection
    let cStoreHandler: ((data: PDataTf) => Promise<void>) | null = null;
    let cEchoHandler: ((data: PDataTf) => Promise<void>) | null = null;
    let cFindHandler: ((data: PDataTf) => Promise<void>) | null = null;

    // Create association with callbacks
    const association = new Association(socket, {
      onAssociateRequest: (assoc, request) => {
        this.handleAssociateRequest(assoc, request);
        // Create service handlers after association is established
        cStoreHandler = createCStoreHandler(assoc);
        cEchoHandler = createCEchoHandler(assoc);
        cFindHandler = createCFindHandler(assoc);
      },
      onData: async (assoc, data) => {
        await this.handleData(assoc, data, cStoreHandler, cEchoHandler, cFindHandler);
      },
      onReleaseRequest: (assoc) => {
        this.handleReleaseRequest(assoc);
      },
      onAbort: (assoc, abort) => {
        this.handleAbort(assoc, abort);
      },
      onClose: (assoc) => {
        this.handleConnectionClose(assoc);
      },
      onError: (assoc, error) => {
        this.handleConnectionError(assoc, error);
      },
    });

    this.connections.set(connectionId, association);
  }

  private handleAssociateRequest(association: Association, request: AssociateRq): void {
    console.log(
      `[DICOM] Association request from ${request.callingAeTitle} ` +
      `to ${request.calledAeTitle}`
    );

    // Negotiate presentation contexts
    const negotiated = Association.negotiatePresentationContexts(request.presentationContexts);

    // Check if we have at least one accepted presentation context
    const hasAccepted = negotiated.some(pc => pc.result === PresentationContextResult.ACCEPTANCE);

    if (!hasAccepted) {
      console.warn('[DICOM] No compatible presentation contexts, rejecting association');
      association.rejectAssociation(1, 1, 0); // Permanent rejection
      return;
    }

    // Accept the association
    association.acceptAssociation(negotiated);

    console.log(
      `[DICOM] Association established with ${request.callingAeTitle} ` +
      `(${negotiated.filter(pc => pc.result === PresentationContextResult.ACCEPTANCE).length} contexts accepted)`
    );
  }

  private async handleData(
    association: Association,
    data: PDataTf,
    cStoreHandler: ((data: PDataTf) => Promise<void>) | null,
    cEchoHandler: ((data: PDataTf) => Promise<void>) | null,
    cFindHandler: ((data: PDataTf) => Promise<void>) | null
  ): Promise<void> {
    // For now, we need to determine what service this is for
    // based on the presentation context ID and the SOP Class
    // This is simplified - in a full implementation, you'd track
    // the service type per presentation context

    if (data.command) {
      // Parse the command to determine the service type
      const commandField = data.data.readUInt16LE(0);

      switch (commandField) {
        case 0x0001: // C-STORE-RQ
          if (cStoreHandler) {
            await cStoreHandler(data);
          }
          break;

        case 0x0020: // C-FIND-RQ
          if (cFindHandler) {
            await cFindHandler(data);
          }
          break;

        case 0x0030: // C-ECHO-RQ
          if (cEchoHandler) {
            await cEchoHandler(data);
          }
          break;

        default:
          console.warn(`[DICOM] Unknown command field: 0x${commandField.toString(16)}`);
          break;
      }
    } else {
      // Data fragment - assume it's for C-STORE
      if (cStoreHandler) {
        await cStoreHandler(data);
      }
    }
  }

  private handleReleaseRequest(association: Association): void {
    console.log(`[DICOM] Release request from ${association.getCallingAeTitle()}`);
    association.sendReleaseResponse();
  }

  private handleAbort(association: Association, abort: Abort): void {
    console.warn(
      `[DICOM] Association aborted: source=${abort.source}, reason=${abort.reason}`
    );
  }

  private handleConnectionClose(association: Association): void {
    const connectionId = association.getId();
    this.connections.delete(connectionId);
    console.log(`[DICOM] Connection closed: ${connectionId}`);
  }

  private handleConnectionError(association: Association, error: Error): void {
    console.error(`[DICOM] Connection error: ${error.message}`);
  }
}

// ─── Singleton Instance ──────────────────────────────────────────────────────

let serverInstance: DicomServer | null = null;

/**
 * Get or create the DICOM server instance.
 */
export function getDicomServer(config?: Partial<DicomServerConfig>): DicomServer {
  if (!serverInstance) {
    serverInstance = new DicomServer(config);
  }
  return serverInstance;
}

/**
 * Start the DICOM server with optional configuration.
 */
export async function startDicomServer(config?: Partial<DicomServerConfig>): Promise<DicomServer> {
  const server = getDicomServer(config);
  await server.start();
  return server;
}
