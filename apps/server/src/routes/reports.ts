import { eq, desc } from 'drizzle-orm';
import { db, reports, reportVersions, insertReportSchema } from '../db';
import { createCrudRouter } from '../lib/crud';
import { v4 as uuid } from 'uuid';

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
      const { status, reviewNotes } = await c.req.json();

      // Save current version before status change
      const report = await db.query.reports.findFirst({
        where: eq(reports.id, id),
      });

      if (report) {
        const latestVersion = await db.query.reportVersions.findFirst({
          where: eq(reportVersions.reportId, id),
          orderBy: [desc(reportVersions.version)],
        });

        const nextVersion = (latestVersion?.version || 0) + 1;

        await db.insert(reportVersions).values({
          id: uuid(),
          reportId: id,
          version: nextVersion,
          content: report.content,
          images: report.images,
          createdBy: report.createdBy,
          createdAt: new Date().toISOString(),
        });
      }

      const updateData: Record<string, any> = {
        status,
        updatedAt: new Date().toISOString(),
      };

      if (reviewNotes) {
        updateData.reviewNotes = reviewNotes;
      }
      if (status === 'published') {
        updateData.publishedAt = new Date().toISOString();
      }

      await db.update(reports)
        .set(updateData)
        .where(eq(reports.id, id));

      return c.json({ success: true, message: '状态已更新' });
    });

    // GET /:id/versions - List report versions
    router.get('/:id/versions', async (c) => {
      const id = c.req.param('id');

      const versions = await db.query.reportVersions.findMany({
        where: eq(reportVersions.reportId, id),
        orderBy: [desc(reportVersions.version)],
      });

      return c.json({ success: true, data: versions });
    });

    // GET /:id/versions/:version - Get specific version
    router.get('/:id/versions/:version', async (c) => {
      const id = c.req.param('id');
      const version = parseInt(c.req.param('version'), 10);

      const found = await db.query.reportVersions.findFirst({
        where: (rv, { and, eq: eqOp }) => and(
          eqOp(rv.reportId, id),
          eqOp(rv.version, version)
        ),
      });

      if (!found) {
        return c.json({ success: false, message: '版本未找到' }, 404);
      }

      return c.json({ success: true, data: found });
    });
  },
});

export default reportsRouter;
