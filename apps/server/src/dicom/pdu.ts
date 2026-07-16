/**
 * DICOM PDU Parser/Builder — PS3.8 protocol data unit layer.
 *
 * Handles Association negotiation (A-ASSOCIATE-RQ/AC/RJ),
 * P-DATA-TF (command + dataset), A-RELEASE, and A-ABORT.
 */

import { PDU_TYPE, TRANSFER_SYNTAX, PRESENTATION_CONTEXT_RESULT, SUPPORTED_TRANSFER_SYNTAXES } from './constants';

// --- PDU structures ---

export interface AssociateRQ {
  pduType: typeof PDU_TYPE.A_ASSOCIATE_RQ;
  protocolVersion: number;
  calledAE: string;
  callingAE: string;
  applicationContext: string;
  presentationContexts: Array<{
    id: number;
    abstractSyntax: string;
    transferSyntaxes: string[];
  }>;
  maxPDULength: number;
}

export interface AssociateAC {
  pduType: typeof PDU_TYPE.A_ASSOCIATE_AC;
  protocolVersion: number;
  calledAE: string;
  callingAE: string;
  applicationContext: string;
  presentationContexts: Array<{
    id: number;
    result: number;
    transferSyntax: string;
  }>;
  maxPDULength: number;
}

const APPLICATION_CONTEXT = '1.2.840.10008.3.1.1.1';
const DEFAULT_MAX_PDU = 16384;

/**
 * Parse an A-ASSOCIATE-RQ PDU from a buffer.
 */
export function parseAssociateRQ(buffer: Buffer, offset: number = 0): AssociateRQ {
  let pos = offset;

  const pduType = buffer[pos++];
  pos++; // reserved
  const pduLength = buffer.readUInt32BE(pos);
  pos += 4;

  const protocolVersion = buffer.readUInt16BE(pos);
  pos += 2;
  pos += 2; // reserved

  // Called AE (16 bytes, padded with spaces)
  const calledAE = buffer.subarray(pos, pos + 16).toString('ascii').trim();
  pos += 16;

  // Calling AE (16 bytes)
  const callingAE = buffer.subarray(pos, pos + 16).toString('ascii').trim();
  pos += 16;

  pos += 32; // padding

  // Parse items
  let applicationContext = '';
  const presentationContexts: AssociateRQ['presentationContexts'] = [];
  let maxPDULength = DEFAULT_MAX_PDU;

  const pduEnd = pos + pduLength - 68; // subtract fixed header (6 + 2 + 2 + 16 + 16 + 32)

  while (pos < pduEnd) {
    const itemType = buffer[pos++];
    pos++; // reserved
    const itemLength = buffer.readUInt16BE(pos);
    pos += 2;

    if (itemType === 0x10) {
      // Application Context
      applicationContext = buffer.subarray(pos, pos + itemLength).toString('ascii');
    } else if (itemType === 0x20) {
      // Presentation Context
      const pcId = buffer[pos];
      pos += 4; // pcId + 3 reserved

      let abstractSyntax = '';
      const transferSyntaxes: string[] = [];
      const pcEnd = pos + itemLength - 4;

      while (pos < pcEnd) {
        const subType = buffer[pos++];
        pos++; // reserved
        const subLen = buffer.readUInt16BE(pos);
        pos += 2;

        if (subType === 0x30) {
          // Abstract Syntax
          abstractSyntax = buffer.subarray(pos, pos + subLen).toString('ascii');
        } else if (subType === 0x40) {
          // Transfer Syntax
          transferSyntaxes.push(buffer.subarray(pos, pos + subLen).toString('ascii'));
        }
        pos += subLen;
      }

      presentationContexts.push({ id: pcId, abstractSyntax, transferSyntaxes });
      continue; // Don't advance pos again
    } else if (itemType === 0x50) {
      // User Information
      const uiEnd = pos + itemLength;
      while (pos < uiEnd) {
        const subType = buffer[pos++];
        pos++; // reserved
        const subLen = buffer.readUInt16BE(pos);
        pos += 2;

        if (subType === 0x51) {
          // Max PDU Length
          maxPDULength = buffer.readUInt32BE(pos);
        }
        pos += subLen;
      }
      continue;
    }

    pos += itemLength;
  }

  return {
    pduType: PDU_TYPE.A_ASSOCIATE_RQ,
    protocolVersion,
    calledAE,
    callingAE,
    applicationContext,
    presentationContexts,
    maxPDULength,
  };
}

/**
 * Build an A-ASSOCIATE-AC PDU.
 */
export function buildAssociateAC(rq: AssociateRQ): Buffer {
  // Build presentation context results
  const pcBuffers: Buffer[] = [];
  for (const pc of rq.presentationContexts) {
    // Check if we support this abstract syntax and any transfer syntax
    const supportedTS = pc.transferSyntaxes.find(ts => SUPPORTED_TRANSFER_SYNTAXES.includes(ts as any));

    if (supportedTS) {
      // Accepted
      const tsItem = buildItem(0x40, Buffer.from(supportedTS, 'ascii'));
      const pcContent = Buffer.alloc(4);
      pcContent[0] = pc.id; // result = acceptance is in the sub-item
      const pcItem = buildItem(0x21, Buffer.concat([
        Buffer.from([pc.id, PRESENTATION_CONTEXT_RESULT.ACCEPTANCE, 0, 0]),
        tsItem,
      ]));
      pcBuffers.push(pcItem);
    } else {
      // Rejected — transfer syntax not supported
      const pcItem = buildItem(0x21, Buffer.from([
        pc.id,
        PRESENTATION_CONTEXT_RESULT.TRANSFER_SYNTAXES_NOT_SUPPORTED,
        0, 0,
      ]));
      pcBuffers.push(pcItem);
    }
  }

  // Application context item
  const appContextItem = buildItem(0x10, Buffer.from(APPLICATION_CONTEXT, 'ascii'));

  // User information item
  const maxPduSubItem = Buffer.alloc(8);
  maxPduSubItem[0] = 0x51; // Max PDU Length type
  maxPduSubItem[1] = 0;
  maxPduSubItem.writeUInt16BE(4, 2);
  maxPduSubItem.writeUInt32BE(DEFAULT_MAX_PDU, 4);
  const userInfoItem = buildItem(0x50, maxPduSubItem);

  // Variable items
  const variableItems = Buffer.concat([appContextItem, ...pcBuffers, userInfoItem]);

  // Fixed header: protocol version (2) + reserved (2) + called AE (16) + calling AE (16) + reserved (32) = 68
  const header = Buffer.alloc(68);
  header.writeUInt16BE(rq.protocolVersion, 0);
  Buffer.from(rq.calledAE.padEnd(16, ' ').slice(0, 16), 'ascii').copy(header, 4);
  Buffer.from(rq.callingAE.padEnd(16, ' ').slice(0, 16), 'ascii').copy(header, 20);

  const pduLength = 68 + variableItems.length;
  const pdu = Buffer.alloc(6 + pduLength);
  pdu[0] = PDU_TYPE.A_ASSOCIATE_AC;
  pdu[1] = 0; // reserved
  pdu.writeUInt32BE(pduLength, 2);
  header.copy(pdu, 6);
  variableItems.copy(pdu, 74);

  return pdu;
}

/**
 * Build an A-RELEASE-RP PDU.
 */
export function buildReleaseRP(): Buffer {
  const pdu = Buffer.alloc(10);
  pdu[0] = PDU_TYPE.A_RELEASE_RP;
  pdu[1] = 0;
  pdu.writeUInt32BE(4, 2);
  return pdu;
}

/**
 * Build a C-STORE-RSP (response) P-DATA-TF.
 */
export function buildCStoreRSP(messageId: number, sopClassUid: string, sopInstanceUid: string, status: number): Buffer {
  // Build command dataset in Implicit VR Little Endian
  const commandParts: Buffer[] = [];

  // Command Field (0000,0100) — US
  commandParts.push(buildCommandElement(0x0000, 0x0100, 2, status === 0 ? 0x8001 : 0x0001));

  // Affected SOP Class UID (0000,0002)
  commandParts.push(buildCommandElementUID(0x0000, 0x0002, sopClassUid));

  // Message ID Being Responded To (0000,0120)
  commandParts.push(buildCommandElement(0x0000, 0x0120, 2, messageId));

  // Command Data Set Type (0000,0800) — 0x0101 = no dataset
  commandParts.push(buildCommandElement(0x0000, 0x0800, 2, 0x0101));

  // Status (0000,0900)
  commandParts.push(buildCommandElement(0x0000, 0x0900, 2, status));

  // Affected SOP Instance UID (0000,1000)
  commandParts.push(buildCommandElementUID(0x0000, 0x1000, sopInstanceUid));

  const commandData = Buffer.concat(commandParts);

  // Build P-DATA-TF with command
  const pdvHeader = Buffer.alloc(6);
  pdvHeader.writeUInt32BE(commandData.length + 2, 0);
  pdvHeader[4] = 0x03; // command | last fragment
  pdvHeader[5] = 0; // presentation context ID (will be set by caller)

  const pduLength = 2 + pdvHeader.length + commandData.length;
  const pdu = Buffer.alloc(6 + pduLength);
  pdu[0] = PDU_TYPE.P_DATA_TF;
  pdu[1] = 0;
  pdu.writeUInt32BE(pduLength, 2);
  pdu.writeUInt32BE(pduLength - 2, 6); // item length
  pdvHeader.copy(pdu, 10);
  commandData.copy(pdu, 16);

  return pdu;
}

// --- Helpers ---

function buildItem(type: number, data: Buffer): Buffer {
  const item = Buffer.alloc(4 + data.length);
  item[0] = type;
  item[1] = 0;
  item.writeUInt16BE(data.length, 2);
  data.copy(item, 4);
  return item;
}

function buildCommandElement(group: number, element: number, vrLength: number, value: number): Buffer {
  const buf = Buffer.alloc(8 + vrLength);
  buf.writeUInt16LE(group, 0);
  buf.writeUInt16LE(element, 2);
  buf[4] = vrLength; // VR length indicator
  buf[5] = 0;
  buf[6] = 0;
  buf[7] = 0;
  if (vrLength === 2) buf.writeUInt16LE(value, 8);
  else buf.writeUInt32LE(value, 8);
  return buf;
}

function buildCommandElementUID(group: number, element: number, uid: string): Buffer {
  let uidBuf = Buffer.from(uid, 'ascii');
  if (uidBuf.length % 2 !== 0) {
    uidBuf = Buffer.concat([uidBuf, Buffer.from([0])]); // pad with null
  }
  const header = Buffer.alloc(8);
  header.writeUInt16LE(group, 0);
  header.writeUInt16LE(element, 2);
  header.writeUInt16LE(uidBuf.length, 4);
  header[6] = 0;
  header[7] = 0;
  return Buffer.concat([header, uidBuf]);
}

/**
 * Parse P-DATA-TF to extract command elements.
 */
export function parsePDataTF(buffer: Buffer, offset: number = 0): { presentationContextId: number; commandElements: Map<string, any>; isCommand: boolean } {
  let pos = offset;

  pos++; // pduType
  pos++; // reserved
  const pduLength = buffer.readUInt32BE(pos);
  pos += 4;

  // Item
  pos += 4; // item length

  // PDV
  const pdvLength = buffer.readUInt32BE(pos);
  pos += 4;
  const header = buffer[pos];
  const isCommand = (header & 0x01) === 1;
  const presentationContextId = buffer[pos + 1];
  pos += 2;

  const data = buffer.subarray(pos, pos + pdvLength - 2);

  // Parse command elements (Implicit VR LE)
  const commandElements = new Map<string, any>();
  let dpos = 0;
  while (dpos < data.length - 8) {
    const group = data.readUInt16LE(dpos);
    const element = data.readUInt16LE(dpos + 2);
    const length = data.readUInt16LE(dpos + 4);
    dpos += 8;

    if (dpos + length > data.length) break;

    const value = data.subarray(dpos, dpos + length);
    const key = `${group.toString(16).padStart(4, '0')}${element.toString(16).padStart(4, '0')}`;

    if (length <= 4) {
      commandElements.set(key, value.readUInt16LE(0));
    } else {
      commandElements.set(key, value.toString('utf8').replace(/\0/g, ''));
    }
    dpos += length;
  }

  return { presentationContextId, commandElements, isCommand };
}
