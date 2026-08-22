/**
 * Auth rate limiting integration tests (#139).
 *
 * 场景在独立子进程中运行 (tests/fixtures/rate-limit-scenario.ts):
 * bun test 所有文件共享同一模块注册表, routes/auth 的限流配置在首次 import 时
 * 固化 —— 子进程保证 RATE_LIMIT_* env 生效。
 */
import { describe, test, expect } from 'bun:test';

function runScenario(extraEnv: Record<string, string> = {}): string {
  const proc = Bun.spawnSync(['bun', 'run', `${import.meta.dir}/fixtures/rate-limit-scenario.ts`], {
    cwd: import.meta.dir,
    env: { ...process.env, ...extraEnv },
  });
  return proc.stdout.toString() + proc.stderr.toString();
}

function resultOf(output: string, key: string): string {
  const m = output.match(new RegExp(`RESULT ${key} (\\S+)`));
  if (!m) throw new Error(`scenario output missing RESULT ${key}:\n${output}`);
  return m[1];
}

describe('login rate limiting (#139)', () => {
  const output = runScenario({ RATE_LIMIT_MAX: '3', RATE_LIMIT_WINDOW_MINUTES: '15' });

  test(`失败达到上限后锁定: 即使密码正确也返回 429`, () => {
    expect(resultOf(output, 'fail0')).toBe('401');
    expect(resultOf(output, 'fail1')).toBe('401');
    expect(resultOf(output, 'fail2')).toBe('401');
    expect(resultOf(output, 'lockedCorrect')).toBe('429');
  });

  test('锁定响应提示锁定信息', () => {
    expect(resultOf(output, 'lockedMessage')).toBe('yes');
  });

  test('键含用户名: 同 IP 换账号不受影响', () => {
    expect(resultOf(output, 'otherUserSameIpDiffKey')).toBe('200');
  });

  test('成功登录不计数: 连续成功不会触发锁定', () => {
    expect(resultOf(output, 'successesNotCounted')).toBe('yes');
  });

  test('登录失败写审计日志 (含未知用户名 → userId 为 null)', () => {
    expect(resultOf(output, 'auditFailuresLogged')).toBe('yes');
    expect(resultOf(output, 'auditNullUserIdForUnknownUser')).toBe('yes');
  });
});

describe('demo-login gating (#139)', () => {
  test('生产模式 (NODE_ENV=production) 不注册 demo-login 路由', () => {
    const script = `
      process.env.NODE_ENV = 'production';
      process.env.DATABASE_URL = ':memory:';
      const { default: app } = await import('${import.meta.dir}/../src/routes/auth.ts');
      const res = await app.request('/demo-login', { method: 'POST', body: '{}' });
      console.log('STATUS:' + res.status);
    `;
    const proc = Bun.spawnSync(['bun', '-e', script], { cwd: import.meta.dir });
    expect(proc.stdout.toString()).toContain('STATUS:404');
  });

  test('开发模式 (NODE_ENV=development) demo-login 路由存在 (非 404)', () => {
    const script = `
      process.env.NODE_ENV = 'development';
      process.env.DATABASE_URL = ':memory:';
      const { default: app } = await import('${import.meta.dir}/../src/routes/auth.ts');
      const res = await app.request('/demo-login', { method: 'POST', body: '{}' });
      console.log('STATUS:' + res.status);
    `;
    const proc = Bun.spawnSync(['bun', '-e', script], { cwd: import.meta.dir });
    const status = Number(proc.stdout.toString().match(/STATUS:(\d+)/)?.[1]);
    // 演示账号未播种时会失败 (401/500), 但路由本身必须存在 —— 不能是 404
    expect(status).not.toBe(404);
  });
});
