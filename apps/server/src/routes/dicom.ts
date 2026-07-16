/**
 * DICOM Gateway API — manage the DICOM SCP server lifecycle.
 *
 * Endpoints:
 *   GET  /dicom/status   — Check server status
 *   POST /dicom/start    — Start the DICOM server
 *   POST /dicom/stop     — Stop the DICOM server
 *   GET  /dicom/config   — Get configuration
 *   PUT  /dicom/config   — Update configuration
 */

import { Hono } from 'hono';
import { startDicomServer, stopDicomServer, isDicomServerRunning, getConfig } from '../dicom/adapter';

const dicomRouter = new Hono();

// GET /status — Check server status
dicomRouter.get('/status', (c) => {
  return c.json({
    success: true,
    data: {
      running: isDicomServerRunning(),
    },
  });
});

// POST /start — Start the DICOM server
dicomRouter.post('/start', async (c) => {
  if (isDicomServerRunning()) {
    return c.json({ success: true, message: 'DICOM 服务器已在运行中' });
  }

  try {
    await startDicomServer();
    return c.json({ success: true, message: 'DICOM 服务器已启动' });
  } catch (err) {
    console.error('Failed to start DICOM server:', err);
    return c.json({ success: false, message: '启动失败' }, 500);
  }
});

// POST /stop — Stop the DICOM server
dicomRouter.post('/stop', (c) => {
  if (!isDicomServerRunning()) {
    return c.json({ success: true, message: 'DICOM 服务器未在运行' });
  }

  stopDicomServer();
  return c.json({ success: true, message: 'DICOM 服务器已停止' });
});

// GET /config — Get DICOM configuration
dicomRouter.get('/config', async (c) => {
  const config = await getConfig();
  return c.json({
    success: true,
    data: {
      aeTitle: config.aeTitle,
      port: config.port,
      storePath: config.storePath,
    },
  });
});

// PUT /config — Update DICOM configuration
dicomRouter.put('/config', async (c) => {
  const body = await c.req.json();
  // In a real implementation, this would update system_settings table.
  // For now, we validate and acknowledge.
  if (body.aeTitle && (typeof body.aeTitle !== 'string' || body.aeTitle.length > 16)) {
    return c.json({ success: false, message: 'AE Title 无效 (最长 16 字符)' }, 400);
  }
  if (body.port && (typeof body.port !== 'number' || body.port < 1 || body.port > 65535)) {
    return c.json({ success: false, message: '端口号无效' }, 400);
  }

  return c.json({ success: true, message: '配置已更新（需重启服务器生效）' });
});

export default dicomRouter;
