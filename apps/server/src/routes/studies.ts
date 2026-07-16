import { eq, sql } from 'drizzle-orm';
import { db, studies, series, insertStudySchema } from '../db';
import { createCrudRouter } from '../lib/crud';

const studiesRouter = createCrudRouter(studies, {
  name: '检查',
  queryKey: 'studies',
  createSchema: insertStudySchema,
  with: { patient: true, physician: true, series: true },
  listWhere: (c) => {
    const patientId = c.req.query('patientId');
    return patientId ? eq(studies.patientId, patientId) : undefined;
  },
  routes: (router) => {
    // PUT /:id/status - Update study status
    router.put('/:id/status', async (c) => {
      const id = c.req.param('id');
      const { status } = await c.req.json();

      await db.update(studies)
        .set({ status, updatedAt: new Date().toISOString() } as any)
        .where(eq(studies.id, id));

      return c.json({ success: true, message: '状态已更新' });
    });

    // GET /:id/series - Get study's series
    router.get('/:id/series', async (c) => {
      const id = c.req.param('id');
      const studySeries = await db.query.series.findMany({
        where: eq(series.studyId, id),
        orderBy: (s, { asc }) => [asc(s.seriesNumber)],
      });
      return c.json({ success: true, data: studySeries });
    });
  },
});

export default studiesRouter;
