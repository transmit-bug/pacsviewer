/**
 * Password policy unit tests (#139): ≥8 位且必须包含字母和数字。
 */

import { describe, test, expect } from 'bun:test';
import { passwordPolicySchema, validatePasswordPolicy } from '../password-policy';
import { ValidationError } from '../errors';

describe('passwordPolicySchema', () => {
  test.each([
    'abcd1234',       // 字母+数字, 8 位
    'Abcd1234',       // 大小写混合
    'a1b2c3d4e5f6',   // 长密码
    '12345678a',      // 数字为主但含字母
    'abcdefgh1',      // 字母为主但含数字
  ])('接受合规密码 %s', (pw) => {
    expect(passwordPolicySchema.safeParse(pw).success).toBe(true);
  });

  test.each([
    '',               // 空
    'A1b',            // 太短
    'abcdefgh',       // 无数字
    '12345678',       // 无字母
    '!!!!@@@@',       // 无字母无数字
    'abc123',         // <8 位
  ])('拒绝不合规密码 %j', (pw) => {
    expect(passwordPolicySchema.safeParse(pw).success).toBe(false);
  });
});

describe('validatePasswordPolicy', () => {
  test('合规密码原样返回', () => {
    expect(validatePasswordPolicy('abcd1234')).toBe('abcd1234');
  });

  test('不合规抛 ValidationError 且消息说明原因', () => {
    try {
      validatePasswordPolicy('abcdefgh');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as ValidationError).message).toContain('数字');
    }
  });

  test('非字符串输入同样被拒绝', () => {
    expect(() => validatePasswordPolicy(undefined)).toThrow(ValidationError);
    expect(() => validatePasswordPolicy(null)).toThrow(ValidationError);
    expect(() => validatePasswordPolicy(12345678)).toThrow(ValidationError);
  });
});
