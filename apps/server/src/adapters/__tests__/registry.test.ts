import { describe, test, expect, beforeEach, afterEach } from 'bun:test';
import { getRegistry, resetRegistry } from '../registry';
import { BaseAdapter } from '../base';
import type { AdapterConfig, DeviceAdapter } from '../types';

// ── Test adapter implementation ────────────────────────────────────────────────

class TestAdapter extends BaseAdapter {
  public initCalled = false;
  public startCalled = false;
  public stopCalled = false;
  public destroyCalled = false;
  public receivedImages: any[] = [];

  constructor(id?: string) {
    super('custom', id);
  }

  protected async onInitialize(_config: AdapterConfig): Promise<void> {
    this.initCalled = true;
  }

  protected async onStart(): Promise<void> {
    this.startCalled = true;
  }

  protected async onStop(): Promise<void> {
    this.stopCalled = true;
  }

  protected async onDestroy(): Promise<void> {
    this.destroyCalled = true;
  }

  async receiveImage(image: any): Promise<void> {
    await super.receiveImage(image);
    this.receivedImages.push(image);
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('AdapterRegistry', () => {
  beforeEach(() => {
    resetRegistry();
  });

  test('should register a factory and create adapters', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    const id = await registry.add({
      id: 'test-1',
      name: 'Test Adapter',
      type: 'custom',
      enabled: false,
    });

    expect(id).toBe('test-1');
    const adapter = registry.getAdapter('test-1');
    expect(adapter).toBeDefined();
    expect(adapter!.type).toBe('custom');
    expect(adapter!.status).toBe('idle');
  });

  test('should auto-start enabled adapters', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({
      id: 'test-auto',
      name: 'Auto Start',
      type: 'custom',
      enabled: true,
    });

    const adapter = registry.getAdapter('test-auto') as TestAdapter;
    expect(adapter.status).toBe('running');
    expect(adapter.startCalled).toBe(true);
  });

  test('should throw when adding duplicate adapter id', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({
      id: 'dup',
      name: 'Dup',
      type: 'custom',
      enabled: false,
    });

    expect(
      registry.add({ id: 'dup', name: 'Dup2', type: 'custom', enabled: false }),
    ).rejects.toThrow('already exists');
  });

  test('should throw when no factory registered for type', async () => {
    const registry = getRegistry();

    expect(
      registry.add({ id: 'x', name: 'X', type: 'dicom', enabled: false }),
    ).rejects.toThrow('No factory registered');
  });

  test('should start and stop adapters', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({
      id: 'lifecycle',
      name: 'Lifecycle',
      type: 'custom',
      enabled: false,
    });

    await registry.start('lifecycle');
    const adapter = registry.getAdapter('lifecycle') as TestAdapter;
    expect(adapter.status).toBe('running');
    expect(adapter.startCalled).toBe(true);

    await registry.stop('lifecycle');
    expect(adapter.status).toBe('idle');
    expect(adapter.stopCalled).toBe(true);
  });

  test('should remove adapters', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({
      id: 'removable',
      name: 'Removable',
      type: 'custom',
      enabled: false,
    });

    await registry.remove('removable');
    expect(registry.getAdapter('removable')).toBeUndefined();
  });

  test('should reload adapters (hot-reload)', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({
      id: 'reload-me',
      name: 'Original',
      type: 'custom',
      enabled: false,
    });

    const originalAdapter = registry.getAdapter('reload-me') as TestAdapter;

    await registry.reload('reload-me', {
      id: 'reload-me',
      name: 'Updated',
      type: 'custom',
      enabled: false,
    });

    const newAdapter = registry.getAdapter('reload-me') as TestAdapter;
    expect(newAdapter).not.toBe(originalAdapter);
    expect(newAdapter.initCalled).toBe(true);
    expect(originalAdapter.destroyCalled).toBe(true);
  });

  test('should list all adapters', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    await registry.add({ id: 'a', name: 'A', type: 'custom', enabled: false });
    await registry.add({ id: 'b', name: 'B', type: 'custom', enabled: false });

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    expect(all.map((a) => a.id)).toContain('a');
    expect(all.map((a) => a.id)).toContain('b');
  });

  test('should filter adapters by type', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));
    registry.registerFactory('rest', (config) => {
      const a = new TestAdapter(config.id);
      (a as any).type = 'rest';
      return a;
    });

    await registry.add({ id: 'c1', name: 'Custom 1', type: 'custom', enabled: false });
    await registry.add({ id: 'r1', name: 'Rest 1', type: 'rest', enabled: false });

    const customs = registry.getByType('custom');
    expect(customs).toHaveLength(1);
    expect(customs[0].id).toBe('c1');
  });

  test('should get adapter config', async () => {
    const registry = getRegistry();
    registry.registerFactory('custom', (config) => new TestAdapter(config.id));

    const config: AdapterConfig = {
      id: 'cfg-test',
      name: 'Config Test',
      type: 'custom',
      enabled: false,
      custom: { foo: 'bar' },
    };

    await registry.add(config);
    const retrieved = registry.getConfig('cfg-test');
    expect(retrieved?.name).toBe('Config Test');
    expect(retrieved?.custom?.foo).toBe('bar');
  });

  test('addInstance should work with pre-created adapters', async () => {
    const registry = getRegistry();
    const adapter = new TestAdapter('manual');

    await registry.addInstance(adapter, {
      id: 'manual',
      name: 'Manual',
      type: 'custom',
      enabled: false,
    });

    expect(registry.getAdapter('manual')).toBe(adapter);
    expect(adapter.initCalled).toBe(true);
  });
});
