/**
 * Inbound Transfers route — transfer tracking and management.
 *
 * Endpoints:
 *   GET    /              - List transfers (with pagination, filters)
 *   GET    /:id           - Get transfer by ID
 *   PUT    /:id/status    - Update transfer status
 *   POST   /:id/retry     - Retry a failed transfer
 */

import { Hono } from 'hono';
import { eq, desc } from 'drizzle-orm';
import { db, inboundTransfers } from '../db';

const transfersRouter = new Hono();

// GET / — List transfers with pagination and filtering
transfersRouter.get('/', async (c) => {
  const page = Math.max(1, Number(c.req.query('page')) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));
  const offset = (page - 1) * pageSize;
  const status = c.req.query('status');
  const deviceId = c.req.query('deviceId');

  // Build where clause
  const conditions: any[] = [];
  if (status) {
    conditions.push(eq(inboundTransfers.status, status as any));
  }
  if (deviceId) {
    conditions.push(eq(inboundTransfers.deviceId, deviceId));
  }

  const where = conditions.length > 0
    ? (t: any, { and: andFn, eq: eqFn }: any) => {
        if (conditions.length === 1) return conditions[0];
        return andFn(...conditions);
      }
    : undefined;

  const [items, total] = await Promise.all([
    db.query.inboundTransfers.findMany({
      where: where as any,
      with: { device: true, adapter: true },
      orderBy: [desc(inboundTransfers.createdAt)],
      limit: pageSize,
      offset,
    }),
    // Count total
    (async () => {
      const all = await db.query.inboundTransfers.findMany({ where: where as any });
      return all.length;
    })(),
  ]);

  return c.json({
    success: true,
    data: {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    },
  });
});

// GET /:id — Get transfer by ID
transfersRouter.get('/:id', async (c) => {
  const id = c.req.param('id');
  const transfer = await db.query.inboundTransfers.findFirst({
    where: eq(inboundTransfers.id, id),
    with: { device: true, adapter: true },
  });

  if (!transfer) {
    return c.json({ success: false, message: '传输记录未找到' }, 404);
  }

  return c.json({ success: true, data: transfer });
});

// PUT /:id/status — Update transfer status
transfersRouter.put('/:id/status', async (c) => {
  const id = c.req.param('id');
  const { status, processedCount, errorCount } = await c.req.json();

  const existing = await db.query.inboundTransfers.findFirst({
    where: eq(inboundTransfers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '传输记录未找到' }, 404);
  }

  const updates: Record<string, any> = {};
  if (status) updates.status = status;
  if (processedCount !== undefined) updates.processedCount = processedCount;
  if (errorCount !== undefined) updates.errorCount = errorCount;
  if (status === 'completed') updates.completedAt = new Date().toISOString();

  await db.update(inboundTransfers)
    .set(updates)
    .where(eq(inboundTransfers.id, id));

  const updated = await db.query.inboundTransfers.findFirst({
    where: eq(inboundTransfers.id, id),
    with: { device: true, adapter: true },
  });

  return c.json({ success: true, data: updated });
});

// POST /:id/retry — Retry a failed transfer
transfersRouter.post('/:id/retry', async (c) => {
  const id = c.req.param('id');

  const existing = await db.query.inboundTransfers.findFirst({
    where: eq(inboundTransfers.id, id),
  });

  if (!existing) {
    return c.json({ success: false, message: '传输记录未找到' }, 404);
  }

  if (existing.status !== 'failed') {
    return c.json({ success: false, message: '只能重试失败的传输' }, 400);
  }

  // Reset to pending for reprocessing
  await db.update(inboundTransfers)
    .set({
      status: 'pending',
      processedCount: 0,
      errorCount: 0,
      completedAt: null,
    })
    .where(eq(inboundTransfers.id, id));

  const updated = await db.query.inboundTransfers.findFirst({
    where: eq(inboundTransfers.id, id),
    with: { device: true, adapter: true },
  });

  return c.json({ success: true, data: updated, message: '传输已重新排队' });
});

export default transfersRouter;
