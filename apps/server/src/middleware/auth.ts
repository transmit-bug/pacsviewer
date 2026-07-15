/**
 * Auth middleware - Thin wrapper around lib/auth module.
 */

import { Context, Next } from 'hono';
import { authenticate, authorize } from '../lib/auth';
import { UnauthorizedError, ForbiddenError } from '../lib/errors';

export async function authMiddleware(c: Context, next: Next) {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) throw new UnauthorizedError();

  const user = await authenticate(token);
  if (!user) throw new UnauthorizedError('无效的令牌或会话已过期');

  c.set('user', user);
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
