/**
 * DICOM C-ECHO SCP Service
 *
 * Handles C-ECHO requests for connectivity testing.
 * C-ECHO is used to verify that a DICOM association is working correctly.
 *
 * Reference: DICOM PS3.7 Section 9.1.5 (C-ECHO)
 */

import { Association } from '../ulp/association';
import { PDataTf } from '../ulp/pdu';

// ─── C-ECHO Status Codes ─────────────────────────────────────────────────────

export const CEchoStatus = {
  SUCCESS: 0x0000,
  PROCESSING_FAILURE: 0x0112,
} as const;

// ─── C-ECHO Handler ──────────────────────────────────────────────────────────

/**
 * Handle incoming C-ECHO request on an association.
 */
export function createCEchoHandler(association: Association): (data: PDataTf) => Promise<void> {
  return async function handleCEchoData(data: PDataTf): Promise<void> {
    try {
      // C-ECHO is simple - just send a success response
      // The command field for C-ECHO-RQ is 0x0030
      // The response is C-ECHO-RSP (0x8030)

      if (data.command) {
        // Extract message ID from command
        let messageId = 0;
        if (data.data.length >= 4) {
          // Message ID is at offset 2 in the command set
          messageId = data.data.readUInt16LE(2);
        }

        // Build C-ECHO-RSP command
        const response = Buffer.alloc(12);
        response.writeUInt16LE(0x8030, 0); // Command Field: C-ECHO-RSP
        response.writeUInt16LE(messageId, 2); // Message ID Being Responded To
        response.writeUInt16LE(CEchoStatus.SUCCESS, 8); // Status: Success

        // Send response
        association.sendData(data.presentationContextId, response, true, true);

        console.log(`[C-ECHO] Responded to ping from ${association.getCallingAeTitle()}`);
      }
    } catch (err) {
      console.error('[C-ECHO] Error handling request:', err);

      // Send failure response
      const response = Buffer.alloc(12);
      response.writeUInt16LE(0x8030, 0); // Command Field: C-ECHO-RSP
      response.writeUInt16LE(CEchoStatus.PROCESSING_FAILURE, 8); // Status: Failure

      association.sendData(data.presentationContextId, response, true, true);
    }
  };
}
