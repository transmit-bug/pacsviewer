/**
 * Session duration policy tests (#139):
 *   - 空闲超时 (expiresAt, 滑动) 与绝对上限 (absoluteExpiresAt, 固定) 双重过期
 *   - authenticate 成功后顺延空闲时间
 *   - refresh 轮换 token 顺延空闲时间但不重置绝对上限
 *
 * 独立临时库: 在 import db 模块前设置 DATABASE_URL (同 auth-refresh.test.ts)。
 */
import { describe, test, expect, afterAll } from 'bun:test';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { rmSync } from 'node:fs';
import { eq } from 'drizzle-orm';

const TEMP_DB = join(tmpdir(), `pacsviewer-session-test-${process.pid}-${Date.now()}.db`);
process.env.DATABASE_URL = TEMP_DB;

const { db } = await import('../../db');
const { login, authenticate, refresh } = await import('../auth');
const { users, sessions, roles } = await import('../../db/schema');

const MIGRATIONS = resolve(import.meta.dir, '../../../drizzle');
migrate(db, { migrationsFolder: MIGRATIONS });

// ── 测试用户 ────────────────────────────────────────────────────────────────

async function makeUser(username: string, mustChangePassword = false): Promise<string> {
  const roleId = crypto.randomUUID();
  await db.insert(roles).values({
    id: roleId,
    name: `角色_${roleId.slice(0, 8)}`,
    description: 'test',
    permissions: {},
    isSystem: false,
  }).run();
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    username,
    email: `${username}@test.dev`,
    passwordHash: await Bun.password.hash('abcd1234'),
    displayName: username,
    roleId,
    status: 'active',
    mustChangePassword,
  }).run();
  return id;
}

async function getSessionByToken(token: string) {
  return await db.query.sessions.findFirst({ where: eq(sessions.token, token) });
}

afterAll(() => {
  rmSync(TEMP_DB, { force: true });
  rmSync(`${TEMP_DB}-wal`, { force: true });
  rmSync(`${TEMP_DB}-shm`, { force: true });
});

describe('login session creation', () => {
  test('会话同时写入空闲过期与绝对上限', async () => {
    await makeUser('creator');
    const before = Date.now();
    const result = await login('creator', 'abcd1234');
    expect(result.mustChangePassword).toBe(false);

    const s = await getSessionByToken(result.token)!;
    expect(s).toBeTruthy();
    // 默认策略: 空闲 30min / 绝对 12h
    expect(Date.parse(s!.expiresAt)).toBeGreaterThan(before + 29 * 60_000);
    expect(Date.parse(s!.expiresAt)).toBeLessThanOrEqual(before + 31 * 60_000);
    expect(Date.parse(s!.absoluteExpiresAt)).toBeGreaterThan(before + 12 * 3600_000 - 60_000);
    expect(Date.parse(s!.absoluteExpiresAt)).toBeLessThanOrEqual(before + 12 * 3600_000 + 1000);
  });

  test('登录响应携带 mustChangePassword 标记', async () => {
    await makeUser('forced', true);
    const result = await login('forced', 'abcd1234');
    expect(result.mustChangePassword).toBe(true);
  });
});

describe('authenticate sliding idle window', () => {
  test('成功认证顺延空闲过期时间, 绝对上限不动', async () => {
    await makeUser('slider');
    const result = await login('slider', 'abcd1234');
    const before = await getSessionByToken(result.token)!;
    const absolute = before!.absoluteExpiresAt;

    // 把空闲过期拨到 5 分钟后 → 认证应把它推回 ~30 分钟
    const manualTarget = new Date(Date.now() + 5 * 60_000).toISOString();
    db.update(sessions)
      .set({ expiresAt: manualTarget })
      .where(eq(sessions.id, before!.id))
      .run();

    const user = await authenticate(result.token);
    expect(user).not.toBeNull();

    const after = await getSessionByToken(result.token)!;
    // 顺延语义: 不再是手动设置的 +5min, 而是被推回到 ~+30min
    // (不直接比较 before/after 字符串 —— 两者可能落在同一毫秒)
    expect(after!.expiresAt).not.toBe(manualTarget);
    expect(Date.parse(after!.expiresAt)).toBeGreaterThan(Date.now() + 25 * 60_000);
    expect(after!.absoluteExpiresAt).toBe(absolute);
  });

  test('空闲超时后会话失效', async () => {
    await makeUser('idler');
    const result = await login('idler', 'abcd1234');
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.token, result.token))
      .run();
    expect(await authenticate(result.token)).toBeNull();
  });

  test('超过绝对上限后会话失效 (即使空闲窗口未过)', async () => {
    await makeUser('absoluter');
    const result = await login('absoluter', 'abcd1234');
    db.update(sessions)
      .set({
        expiresAt: new Date(Date.now() + 20 * 60_000).toISOString(), // 空闲窗口仍有效
        absoluteExpiresAt: new Date(Date.now() - 1000).toISOString(), // 绝对上限已过
      })
      .where(eq(sessions.token, result.token))
      .run();
    expect(await authenticate(result.token)).toBeNull();
  });
});

describe('refresh does not reset the absolute cap', () => {
  test('轮换 token 并顺延空闲时间, 但绝对上限保持原值', async () => {
    await makeUser('rotator');
    const result = await login('rotator', 'abcd1234');
    const before = await getSessionByToken(result.token)!;

    // 把空闲过期拨到临界值, 刷新后应顺延
    db.update(sessions)
      .set({ expiresAt: new Date(Date.now() + 60_000).toISOString() })
      .where(eq(sessions.id, before!.id))
      .run();

    const tokens = await refresh(result.refreshToken);
    expect(tokens.token).not.toBe(result.token);
    expect(tokens.refreshToken).not.toBe(result.refreshToken);

    const after = (await db.query.sessions.findFirst({ where: eq(sessions.token, tokens.token) }))!;
    expect(after!.id).toBe(before!.id);                       // 同一会话行
    expect(after!.absoluteExpiresAt).toBe(before!.absoluteExpiresAt); // 关键断言: 不重置绝对上限
    expect(Date.parse(after!.expiresAt)).toBeGreaterThan(Date.now() + 25 * 60_000); // 空闲已顺延

    // 旧 refreshToken 已失效
    await expect(refresh(result.refreshToken)).rejects.toThrow();
  });

  test('绝对上限已过的会话无法刷新', async () => {
    await makeUser('capped');
    const result = await login('capped', 'abcd1234');
    db.update(sessions)
      .set({ absoluteExpiresAt: new Date(Date.now() - 1000).toISOString() })
      .where(eq(sessions.token, result.token))
      .run();
    let threw = false;
    try {
      await refresh(result.refreshToken);
    } catch (e) {
      threw = true;
      expect((e as Error).message).toContain('过期');
    }
    expect(threw).toBe(true);
  });
});
