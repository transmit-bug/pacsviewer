/**
 * Adapter Management API Routes
 *
 * Provides endpoints for:
 *  - Listing all adapters
 *  - Adding / updating / removing adapters
 *  - Starting / stopping adapters
 *  - Uploading images via the REST adapter
 *  - Querying patients/studies across adapters
 */

import { Hono } from 'hono';
import { getRegistry } from '../adapters/registry';
import { DicomAdapter } from '../adapters/dicom';
import { RestAdapter } from '../adapters/rest';
import type { AdapterConfig, AdapterType } from '../adapters/types';

const adaptersRouter = new Hono();

// ── Register default factories on first import ─────────────────────────────────
const registry = getRegistry();

registry.registerFactory('dicom', (config) => {
  const adapter = new DicomAdapter(config.id);
  return adapter;
});

registry.registerFactory('rest', (config) => {
  const adapter = new RestAdapter(config.id);
  return adapter;
});

// ── List all adapters ──────────────────────────────────────────────────────────
adaptersRouter.get('/', (c) => {
  const all = registry.getAll();
  return c.json({ success: true, data: all });
});

// ── Get single adapter status ──────────────────────────────────────────────────
adaptersRouter.get('/:id', (c) => {
  const id = c.req.param('id');
  const adapter = registry.getAdapter(id);
  if (!adapter) {
    return c.json({ success: false, message: '适配器未找到' }, 404);
  }
  return c.json({ success: true, data: adapter.getStatus() });
});

// ── Add a new adapter ──────────────────────────────────────────────────────────
adaptersRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();

    // Validate required fields
    if (!body.type || !body.name) {
      return c.json({ success: false, message: '缺少必填字段: type, name' }, 400);
    }

    const validTypes: AdapterType[] = ['dicom', 'rest', 'file', 'custom'];
    if (!validTypes.includes(body.type)) {
      return c.json(
        { success: false, message: `无效的适配器类型。支持: ${validTypes.join(', ')}` },
        400,
      );
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
  } catch (err) {
    const message = err instanceof Error ? err.message : '添加适配器失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Update (hot-reload) an adapter ─────────────────────────────────────────────
adaptersRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    const existingConfig = registry.getConfig(id);
    if (!existingConfig) {
      return c.json({ success: false, message: '适配器未找到' }, 404);
    }

    // Merge existing config with updates
    const newConfig: AdapterConfig = {
      ...existingConfig,
      ...body,
      id, // prevent id change
    };

    await registry.reload(id, newConfig);
    const adapter = registry.getAdapter(id);

    return c.json({ success: true, data: adapter?.getStatus() });
  } catch (err) {
    const message = err instanceof Error ? err.message : '更新适配器失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Remove an adapter ──────────────────────────────────────────────────────────
adaptersRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await registry.remove(id);
    return c.json({ success: true, message: '适配器已删除' });
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除适配器失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Start an adapter ───────────────────────────────────────────────────────────
adaptersRouter.post('/:id/start', async (c) => {
  try {
    const id = c.req.param('id');
    await registry.start(id);
    const adapter = registry.getAdapter(id);
    return c.json({ success: true, data: adapter?.getStatus() });
  } catch (err) {
    const message = err instanceof Error ? err.message : '启动适配器失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Stop an adapter ────────────────────────────────────────────────────────────
adaptersRouter.post('/:id/stop', async (c) => {
  try {
    const id = c.req.param('id');
    await registry.stop(id);
    const adapter = registry.getAdapter(id);
    return c.json({ success: true, data: adapter?.getStatus() });
  } catch (err) {
    const message = err instanceof Error ? err.message : '停止适配器失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Upload image via REST adapter ──────────────────────────────────────────────
adaptersRouter.post('/:id/upload', async (c) => {
  try {
    const id = c.req.param('id');
    const adapter = registry.getAdapter(id);

    if (!adapter) {
      return c.json({ success: false, message: '适配器未找到' }, 404);
    }

    if (!(adapter instanceof RestAdapter)) {
      return c.json({ success: false, message: '只有 REST 适配器支持文件上传' }, 400);
    }

    if (adapter.status !== 'running') {
      return c.json({ success: false, message: '适配器未运行' }, 400);
    }

    // Validate API key
    const apiKey = c.req.header('X-API-Key');
    if (!adapter.validateApiKey(apiKey)) {
      return c.json({ success: false, message: '无效的 API Key' }, 401);
    }

    const contentType = c.req.header('Content-Type') || '';

    if (contentType.includes('multipart/form-data')) {
      const formData = await c.req.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return c.json({ success: false, message: '请选择文件' }, 400);
      }

      // Extract optional metadata from form fields
      const metadata: Record<string, unknown> = {};
      for (const [key, value] of formData.entries()) {
        if (key !== 'file') {
          try {
            metadata[key] = JSON.parse(value as string);
          } catch {
            metadata[key] = value;
          }
        }
      }

      const result = await adapter.processUpload(
        {
          buffer: Buffer.from(await file.arrayBuffer()),
          filename: file.name,
          mimetype: file.type || 'application/octet-stream',
        },
        metadata,
      );

      return c.json({ success: true, data: result }, 201);
    }

    // Raw body upload
    const buffer = Buffer.from(await c.req.arrayBuffer());
    const filename = c.req.header('X-Filename') || `upload-${Date.now()}`;

    const result = await adapter.processUpload(
      {
        buffer,
        filename,
        mimetype: contentType || 'application/octet-stream',
      },
      {},
    );

    return c.json({ success: true, data: result }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '上传失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Batch upload ───────────────────────────────────────────────────────────────
adaptersRouter.post('/:id/upload-batch', async (c) => {
  try {
    const id = c.req.param('id');
    const adapter = registry.getAdapter(id);

    if (!adapter || !(adapter instanceof RestAdapter)) {
      return c.json({ success: false, message: '只有 REST 适配器支持批量上传' }, 400);
    }

    if (adapter.status !== 'running') {
      return c.json({ success: false, message: '适配器未运行' }, 400);
    }

    const apiKey = c.req.header('X-API-Key');
    if (!adapter.validateApiKey(apiKey)) {
      return c.json({ success: false, message: '无效的 API Key' }, 401);
    }

    const formData = await c.req.formData();
    const files = formData.getAll('file') as File[];

    if (files.length === 0) {
      return c.json({ success: false, message: '请选择文件' }, 400);
    }

    const results = [];
    for (const file of files) {
      const result = await adapter.processUpload(
        {
          buffer: Buffer.from(await file.arrayBuffer()),
          filename: file.name,
          mimetype: file.type || 'application/octet-stream',
        },
        {},
      );
      results.push(result);
    }

    return c.json({ success: true, data: results, count: results.length }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : '批量上传失败';
    return c.json({ success: false, message }, 500);
  }
});

// ── Query patients across adapters ─────────────────────────────────────────────
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
      if (patients.length > 0) {
        allResults.push({ adapterId: info.id, patients });
      }
    } catch {
      // skip adapters that fail to query
    }
  }

  return c.json({ success: true, data: allResults });
});

// ── Query studies across adapters ──────────────────────────────────────────────
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
      if (studies.length > 0) {
        allResults.push({ adapterId: info.id, studies });
      }
    } catch {
      // skip
    }
  }

  return c.json({ success: true, data: allResults });
});

export default adaptersRouter;
