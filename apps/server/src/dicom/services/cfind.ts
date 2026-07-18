/**
 * DICOM C-FIND SCP Service
 *
 * Handles C-FIND requests for Modality Worklist queries.
 * Devices can query for scheduled procedures using this service.
 *
 * Reference: DICOM PS3.7 Section 9.1.2 (C-FIND)
 */

import { Association } from '../ulp/association';
import { PDataTf } from '../ulp/pdu';
import { db, worklistItems } from '../../db';
import { eq, and, gte, lte, like } from 'drizzle-orm';
import { log } from '../../lib/audit';
import { AuditEvents } from '../../lib/audit-events';

// ─── C-FIND Status Codes ─────────────────────────────────────────────────────

export const CFindStatus = {
  SUCCESS: 0x0000,
  PENDING_MATCHES_CONTINUE: 0xFF00,
  PENDING_NO_MATCH: 0xFF01,
  PROCESSING_FAILURE: 0xA700,
  IDENTIFIER_DOES_NOT_MATCH_SOP_CLASS: 0xA900,
  UNABLE_TO_PROCESS: 0xC000,
} as const;

// ─── C-FIND Handler ──────────────────────────────────────────────────────────

/**
 * Handle incoming C-FIND request on an association.
 */
export function createCFindHandler(association: Association): (data: PDataTf) => Promise<void> {
  return async function handleCFindData(data: PDataTf): Promise<void> {
    try {
      if (!data.command) {
        // C-FIND only processes command sets
        return;
      }

      // Parse the C-FIND command
      // In a full implementation, this would parse the DICOM command set
      // and extract the query parameters

      // For now, we'll use simplified parsing
      const queryDataset = parseQueryDataset(data.data);

      // Query worklist items from database
      const results = await queryWorklist(queryDataset);

      // Send each result
      for (const item of results) {
        const resultDataset = formatWorklistResult(item);
        association.sendData(data.presentationContextId, resultDataset, false, false);
      }

      // Send final response (no more matches)
      association.sendCFindResponse(data.presentationContextId, null, true);

      // Audit log
      log({
        userId: 'system',
        action: AuditEvents.DICOM_QUERY,
        resource: 'worklist',
        details: {
          query: queryDataset,
          resultCount: results.length,
          callingAeTitle: association.getCallingAeTitle(),
        },
      });
    } catch (err) {
      console.error('[C-FIND] Error handling request:', err);
      association.sendCFindResponse(data.presentationContextId, null, true);
    }
  };
}

/**
 * Parse C-FIND query dataset.
 */
function parseQueryDataset(data: Buffer): Record<string, any> {
  // Simplified parsing - in a full implementation, this would
  // parse the DICOM dataset properly
  const query: Record<string, any> = {};

  // For now, return empty query to get all worklist items
  // A proper implementation would extract:
  // - 00080020 StudyDate
  // - 00080050 AccessionNumber
  // - 00080060 Modality
  // - 00100010 PatientName
  // - 00100020 PatientID
  // - 00400100 ScheduledProcedureStepSequence
  //   - 00400001 ScheduledStationAETitle
  //   - 00400002 ScheduledProcedureStepStartDate
  //   - 00400003 ScheduledProcedureStepStartTime
  //   - 00400009 ScheduledProcedureStepID

  return query;
}

/**
 * Query worklist items from database based on C-FIND query parameters.
 */
async function queryWorklist(query: Record<string, any>): Promise<any[]> {
  const conditions = [];

  // Build query conditions based on DICOM query parameters
  // If a field is empty in the query, it's a wildcard (match all)

  if (query.StudyDate) {
    // DICOM date range: YYYYMMDD or YYYYMMDD-YYYYMMDD
    const dateRange = query.StudyDate;
    if (typeof dateRange === 'string') {
      if (dateRange.includes('-')) {
        const [start, end] = dateRange.split('-');
        if (start) conditions.push(gte(worklistItems.scheduledProcedureStepStartDate, start));
        if (end) conditions.push(lte(worklistItems.scheduledProcedureStepStartDate, end));
      } else {
        conditions.push(eq(worklistItems.scheduledProcedureStepStartDate, dateRange));
      }
    }
  }

  if (query.Modality) {
    conditions.push(eq(worklistItems.modality, query.Modality));
  }

  if (query.PatientName) {
    conditions.push(like(worklistItems.patientName, `%${query.PatientName}%`));
  }

  if (query.AccessionNumber) {
    conditions.push(eq(worklistItems.accessionNumber, query.AccessionNumber));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Only return scheduled items
  const finalWhere = where
    ? and(where, eq(worklistItems.status, 'scheduled'))
    : eq(worklistItems.status, 'scheduled');

  return db.query.worklistItems.findMany({
    where: finalWhere,
    limit: 100, // Safety limit
  });
}

/**
 * Format a worklist item as a DICOM dataset for C-FIND response.
 */
function formatWorklistResult(item: any): Buffer {
  // Build a simplified DICOM dataset
  // In a full implementation, this would properly encode the DICOM tags

  const tags: Buffer[] = [];

  // Helper to add a DICOM tag
  const addTag = (group: number, element: number, vr: string, value: string) => {
    if (!value) return;
    const tag = Buffer.alloc(4);
    tag.writeUInt16LE(group, 0);
    tag.writeUInt16LE(element, 2);

    const vrBytes = Buffer.from(vr, 'ascii');
    const valueBytes = Buffer.from(value, 'ascii');

    const entry = Buffer.alloc(4 + 2 + 2 + valueBytes.length);
    tag.copy(entry, 0);
    vrBytes.copy(entry, 4);
    entry.writeUInt16LE(valueBytes.length, 6);
    valueBytes.copy(entry, 8);

    tags.push(entry);
  };

  // Patient module
  addTag(0x0010, 0x0010, 'PN', item.patientName); // PatientName
  addTag(0x0010, 0x0020, 'LO', item.patientId || ''); // PatientID
  addTag(0x0010, 0x0030, 'DA', item.patientBirthDate || ''); // PatientBirthDate
  addTag(0x0010, 0x0040, 'CS', item.patientSex || ''); // PatientSex

  // Visit module
  addTag(0x0008, 0x0050, 'SH', item.accessionNumber); // AccessionNumber

  // Scheduled Procedure Step
  addTag(0x0040, 0x0001, 'SH', item.scheduledStationName || ''); // ScheduledStationAETitle
  addTag(0x0040, 0x0002, 'DA', item.scheduledProcedureStepStartDate); // ScheduledProcedureStepStartDate
  addTag(0x0040, 0x0003, 'TM', item.scheduledProcedureStepStartTime || ''); // ScheduledProcedureStepStartTime
  addTag(0x0040, 0x0009, 'SH', item.scheduledProcedureStepId || ''); // ScheduledProcedureStepID
  addTag(0x0040, 0x0007, 'LO', item.requestedProcedureDescription || ''); // ScheduledProcedureStepDescription

  // Modality
  addTag(0x0008, 0x0060, 'CS', item.modality); // Modality

  // Referring Physician
  addTag(0x0008, 0x0090, 'PN', item.referringPhysicianName || ''); // ReferringPhysicianName

  return Buffer.concat(tags);
}
