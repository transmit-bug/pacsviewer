/**
 * DICOM Upper Layer Protocol (ULP) - PDU Parser
 *
 * Handles parsing and creation of DICOM Protocol Data Units (PDUs)
 * as defined in DICOM PS3.8 Section 9.3.
 *
 * PDU Types:
 *   0x01 - A-ASSOCIATE-RQ (Connection Request)
 *   0x02 - A-ASSOCIATE-AC (Connection Accept)
 *   0x03 - A-ASSOCIATE-RJ (Connection Reject)
 *   0x04 - P-DATA-TF (Data Transfer)
 *   0x05 - A-RELEASE-RQ (Release Request)
 *   0x06 - A-RELEASE-RP (Release Response)
 *   0x07 - A-ABORT (Abort)
 */

// ─── PDU Type Constants ──────────────────────────────────────────────────────

export enum PduType {
  ASSOCIATE_RQ = 0x01,
  ASSOCIATE_AC = 0x02,
  ASSOCIATE_RJ = 0x03,
  P_DATA_TF = 0x04,
  RELEASE_RQ = 0x05,
  RELEASE_RP = 0x06,
  ABORT = 0x07,
}

// ─── Item Type Constants ─────────────────────────────────────────────────────

export enum ItemType {
  APPLICATION_CONTEXT = 0x10,
  PRESENTATION_CONTEXT = 0x20,
  ABSTRACT_SYNTAX = 0x30,
  TRANSFER_SYNTAX = 0x40,
  USER_INFO = 0x50,
  MAXIMUM_LENGTH = 0x51,
  IMPLEMENTATION_CLASS_UID = 0x52,
  IMPLEMENTATION_VERSION = 0x55,
}

// ─── Result Constants ────────────────────────────────────────────────────────

export enum PresentationContextResult {
  ACCEPTANCE = 0x00,
  USER_REJECTION = 0x01,
  NO_REASON = 0x02,
  ABSTRACT_SYNTAX_NOT_SUPPORTED = 0x03,
  TRANSFER_SYNTAXES_NOT_SUPPORTED = 0x04,
}

export enum AbortSource {
  UL_SERVICE_USER = 0x00,
  UL_SERVICE_PROVIDER = 0x02,
}

export enum AbortReason {
  NOT_SPECIFIED = 0x00,
  UNRECOGNIZED_PDU = 0x01,
  UNEXPECTED_PDU = 0x02,
  UNRECOGNIZED_PARAMETER = 0x04,
  UNEXPECTED_PARAMETER = 0x05,
  INVALID_PARAMETER = 0x06,
}

// ─── Interfaces ──────────────────────────────────────────────────────────────

export interface PduHeader {
  type: PduType;
  length: number;
}

export interface PresentationContext {
  id: number;
  abstractSyntax: string;
  transferSyntaxes: string[];
  result?: PresentationContextResult;
  selectedTransferSyntax?: string;
}

export interface UserInformation {
  maxLength: number;
  implementationClassUid: string;
  implementationVersion: string;
}

export interface AssociateRq {
  calledAeTitle: string;
  callingAeTitle: string;
  applicationContext: string;
  presentationContexts: PresentationContext[];
  userInfo: UserInformation;
}

export interface AssociateAc {
  calledAeTitle: string;
  callingAeTitle: string;
  applicationContext: string;
  presentationContexts: PresentationContext[];
  userInfo: UserInformation;
}

export interface AssociateRj {
  result: number;
  source: number;
  reason: number;
}

export interface PDataTf {
  presentationContextId: number;
  command: boolean;
  lastFragment: boolean;
  data: Buffer;
}

export interface Abort {
  source: AbortSource;
  reason: AbortReason;
}

// ─── Parser Functions ────────────────────────────────────────────────────────

/**
 * Parse PDU header (type + length).
 */
export function parsePduHeader(buffer: Buffer, offset: number = 0): PduHeader {
  if (buffer.length - offset < 6) {
    throw new Error('Buffer too short for PDU header');
  }

  return {
    type: buffer[offset],
    length: buffer.readUInt32BE(offset + 2),
  };
}

/**
 * Parse A-ASSOCIATE-RQ PDU.
 */
export function parseAssociateRq(buffer: Buffer, offset: number = 0): AssociateRq {
  // Skip PDU header (6 bytes) and reserved (2 bytes)
  let pos = offset + 8;

  // Protocol version (2 bytes) - skip
  pos += 2;

  // Reserved (2 bytes) - skip
  pos += 2;

  // Called AE Title (16 bytes)
  const calledAeTitle = buffer.subarray(pos, pos + 16).toString('ascii').trim();
  pos += 16;

  // Calling AE Title (16 bytes)
  const callingAeTitle = buffer.subarray(pos, pos + 16).toString('ascii').trim();
  pos += 16;

  // Reserved (32 bytes) - skip
  pos += 32;

  // Parse variable items
  const presentationContexts: PresentationContext[] = [];
  let applicationContext = '1.2.840.10008.3.1.1.1'; // Default
  let userInfo: UserInformation = {
    maxLength: 16384,
    implementationClassUid: '',
    implementationVersion: '',
  };

  while (pos < buffer.length - offset) {
    const itemType = buffer[offset + pos];
    const itemLength = buffer.readUInt16BE(offset + pos + 2);

    switch (itemType) {
      case ItemType.APPLICATION_CONTEXT:
        applicationContext = buffer.subarray(
          offset + pos + 4,
          offset + pos + 4 + itemLength
        ).toString('ascii');
        break;

      case ItemType.PRESENTATION_CONTEXT:
        const pc = parsePresentationContextRq(buffer, offset + pos);
        presentationContexts.push(pc);
        break;

      case ItemType.USER_INFO:
        userInfo = parseUserInformation(buffer, offset + pos);
        break;
    }

    pos += 4 + itemLength;
  }

  return {
    calledAeTitle,
    callingAeTitle,
    applicationContext,
    presentationContexts,
    userInfo,
  };
}

/**
 * Parse Presentation Context item from A-ASSOCIATE-RQ.
 */
function parsePresentationContextRq(buffer: Buffer, offset: number): PresentationContext {
  let pos = offset + 4; // Skip item type + length

  // Presentation Context ID
  const id = buffer[pos + 1]; // Use byte 2 (1-indexed)
  pos += 4; // Skip ID + reserved

  // Parse abstract syntax and transfer syntaxes
  let abstractSyntax = '';
  const transferSyntaxes: string[] = [];

  const itemEnd = offset + 4 + buffer.readUInt16BE(offset + 2);

  while (pos < itemEnd) {
    const subType = buffer[pos];
    const subLength = buffer.readUInt16BE(pos + 2);

    if (subType === ItemType.ABSTRACT_SYNTAX) {
      abstractSyntax = buffer.subarray(pos + 4, pos + 4 + subLength).toString('ascii');
    } else if (subType === ItemType.TRANSFER_SYNTAX) {
      transferSyntaxes.push(
        buffer.subarray(pos + 4, pos + 4 + subLength).toString('ascii')
      );
    }

    pos += 4 + subLength;
  }

  return { id, abstractSyntax, transferSyntaxes };
}

/**
 * Parse User Information item.
 */
function parseUserInformation(buffer: Buffer, offset: number): UserInformation {
  let pos = offset + 4; // Skip item type + length
  const itemEnd = offset + 4 + buffer.readUInt16BE(offset + 2);

  let maxLength = 16384;
  let implementationClassUid = '';
  let implementationVersion = '';

  while (pos < itemEnd) {
    const subType = buffer[pos];
    const subLength = buffer.readUInt16BE(pos + 2);

    switch (subType) {
      case ItemType.MAXIMUM_LENGTH:
        maxLength = buffer.readUInt32BE(pos + 4);
        break;
      case ItemType.IMPLEMENTATION_CLASS_UID:
        implementationClassUid = buffer.subarray(pos + 4, pos + 4 + subLength).toString('ascii');
        break;
      case ItemType.IMPLEMENTATION_VERSION:
        implementationVersion = buffer.subarray(pos + 4, pos + 4 + subLength).toString('ascii');
        break;
    }

    pos += 4 + subLength;
  }

  return { maxLength, implementationClassUid, implementationVersion };
}

/**
 * Parse A-ASSOCIATE-AC PDU.
 */
export function parseAssociateAc(buffer: Buffer, offset: number = 0): AssociateAc {
  // Same structure as RQ
  return parseAssociateRq(buffer, offset) as AssociateAc;
}

/**
 * Parse A-ASSOCIATE-RJ PDU.
 */
export function parseAssociateRj(buffer: Buffer, offset: number = 0): AssociateRj {
  return {
    result: buffer[offset + 8],
    source: buffer[offset + 9],
    reason: buffer[offset + 10],
  };
}

/**
 * Parse P-DATA-TF PDU.
 */
export function parsePDataTf(buffer: Buffer, offset: number = 0): PDataTf {
  let pos = offset + 6; // Skip PDU header

  // Presentation Context ID (1 byte) + Message Control Header (1 byte)
  const presentationContextId = buffer[pos + 1];
  const controlHeader = buffer[pos + 2];
  pos += 4; // Skip item header

  const command = (controlHeader & 0x01) === 0x01;
  const lastFragment = (controlHeader & 0x02) === 0x02;

  // Data length
  const dataLength = buffer.readUInt32BE(offset + 2);
  const data = buffer.subarray(pos, pos + dataLength - 4);

  return {
    presentationContextId,
    command,
    lastFragment,
    data: Buffer.from(data),
  };
}

/**
 * Parse A-RELEASE-RQ PDU.
 */
export function parseReleaseRq(buffer: Buffer, offset: number = 0): void {
  // No additional data
}

/**
 * Parse A-RELEASE-RP PDU.
 */
export function parseReleaseRp(buffer: Buffer, offset: number = 0): void {
  // No additional data
}

/**
 * Parse A-ABORT PDU.
 */
export function parseAbort(buffer: Buffer, offset: number = 0): Abort {
  return {
    source: buffer[offset + 8] as AbortSource,
    reason: buffer[offset + 9] as AbortReason,
  };
}

// ─── Builder Functions ───────────────────────────────────────────────────────

/**
 * Build A-ASSOCIATE-AC PDU.
 */
export function buildAssociateAc(
  calledAeTitle: string,
  callingAeTitle: string,
  presentationContexts: PresentationContext[],
  maxLength: number = 16384
): Buffer {
  const buffers: Buffer[] = [];

  // Application Context item
  const appContext = Buffer.from('1.2.840.10008.3.1.1.1', 'ascii');
  buffers.push(buildItem(ItemType.APPLICATION_CONTEXT, appContext));

  // Presentation Context items
  for (const pc of presentationContexts) {
    buffers.push(buildPresentationContextAc(pc));
  }

  // User Information item
  const userInfoBuffers: Buffer[] = [];
  userInfoBuffers.push(buildItem(ItemType.MAXIMUM_LENGTH, Buffer.alloc(4).fill(0).writeUInt32BE(maxLength, 0) ? Buffer.alloc(4) : (() => { const b = Buffer.alloc(4); b.writeUInt32BE(maxLength, 0); return b; })()));
  userInfoBuffers.push(buildItem(ItemType.IMPLEMENTATION_CLASS_UID, Buffer.from('1.2.826.0.1.3680043.9.4424.1', 'ascii')));
  userInfoBuffers.push(buildItem(ItemType.IMPLEMENTATION_VERSION, Buffer.from('PACSVIEWER-1.0', 'ascii')));

  const userInfoData = Buffer.concat(userInfoBuffers);
  buffers.push(buildItem(ItemType.USER_INFO, userInfoData));

  // Build complete PDU
  const body = Buffer.concat(buffers);

  // AE Titles (32 bytes each, padded with spaces)
  const calledBuffer = Buffer.alloc(16, ' ');
  const callingBuffer = Buffer.alloc(16, ' ');
  Buffer.from(calledAeTitle, 'ascii').copy(calledBuffer);
  Buffer.from(callingAeTitle, 'ascii').copy(callingBuffer);

  const header = Buffer.alloc(6 + 2 + 2 + 2 + 32); // PDU header + version + reserved + AE titles + reserved
  header[0] = PduType.ASSOCIATE_AC;
  header.writeUInt32BE(2 + 2 + 2 + 32 + body.length, 2);
  // Protocol version
  header.writeUInt16BE(0x0001, 6);

  return Buffer.concat([header, calledBuffer, callingBuffer, Buffer.alloc(32), body]);
}

/**
 * Build Presentation Context item for A-ASSOCIATE-AC.
 */
function buildPresentationContextAc(pc: PresentationContext): Buffer {
  const subItems: Buffer[] = [];

  // Transfer Syntax (selected)
  const transferSyntax = Buffer.from(pc.selectedTransferSyntax || '1.2.840.10008.1.2', 'ascii');
  subItems.push(buildItem(ItemType.TRANSFER_SYNTAX, transferSyntax));

  const subData = Buffer.concat(subItems);

  // Presentation Context item
  const data = Buffer.alloc(4 + subData.length);
  data[1] = pc.id; // Presentation Context ID
  data[3] = pc.result || PresentationContextResult.ACCEPTANCE; // Result
  subData.copy(data, 4);

  return buildItem(ItemType.PRESENTATION_CONTEXT, data);
}

/**
 * Build A-ASSOCIATE-RJ PDU.
 */
export function buildAssociateRj(result: number, source: number, reason: number): Buffer {
  const body = Buffer.alloc(4);
  body[0] = result;
  body[1] = source;
  body[2] = reason;

  const header = buildPduHeader(PduType.ASSOCIATE_RJ, body.length);
  return Buffer.concat([header, body]);
}

/**
 * Build P-DATA-TF PDU.
 */
export function buildPDataTf(
  presentationContextId: number,
  data: Buffer,
  command: boolean = false,
  lastFragment: boolean = true
): Buffer {
  const controlHeader = (command ? 0x01 : 0x00) | (lastFragment ? 0x02 : 0x00);

  // PDV item
  const pdvItem = Buffer.alloc(4 + data.length);
  pdvItem[0] = presentationContextId;
  pdvItem[1] = controlHeader;
  data.copy(pdvItem, 4);

  // P-DATA PDU
  const header = buildPduHeader(PduType.P_DATA_TF, pdvItem.length);
  return Buffer.concat([header, pdvItem]);
}

/**
 * Build A-RELEASE-RQ PDU.
 */
export function buildReleaseRq(): Buffer {
  return buildPduHeader(PduType.RELEASE_RQ, 0);
}

/**
 * Build A-RELEASE-RP PDU.
 */
export function buildReleaseRp(): Buffer {
  return buildPduHeader(PduType.RELEASE_RP, 0);
}

/**
 * Build A-ABORT PDU.
 */
export function buildAbort(source: AbortSource, reason: AbortReason): Buffer {
  const body = Buffer.alloc(4);
  body[2] = source;
  body[3] = reason;

  const header = buildPduHeader(PduType.ABORT, body.length);
  return Buffer.concat([header, body]);
}

// ─── Helper Functions ────────────────────────────────────────────────────────

function buildPduHeader(type: PduType, length: number): Buffer {
  const header = Buffer.alloc(6);
  header[0] = type;
  header.writeUInt32BE(length, 2);
  return header;
}

function buildItem(type: ItemType, data: Buffer): Buffer {
  const item = Buffer.alloc(4 + data.length);
  item[0] = type;
  item.writeUInt16BE(data.length, 2);
  data.copy(item, 4);
  return item;
}
