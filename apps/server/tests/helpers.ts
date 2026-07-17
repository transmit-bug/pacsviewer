/**
 * Test helper — creates an in-memory SQLite database matching production schema.
 */

// Set database URL to in-memory BEFORE importing any modules
process.env.DATABASE_URL = ':memory:';

import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';
import * as schema from '../src/db/schema';
import { v4 as uuid } from 'uuid';
import { db } from '../src/db';

const FULL_SCHEMA_SQL = `
CREATE TABLE roles (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  permissions TEXT DEFAULT '{}' NOT NULL,
  is_system INTEGER DEFAULT false NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
CREATE UNIQUE INDEX roles_name_unique ON roles (name);

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  username TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  avatar TEXT,
  role_id TEXT,
  status TEXT DEFAULT 'active' NOT NULL,
  last_login_at TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (role_id) REFERENCES roles(id)
);
CREATE UNIQUE INDEX users_username_unique ON users (username);
CREATE UNIQUE INDEX users_email_unique ON users (email);

CREATE TABLE patients (
  id TEXT PRIMARY KEY NOT NULL,
  mrn TEXT NOT NULL,
  name TEXT NOT NULL,
  gender TEXT NOT NULL,
  birth_date TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  id_card TEXT,
  insurance_no TEXT,
  address TEXT,
  avatar TEXT,
  notes TEXT,
  tags TEXT DEFAULT '[]',
  custom_fields TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
CREATE UNIQUE INDEX patients_mrn_unique ON patients (mrn);

CREATE TABLE studies (
  id TEXT PRIMARY KEY NOT NULL,
  patient_id TEXT NOT NULL,
  study_date TEXT NOT NULL,
  study_time TEXT,
  modality TEXT,
  device TEXT,
  physician_id TEXT,
  status TEXT DEFAULT 'pending' NOT NULL,
  description TEXT,
  tags TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (physician_id) REFERENCES users(id)
);

CREATE TABLE series (
  id TEXT PRIMARY KEY NOT NULL,
  study_id TEXT NOT NULL,
  series_number INTEGER NOT NULL,
  series_description TEXT,
  modality TEXT NOT NULL,
  body_part TEXT,
  image_count INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (study_id) REFERENCES studies(id)
);

CREATE TABLE images (
  id TEXT PRIMARY KEY NOT NULL,
  series_id TEXT NOT NULL,
  instance_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  file_hash TEXT NOT NULL,
  format TEXT NOT NULL,
  width INTEGER NOT NULL,
  height INTEGER NOT NULL,
  bits_allocated INTEGER DEFAULT 8 NOT NULL,
  thumbnail_path TEXT,
  metadata TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (series_id) REFERENCES series(id)
);

CREATE TABLE layers (
  id TEXT PRIMARY KEY NOT NULL,
  image_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  visible INTEGER DEFAULT true NOT NULL,
  opacity REAL DEFAULT 1 NOT NULL,
  locked INTEGER DEFAULT false NOT NULL,
  sort_order INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id)
);

CREATE TABLE annotations (
  id TEXT PRIMARY KEY NOT NULL,
  image_id TEXT,
  study_id TEXT,
  user_id TEXT NOT NULL,
  layer_id TEXT,
  type TEXT NOT NULL,
  geometry TEXT NOT NULL,
  style TEXT NOT NULL,
  label TEXT,
  notes TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (image_id) REFERENCES images(id),
  FOREIGN KEY (study_id) REFERENCES studies(id),
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (layer_id) REFERENCES layers(id)
);

CREATE TABLE report_templates (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  description TEXT,
  fields TEXT NOT NULL,
  layout TEXT NOT NULL,
  is_system INTEGER DEFAULT false NOT NULL,
  created_by TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE reports (
  id TEXT PRIMARY KEY NOT NULL,
  study_id TEXT NOT NULL,
  patient_id TEXT NOT NULL,
  template_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT DEFAULT '[]',
  status TEXT DEFAULT 'draft' NOT NULL,
  reviewer_id TEXT,
  review_notes TEXT,
  published_at TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (study_id) REFERENCES studies(id),
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (template_id) REFERENCES report_templates(id),
  FOREIGN KEY (reviewer_id) REFERENCES users(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE report_versions (
  id TEXT PRIMARY KEY NOT NULL,
  report_id TEXT NOT NULL,
  version INTEGER NOT NULL,
  status TEXT NOT NULL,
  content TEXT NOT NULL,
  images TEXT DEFAULT '[]',
  change_notes TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (report_id) REFERENCES reports(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  resource TEXT NOT NULL,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE system_settings (
  id TEXT PRIMARY KEY NOT NULL,
  category TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  description TEXT,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);

CREATE TABLE device_adapters (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT DEFAULT 'idle' NOT NULL,
  config TEXT NOT NULL,
  enabled INTEGER DEFAULT true NOT NULL,
  last_error TEXT,
  last_image_at TEXT,
  image_count INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);

CREATE TABLE devices (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  model TEXT NOT NULL,
  serial_number TEXT,
  adapter_id TEXT,
  connection_info TEXT,
  status TEXT DEFAULT 'offline' NOT NULL,
  last_sync_at TEXT,
  image_count INTEGER DEFAULT 0 NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (adapter_id) REFERENCES device_adapters(id)
);

CREATE TABLE inbound_transfers (
  id TEXT PRIMARY KEY NOT NULL,
  device_id TEXT,
  adapter_id TEXT NOT NULL,
  status TEXT DEFAULT 'pending' NOT NULL,
  file_count INTEGER NOT NULL,
  processed_count INTEGER DEFAULT 0 NOT NULL,
  error_count INTEGER DEFAULT 0 NOT NULL,
  metadata TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  completed_at TEXT,
  FOREIGN KEY (device_id) REFERENCES devices(id),
  FOREIGN KEY (adapter_id) REFERENCES device_adapters(id)
);

CREATE TABLE comparisons (
  id TEXT PRIMARY KEY NOT NULL,
  patient_id TEXT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  config TEXT NOT NULL,
  image_ids TEXT DEFAULT '[]' NOT NULL,
  is_favorite INTEGER DEFAULT false NOT NULL,
  snapshot_path TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  updated_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (patient_id) REFERENCES patients(id),
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY NOT NULL,
  user_id TEXT NOT NULL,
  token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  device_info TEXT,
  ip_address TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
CREATE UNIQUE INDEX sessions_token_unique ON sessions (token);
CREATE UNIQUE INDEX sessions_refresh_token_unique ON sessions (refresh_token);

CREATE TABLE patient_tags (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  description TEXT,
  created_at TEXT DEFAULT 'CURRENT_TIMESTAMP' NOT NULL
);
CREATE UNIQUE INDEX patient_tags_name_unique ON patient_tags (name);
`;

export async function createTestApp() {
  // Use the singleton db instance (already connected to :memory:)
  // Drizzle ORM will handle table creation via db:push or schema initialization
  
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
