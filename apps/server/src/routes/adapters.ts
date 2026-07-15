/**
 * Adapter Management API Routes
 */

import { Hono } from 'hono';
import { getRegistry } from '../adapters/registry';
import { DicomAdapter } from '../adapters/dicom';
import { RestAdapter } from '../adapters/rest';
import type { AdapterConfig, AdapterType } from '../adapters/types';
import { NotFoundError, ValidationError, AppError } from '../lib/errors';

const adaptersRouter = new Hono();

// Register default factories
const registry = getRegistry();

registry.registerFactory('dicom', (config) => new DicomAdapter(config.id));
registry.registerFactory('rest', (config) => new RestAdapter(config.id));

// List all adapters
adaptersRouter.get('/', (c) => {
  return c.json({ success: true, data: registry.getAll() });
});

// Get single adapter status
adaptersRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const adapter = registry.getAdapter(id);
  if (!adapter) throw new NotFoundError('适配器');
  return c.json({ success: true, data: adapter.getStatus() });
});

// Add a new adapter
adaptersRouter.post('/', async (c) => {
  const body = await c.req.json();

  if (!body.type || !body.name) {
    throw new ValidationError('缺少必填字段: type, name');
  }

  const validTypes: AdapterType[] = ['dicom', 'rest', 'file', 'custom'];
  if (!validTypes.includes(body.type)) {
    throw new ValidationError(`无效的适配器类型。支持: ${validTypes.join(', ')}`);
  }

  const config: AdapterConfig = {
    id: body.id || crypto.randomUUID(),
    name: body.name,
    type: body.type,
    enabled: body.enabled ?? true,
    dicom: body.dicom,
    rest: body.rest,
    file: body.file,
    custom: body.custom,
  };

  const id = await registry.add(config);
  const adapter = registry.getAdapter(id);

  return c.json({ success: true, data: adapter?.getStatus() }, 201);
});

// Update (hot-reload) an adapter
adaptersRouter.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json();

  const existingConfig = registry.getConfig(id);
  if (!existingConfig) throw new NotFoundError('适配器');

  const newConfig: AdapterConfig = { ...existingConfig, ...body, id };
  await registry.reload(id, newConfig);
  const adapter = registry.getAdapter(id);

  return c.json({ success: true, data: adapter?.getStatus() });
});

// Remove an adapter
adaptersRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  await registry.remove(id);
  return c.json({ success: true, message: '适配器已删除' });
});

// Start an adapter
adaptersRouter.post('/:id/start', async (c) => {
  const id = c.req.param('id');
  await registry.start(id);
  const adapter = registry.getAdapter(id);
  return c.json({ success: true, data: adapter?.getStatus() });
});

// Stop an adapter
adaptersRouter.post('/:id/stop', async (c) => {
  const id = c.req.param('id');
  await registry.stop(id);
  const adapter = registry.getAdapter(id);
  return c.json({ success: true, data: adapter?.getStatus() });
});

// Upload image via REST adapter
adaptersRouter.post('/:id/upload', async (c) => {
  const id = c.req.param('id');
  const adapter = registry.getAdapter(id);

  if (!adapter) throw new NotFoundError('适配器');
  if (!(adapter instanceof RestAdapter)) {
    throw new ValidationError('只有 REST 适配器支持文件上传');
  }
  if (adapter.status !== 'running') {
    throw new AppError('适配器未运行', 400);
  }

  const apiKey = c.req.header('X-API-Key');
  if (!adapter.validateApiKey(apiKey)) {
    throw new AppError('无效的 API Key', 401);
  }

  const contentType = c.req.header('Content-Type') || '';

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const file = formData.get('file') as File | null;
    if (!file) throw new ValidationError('请选择文件');

    const metadata: Record<string, unknown> = {};
    for (const [key, value] of formData.entries()) {
      if (key !== 'file') {
        try { metadata[key] = JSON.parse(value as string); }
        catch { metadata[key] = value; }
      }
    }

    const result = await adapter.processUpload(
      { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mimetype: file.type || 'application/octet-stream' },
      metadata,
    );

    return c.json({ success: true, data: result }, 201);
  }

  // Raw body upload
  const buffer = Buffer.from(await c.req.arrayBuffer());
  const filename = c.req.header('X-Filename') || `upload-${Date.now()}`;

  const result = await adapter.processUpload(
    { buffer, filename, mimetype: contentType || 'application/octet-stream' },
    {},
  );

  return c.json({ success: true, data: result }, 201);
});

// Batch upload
adaptersRouter.post('/:id/upload-batch', async (c) => {
  const id = c.req.param('id');
  const adapter = registry.getAdapter(id);

  if (!adapter || !(adapter instanceof RestAdapter)) {
    throw new ValidationError('只有 REST 适配器支持批量上传');
  }
  if (adapter.status !== 'running') {
    throw new AppError('适配器未运行', 400);
  }

  const apiKey = c.req.header('X-API-Key');
  if (!adapter.validateApiKey(apiKey)) {
    throw new AppError('无效的 API Key', 401);
  }

  const formData = await c.req.formData();
  const files = formData.getAll('file') as File[];
  if (files.length === 0) throw new ValidationError('请选择文件');

  const results = [];
  for (const file of files) {
    const result = await adapter.processUpload(
      { buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, mimetype: file.type || 'application/octet-stream' },
      {},
    );
    results.push(result);
  }

  return c.json({ success: true, data: results, count: results.length }, 201);
});

// Query patients across adapters
adaptersRouter.get('/query/patients', async (c) => {
  const mrn = c.req.query('mrn');
  const name = c.req.query('name');
  const allResults: Array<{ adapterId: string; patients: Awaited<ReturnType<RestAdapter['queryPatient']>> }> = [];

  for (const info of registry.getAll()) {
    if (info.status !== 'running') continue;
    const adapter = registry.getAdapter(info.id);
    if (!adapter) continue;

    try {
      const patients = await adapter.queryPatient({ mrn, name });
      if (patients.length > 0) allResults.push({ adapterId: info.id, patients });
    } catch { /* skip */ }
  }

  return c.json({ success: true, data: allResults });
});

// Query studies across adapters
adaptersRouter.get('/query/studies', async (c) => {
  const patientMrn = c.req.query('patientMrn');
  const modality = c.req.query('modality');
  const allResults: Array<{ adapterId: string; studies: Awaited<ReturnType<RestAdapter['queryStudies']>> }> = [];

  for (const info of registry.getAll()) {
    if (info.status !== 'running') continue;
    const adapter = registry.getAdapter(info.id);
    if (!adapter) continue;

    try {
      const studies = await adapter.queryStudies({ patientMrn, modality });
      if (studies.length > 0) allResults.push({ adapterId: info.id, studies });
    } catch { /* skip */ }
  }

  return c.json({ success: true, data: allResults });
});

export default adaptersRouter;
