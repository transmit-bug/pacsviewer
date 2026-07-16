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
      const userId = (c as any).get('userId');

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
          status: report.status,
          content: report.content,
          images: report.images,
          changeNotes: reviewNotes || null,
          createdBy: userId || report.createdBy,
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

    // GET /:id/versions/diff - Compare two versions (MUST be before :version route)
    router.get('/:id/versions/diff', async (c) => {
      const id = c.req.param('id');
      const v1 = parseInt(c.req.query('v1') || '0', 10);
      const v2 = parseInt(c.req.query('v2') || '0', 10);

      if (!v1 || !v2) {
        return c.json({ success: false, message: '请指定 v1 和 v2' }, 400);
      }

      const findVersion = async (version: number) => {
        return db.query.reportVersions.findFirst({
          where: (rv, { and, eq: eqOp }) => and(
            eqOp(rv.reportId, id),
            eqOp(rv.version, version)
          ),
          with: { creator: true },
        });
      };

      const [version1, version2] = await Promise.all([
        findVersion(v1),
        findVersion(v2),
      ]);

      if (!version1 || !version2) {
        return c.json({ success: false, message: '版本未找到' }, 404);
      }

      // Compute field-level diff
      const content1 = (version1.content || {}) as Record<string, any>;
      const content2 = (version2.content || {}) as Record<string, any>;
      const allKeys = new Set([...Object.keys(content1), ...Object.keys(content2)]);
      
      const diff: Record<string, { old: any; new: any; changed: boolean }> = {};
      for (const key of allKeys) {
        const oldVal = JSON.stringify(content1[key] ?? null);
        const newVal = JSON.stringify(content2[key] ?? null);
        diff[key] = { old: content1[key] ?? null, new: content2[key] ?? null, changed: oldVal !== newVal };
      }

      return c.json({
        success: true,
        data: {
          from: { version: v1, status: version1.status, createdAt: version1.createdAt, creator: version1.creator },
          to: { version: v2, status: version2.status, createdAt: version2.createdAt, creator: version2.creator },
          diff,
        },
      });
    });

    // GET /:id/versions/:version - Get specific version (MUST be after diff route)
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
