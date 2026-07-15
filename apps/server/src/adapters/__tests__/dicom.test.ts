import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { DicomAdapter } from '../dicom';
import type { AdapterConfig } from '../types';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';

describe('DicomAdapter', () => {
  let adapter: DicomAdapter;
  const testPort = 11113; // Use non-standard port to avoid conflicts
  const testConfig: AdapterConfig = {
    id: 'dicom-test',
    name: 'Test DICOM Adapter',
    type: 'dicom',
    enabled: false,
    dicom: {
      aeTitle: 'PACS_TEST',
      port: testPort,
    },
  };

  beforeEach(async () => {
    adapter = new DicomAdapter('dicom-test');
    await adapter.initialize(testConfig);
  });

  afterEach(async () => {
    try {
      await adapter.destroy();
    } catch {
      // ignore
    }
    const storagePath = `${process.cwd()}/data/dicom/dicom-test`;
    if (existsSync(storagePath)) {
      await rm(storagePath, { recursive: true, force: true });
    }
  });

  test('should initialize with correct status', () => {
    expect(adapter.status).toBe('idle');
    expect(adapter.id).toBe('dicom-test');
    expect(adapter.type).toBe('dicom');
  });

  test('should start and stop DICOM server', async () => {
    await adapter.start();
    expect(adapter.status).toBe('running');

    await adapter.stop();
    expect(adapter.status).toBe('idle');
  });

  test('should reject image receive when not running', async () => {
    const image = {
      buffer: Buffer.from('not-dicom'),
      filename: 'test.dcm',
      format: 'dicom',
      metadata: {},
    };

    expect(adapter.receiveImage(image)).rejects.toThrow('not running');
  });

  test('should receive DICOM image when running', async () => {
    await adapter.start();

    // Create a minimal DICOM-like buffer (just enough to test storage)
    // Real DICOM has a 128-byte preamble + "DICM" magic
    const preamble = Buffer.alloc(128, 0);
    const magic = Buffer.from('DICM');
    const buffer = Buffer.concat([preamble, magic]);

    const image = {
      buffer,
      filename: 'test-image.dcm',
      format: 'dicom',
      metadata: { patientId: 'P001' },
    };

    await adapter.receiveImage(image);

    const status = adapter.getStatus();
    expect(status.imageCount).toBe(1);
    expect(status.lastImageAt).toBeDefined();
  });

  test('should query patients after receiving images', async () => {
    await adapter.start();

    // Create DICOM-like buffers with embedded metadata
    // For this test we'll use the receiveImage method which parses metadata
    const image1 = {
      buffer: Buffer.from('DICOM-fake-1'),
      filename: 'img1.dcm',
      format: 'dicom',
      metadata: {},
    };

    await adapter.receiveImage(image1);

    // Since our fake DICOM won't have parseable metadata, queryPatient returns empty
    const patients = await adapter.queryPatient({});
    expect(patients).toBeInstanceOf(Array);
  });

  test('should query studies', async () => {
    await adapter.start();

    const image = {
      buffer: Buffer.from('DICOM-fake'),
      filename: 'img.dcm',
      format: 'dicom',
      metadata: {},
    };

    await adapter.receiveImage(image);

    const studies = await adapter.queryStudies({});
    expect(studies).toBeInstanceOf(Array);
  });

  test('should emit events on image receive', async () => {
    await adapter.start();

    const events: any[] = [];
    adapter.events.on('image:received', (data) => events.push(data));

    await adapter.receiveImage({
      buffer: Buffer.from('DICOM-fake'),
      filename: 'test.dcm',
      format: 'dicom',
      metadata: {},
    });

    expect(events).toHaveLength(1);
    expect(events[0].id).toBeDefined();
  });

  test('should report status correctly', async () => {
    await adapter.start();

    const status = adapter.getStatus();
    expect(status.id).toBe('dicom-test');
    expect(status.name).toBe('Test DICOM Adapter');
    expect(status.type).toBe('dicom');
    expect(status.status).toBe('running');
    expect(status.imageCount).toBe(0);
  });

  test('should require dicom config to start', async () => {
    const noDicomAdapter = new DicomAdapter('no-dicom');
    await noDicomAdapter.initialize({
      id: 'no-dicom',
      name: 'No Dicom Config',
      type: 'dicom',
      enabled: false,
    });

    expect(noDicomAdapter.start()).rejects.toThrow('Missing dicom configuration');
    await noDicomAdapter.destroy();
  });
});
