import type { AppRepository } from "../contracts/repository.js";
import type {
  AppSettings,
  BackupSnapshot,
  ReviewRecord,
  LearningActivity,
  Notebook,
} from "../../domain/models.js";

const DB_NAME = "kotoba-lab";
const REVIEWS = "reviews",
  SETTINGS = "settings",
  ACTIVITY = "activity";
export const defaultSettings: AppSettings = {
  dailyNew: 15,
  sessionSize: 20,
  speakAnswers: true,
  enabledKanaGroups: ["gojuon", "dakuten", "handakuten", "yoon"],
};
export const defaultNotebook: Notebook = {
  savedIds: [],
  dailyGoal: 20,
  level: "N5",
  path: {
    curriculumVersion: 2,
    foundationSkipped: false,
  },
};
function requestToPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
function complete(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onabort = () => reject(tx.error ?? new Error("資料儲存中斷"));
    tx.onerror = () => reject(tx.error);
  });
}
const object = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
const number = (
  v: unknown,
  min: number,
  max = Number.MAX_SAFE_INTEGER,
): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;
const date = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function validateSnapshot(
  value: unknown,
): asserts value is BackupSnapshot {
  if (
    !object(value) ||
    value.schemaVersion !== 1 ||
    !Array.isArray(value.reviews) ||
    !object(value.settings)
  )
    throw new Error("不是支援的 Kotoba Lab 備份");
  const s = value.settings;
  if (
    !number(s.dailyNew, 0, 100) ||
    !Number.isInteger(s.dailyNew) ||
    !number(s.sessionSize, 5, 200) ||
    !Number.isInteger(s.sessionSize) ||
    typeof s.speakAnswers !== "boolean" ||
    !Array.isArray(s.enabledKanaGroups) ||
    !s.enabledKanaGroups.every((g) =>
      ["gojuon", "dakuten", "handakuten", "yoon"].includes(g),
    )
  )
    throw new Error("備份中的學習設定無效");
  const keys = new Set<string>();
  for (const r of value.reviews) {
    if (
      !object(r) ||
      typeof r.key !== "string" ||
      typeof r.itemId !== "string" ||
      typeof r.modeId !== "string" ||
      r.key !== `${r.modeId}::${r.itemId}` ||
      keys.has(r.key) ||
      !date(r.dueAt) ||
      (r.lastReviewAt !== undefined && !date(r.lastReviewAt)) ||
      !number(r.intervalDays, 0) ||
      !number(r.ease, 1, 10) ||
      !number(r.reps, 0) ||
      !number(r.lapses, 0)
    )
      throw new Error("備份中的複習紀錄無效");
    keys.add(r.key);
  }
  if (value.activities !== undefined) {
    if (!Array.isArray(value.activities)) throw new Error("學習日誌無效");
    const ids = new Set<string>();
    for (const a of value.activities) {
      if (
        !object(a) ||
        typeof a.id !== "string" ||
        ids.has(a.id) ||
        !date(a.at) ||
        typeof a.itemId !== "string" ||
        typeof a.modeId !== "string" ||
        typeof a.correct !== "boolean" ||
        typeof a.isNew !== "boolean"
      )
        throw new Error("學習日誌無效");
      ids.add(a.id);
    }
  }
  if (value.notebook !== undefined) {
    const n = value.notebook;
    if (
      !object(n) ||
      !Array.isArray(n.savedIds) ||
      !n.savedIds.every((id) => typeof id === "string") ||
      !number(n.dailyGoal, 5, 200) ||
      !Number.isInteger(n.dailyGoal) ||
      !["N5", "N4", "N3", "N2", "N1"].includes(String(n.level)) ||
      (n.path !== undefined && (
        !object(n.path) ||
        ![1, 2].includes(Number(n.path.curriculumVersion)) ||
        typeof n.path.foundationSkipped !== "boolean"
      ))
    )
      throw new Error("收藏、每日目標或學習路徑無效");
  }
}
export class IndexedDbRepository implements AppRepository {
  private dbPromise?: Promise<IDBDatabase>;
  private db(): Promise<IDBDatabase> {
    return (this.dbPromise ??= new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 2);
      request.onupgradeneeded = () => {
        for (const [name, keyPath] of [
          [REVIEWS, "key"],
          [SETTINGS, "key"],
          [ACTIVITY, "id"],
        ] as const) {
          if (!request.result.objectStoreNames.contains(name))
            request.result.createObjectStore(name, { keyPath });
        }
      };
      request.onsuccess = () => {
        request.result.onversionchange = () => request.result.close();
        resolve(request.result);
      };
      request.onerror = () => reject(request.error);
      request.onblocked = () =>
        reject(new Error("請關閉其他 Kotoba Lab 分頁後重新整理"));
    }));
  }
  async getReview(key: string): Promise<ReviewRecord | undefined> {
    return requestToPromise(
      (await this.db()).transaction(REVIEWS).objectStore(REVIEWS).get(key),
    );
  }
  async getAllReviews(): Promise<ReviewRecord[]> {
    return requestToPromise(
      (await this.db()).transaction(REVIEWS).objectStore(REVIEWS).getAll(),
    );
  }
  async putReview(record: ReviewRecord): Promise<void> {
    const tx = (await this.db()).transaction(REVIEWS, "readwrite");
    const done = complete(tx);
    tx.objectStore(REVIEWS).put(record);
    await done;
  }
  async getActivities(): Promise<LearningActivity[]> {
    return requestToPromise(
      (await this.db()).transaction(ACTIVITY).objectStore(ACTIVITY).getAll(),
    );
  }
  async recordActivity(
    activity: LearningActivity,
    review?: ReviewRecord,
  ): Promise<void> {
    const tx = (await this.db()).transaction([ACTIVITY, REVIEWS], "readwrite");
    const done = complete(tx);
    tx.objectStore(ACTIVITY).put(activity);
    if (review) tx.objectStore(REVIEWS).put(review);
    await done;
  }
  private async getValue<T>(key: string, fallback: T): Promise<T> {
    const result = await requestToPromise<{ value: T } | undefined>(
      (await this.db()).transaction(SETTINGS).objectStore(SETTINGS).get(key),
    );
    return result?.value ?? structuredClone(fallback);
  }
  private async putValue(key: string, value: unknown): Promise<void> {
    const tx = (await this.db()).transaction(SETTINGS, "readwrite");
    const done = complete(tx);
    tx.objectStore(SETTINGS).put({ key, value });
    await done;
  }
  getSettings(): Promise<AppSettings> {
    return this.getValue("app", defaultSettings);
  }
  putSettings(settings: AppSettings): Promise<void> {
    return this.putValue("app", settings);
  }
  getNotebook(): Promise<Notebook> {
    return this.getValue("notebook", defaultNotebook);
  }
  putNotebook(notebook: Notebook): Promise<void> {
    return this.putValue("notebook", notebook);
  }
  async exportSnapshot(): Promise<BackupSnapshot> {
    const [reviews, settings, activities, notebook] = await Promise.all([
      this.getAllReviews(),
      this.getSettings(),
      this.getActivities(),
      this.getNotebook(),
    ]);
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      reviews,
      settings,
      activities,
      notebook,
    };
  }
  async importSnapshot(snapshot: BackupSnapshot): Promise<void> {
    validateSnapshot(snapshot); // Validate before opening the destructive transaction.
    const tx = (await this.db()).transaction(
      [REVIEWS, SETTINGS, ACTIVITY],
      "readwrite",
    );
    const done = complete(tx);
    const reviews = tx.objectStore(REVIEWS);
    reviews.clear();
    for (const review of snapshot.reviews) reviews.put(review);
    const activities = tx.objectStore(ACTIVITY);
    activities.clear();
    for (const a of snapshot.activities ?? []) activities.put(a);
    tx.objectStore(SETTINGS).put({ key: "app", value: snapshot.settings });
    tx.objectStore(SETTINGS).put({
      key: "notebook",
      value: snapshot.notebook ?? structuredClone(defaultNotebook),
    });
    await done;
  }
}
