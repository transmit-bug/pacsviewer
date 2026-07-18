/**
 * Audit middleware - Uses lib/audit module for non-blocking logging.
 * 
 * Automatically logs all API requests with context information.
 * For fine-grained audit events, use log() directly in route handlers.
 */

import { Context, Next } from 'hono';
import { log } from '../lib/audit';

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

  await next();

  const user = c.get('user');
  const method = c.req.method;
  const path = c.req.path;
  const statusCode = c.res.status;
  const duration = Date.now() - startTime;

  // Skip logging for certain endpoints
  if (SKIP_PATHS.has(path) || path.startsWith('/api/auth/refresh')) {
    return;
  }

  // For high-frequency endpoints, only log errors
  if (LOG_ON_ERROR_ONLY.has(path) && statusCode < 400) {
    return;
  }

  // Determine action based on HTTP method
  const action = mapMethodToAction(method, path);

  // Extract resource type from path
  const resource = extractResourceType(path);

  // Extract resource ID from path if present
  const resourceId = extractResourceId(path);

  // Fire-and-forget audit log
  log({
    userId: user?.id ?? 'anonymous',
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
 * Map HTTP method to audit action.
 */
function mapMethodToAction(method: string, path: string): string {
  switch (method.toUpperCase()) {
    case 'GET':
      return path.includes('/export') ? 'export' : 'read';
    case 'POST':
      return 'create';
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
