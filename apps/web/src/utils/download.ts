/**
 * Browser download helpers (wayfinder #130).
 *
 * All exports in this repo are browser-download only — no server-side archive
 * (research/export-path.md §3). Shared by the measurements CSV export and any
 * future blob downloads.
 */

/** Trigger a browser download for a Blob (e.g. server-generated CSV). */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Default measurements CSV filename, e.g. measurements-2026-08-15.csv */
export function measurementsCsvFilename(date: Date = new Date()): string {
  return `measurements-${date.toISOString().slice(0, 10)}.csv`;
}
