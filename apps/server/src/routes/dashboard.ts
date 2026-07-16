import { Hono } from 'hono';
import { db } from '../db';
import { patients, studies, reports, images } from '../db/schema';
import { count, desc, eq, gte, and } from 'drizzle-orm';

const dashboard = new Hono();

// Get dashboard statistics
dashboard.get('/stats', async (c) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString();

    // Total patients
    const [patientCount] = await db
      .select({ count: count() })
      .from(patients);

    // Total studies
    const [studyCount] = await db
      .select({ count: count() })
      .from(studies);

    // Today's studies
    const [todayStudyCount] = await db
      .select({ count: count() })
      .from(studies)
      .where(gte(studies.createdAt, todayStr));

    // Pending reports (draft or pending_review)
    const [pendingReportCount] = await db
      .select({ count: count() })
      .from(reports)
      .where(
        and(
          eq(reports.status, 'draft'),
          eq(reports.status, 'pending_review')
        )
      );

    // Total images
    const [imageCount] = await db
      .select({ count: count() })
      .from(images);

    return c.json({
      todayStudies: todayStudyCount?.count || 0,
      totalPatients: patientCount?.count || 0,
      pendingReports: pendingReportCount?.count || 0,
      totalImages: imageCount?.count || 0,
    });
  } catch (error) {
    console.error('Failed to get dashboard stats:', error);
    return c.json({ error: 'Failed to get dashboard stats' }, 500);
  }
});

// Get recent studies
dashboard.get('/recent-studies', async (c) => {
  try {
    const limit = Number(c.req.query('limit')) || 5;

    const recentStudies = await db
      .select({
        id: studies.id,
        patientId: studies.patientId,
        studyDate: studies.studyDate,
        modality: studies.modality,
        status: studies.status,
        description: studies.description,
        createdAt: studies.createdAt,
      })
      .from(studies)
      .orderBy(desc(studies.createdAt))
      .limit(limit);

    return c.json(recentStudies);
  } catch (error) {
    console.error('Failed to get recent studies:', error);
    return c.json({ error: 'Failed to get recent studies' }, 500);
  }
});

// Get pending tasks
dashboard.get('/pending-tasks', async (c) => {
  try {
    const limit = Number(c.req.query('limit')) || 5;

    // Get reports that need review
    const pendingReports = await db
      .select({
        id: reports.id,
        title: reports.title,
        status: reports.status,
        createdAt: reports.createdAt,
      })
      .from(reports)
      .where(eq(reports.status, 'pending_review'))
      .orderBy(desc(reports.createdAt))
      .limit(limit);

    return c.json({
      reports: pendingReports,
    });
  } catch (error) {
    console.error('Failed to get pending tasks:', error);
    return c.json({ error: 'Failed to get pending tasks' }, 500);
  }
});

export default dashboard;
