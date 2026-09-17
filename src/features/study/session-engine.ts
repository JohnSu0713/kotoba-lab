import type { AppRepository } from '../../core/contracts/repository.js';
import type { Scheduler } from '../../core/contracts/scheduler.js';
import type { StudyMode, StudyQuestion } from '../../core/contracts/study-mode.js';
import type { ContentRegistry } from '../../core/registry/content-registry.js';
import type { ContentItem, Rating, ReviewRecord } from '../../domain/models.js';
import { shuffle } from './question-utils.js';

export interface SessionFilter {
  predicate?: (item: ContentItem) => boolean;
}

interface QueuedCard {
  item: ContentItem;
  mode: StudyMode;
  pool: ContentItem[];
}

export interface SessionCard {
  item: ContentItem;
  mode: StudyMode;
  question: StudyQuestion;
  record: ReviewRecord | undefined;
}

export interface AnswerOutcome {
  correct: boolean;
  rating: Rating;
  updated: ReviewRecord;
}

export class StudySession {
  private index = 0;
  private currentCard: SessionCard | undefined;

  constructor(
    private readonly queue: QueuedCard[],
    private readonly scheduler: Scheduler,
    private readonly repository: AppRepository,
    private readonly reviewMap: Map<string, ReviewRecord>,
  ) {}

  get total(): number { return this.queue.length; }
  get completed(): number { return this.index; }
  get isDone(): boolean { return this.index >= this.queue.length; }

  current(): SessionCard | undefined {
    if (this.isDone) return undefined;
    if (this.currentCard) return this.currentCard;
    const queued = this.queue[this.index];
    if (!queued) return undefined;
    const key = `${queued.mode.id}::${queued.item.id}`;
    const question = queued.mode.createQuestion(queued.item, { allItems: queued.pool, random: Math.random });
    this.currentCard = { item: queued.item, mode: queued.mode, question, record: this.reviewMap.get(key) };
    return this.currentCard;
  }

  async submit(answer: string, manualRating?: Rating): Promise<AnswerOutcome> {
    const card = this.current();
    if (!card) throw new Error('Session is complete');
    const graded = card.mode.grade(card.question, answer);
    const rating = manualRating ?? graded.rating;
    const now = new Date();
    const record = card.record ?? this.scheduler.create(card.item.id, card.mode.id, now);
    const updated = this.scheduler.review(record, rating, now);
    await this.repository.putReview(updated);
    this.reviewMap.set(updated.key, updated);
    this.index += 1;
    this.currentCard = undefined;
    return { correct: manualRating ? rating !== 'again' : graded.correct, rating, updated };
  }
}

export class SessionEngine {
  constructor(
    private readonly content: ContentRegistry,
    private readonly scheduler: Scheduler,
    private readonly repository: AppRepository,
  ) {}

  async create(mode: StudyMode, filter: SessionFilter = {}): Promise<StudySession> {
    const settings = await this.repository.getSettings();
    const eligible = this.content.getAll({
      predicate: (item) => mode.supports(item) && (filter.predicate?.(item) ?? true),
    });
    const reviews = await this.repository.getAllReviews();
    const reviewMap = new Map(reviews.map((record) => [record.key, record]));
    const now = new Date();

    const due = eligible
      .filter((item) => {
        const record = reviewMap.get(`${mode.id}::${item.id}`);
        return record ? this.scheduler.isDue(record, now) : false;
      })
      .sort((a, b) => {
        const ar = reviewMap.get(`${mode.id}::${a.id}`);
        const br = reviewMap.get(`${mode.id}::${b.id}`);
        return (ar?.dueAt ?? '').localeCompare(br?.dueAt ?? '');
      });

    const fresh = eligible
      .filter((item) => !reviewMap.has(`${mode.id}::${item.id}`))
      .slice(0, settings.dailyNew);
    const roomForNew = Math.max(0, settings.sessionSize - due.length);
    const items = [...due.slice(0, settings.sessionSize), ...fresh.slice(0, roomForNew)].slice(0, settings.sessionSize);
    const queue = items.map((item) => ({ item, mode, pool: eligible }));
    return new StudySession(queue, this.scheduler, this.repository, reviewMap);
  }

  async createMixed(modes: StudyMode[], filter: SessionFilter = {}): Promise<StudySession> {
    const settings = await this.repository.getSettings();
    const reviews = await this.repository.getAllReviews();
    const reviewMap = new Map(reviews.map((record) => [record.key, record]));
    const now = new Date();

    const pools = new Map<string, ContentItem[]>();
    for (const mode of modes) {
      pools.set(mode.id, this.content.getAll({
        predicate: (item) => mode.supports(item) && (filter.predicate?.(item) ?? true),
      }));
    }

    const due: Array<QueuedCard & { dueAt: string }> = [];
    for (const mode of modes) {
      const pool = pools.get(mode.id) ?? [];
      for (const item of pool) {
        const record = reviewMap.get(`${mode.id}::${item.id}`);
        if (record && this.scheduler.isDue(record, now)) due.push({ item, mode, pool, dueAt: record.dueAt });
      }
    }
    due.sort((a, b) => a.dueAt.localeCompare(b.dueAt));

    // New cards are round-robin across learning modes so a fresh mixed session
    // actually alternates recognition, recall, listening and vocabulary tasks.
    const modeOrder = shuffle(modes, Math.random);
    const freshBuckets = new Map<string, ContentItem[]>();
    for (const mode of modeOrder) {
      const pool = pools.get(mode.id) ?? [];
      freshBuckets.set(
        mode.id,
        shuffle(pool.filter((item) => !reviewMap.has(`${mode.id}::${item.id}`)), Math.random),
      );
    }

    const fresh: QueuedCard[] = [];
    while (fresh.length < settings.dailyNew) {
      let added = false;
      for (const mode of modeOrder) {
        const bucket = freshBuckets.get(mode.id);
        const item = bucket?.shift();
        if (!item) continue;
        fresh.push({ item, mode, pool: pools.get(mode.id) ?? [] });
        added = true;
        if (fresh.length >= settings.dailyNew) break;
      }
      if (!added) break;
    }

    const dueQueue = due.slice(0, settings.sessionSize).map(({ item, mode, pool }) => ({ item, mode, pool }));
    const roomForNew = Math.max(0, settings.sessionSize - dueQueue.length);
    const queue = [...dueQueue, ...fresh.slice(0, roomForNew)].slice(0, settings.sessionSize);
    return new StudySession(queue, this.scheduler, this.repository, reviewMap);
  }
}
