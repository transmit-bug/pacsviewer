import { Hono } from 'hono';
import { z } from 'zod';
import { db, users, roles, sessions, auditLogs } from '../db';
import { eq, and } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const auth = new Hono();

// Login schema
const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Login endpoint
auth.post('/login', async (c) => {
  try {
    const body = await c.req.json();
    const { username, password } = loginSchema.parse(body);

    // Find user
    const user = await db.query.users.findFirst({
      where: eq(users.username, username),
      with: { role: true },
    });

    if (!user) {
      return c.json({ success: false, message: '用户名或密码错误' }, 401);
    }

    // Check password (in production, use bcrypt)
    const passwordHash = await Bun.password.hash(password);
    const isValid = await Bun.password.verify(password, user.passwordHash);

    if (!isValid) {
      return c.json({ success: false, message: '用户名或密码错误' }, 401);
    }

    // Check user status
    if (user.status !== 'active') {
      return c.json({ success: false, message: '账号已被禁用' }, 403);
    }

    // Generate tokens
    const token = uuid();
    const refreshToken = uuid();

    // Create session
    await db.insert(sessions).values({
      id: uuid(),
      userId: user.id,
      token,
      refreshToken,
      deviceInfo: { userAgent: c.req.header('User-Agent') },
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    // Update last login
    await db.update(users)
      .set({ lastLoginAt: new Date().toISOString() })
      .where(eq(users.id, user.id));

    // Log audit
    await db.insert(auditLogs).values({
      id: uuid(),
      userId: user.id,
      action: 'login',
      resource: 'auth',
      details: { success: true },
      ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
    });

    return c.json({
      success: true,
      data: {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          displayName: user.displayName,
          avatar: user.avatar,
          role: user.role,
        },
        token,
        refreshToken,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return c.json({ success: false, message: '参数错误', errors: error.errors }, 400);
    }
    console.error('Login error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Refresh token endpoint
auth.post('/refresh', async (c) => {
  try {
    const { refreshToken } = await c.req.json();

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.refreshToken, refreshToken),
    });

    if (!session) {
      return c.json({ success: false, message: '无效的刷新令牌' }, 401);
    }

    // Check if session is expired
    if (new Date(session.expiresAt) < new Date()) {
      return c.json({ success: false, message: '会话已过期' }, 401);
    }

    // Generate new tokens
    const newToken = uuid();
    const newRefreshToken = uuid();

    // Update session
    await db.update(sessions)
      .set({
        token: newToken,
        refreshToken: newRefreshToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .where(eq(sessions.id, session.id));

    return c.json({
      success: true,
      data: {
        token: newToken,
        refreshToken: newRefreshToken,
      },
    });
  } catch (error) {
    console.error('Refresh error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Logout endpoint
auth.post('/logout', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (token) {
      await db.delete(sessions).where(eq(sessions.token, token));
    }

    return c.json({ success: true, message: '已退出登录' });
  } catch (error) {
    console.error('Logout error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get current user
auth.get('/me', async (c) => {
  try {
    const token = c.req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return c.json({ success: false, message: '未授权' }, 401);
    }

    const session = await db.query.sessions.findFirst({
      where: eq(sessions.token, token),
      with: {
        user: {
          with: { role: true },
        },
      },
    });

    if (!session || new Date(session.expiresAt) < new Date()) {
      return c.json({ success: false, message: '会话已过期' }, 401);
    }

    const user = session.user as any;
    return c.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        displayName: user.displayName,
        avatar: user.avatar,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Get profile error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default auth;
