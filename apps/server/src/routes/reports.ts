import { eq } from 'drizzle-orm';
import { db, reports, insertReportSchema } from '../db';
import { createCrudRouter } from '../lib/crud';

const reportsRouter = createCrudRouter(reports, {
  name: '报告',
  queryKey: 'reports',
  createSchema: insertReportSchema,
  listWhere: (c) => {
    const studyId = c.req.query('studyId');
    return studyId ? eq(reports.studyId, studyId) : undefined;
  },
  routes: (router) => {
    // PUT /:id/status - Update report status
    router.put('/:id/status', async (c) => {
      const id = c.req.param('id');
      const { status } = await c.req.json();

      await db.update(reports)
        .set({ status, updatedAt: new Date().toISOString() } as any)
        .where(eq(reports.id, id));

      return c.json({ success: true, message: '状态已更新' });
    });
  },
});

export default reportsRouter;
