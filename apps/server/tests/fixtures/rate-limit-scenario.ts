/**
 * Rate-limit scenario runner (#139) — 由 tests/auth-rate-limit.test.ts 以子进程运行。
 *
 * 独立进程保证 routes/auth.ts 在 import 时读到本场景的 RATE_LIMIT_* env
 * (bun test 单进程共享模块注册表, 直接 import 会拿到别的文件先设置的 env)。
 * 场景结果以 `RESULT key value` 行输出到 stdout。
 */
import { Hono } from 'hono';

process.env.DATABASE_URL = ':memory:';

const { db } = await import('../../src/db');
const { migrate } = await import('drizzle-orm/bun-sqlite/migrator');
await migrate(db, { migrationsFolder: new URL('../../drizzle', import.meta.url).pathname });

// 上限可由外部 env 控制, 缺省 3 (加速测试)
if (!process.env.RATE_LIMIT_MAX) process.env.RATE_LIMIT_MAX = '3';

const { AppError } = await import('../../src/lib/errors');
const authRouter = (await import('../../src/routes/auth')).default;

const app = new Hono();
app.onError((err, c) => {
  if (err instanceof AppError) {
    return c.json({ success: false, message: err.message, code: err.code }, err.statusCode as any);
  }
  return c.json({ success: false, message: '服务器错误' }, 500);
});
app.route('/api/auth', authRouter);

const { users, roles } = await import('../../src/db');
async function createUser(username: string, password = 'abcd1234'): Promise<void> {
  const roleId = crypto.randomUUID();
  await db.insert(roles).values({
    id: roleId,
    name: `角色_${roleId.slice(0, 8)}`,
    description: 'test',
    permissions: {},
    isSystem: false,
  });
  await db.insert(users).values({
    id: crypto.randomUUID(),
    username,
    email: `${username}@test.dev`,
    passwordHash: await Bun.password.hash(password),
    displayName: username,
    roleId,
    status: 'active',
  });
}

function loginReq(username: string, password: string, ip = '10.0.0.1') {
  return app.request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ username, password }),
  });
}

// ── 场景 ────────────────────────────────────────────────────────────────────

const MAX = Number(process.env.RATE_LIMIT_MAX);

await createUser('lockme');

// 1. MAX 次失败全部 401
for (let i = 0; i < MAX; i++) {
  const res = await loginReq('lockme', `wrongpass${i}`);
  console.log(`RESULT fail${i} ${res.status}`);
}
// 2. 锁定后正确密码也 429
console.log('RESULT lockedCorrect', (await loginReq('lockme', 'abcd1234')).status);
const lockedBody = await (await app.request('/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': '10.0.0.1' },
  body: JSON.stringify({ username: 'lockme', password: 'x' }),
})).json();
console.log('RESULT lockedMessage', lockedBody.message.includes('锁定') ? 'yes' : 'no');

// 3. 同 IP 换账号不受影响
await createUser('otheruser');
console.log('RESULT otherUserSameIpDiffKey', (await loginReq('otheruser', 'abcd1234', '10.0.0.1')).status);

// 4. 成功登录不计数: 连续成功不触发锁定
await createUser('happy');
let allOk = true;
for (let i = 0; i < MAX + 3; i++) {
  const res = await loginReq('happy', 'abcd1234', '10.0.0.3');
  if (res.status !== 200) allOk = false;
}
console.log('RESULT successesNotCounted', allOk ? 'yes' : 'no');

// 5. 登录失败写审计 (含未知用户名, userId 为 null)
await loginReq('audited', 'totally-wrong', '10.0.0.9');
await createUser('audited2');
await createUser('ghost-target'); // 占位避免用户名冲突判断混乱
await loginReq('ghost-user', 'whatever', '10.0.0.9');
await new Promise((r) => setTimeout(r, 50));
const rows = await db.query.auditLogs.findMany({});
const failures = rows.filter((r: any) => r.action === 'login_failed');
const usernames = failures.map((r: any) => r.details?.username);
const ghost = failures.find((r: any) => r.details?.username === 'ghost-user');
console.log('RESULT auditFailuresLogged', usernames.includes('audited') && usernames.includes('ghost-user') ? 'yes' : 'no');
console.log('RESULT auditNullUserIdForUnknownUser', ghost && ghost.userId === null ? 'yes' : 'no');
