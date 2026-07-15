/**
 * Adapter Registry - Lifecycle management for all device adapters.
 *
 * Provides:
 *  - Registration of adapter classes or instances
 *  - Start / stop / status management
 *  - Hot-reload support (stop old → init new → start)
 *  - Singleton access via `getRegistry()`
 */

import { v4 as uuid } from 'uuid';
import {
  type AdapterConfig,
  type AdapterStatusInfo,
  type AdapterType,
  type DeviceAdapter,
} from './types';

/** Factory function: receives config, returns a ready-to-init adapter instance */
export type AdapterFactory = (config: AdapterConfig) => DeviceAdapter;

interface RegistryEntry {
  config: AdapterConfig;
  adapter: DeviceAdapter;
}

class AdapterRegistry {
  private entries = new Map<string, RegistryEntry>();
  private factories = new Map<AdapterType, AdapterFactory>();

  // ── Factory registration ─────────────────────────────────────────────────────

  /**
   * Register a factory for an adapter type.
   * When adapters of this type are added, the factory is called to create the instance.
   */
  registerFactory(type: AdapterType, factory: AdapterFactory): void {
    this.factories.set(type, factory);
  }

  // ── Adapter CRUD ─────────────────────────────────────────────────────────────

  /**
   * Add a new adapter from config.
   * Creates the instance via the registered factory for its type.
   * Returns the assigned adapter id.
   */
  async add(config: AdapterConfig): Promise<string> {
    const id = config.id || uuid();
    config.id = id;

    if (this.entries.has(id)) {
      throw new Error(`Adapter "${id}" already exists`);
    }

    const factory = this.factories.get(config.type);
    if (!factory) {
      throw new Error(
        `No factory registered for adapter type "${config.type}". ` +
        `Registered types: ${[...this.factories.keys()].join(', ') || 'none'}`,
      );
    }

    const adapter = factory(config);
    await adapter.initialize(config);

    this.entries.set(id, { config, adapter });

    // Auto-start if enabled
    if (config.enabled) {
      try {
        await adapter.start();
      } catch (err) {
        console.error(`[AdapterRegistry] Failed to auto-start adapter "${id}":`, err);
      }
    }

    return id;
  }

  /**
   * Add an already-instantiated adapter (for testing or manual wiring).
   */
  async addInstance(adapter: DeviceAdapter, config: AdapterConfig): Promise<string> {
    const id = config.id || adapter.id;
    config.id = id;

    if (this.entries.has(id)) {
      throw new Error(`Adapter "${id}" already exists`);
    }

    await adapter.initialize(config);
    this.entries.set(id, { config, adapter });

    if (config.enabled) {
      try {
        await adapter.start();
      } catch (err) {
        console.error(`[AdapterRegistry] Failed to auto-start adapter "${id}":`, err);
      }
    }

    return id;
  }

  /**
   * Remove an adapter. Stops it first if running.
   */
  async remove(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Adapter "${id}" not found`);

    try {
      await entry.adapter.destroy();
    } catch (err) {
      console.warn(`[AdapterRegistry] Error destroying adapter "${id}":`, err);
    }

    this.entries.delete(id);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────────

  async start(id: string): Promise<void> {
    const entry = this.getEntry(id);
    await entry.adapter.start();
  }

  async stop(id: string): Promise<void> {
    const entry = this.getEntry(id);
    await entry.adapter.stop();
  }

  /**
   * Hot-reload: stop the old adapter, create a new one from updated config,
   * initialize, and start.  If anything fails the old state is not restored
   * (caller should re-add with the old config).
   */
  async reload(id: string, newConfig: AdapterConfig): Promise<void> {
    const oldEntry = this.entries.get(id);
    if (oldEntry) {
      try {
        await oldEntry.adapter.destroy();
      } catch {
        // best-effort
      }
      this.entries.delete(id);
    }

    newConfig.id = id;
    await this.add(newConfig);
  }

  // ── Query ────────────────────────────────────────────────────────────────────

  getAdapter(id: string): DeviceAdapter | undefined {
    return this.entries.get(id)?.adapter;
  }

  getConfig(id: string): AdapterConfig | undefined {
    return this.entries.get(id)?.config;
  }

  getAll(): AdapterStatusInfo[] {
    return [...this.entries.values()].map((e) => e.adapter.getStatus());
  }

  getByType(type: AdapterType): AdapterStatusInfo[] {
    return this.getAll().filter((s) => s.type === type);
  }

  // ── Internals ────────────────────────────────────────────────────────────────

  private getEntry(id: string): RegistryEntry {
    const entry = this.entries.get(id);
    if (!entry) throw new Error(`Adapter "${id}" not found`);
    return entry;
  }
}

// ── Singleton ──────────────────────────────────────────────────────────────────

let _registry: AdapterRegistry | null = null;

/** Get or create the global adapter registry. */
export function getRegistry(): AdapterRegistry {
  if (!_registry) {
    _registry = new AdapterRegistry();
  }
  return _registry;
}

/** Reset the singleton (for testing). */
export function resetRegistry(): void {
  _registry = null;
}
