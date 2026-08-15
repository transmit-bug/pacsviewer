/**
 * Demo account — 演示模式专用账号 (单一事实来源)。
 *
 * - seed.ts 用它创建演示账号 (doctor, 演示主角的主治医生);
 * - routes/auth.ts 的 POST /api/auth/demo-login 用它做一键演示登录。
 *
 * 不要在前端 bundle 里重复这些凭据 —— 演示登录由服务端完成,
 * 前端只调用 /api/auth/demo-login, 无需知晓账号密码。
 */
export const DEMO_ACCOUNT = {
  username: 'doctor',
  password: 'doctor123',
} as const;
