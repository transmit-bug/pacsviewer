/**
 * Test helper — creates an in-memory SQLite database matching production schema.
 */

// Set database URL to in-memory BEFORE importing any modules
process.env.DATABASE_URL = ':memory:';

// NOTE: do NOT statically import '../src/db' here. ESM hoists import statements
// above the DATABASE_URL assignment, so the server db would open the on-disk
// dev database instead of :memory:. The db module is imported dynamically inside
// createTestApp() instead, once the env var is guaranteed to be set.
import * as schema from '../src/db/schema';
import { v4 as uuid } from 'uuid';


export async function createTestApp() {
  // Dynamically import the db singleton so it connects to :memory: (DATABASE_URL
  // was set at module top, and this import reads it after the assignment).
  const { db } = await import('../src/db');

  // Apply the real migration files (0000, 0001) so the test schema is identical
  // to production. The previous hand-maintained FULL_SCHEMA_SQL constant drifted
  // out of sync with schema.ts (new tables + patients/images column changes) and
  // was never executed — migrations are the single source of truth.
  const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
  await migrate(db, { migrationsFolder: new URL('../drizzle', import.meta.url).pathname });

  // Seed: admin role + user
  const adminRoleId = uuid();
  const adminId = uuid();
  let testToken = uuid();
  const adminPassword = await Bun.password.hash('admin123');
  const now = new Date().toISOString();

  try {
    await db.insert(schema.roles).values({
      id: adminRoleId,
      name: '管理员_' + adminRoleId.slice(0, 8), // Make unique
      description: 'System admin',
      permissions: JSON.stringify({
        patients: { create: true, read: true, update: true, delete: true },
        studies: { create: true, read: true, update: true, delete: true },
        reports: { create: true, read: true, update: true, delete: true, approve: true },
        users: { create: true, read: true, update: true, delete: true },
        settings: { read: true, update: true },
      }),
      isSystem: true,
      createdAt: now,
    });

    await db.insert(schema.users).values({
      id: adminId,
      username: 'admin_' + adminId.slice(0, 8), // Make unique
      email: `admin_${adminId.slice(0, 8)}@test.com`,
      passwordHash: adminPassword,
      displayName: 'Test Admin',
      roleId: adminRoleId,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // Create a valid session for authenticated tests
    const testRefreshToken = uuid();
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    await db.insert(schema.sessions).values({
      id: uuid(),
      userId: adminId,
      token: testToken,
      refreshToken: testRefreshToken,
      expiresAt: tomorrow,
    });
  } catch (e) {
    // Tables might not exist yet - that's ok, tests will fail with clear message
    console.warn('Seed data insertion failed (tables may not exist):', e);
  }

  const { default: app } = await import('../src/index');

  // For tests, we use a real session token
  return {
    app,
    db,
    adminId,
    adminRoleId,
    testToken,
    authHeaders: { 'Authorization': `Bearer ${testToken}` },
    cleanup: () => {}, // No-op since we're using singleton db
  };
}

export async function request(
  app: any,
  method: string,
  path: string,
  options?: { body?: any; headers?: Record<string, string> }
): Promise<{ status: number; json: () => Promise<any> }> {
  const url = `http://localhost${path}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  // If X-Test-User is set, we bypass auth by patching the middleware
  if (headers['X-Test-User']) {
    headers['Authorization'] = `Bearer test-token-${headers['X-Test-User']}`;
  }

  const init: RequestInit = { method, headers };
  if (options?.body) init.body = JSON.stringify(options.body);

  const response = await app.fetch(new Request(url, init));
  return { status: response.status, json: () => response.json() };
}
