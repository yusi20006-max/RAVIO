import { BroadcastEdition } from '../types/radio';

const DB_NAME = 'radio_khabar_offline_db';
const DB_VERSION = 2;
const STORE_NAME = 'editions';
const META_STORE_NAME = 'meta';
const OUTPUT_DIR_KEY = 'podcast_output_dir_handle';

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB در این مرورگر پشتیبانی نمی‌شود.'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
      if (!db.objectStoreNames.contains(META_STORE_NAME)) {
        db.createObjectStore(META_STORE_NAME);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('خطا در باز کردن پایگاه داده آفلاین'));
  });
}

export async function saveEditionToArchive(edition: BroadcastEdition): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(edition);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('خطا در ذخیره نسخه آفلاین'));
    };
  });
}

export async function getAllArchivedEditions(): Promise<BroadcastEdition[]> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => {
      db.close();
      const results = (request.result as BroadcastEdition[]) || [];
      results.sort((a, b) => b.createdAt - a.createdAt);
      resolve(results);
    };
    request.onerror = () => {
      db.close();
      reject(request.error ?? new Error('خطا در خواندن آرشیو آفلاین'));
    };
  });
}

export async function deleteArchivedEdition(id: string): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.delete(id);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('خطا در حذف مورد از آرشیو'));
    };
  });
}

export async function pruneArchiveToMax(maxCount: number): Promise<BroadcastEdition[]> {
  const all = await getAllArchivedEditions();
  if (maxCount <= 0 || all.length <= maxCount) {
    return all;
  }

  const toKeep = all.slice(0, maxCount);
  const toDelete = all.slice(maxCount);

  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const item of toDelete) {
      store.delete(item.id);
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('خطا در پاکسازی نسخه‌های قدیمی'));
    };
  });

  return toKeep;
}

export function estimateArchiveSizeMB(editions: BroadcastEdition[]): string {
  const totalBytes = editions.reduce((acc, item) => {
    const audioBytes = item.audioBlob ? item.audioBlob.size : 0;
    const textBytes = (item.script?.length || 0) * 2 + 1024;
    return acc + audioBytes + textBytes;
  }, 0);
  return (totalBytes / (1024 * 1024)).toFixed(1);
}

export async function saveOutputDirectoryHandle(handle: unknown): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, 'readwrite');
    tx.objectStore(META_STORE_NAME).put(handle, OUTPUT_DIR_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('خطا در ذخیره مسیر پوشه خروجی'));
    };
  });
}

export async function getOutputDirectoryHandle(): Promise<unknown | null> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, 'readonly');
    const req = tx.objectStore(META_STORE_NAME).get(OUTPUT_DIR_KEY);
    req.onsuccess = () => {
      db.close();
      resolve(req.result ?? null);
    };
    req.onerror = () => {
      db.close();
      reject(req.error ?? new Error('خطا در خواندن مسیر پوشه خروجی'));
    };
  });
}

export async function clearOutputDirectoryHandle(): Promise<void> {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(META_STORE_NAME, 'readwrite');
    tx.objectStore(META_STORE_NAME).delete(OUTPUT_DIR_KEY);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error ?? new Error('خطا در حذف مسیر پوشه خروجی'));
    };
  });
}
