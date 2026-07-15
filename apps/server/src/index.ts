import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';

import auth from './routes/auth';
import patientsRouter from './routes/patients';
import studiesRouter from './routes/studies';
import imagesRouter from './routes/images';
import reportsRouter from './routes/reports';
import reportTemplatesRouter from './routes/report-templates';
import usersRouter from './routes/users';
import rolesRouter from './routes/roles';
import auditLogsRouter from './routes/audit-logs';
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';

const app = new Hono();

// Middleware
app.use('*', logger());
app.use('*', cors({
  origin: ['http://localhost:5173'],
  credentials: true,
}));

// Health check (no auth required)
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes (no auth required)
app.route('/api/auth', auth);

// Protected routes
app.use('/api/*', authMiddleware);
app.use('/api/*', auditMiddleware);

// API routes
app.route('/api/patients', patientsRouter);
app.route('/api/studies', studiesRouter);
app.route('/api/images', imagesRouter);
app.route('/api/reports', reportsRouter);
app.route('/api/report-templates', reportTemplatesRouter);
app.route('/api/users', usersRouter);
app.route('/api/roles', rolesRouter);
app.route('/api/audit-logs', auditLogsRouter);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
