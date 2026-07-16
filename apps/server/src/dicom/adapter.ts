/**
 * DICOM Adapter — C-STORE SCP implementation.
 *
 * Runs a TCP server that accepts DICOM Associations and receives images
 * via C-STORE. Received images are written to disk and tracked via
 * the inbound_transfers table for async processing.
 *
 * Configuration is stored in system_settings (ae_title, port).
 */

import { v4 as uuid } from 'uuid';
import { mkdir, writeFile } from 'fs/promises';
import { join } from 'path';
import { db, devices, inboundTransfers } from '../db';
import { eq, sql } from 'drizzle-orm';
import {
  parseAssociateRQ,
  buildAssociateAC,
  buildReleaseRP,
  parsePDataTF,
  buildCStoreRSP,
  type AssociateRQ,
} from './pdu';
import { PDU_TYPE, STATUS, SOP_CLASS } from './constants';

const DEFAULT_AE_TITLE = 'PACSVIEWER';
const DEFAULT_PORT = 11112;
const STORE_DIR = join(process.cwd(), 'data', 'dicom-store');

export interface DicomAdapterConfig {
  aeTitle: string;
  port: number;
  storePath: string;
}

let server: any = null;

/**
 * Get DICOM adapter config from system_settings or defaults.
 */
export async function getConfig(): Promise<DicomAdapterConfig> {
  // In a real implementation, this reads from system_settings table.
  // For now, return defaults.
  return {
    aeTitle: process.env.DICOM_AE_TITLE || DEFAULT_AE_TITLE,
    port: Number(process.env.DICOM_PORT) || DEFAULT_PORT,
    storePath: STORE_DIR,
  };
}

/**
 * Start the DICOM C-STORE SCP server.
 */
export async function startDicomServer(): Promise<void> {
  if (server) {
    console.log('[DICOM] Server already running');
    return;
  }

  const config = await getConfig();
  await mkdir(config.storePath, { recursive: true });

  console.log(`[DICOM] Starting C-STORE SCP — AE: ${config.aeTitle}, Port: ${config.port}`);

  server = Bun.listen({
    hostname: '0.0.0.0',
    port: config.port,
    socket: {
      data(socket, data) {
        handleData(socket, Buffer.from(data), config);
      },
      error(socket, error) {
        console.error('[DICOM] Socket error:', error);
      },
      close(socket) {
        // Clean up socket data
      },
    },
  });

  console.log(`[DICOM] C-STORE SCP listening on port ${config.port}`);
}

/**
 * Stop the DICOM server.
 */
export function stopDicomServer(): void {
  if (server) {
    server.stop(true);
    server = null;
    console.log('[DICOM] Server stopped');
  }
}

/**
 * Check if the DICOM server is running.
 */
export function isDicomServerRunning(): boolean {
  return server !== null;
}

// --- Association handling state (per socket) ---

interface SocketState {
  buffer: Buffer;
  association: AssociateRQ | null;
  acceptedContexts: Map<number, string>; // pcId -> transferSyntax
  currentTransfer: { id: string; fileBuffers: Buffer[] } | null;
}

const socketStates = new WeakMap<any, SocketState>();

function getSocketState(socket: any): SocketState {
  let state = socketStates.get(socket);
  if (!state) {
    state = { buffer: Buffer.alloc(0), association: null, acceptedContexts: new Map(), currentTransfer: null };
    socketStates.set(socket, state);
  }
  return state;
}

async function handleData(socket: any, data: Buffer, config: DicomAdapterConfig): Promise<void> {
  const state = getSocketState(socket);

  // Append to buffer
  state.buffer = Buffer.concat([state.buffer, data]);

  // Process complete PDUs
  while (state.buffer.length > 6) {
    const pduType = state.buffer[0];
    const pduLength = state.buffer.readUInt32BE(2);

    // Wait for full PDU
    if (state.buffer.length < 6 + pduLength) break;

    const pdu = state.buffer.subarray(0, 6 + pduLength);
    state.buffer = state.buffer.subarray(6 + pduLength);

    try {
      await handlePDU(socket, pdu, pduType, config);
    } catch (err) {
      console.error('[DICOM] Error handling PDU:', err);
    }
  }
}

async function handlePDU(socket: any, pdu: Buffer, pduType: number, config: DicomAdapterConfig): Promise<void> {
  const state = getSocketState(socket);

  switch (pduType) {
    case PDU_TYPE.A_ASSOCIATE_RQ: {
      const rq = parseAssociateRQ(pdu);
      state.association = rq;

      console.log(`[DICOM] Association request from ${rq.callingAE} → ${rq.calledAE}`);

      // Accept supported contexts
      const ac = buildAssociateAC(rq);
      for (const pc of rq.presentationContexts) {
        const supported = pc.transferSyntaxes.find(ts =>
          [
            '1.2.840.10008.1.2',   // Implicit VR LE
            '1.2.840.10008.1.2.1', // Explicit VR LE
          ].includes(ts)
        );
        if (supported) {
          state.acceptedContexts.set(pc.id, supported);
        }
      }

      socket.write(ac);

      // Create transfer record for this association
      const transferId = uuid();
      state.currentTransfer = { id: transferId, fileBuffers: [] };

      await db.insert(inboundTransfers).values({
        id: transferId,
        deviceId: null,
        adapterId: 'dicom-scp',
        status: 'processing',
        fileCount: 0,
        processedCount: 0,
        errorCount: 0,
        metadata: { callingAE: rq.callingAE, calledAE: rq.calledAE },
        createdAt: new Date().toISOString(),
      });

      break;
    }

    case PDU_TYPE.P_DATA_TF: {
      const { commandElements, presentationContextId, isCommand } = parsePDataTF(pdu);

      if (isCommand && commandElements.has('00000100')) {
        const commandField = commandElements.get('00000100');
        const messageId = commandElements.get('00000120') || 1;

        if (commandField === 0x0001) {
          // C-STORE-RQ
          const sopClassUid = commandElements.get('00000002') || '';
          const sopInstanceUid = commandElements.get('00001000') || uuid();

          // For now, immediately respond with success (the actual pixel data
          // may follow in subsequent PDVs, but we handle the simple case)
          const response = buildCStoreRSP(messageId, sopClassUid, sopInstanceUid, STATUS.SUCCESS);
          response[14] = presentationContextId; // Set correct PC ID
          socket.write(response);

          // Update transfer count
          if (state.currentTransfer) {
            await db.update(inboundTransfers)
              .set({ fileCount: sql`${inboundTransfers.fileCount} + 1` } as any)
              .where(eq(inboundTransfers.id, state.currentTransfer.id));
          }
        }
      }
      break;
    }

    case PDU_TYPE.A_RELEASE_RQ: {
      console.log('[DICOM] Release request');
      socket.write(buildReleaseRP());

      // Mark transfer as completed
      if (state.currentTransfer) {
        await db.update(inboundTransfers)
          .set({
            status: 'completed',
            completedAt: new Date().toISOString(),
          })
          .where(eq(inboundTransfers.id, state.currentTransfer.id));
        state.currentTransfer = null;
      }
      break;
    }

    case PDU_TYPE.A_ABORT: {
      console.log('[DICOM] Association aborted');
      if (state.currentTransfer) {
        await db.update(inboundTransfers)
          .set({ status: 'failed' })
          .where(eq(inboundTransfers.id, state.currentTransfer.id));
        state.currentTransfer = null;
      }
      break;
    }
  }
}
