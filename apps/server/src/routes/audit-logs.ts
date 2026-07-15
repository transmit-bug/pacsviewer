import { Hono } from 'hono';
import { db, auditLogs } from '../db';
import { eq, sql } from 'drizzle-orm';

const auditLogsRouter = new Hono();

// Get all audit logs
auditLogsRouter.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page')) || 1;
    const pageSize = Number(c.req.query('pageSize')) || 50;
    const offset = (page - 1) * pageSize;

    const allLogs = await db.query.auditLogs.findMany({
      limit: pageSize,
      offset,
      orderBy: (auditLogs, { desc }) => [desc(auditLogs.createdAt)],
      with: { user: true },
    });

    const count = await db.select({ count: sql<number>`count(*)` }).from(auditLogs);

    return c.json({
      success: true,
      data: {
        items: allLogs,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default auditLogsRouter;
