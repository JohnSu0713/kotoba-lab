import type { AppRepository } from "../../core/contracts/repository.js";
import type { Scheduler } from "../../core/contracts/scheduler.js";
import type {
  StudyMode,
  StudyQuestion,
} from "../../core/contracts/study-mode.js";
import type { ContentRegistry } from "../../core/registry/content-registry.js";
import type { ContentItem, Rating, ReviewRecord } from "../../domain/models.js";
import { activitySummary } from "../progress/activity.js";
import { shuffle } from "./question-utils.js";

export interface SessionFilter {
  predicate?: (item: ContentItem) => boolean;
  strategy?: "scheduled" | "weak" | "practice";
  limit?: number;
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
  private submitting = false;
  private currentCard: SessionCard | undefined;

  constructor(
    private readonly queue: QueuedCard[],
    private readonly scheduler: Scheduler,
    private readonly repository: AppRepository,
    private readonly reviewMap: Map<string, ReviewRecord>,
  ) {}

  get total(): number {
    return this.queue.length;
  }
  get completed(): number {
    return this.index;
  }
  get isDone(): boolean {
    return this.index >= this.queue.length;
  }

  current(): SessionCard | undefined {
    if (this.isDone) return undefined;
    if (this.currentCard) return this.currentCard;
    const queued = this.queue[this.index];
    if (!queued) return undefined;
    const key = `${queued.mode.id}::${queued.item.id}`;
    const question = queued.mode.createQuestion(queued.item, {
      allItems: queued.pool,
      random: Math.random,
    });
    this.currentCard = {
      item: queued.item,
      mode: queued.mode,
      question,
      record: this.reviewMap.get(key),
    };
    return this.currentCard;
  }

  async submit(answer: string, manualRating?: Rating): Promise<AnswerOutcome> {
    if (this.submitting) throw new Error("Answer already being saved");
    this.submitting = true;
    try {
      const card = this.current();
      if (!card) throw new Error("Session is complete");
      const graded = card.mode.grade(card.question, answer);
      const rating = manualRating ?? graded.rating;
      const now = new Date();
      const record =
        card.record ?? this.scheduler.create(card.item.id, card.mode.id, now);
      const updated = this.scheduler.review(record, rating, now);
      await this.repository.recordActivity(
        {
          id: crypto.randomUUID(),
          at: now.toISOString(),
          itemId: card.item.id,
          modeId: card.mode.id,
          correct: manualRating ? rating !== "again" : graded.correct,
          isNew: !card.record,
        },
        updated,
      );
      this.reviewMap.set(updated.key, updated);
      this.index += 1;
      this.currentCard = undefined;
      return {
        correct: manualRating ? rating !== "again" : graded.correct,
        rating,
        updated,
      };
    } finally {
      this.submitting = false;
    }
  }
}

export class SessionEngine {
  constructor(
    private readonly content: ContentRegistry,
    private readonly scheduler: Scheduler,
    private readonly repository: AppRepository,
  ) {}

  async create(
    mode: StudyMode,
    filter: SessionFilter = {},
  ): Promise<StudySession> {
    return this.createMixed([mode], filter);
  }

  async createMixed(
    modes: StudyMode[],
    filter: SessionFilter = {},
  ): Promise<StudySession> {
    const [settings, reviews, activities] = await Promise.all([
      this.repository.getSettings(),
      this.repository.getAllReviews(),
      this.repository.getActivities(),
    ]);
    const reviewMap = new Map(reviews.map((record) => [record.key, record]));
    const now = new Date();
    const limit = Math.min(
      settings.sessionSize,
      filter.limit ?? settings.sessionSize,
    );
    const pools = new Map(
      modes.map((mode) => [
        mode.id,
        this.content.getAll({ predicate: (item) => mode.supports(item) }),
      ]),
    );
    const eligible: QueuedCard[] = modes.flatMap((mode) =>
      (pools.get(mode.id) ?? [])
        .filter((item) => filter.predicate?.(item) ?? true)
        .map((item) => ({ item, mode, pool: pools.get(mode.id)! })),
    );
    const recordFor = (card: QueuedCard) =>
      reviewMap.get(`${card.mode.id}::${card.item.id}`);
    if (filter.strategy === "weak") {
      const weak = eligible
        .filter((card) => (recordFor(card)?.lapses ?? 0) > 0)
        .sort((a, b) => {
          const ar = recordFor(a)!,
            br = recordFor(b)!;
          return (
            br.lapses / Math.max(1, br.reps) -
              ar.lapses / Math.max(1, ar.reps) || br.lapses - ar.lapses
          );
        });
      return new StudySession(
        weak.slice(0, limit),
        this.scheduler,
        this.repository,
        reviewMap,
      );
    }
    if (filter.strategy === "practice") {
      return new StudySession(
        shuffle(eligible, Math.random).slice(0, limit),
        this.scheduler,
        this.repository,
        reviewMap,
      );
    }
    const due = eligible
      .filter((card) => {
        const r = recordFor(card);
        return r && this.scheduler.isDue(r, now);
      })
      .sort((a, b) => recordFor(a)!.dueAt.localeCompare(recordFor(b)!.dueAt))
      .slice(0, limit);
    const remainingNew = Math.max(
      0,
      settings.dailyNew - activitySummary(activities, now).todayNew,
    );
    const fresh: QueuedCard[] = [];
    const buckets = shuffle(modes, Math.random).map((mode) =>
      eligible.filter((card) => card.mode.id === mode.id && !recordFor(card)),
    );
    // Keep corpus order for an individual mode; alternate modes in mixed sessions.
    while (fresh.length < Math.min(remainingNew, limit - due.length)) {
      let added = false;
      for (const bucket of buckets) {
        const card = bucket.shift();
        if (card) {
          fresh.push(card);
          added = true;
        }
        if (fresh.length >= Math.min(remainingNew, limit - due.length)) break;
      }
      if (!added) break;
    }
    return new StudySession(
      [...due, ...fresh],
      this.scheduler,
      this.repository,
      reviewMap,
    );
  }
}
