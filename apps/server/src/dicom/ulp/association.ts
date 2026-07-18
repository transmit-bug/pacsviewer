/**
 * DICOM Upper Layer Protocol (ULP) - Association Management
 *
 * Implements the DICOM Association state machine as defined in DICOM PS3.8 Section 9.2.
 *
 * States:
 *   1 - Idle
 *   2 - Transport connection open (awaiting A-ASSOCIATE)
 *   3 - Awaiting A-ASSOCIATE response
 *   4 - Association established (ready for P-DATA)
 *   5 - Awaiting release (A-RELEASE-RQ sent)
 *   6 - Awaiting release response
 *
 * This module handles the A-ASSOCIATE handshake and maintains
 * the association state for each DICOM connection.
 */

import { Socket } from 'net';
import {
  PduType,
  AssociateRq,
  AssociateAc,
  AssociateRj,
  PDataTf,
  Abort,
  PresentationContext,
  PresentationContextResult,
  AbortSource,
  AbortReason,
  parsePduHeader,
  parseAssociateRq,
  parsePDataTf,
  parseAbort,
  buildAssociateAc,
  buildAssociateRj,
  buildPDataTf,
  buildReleaseRp,
  buildAbort,
} from './pdu';

// ─── State Constants ─────────────────────────────────────────────────────────

export enum AssociationState {
  IDLE = 1,
  TRANSPORT_OPEN = 2,
  AWAITING_ASSOCIATE = 3,
  ESTABLISHED = 4,
  AWAITING_RELEASE = 5,
  AWAITING_RELEASE_RESPONSE = 6,
}

// ─── Supported Transfer Syntaxes ─────────────────────────────────────────────

const SUPPORTED_TRANSFER_SYNTAXES: Record<string, { name: string; isSupported: boolean }> = {
  '1.2.840.10008.1.2': { name: 'Implicit VR Little Endian', isSupported: true },
  '1.2.840.10008.1.2.1': { name: 'Explicit VR Little Endian', isSupported: true },
  '1.2.840.10008.1.2.2': { name: 'Explicit VR Big Endian', isSupported: false },
  // Transfer syntaxes for compressed images can be added later
  '1.2.840.10008.1.2.4.50': { name: 'JPEG Baseline (Process 1)', isSupported: false },
  '1.2.840.10008.1.2.4.70': { name: 'JPEG Lossless, First-Order', isSupported: false },
  '1.2.840.10008.1.2.4.90': { name: 'JPEG 2000 Lossless', isSupported: false },
  '1.2.840.10008.1.2.4.91': { name: 'JPEG 2000 Lossy', isSupported: false },
};

// ─── Callbacks ───────────────────────────────────────────────────────────────

export interface AssociationCallbacks {
  onAssociateRequest?: (association: Association, request: AssociateRq) => void;
  onData?: (association: Association, data: PDataTf) => void;
  onReleaseRequest?: (association: Association) => void;
  onAbort?: (association: Association, abort: Abort) => void;
  onClose?: (association: Association) => void;
  onError?: (association: Association, error: Error) => void;
}

// ─── Association Class ───────────────────────────────────────────────────────

export class Association {
  private state: AssociationState = AssociationState.IDLE;
  private socket: Socket;
  private id: string;
  private calledAeTitle: string = '';
  private callingAeTitle: string = '';
  private presentationContexts: Map<number, PresentationContext> = new Map();
  private callbacks: AssociationCallbacks;
  private maxLength: number = 16384;
  private buffer: Buffer = Buffer.alloc(0);

  constructor(socket: Socket, callbacks: AssociationCallbacks = {}) {
    this.socket = socket;
    this.id = `${socket.remoteAddress}:${socket.remotePort}`;
    this.callbacks = callbacks;

    // Set up socket event handlers
    this.socket.on('data', this.handleSocketData.bind(this));
    this.socket.on('close', this.handleSocketClose.bind(this));
    this.socket.on('error', this.handleSocketError.bind(this));

    this.state = AssociationState.TRANSPORT_OPEN;
  }

  // ─── Public Methods ─────────────────────────────────────────────────────

  /**
   * Get association ID.
   */
  getId(): string {
    return this.id;
  }

  /**
   * Get current state.
   */
  getState(): AssociationState {
    return this.state;
  }

  /**
   * Get called AE title.
   */
  getCalledAeTitle(): string {
    return this.calledAeTitle;
  }

  /**
   * Get calling AE title.
   */
  getCallingAeTitle(): string {
    return this.callingAeTitle;
  }

  /**
   * Check if association is established.
   */
  isEstablished(): boolean {
    return this.state === AssociationState.ESTABLISHED;
  }

  /**
   * Send A-ASSOCIATE-AC (accept association).
   */
  acceptAssociation(presentationContexts: PresentationContext[]): void {
    if (this.state !== AssociationState.AWAITING_ASSOCIATE) {
      throw new Error('Cannot accept association: not in AWAITING_ASSOCIATE state');
    }

    const ac = buildAssociateAc(
      this.calledAeTitle,
      this.callingAeTitle,
      presentationContexts,
      this.maxLength
    );

    this.socket.write(ac);
    this.state = AssociationState.ESTABLISHED;

    // Store the negotiated presentation contexts
    for (const pc of presentationContexts) {
      this.presentationContexts.set(pc.id, pc);
    }
  }

  /**
   * Send A-ASSOCIATE-RJ (reject association).
   */
  rejectAssociation(result: number, source: number, reason: number): void {
    const rj = buildAssociateRj(result, source, reason);
    this.socket.write(rj);
    this.socket.end();
    this.state = AssociationState.IDLE;
  }

  /**
   * Send P-DATA-TF (data transfer).
   */
  sendData(
    presentationContextId: number,
    data: Buffer,
    command: boolean = false,
    lastFragment: boolean = true
  ): void {
    if (this.state !== AssociationState.ESTABLISHED) {
      throw new Error('Cannot send data: association not established');
    }

    // Split data into fragments if needed
    const maxDataLength = this.maxLength - 6; // Account for PDV header
    let offset = 0;

    while (offset < data.length) {
      const fragmentLength = Math.min(maxDataLength, data.length - offset);
      const fragment = data.subarray(offset, offset + fragmentLength);
      const isLast = offset + fragmentLength >= data.length;

      const pdv = buildPDataTf(presentationContextId, fragment, command, isLast);
      this.socket.write(pdv);

      offset += fragmentLength;
    }
  }

  /**
   * Send C-STORE response.
   */
  sendCStoreResponse(
    presentationContextId: number,
    status: number,
    messageId: number = 0
  ): void {
    // Build C-STORE-RSP command
    const command = Buffer.alloc(12);
    command.writeUInt16BE(0x0130, 0); // Command Field (C-STORE-RSP)
    command.writeUInt16BE(messageId, 2); // Message ID Being Responded To
    command.writeUInt16BE(status, 8); // Status

    this.sendData(presentationContextId, command, true, true);
  }

  /**
   * Send C-FIND response.
   */
  sendCFindResponse(
    presentationContextId: number,
    dataset: Record<string, any> | null,
    isFinal: boolean
  ): void {
    // If dataset is null, this is the final response
    if (dataset === null) {
      const command = Buffer.alloc(12);
      command.writeUInt16BE(0x0120, 0); // Command Field (C-FIND-RSP)
      command.writeUInt16BE(isFinal ? 0x0000 : 0xFF00, 8); // Status
      this.sendData(presentationContextId, command, true, true);
    }
    // Dataset would need to be encoded as DICOM - simplified for now
  }

  /**
   * Send A-RELEASE-RP (release response).
   */
  sendReleaseResponse(): void {
    const rp = buildReleaseRp();
    this.socket.write(rp);
    this.state = AssociationState.IDLE;
  }

  /**
   * Send A-ABORT.
   */
  sendAbort(source: AbortSource = AbortSource.UL_SERVICE_USER, reason: AbortReason = AbortReason.NOT_SPECIFIED): void {
    const abort = buildAbort(source, reason);
    this.socket.write(abort);
    this.socket.end();
    this.state = AssociationState.IDLE;
  }

  /**
   * Close the association.
   */
  close(): void {
    if (this.state === AssociationState.ESTABLISHED) {
      this.sendReleaseResponse();
    }
    this.socket.end();
    this.state = AssociationState.IDLE;
  }

  // ─── Private Methods ────────────────────────────────────────────────────

  private handleSocketData(data: Buffer): void {
    // Append to buffer for partial PDU handling
    this.buffer = Buffer.concat([this.buffer, data]);

    try {
      this.processBuffer();
    } catch (err) {
      this.callbacks.onError?.(this, err as Error);
      this.sendAbort(AbortSource.UL_SERVICE_USER, AbortReason.NOT_SPECIFIED);
    }
  }

  private processBuffer(): void {
    while (this.buffer.length >= 6) {
      const header = parsePduHeader(this.buffer);

      // Check if we have the complete PDU
      if (this.buffer.length < 6 + header.length) {
        return; // Wait for more data
      }

      // Extract the complete PDU
      const pduData = this.buffer.subarray(0, 6 + header.length);
      this.buffer = this.buffer.subarray(6 + header.length);

      // Process the PDU
      this.handlePdu(header.type, pduData);
    }
  }

  private handlePdu(type: PduType, data: Buffer): void {
    switch (type) {
      case PduType.ASSOCIATE_RQ:
        this.handleAssociateRequest(data);
        break;

      case PduType.P_DATA_TF:
        this.handleDataTransfer(data);
        break;

      case PduType.RELEASE_RQ:
        this.handleReleaseRequest();
        break;

      case PduType.ABORT:
        this.handleAbortPdu(data);
        break;

      default:
        throw new Error(`Unexpected PDU type: 0x${type.toString(16)}`);
    }
  }

  private handleAssociateRequest(data: Buffer): void {
    const request = parseAssociateRq(data);

    this.calledAeTitle = request.calledAeTitle;
    this.callingAeTitle = request.callingAeTitle;
    this.maxLength = request.userInfo.maxLength;

    this.state = AssociationState.AWAITING_ASSOCIATE;

    // Notify callback
    this.callbacks.onAssociateRequest?.(this, request);
  }

  private handleDataTransfer(data: Buffer): void {
    if (this.state !== AssociationState.ESTABLISHED) {
      throw new Error('P-DATA received but association not established');
    }

    const pData = parsePDataTf(data);

    // Notify callback
    this.callbacks.onData?.(this, pData);
  }

  private handleReleaseRequest(): void {
    this.state = AssociationState.AWAITING_RELEASE;

    // Notify callback
    this.callbacks.onReleaseRequest?.(this);
  }

  private handleAbortPdu(data: Buffer): void {
    const abort = parseAbort(data);

    // Notify callback
    this.callbacks.onAbort?.(this, abort);

    this.state = AssociationState.IDLE;
    this.socket.end();
  }

  private handleSocketClose(): void {
    this.state = AssociationState.IDLE;
    this.callbacks.onClose?.(this);
  }

  private handleSocketError(err: Error): void {
    this.callbacks.onError?.(this, err);
  }

  // ─── Negotiation Helpers ────────────────────────────────────────────────

  /**
   * Negotiate presentation contexts from an A-ASSOCIATE-RQ.
   * Returns the presentation contexts to include in A-ASSOCIATE-AC.
   */
  static negotiatePresentationContexts(
    requested: PresentationContext[]
  ): PresentationContext[] {
    return requested.map(pc => {
      // Find the best supported transfer syntax
      const selectedSyntax = pc.transferSyntaxes.find(
        ts => SUPPORTED_TRANSFER_SYNTAXES[ts]?.isSupported
      );

      return {
        id: pc.id,
        abstractSyntax: pc.abstractSyntax,
        transferSyntaxes: pc.transferSyntaxes,
        result: selectedSyntax
          ? PresentationContextResult.ACCEPTANCE
          : PresentationContextResult.TRANSFER_SYNTAXES_NOT_SUPPORTED,
        selectedTransferSyntax: selectedSyntax,
      };
    });
  }
}
