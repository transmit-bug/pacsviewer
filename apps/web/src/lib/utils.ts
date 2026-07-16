import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString('zh-CN');
}

export function formatDateTime(date: string | Date): string {
  return new Date(date).toLocaleString('zh-CN');
}

/**
 * Safely parse a JSON value that might be a string or already parsed.
 * Useful for Drizzle ORM's { mode: 'json' } fields that may not auto-parse.
 */
export function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value as T;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return fallback;
}

/**
 * Safely parse a JSON array field.
 * Returns the array if already parsed, or parses the JSON string.
 */
export function safeJsonArray<T = string>(value: unknown): T[] {
  return safeJsonParse<T[]>(value, []);
}
