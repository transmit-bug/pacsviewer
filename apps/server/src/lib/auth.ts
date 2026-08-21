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
import { db, users, sessions, auditLogs } from '../db';
import { UnauthorizedError, ForbiddenError } from './errors';

// ── Session duration policy (#139) ──────────────────────────────────────────
// 空闲超时: 每次成功认证顺延; 绝对上限: 自登录起算, refresh 轮换不重置。
const IDLE_MS = Number(process.env.SESSION_IDLE_MINUTES || 30) * 60 * 1000;
const ABSOLUTE_MS = Number(process.env.SESSION_ABSOLUTE_HOURS || 12) * 60 * 60 * 1000;

export const SESSION_POLICY = {
  idleMs: IDLE_MS,
  absoluteMs: ABSOLUTE_MS,
};

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
  /** 首登强制改密标记 (#139) */
  mustChangePassword?: boolean;
}

/** Session data */
export interface SessionData {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: string;
  absoluteExpiresAt: string;
}

/** 会话双重过期判定: 空闲超时 (expiresAt) 或绝对上限 (absoluteExpiresAt) 任一到期即失效 */
export function isSessionExpired(session: { expiresAt: string; absoluteExpiresAt?: string }, now = new Date()): boolean {
  if (new Date(session.expiresAt) < now) return true;
  if (session.absoluteExpiresAt && new Date(session.absoluteExpiresAt) < now) return true;
  return false;
}

/** 滑动顺延: 空闲过期时间推到 now + idle, 绝对上限不动 */
function slideExpiry(now = Date.now()): { lastActiveAt: string; expiresAt: string } {
  return {
    lastActiveAt: new Date(now).toISOString(),
    expiresAt: new Date(now + IDLE_MS).toISOString(),
  };
}

/** Login result */
export interface LoginResult {
  user: AuthUser;
  token: string;
  refreshToken: string;
  /** true = 账号仍持有初始密码, 前端必须引导改密后才能正常使用 */
  mustChangePassword: boolean;
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
  if (isSessionExpired(session)) return null;

  // 滑动续期: 成功认证即视为活跃, 顺延空闲过期时间 (绝对上限不变)
  await db.update(sessions)
    .set(slideExpiry())
    .where(eq(sessions.id, session.id));

  return session.user as AuthUser;
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

  if (!user) throw new UnauthorizedError('用户名或密码错误');

  const isValid = await Bun.password.verify(password, user.passwordHash);
  if (!isValid) throw new UnauthorizedError('用户名或密码错误');

  if (user.status !== 'active') throw new ForbiddenError('账号已被禁用');

  const now = Date.now();
  const token = uuid();
  const refreshToken = uuid();

  await db.insert(sessions).values({
    id: uuid(),
    userId: user.id,
    token,
    refreshToken,
    deviceInfo: meta?.userAgent ? { userAgent: meta.userAgent } : null,
    ipAddress: meta?.ipAddress ?? null,
    ...slideExpiry(now),
    absoluteExpiresAt: new Date(now + ABSOLUTE_MS).toISOString(),
  });

  await db.update(users)
    .set({ lastLoginAt: new Date().toISOString() })
    .where(eq(users.id, user.id));

  await db.insert(auditLogs).values({
    id: uuid(),
    userId: user.id,
    action: 'login',
    resource: 'auth',
    details: { success: true },
    ipAddress: meta?.ipAddress ?? null,
  });

  return {
    user: user as AuthUser,
    token,
    refreshToken,
    mustChangePassword: !!user.mustChangePassword,
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
  if (isSessionExpired(session)) throw new UnauthorizedError('会话已过期');
  if (!session.user) {
    // 孤儿会话: 用户已被删除 (如 seed 重灌后残留)。若继续签发新 token,
    // 前端会陷入“刷新成功 → 重试仍 401 → 永不跳登录页”的死循环。
    // 拒绝刷新并清理孤儿会话, 前端 refresh 失败路径会登出并跳转登录页。
    await db.delete(sessions).where(eq(sessions.id, session.id));
    throw new UnauthorizedError('账号已不存在，请重新登录');
  }

  const newToken = uuid();
  const newRefreshToken = uuid();

  // 轮换 token 并顺延空闲过期时间; 绝对上限保持登录时刻的值 ——
  // refresh 不能重置绝对上限, 否则会话可被无限续期 (#139)
  await db.update(sessions)
    .set({
      token: newToken,
      refreshToken: newRefreshToken,
      ...slideExpiry(),
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

  if (!session || isSessionExpired(session)) return null;

  // 滑动续期同 authenticate
  await db.update(sessions)
    .set(slideExpiry())
    .where(eq(sessions.id, session.id));

  return session.user as AuthUser;
}
