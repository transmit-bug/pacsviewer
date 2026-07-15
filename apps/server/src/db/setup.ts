import { Database } from 'bun:sqlite';
import { join } from 'path';

const dbPath = process.env.DATABASE_URL || './data/pacsviewer.db';
const db = new Database(dbPath);

console.log('🗄️ Creating database tables...');

db.exec(`
  CREATE TABLE IF NOT EXISTS roles (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    description TEXT,
    permissions TEXT NOT NULL DEFAULT '{}',
    is_system INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    avatar TEXT,
    role_id TEXT REFERENCES roles(id),
    status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active', 'disabled', 'locked')),
    last_login_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    token TEXT NOT NULL UNIQUE,
    refresh_token TEXT NOT NULL UNIQUE,
    device_info TEXT,
    ip_address TEXT,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patients (
    id TEXT PRIMARY KEY,
    mrn TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    gender TEXT NOT NULL CHECK(gender IN ('male', 'female', 'other')),
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
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS patient_tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    color TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS studies (
    id TEXT PRIMARY KEY,
    patient_id TEXT NOT NULL REFERENCES patients(id),
    study_date TEXT NOT NULL,
    study_time TEXT,
    study_type TEXT NOT NULL CHECK(study_type IN ('oct', 'fundus', 'ffa', 'icga', 'vf', 'octa', 'other')),
    modality TEXT NOT NULL,
    device TEXT,
    physician_id TEXT REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'diagnosed', 'reported')),
    description TEXT,
    tags TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS series (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL REFERENCES studies(id),
    series_number INTEGER NOT NULL,
    series_description TEXT,
    modality TEXT NOT NULL,
    body_part TEXT,
    image_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    series_id TEXT NOT NULL REFERENCES series(id),
    instance_number INTEGER NOT NULL,
    file_path TEXT NOT NULL,
    file_size INTEGER NOT NULL,
    file_hash TEXT NOT NULL,
    format TEXT NOT NULL CHECK(format IN ('dicom', 'jpeg', 'png', 'tiff', 'bmp')),
    width INTEGER NOT NULL,
    height INTEGER NOT NULL,
    bits_allocated INTEGER NOT NULL DEFAULT 8,
    thumbnail_path TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS layers (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL REFERENCES images(id),
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('image', 'annotation', 'ai_result')),
    visible INTEGER NOT NULL DEFAULT 1,
    opacity REAL NOT NULL DEFAULT 1,
    locked INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS annotations (
    id TEXT PRIMARY KEY,
    image_id TEXT NOT NULL REFERENCES images(id),
    user_id TEXT NOT NULL REFERENCES users(id),
    layer_id TEXT REFERENCES layers(id),
    type TEXT NOT NULL CHECK(type IN ('measurement', 'arrow', 'text', 'freehand', 'roi', 'highlight')),
    geometry TEXT NOT NULL,
    style TEXT NOT NULL,
    label TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS report_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('oct', 'fundus', 'ffa', 'icga', 'vf', 'octa', 'comprehensive', 'custom')),
    description TEXT,
    fields TEXT NOT NULL,
    layout TEXT NOT NULL,
    is_system INTEGER NOT NULL DEFAULT 0,
    created_by TEXT REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    study_id TEXT NOT NULL REFERENCES studies(id),
    patient_id TEXT NOT NULL REFERENCES patients(id),
    template_id TEXT NOT NULL REFERENCES report_templates(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    images TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft', 'pending_review', 'reviewed', 'published')),
    reviewer_id TEXT REFERENCES users(id),
    review_notes TEXT,
    published_at TEXT,
    created_by TEXT NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    action TEXT NOT NULL,
    resource TEXT NOT NULL,
    resource_id TEXT,
    details TEXT,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`);

console.log('✅ Tables created successfully!');

// Seed default roles and users
import { v4 as uuid } from 'uuid';

console.log('🌱 Seeding database...');

// Create default roles
const adminRoleId = uuid();
const doctorRoleId = uuid();
const techRoleId = uuid();
const viewerRoleId = uuid();

const insertRole = db.prepare(`
  INSERT OR IGNORE INTO roles (id, name, description, permissions, is_system, created_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);

insertRole.run(adminRoleId, '管理员', '系统管理员，拥有所有权限', JSON.stringify({
  patients: { create: true, read: true, update: true, delete: true },
  studies: { create: true, read: true, update: true, delete: true },
  reports: { create: true, read: true, update: true, delete: true, approve: true },
  users: { create: true, read: true, update: true, delete: true },
  settings: { read: true, update: true },
}), 1, new Date().toISOString());

insertRole.run(doctorRoleId, '医生', '眼科医生，可查看和编辑患者、检查、报告', JSON.stringify({
  patients: { create: true, read: true, update: true, delete: false },
  studies: { create: true, read: true, update: true, delete: false },
  reports: { create: true, read: true, update: true, delete: false, approve: false },
  users: { create: false, read: true, update: false, delete: false },
  settings: { read: true, update: false },
}), 1, new Date().toISOString());

insertRole.run(techRoleId, '技师', '检查技师，可上传图像和管理检查', JSON.stringify({
  patients: { create: false, read: true, update: false, delete: false },
  studies: { create: true, read: true, update: true, delete: false },
  reports: { create: false, read: true, update: false, delete: false },
  users: { create: false, read: false, update: false, delete: false },
  settings: { read: false, update: false },
}), 1, new Date().toISOString());

insertRole.run(viewerRoleId, '只读用户', '只能查看，不能编辑', JSON.stringify({
  patients: { create: false, read: true, update: false, delete: false },
  studies: { create: false, read: true, update: false, delete: false },
  reports: { create: false, read: true, update: false, delete: false },
  users: { create: false, read: false, update: false, delete: false },
  settings: { read: false, update: false },
}), 1, new Date().toISOString());

console.log('✅ Roles created');

// Create admin user
const adminPassword = await Bun.password.hash('admin123');
const insertUser = db.prepare(`
  INSERT OR IGNORE INTO users (id, username, email, password_hash, display_name, role_id, status, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
`);

insertUser.run(uuid(), 'admin', 'admin@pacsviewer.com', adminPassword, '系统管理员', adminRoleId, 'active', new Date().toISOString(), new Date().toISOString());

// Create demo doctor
const doctorPassword = await Bun.password.hash('doctor123');
insertUser.run(uuid(), 'doctor', 'doctor@pacsviewer.com', doctorPassword, '张医生', doctorRoleId, 'active', new Date().toISOString(), new Date().toISOString());

console.log('✅ Users created');
console.log('🎉 Seed completed!');
console.log('');
console.log('Default accounts:');
console.log('  Admin: admin / admin123');
console.log('  Doctor: doctor / doctor123');
