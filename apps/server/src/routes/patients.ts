import { Hono } from 'hono';
import { eq, or, like, sql } from 'drizzle-orm';
import { db, patients, studies, insertPatientSchema } from '../db';
import { createCrudRouter } from '../lib/crud';

const patientsRouter = createCrudRouter(patients, {
  name: '患者',
  queryKey: 'patients',
  createSchema: insertPatientSchema,
  with: {},
  routes: (router) => {
    // GET /search - Search patients
    router.get('/search', async (c) => {
      const query = c.req.query('q');
      if (!query) return c.json({ success: true, data: [] });

      const results = await db.query.patients.findMany({
        where: or(
          like(patients.name, `%${query}%`),
          like(patients.mrn, `%${query}%`),
          like(patients.phone, `%${query}%`),
        ),
        limit: 50,
      });

      return c.json({ success: true, data: results });
    });

    // GET /:id/studies - Get patient's studies
    router.get('/:id/studies', async (c) => {
      const id = c.req.param('id');
      const patientStudies = await db.query.studies.findMany({
        where: eq(studies.patientId, id),
        orderBy: (s, { desc }) => [desc(s.studyDate)],
      });
      return c.json({ success: true, data: patientStudies });
    });
  },
});

export default patientsRouter;
