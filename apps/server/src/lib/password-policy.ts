/**
 * Password policy (#139) — 单一事实来源。
 *
 * 规则: 最少 8 位且必须同时包含字母和数字 (1.0 不做 LDAP/AD 对接, 本地策略)。
 * 创建用户、管理员重置密码、用户自行改密共用同一校验。
 */

import { z } from 'zod';
import { ValidationError } from './errors';

export const passwordPolicySchema = z
  .string()
  .min(8, '密码至少需要 8 个字符')
  .regex(/[A-Za-z]/, '密码必须包含至少一个字母')
  .regex(/[0-9]/, '密码必须包含至少一个数字');

/** 校验密码是否符合策略, 不符合时抛出带具体原因的 ValidationError */
export function validatePasswordPolicy(password: unknown): string {
  const result = passwordPolicySchema.safeParse(password);
  if (!result.success) {
    throw new ValidationError(result.error.issues[0]?.message ?? '密码不符合安全策略');
  }
  return result.data;
}
