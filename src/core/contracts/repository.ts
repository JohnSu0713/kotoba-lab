import type {
  AppSettings,
  BackupSnapshot,
  ReviewRecord,
  LearningActivity,
  Notebook,
} from "../../domain/models.js";

export interface AppRepository {
  getActivities(): Promise<LearningActivity[]>;
  recordActivity(
    activity: LearningActivity,
    review?: ReviewRecord,
  ): Promise<void>;
  getNotebook(): Promise<Notebook>;
  putNotebook(notebook: Notebook): Promise<void>;
  getReview(key: string): Promise<ReviewRecord | undefined>;
  getAllReviews(): Promise<ReviewRecord[]>;
  putReview(record: ReviewRecord): Promise<void>;
  getSettings(): Promise<AppSettings>;
  putSettings(settings: AppSettings): Promise<void>;
  exportSnapshot(): Promise<BackupSnapshot>;
  importSnapshot(snapshot: BackupSnapshot): Promise<void>;
}
