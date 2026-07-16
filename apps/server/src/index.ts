import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { AppError } from './lib/errors';

import auth from './routes/auth';
import patientsRouter from './routes/patients';
import studiesRouter from './routes/studies';
import imagesRouter from './routes/images';
import reportsRouter from './routes/reports';
import reportTemplatesRouter from './routes/report-templates';
import usersRouter from './routes/users';
import rolesRouter from './routes/roles';
import auditLogsRouter from './routes/audit-logs';
import adaptersRouter from './routes/adapters';
import comparisonsRouter from './routes/comparisons';
import annotationsRouter from './routes/annotations';
import layersRouter from './routes/layers';
import devicesRouter from './routes/devices';
import transfersRouter from './routes/transfers';
import dicomRouter from './routes/dicom';
import { authMiddleware } from './middleware/auth';
import { auditMiddleware } from './middleware/audit';

const app = new Hono();

// Global error handler
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ success: false, message: err.message, code: err.code }, err.statusCode as any);
  }
  console.error('Unhandled error:', err);
  return c.json({ success: false, message: '服务器错误' }, 500);
});

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
app.route('/api/adapters', adaptersRouter);
app.route('/api/comparisons', comparisonsRouter);
app.route('/api/annotations', annotationsRouter);
app.route('/api/layers', layersRouter);
app.route('/api/devices', devicesRouter);
app.route('/api/transfers', transfersRouter);
app.route('/api/dicom', dicomRouter);

export default {
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
};
