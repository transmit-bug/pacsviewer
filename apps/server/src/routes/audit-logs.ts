/**
 * Audit Logs route — system audit log query with filtering.
 *
 * Endpoints:
 *   GET /          - List logs with pagination and filtering
 *   GET /export    - Export logs as CSV
 */

import { Hono } from 'hono';
import { eq, and, desc, sql } from 'drizzle-orm';
import { db, auditLogs } from '../db';

const auditLogsRouter = new Hono();

// GET / — List logs with pagination and filtering
auditLogsRouter.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  // Filter parameters
  const action = c.req.query('action');
  const resource = c.req.query('resource');

  // Build where conditions
  const conditions = [];
  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }
  if (resource) {
    conditions.push(eq(auditLogs.resource, resource));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Query with filters
  const items = await db.query.auditLogs.findMany({
    where,
    with: { user: true },
    orderBy: [desc(auditLogs.createdAt)],
    limit: pageSize,
    offset,
  });

  // Count total
  const countResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(where ?? undefined);

  return c.json({
    success: true,
    data: {
      items,
      total: countResult[0].count,
      page,
      pageSize,
      totalPages: Math.ceil(countResult[0].count / pageSize),
    },
  });
});

// GET /export — Export logs as CSV
auditLogsRouter.get('/export', async (c) => {
  const action = c.req.query('action');
  const resource = c.req.query('resource');

  const conditions = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (resource) conditions.push(eq(auditLogs.resource, resource));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.auditLogs.findMany({
    where,
    with: { user: true },
    orderBy: [desc(auditLogs.createdAt)],
  });

  const csv = [
    '时间,用户,操作,资源,资源ID,IP地址',
    ...items.map((l: any) =>
      [
        l.createdAt,
        l.user?.displayName || l.userId,
        l.action,
        l.resource,
        l.resourceId || '',
        l.ipAddress || '',
      ].join(',')
    ),
  ].join('\n');

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

export default auditLogsRouter;
