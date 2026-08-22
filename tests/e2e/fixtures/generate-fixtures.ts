/**
 * Synthetic fixture generator for the E2E gate (#141).
 *
 * Produces (into tests/e2e/.fixtures/, gitignored):
 *   - e2e-a.jpg / e2e-b.jpg / e2e-c.jpg : small generated JPEGs (sharp)
 *   - sample.dcm                        : a minimal single-frame DICOM built
 *     by REUSING the repo's own image→DICOM converter service
 *     (apps/server/src/services/image-to-dicom.ts), exactly like production
 *     uploads go through.
 *
 * All data is synthetic — real patient data never enters CI (#141 decision).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
// Reuse the repo's image-to-dicom service directly (Bun resolves workspace deps).
import { convertImageToDicom } from '../../../apps/server/src/services/image-to-dicom';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, '..', '.fixtures');
const ROOT = resolve(HERE, '../../..');

async function makeJpeg(name: string, r: number, g: number, b: number): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 64, channels: 3, background: { r, g, b } },
  })
    .jpeg({ quality: 80 })
    .toBuffer()
    .then((buf) => {
      writeFileSync(join(OUT_DIR, name), buf);
      return buf;
    });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const jpegs = [
    makeJpeg('e2e-a.jpg', 220, 40, 40),
    makeJpeg('e2e-b.jpg', 40, 200, 40),
    makeJpeg('e2e-c.jpg', 40, 40, 220),
  ];
  await Promise.all(jpegs);
  console.log('[fixtures] wrote 3 synthetic JPEGs');

  const firstJpeg = await (await jpegs[0]);
  const result = await convertImageToDicom({
    imageBuffer: firstJpeg,
    filename: 'e2e-a.jpg',
    patientName: 'E2E^Synthetic',
    patientId: 'E2E-FIXTURE',
  });
  writeFileSync(join(OUT_DIR, 'sample.dcm'), result.parseResult.buffer);
  console.log(`[fixtures] wrote sample.dcm (${result.parseResult.buffer.length} bytes, SOP ${result.sopInstanceUid})`);
}

main().catch((err) => {
  console.error('[fixtures] failed:', err);
  process.exit(1);
});
