/**
 * Generic CRUD router factory for Hono + Drizzle ORM.
 *
 * Usage:
 *   const patientsRouter = createCrudRouter(patients, {
 *     name: '患者',
 *     createSchema: insertPatientSchema,
 *     routes: (router) => {
 *       router.get('/:id/studies', async (c) => { ... });
 *     },
 *   });
 */

import { Hono } from 'hono';
import { eq, sql, desc, asc, type SQL } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import type { SQLiteTable, SQLiteColumn } from 'drizzle-orm/sqlite-core';
import type { Context } from 'hono';
import { NotFoundError } from './errors';
import { db } from '../db';

/** Options for createCrudRouter */
export interface CrudOptions {
  /** Resource name for error messages (e.g. '患者', '检查') */
  name: string;
  /** Drizzle query key for relational queries (e.g. 'patients', 'studies') */
  queryKey: string;
  /** Zod schema for create validation */
  createSchema?: { parse: (data: unknown) => any };
  /** Zod schema for update validation */
  updateSchema?: { parse: (data: unknown) => any };
  /** Default sort: column name and direction */
  defaultSort?: { column: string; direction: 'asc' | 'desc' };
  /** Additional middleware for all routes */
  middleware?: Parameters<Hono['use']>[];
  /** Add custom routes */
  routes?: (router: Hono) => void;
  /** Relations to include in queries */
  with?: Record<string, any>;
  /** Dynamic filter for list endpoint */
  listWhere?: (c: Context) => SQL | undefined;
  /** Transform data before create */
  beforeCreate?: (data: any, c: Context) => any;
  /** Transform data before update */
  beforeUpdate?: (data: any, c: Context) => any;
}

/**
 * Create a Hono router with standard CRUD endpoints for a Drizzle table.
 *
 * Endpoints:
 *   GET    /          - List with pagination
 *   GET    /:id       - Get by ID
 *   POST   /          - Create
 *   PUT    /:id       - Update
 *   DELETE /:id       - Delete
 */
export function createCrudRouter<T extends SQLiteTable>(
  table: T,
  options: CrudOptions,
): Hono {
  const router = new Hono();
  const {
    name,
    queryKey,
    createSchema,
    updateSchema,
    routes,
    with: withRelations,
    listWhere,
    beforeCreate,
    beforeUpdate,
  } = options;

  const sortColumn = options.defaultSort?.column ?? 'createdAt';
  const sortDirection = options.defaultSort?.direction ?? 'desc';

  // Helper: get columns from table
  const idCol = (table as any).id as SQLiteColumn;

  // Access the relational query builder for this table
  const queryBuilder = (db.query as any)[queryKey];

  // GET / - List with pagination
  router.get('/', async (c: Context) => {
    const page = Math.max(1, Number(c.req.query('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(c.req.query('pageSize')) || 20));
    const offset = (page - 1) * pageSize;

    const orderByFn = sortDirection === 'desc' ? desc : asc;
    const sortCol = (table as any)[sortColumn] ?? idCol;

    const where = listWhere ? listWhere(c) : undefined;

    const query: any = {
      limit: pageSize,
      offset,
      orderBy: [orderByFn(sortCol)],
    };
    if (withRelations) query.with = withRelations;
    if (where) query.where = where;

    const items = await queryBuilder.findMany(query);

    const count = await db
      .select({ count: sql<number>`count(*)` })
      .from(table)
      .where(where ?? undefined);

    return c.json({
      success: true,
      data: {
        items,
        total: count[0].count,
        page,
        pageSize,
        totalPages: Math.ceil(count[0].count / pageSize),
      },
    });
  });

  // GET /:id - Get by ID
  router.get('/:id', async (c: Context) => {
    const id = c.req.param('id');

    const query: any = { where: eq(idCol, id) };
    if (withRelations) query.with = withRelations;

    const item = await queryBuilder.findFirst(query);
    if (!item) throw new NotFoundError(name);

    return c.json({ success: true, data: item });
  });

  // POST / - Create
  router.post('/', async (c: Context) => {
    const body = createSchema
      ? createSchema.parse(await c.req.json())
      : await c.req.json();

    const transformed = beforeCreate ? await beforeCreate(body, c) : body;
    const id = uuid();
    const now = new Date().toISOString();

    await db.insert(table).values({
      id,
      ...transformed,
      createdAt: now,
      updatedAt: now,
    } as any);

    const item = await queryBuilder.findFirst({
      where: eq(idCol, id),
      ...(withRelations ? { with: withRelations } : {}),
    });

    return c.json({ success: true, data: item }, 201);
  });

  // PUT /:id - Update
  router.put('/:id', async (c: Context) => {
    const id = c.req.param('id');

    const body = updateSchema
      ? updateSchema.parse(await c.req.json())
      : await c.req.json();

    const transformed = beforeUpdate ? await beforeUpdate(body, c) : body;

    await db
      .update(table)
      .set({ ...transformed, updatedAt: new Date().toISOString() } as any)
      .where(eq(idCol, id));

    const item = await queryBuilder.findFirst({
      where: eq(idCol, id),
      ...(withRelations ? { with: withRelations } : {}),
    });
    if (!item) throw new NotFoundError(name);

    return c.json({ success: true, data: item });
  });

  // DELETE /:id - Delete
  router.delete('/:id', async (c: Context) => {
    const id = c.req.param('id');
    await db.delete(table).where(eq(idCol, id));
    return c.json({ success: true, message: `${name}已删除` });
  });

  // Register custom routes
  if (routes) routes(router);

  return router;
}
