import { db, roles, users } from '../db';
import { v4 as uuid } from 'uuid';

async function seed() {
  console.log('🌱 Seeding database...');

  // Create default roles
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
      createdAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
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
      createdAt: new Date().toISOString(),
    },
  ]);

  console.log('✅ Roles created');

  // Create admin user
  const adminPassword = await Bun.password.hash('admin123');
  await db.insert(users).values({
    id: uuid(),
    username: 'admin',
    email: 'admin@pacsviewer.com',
    passwordHash: adminPassword,
    displayName: '系统管理员',
    roleId: adminRoleId,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  // Create demo doctor
  const doctorPassword = await Bun.password.hash('doctor123');
  await db.insert(users).values({
    id: uuid(),
    username: 'doctor',
    email: 'doctor@pacsviewer.com',
    passwordHash: doctorPassword,
    displayName: '张医生',
    roleId: doctorRoleId,
    status: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });

  console.log('✅ Users created');
  console.log('🎉 Seed completed!');
  console.log('');
  console.log('Default accounts:');
  console.log('  Admin: admin / admin123');
  console.log('  Doctor: doctor / doctor123');
}

seed().catch(console.error);
