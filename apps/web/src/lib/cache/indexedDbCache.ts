/**
 * IndexedDB Image Cache — caches decoded image data to avoid repeated decoding.
 *
 * Uses the browser's IndexedDB to store decoded image blobs keyed by imageId + pyramid level.
 * Falls back gracefully if IndexedDB is unavailable.
 */

const DB_NAME = 'pacsviewer-image-cache';
const DB_VERSION = 1;
const STORE_NAME = 'images';
const MAX_CACHE_SIZE = 200; // Max entries before eviction

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'key' });
        store.createIndex('accessedAt', 'accessedAt');
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  return dbPromise;
}

interface CacheEntry {
  key: string;
  data: Blob;
  accessedAt: number;
  size: number;
}

/**
 * Get cached image blob.
 */
export async function getCachedImage(imageId: string, level: string): Promise<Blob | null> {
  try {
    const db = await openDB();
    const key = `${imageId}:${level}`;

    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const request = store.get(key);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;
        if (entry) {
          // Update access time
          store.put({ ...entry, accessedAt: Date.now() });
          resolve(entry.data);
        } else {
          resolve(null);
        }
      };

      request.onerror = () => resolve(null); // Fail silently
    });
  } catch {
    return null;
  }
}

/**
 * Store image blob in cache.
 */
export async function cacheImage(imageId: string, level: string, blob: Blob): Promise<void> {
  try {
    const db = await openDB();
    const key = `${imageId}:${level}`;

    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);

    store.put({
      key,
      data: blob,
      accessedAt: Date.now(),
      size: blob.size,
    });

    // Evict oldest entries if over limit
    await evictIfNeeded(store);
  } catch {
    // Fail silently
  }
}

/**
 * Evict oldest entries if cache is over size limit.
 */
async function evictIfNeeded(store: IDBObjectStore): Promise<void> {
  return new Promise((resolve) => {
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result <= MAX_CACHE_SIZE) {
        resolve();
        return;
      }

      // Delete oldest entries
      const index = store.index('accessedAt');
      const cursorRequest = index.openCursor();
      let toDelete = countRequest.result - MAX_CACHE_SIZE;

      cursorRequest.onsuccess = () => {
        const cursor = cursorRequest.result;
        if (cursor && toDelete > 0) {
          store.delete(cursor.primaryKey);
          toDelete--;
          cursor.continue();
        } else {
          resolve();
        }
      };

      cursorRequest.onerror = () => resolve();
    };
    countRequest.onerror = () => resolve();
  });
}

/**
 * Clear all cached images.
 */
export async function clearImageCache(): Promise<void> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
  } catch {
    // Fail silently
  }
}

/**
 * Generate cache key for pyramid request.
 */
export function pyramidCacheKey(imageId: string, level: string): string {
  return `${imageId}:${level}`;
}
