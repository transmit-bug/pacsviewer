/**
 * DICOM Protocol Constants and Types.
 *
 * Implements PS3.8 (PDU layer) and PS3.10 (file format) basics.
 * First version supports only uncompressed Transfer Syntaxes.
 */

// --- PDU Types (PS3.8 Table 9-1) ---
export const PDU_TYPE = {
  A_ASSOCIATE_RQ: 0x01,
  A_ASSOCIATE_AC: 0x02,
  A_ASSOCIATE_RJ: 0x03,
  P_DATA_TF: 0x04,
  A_RELEASE_RQ: 0x05,
  A_RELEASE_RP: 0x06,
  A_ABORT: 0x07,
} as const;

// --- SOP Classes (subset relevant to ophthalmic imaging) ---
export const SOP_CLASS = {
  // Storage
  CT_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.2',
  MR_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.4',
  US_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.6.1',
  CR_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.1',
  DIGITAL_XRAY_STORAGE: '1.2.840.10008.5.1.4.1.1.1.1',
  OPHTHALMIC_PHOTOGRAPHY: '1.2.840.10008.5.1.4.1.1.77.1.5.1',
  OPHTHALMIC_TOMOGRAPHY: '1.2.840.10008.5.1.4.1.1.77.1.5.4',
  VL_ENDOSCOPIC_IMAGE_STORAGE: '1.2.840.10008.5.1.4.1.1.77.1.1',
  // Verification
  VERIFICATION: '1.2.840.10008.1.1',
  // Query/Retrieve
  PATIENT_ROOT_FIND: '1.2.840.10008.5.1.4.1.2.1.1',
  PATIENT_ROOT_MOVE: '1.2.840.10008.5.1.4.1.2.1.2',
  STUDY_ROOT_FIND: '1.2.840.10008.5.1.4.1.2.2.1',
  STUDY_ROOT_MOVE: '1.2.840.10008.5.1.4.1.2.2.2',
} as const;

// --- Transfer Syntaxes ---
export const TRANSFER_SYNTAX = {
  IMPLICIT_VR_LITTLE_ENDIAN: '1.2.840.10008.1.2',
  EXPLICIT_VR_LITTLE_ENDIAN: '1.2.840.10008.1.2.1',
  EXPLICIT_VR_BIG_ENDIAN: '1.2.840.10008.1.2.2',
  JPEG_BASELINE: '1.2.840.10008.1.2.4.50',
  JPEG_LOSSLESS: '1.2.840.10008.1.2.4.57',
  JPEG2000_LOSSLESS: '1.2.840.10008.1.2.4.90',
} as const;

// Supported transfer syntaxes for v1 (uncompressed only)
export const SUPPORTED_TRANSFER_SYNTAXES = [
  TRANSFER_SYNTAX.IMPLICIT_VR_LITTLE_ENDIAN,
  TRANSFER_SYNTAX.EXPLICIT_VR_LITTLE_ENDIAN,
];

// --- Command Field values ---
export const COMMAND_FIELD = {
  C_STORE_RQ: 0x0001,
  C_STORE_RSP: 0x8001,
  C_FIND_RQ: 0x0020,
  C_FIND_RSP: 0x8020,
  C_MOVE_RQ: 0x0021,
  C_MOVE_RSP: 0x8021,
  C_GET_RQ: 0x0010,
  C_GET_RSP: 0x8010,
  C_ECHO_RQ: 0x0030,
  C_ECHO_RSP: 0x8030,
} as const;

// --- Status codes ---
export const STATUS = {
  SUCCESS: 0x0000,
  PENDING: 0xFF00,
  CANCEL: 0xFE00,
  PROCESSING_FAILURE: 0xA700,
  OUT_OF_RESOURCES: 0xA701,
  SOP_CLASS_NOT_SUPPORTED: 0x0122,
} as const;

// --- DICOM Tags (group, element) ---
export const TAG = {
  // Command
  COMMAND_FIELD: [0x0000, 0x0100],
  AFFECTED_SOP_CLASS_UID: [0x0000, 0x0002],
  MESSAGE_ID: [0x0000, 0x0110],
  PRIORITY: [0x0000, 0x0700],
  COMMAND_DATA_SET_TYPE: [0x0000, 0x0800],
  AFFECTED_SOP_INSTANCE_UID: [0x0000, 0x1000],
  STATUS_CODE: [0x0000, 0x0900],
  // Dataset
  PATIENT_NAME: [0x0010, 0x0010],
  PATIENT_ID: [0x0010, 0x0020],
  STUDY_INSTANCE_UID: [0x0020, 0x000D],
  SERIES_INSTANCE_UID: [0x0020, 0x000E],
  SOP_INSTANCE_UID: [0x0008, 0x0018],
  SOP_CLASS_UID: [0x0008, 0x0016],
  TRANSFER_SYNTAX_UID: [0x0002, 0x0010],
  MODALITY: [0x0008, 0x0060],
  PIXEL_DATA: [0x7FE0, 0x0010],
} as const;

// --- Presentation Context result reasons ---
export const PRESENTATION_CONTEXT_RESULT = {
  ACCEPTANCE: 0,
  USER_REJECTION: 1,
  NO_REASON: 2,
  ABSTRACT_SYNTAX_NOT_SUPPORTED: 3,
  TRANSFER_SYNTAXES_NOT_SUPPORTED: 4,
} as const;

/**
 * Format a tag tuple as a DICOM tag string.
 */
export function tagToString(group: number, element: number): string {
  return `(${group.toString(16).padStart(4, '0')},${element.toString(16).padStart(4, '0')})`;
}
