import test from "node:test";
import assert from "node:assert/strict";
import { SessionEngine } from "../public/app/features/study/session-engine.js";
import { ContentRegistry } from "../public/app/core/registry/content-registry.js";
import { AdaptiveScheduler } from "../public/app/core/scheduler/adaptive-scheduler.js";
import {
  defaultSettings,
  defaultNotebook,
  validateSnapshot,
} from "../public/app/core/storage/indexeddb.js";
import {
  activitySummary,
  dateKey,
  recentDays,
} from "../public/app/features/progress/activity.js";
import { grammar, readings } from "../public/app/features/studio/content.js";
import { vocabFlashcardMode } from "../public/app/features/vocabulary/modes/flashcard.js";
import { readFile } from "node:fs/promises";
import {
  verifiedArtistCoverage,
  verifiedDeckLesson,
} from "../public/app/features/lyrics/verified.js";
import { normalizeKaraokeTimings } from "../public/app/features/lyrics/karaoke.js";
const item = (id) => ({
  id,
  kind: "vocabulary",
  expression: id,
  reading: id,
  meaningsZhTw: [id],
  jlpt: "N5",
  tags: [],
  examples: [],
  order: Number(id),
});
const mode = {
  id: "test",
  supports: () => true,
  createQuestion: (item, ctx) => ({
    type: "choice",
    correctValue: item.id,
    pool: ctx.allItems.length,
  }),
  grade: (q, a) => ({
    correct: q.correctValue === a,
    rating: q.correctValue === a ? "good" : "again",
  }),
};
function setup() {
  const content = new ContentRegistry();
  content.register({
    id: "test",
    title: "Test",
    items: Array.from({ length: 10 }, (_, i) => item(String(i))),
  });
  const repository = {
    settings: { ...defaultSettings, dailyNew: 2, sessionSize: 5 },
    reviews: [],
    activities: [],
    getSettings: async function () {
      return this.settings;
    },
    getAllReviews: async function () {
      return this.reviews;
    },
    getActivities: async function () {
      return this.activities;
    },
    recordActivity: async function (a, r) {
      this.activities.push(a);
      if (r) {
        this.reviews = this.reviews.filter((v) => v.key !== r.key);
        this.reviews.push(r);
      }
    },
  };
  const scheduler = new AdaptiveScheduler();
  return {
    repository,
    scheduler,
    engine: new SessionEngine(content, scheduler, repository),
  };
}
test("new-card budget is shared across sessions and due cards remain available", async () => {
  const { repository, engine } = setup();
  let session = await engine.create(mode);
  assert.equal(session.total, 2);
  await session.submit(session.current().item.id);
  await session.submit(session.current().item.id);
  session = await engine.create(mode);
  assert.equal(session.total, 0);
  repository.reviews[0].dueAt = new Date(0).toISOString();
  session = await engine.create(mode);
  assert.equal(session.total, 1);
  assert.equal(session.current().record.reps, 1);
});
test("concurrent answer submissions do not advance or save twice", async () => {
  const { repository, engine } = setup();
  const session = await engine.create(mode);
  const answer = session.current().item.id;
  const results = await Promise.allSettled([
    session.submit(answer),
    session.submit(answer),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(repository.activities.length, 1);
  assert.equal(session.completed, 1);
});
test("practice a selected word even before due, using the full distractor pool", async () => {
  const { repository, engine } = setup();
  repository.settings.dailyNew = 0;
  const s = await engine.create(mode, {
    strategy: "practice",
    predicate: (i) => i.id === "3",
  });
  assert.equal(s.total, 1);
  assert.equal(s.current().question.pool, 10);
});
test("weak practice includes future-due failed cards and excludes untouched content", async () => {
  const { engine, repository, scheduler } = setup();
  repository.reviews = [
    {
      ...scheduler.create("2", "test", new Date()),
      lapses: 2,
      reps: 3,
      dueAt: "2099-01-01T00:00:00Z",
    },
  ];
  const s = await engine.create(mode, { strategy: "weak" });
  assert.equal(s.total, 1);
  assert.equal(s.current().item.id, "2");
});
test("legacy backup accepted; invalid records, dates and goal rejected", () => {
  const backup = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    reviews: [],
    settings: defaultSettings,
  };
  validateSnapshot(backup);
  assert.throws(() => validateSnapshot({ ...backup, reviews: [{ key: "x" }] }));
  assert.throws(() =>
    validateSnapshot({
      ...backup,
      notebook: { ...defaultNotebook, dailyGoal: NaN },
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      ...backup,
      activities: [
        {
          id: "x",
          at: "not a date",
          itemId: "a",
          modeId: "a",
          correct: true,
          isNew: false,
        },
      ],
    }),
  );
  assert.throws(() =>
    validateSnapshot({
      ...backup,
      settings: { ...defaultSettings, dailyNew: 1.5 },
    }),
  );
});
test("local calendar streak includes yesterday until the learner studies today", () => {
  const now = new Date(2026, 8, 19, 10);
  const event = (d) => ({
    at: new Date(2026, 8, d, 12).toISOString(),
    isNew: false,
    correct: true,
  });
  assert.equal(activitySummary([event(17), event(18)], now).streak, 2);
  assert.equal(activitySummary([event(16), event(18)], now).streak, 1);
  assert.equal(
    recentDays(3, now).join(","),
    "2026-09-17,2026-09-18,2026-09-19",
  );
  assert.equal(dateKey(now), "2026-09-19");
});
test("every lesson has a valid, unambiguous keyed answer and unique ID", () => {
  for (const lessons of [grammar, readings]) {
    assert.equal(new Set(lessons.map((l) => l.id)).size, lessons.length);
    for (const l of lessons) {
      assert.equal(l.check.options.length, 4);
      assert.ok(l.check.options[l.check.answer]);
      assert.equal(new Set(l.check.options).size, 4);
      assert.ok(l.check.explanation.length > 5);
    }
  }
});


test("verified lyric deck rotates supported artists fairly and keeps unsupported artists pending", async () => {
  const catalog = JSON.parse(
    await readFile(new URL("../public/data/verified-lyrics.json", import.meta.url), "utf8"),
  );
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => catalog,
  });

  try {
    const artists = [
      { id: "yoasobi", name: "YOASOBI" },
      { id: "vaundy", name: "Vaundy" },
      { id: "pending", name: "未驗證測試歌手" },
    ];
    const coverage = await verifiedArtistCoverage(artists);
    assert.ok(coverage.find((item) => item.artistId === "vaundy")?.count > 0);
    assert.equal(coverage.find((item) => item.artistId === "pending")?.count, 0);

    const firstCycle = await Promise.all(
      [0, 1].map((index) => verifiedDeckLesson(artists, "2026-09-19", index)),
    );
    assert.deepEqual(
      new Set(firstCycle.map((lesson) => lesson.artistId)),
      new Set(["yoasobi", "vaundy"]),
    );
    assert.ok(firstCycle.every((lesson) => lesson.artistId !== "pending"));
    for (const lesson of firstCycle) {
      if (!lesson.words?.length) continue;
      assert.equal(lesson.words.map((word) => word.text).join(""), lesson.lineJa);
      for (let index = 1; index < lesson.words.length; index += 1) {
        assert.ok(lesson.words[index].startSeconds >= lesson.words[index - 1].startSeconds);
      }
    }

    const secondCycle = await Promise.all(
      [2, 3].map((index) => verifiedDeckLesson(artists, "2026-09-19", index)),
    );
    assert.deepEqual(
      new Set(secondCycle.map((lesson) => lesson.artistId)),
      new Set(["yoasobi", "vaundy"]),
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});


test("vocabulary examples expose hiragana and Chinese without English fallback", () => {
  const question = vocabFlashcardMode.createQuestion({
    id: "vocab:test:classroom",
    kind: "vocabulary",
    expression: "教室",
    reading: "きょうしつ",
    meaningsZhTw: ["教室"],
    jlpt: "N5",
    tags: [],
    examples: [{
      ja: "教室は生徒でいっぱいだった。",
      kana: "きょうしつはせいとでいっぱいだった。",
      zhTw: "教室裡擠滿了學生。",
      en: "The classroom was full of pupils.",
      source: "tatoeba",
      sourceId: "180166",
    }],
    order: 1,
  }, { allItems: [], random: () => 0.5 });

  assert.equal(question.type, "flashcard");
  assert.equal(question.example?.kana, "きょうしつはせいとでいっぱいだった。");
  assert.equal(question.example?.translation, "教室裡擠滿了學生。");
  assert.equal(question.example?.translationLabel, "中文");
  assert.equal("romaji" in (question.example ?? {}), false);

  const noChinese = vocabFlashcardMode.createQuestion({
    id: "vocab:test:no-chinese",
    kind: "vocabulary",
    expression: "教室",
    reading: "きょうしつ",
    meaningsZhTw: ["教室"],
    jlpt: "N5",
    tags: [],
    examples: [{
      ja: "教室です。",
      kana: "きょうしつです。",
      en: "It is a classroom.",
      source: "tatoeba",
    }],
    order: 2,
  }, { allItems: [], random: () => 0.5 });
  assert.equal(noChinese.type, "flashcard");
  assert.equal(noChinese.example?.translation, undefined);
  assert.equal(noChinese.example?.translationLabel, undefined);
});


test("trusted karaoke timings are normalized without inventing timing", () => {
  const precise = normalizeKaraokeTimings([
    { text: "ここ", startSeconds: 3.3, endSeconds: 3.8 },
    { text: "に", startSeconds: 3.78, endSeconds: 4.0 },
  ], 3.2, 6.46);
  assert.equal(precise?.length, 2);
  assert.ok((precise?.[1]?.startSeconds ?? 0) >= 3.74);
  assert.equal(normalizeKaraokeTimings(undefined, 3.2, 6.46), undefined);
  assert.equal(normalizeKaraokeTimings([
    { text: "", startSeconds: 3.3, endSeconds: 3.8 },
  ], 3.2, 6.46), undefined);
});

