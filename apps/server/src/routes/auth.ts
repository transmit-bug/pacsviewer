/**
 * Auth routes - Thin wrapper around lib/auth module.
 */

import { Hono } from 'hono';
import { z } from 'zod';
import { login, logout, refresh, getCurrentUser } from '../lib/auth';

const auth = new Hono();

const loginSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
});

// Login
auth.post('/login', async (c) => {
  const { username, password } = loginSchema.parse(await c.req.json());

  const result = await login(username, password, {
    userAgent: c.req.header('User-Agent'),
    ipAddress: c.req.header('X-Forwarded-For') || c.req.header('X-Real-IP'),
  });

  return c.json({
    success: true,
    data: {
      user: {
        id: result.user.id,
        username: result.user.username,
        email: result.user.email,
        displayName: result.user.displayName,
        avatar: result.user.avatar,
        role: result.user.role,
      },
      token: result.token,
      refreshToken: result.refreshToken,
    },
  });
});

// Refresh token
auth.post('/refresh', async (c) => {
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
    },
  });
});

export default auth;
