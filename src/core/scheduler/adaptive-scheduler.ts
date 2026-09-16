import type { Scheduler } from '../contracts/scheduler.js';
import type { Rating, ReviewRecord } from '../../domain/models.js';

const DAY_MS = 86_400_000;

/**
 * A small, deterministic SRS used for the vertical slice.
 * The Scheduler interface is intentionally isolated so an exact FSRS adapter
 * can replace this implementation without touching content or UI modules.
 */
export class AdaptiveScheduler implements Scheduler {
  readonly id = 'adaptive-v1';

  create(itemId: string, modeId: string, now: Date): ReviewRecord {
    return {
      key: `${modeId}::${itemId}`,
      itemId,
      modeId,
      dueAt: now.toISOString(),
      intervalDays: 0,
      ease: 2.5,
      reps: 0,
      lapses: 0,
    };
  }

  review(record: ReviewRecord, rating: Rating, now: Date): ReviewRecord {
    const current = Math.max(record.intervalDays, 0);
    let interval = current;
    let ease = record.ease;
    let lapses = record.lapses;

    switch (rating) {
      case 'again':
        interval = 0.01;
        ease = Math.max(1.3, ease - 0.2);
        lapses += 1;
        break;
      case 'hard':
        interval = current < 1 ? 1 : Math.max(1, current * 1.25);
        ease = Math.max(1.3, ease - 0.05);
        break;
      case 'good':
        interval = current < 1 ? 1 : current < 2 ? 3 : current * ease;
        break;
      case 'easy':
        interval = current < 1 ? 4 : Math.max(4, current * ease * 1.3);
        ease = Math.min(3.2, ease + 0.1);
        break;
    }

    const dueAt = new Date(now.getTime() + interval * DAY_MS);
    return {
      ...record,
      dueAt: dueAt.toISOString(),
      lastReviewAt: now.toISOString(),
      intervalDays: Math.round(interval * 100) / 100,
      ease,
      reps: record.reps + 1,
      lapses,
    };
  }

  isDue(record: ReviewRecord, now: Date): boolean {
    return new Date(record.dueAt).getTime() <= now.getTime();
  }
}
