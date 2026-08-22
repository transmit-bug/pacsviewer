/**
 * Auth middleware - Thin wrapper around lib/auth module.
 */

import type { Context, Next } from 'hono';
import { authenticate, authorize } from '../lib/auth';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

// 首登强制改密期间仍可访问的路径 (改密自身闭环所需) (#139)
const PASSWORD_CHANGE_ALLOWED = new Set([
  '/api/auth/me',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/change-password',
]);

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '')
    || c.req.query('token');
  if (!token) throw new UnauthorizedError();

  const user = await authenticate(token);
  if (!user) throw new UnauthorizedError('无效的令牌或会话已过期');

  // 首登强制改密: 除改密闭环外的一切 API 都拒绝, 直到密码被更换
  if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(c.req.path)) {
    throw new ForbiddenError('首次登录请先修改初始密码');
  }

  c.set('user', user);
  c.set('userId', user.id);
  await next();
}

export function requireRole(...roles: string[]) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user || !roles.includes(user.role?.name)) {
      throw new ForbiddenError();
    }
    await next();
  };
}

export function requirePermission(resource: string, action: string) {
  return async (c: Context, next: Next) => {
    const user = c.get('user');
    if (!user || !authorize(user, resource, action)) {
      throw new ForbiddenError();
    }
    await next();
  };
}
