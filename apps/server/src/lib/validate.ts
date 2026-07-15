/**
 * Zod validation middleware for Hono.
 */

import type { Context, Next } from 'hono';
import { type ZodSchema, ZodError } from 'zod';
import { ValidationError } from './errors';

/**
 * Validate request body against a Zod schema.
 * Attaches validated data to context as 'validated'.
 */
export function validate(schema: ZodSchema) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const result = schema.safeParse(body);

      if (!result.success) {
        throw new ValidationError('参数错误', result.error.errors);
      }

      c.set('validated', result.data);
      await next();
    } catch (err) {
      if (err instanceof ValidationError) throw err;
      throw new ValidationError('请求体格式错误');
    }
  };
}
