import type { AppRepository } from '../contracts/repository.js';
import type { AppSettings, BackupSnapshot, ReviewRecord } from '../../domain/models.js';

const DB_NAME = 'kotoba-lab';
const DB_VERSION = 1;
const REVIEWS = 'reviews';
const SETTINGS = 'settings';
const SETTINGS_KEY = 'app';

export const defaultSettings: AppSettings = {
  dailyNew: 15,
  sessionSize: 20,
  speakAnswers: true,
  enabledKanaGroups: ['gojuon', 'dakuten', 'handakuten', 'yoon'],
};

function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

export class IndexedDbRepository implements AppRepository {
  private dbPromise?: Promise<IDBDatabase>;

  private db(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(REVIEWS)) db.createObjectStore(REVIEWS, { keyPath: 'key' });
          if (!db.objectStoreNames.contains(SETTINGS)) db.createObjectStore(SETTINGS, { keyPath: 'key' });
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error ?? new Error('Cannot open IndexedDB'));
      });
    }
    return this.dbPromise;
  }

  async getReview(key: string): Promise<ReviewRecord | undefined> {
    const db = await this.db();
    const tx = db.transaction(REVIEWS, 'readonly');
    return requestToPromise(tx.objectStore(REVIEWS).get(key));
  }

  async getAllReviews(): Promise<ReviewRecord[]> {
    const db = await this.db();
    const tx = db.transaction(REVIEWS, 'readonly');
    return requestToPromise(tx.objectStore(REVIEWS).getAll());
  }

  async putReview(record: ReviewRecord): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(REVIEWS, 'readwrite');
    await requestToPromise(tx.objectStore(REVIEWS).put(record));
  }

  async getSettings(): Promise<AppSettings> {
    const db = await this.db();
    const tx = db.transaction(SETTINGS, 'readonly');
    const value = await requestToPromise<{ key: string; value: AppSettings } | undefined>(tx.objectStore(SETTINGS).get(SETTINGS_KEY));
    return value?.value ?? structuredClone(defaultSettings);
  }

  async putSettings(settings: AppSettings): Promise<void> {
    const db = await this.db();
    const tx = db.transaction(SETTINGS, 'readwrite');
    await requestToPromise(tx.objectStore(SETTINGS).put({ key: SETTINGS_KEY, value: settings }));
  }

  async exportSnapshot(): Promise<BackupSnapshot> {
    return { schemaVersion: 1, exportedAt: new Date().toISOString(), reviews: await this.getAllReviews(), settings: await this.getSettings() };
  }

  async importSnapshot(snapshot: BackupSnapshot): Promise<void> {
    if (snapshot.schemaVersion !== 1) throw new Error('Unsupported backup schema');
    const db = await this.db();
    const tx = db.transaction([REVIEWS, SETTINGS], 'readwrite');
    const reviews = tx.objectStore(REVIEWS);
    await requestToPromise(reviews.clear());
    for (const review of snapshot.reviews) await requestToPromise(reviews.put(review));
    await requestToPromise(tx.objectStore(SETTINGS).put({ key: SETTINGS_KEY, value: snapshot.settings }));
  }
}
