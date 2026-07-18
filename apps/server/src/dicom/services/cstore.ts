/**
 * DICOM C-STORE SCP Service
 *
 * Handles incoming C-STORE requests from DICOM devices.
 * Stores received DICOM files and updates the database.
 *
 * Reference: DICOM PS3.7 Section 9.1 (C-STORE)
 */

import { Association } from '../ulp/association';
import { PDataTf } from '../ulp/pdu';
import { parseDicomFile, isDicomFile, storeDicomFile } from '../../services/dicom';
import { log } from '../../lib/audit';
import { AuditEvents } from '../../lib/audit-events';

// ─── C-STORE Status Codes ────────────────────────────────────────────────────

export const CStoreStatus = {
  SUCCESS: 0x0000,
  PROCESSING_FAILURE: 0xA700,
  OUT_OF_RESOURCES: 0xA701,
  IDENTIFIER_DOES_NOT_MATCH_SOP_CLASS: 0xA900,
} as const;

// ─── C-STORE State ───────────────────────────────────────────────────────────

interface CStoreState {
  /** Buffer for accumulating DICOM data fragments */
  buffer: Buffer;
  /** Presentation context ID from the request */
  presentationContextId: number;
  /** Message ID from the command */
  messageId: number;
  /** SOP Instance UID being received */
  sopInstanceUid?: string;
  /** SOP Class UID being received */
  sopClassUid?: string;
}

// ─── C-STORE Handler ─────────────────────────────────────────────────────────

/**
 * Handle incoming C-STORE data on an association.
 * Accumulates data fragments until a complete DICOM file is received.
 */
export function createCStoreHandler(association: Association): (data: PDataTf) => Promise<void> {
  const state: CStoreState = {
    buffer: Buffer.alloc(0),
    presentationContextId: 0,
    messageId: 0,
  };

  return async function handleCStoreData(data: PDataTf): Promise<void> {
    try {
      // Update state with presentation context
      state.presentationContextId = data.presentationContextId;

      // Accumulate data
      state.buffer = Buffer.concat([state.buffer, data.data]);

      // If this is a command fragment, parse the C-STORE command
      if (data.command) {
        parseCStoreCommand(state, data.data);
        return;
      }

      // If this is the last data fragment, process the complete DICOM file
      if (data.lastFragment) {
        await processCompleteFile(association, state);

        // Reset buffer for next file
        state.buffer = Buffer.alloc(0);
        state.sopInstanceUid = undefined;
        state.sopClassUid = undefined;
      }
    } catch (err) {
      console.error('[C-STORE] Error handling data:', err);

      // Send failure response
      association.sendCStoreResponse(
        state.presentationContextId,
        CStoreStatus.PROCESSING_FAILURE,
        state.messageId
      );

      // Reset buffer
      state.buffer = Buffer.alloc(0);
    }
  };
}

/**
 * Parse C-STORE command to extract SOP Class/Instance UIDs.
 */
function parseCStoreCommand(state: CStoreState, commandData: Buffer): void {
  // DICOM command set is encoded as Implicit VR Little Endian
  // Parse the command fields (simplified)
  // In a full implementation, this would use a proper DICOM command parser

  // For now, we'll extract UIDs from the data phase
  // The command contains: CommandField, MessageID, Priority, etc.
  if (commandData.length >= 12) {
    state.messageId = commandData.readUInt16LE(2);
  }
}

/**
 * Process a complete DICOM file after all fragments are received.
 */
async function processCompleteFile(
  association: Association,
  state: CStoreState
): Promise<void> {
  const buffer = state.buffer;

  // Verify it's a DICOM file
  if (!isDicomFile(buffer)) {
    console.error('[C-STORE] Received data is not a valid DICOM file');
    association.sendCStoreResponse(
      state.presentationContextId,
      CStoreStatus.PROCESSING_FAILURE,
      state.messageId
    );
    return;
  }

  try {
    // Parse the DICOM file
    const parseResult = parseDicomFile(buffer);

    // Store the file and update database
    const storeResult = await storeDicomFile(parseResult);

    // Send success response
    association.sendCStoreResponse(
      state.presentationContextId,
      CStoreStatus.SUCCESS,
      state.messageId
    );

    // Audit log
    log({
      userId: 'system',
      action: AuditEvents.DICOM_CSTORE_RECEIVE,
      resource: 'image',
      resourceId: storeResult.imageId,
      details: {
        sopInstanceUid: storeResult.sopInstanceUid,
        studyId: storeResult.studyId,
        seriesId: storeResult.seriesId,
        isNew: storeResult.isNew,
        source: 'C-STORE',
        callingAeTitle: association.getCallingAeTitle(),
      },
    });

    console.log(
      `[C-STORE] Stored DICOM file: ${storeResult.sopInstanceUid} ` +
      `(Study: ${storeResult.studyId}, Series: ${storeResult.seriesId})`
    );
  } catch (err) {
    console.error('[C-STORE] Error storing DICOM file:', err);
    association.sendCStoreResponse(
      state.presentationContextId,
      CStoreStatus.PROCESSING_FAILURE,
      state.messageId
    );
  }
}

/**
 * Validate C-STORE request parameters.
 */
export function validateCStoreRequest(
  sopClassUid: string,
  sopInstanceUid: string
): { valid: boolean; error?: string } {
  // Validate SOP Class UID format
  if (!sopClassUid || !/^[0-9.]+$/.test(sopClassUid)) {
    return { valid: false, error: 'Invalid SOP Class UID' };
  }

  // Validate SOP Instance UID format
  if (!sopInstanceUid || !/^[0-9.]+$/.test(sopInstanceUid)) {
    return { valid: false, error: 'Invalid SOP Instance UID' };
  }

  return { valid: true };
}
