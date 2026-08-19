/* ============================================================
   Rock Vault — IndexedDB data layer
   All specimen data (including the 3 photos as Blobs) lives in
   one object store called "specimens" inside a DB called
   "rock-vault-db". Nothing ever leaves the device unless the
   user explicitly exports a backup.
   ============================================================ */

const DB_NAME = 'rock-vault-db';
const DB_VERSION = 1;
const STORE = 'specimens';

let _dbPromise = null;

function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('inventoryNumber', 'inventoryNumber', { unique: false });
        store.createIndex('status', 'status', { unique: false });
        store.createIndex('favorite', 'favorite', { unique: false });
        store.createIndex('dateFound', 'dateFound', { unique: false });
        store.createIndex('dateAdded', 'dateAdded', { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return _dbPromise;
}

async function tx(mode) {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

const RockDB = {
  async getAll() {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async get(id) {
    const store = await tx('readonly');
    return new Promise((resolve, reject) => {
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async put(specimen) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.put(specimen);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  async delete(id) {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async clearAll() {
    const store = await tx('readwrite');
    return new Promise((resolve, reject) => {
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  },

  async nextInventoryNumber() {
    const all = await this.getAll();
    let max = 0;
    all.forEach((s) => {
      const m = /^RV-(\d+)$/.exec(s.inventoryNumber || '');
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    return `RV-${String(max + 1).padStart(4, '0')}`;
  },
};
