import { eq } from 'drizzle-orm';
import { db, users, insertUserSchema } from '../db';
import { createCrudRouter } from '../lib/crud';
import { requirePermission } from '../middleware/auth';
import { log } from '../lib/audit';
import { AuditEvents } from '../lib/audit-events';
import { passwordPolicySchema, validatePasswordPolicy } from '../lib/password-policy';

// 创建用户: password 字段走密码策略校验 (#139);
// 新账号一律持有初始密码 → 首登强制改密
const createUserSchema = insertUserSchema
  .omit({ passwordHash: true })
  .extend({ password: passwordPolicySchema });

const usersRouter = createCrudRouter(users, {
  name: '用户',
  queryKey: 'users',
  createSchema: createUserSchema,
  with: { role: true },
  middleware: [[requirePermission('users', 'create')] as any],
  beforeCreate: async (data) => {
    const passwordHash = await Bun.password.hash(data.password);
    const { password, ...rest } = data;
    return { ...rest, passwordHash, mustChangePassword: true };
  },
  routes: (router) => {
    // PUT /:id/password - Update password (管理员重置)
    router.put('/:id/password', async (c) => {
      const id = c.req.param('id');
      const { password } = await c.req.json();
      const userId = (c as any).get('userId');
      // 管理员下发的密码同样受策略约束, 且首登强制修改 (#139)
      validatePasswordPolicy(password);
      const passwordHash = await Bun.password.hash(password);

      await db.update(users)
        .set({ passwordHash, mustChangePassword: true, updatedAt: new Date().toISOString() } as any)
        .where(eq(users.id, id));

      // Fine-grained explicit audit event (#138)
      log({
        userId: userId ?? null,
        action: AuditEvents.USER_PASSWORD_CHANGE,
        resource: 'user',
        resourceId: id,
        ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
      });

      return c.json({ success: true, message: '密码已更新，用户下次登录须修改密码' });
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
