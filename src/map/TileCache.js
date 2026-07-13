// Persistent cache for fetched map/elevation tiles, backed by IndexedDB with an in-memory fallback.

const DB_NAME = 'geovoxel-tiles';
const STORE_NAME = 'tiles';

export class TileCache {
  constructor() {
    this.memory = new Map();
    this.dbPromise = typeof indexedDB !== 'undefined' ? this._openDB() : null;
  }

  _openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE_NAME);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async get(key) {
    if (this.memory.has(key)) return this.memory.get(key);
    if (!this.dbPromise) return undefined;

    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  async set(key, value) {
    this.memory.set(key, value);
    if (!this.dbPromise) return;

    const db = await this.dbPromise;
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  clear() {
    this.memory.clear();
  }
}
