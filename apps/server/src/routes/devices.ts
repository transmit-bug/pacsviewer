/**
 * Devices route — physical device management.
 *
 * Endpoints:
 *   GET    /          - List devices
 *   GET    /:id       - Get device by ID
 *   POST   /          - Create device
 *   PUT    /:id       - Update device
 *   DELETE /:id       - Delete device
 */

import { eq } from 'drizzle-orm';
import { db, devices, insertDeviceSchema } from '../db';
import { createCrudRouter } from '../lib/crud';

const devicesRouter = createCrudRouter(devices, {
  name: '设备',
  queryKey: 'devices',
  createSchema: insertDeviceSchema,
  with: { adapter: true },
  defaultSort: { column: 'createdAt', direction: 'desc' },
  routes: (router) => {
    // GET /:id/transfers - Get device's inbound transfers
    router.get('/:id/transfers', async (c) => {
      const id = c.req.param('id');
      const transfers = await db.query.inboundTransfers.findMany({
        where: (t, { eq: eqOp }) => eqOp(t.deviceId, id),
        with: { adapter: true },
        orderBy: (t, { desc }) => [desc(t.createdAt)],
      });
      return c.json({ success: true, data: transfers });
    });

    return router;
  },
});

export default devicesRouter;
