/**
 * Audit Logs route — system audit log query with filtering.
 *
 * Endpoints:
 *   GET /          - List logs with pagination and filtering
 *   GET /export    - Export logs as CSV
 *   GET /stats     - Get audit log statistics
 */

import { Hono } from 'hono';
import { eq, and, desc, sql, gte, lte, like } from 'drizzle-orm';
import { db, auditLogs } from '../db';
import { AuditEventLabels } from '../lib/audit-events';

const auditLogsRouter = new Hono();

// GET / — List logs with pagination and filtering
auditLogsRouter.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 50));
  const offset = (page - 1) * pageSize;

  // Filter parameters
  const action = c.req.query('action');
  const resource = c.req.query('resource');
  const userId = c.req.query('userId');
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');
  const resourceId = c.req.query('resourceId');
  const keyword = c.req.query('keyword');

  // Build where conditions
  const conditions = [];
  if (action) {
    conditions.push(eq(auditLogs.action, action));
  }
  if (resource) {
    conditions.push(eq(auditLogs.resource, resource));
  }
  if (userId) {
    conditions.push(eq(auditLogs.userId, userId));
  }
  if (resourceId) {
    conditions.push(eq(auditLogs.resourceId, resourceId));
  }
  if (startDate) {
    conditions.push(gte(auditLogs.createdAt, startDate));
  }
  if (endDate) {
    conditions.push(lte(auditLogs.createdAt, endDate));
  }
  if (keyword) {
    // Search in details JSON (SQLite json_extract or LIKE on stringified)
    conditions.push(
      sql`json_extract(${auditLogs.details}, '$') LIKE ${`%${keyword}%`}`
    );
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

  // Enhance items with human-readable action labels
  const enhancedItems = items.map(item => ({
    ...item,
    actionLabel: AuditEventLabels[item.action] || item.action,
  }));

  return c.json({
    success: true,
    data: {
      items: enhancedItems,
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
  const startDate = c.req.query('startDate');
  const endDate = c.req.query('endDate');

  const conditions = [];
  if (action) conditions.push(eq(auditLogs.action, action));
  if (resource) conditions.push(eq(auditLogs.resource, resource));
  if (startDate) conditions.push(gte(auditLogs.createdAt, startDate));
  if (endDate) conditions.push(lte(auditLogs.createdAt, endDate));
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const items = await db.query.auditLogs.findMany({
    where,
    with: { user: true },
    orderBy: [desc(auditLogs.createdAt)],
  });

  const csv = [
    '时间,用户,操作,操作标签,资源,资源ID,IP地址,详情',
    ...items.map((l: any) =>
      [
        l.createdAt,
        l.user?.displayName || l.userId,
        l.action,
        AuditEventLabels[l.action] || l.action,
        l.resource,
        l.resourceId || '',
        l.ipAddress || '',
        l.details ? JSON.stringify(l.details).replace(/,/g, ';') : '',
      ].join(',')
    ),
  ].join('\n');

  return new Response('\uFEFF' + csv, { // Add BOM for Excel UTF-8 support
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="audit-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
});

// GET /stats — Get audit log statistics
auditLogsRouter.get('/stats', async (c) => {
  const startDate = c.req.query('startDate') || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const endDate = c.req.query('endDate') || new Date().toISOString();

  // Total count
  const totalResult = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, startDate),
      lte(auditLogs.createdAt, endDate)
    ));

  // Action breakdown
  const actionBreakdown = await db
    .select({
      action: auditLogs.action,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, startDate),
      lte(auditLogs.createdAt, endDate)
    ))
    .groupBy(auditLogs.action)
    .orderBy(desc(sql`count(*)`));

  // Resource breakdown
  const resourceBreakdown = await db
    .select({
      resource: auditLogs.resource,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, startDate),
      lte(auditLogs.createdAt, endDate)
    ))
    .groupBy(auditLogs.resource)
    .orderBy(desc(sql`count(*)`));

  // Daily activity (last 7 days)
  const dailyActivity = await db
    .select({
      date: sql<string>`date(${auditLogs.createdAt})`,
      count: sql<number>`count(*)`,
    })
    .from(auditLogs)
    .where(and(
      gte(auditLogs.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      lte(auditLogs.createdAt, endDate)
    ))
    .groupBy(sql`date(${auditLogs.createdAt})`)
    .orderBy(sql`date(${auditLogs.createdAt})`);

  return c.json({
    success: true,
    data: {
      total: totalResult[0].count,
      actionBreakdown: actionBreakdown.map(item => ({
        ...item,
        label: AuditEventLabels[item.action] || item.action,
      })),
      resourceBreakdown,
      dailyActivity,
      dateRange: { startDate, endDate },
    },
  });
});

export default auditLogsRouter;
