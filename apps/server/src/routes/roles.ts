import { Hono } from 'hono';
import { db, roles } from '../db';
import { eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';

const rolesRouter = new Hono();

// Get all roles
rolesRouter.get('/', async (c) => {
  try {
    const allRoles = await db.query.roles.findMany({
      orderBy: (roles, { asc }) => [asc(roles.name)],
    });

    return c.json({ success: true, data: allRoles });
  } catch (error) {
    console.error('Get roles error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Create role
rolesRouter.post('/', async (c) => {
  try {
    const body = await c.req.json();
    const id = uuid();

    await db.insert(roles).values({
      id,
      ...body,
      createdAt: new Date().toISOString(),
    });

    const role = await db.query.roles.findFirst({
      where: eq(roles.id, id),
    });

    return c.json({ success: true, data: role }, 201);
  } catch (error) {
    console.error('Create role error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Update role
rolesRouter.put('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const body = await c.req.json();

    await db.update(roles)
      .set(body)
      .where(eq(roles.id, id));

    const role = await db.query.roles.findFirst({
      where: eq(roles.id, id),
    });

    return c.json({ success: true, data: role });
  } catch (error) {
    console.error('Update role error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

// Delete role
rolesRouter.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await db.delete(roles).where(eq(roles.id, id));
    return c.json({ success: true, message: '角色已删除' });
  } catch (error) {
    console.error('Delete role error:', error);
    return c.json({ success: false, message: '服务器错误' }, 500);
  }
});

export default rolesRouter;
