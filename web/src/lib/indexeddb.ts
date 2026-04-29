export interface VocabWord {
  id: string;
  word: string;
  reading: string;
  meaning: string[];
  sentence?: string;
  addedAt: number;
}

const DB_NAME = 'manga-viewer-vocab';
const STORE_NAME = 'words';
const DB_VERSION = 1;

let dbInstance: IDBDatabase | null = null;

async function getDb(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('addedAt', 'addedAt');
      }
    };
    req.onsuccess = () => {
      dbInstance = req.result;
      resolve(req.result);
    };
    req.onerror = () => reject(req.error);
  });
}

export const vocabDb = {
  async addWord(word: VocabWord): Promise<void> {
    try {
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(word);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[vocabDb.addWord] failed to add word', word, err);
    }
  },
  async removeWord(id: string): Promise<void> {
    try {
      const db = await getDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (err) {
      console.error('[vocabDb.removeWord] failed to remove word', id, err);
    }
  },
  async getAllWords(): Promise<VocabWord[]> {
    try {
      const db = await getDb();
      const words = await new Promise<VocabWord[]>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).getAll();
        req.onsuccess = () => resolve(req.result as VocabWord[]);
        req.onerror = () => reject(req.error);
      });
      return words ?? [];
    } catch (err) {
      console.error('[vocabDb.getAllWords] failed to fetch words', err);
      return [];
    }
  },
  async hasWord(id: string): Promise<boolean> {
    try {
      const db = await getDb();
      const w = await new Promise<VocabWord | undefined>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get(id);
        req.onsuccess = () => resolve(req.result as VocabWord | undefined);
        req.onerror = () => reject(req.error);
      });
      return Boolean(w);
    } catch (err) {
      console.error('[vocabDb.hasWord] failed to check word', id, err);
      return false;
    }
  },
};
