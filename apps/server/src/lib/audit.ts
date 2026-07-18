/**
 * Audit Module - Non-blocking audit logging.
 *
 * Interface:
 *   log(entry) → void (fire-and-forget)
 *   query(filters) → PaginatedResult
 */

import { eq, sql, desc } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, auditLogs } from '../db';

export interface AuditEntry {
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditQueryOptions {
  userId?: string;
  action?: string;
  resource?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  pageSize?: number;
}

/**
 * Log an audit entry (fire-and-forget).
 * Does not await the database write to avoid blocking the request.
 */
export function log(entry: AuditEntry): void {
  const record = {
    id: uuid(),
    userId: entry.userId,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId ?? null,
    details: entry.details ?? null,
    ipAddress: entry.ipAddress ?? null,
    createdAt: new Date().toISOString(),
  };

  // Fire-and-forget: don't await, don't block the request
  db.insert(auditLogs).values(record).catch((err) => {
    console.error('[Audit] Failed to write audit log:', err);
  });
}

/**
 * Convenience functions for common audit events.
 */
export const audit = {
  /** Log a read/view action */
  view(userId: string, resource: string, resourceId: string, details?: Record<string, unknown>) {
    log({ userId, action: 'view', resource, resourceId, details });
  },

  /** Log a create action */
  create(userId: string, resource: string, resourceId: string, details?: Record<string, unknown>) {
    log({ userId, action: 'create', resource, resourceId, details });
  },

  /** Log an update action */
  update(userId: string, resource: string, resourceId: string, details?: Record<string, unknown>) {
    log({ userId, action: 'update', resource, resourceId, details });
  },

  /** Log a delete action */
  delete(userId: string, resource: string, resourceId: string, details?: Record<string, unknown>) {
    log({ userId, action: 'delete', resource, resourceId, details });
  },

  /** Log an export/download action */
  export(userId: string, resource: string, resourceId: string, details?: Record<string, unknown>) {
    log({ userId, action: 'export', resource, resourceId, details });
  },
};

/**
 * Query audit logs with filtering and pagination.
 */
export async function query(options: AuditQueryOptions = {}) {
  const {
    userId,
    action,
    resource,
    startDate,
    endDate,
    page = 1,
    pageSize = 50,
  } = options;

  const offset = (page - 1) * pageSize;

  // Build where conditions
  const conditions: any[] = [];
  if (userId) conditions.push(eq(auditLogs.userId, userId));
  if (action) conditions.push(eq(auditLogs.action, action));
  if (resource) conditions.push(eq(auditLogs.resource, resource));

  const where = conditions.length > 0
    ? sql`${conditions.reduce((acc, cond) => sql`${acc} AND ${cond}`)}`
    : undefined;

  const items = await db.query.auditLogs.findMany({
    where,
    limit: pageSize,
    offset,
    orderBy: [desc(auditLogs.createdAt)],
    with: { user: true },
  });

  const count = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(where ?? undefined);

  return {
    items,
    total: count[0].count,
    page,
    pageSize,
    totalPages: Math.ceil(count[0].count / pageSize),
  };
}
