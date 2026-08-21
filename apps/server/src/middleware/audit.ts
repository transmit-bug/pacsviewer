/**
 * Audit middleware - Coarse-grained fallback audit logging (#138).
 *
 * Runs BEFORE authMiddleware so that unauthenticated requests (401s, brute-
 * force attempts) are also recorded — with user_id = NULL (#118), never a
 * fake 'anonymous' id. Fine-grained events (login/logout, image export,
 * report sign, data import, ...) are logged explicitly at call sites via
 * lib/audit + lib/audit-events.
 */

import { Context, Next } from 'hono';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';
import { AppError } from '../lib/errors';

// Paths to skip automatic audit logging
const SKIP_PATHS = new Set([
  '/health',
  '/api/auth/refresh',
  '/api/dashboard',
]);

// Paths that only log on error
const LOG_ON_ERROR_ONLY = new Set([
  '/api/images', // High-frequency image list requests
]);

export async function auditMiddleware(c: Context, next: Next) {
  const startTime = Date.now();

  // Re-throw but still record: auth failures (401) must reach the audit trail
  // with a NULL user_id so unauthenticated access attempts are visible.
  let caught: unknown;
  try {
    await next();
  } catch (err) {
    caught = err;
    throw err;
  } finally {
    record(c, caught, startTime);
  }
}

function record(c: Context, caught: unknown, startTime: number) {
  const user = c.get('user');
  const method = c.req.method;
  const path = c.req.path;
  const duration = Date.now() - startTime;

  // Skip logging for certain endpoints
  if (SKIP_PATHS.has(path) || path.startsWith('/api/auth/refresh')) {
    return;
  }

  const statusCode = caught instanceof AppError
    ? caught.statusCode
    : (c.finalized ? c.res.status : 500);

  // For high-frequency endpoints, only log errors
  if (LOG_ON_ERROR_ONLY.has(path) && statusCode < 400) {
    return;
  }

  // Determine action based on HTTP method (coarse fallback vocabulary)
  const action = mapMethodToAction(method, path);

  // Extract resource type from path
  const resource = extractResourceType(path);

  // Extract resource ID from path if present
  const resourceId = extractResourceId(path);

  // Fire-and-forget audit log; user_id is NULL for unauthenticated requests
  log({
    userId: user?.id ?? null,
    action,
    resource,
    resourceId,
    details: {
      method,
      path,
      statusCode,
      duration,
      query: Object.fromEntries(new URL(c.req.url).searchParams),
    },
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    userAgent: c.req.header('User-Agent'),
  });
}

/**
 * Map HTTP method to coarse audit action. The vocabulary stays coarse here;
 * special paths map into the fine-grained taxonomy in audit-events.ts.
 */
function mapMethodToAction(method: string, path: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return path.includes('/export') ? AuditEvents.DATA_EXPORT : 'view';
    case 'POST':
      return path.includes('/import') ? AuditEvents.DATA_IMPORT : 'create';
    case 'PUT':
    case 'PATCH':
      return 'update';
    case 'DELETE':
      return 'delete';
    default:
      return method.toLowerCase();
  }
}

/**
 * Extract resource type from API path.
 * Examples:
 *   /api/patients/123 -> 'patient'
 *   /api/report-templates -> 'report_template'
 */
function extractResourceType(path: string): string {
  const segments = path.split('/').filter(Boolean);
  // Skip 'api' prefix
  const resourcePath = segments[1] || 'unknown';

  // Convert plural to singular and normalize
  const resourceMap: Record<string, string> = {
    'patients': 'patient',
    'studies': 'study',
    'series': 'series',
    'images': 'image',
    'reports': 'report',
    'report-templates': 'report_template',
    'annotations': 'annotation',
    'layers': 'layer',
    'comparisons': 'comparison',
    'users': 'user',
    'roles': 'role',
    'audit-logs': 'audit_log',
    'settings': 'setting',
    'devices': 'device',
    'adapters': 'adapter',
    'transfers': 'transfer',
    'dicom': 'dicom',
    'dicomweb': 'dicom',
    'dashboard': 'dashboard',
  };

  return resourceMap[resourcePath] || resourcePath;
}

/**
 * Extract resource ID from API path.
 * Examples:
 *   /api/patients/123 -> '123'
 *   /api/patients/123/studies -> '123'
 */
function extractResourceId(path: string): string | undefined {
  const segments = path.split('/').filter(Boolean);
  // Look for ID patterns (UUID or numeric)
  for (let i = 2; i < segments.length; i++) {
    const segment = segments[i];
    // UUID pattern or numeric ID
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment) ||
        /^\d+$/.test(segment)) {
      return segment;
    }
  }
  return undefined;
}
