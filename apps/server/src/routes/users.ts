import { eq } from 'drizzle-orm';
import { db, users, insertUserSchema } from '../db';
import { createCrudRouter } from '../lib/crud';
import { requirePermission } from '../middleware/auth';

const usersRouter = createCrudRouter(users, {
  name: '用户',
  queryKey: 'users',
  createSchema: insertUserSchema,
  with: { role: true },
  middleware: [[requirePermission('users', 'create')] as any],
  beforeCreate: async (data) => {
    const passwordHash = await Bun.password.hash(data.password);
    const { password, ...rest } = data;
    return { ...rest, passwordHash };
  },
  routes: (router) => {
    // PUT /:id/password - Update password
    router.put('/:id/password', async (c) => {
      const id = c.req.param('id');
      const { password } = await c.req.json();
      const passwordHash = await Bun.password.hash(password);

      await db.update(users)
        .set({ passwordHash, updatedAt: new Date().toISOString() } as any)
        .where(eq(users.id, id));

      return c.json({ success: true, message: '密码已更新' });
    });

    // PUT /:id/status - Update status
    router.put('/:id/status', async (c) => {
      const id = c.req.param('id');
      const { status } = await c.req.json();

      await db.update(users)
        .set({ status, updatedAt: new Date().toISOString() } as any)
        .where(eq(users.id, id));

      return c.json({ success: true, message: '状态已更新' });
    });
  },
});

export default usersRouter;
