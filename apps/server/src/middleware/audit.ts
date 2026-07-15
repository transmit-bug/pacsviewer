/**
 * Audit middleware - Uses lib/audit module for non-blocking logging.
 */

import { Context, Next } from 'hono';
import { log } from '../lib/audit';

export async function auditMiddleware(c: Context, next: Next) {
  const startTime = Date.now();

  await next();

  const user = c.get('user');
  const method = c.req.method;
  const path = c.req.path;
  const statusCode = c.res.status;
  const duration = Date.now() - startTime;

  // Skip logging for health and refresh endpoints
  if (path === '/health' || path.startsWith('/api/auth/refresh')) {
    return;
  }

  // Fire-and-forget audit log
  log({
    userId: user?.id ?? 'anonymous',
    action: method.toLowerCase(),
    resource: path.split('/')[2] || 'unknown',
    details: { method, path, statusCode, duration },
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  });
}
