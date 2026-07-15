import { Hono } from 'hono';
import { z } from 'zod';
import { db, users, roles, auditLogs } from '../db';
import { eq, sql } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const usersRouter = new Hono();

// Get all users
usersRouter.get('/', async (c) => {
  try {
    const page = Number(c.req.query('page')) || 1;
    const pageSize = Number(c.req.query('pageSize')) || 20;
    const offset = (page - 1) * pageSize;

    const allUsers = await db.query.users.findMany({
      limit: pageSize,
      offset,
      orderBy: (users, { desc }) => [desc(users.createdAt)],
      with: { role: true },
    });

    const count = await db.select({ count: sql<number>`count(*)` }).from(users);

    return c.json({
      success: true,
      data: {
        items: allUsers,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  } catch (error) {
    console.error('Get users error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Get user by ID
usersRouter.get('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { role: true },
    });

    if (!user) {
      return c.json({ success: false, message: '用户未找到' }, 404);
    }

    return c.json({ success: true, data: user });
  } catch (error) {
    console.error('Get user error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create user
usersRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    // Hash password
    const passwordHash = await Bun.password.hash(body.password);

    await db.insert(users).values({
      id,
      username: body.username,
      email: body.email,
      passwordHash,
      displayName: body.displayName,
      roleId: body.roleId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { role: true },
    });

    return c.json({ success: true, data: user }, 201);
  } catch (error) {
    console.error('Create user error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update user
usersRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(users)
      .set({
        ...body,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    const user = await db.query.users.findFirst({
      where: eq(users.id, id),
      with: { role: true },
    });

    return c.json({ success: true, data: user });
  } catch (error) {
    console.error('Update user error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete user
usersRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(users).where(eq(users.id, id));
    return c.json({ success: true, message: '用户已删除' });
  } catch (error) {
    console.error('Delete user error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update password
usersRouter.put('/:id/password', async (c) => {
  try {
    const id = c.req.param('id');
    const { password } = await c.req.json();

    const passwordHash = await Bun.password.hash(password);

    await db.update(users)
      .set({
        passwordHash,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    return c.json({ success: true, message: '密码已更新' });
  } catch (error) {
    console.error('Update password error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update status
usersRouter.put('/:id/status', async (c) => {
  try {
    const id = c.req.param('id');
    const { status } = await c.req.json();

    await db.update(users)
      .set({
        status,
        updatedAt: new Date().toISOString(),
      })
      .where(eq(users.id, id));

    return c.json({ success: true, message: '状态已更新' });
  } catch (error) {
    console.error('Update status error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default usersRouter;
