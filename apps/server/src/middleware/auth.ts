import { Context, Next } from 'hono';
import { db, sessions, users } from '../db';
import { eq } from 'drizzle-orm';

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');

  if (!token) {
    return c.json({ success: false, message: '未授权' }, 401);
  }

  try {
    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
      with: {
        user: {
          with: { role: true },
        },
      },
    });

    if (!session) {
      return c.json({ success: false, message: '无效的令牌' }, 401);
    }

    if (new Date(session.expiresAt) < new Date()) {
      return c.json({ success: false, message: '会话已过期' }, 401);
    }

    // Attach user to context
    c.set('user', session.user);
    c.set('session', session);

    await next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
}

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role?.name)) {
      return c.json({ success: false, message: '权限不足' }, 403);
    }
    await next();
  };
}

export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user?.role?.permissions) {
      return c.json({ success: false, message: '权限不足' }, 403);
    }

    const permissions = JSON.parse(user.role.permissions as string);
    if (!permissions[resource]?.[action]) {
      return c.json({ success: false, message: '权限不足' }, 403);
    }

    await next();
  };
}
