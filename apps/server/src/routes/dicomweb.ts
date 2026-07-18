/**
 * DICOMweb API Routes — WADO-RS, STOW-RS, QIDO-RS.
 *
 * Implements the DICOMweb standard for interoperability with
 * medical imaging systems and viewers like OHIF.
 *
 * Endpoints:
 *   WADO-RS (Web Access to DICOM Objects - RESTful Services):
 *     GET  /dicomweb/studies                     — QIDO-RS: Search for studies
 *     GET  /dicomweb/studies/{studyUid}/series    — QIDO-RS: Search for series
 *     GET  /dicomweb/studies/{studyUid}/series/{seriesUid}/instances — QIDO-RS: Search for instances
 *     GET  /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid} — WADO-RS: Retrieve instance
 *     GET  /dicomweb/studies/{studyUid}/series/{seriesUid}/instances/{instanceUid}/metadata — WADO-RS: Retrieve metadata
 *
 *   STOW-RS (Store Over the Web - RESTful Services):
 *     POST /dicomweb/studies — Store DICOM instances
 *
 * Reference: DICOM PS3.18 (Web Services)
 */

import { Hono } from 'hono';
import { eq, like, and, gte, lte, isNotNull } from 'drizzle-orm';
import multipart from 'parse-multipart-data';
import { db, studies, series, images, patients, dicomFrames } from '../db';
import { parseDicomFile, isDicomFile, storeDicomFile, readDicomFile } from '../services/dicom';
import { NotFoundError, ValidationError } from '../lib/errors';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';

const dicomwebRouter = new Hono();

// ─── QIDO-RS: Search for Studies ─────────────────────────────────────────────
dicomwebRouter.get('/studies', async (c) => {
  const patientName = c.req.query('PatientName');
  const patientId = c.req.query('PatientID');
  const studyDate = c.req.query('StudyDate');
  const modality = c.req.query('Modality');
  const studyInstanceUid = c.req.query('StudyInstanceUID');
  const limit = Math.min(100, Number(c.req.query('limit')) || 20);
  const offset = Number(c.req.query('offset')) || 0;

  // Build query conditions
  const conditions = [];
  if (studyInstanceUid) {
    conditions.push(eq(studies.studyInstanceUid, studyInstanceUid));
  }
  if (modality) {
    conditions.push(eq(studies.modality, modality));
  }
  if (studyDate) {
    // DICOM date range: YYYYMMDD or YYYYMMDD-YYYYMMDD
    if (studyDate.includes('-')) {
      const [start, end] = studyDate.split('-');
      if (start) conditions.push(gte(studies.studyDate, start));
      if (end) conditions.push(lte(studies.studyDate, end));
    } else {
      conditions.push(eq(studies.studyDate, studyDate));
    }
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Only return studies with DICOM UIDs (excludes seed data)
  const finalWhere = where 
    ? and(where, isNotNull(studies.studyInstanceUid))
    : isNotNull(studies.studyInstanceUid);

  const results = await db
    .select({
      studyInstanceUid: studies.studyInstanceUid,
      studyDate: studies.studyDate,
      studyTime: studies.studyTime,
      accessionNumber: studies.accessionNumber,
      modality: studies.modality,
      patientName: patients.name,
      patientId: patients.mrn,
      studyId: studies.id,
    })
    .from(studies)
    .leftJoin(patients, eq(studies.patientId, patients.id))
    .where(finalWhere)
    .limit(limit)
    .offset(offset);

  // Filter by patient name/id if provided (after join)
  let filtered = results;
  if (patientName) {
    filtered = filtered.filter(r => r.patientName?.toLowerCase().includes(patientName.toLowerCase()));
  }
  if (patientId) {
    filtered = filtered.filter(r => r.patientId?.includes(patientId));
  }

  // Return DICOMweb JSON format
  return c.json(filtered.map(r => ({
    '0020000D': { vr: 'UI', Value: [r.studyInstanceUid] },
    '00080020': { vr: 'DA', Value: [r.studyDate?.replace(/-/g, '')] },
    '00080030': { vr: 'TM', Value: [r.studyTime?.replace(/:/g, '')] },
    '00080050': { vr: 'SH', Value: [r.accessionNumber] },
    '00080060': { vr: 'CS', Value: [r.modality] },
    '00100010': { vr: 'PN', Value: [{ Alphabetic: r.patientName }] },
    '00100020': { vr: 'LO', Value: [r.patientId] },
  })));
});

// ─── QIDO-RS: Search for Series within a Study ──────────────────────────────
dicomwebRouter.get('/studies/:studyUid/series', async (c) => {
  const studyUid = c.req.param('studyUid');

  const study = await db.query.studies.findFirst({
    where: eq(studies.studyInstanceUid, studyUid),
  });
  if (!study) throw new NotFoundError('Study');

  const seriesList = await db.query.series.findMany({
    where: eq(series.studyId, study.id),
  });

  return c.json(seriesList.map(s => ({
    '0020000D': { vr: 'UI', Value: [studyUid] },
    '0020000E': { vr: 'UI', Value: [s.seriesInstanceUid] },
    '00200011': { vr: 'IS', Value: [String(s.seriesNumber)] },
    '0008103E': { vr: 'LO', Value: [s.seriesDescription] },
    '00080060': { vr: 'CS', Value: [s.modality] },
    '00180015': { vr: 'CS', Value: [s.bodyPart] },
  })));
});

// ─── QIDO-RS: Search for Instances within a Series ──────────────────────────
dicomwebRouter.get('/studies/:studyUid/series/:seriesUid/instances', async (c) => {
  const studyUid = c.req.param('studyUid');
  const seriesUid = c.req.param('seriesUid');

  const study = await db.query.studies.findFirst({
    where: eq(studies.studyInstanceUid, studyUid),
  });
  if (!study) throw new NotFoundError('Study');

  const seriesRecord = await db.query.series.findFirst({
    where: and(
      eq(series.studyId, study.id),
      eq(series.seriesInstanceUid, seriesUid),
    ),
  });
  if (!seriesRecord) throw new NotFoundError('Series');

  const instanceList = await db.query.images.findMany({
    where: eq(images.seriesId, seriesRecord.id),
    columns: {
      sopInstanceUid: true,
      sopClassUid: true,
      instanceNumber: true,
      transferSyntaxUid: true,
    },
  });

  return c.json(instanceList.map(img => ({
    '00080018': { vr: 'UI', Value: [img.sopInstanceUid] },
    '00080016': { vr: 'UI', Value: [img.sopClassUid] },
    '00200013': { vr: 'IS', Value: [String(img.instanceNumber)] },
    '00081190': { vr: 'UR', Value: [`/dicomweb/studies/${studyUid}/series/${seriesUid}/instances/${img.sopInstanceUid}`] },
  })));
});

// ─── WADO-RS: Retrieve Instance (DICOM binary) ─────────────────────────────
dicomwebRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instanceUid', async (c) => {
  const studyUid = c.req.param('studyUid');
  const seriesUid = c.req.param('seriesUid');
  const instanceUid = c.req.param('instanceUid');

  const image = await db.query.images.findFirst({
    where: eq(images.sopInstanceUid, instanceUid),
  });
  if (!image) throw new NotFoundError('Instance');

  const buffer = await readDicomFile(image.filePath);

  return new Response(buffer, {
    headers: {
      'Content-Type': 'application/dicom',
      'Content-Length': String(buffer.length),
    },
  });
});

// ─── WADO-RS: Retrieve Instance Metadata (JSON) ─────────────────────────────
dicomwebRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instanceUid/metadata', async (c) => {
  const instanceUid = c.req.param('instanceUid');

  const image = await db.query.images.findFirst({
    where: eq(images.sopInstanceUid, instanceUid),
  });
  if (!image) throw new NotFoundError('Instance');

  // Return the stored DICOM metadata in DICOM JSON format
  const metadata = image.metadata as Record<string, any> || {};

  return c.json([metadata]);
});

// ─── WADO-RS: Retrieve Frames ────────────────────────────────────────────────
dicomwebRouter.get('/studies/:studyUid/series/:seriesUid/instances/:instanceUid/frames/:frameIndex', async (c) => {
  const instanceUid = c.req.param('instanceUid');
  const frameIndex = Number(c.req.param('frameIndex'));

  const image = await db.query.images.findFirst({
    where: eq(images.sopInstanceUid, instanceUid),
  });
  if (!image) throw new NotFoundError('Instance');

  // Return frame-level metadata
  const frame = await db.query.dicomFrames.findFirst({
    where: and(
      eq(dicomFrames.imageId, image.id),
      eq(dicomFrames.frameIndex, frameIndex),
    ),
  });

  if (!frame) throw new NotFoundError('Frame');

  return c.json(frame);
});

// ─── API: Get all frames for an image ────────────────────────────────────────
dicomwebRouter.get('/images/:imageId/frames', async (c) => {
  const imageId = c.req.param('imageId');

  const image = await db.query.images.findFirst({
    where: eq(images.id, imageId),
    columns: { id: true, numberOfFrames: true },
  });
  if (!image) throw new NotFoundError('Image');

  const frames = await db.query.dicomFrames.findMany({
    where: eq(dicomFrames.imageId, imageId),
    orderBy: (f, { asc }) => [asc(f.frameIndex)],
  });

  return c.json({
    imageId,
    numberOfFrames: image.numberOfFrames,
    frames,
  });
});

// ─── STOW-RS: Store DICOM Instances ────────────────────────────────────────
dicomwebRouter.post('/studies', async (c) => {
  const contentType = c.req.header('Content-Type') || '';

  let dicomBuffers: Buffer[] = [];

  if (contentType.includes('multipart/related')) {
    // Parse multipart DICOM binary
    const body = await c.req.arrayBuffer();
    const buffer = Buffer.from(body);

    // Simple multipart parser for DICOM
    // In production, use a proper multipart parser
    dicomBuffers = extractDicomFromMultipart(buffer, contentType);
  } else if (contentType.includes('application/json')) {
    // STOW-RS with DICOM JSON
    return c.json({
      success: false,
      message: 'DICOM JSON STOW-RS not yet supported. Use multipart/related with application/dicom parts.',
    }, 415);
  } else {
    throw new ValidationError('Content-Type must be multipart/related with application/dicom parts');
  }

  if (dicomBuffers.length === 0) {
    throw new ValidationError('No DICOM instances found in request body');
  }

  const results: Array<{ sopInstanceUid: string; status: string }> = [];

  for (const buffer of dicomBuffers) {
    try {
      if (!isDicomFile(buffer)) {
        results.push({ sopInstanceUid: 'unknown', status: 'error: not a DICOM file' });
        continue;
      }

      const parseResult = parseDicomFile(buffer);
      const storeResult = await storeDicomFile(parseResult);

      results.push({
        sopInstanceUid: storeResult.sopInstanceUid,
        status: storeResult.isNew ? 'success' : 'already exists',
      });

      // Audit log for each successfully stored instance
      if (storeResult.isNew) {
        const userId = (c as any).get('userId') || 'system';
        log({
          userId,
          action: AuditEvents.DICOM_STOW_RECEIVE,
          resource: 'image',
          resourceId: storeResult.imageId,
          details: {
            sopInstanceUid: storeResult.sopInstanceUid,
            studyId: storeResult.studyId,
            seriesId: storeResult.seriesId,
            source: 'STOW-RS',
          },
          ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
        });
      }
    } catch (err: any) {
      results.push({
        sopInstanceUid: 'unknown',
        status: `error: ${err.message}`,
      });
    }
  }

  const successCount = results.filter(r => r.status === 'success' || r.status === 'already exists').length;

  return c.json({
    '00081190': { vr: 'UR', Value: ['/dicomweb/studies'] },
    '00081198': {
      vr: 'SQ',
      Value: results.map(r => ({
        '00081150': { vr: 'UI', Value: [] },
        '00081155': { vr: 'UI', Value: [r.sopInstanceUid] },
        '00081197': { vr: 'US', Value: [r.status === 'success' ? 0 : 1] },
      })),
    },
  }, successCount > 0 ? 200 : 400);
});

// ─── Helper: Extract DICOM from multipart body ─────────────────────────────

function extractDicomFromMultipart(body: Buffer, contentType: string): Buffer[] {
  try {
    // Use standard multipart parser for robustness
    const boundary = multipart.getBoundary(contentType);
    const parts = multipart.parse(body, boundary);

    // Filter for DICOM content types
    return parts
      .filter(part => {
        const partType = part.type?.toLowerCase() || '';
        return (
          partType.includes('application/dicom') ||
          partType.includes('application/octet-stream') ||
          // Some DICOM devices may use these content types
          partType.includes('application/dicom+json') ||
          // Fallback: if type is missing, check if data starts with DICOM preamble
          (!partType && part.data.length > 132 && part.data.subarray(128, 132).toString() === 'DICM')
        );
      })
      .map(part => Buffer.from(part.data));
  } catch (err) {
    console.error('[STOW-RS] Multipart parsing error:', err);
    // Fallback to simple boundary-based parsing for edge cases
    return extractDicomFromMultipartFallback(body, contentType);
  }
}

/**
 * Fallback multipart parser for edge cases where the standard library fails.
 * Handles some non-standard DICOM implementations.
 */
function extractDicomFromMultipartFallback(body: Buffer, contentType: string): Buffer[] {
  const boundaryMatch = contentType.match(/boundary=([^\s;"']+)/);
  if (!boundaryMatch) return [];

  const boundary = boundaryMatch[1].replace(/^["']|["']$/g, '');
  const boundaryBuf = Buffer.from(`--${boundary}`);

  const results: Buffer[] = [];
  let pos = 0;

  while (pos < body.length) {
    const boundaryPos = body.indexOf(boundaryBuf, pos);
    if (boundaryPos === -1) break;

    const headersEnd = body.indexOf('\r\n\r\n', boundaryPos);
    if (headersEnd === -1) break;

    const headers = body.subarray(boundaryPos + boundaryBuf.length, headersEnd).toString();

    // Check for DICOM content type or missing type (assume DICOM)
    const isDicom =
      headers.includes('application/dicom') ||
      headers.includes('application/octet-stream') ||
      !headers.includes('Content-Type:');

    if (isDicom) {
      const nextBoundary = body.indexOf(boundaryBuf, headersEnd + 4);
      if (nextBoundary !== -1) {
        let dataEnd = nextBoundary;
        // Remove trailing CRLF before boundary
        if (body[dataEnd - 2] === 0x0d && body[dataEnd - 1] === 0x0a) {
          dataEnd -= 2;
        }
        results.push(body.subarray(headersEnd + 4, dataEnd));
      }
    }

    pos = headersEnd + 4;
  }

  return results;
}

export default dicomwebRouter;
