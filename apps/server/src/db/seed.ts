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
import {
  roles, users, patients, patientTags,
  studies, series, images,
  reportTemplates, reports, reportVersions,
  annotations, layers,
  devices, deviceAdapters,
  comparisons, systemSettings,
} from './schema';
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

// ── Main ─────────────────────────────────────────────────────────────────────

async function seed() {
  console.log('🌱 Seeding database...\n');

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
  await db.delete(users);
  await db.delete(roles);
  console.log('✅ Existing data cleared\n');

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
      passwordHash: hashPassword('admin123'),
      displayName: '系统管理员',
      roleId: adminRoleId,
      status: 'active',
      createdAt: dateAgo(365),
      updatedAt: dateAgo(365),
    },
    {
      id: userIds.doctor1,
      username: 'doctor',
      email: 'zhang@pacsviewer.com',
      passwordHash: hashPassword('doctor123'),
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
            thumbnailPath: `${imageId}-thumb.jpeg`,
            createdAt: studyDate,
          });
          totalImages++;
        }
      }
    }
  }

  console.log(`✅ Studies (${studyIds.length}), Series (${totalSeries}), Images (${totalImages}) created`);

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

  // ── 11. System Settings ─────────────────────────────────────────────────────

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
  console.log('═══════════════════════════════════════════════════\n');
}

seed().catch((err) => {
  console.error('❌ Seed failed:', err);
  process.exit(1);
});
