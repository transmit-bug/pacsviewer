/**
 * Regression test: refresh() 对孤儿会话 (用户已被删除但 session 残留)
 * 必须抛 UnauthorizedError —— 否则前端"刷新成功 → 重试仍 401 → 永不跳登录页"
 * 死循环: 控制台刷 401、主界面空数据、不跳转登录 (2026-08-15 排查).
 *
 * 场景来源: db:seed 删 users 但(修复前)不删 sessions, localStorage 里
 * 旧 token 指向已删除用户 → 所有 API 401 → refresh "成功" 但重试仍失败.
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';

// ── 独立临时库: 在 import db 模块前设置 DATABASE_URL ──────────────────────
// db/index.ts 在模块加载时读取 DATABASE_URL; bun test 按文件隔离进程,
// 本文件先设环境变量再动态 import, refresh() 将绑定临时库, 不碰开发数据。

const TEMP_DB = join(tmpdir(), `pacsviewer-auth-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = TEMP_DB;

const { db } = await import('../../db');
const { refresh, authenticate } = await import('../auth');
const { UnauthorizedError } = await import('../errors');
const { users, sessions } = await import('../../db/schema');

const MIGRATIONS = resolve(import.meta.dir, '../../../drizzle');

// 应用 schema
migrate(db, { migrationsFolder: MIGRATIONS });

const USER_ID = 'u-normal-1';
const ORPHAN_USER_ID = 'u-deleted-1'; // users 表中不存在 = 用户已被删

const future = () => new Date(Date.now() + 24 * 3600_000).toISOString();

function seed() {
  db.insert(users).values({
    id: USER_ID,
    username: 'normal-user',
    email: 'normal@test.dev',
    passwordHash: 'x',
    displayName: '正常用户',
    roleId: null,
  }).run();
  // 正常会话
  db.insert(sessions).values({
    id: 's-normal-1', userId: USER_ID,
    token: 'tok-normal', refreshToken: 'ref-normal',
    expiresAt: future(), absoluteExpiresAt: future(),
  }).run();
  // 孤儿会话: userId 不存在
  db.insert(sessions).values({
    id: 's-orphan-1', userId: ORPHAN_USER_ID,
    token: 'tok-orphan', refreshToken: 'ref-orphan',
    expiresAt: future(), absoluteExpiresAt: future(),
  }).run();
}

afterAll(() => {
  rmSync(TEMP_DB, { force: true });
  const wal = TEMP_DB + '-wal';
  const shm = TEMP_DB + '-shm';
  rmSync(wal, { force: true });
  rmSync(shm, { force: true });
});

describe('auth refresh with orphan session', () => {
  test('孤儿 token 无法通过 authenticate (用户已删除)', async () => {
    seed();
    expect(await authenticate('tok-orphan')).toBeNull();
    expect(await authenticate('tok-normal')).not.toBeNull();
  });

  test('🔴 孤儿 refreshToken 必须被拒绝 (refresh 抛 UnauthorizedError)', async () => {
    // 回归断言: 用户已删除的会话, 刷新必须失败。
    // 修复前: refresh() 不查用户存在性 → 返回新 token (bug)。
    let threw = false;
    try {
      await refresh('ref-orphan');
    } catch (e) {
      threw = true;
      expect(e).toBeInstanceOf(UnauthorizedError);
    }
    expect(threw).toBe(true);
  });

  test('正常会话仍可刷新 (不受修复影响)', async () => {
    const result = await refresh('ref-normal');
    expect(result.token).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // 刷新轮换后, 旧 refreshToken 应失效
    await expect(refresh('ref-normal')).rejects.toThrow();
  });
});
