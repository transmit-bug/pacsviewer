import { Hono } from 'hono';
import { eq, or, like, sql } from 'drizzle-orm';
import { db, patients, studies, insertPatientSchema } from '../db';
import { createCrudRouter } from '../lib/crud';
import { requirePermission } from '../middleware/auth';

const patientsRouter = createCrudRouter(patients, {
  name: '患者',
  queryKey: 'patients',
  createSchema: insertPatientSchema,
  with: {},
  middleware: [[requirePermission('patients', 'create')] as any],
  routes: (router) => {
    // GET /search - Search patients
    router.get('/search', async (c) => {
      const query = c.req.query('q');
      const limitParam = c.req.query('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 20;
      
      if (!query) return c.json({ success: true, data: [] });

      const results = await db.query.patients.findMany({
        where: or(
          like(patients.name, `%${query}%`),
          like(patients.mrn, `%${query}%`),
          like(patients.phone, `%${query}%`),
        ),
        limit: Math.min(limit, 50), // 最多返回 50 条
        orderBy: (p, { desc }) => [desc(p.updatedAt)],
      });

      return c.json({ success: true, data: results });
    });

    // GET /recent - Get recent patients (with last study info)
    router.get('/recent', async (c) => {
      const limitParam = c.req.query('limit');
      const limit = limitParam ? parseInt(limitParam, 10) : 10;

      // 获取最近有就诊记录的患者
      const recentStudies = await db.query.studies.findMany({
        columns: {
          patientId: true,
          studyDate: true,
          modality: true,
        },
        orderBy: (s, { desc }) => [desc(s.studyDate)],
        limit: limit * 2, // 多获取一些以去重
      });

      // 去重并获取患者信息
      const patientIds = [...new Set(recentStudies.map(s => s.patientId))].slice(0, limit);
      
      if (patientIds.length === 0) {
        return c.json({ success: true, data: [] });
      }

      const recentPatients = await db.query.patients.findMany({
        where: (p, { inArray }) => inArray(p.id, patientIds),
      });

      // 组合患者信息和最近就诊信息
      const result = recentPatients.map(patient => {
        const lastStudy = recentStudies.find(s => s.patientId === patient.id);
        return {
          ...patient,
          lastStudy: lastStudy ? {
            studyDate: lastStudy.studyDate,
            modality: lastStudy.modality,
          } : undefined,
        };
      });

      // 按最近就诊日期排序
      result.sort((a, b) => {
        const dateA = a.lastStudy?.studyDate || a.updatedAt;
        const dateB = b.lastStudy?.studyDate || b.updatedAt;
        return dateB.localeCompare(dateA);
      });

      return c.json({ success: true, data: result });
    });

    // GET /:id/studies - Get patient's studies (with series for modality)
    router.get('/:id/studies', async (c) => {
      const id = c.req.param('id');
      const patientStudies = await db.query.studies.findMany({
        where: eq(studies.patientId, id),
        with: { series: true },
        orderBy: (s, { desc }) => [desc(s.studyDate)],
      });
      return c.json({ success: true, data: patientStudies });
    });
  },
});

export default patientsRouter;
