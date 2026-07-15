import { Context, Next } from 'hono';
import { db, auditLogs } from '../db';
import { v4 as uuid } from 'uuid';

export async function auditMiddleware(c: Context, next: Next) {
  const startTime = Date.now();
  
  // Get user info if available
  const user = c.get('user');
  
  await next();
  
  // Log the action
  const method = c.req.method;
  const path = c.req.path;
  const statusCode = c.res.status;
  const duration = Date.now() - startTime;
  
  // Determine action and resource from path
  let action = method.toLowerCase();
  let resource = path.split('/')[2] || 'unknown'; // e.g., /api/patients -> patients
  
  // Skip logging for certain endpoints
  if (path === '/health' || path.startsWith('/api/auth/refresh')) {
    return;
  }
  
  try {
    await db.insert(auditLogs).values({
      id: uuid(),
      userId: user?.id || 'anonymous',
      action,
      resource,
      details: {
        method,
        path,
        statusCode,
        duration,
      },
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Audit log error:', error);
  }
}
