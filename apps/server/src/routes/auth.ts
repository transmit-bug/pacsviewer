/**
 * Auth routes - Thin wrapper around lib/auth module.
 *
 * #139 安全加固:
 *  - 登录/刷新端点限流: 5 次失败锁 15 分钟 (IP+用户名维度, env 可调);
 *  - 登录失败写审计日志 (含「用户名不存在」的尝试, userId 为 null);
 *  - demo-login 仅开发环境注册 (DEMO_LOGIN_ENABLED 可显式关闭), 生产构建无此路径;
 *  - PUT /change-password: 用户自行改密 + 首登强制改密的落地入口。
 */

import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { rateLimiter } from 'hono-rate-limiter';
import { login, logout, refresh, getCurrentUser } from '../lib/auth';
import { passwordPolicySchema } from '../lib/password-policy';
import { log } from '../lib/audit';
import { db, users } from '../db';
import { UnauthorizedError, ValidationError } from '../lib/errors';
import { DEMO_ACCOUNT } from '../lib/demo';
import type { LoginResult } from '../lib/auth';

const auth = new Hono();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: passwordPolicySchema,
});

// ── Rate limiting (#139) ────────────────────────────────────────────────────
// 锁定条件: 窗口内 5 次失败 (skipSuccessfulRequests → 成功请求不计数)。
// 维度: IP + 用户名 (refresh 用 refreshToken), 同一 IP 爆破多个账号互不影响。
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const RATE_LIMIT_WINDOW_MIN = Number(process.env.RATE_LIMIT_WINDOW_MINUTES || 15);

function clientIp(c: { req: { header: (name: string) => string | undefined } }): string {
  return c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP') || 'unknown';
}

/** 从请求体取用户名作为限流键的一部分 (Hono 会缓存 body, 后续 handler 可再次读取) */
async function attemptKey(c: any, fallbackField?: string): Promise<string> {
  let identity = '';
  try {
    const body = await c.req.json();
    identity = String(body.username ?? (fallbackField ? body[fallbackField] : '') ?? '');
  } catch {
    // body 缺失/非法时退化为纯 IP 维度
  }
  return `${clientIp(c)}:${identity}`;
}

function authRateLimiter(fallbackField?: string) {
  return rateLimiter({
    windowMs: RATE_LIMIT_WINDOW_MIN * 60 * 1000,
    limit: RATE_LIMIT_MAX,
    standardHeaders: 'draft-6',
    skipSuccessfulRequests: true,
    keyGenerator: (c) => attemptKey(c, fallbackField),
    handler: (c) =>
      c.json(
        {
          success: false,
          message: `尝试次数过多，已临时锁定 ${RATE_LIMIT_WINDOW_MIN} 分钟，请稍后重试`,
        },
        429,
      ),
  });
}

/** 与 /login 一致的会话载荷形状 (user + token + refreshToken + mustChangePassword) */
function toSessionPayload(result: LoginResult) {
  return {
    user: {
      id: result.user.id,
      username: result.user.username,
      email: result.user.email,
      displayName: result.user.displayName,
      avatar: result.user.avatar,
      role: result.user.role,
      mustChangePassword: result.mustChangePassword,
    },
    token: result.token,
    refreshToken: result.refreshToken,
    mustChangePassword: result.mustChangePassword,
  };
}

// Login
auth.post('/login', authRateLimiter('username'), async (c) => {
  const { username, password } = loginSchema.parse(await c.req.json());

  const ipAddress = clientIp(c);

  try {
    const result = await login(username, password, {
      userAgent: c.req.header('User-Agent'),
      ipAddress,
    });

    return c.json({
      success: true,
      data: toSessionPayload(result),
    });
  } catch (err) {
    // 登录失败写审计 (#139, 联动 #138): 用户名不存在时 userId 为 null
    if (err instanceof UnauthorizedError) {
      const known = await db.query.users.findFirst({ where: eq(users.username, username) });
      log({
        userId: known?.id ?? null,
        action: 'login_failed',
        resource: 'auth',
        details: { username, reason: err.message },
        ipAddress,
        userAgent: c.req.header('User-Agent'),
      });
    }
    throw err;
  }
});

// Demo login — 一键演示登录: 使用播种的演示账号 (凭据只在服务端, 前端无感知)
// 仅开发环境注册; 生产构建完全不存在该路由 (#139)
const DEMO_LOGIN_ENABLED =
  process.env.NODE_ENV !== 'production' && process.env.DEMO_LOGIN_ENABLED !== 'false';

if (DEMO_LOGIN_ENABLED) {
  auth.post('/demo-login', async (c) => {
    const result = await login(DEMO_ACCOUNT.username, DEMO_ACCOUNT.password, {
      userAgent: c.req.header('User-Agent'),
      ipAddress: clientIp(c),
    });

    return c.json({
      success: true,
      data: toSessionPayload(result),
    });
  });
}

// Refresh token
auth.post('/refresh', authRateLimiter('refreshToken'), async (c) => {
  const { refreshToken } = await c.req.json();
  const tokens = await refresh(refreshToken);
  return c.json({ success: true, data: tokens });
});

// Logout
auth.post('/logout', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (token) await logout(token);
  return c.json({ success: true, message: '已退出登录' });
});

// Change own password — 自助改密 & 首登强制改密的落地入口 (#139)
auth.put('/change-password', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) throw new UnauthorizedError();

  const current = await getCurrentUser(token);
  if (!current) throw new UnauthorizedError('会话已过期');

  const row = await db.query.users.findFirst({ where: eq(users.id, current.id) });
  if (!row) throw new UnauthorizedError('账号已不存在');

  const { currentPassword, newPassword } = changePasswordSchema.parse(await c.req.json());

  const valid = await Bun.password.verify(currentPassword, row.passwordHash);
  if (!valid) throw new UnauthorizedError('当前密码错误');
  if (await Bun.password.verify(newPassword, row.passwordHash)) {
    throw new ValidationError('新密码不能与当前密码相同');
  }

  const passwordHash = await Bun.password.hash(newPassword);
  await db.update(users)
    .set({ passwordHash, mustChangePassword: false, updatedAt: new Date().toISOString() })
    .where(eq(users.id, row.id));

  log({
    userId: row.id,
    action: 'password_change',
    resource: 'user',
    resourceId: row.id,
    details: { forced: !!row.mustChangePassword },
    ipAddress: clientIp(c),
    userAgent: c.req.header('User-Agent'),
  });

  return c.json({ success: true, message: '密码已更新', mustChangePassword: false });
});

// Get current user
auth.get('/me', async (c) => {
  const token = c.req.header('Authorization')?.replace('Bearer ', '');
  if (!token) {
    return c.json({ success: false, message: '未授权' }, 401);
  }

  const user = await getCurrentUser(token);
  if (!user) {
    return c.json({ success: false, message: '会话已过期' }, 401);
  }

  return c.json({
    success: true,
    data: {
      id: user.id,
      username: user.username,
      email: user.email,
      displayName: user.displayName,
      avatar: user.avatar,
      role: user.role,
      mustChangePassword: !!user.mustChangePassword,
    },
  });
});

export default auth;
