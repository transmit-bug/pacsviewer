/**
 * Audit Log Retention - Scheduled cleanup of expired audit rows (#138).
 *
 * Interface:
 *   purgeExpiredAuditLogs(retentionMonths?) → number of deleted rows
 *   startAuditRetentionJob() → void (runs once at startup, then daily)
 *
 * Retention window comes from AUDIT_RETENTION_MONTHS (default 6, pilot ≥6mo).
 */

import { lt, sql } from 'drizzle-orm';
import { db, auditLogs } from '../db';

const DEFAULT_RETENTION_MONTHS = 6;
const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000; // daily

export function getRetentionMonths(): number {
  const parsed = Number(process.env.AUDIT_RETENTION_MONTHS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_RETENTION_MONTHS;
}

/**
 * Delete audit rows older than the retention window.
 * Returns the number of deleted rows.
 */
export async function purgeExpiredAuditLogs(
  retentionMonths: number = getRetentionMonths(),
): Promise<number> {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - retentionMonths);

  // Count first (bun-sqlite delete driver result is untyped), then delete.
  const countRows = await db
    .select({ count: sql<number>`count(*)` })
    .from(auditLogs)
    .where(lt(auditLogs.createdAt, cutoff.toISOString()));
  const deleted = Number(countRows[0]?.count ?? 0);

  if (deleted > 0) {
    await db.delete(auditLogs).where(lt(auditLogs.createdAt, cutoff.toISOString()));
    console.log(
      `[AuditRetention] Purged ${deleted} audit rows older than ${retentionMonths} months (cutoff ${cutoff.toISOString()})`,
    );
  }
  return deleted;
}

/**
 * Run the retention purge at startup and then on a daily interval.
 * The timer is unref'd so it does not keep the process alive.
 */
export function startAuditRetentionJob(): void {
  const months = getRetentionMonths();
  console.log(`[AuditRetention] Starting audit retention job (${months} months)`);

  purgeExpiredAuditLogs(months).catch((err) => {
    console.error('[AuditRetention] Startup purge failed:', err);
  });

  const timer = setInterval(() => {
    purgeExpiredAuditLogs(months).catch((err) => {
      console.error('[AuditRetention] Scheduled purge failed:', err);
    });
  }, RUN_INTERVAL_MS);
  timer.unref?.();
}
