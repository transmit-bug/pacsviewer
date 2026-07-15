import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { RestAdapter } from '../rest';
import type { AdapterConfig } from '../types';
import { existsSync } from 'fs';
import { rm } from 'fs/promises';

describe('RestAdapter', () => {
  let adapter: RestAdapter;
  const testConfig: AdapterConfig = {
    id: 'rest-test',
    name: 'Test REST Adapter',
    type: 'rest',
    enabled: false,
    rest: {
      apiKey: 'test-key-123',
      webhookUrl: undefined,
    },
  };

  beforeEach(async () => {
    adapter = new RestAdapter('rest-test');
    await adapter.initialize(testConfig);
  });

  afterEach(async () => {
    try {
      await adapter.destroy();
    } catch {
      // ignore
    }
    // Clean up test data
    const storagePath = `${process.cwd()}/data/rest/rest-test`;
    if (existsSync(storagePath)) {
      await rm(storagePath, { recursive: true, force: true });
    }
  });

  test('should initialize with correct status', () => {
    expect(adapter.status).toBe('idle');
    expect(adapter.id).toBe('rest-test');
    expect(adapter.type).toBe('rest');
  });

  test('should start and stop', async () => {
    await adapter.start();
    expect(adapter.status).toBe('running');

    await adapter.stop();
    expect(adapter.status).toBe('idle');
  });

  test('should reject image upload when not running', async () => {
    const image = {
      buffer: Buffer.from('test'),
      filename: 'test.jpg',
      mimetype: 'image/jpeg',
    };

    expect(adapter.processUpload(image)).rejects.toThrow('not running');
  });

  test('should process image upload when running', async () => {
    await adapter.start();

    const image = {
      buffer: Buffer.from([0xff, 0xd8, 0xff, 0xe0]), // fake JPEG header
      filename: 'fundus-photo.jpg',
      mimetype: 'image/jpeg',
    };

    const metadata = {
      patientMrn: 'MRN001',
      patientName: 'Test Patient',
      studyDate: '2024-01-15',
      modality: 'fundus',
    };

    const result = await adapter.processUpload(image, metadata);

    expect(result.filename).toBe('fundus-photo.jpg');
    expect(result.size).toBe(4);
    expect(result.metadata.patientMrn).toBe('MRN001');
    expect(result.id).toBeDefined();
  });

  test('should query patients after upload', async () => {
    await adapter.start();

    await adapter.processUpload(
      { buffer: Buffer.from('img1'), filename: 'img1.jpg', mimetype: 'image/jpeg' },
      { patientMrn: 'P001', patientName: 'Alice' },
    );

    await adapter.processUpload(
      { buffer: Buffer.from('img2'), filename: 'img2.jpg', mimetype: 'image/jpeg' },
      { patientMrn: 'P001', patientName: 'Alice' },
    );

    await adapter.processUpload(
      { buffer: Buffer.from('img3'), filename: 'img3.jpg', mimetype: 'image/jpeg' },
      { patientMrn: 'P002', patientName: 'Bob' },
    );

    const allPatients = await adapter.queryPatient({});
    expect(allPatients).toHaveLength(2);
    expect(allPatients.map((p) => p.mrn)).toContain('P001');
    expect(allPatients.map((p) => p.mrn)).toContain('P002');

    const filtered = await adapter.queryPatient({ mrn: 'P001' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].name).toBe('Alice');
  });

  test('should query studies after upload', async () => {
    await adapter.start();

    await adapter.processUpload(
      { buffer: Buffer.from('img1'), filename: 'img1.jpg', mimetype: 'image/jpeg' },
      { patientMrn: 'P001', studyInstanceUid: 'S001', studyDate: '2024-01-01', modality: 'OCT' },
    );

    await adapter.processUpload(
      { buffer: Buffer.from('img2'), filename: 'img2.jpg', mimetype: 'image/jpeg' },
      { patientMrn: 'P001', studyInstanceUid: 'S002', studyDate: '2024-02-01', modality: 'fundus' },
    );

    const allStudies = await adapter.queryStudies({});
    expect(allStudies).toHaveLength(2);

    const octStudies = await adapter.queryStudies({ modality: 'OCT' });
    expect(octStudies).toHaveLength(1);
    expect(octStudies[0].studyDate).toBe('2024-01-01');
  });

  test('should validate API key', () => {
    expect(adapter.validateApiKey('test-key-123')).toBe(true);
    expect(adapter.validateApiKey('wrong-key')).toBe(false);
    expect(adapter.validateApiKey(undefined)).toBe(false);
  });

  test('should accept any key when no key configured', async () => {
    const noKeyAdapter = new RestAdapter('no-key');
    await noKeyAdapter.initialize({
      id: 'no-key',
      name: 'No Key',
      type: 'rest',
      enabled: false,
    });

    expect(noKeyAdapter.validateApiKey('anything')).toBe(true);
    expect(noKeyAdapter.validateApiKey(undefined)).toBe(true);

    await noKeyAdapter.destroy();
  });

  test('should emit events on image receive', async () => {
    await adapter.start();

    const events: any[] = [];
    adapter.events.on('image:received', (data) => events.push(data));

    await adapter.processUpload(
      { buffer: Buffer.from('test'), filename: 'test.jpg', mimetype: 'image/jpeg' },
      {},
    );

    expect(events).toHaveLength(1);
    expect(events[0].id).toBeDefined();
    expect(events[0].metadata).toBeDefined();
    expect(events[0].path).toBeDefined();
  });

  test('should report status correctly', async () => {
    await adapter.start();

    await adapter.processUpload(
      { buffer: Buffer.from('img1'), filename: 'img1.jpg', mimetype: 'image/jpeg' },
      {},
    );

    const status = adapter.getStatus();
    expect(status.id).toBe('rest-test');
    expect(status.name).toBe('Test REST Adapter');
    expect(status.type).toBe('rest');
    expect(status.status).toBe('running');
    expect(status.imageCount).toBe(1);
    expect(status.uptime).toBeGreaterThanOrEqual(0);
  });

  test('should sanitize config in status (hide secrets)', async () => {
    const status = adapter.getStatus();
    const restConfig = status.config.rest as { apiKey?: string } | undefined;
    expect(restConfig?.apiKey).toBe('***');
  });
});
