/**
 * Comprehensive seed script for PACS Viewer.
 *
 * Generates a complete demo dataset:
 *   - Roles & Users
 *   - Patient Tags
 *   - Patients (20)
 *   - Devices & Adapters
 *   - Studies (40) with Series (80+) and Images (placeholder)
 *   - Report Templates (6)
 *   - Reports (20) in various states with versions
 *   - Annotations & Layers
 *   - Comparisons
 *   - System Settings
 *
 * Images use placeholder records. When DEV_FALLBACK_IMAGE is enabled (default
 * in development), missing image files serve synthetic fundus images instead of 404.
 * Place real fundus images in data/images/ to override the fallback.
 * Use scripts/seed-hrf.ts to import real fundus images from the HRF dataset.
 *
 * Usage: bun run src/db/seed.ts
 */

import { db } from './index';
import { eq, and } from 'drizzle-orm';
import { existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname, basename, join } from 'node:path';
import {
  roles, users, patients, patientTags,
  studies, series, images, dicomFrames,
  reportTemplates, reports, reportVersions,
  annotations, layers,
  devices, deviceAdapters,
  comparisons, systemSettings,
  measurementPoints, sessions,
} from './schema';
import { ensurePresetDefinitions } from './measurement-definitions';
import { DEMO_ACCOUNT } from '../lib/demo';
import { v4 as uuid } from 'uuid';

// ── Helpers ──────────────────────────────────────────────────────────────────

function dateAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function dateBetween(minDays: number, maxDays: number): string {
  const days = Math.floor(Math.random() * (maxDays - minDays)) + minDays;
  return dateAgo(days);
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickN<T>(arr: T[], n: number): T[] {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

/**
 * 首启随机初始密码 (#139)。前缀 A1 保证必然满足密码策略
 * (≥8 位且含字母和数字)，其余 14 位取自无易混淆字符表。
 */
function generateInitialAdminPassword(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let suffix = '';
  for (const b of bytes) suffix += alphabet[b % alphabet.length];
  return `A1${suffix}`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

/** 清库前把现有数据库文件备份到 data/backups/ (含 WAL/SHM, 防丢数据) */
function backupDatabase() {
  const dbPath = resolve(process.env.DATABASE_URL || './data/pacsviewer.db');
  if (!existsSync(dbPath)) return;
  const backupDir = resolve(dirname(dbPath), 'backups');
  mkdirSync(backupDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  for (const suffix of ['', '-wal', '-shm']) {
    const src = dbPath + suffix;
    if (existsSync(src)) {
      copyFileSync(src, join(backupDir, `${basename(dbPath)}-${stamp}${suffix}`));
    }
  }
  console.log(`💾 清库前已备份 → ${backupDir}/pacsviewer.db-${stamp}`);
}

async function seed() {
  console.log('🌱 Seeding database...\n');

  // 安全护栏: 已有业务数据时, 必须显式 --reset 才会清库重灌
  const forceReset = process.argv.includes('--reset') || process.argv.includes('--force');
  const existing = await db.select({ id: users.id }).from(users).limit(1);
  if (existing.length > 0 && !forceReset) {
    console.log('⚠️  数据库已有数据，跳过播种（防止误清真实数据）。');
    console.log('   如需清空并重新播种（会自动备份），运行: bun run db:seed -- --reset');
    return;
  }

  // 清库前自动备份
  backupDatabase();

  // Clear existing data (in reverse order of dependencies)
  console.log('🧹 Clearing existing data...');
  await db.delete(comparisons);
  await db.delete(layers);
  await db.delete(annotations);
  await db.delete(reportVersions);
  await db.delete(reports);
  await db.delete(reportTemplates);
  await db.delete(images);
  await db.delete(series);
  await db.delete(studies);
  await db.delete(systemSettings);
  await db.delete(patients);
  await db.delete(patientTags);
  await db.delete(deviceAdapters);
  await db.delete(devices);
  // 旧登录会话一并清掉: 否则 localStorage 里的旧 token 仍有效,
  // 重灌后用户会被"永久登录", 永远看不到登录页 (2026-08-15 排查发现)
  await db.delete(sessions);
  await db.delete(users);
  await db.delete(roles);
  console.log('✅ Existing data cleared\n');

  // ── 生产环境最小化播种 (#139) ───────────────────────────────────────────
  // 只建系统角色 + 初始管理员；演示账号、演示数据集一律不进入生产库。
  // 管理员密码首启随机生成（或 INITIAL_ADMIN_PASSWORD 指定），
  // 打印一次且必须首次登录时修改。
  if (process.env.NODE_ENV === 'production') {
    const adminRoleId = uuid();
    await db.insert(roles).values({
      id: adminRoleId,
      name: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: {
        patients: { create: true, read: true, update: true, delete: true },
        studies: { create: true, read: true, update: true, delete: true },
        reports: { create: true, read: true, update: true, delete: true, approve: true },
        users: { create: true, read: true, update: true, delete: true },
        settings: { read: true, update: true },
      },
      isSystem: true,
      createdAt: dateAgo(0),
    });

    const initialPassword = process.env.INITIAL_ADMIN_PASSWORD || generateInitialAdminPassword();
    if (process.env.INITIAL_ADMIN_PASSWORD) {
      console.log('🔑 使用 INITIAL_ADMIN_PASSWORD 环境变量设定的初始管理员密码。');
    } else {
      console.log('🔑 初始管理员账号: admin');
      console.log(`🔑 初始管理员密码: ${initialPassword}`);
      console.log('⚠️  密码仅此打印一次，请立即保存；首次登录时将被强制修改。');
    }

    await db.insert(users).values({
      id: uuid(),
      username: 'admin',
      email: 'admin@pacsviewer.com',
      passwordHash: Bun.password.hashSync(initialPassword),
      displayName: '系统管理员',
      roleId: adminRoleId,
      status: 'active',
      mustChangePassword: true,
      createdAt: dateAgo(0),
      updatedAt: dateAgo(0),
    });

    console.log('✅ Production seed complete (roles + admin only, no demo data)');
    return;
  }

  // ── 1. Roles ────────────────────────────────────────────────────────────────

  const adminRoleId = uuid();
  const doctorRoleId = uuid();
  const techRoleId = uuid();
  const viewerRoleId = uuid();

  await db.insert(roles).values([
    {
      id: adminRoleId,
      name: '管理员',
      description: '系统管理员，拥有所有权限',
      permissions: {
        patients: { create: true, read: true, update: true, delete: true },
        studies: { create: true, read: true, update: true, delete: true },
        reports: { create: true, read: true, update: true, delete: true, approve: true },
        users: { create: true, read: true, update: true, delete: true },
        settings: { read: true, update: true },
      },
      isSystem: true,
      createdAt: dateAgo(365),
    },
    {
      id: doctorRoleId,
      name: '医生',
      description: '眼科医生，可查看和编辑患者、检查、报告',
      permissions: {
        patients: { create: true, read: true, update: true, delete: false },
        studies: { create: true, read: true, update: true, delete: false },
        reports: { create: true, read: true, update: true, delete: false, approve: false },
        users: { create: false, read: true, update: false, delete: false },
        settings: { read: true, update: false },
      },
      isSystem: true,
      createdAt: dateAgo(365),
    },
    {
      id: techRoleId,
      name: '技师',
      description: '检查技师，可上传图像和管理检查',
      permissions: {
        patients: { create: false, read: true, update: false, delete: false },
        studies: { create: true, read: true, update: true, delete: false },
        reports: { create: false, read: true, update: false, delete: false },
        users: { create: false, read: false, update: false, delete: false },
        settings: { read: false, update: false },
      },
      isSystem: true,
      createdAt: dateAgo(365),
    },
    {
      id: viewerRoleId,
      name: '只读用户',
      description: '只能查看，不能编辑',
      permissions: {
        patients: { create: false, read: true, update: false, delete: false },
        studies: { create: false, read: true, update: false, delete: false },
        reports: { create: false, read: true, update: false, delete: false },
        users: { create: false, read: false, update: false, delete: false },
        settings: { read: false, update: false },
      },
      isSystem: true,
      createdAt: dateAgo(365),
    },
  ]);

  console.log('✅ Roles created (4)');

  // ── 2. Users ────────────────────────────────────────────────────────────────

  const userIds = {
    admin: uuid(),
    doctor1: uuid(),
    doctor2: uuid(),
    tech: uuid(),
    viewer: uuid(),
  };

  const hashPassword = (pw: string) => Bun.password.hashSync(pw);

  await db.insert(users).values([
    {
      id: userIds.admin,
      username: 'admin',
      email: 'admin@pacsviewer.com',
      // 开发便利: 默认 admin123 (可用 INITIAL_ADMIN_PASSWORD 覆盖);
      // 生产路径走上方最小化播种, 密码随机并强制首改 (#139)
      passwordHash: hashPassword(process.env.INITIAL_ADMIN_PASSWORD || 'admin123'),
      displayName: '系统管理员',
      roleId: adminRoleId,
      status: 'active',
      createdAt: dateAgo(365),
      updatedAt: dateAgo(365),
    },
    {
      id: userIds.doctor1,
      username: DEMO_ACCOUNT.username,
      email: 'zhang@pacsviewer.com',
      passwordHash: hashPassword(DEMO_ACCOUNT.password),
      displayName: '张明医生',
      roleId: doctorRoleId,
      status: 'active',
      createdAt: dateAgo(300),
      updatedAt: dateAgo(1),
    },
    {
      id: userIds.doctor2,
      username: 'doctor2',
      email: 'li@pacsviewer.com',
      passwordHash: hashPassword('doctor123'),
      displayName: '李华医生',
      roleId: doctorRoleId,
      status: 'active',
      createdAt: dateAgo(250),
      updatedAt: dateAgo(2),
    },
    {
      id: userIds.tech,
      username: 'tech',
      email: 'tech@pacsviewer.com',
      passwordHash: hashPassword('tech123'),
      displayName: '王技师',
      roleId: techRoleId,
      status: 'active',
      createdAt: dateAgo(200),
      updatedAt: dateAgo(5),
    },
    {
      id: userIds.viewer,
      username: 'viewer',
      email: 'viewer@pacsviewer.com',
      passwordHash: hashPassword('viewer123'),
      displayName: '实习生小刘',
      roleId: viewerRoleId,
      status: 'active',
      createdAt: dateAgo(30),
      updatedAt: dateAgo(30),
    },
  ]);

  const allDoctorIds = [userIds.doctor1, userIds.doctor2];
  console.log('✅ Users created (5)');

  // ── 3. Patient Tags ─────────────────────────────────────────────────────────

  const tagIds = {
    diabetic: uuid(),
    glaucoma: uuid(),
    myopia: uuid(),
    cataract: uuid(),
    amd: uuid(),
    emergency: uuid(),
  };

  await db.insert(patientTags).values([
    { id: tagIds.diabetic, name: '糖尿病视网膜病变', color: '#ef4444', description: 'DR 患者', createdAt: dateAgo(365) },
    { id: tagIds.glaucoma, name: '青光眼', color: '#f97316', description: '青光眼患者', createdAt: dateAgo(365) },
    { id: tagIds.myopia, name: '高度近视', color: '#3b82f6', description: '高度近视患者', createdAt: dateAgo(365) },
    { id: tagIds.cataract, name: '白内障', color: '#8b5cf6', description: '白内障患者', createdAt: dateAgo(365) },
    { id: tagIds.amd, name: '黄斑变性', color: '#ec4899', description: 'AMD 患者', createdAt: dateAgo(365) },
    { id: tagIds.emergency, name: '急诊', color: '#dc2626', description: '急诊患者', createdAt: dateAgo(365) },
  ]);

  console.log('✅ Patient tags created (6)');

  // ── 4. Patients ─────────────────────────────────────────────────────────────

  const patientData = [
    { name: '王建国', gender: 'male' as const, birthDate: '1958-03-15', phone: '13800138001', tags: [tagIds.cataract, tagIds.amd] },
    { name: '李秀英', gender: 'female' as const, birthDate: '1965-07-22', phone: '13800138002', tags: [tagIds.diabetic] },
    { name: '张伟', gender: 'male' as const, birthDate: '1980-11-08', phone: '13800138003', tags: [tagIds.myopia] },
    { name: '刘芳', gender: 'female' as const, birthDate: '1972-01-30', phone: '13800138004', tags: [tagIds.glaucoma] },
    { name: '陈强', gender: 'male' as const, birthDate: '1990-05-12', phone: '13800138005', tags: [tagIds.myopia] },
    { name: '赵敏', gender: 'female' as const, birthDate: '1955-09-18', phone: '13800138006', tags: [tagIds.amd, tagIds.cataract] },
    { name: '孙浩', gender: 'male' as const, birthDate: '1988-12-03', phone: '13800138007', tags: [] },
    { name: '周丽', gender: 'female' as const, birthDate: '1978-06-25', phone: '13800138008', tags: [tagIds.diabetic, tagIds.glaucoma] },
    { name: '吴涛', gender: 'male' as const, birthDate: '1962-04-10', phone: '13800138009', tags: [tagIds.cataract] },
    { name: '郑美玲', gender: 'female' as const, birthDate: '1995-08-14', phone: '13800138010', tags: [tagIds.myopia] },
    { name: '黄永明', gender: 'male' as const, birthDate: '1970-02-28', phone: '13800138011', tags: [tagIds.glaucoma] },
    { name: '林小红', gender: 'female' as const, birthDate: '1985-10-06', phone: '13800138012', tags: [] },
    { name: '何志远', gender: 'male' as const, birthDate: '1950-12-20', phone: '13800138013', tags: [tagIds.amd, tagIds.diabetic] },
    { name: '马晓燕', gender: 'female' as const, birthDate: '1975-03-08', phone: '13800138014', tags: [tagIds.cataract] },
    { name: '罗建华', gender: 'male' as const, birthDate: '1968-07-15', phone: '13800138015', tags: [tagIds.glaucoma, tagIds.myopia] },
    { name: '胡雪梅', gender: 'female' as const, birthDate: '1992-11-22', phone: '13800138016', tags: [] },
    { name: '高明辉', gender: 'male' as const, birthDate: '1956-01-05', phone: '13800138017', tags: [tagIds.amd] },
    { name: '梁静怡', gender: 'female' as const, birthDate: '1983-09-30', phone: '13800138018', tags: [tagIds.diabetic] },
    { name: '谢鹏飞', gender: 'male' as const, birthDate: '1976-05-18', phone: '13800138019', tags: [tagIds.cataract, tagIds.glaucoma] },
    { name: '韩雨萱', gender: 'female' as const, birthDate: '1998-04-12', phone: '13800138020', tags: [tagIds.myopia] },
  ];

  const patientIds: string[] = [];

  for (let i = 0; i < patientData.length; i++) {
    const p = patientData[i];
    const id = uuid();
    patientIds.push(id);
    const mrn = `MRN${String(20240001 + i)}`;
    const createdAt = dateBetween(180, 365);

    await db.insert(patients).values({
      id,
      mrn,
      name: p.name,
      gender: p.gender,
      birthDate: p.birthDate,
      phone: p.phone,
      email: `${p.name.toLowerCase().replace(/\s/g, '')}@example.com`,
      address: pick(['北京市朝阳区建国路88号', '上海市浦东新区陆家嘴环路100号', '广州市天河区体育西路120号', '深圳市南山区科技园南路66号', '杭州市西湖区文三路300号']),
      tags: p.tags,
      createdAt,
      updatedAt: createdAt,
    });
  }

  console.log(`✅ Patients created (${patientData.length})`);

  // ── 5. Device Adapters & Devices ────────────────────────────────────────────

  const adapterIds = { dicom: uuid(), rest: uuid() };

  await db.insert(deviceAdapters).values([
    {
      id: adapterIds.dicom,
      name: 'DICOM 收片网关',
      type: 'dicom',
      status: 'running',
      config: { aeTitle: 'PACSVIEWER', port: 11112, storePath: './data/dicom' },
      enabled: true,
      imageCount: 0,
      createdAt: dateAgo(300),
      updatedAt: dateAgo(1),
    },
    {
      id: adapterIds.rest,
      name: 'REST 上传接口',
      type: 'rest',
      status: 'running',
      config: { apiKey: 'demo-api-key-2024', maxFileSize: 100 * 1024 * 1024 },
      enabled: true,
      imageCount: 0,
      createdAt: dateAgo(200),
      updatedAt: dateAgo(5),
    },
  ]);

  const deviceIds = {
    oct: uuid(),
    fundus: uuid(),
    vf: uuid(),
    octa: uuid(),
  };

  await db.insert(devices).values([
    {
      id: deviceIds.oct,
      name: 'Cirrus HD-OCT 5000',
      type: 'oct',
      manufacturer: 'Carl Zeiss',
      model: 'Cirrus HD-OCT 5000',
      serialNumber: 'CZ-OCT-2021-001',
      adapterId: adapterIds.dicom,
      status: 'online',
      imageCount: 0,
      createdAt: dateAgo(300),
      updatedAt: dateAgo(1),
    },
    {
      id: deviceIds.fundus,
      name: 'VISUCAM 500',
      type: 'fundus_camera',
      manufacturer: 'Carl Zeiss',
      model: 'VISUCAM 500',
      serialNumber: 'CZ-FC-2021-002',
      adapterId: adapterIds.dicom,
      status: 'online',
      imageCount: 0,
      createdAt: dateAgo(300),
      updatedAt: dateAgo(2),
    },
    {
      id: deviceIds.vf,
      name: 'HFA3 860',
      type: 'vf',
      manufacturer: 'Carl Zeiss',
      model: 'Humphrey Field Analyzer 3',
      serialNumber: 'CZ-VF-2022-003',
      adapterId: null,
      status: 'offline',
      imageCount: 0,
      createdAt: dateAgo(200),
      updatedAt: dateAgo(30),
    },
    {
      id: deviceIds.octa,
      name: 'PLEX Elite 9000',
      type: 'octa',
      manufacturer: 'Carl Zeiss',
      model: 'PLEX Elite 9000',
      serialNumber: 'CZ-OCTA-2023-004',
      adapterId: adapterIds.dicom,
      status: 'online',
      imageCount: 0,
      createdAt: dateAgo(150),
      updatedAt: dateAgo(1),
    },
  ]);

  console.log('✅ Devices & adapters created');

  // ── 6. Report Templates ─────────────────────────────────────────────────────

  const templateIds = {
    oct: uuid(),
    fundus: uuid(),
    ffa: uuid(),
    vf: uuid(),
    octa: uuid(),
    comprehensive: uuid(),
  };

  await db.insert(reportTemplates).values([
    {
      id: templateIds.oct,
      name: 'OCT 检查报告',
      type: 'oct',
      description: '光学相干断层扫描标准报告模板',
      fields: [
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'macularThickness', label: '黄斑厚度 (μm)', type: 'number' },
        { key: 'rnflThickness', label: 'RNFL 厚度 (μm)', type: 'number' },
        { key: 'findings', label: '所见', type: 'textarea', required: true },
        { key: 'impression', label: '印象', type: 'textarea', required: true },
      ],
      layout: { columns: 2, sections: ['基本信息', '测量数据', '诊断'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(365),
      updatedAt: dateAgo(30),
    },
    {
      id: templateIds.fundus,
      name: '眼底彩照报告',
      type: 'fundus',
      description: '眼底彩色照相标准报告模板',
      fields: [
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'discAppearance', label: '视盘形态', type: 'select', options: ['正常', '苍白', '水肿', '凹陷扩大'] },
        { key: 'maculaAppearance', label: '黄斑区', type: 'select', options: ['正常', '出血', '渗出', '水肿', '新生血管'] },
        { key: 'vesselChanges', label: '血管改变', type: 'textarea' },
        { key: 'findings', label: '所见', type: 'textarea', required: true },
      ],
      layout: { columns: 1, sections: ['基本信息', '眼底所见', '诊断'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(365),
      updatedAt: dateAgo(30),
    },
    {
      id: templateIds.ffa,
      name: 'FFA 荧光素血管造影报告',
      type: 'ffa',
      description: '荧光素眼底血管造影标准报告模板',
      fields: [
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'armToRetinaTime', label: '臂-视网膜循环时间 (s)', type: 'number' },
        { key: 'findings', label: '造影所见', type: 'textarea', required: true },
        { key: 'leakage', label: '渗漏部位', type: 'textarea' },
      ],
      layout: { columns: 1, sections: ['基本信息', '造影数据', '诊断'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(365),
      updatedAt: dateAgo(30),
    },
    {
      id: templateIds.vf,
      name: '视野检查报告',
      type: 'vf',
      description: '标准自动视野检查报告模板',
      fields: [
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'md', label: 'MD (dB)', type: 'number' },
        { key: 'psd', label: 'PSD (dB)', type: 'number' },
        { key: 'vfi', label: 'VFI (%)', type: 'number' },
        { key: 'pattern', label: '缺损模式', type: 'select', options: ['弥漫性', '弓形', '鼻侧阶梯', '中心暗点', '正常'] },
        { key: 'reliability', label: '可靠性', type: 'textarea' },
      ],
      layout: { columns: 2, sections: ['基本信息', '视野指数', '诊断'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(365),
      updatedAt: dateAgo(30),
    },
    {
      id: templateIds.octa,
      name: 'OCTA 报告',
      type: 'octa',
      description: 'OCT 血管成像标准报告模板',
      fields: [
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'vesselDensity', label: '血管密度 (%)', type: 'number' },
        { key: 'findings', label: '所见', type: 'textarea', required: true },
        { key: 'neovascularization', label: '新生血管', type: 'select', options: ['无', '可疑', '明确'] },
      ],
      layout: { columns: 2, sections: ['基本信息', '血管分析', '诊断'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(200),
      updatedAt: dateAgo(30),
    },
    {
      id: templateIds.comprehensive,
      name: '综合眼科报告',
      type: 'comprehensive',
      description: '多模态综合检查报告模板',
      fields: [
        { key: 'chiefComplaint', label: '主诉', type: 'textarea', required: true },
        { key: 'presentIllness', label: '现病史', type: 'textarea' },
        { key: 'examination', label: '检查所见', type: 'textarea', required: true },
        { key: 'diagnosis', label: '诊断', type: 'text', required: true },
        { key: 'treatment', label: '治疗方案', type: 'textarea' },
        { key: 'followUp', label: '随访建议', type: 'textarea' },
      ],
      layout: { columns: 1, sections: ['病史', '检查', '诊断', '治疗'] },
      isSystem: true,
      createdBy: userIds.admin,
      createdAt: dateAgo(365),
      updatedAt: dateAgo(30),
    },
  ]);

  console.log('✅ Report templates created (6)');

  // ── 7. Studies, Series, Images ──────────────────────────────────────────────

  const modalities = ['OCT', 'fundus', 'FFA', 'ICGA', 'VF', 'OCTA'] as const;
  const bodyParts = ['OS', 'OD', 'OU'];
  const octDescriptions = ['黄斑区 OCT', '视盘 RNFL 分析', 'OCT 青光眼扫描', '黄斑水肿评估', '脉络膜厚度测量'];
  const fundusDescriptions = ['彩色眼底照相', '免散瞳眼底照相', '超广角眼底照相'];
  const ffaDescriptions = ['荧光素血管造影', 'FFA 动脉期', 'FFA 静脉期'];
  const vfDescriptions = ['Humphrey 24-2', 'Humphrey 10-2', 'Goldmann 视野'];
  const octaDescriptions = ['OCTA 黄斑', 'OCTA 视盘', 'OCTA 广角'];

  const modalityTemplates: Record<string, { descriptions: string[]; devices: string[] }> = {
    OCT: { descriptions: octDescriptions, devices: [deviceIds.oct] },
    fundus: { descriptions: fundusDescriptions, devices: [deviceIds.fundus] },
    FFA: { descriptions: ffaDescriptions, devices: [deviceIds.fundus] },
    ICGA: { descriptions: ['ICGA 吲哚菁绿造影'], devices: [deviceIds.fundus] },
    VF: { descriptions: vfDescriptions, devices: [deviceIds.vf] },
    OCTA: { descriptions: octaDescriptions, devices: [deviceIds.octa] },
  };

  const statusOptions = ['pending', 'in_progress', 'diagnosed', 'reported'] as const;
  const studyIds: string[] = [];
  let totalSeries = 0;
  let totalImages = 0;

  // Create ~2 studies per patient (40 total)
  for (const pid of patientIds) {
    const numStudies = Math.random() > 0.3 ? 2 : 1;
    for (let s = 0; s < numStudies; s++) {
      const modality = pick([...modalities]);
      const template = modalityTemplates[modality];
      const studyId = uuid();
      studyIds.push(studyId);
      const studyDate = dateBetween(1, 180);
      const status = pick([...statusOptions]);

      await db.insert(studies).values({
        id: studyId,
        patientId: pid,
        studyDate: studyDate.slice(0, 10),
        studyTime: `${String(8 + Math.floor(Math.random() * 10)).padStart(2, '0')}:${String(Math.floor(Math.random() * 60)).padStart(2, '0')}:00`,
        modality,
        device: pick(template.devices),
        physicianId: pick(allDoctorIds),
        status,
        description: pick(template.descriptions),
        createdAt: studyDate,
        updatedAt: studyDate,
      });

      // Create 1-3 series per study with placeholder images
      const numSeries = 1 + Math.floor(Math.random() * 3);
      for (let si = 0; si < numSeries; si++) {
        const seriesId = uuid();
        const numImages = 1 + Math.floor(Math.random() * 3); // 1-3 images per series

        await db.insert(series).values({
          id: seriesId,
          studyId,
          seriesNumber: si + 1,
          seriesDescription: `${modality} 序列 ${si + 1}`,
          modality,
          bodyPart: pick(bodyParts),
          imageCount: numImages,
          createdAt: studyDate,
        });
        totalSeries++;

        // Create image records pointing to placeholder
        // When DEV_FALLBACK_IMAGE is enabled, missing files will serve synthetic fundus images
        for (let ii = 0; ii < numImages; ii++) {
          const imageId = uuid();
          await db.insert(images).values({
            id: imageId,
            seriesId,
            instanceNumber: ii + 1,
            filePath: `${imageId}.png`,       // placeholder filename (file may not exist; fallback handles it)
            fileSize: 18387,                   // approximate size of default placeholder
            fileHash: `seed_placeholder_${imageId}`,
            format: 'png',
            width: 512,
            height: 512,
            bitsAllocated: 8,
            pixelSpacing: [0.04, 0.04], // 合成眼底图 512px ≈ 20mm 视野 (与 DEV_FALLBACK 转换一致)
            thumbnailPath: `${imageId}-thumb.jpeg`,
            createdAt: studyDate,
          });
          totalImages++;
        }
      }
    }
  }

  console.log(`✅ Studies (${studyIds.length}), Series (${totalSeries}), Images (${totalImages}) created`);

  // ── 7.5 Demo Family (wayfinder #111) ────────────────────────────────────────
  // 演示数据集：主角随访家族（5+ 次 OCT 随访，多帧 + 测量快照 + 报告 + 标注）
  // + 配角多模态（眼底彩照 / FFA 时序 / 视野）。
  // 约定：
  //  - 所有图像沿用既有 placeholder 标记（fileHash `seed_placeholder_*`、format png、
  //    512×512），DEV_FALLBACK 图片服务与 #110 标记一致。
  //  - studyDate/studyTime + createdAt 均为显式真实时间戳（趋势按日分桶正确）。
  //  - 新增患者/检查与既有 20 患者互不干扰，重复 seed 幂等（全表先清后建）。

  const DEMO_PHYSICIAN = userIds.doctor1;
  const demoStats = { patients: 0, studies: 0, series: 0, images: 0, frames: 0, points: 0, reports: 0 };

  // 创建单条 placeholder 图像记录（与第 7 节占位标记保持一致）
  const insertDemoImage = async (opts: {
    seriesId: string;
    instanceNumber: number;
    studyDate: string;
    numberOfFrames?: number;
    sopInstanceUid?: string;
  }) => {
    const imageId = uuid();
    await db.insert(images).values({
      id: imageId,
      seriesId: opts.seriesId,
      sopInstanceUid: opts.sopInstanceUid ?? null,
      instanceNumber: opts.instanceNumber,
      filePath: `${imageId}.png`,       // placeholder filename (DEV_FALLBACK 兜底)
      fileSize: 18387,
      fileHash: `seed_placeholder_${imageId}`,
      format: 'png',
      width: 512,
      height: 512,
      bitsAllocated: 8,
      pixelSpacing: [0.04, 0.04], // 合成眼底图 512px ≈ 20mm 视野 (与 DEV_FALLBACK 转换一致)
      numberOfFrames: opts.numberOfFrames ?? 1,
      thumbnailPath: `${imageId}-thumb.jpeg`,
      createdAt: `${opts.studyDate}T00:00:00.000Z`,
    });
    demoStats.images++;
    return imageId;
  };

  // 写一条测量快照（measurement_points，join measurement_definitions 供趋势图聚合）
  const insertDemoPoint = async (opts: {
    studyId: string;
    imageId: string | null;
    key: string;
    type: string;
    value: number;
    unit: string;
    capturedAt: string;
  }) => {
    await db.insert(measurementPoints).values({
      id: uuid(),
      studyId: opts.studyId,
      imageId: opts.imageId,
      measurementKey: opts.key,
      type: opts.type,
      value: opts.value,
      unit: opts.unit,
      calibrated: true,
      sourceAnnotationId: null,
      capturedAt: opts.capturedAt,
      createdAt: opts.capturedAt,
      updatedAt: opts.capturedAt,
    });
    demoStats.points++;
  };

  // ── 主角：周建国 — 左眼开角型青光眼，5 次 OCT 随访（2024-01 ~ 2025-03）─────
  // 趋势故事：RNFL/GCL/黄斑中心凹厚度进行性变薄（down=恶化），C/D 与眼压上升（up=恶化）。
  const protagonistId = uuid();
  await db.insert(patients).values({
    id: protagonistId,
    mrn: 'MRN20260001',
    name: '周建国',
    gender: 'male',
    birthDate: '1956-05-20',
    phone: '13800139001',
    email: 'zhoujianguo@example.com',
    address: '北京市海淀区中关村大街28号',
    tags: [tagIds.glaucoma],
    notes: '演示数据集-主角患者：左眼原发性开角型青光眼，5 次 OCT 随访，RNFL/GCL 进行性变薄，视野缺损进展',
    createdAt: '2024-01-15T09:30:00.000Z',
    updatedAt: '2024-01-15T09:30:00.000Z',
  });
  demoStats.patients++;

  // visits: [日期, 时间, 描述, 多帧帧数(0=单帧), 测量值] — 日期严格递增、间隔 3-4 个月
  const protagonistVisits = [
    { date: '2024-01-15', time: '09:30:00', desc: '黄斑区 OCT + RNFL 随访（基线）', frames: 0,  m: { rnfl: 92, gcl: 78, fovea: 262, cd: 0.46, iop: 21 } },
    { date: '2024-04-20', time: '10:05:00', desc: '黄斑区 OCT + RNFL 随访',          frames: 0,  m: { rnfl: 85, gcl: 72, fovea: 256, cd: 0.52, iop: 23 } },
    { date: '2024-08-02', time: '09:50:00', desc: '黄斑区 OCT 容积扫描 + RNFL',       frames: 12, m: { rnfl: 74, gcl: 65, fovea: 248, cd: 0.58, iop: 24 } },
    { date: '2024-12-10', time: '14:20:00', desc: '黄斑区 OCT 容积扫描 + RNFL',       frames: 12, m: { rnfl: 66, gcl: 58, fovea: 240, cd: 0.63, iop: 25 } },
    { date: '2025-03-05', time: '09:40:00', desc: '黄斑区 OCT 容积扫描 + RNFL（复诊）', frames: 24, m: { rnfl: 58, gcl: 52, fovea: 231, cd: 0.68, iop: 26 } },
  ];

  const protagonistStudyIds: string[] = [];
  let baselineOCTImageId: string | null = null; // 首访 B 扫描（对比视图基线）
  let lastOCTImageId: string | null = null;     // 末次 B 扫描（标注/对比视图末次）

  for (const v of protagonistVisits) {
    const studyId = uuid();
    protagonistStudyIds.push(studyId);
    const iso = `${v.date}T${v.time}.000Z`;
    const dateKey = v.date.replace(/-/g, '');
    const status = v.date === '2025-03-05' ? 'reported' : 'diagnosed';

    await db.insert(studies).values({
      id: studyId,
      patientId: protagonistId,
      studyInstanceUid: `1.2.826.0.1.3680043.10.111.1.${dateKey}`,
      accessionNumber: `ACC${dateKey}01`,
      studyDate: v.date,
      studyTime: v.time,
      modality: 'OCT',
      device: deviceIds.oct,
      physicianId: DEMO_PHYSICIAN,
      status,
      description: v.desc,
      createdAt: iso,
      updatedAt: iso,
    });
    demoStats.studies++;

    // 序列 1：黄斑区 B 扫描（V3 起为多帧容积扫描）
    const bscanSeriesId = uuid();
    await db.insert(series).values({
      id: bscanSeriesId, studyId, seriesNumber: 1,
      seriesDescription: '黄斑区 B 扫描', modality: 'OCT', bodyPart: 'OS',
      imageCount: 1, createdAt: iso,
    });
    demoStats.series++;
    const bscanImageId = await insertDemoImage({
      seriesId: bscanSeriesId, instanceNumber: 1, studyDate: v.date,
      numberOfFrames: v.frames > 0 ? v.frames : 1,
      sopInstanceUid: `1.2.826.0.1.3680043.10.111.2.${dateKey}.1`,
    });
    if (v.date === '2024-01-15') baselineOCTImageId = bscanImageId;
    lastOCTImageId = bscanImageId;

    // 多帧 B 扫描 → dicom_frames（CinePlayer / useOctNavigation 的帧元数据）
    if (v.frames > 0) {
      const frameRows: any[] = [];
      for (let fi = 0; fi < v.frames; fi++) {
        const slice = Number((-3 + (6 * fi) / (v.frames - 1)).toFixed(3)); // -3.0 ~ +3.0 mm
        frameRows.push({
          id: uuid(),
          imageId: bscanImageId,
          frameIndex: fi,
          frameType: 'ORIGINAL\\PRIMARY',
          instanceNumber: fi + 1,
          temporalPositionIdentifier: null,
          frameAcquisitionDateTime: null,
          sliceLocation: slice,
          imagePositionPatient: [0, 0, slice],
          imageOrientationPatient: [1, 0, 0, 0, 1, 0],
          metadata: null,
          createdAt: iso,
        });
      }
      await db.insert(dicomFrames).values(frameRows);
      demoStats.frames += frameRows.length;
    }

    // 序列 2：视盘 RNFL 环形扫描（单帧）
    const rnflSeriesId = uuid();
    await db.insert(series).values({
      id: rnflSeriesId, studyId, seriesNumber: 2,
      seriesDescription: '视盘 RNFL 环形扫描', modality: 'OCT', bodyPart: 'OS',
      imageCount: 1, createdAt: iso,
    });
    demoStats.series++;
    const rnflImageId = await insertDemoImage({
      seriesId: rnflSeriesId, instanceNumber: 1, studyDate: v.date,
      sopInstanceUid: `1.2.826.0.1.3680043.10.111.3.${dateKey}.1`,
    });

    // 本访测量快照（每 study 每 key 唯一，趋势图按 key + studyDate 聚合）
    const m = v.m;
    await insertDemoPoint({ studyId, imageId: rnflImageId, key: 'rnfl',  type: 'length',   value: m.rnfl,  unit: 'μm',    capturedAt: iso });
    await insertDemoPoint({ studyId, imageId: bscanImageId, key: 'fovea', type: 'length',   value: m.fovea, unit: 'μm',    capturedAt: iso });
    await insertDemoPoint({ studyId, imageId: bscanImageId, key: 'gcl',   type: 'length',   value: m.gcl,   unit: 'μm',    capturedAt: iso });
    await insertDemoPoint({ studyId, imageId: rnflImageId, key: 'cd',    type: 'probe',     value: m.cd,    unit: '',      capturedAt: iso });
    await insertDemoPoint({ studyId, imageId: rnflImageId, key: 'iop',   type: 'probe',     value: m.iop,   unit: 'mmHg',  capturedAt: iso });
  }

  // 报告：末次随访（V5）— 发布态 OCT 报告 + 版本历史
  const v5StudyId = protagonistStudyIds[protagonistStudyIds.length - 1];
  const reportId = uuid();
  const reportCreatedAt = '2025-03-06T11:00:00.000Z';
  const reportContent = {
    diagnosis: '双眼原发性开角型青光眼（左眼进展）',
    macularThickness: 231,
    rnflThickness: 58,
    findings: '左眼视盘周围 RNFL 平均厚度 58μm（较基线 92μm 下降 37%），上方及下方弓形纤维束明显变薄；黄斑中心凹厚度 231μm；C/D 比 0.68，视杯进行性扩大。',
    impression: '左眼开角型青光眼随访 14 个月，RNFL/GCL 进行性变薄，视野缺损进展，建议强化降眼压治疗并 3 个月后复查。',
  };
  await db.insert(reports).values({
    id: reportId,
    studyId: v5StudyId,
    patientId: protagonistId,
    templateId: templateIds.oct,
    title: '左眼 OCT 随访报告（2025-03-05）',
    content: reportContent,
    images: [],
    status: 'published',
    reviewerId: userIds.admin,
    reviewNotes: '审核通过，已发布',
    publishedAt: reportCreatedAt,
    createdBy: DEMO_PHYSICIAN,
    createdAt: reportCreatedAt,
    updatedAt: reportCreatedAt,
  });
  demoStats.reports++;
  await db.insert(reportVersions).values([
    { id: uuid(), reportId, version: 1, status: 'draft', content: { ...reportContent, impression: '初稿' }, changeNotes: '初稿创建', createdBy: DEMO_PHYSICIAN, createdAt: reportCreatedAt },
    { id: uuid(), reportId, version: 2, status: 'pending_review', content: reportContent, changeNotes: '提交审核', createdBy: DEMO_PHYSICIAN, createdAt: '2025-03-06T15:30:00.000Z' },
    { id: uuid(), reportId, version: 3, status: 'reviewed', content: reportContent, changeNotes: '审核通过', createdBy: userIds.admin, createdAt: '2025-03-07T09:00:00.000Z' },
  ]);

  // 预置测量标注（末次随访 B 扫描）：黄斑中心凹厚度测量 + 视盘箭头
  const demoLayerId = uuid();
  await db.insert(layers).values({
    id: demoLayerId,
    imageId: lastOCTImageId!,
    name: '随访测量标注',
    type: 'annotation',
    visible: true,
    opacity: 1,
    locked: false,
    sortOrder: 0,
    createdAt: '2025-03-05T10:00:00.000Z',
  });
  const demoAnnotationId = uuid();
  await db.insert(annotations).values({
    id: demoAnnotationId,
    imageId: lastOCTImageId,
    studyId: v5StudyId,
    userId: DEMO_PHYSICIAN,
    layerId: demoLayerId,
    type: 'measurement',
    geometry: { points: [{ x: 256, y: 256 }, { x: 258, y: 258 }] },
    style: { color: '#00e5a0', lineWidth: 2, fontSize: 14 },
    label: '黄斑中心凹厚度 231μm',
    notes: '随访测量标注（预置）',
    createdAt: '2025-03-05T10:00:00.000Z',
    updatedAt: '2025-03-05T10:00:00.000Z',
  });
  await db.insert(annotations).values({
    id: uuid(),
    imageId: lastOCTImageId,
    studyId: v5StudyId,
    userId: DEMO_PHYSICIAN,
    layerId: demoLayerId,
    type: 'arrow',
    geometry: { points: [{ x: 300, y: 200 }, { x: 330, y: 220 }] },
    style: { color: '#ffb020', lineWidth: 2, fontSize: 14 },
    label: '视盘边缘',
    notes: null,
    createdAt: '2025-03-05T10:00:00.000Z',
    updatedAt: '2025-03-05T10:00:00.000Z',
  });
  // 关联 fovea 快照来源标注（模拟「标注落库 → measurement_points」链路）
  await db.update(measurementPoints)
    .set({ sourceAnnotationId: demoAnnotationId })
    .where(and(eq(measurementPoints.studyId, v5StudyId), eq(measurementPoints.measurementKey, 'fovea')));

  // 对比视图：基线 vs 末次随访（OCT B 扫描）
  await db.insert(comparisons).values({
    id: uuid(),
    patientId: protagonistId,
    name: '左眼 OCT 基线 vs 末次随访',
    type: 'side_by_side',
    config: { layout: 'horizontal', syncScroll: true },
    imageIds: [baselineOCTImageId!, lastOCTImageId!],
    isFavorite: true,
    createdBy: DEMO_PHYSICIAN,
    createdAt: '2025-03-07T10:00:00.000Z',
    updatedAt: '2025-03-07T10:00:00.000Z',
  });
  console.log(`✅ Demo 主角「周建国」随访家族：5 次 OCT（含多帧 ${demoStats.frames} 帧）、测量 ${'5×5'} 项、报告 1、标注/对比就绪`);

  // ── 配角 1：钱美玉 — 眼底彩照（糖尿病视网膜病变）────────────────────────────
  const side1Id = uuid();
  await db.insert(patients).values({
    id: side1Id,
    mrn: 'MRN20260002',
    name: '钱美玉',
    gender: 'female',
    birthDate: '1959-11-03',
    phone: '13800139002',
    email: 'qianmeiyu@example.com',
    address: '上海市黄浦区南京东路100号',
    tags: [tagIds.diabetic],
    notes: '演示数据集-配角：糖尿病视网膜病变，眼底彩照（双眼）',
    createdAt: '2024-06-18T10:10:00.000Z',
    updatedAt: '2024-06-18T10:10:00.000Z',
  });
  demoStats.patients++;
  const s1StudyId = uuid();
  await db.insert(studies).values({
    id: s1StudyId, patientId: side1Id,
    studyInstanceUid: '1.2.826.0.1.3680043.10.111.4.20240618',
    accessionNumber: 'ACC2024061801',
    studyDate: '2024-06-18', studyTime: '10:10:00',
    modality: 'fundus', device: deviceIds.fundus,
    physicianId: userIds.doctor2,
    status: 'diagnosed', description: '彩色眼底照相（双眼）',
    createdAt: '2024-06-18T10:10:00.000Z', updatedAt: '2024-06-18T10:10:00.000Z',
  });
  demoStats.studies++;
  const s1SeriesId = uuid();
  await db.insert(series).values({
    id: s1SeriesId, studyId: s1StudyId, seriesNumber: 1,
    seriesDescription: '双眼彩色眼底照相', modality: 'fundus', bodyPart: 'OU',
    imageCount: 2, createdAt: '2024-06-18T10:10:00.000Z',
  });
  demoStats.series++;
  const s1Img1 = await insertDemoImage({ seriesId: s1SeriesId, instanceNumber: 1, studyDate: '2024-06-18', sopInstanceUid: '1.2.826.0.1.3680043.10.111.4.20240618.1' });
  const s1Img2 = await insertDemoImage({ seriesId: s1SeriesId, instanceNumber: 2, studyDate: '2024-06-18', sopInstanceUid: '1.2.826.0.1.3680043.10.111.4.20240618.2' });
  await insertDemoPoint({ studyId: s1StudyId, imageId: s1Img1, key: 'cd', type: 'probe', value: 0.35, unit: '', capturedAt: '2024-06-18T10:10:00.000Z' });
  await insertDemoPoint({ studyId: s1StudyId, imageId: s1Img1, key: 'iop', type: 'probe', value: 16, unit: 'mmHg', capturedAt: '2024-06-18T10:10:00.000Z' });
  console.log('✅ Demo 配角 1「钱美玉」：眼底彩照（2 图）');

  // ── 配角 2：冯志刚 — FFA 时序系列（多时间点，测 FfaTimeline）─────────────────
  const side2Id = uuid();
  await db.insert(patients).values({
    id: side2Id,
    mrn: 'MRN20260003',
    name: '冯志刚',
    gender: 'male',
    birthDate: '1968-07-25',
    phone: '13800139003',
    email: 'fengzhigang@example.com',
    address: '广州市天河区珠江新城华夏路16号',
    tags: [tagIds.diabetic],
    notes: '演示数据集-配角：增殖期糖尿病视网膜病变，FFA 时序造影（左眼）',
    createdAt: '2024-09-12T09:00:00.000Z',
    updatedAt: '2024-09-12T09:00:00.000Z',
  });
  demoStats.patients++;
  const s2StudyId = uuid();
  await db.insert(studies).values({
    id: s2StudyId, patientId: side2Id,
    studyInstanceUid: '1.2.826.0.1.3680043.10.111.5.20240912',
    accessionNumber: 'ACC2024091201',
    studyDate: '2024-09-12', studyTime: '09:00:00',
    modality: 'FFA', device: deviceIds.fundus,
    physicianId: userIds.doctor2,
    status: 'reported', description: 'FFA 荧光素血管造影（左眼）',
    createdAt: '2024-09-12T09:00:00.000Z', updatedAt: '2024-09-12T09:00:00.000Z',
  });
  demoStats.studies++;
  // 序列 1：彩色眼底对照
  const s2Series1Id = uuid();
  await db.insert(series).values({
    id: s2Series1Id, studyId: s2StudyId, seriesNumber: 1,
    seriesDescription: '彩色眼底对照', modality: 'fundus', bodyPart: 'OS',
    imageCount: 1, createdAt: '2024-09-12T09:00:00.000Z',
  });
  demoStats.series++;
  await insertDemoImage({ seriesId: s2Series1Id, instanceNumber: 1, studyDate: '2024-09-12', sopInstanceUid: '1.2.826.0.1.3680043.10.111.5.20240912.1' });
  // 序列 2：FFA 时序（6 帧：动脉期→动静脉期→静脉期→晚期）
  const s2Series2Id = uuid();
  await db.insert(series).values({
    id: s2Series2Id, studyId: s2StudyId, seriesNumber: 2,
    seriesDescription: 'FFA 时序（动脉期→静脉期→晚期）', modality: 'FFA', bodyPart: 'OS',
    imageCount: 1, createdAt: '2024-09-12T09:00:00.000Z',
  });
  demoStats.series++;
  const s2FfaImageId = await insertDemoImage({
    seriesId: s2Series2Id, instanceNumber: 1, studyDate: '2024-09-12',
    numberOfFrames: 6,
    sopInstanceUid: '1.2.826.0.1.3680043.10.111.5.20240912.2',
  });
  // FFA 帧：temporalPositionIdentifier + 帧采集时间（相位分桶）
  const ffaTimeline = [0, 12, 25, 45, 90, 300]; // 相对注射后秒数
  const ffaFrameRows = ffaTimeline.map((sec, fi) => ({
    id: uuid(),
    imageId: s2FfaImageId,
    frameIndex: fi,
    frameType: 'ORIGINAL\\PRIMARY',
    instanceNumber: fi + 1,
    temporalPositionIdentifier: fi + 1,
    frameAcquisitionDateTime: new Date(Date.parse('2024-09-12T09:00:00.000Z') + sec * 1000).toISOString(),
    sliceLocation: null,
    imagePositionPatient: null,
    imageOrientationPatient: null,
    metadata: null,
    createdAt: '2024-09-12T09:00:00.000Z',
  }));
  await db.insert(dicomFrames).values(ffaFrameRows as any);
  demoStats.frames += ffaFrameRows.length;
  console.log('✅ Demo 配角 2「冯志刚」：FFA 时序（6 帧，0s/12s/25s/45s/90s/300s）');

  // ── 配角 3：潘玉兰 — 视野（Humphrey 24-2，青光眼视野缺损）────────────────────
  const side3Id = uuid();
  await db.insert(patients).values({
    id: side3Id,
    mrn: 'MRN20260004',
    name: '潘玉兰',
    gender: 'female',
    birthDate: '1965-02-14',
    phone: '13800139004',
    email: 'panyulan@example.com',
    address: '杭州市西湖区文三路138号',
    tags: [tagIds.glaucoma],
    notes: '演示数据集-配角：原发性开角型青光眼，Humphrey 24-2 视野检查（左眼）',
    createdAt: '2024-10-08T15:30:00.000Z',
    updatedAt: '2024-10-08T15:30:00.000Z',
  });
  demoStats.patients++;
  const s3StudyId = uuid();
  await db.insert(studies).values({
    id: s3StudyId, patientId: side3Id,
    studyInstanceUid: '1.2.826.0.1.3680043.10.111.6.20241008',
    accessionNumber: 'ACC2024100801',
    studyDate: '2024-10-08', studyTime: '15:30:00',
    modality: 'VF', device: deviceIds.vf,
    physicianId: userIds.doctor1,
    status: 'diagnosed', description: 'Humphrey 24-2 视野检查（左眼）',
    createdAt: '2024-10-08T15:30:00.000Z', updatedAt: '2024-10-08T15:30:00.000Z',
  });
  demoStats.studies++;
  const s3SeriesId = uuid();
  await db.insert(series).values({
    id: s3SeriesId, studyId: s3StudyId, seriesNumber: 1,
    seriesDescription: '24-2 SITA-Standard', modality: 'VF', bodyPart: 'OS',
    imageCount: 2, createdAt: '2024-10-08T15:30:00.000Z',
  });
  demoStats.series++;
  const s3Img1 = await insertDemoImage({ seriesId: s3SeriesId, instanceNumber: 1, studyDate: '2024-10-08', sopInstanceUid: '1.2.826.0.1.3680043.10.111.6.20241008.1' });
  const s3Img2 = await insertDemoImage({ seriesId: s3SeriesId, instanceNumber: 2, studyDate: '2024-10-08', sopInstanceUid: '1.2.826.0.1.3680043.10.111.6.20241008.2' });
  await insertDemoPoint({ studyId: s3StudyId, imageId: s3Img1, key: 'md', type: 'probe', value: -6.8, unit: 'dB', capturedAt: '2024-10-08T15:30:00.000Z' });
  await insertDemoPoint({ studyId: s3StudyId, imageId: s3Img1, key: 'psd', type: 'probe', value: 5.2, unit: 'dB', capturedAt: '2024-10-08T15:30:00.000Z' });
  console.log('✅ Demo 配角 3「潘玉兰」：视野（MD -6.8dB / PSD 5.2dB）');
  console.log(`✅ Demo 家族合计：患者 ${demoStats.patients}、检查 ${demoStats.studies}、序列 ${demoStats.series}、图像 ${demoStats.images}、帧 ${demoStats.frames}、测量 ${demoStats.points}、报告 ${demoStats.reports}`);

  // ── 8. Reports & Versions ───────────────────────────────────────────────────

  const reportStatuses = ['draft', 'pending_review', 'reviewed', 'published'] as const;
  const reportIds: string[] = [];
  const reportsToCreate = Math.min(20, studyIds.length);
  const selectedStudyIds = pickN(studyIds, reportsToCreate);

  for (let i = 0; i < reportsToCreate; i++) {
    const studyId = selectedStudyIds[i];
    const status = pick([...reportStatuses]);
    const patientId = patientIds[i % patientIds.length];
    const templateId = pick(Object.values(templateIds));
    const reportId = uuid();
    reportIds.push(reportId);
    const createdBy = pick(allDoctorIds);
    const createdAt = dateBetween(1, 90);

    const content: Record<string, any> = {
      diagnosis: pick(['黄斑前膜', '糖尿病视网膜病变', '青光眼', '年龄相关性黄斑变性', '视网膜静脉阻塞', '中心性浆液性脉络膜视网膜病变']),
      findings: pick([
        '黄斑区可见前膜形成，视网膜表面皱褶，黄斑水肿',
        '视盘 C/D 比 0.7，RNFL 变薄，弓形缺损',
        '后极部可见微血管瘤、出血点、硬性渗出',
        '黄斑区脉络膜新生血管，视网膜下积液',
        '视网膜静脉迂曲扩张，火焰状出血',
      ]),
      impression: pick([
        '左眼黄斑前膜，建议手术治疗',
        '双眼开角型青光眼，视野缺损进展',
        '增殖期糖尿病视网膜病变，需全视网膜光凝',
        '湿性 AMD，建议抗 VEGF 治疗',
      ]),
    };

    await db.insert(reports).values({
      id: reportId,
      studyId,
      patientId,
      templateId,
      title: `检查报告 #${i + 1}`,
      content: content,
      images: [],
      status,
      reviewerId: status === 'reviewed' || status === 'published' ? userIds.admin : null,
      reviewNotes: status === 'published' ? '审核通过，已发布' : null,
      publishedAt: status === 'published' ? dateBetween(1, 30) : null,
      createdBy,
      createdAt,
      updatedAt: createdAt,
    });

    // Create versions for non-draft reports
    if (status !== 'draft') {
      await db.insert(reportVersions).values({
        id: uuid(),
        reportId,
        version: 1,
        status: 'draft',
        content: { ...content, impression: '初稿' },
        changeNotes: '初稿创建',
        createdBy,
        createdAt,
      });

      if (status === 'pending_review' || status === 'reviewed' || status === 'published') {
        await db.insert(reportVersions).values({
          id: uuid(),
          reportId,
          version: 2,
          status: 'pending_review',
          content: content,
          changeNotes: '提交审核',
          createdBy,
          createdAt: dateBetween(1, 30),
        });
      }

      if (status === 'reviewed' || status === 'published') {
        await db.insert(reportVersions).values({
          id: uuid(),
          reportId,
          version: 3,
          status: 'reviewed',
          content: content,
          changeNotes: '审核通过',
          createdBy: userIds.admin,
          createdAt: dateBetween(1, 15),
        });
      }
    }
  }

  console.log(`✅ Reports created (${reportsToCreate}) with versions`);

  // ── 9. Annotations & Layers ─────────────────────────────────────────────────

  // Get some image IDs to annotate
  const sampleImages = await db.query.images.findMany({ limit: 10 });
  const layerIds: string[] = [];

  for (const img of sampleImages.slice(0, 5)) {
    const layerId = uuid();
    layerIds.push(layerId);

    await db.insert(layers).values({
      id: layerId,
      imageId: img.id,
      name: '标注图层',
      type: 'annotation',
      visible: true,
      opacity: 1,
      locked: false,
      sortOrder: 0,
      createdAt: dateAgo(30),
    });

    // Add annotations to this image
    const annotationTypes = ['measurement', 'arrow', 'text', 'freehand', 'roi', 'highlight'] as const;

    for (let a = 0; a < 2; a++) {
      await db.insert(annotations).values({
        id: uuid(),
        imageId: img.id,
        studyId: null,
        userId: pick(allDoctorIds),
        layerId,
        type: pick([...annotationTypes]),
        geometry: {
          points: [
            { x: 100 + Math.random() * 300, y: 100 + Math.random() * 300 },
            { x: 200 + Math.random() * 300, y: 200 + Math.random() * 300 },
          ],
        },
        style: { color: '#ff0000', lineWidth: 2, fontSize: 14 },
        label: pick(['黄斑中心凹', '视盘边缘', '出血点', '渗出灶', '新生血管', null]),
        notes: pick(['需要随访观察', '建议进一步检查', '治疗后复查', null]),
        createdAt: dateAgo(Math.floor(Math.random() * 30)),
        updatedAt: dateAgo(Math.floor(Math.random() * 10)),
      });
    }
  }

  console.log('✅ Annotations & layers created');

  // ── 10. Comparisons ─────────────────────────────────────────────────────────

  if (patientIds.length > 0 && studyIds.length >= 2) {
    const compPatient = patientIds[0];
    const patientStudies = studyIds.slice(0, 2);

    await db.insert(comparisons).values([
      {
        id: uuid(),
        patientId: compPatient,
        name: 'OCT 前后对比',
        type: 'side_by_side',
        config: { layout: 'horizontal', syncScroll: true },
        imageIds: [],
        isFavorite: true,
        createdBy: userIds.doctor1,
        createdAt: dateAgo(14),
        updatedAt: dateAgo(7),
      },
      {
        id: uuid(),
        patientId: compPatient,
        name: '眼底彩照叠加分析',
        type: 'overlay',
        config: { opacity: 0.5, blendMode: 'difference' },
        imageIds: [],
        isFavorite: false,
        createdBy: userIds.doctor1,
        createdAt: dateAgo(7),
        updatedAt: dateAgo(3),
      },
      {
        id: uuid(),
        patientId: patientIds[1] || compPatient,
        name: 'FFA 时间序列',
        type: 'slider',
        config: { direction: 'horizontal' },
        imageIds: [],
        isFavorite: false,
        createdBy: userIds.doctor2,
        createdAt: dateAgo(5),
        updatedAt: dateAgo(2),
      },
    ]);
  }

  console.log('✅ Comparisons created');

  // ── 11. Measurement Dictionary (wayfinder #87 / T2) ─────────────────────────
  await ensurePresetDefinitions();
  console.log('✅ Measurement definitions ensured');

  // ── 12. System Settings ─────────────────────────────────────────────────────

  await db.insert(systemSettings).values([
    {
      id: uuid(),
      category: 'general',
      key: 'siteName',
      value: 'PACS Viewer 眼科影像管理系统',
      description: '系统名称',
      updatedAt: dateAgo(365),
    },
    {
      id: uuid(),
      category: 'general',
      key: 'language',
      value: 'zh-CN',
      description: '默认语言',
      updatedAt: dateAgo(365),
    },
    {
      id: uuid(),
      category: 'dicom',
      key: 'aeTitle',
      value: 'PACSVIEWER',
      description: 'DICOM AE Title',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'dicom',
      key: 'port',
      value: 11112,
      description: 'DICOM SCP 端口',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'dicom',
      key: 'storePath',
      value: './data/dicom',
      description: 'DICOM 文件存储路径',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'storage',
      key: 'maxFileSize',
      value: 100 * 1024 * 1024,
      description: '最大上传文件大小 (bytes)',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'storage',
      key: 'allowedFormats',
      value: ['dicom', 'jpeg', 'png', 'tiff', 'bmp'],
      description: '允许的图像格式',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'storage',
      key: 'thumbnailSize',
      value: { width: 256, height: 256 },
      description: '缩略图尺寸',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'auth',
      key: 'sessionTimeout',
      value: 86400,
      description: '会话超时时间 (秒)',
      updatedAt: dateAgo(300),
    },
    {
      id: uuid(),
      category: 'auth',
      key: 'maxLoginAttempts',
      value: 5,
      description: '最大登录尝试次数',
      updatedAt: dateAgo(300),
    },
  ]);

  console.log('✅ System settings created (10)');

  // ── Done ────────────────────────────────────────────────────────────────────

  console.log('\n🎉 Seed completed!\n');
  console.log('═══════════════════════════════════════════════════');
  console.log('  Default Accounts:');
  console.log('  ─────────────────────────────────────────────');
  console.log('  Admin:   admin   / admin123');
  console.log('  Doctor:  doctor  / doctor123  (张明医生)');
  console.log('  Doctor:  doctor2 / doctor123  (李华医生)');
  console.log('  Tech:    tech    / tech123    (王技师)');
  console.log('  Viewer:  viewer  / viewer123  (实习生小刘)');
  console.log('═══════════════════════════════════════════════════');
  console.log(`\n  Data Summary:`);
  console.log(`  ─────────────────────────────────────────────`);
  console.log(`  Patients:        ${patientData.length}`);
  console.log(`  Studies:         ${studyIds.length}`);
  console.log(`  Series:          ${totalSeries}`);
  console.log(`  Images:          ${totalImages} (placeholder, dev fallback active)`);
  console.log(`  Reports:         ${reportsToCreate}`);
  console.log(`  Templates:       6`);
  console.log(`  Devices:         4`);
  console.log(`  Annotations:     ${sampleImages.slice(0, 5).length * 2}`);
  console.log(`  Comparisons:     3`);
  console.log(`  Settings:        10`);
  console.log('═══════════════════════════════════════════════════');
  console.log('\n  Demo Family (wayfinder #111):');
  console.log('  ─────────────────────────────────────────────');
  console.log(`  主角 周建国 (MRN20260001)  青光眼 · 5× OCT 随访 2024-01~2025-03 · RNFL 92→58μm · C/D 0.46→0.68 · 多帧${demoStats.frames}帧 · 报告已发布`);
  console.log(`  配角 钱美玉 (MRN20260002)  眼底彩照 · 糖尿病视网膜病变`);
  console.log(`  配角 冯志刚 (MRN20260003)  FFA 时序 6 帧 · 增殖期糖尿病视网膜病变`);
  console.log(`  配角 潘玉兰 (MRN20260004)  视野 Humphrey 24-2 · MD -6.8dB / PSD 5.2dB`);
  console.log('═══════════════════════════════════════════════════\n');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
