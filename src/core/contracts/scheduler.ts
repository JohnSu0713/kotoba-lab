import type { Rating, ReviewRecord } from '../../domain/models.js';

export interface Scheduler {
  readonly id: string;
  create(itemId: string, modeId: string, now: Date): ReviewRecord;
  review(record: ReviewRecord, rating: Rating, now: Date): ReviewRecord;
  isDue(record: ReviewRecord, now: Date): boolean;
}
