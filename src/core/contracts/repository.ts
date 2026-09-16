import type { AppSettings, BackupSnapshot, ReviewRecord } from '../../domain/models.js';

export interface AppRepository {
  getReview(key: string): Promise<ReviewRecord | undefined>;
  getAllReviews(): Promise<ReviewRecord[]>;
  putReview(record: ReviewRecord): Promise<void>;
  getSettings(): Promise<AppSettings>;
  putSettings(settings: AppSettings): Promise<void>;
  exportSnapshot(): Promise<BackupSnapshot>;
  importSnapshot(snapshot: BackupSnapshot): Promise<void>;
}
