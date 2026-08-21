/**
 * Auth Module - Deep module consolidating authentication logic.
 *
 * Interface:
 *   authenticate(token) → User | null
 *   login(username, password, ctx) → Session
 *   logout(token) → void
 *   refresh(refreshToken) → Tokens
 *   authorize(user, resource, action) → boolean
 */

import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { db, users, sessions } from '../db';
import { UnauthorizedError, ForbiddenError } from './errors';
import { log } from './audit';
import { AuditEvents } from './audit-events';

/** Authenticated user with role */
export interface AuthUser {
  id: string;
  username: string;
  email: string;
  displayName: string;
  avatar?: string;
  role: {
    id: string;
    name: string;
    permissions: string;
  } | null;
}

/** Session data */
export interface SessionData {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
}

/** Login result */
export interface LoginResult {
  user: AuthUser;
  token: string;
  refreshToken: string;
}

/**
 * Authenticate a request by token.
 * Returns the user if valid, null otherwise.
 */
export async function authenticate(token: string): Promise<AuthUser | null> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
    with: { user: { with: { role: true } } },
  });

  if (!session) return null;
  if (new Date(session.expiresAt) < new Date()) return null;

  return session.user as AuthUser;
}

/** Record a failed login attempt (#138): userId is null when unknown. */
function logLoginFailure(
  userId: string | null,
  username: string,
  meta?: { userAgent?: string; ipAddress?: string },
  reason?: string,
): void {
  log({
    userId,
    action: AuditEvents.USER_LOGIN,
    resource: 'auth',
    details: { success: false, username, reason },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });
}

/**
 * Login with username and password.
 * Throws UnauthorizedError on failure.
 */
export async function login(
  username: string,
  password: string,
  meta?: { userAgent?: string; ipAddress?: string },
): Promise<LoginResult> {
  const user = await db.query.users.findFirst({
    where: eq(users.username, username),
    with: { role: true },
  });

  if (!user) {
    // 用户名不存在: 无从关联用户，记 NULL user_id (#118)
    logLoginFailure(null, username, meta, 'user_not_found');
    throw new UnauthorizedError('用户名或密码错误');
  }

  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) {
    logLoginFailure(user.id, username, meta, 'wrong_password');
    throw new UnauthorizedError('用户名或密码错误');
  }

  if (user.status !== 'active') {
    logLoginFailure(user.id, username, meta, `status_${user.status}`);
    throw new ForbiddenError('账号已被禁用');
  }

  const token = uuid();
  const refreshToken = uuid();

  await db.insert(sessions).values({
    id: uuid(),
    userId: user.id,
    token,
    refreshToken,
    deviceInfo: meta?.userAgent ? { userAgent: meta.userAgent } : null,
    ipAddress: meta?.ipAddress ?? null,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  });

  await db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  // Fine-grained explicit audit event (#138)
  log({
    userId: user.id,
    action: AuditEvents.USER_LOGIN,
    resource: 'auth',
    details: { success: true },
    ipAddress: meta?.ipAddress,
    userAgent: meta?.userAgent,
  });

  return {
    user: user as AuthUser,
    token,
    refreshToken,
  };
}

/**
 * Logout by invalidating the session token.
 */
export async function logout(token: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.token, token));
}

/**
 * Refresh tokens using a refresh token.
 * Throws UnauthorizedError if invalid or expired.
 */
export async function refresh(refreshToken: string): Promise<{ token: string; refreshToken: string }> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.refreshToken, refreshToken),
    with: { user: true },
  });

  if (!session) throw new UnauthorizedError('无效的刷新令牌');
  if (new Date(session.expiresAt) < new Date()) throw new UnauthorizedError('会话已过期');
  if (!session.user) {
    // 孤儿会话: 用户已被删除 (如 seed 重灌后残留)。若继续签发新 token,
    // 前端会陷入“刷新成功 → 重试仍 401 → 永不跳登录页”的死循环。
    // 拒绝刷新并清理孤儿会话, 前端 refresh 失败路径会登出并跳转登录页。
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw new UnauthorizedError('账号已不存在，请重新登录');
  }

  const newToken = uuid();
  const newRefreshToken = uuid();

  await db.update(sessions)
    .set({
      token: newToken,
      refreshToken: newRefreshToken,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    })
    .where(eq(sessions.id, session.id));

  return { token: newToken, refreshToken: newRefreshToken };
}

/**
 * Check if a user has permission for a resource/action.
 */
export function authorize(user: AuthUser, resource: string, action: string): boolean {
  if (!user.role?.permissions) return false;
  const permissions = typeof user.role.permissions === 'string' 
    ? JSON.parse(user.role.permissions) 
    : user.role.permissions;
  return !!permissions[resource]?.[action];
}

/**
 * Get the current user from a session token.
 * Returns null if not found or expired.
 */
export async function getCurrentUser(token: string): Promise<AuthUser | null> {
  const session = await db.query.sessions.findFirst({
    where: eq(sessions.token, token),
    with: { user: { with: { role: true } } },
  });

  if (!session || new Date(session.expiresAt) < new Date()) return null;
  return session.user as AuthUser;
}
