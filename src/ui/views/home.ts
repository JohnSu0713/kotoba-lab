import type { AppContext } from "../../app/context.js";
import type { KanaItem, VocabularyItem } from "../../domain/models.js";
import {
  buildLearningPath,
  CURRICULUM_VERSION,
  PATH_STAGES,
  PATH_UNIT_COUNT,
  TOTAL_PATTERN_TARGET,
  TOTAL_VOCABULARY_TARGET,
} from "../../features/path/curriculum.js";
import { learningPathSnapshot } from "../../features/path/progress.js";
import {
  activitySummary,
  dateKey,
  recentDays,
} from "../../features/progress/activity.js";
import { studyHref } from "../router.js";

function esc(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "'": "&#39;",
    '"': "&quot;",
  })[char] ?? char);
}

function continueHref(
  foundationDone: boolean,
  unitOrder?: number,
  lessonOrder?: number,
): string {
  if (!foundationDone) {
    return studyHref("kana-recognition", {
      scope: "basic",
      limit: "15",
      path: "foundation",
    });
  }
  if (!unitOrder || !lessonOrder) return "#/path";
  return studyHref("vocab-flashcard", {
    path: "1",
    pathUnit: String(unitOrder),
    pathLesson: String(lessonOrder),
    limit: "16",
  });
}

export async function renderHome(
  root: HTMLElement,
  context: AppContext,
): Promise<void> {
  const [reviews, notebook, activities] = await Promise.all([
    context.repository.getAllReviews(),
    context.repository.getNotebook(),
    context.repository.getActivities(),
  ]);
  const vocabulary = context.content.getAll({ kind: "vocabulary" }) as VocabularyItem[];
  const kana = context.content.getAll({ kind: "kana" }) as KanaItem[];
  const foundationIds = kana
    .filter((item) => item.group === "gojuon")
    .map((item) => item.id);
  const units = buildLearningPath(vocabulary);
  const snapshot = learningPathSnapshot(
    units,
    reviews,
    foundationIds,
    notebook.path?.foundationSkipped ?? false,
  );
  const now = new Date();
  const activity = activitySummary(activities, now);
  const unit = snapshot.currentUnit;
  const lesson = snapshot.currentLesson;
  const stage = unit ? PATH_STAGES.find((item) => item.level === unit.level) : undefined;
  const due = reviews.filter((review) => context.scheduler.isDue(review, now)).length;
  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  const lessonDone = lesson
    ? lesson.vocabularyIds.filter((id) =>
        reviews.some((review) =>
          review.modeId === "vocab-flashcard" && review.itemId === id && review.reps > 0,
        ),
      ).length
    : 0;
  const lessonSize = lesson?.vocabularyIds.length ?? 0;
  const href = continueHref(snapshot.foundationDone, unit?.order, lesson?.order);
  const pathLabel = !snapshot.foundationDone
    ? "Foundation · 五十音"
    : unit && lesson
      ? `${unit.level} · Unit ${unit.order} · Lesson ${lesson.order}/10`
      : "Path complete";
  const pathTitle = !snapshot.foundationDone
    ? "先把日文的聲音讀起來。"
    : unit
      ? unit.topicTitle
      : "你走完了 Kotoba Path。";
  const pathCopy = !snapshot.foundationDone
    ? `平假名與片假名基本清音 ${snapshot.foundationReviewed}/${snapshot.foundationTotal}。完成後，主線從 N5 Unit 1 開始。`
    : unit && lesson
      ? `這一課固定 ${lessonSize} 個單字。完成後自動前進；複習會由記憶排程穿插，不需要自己選模式。`
      : "7,777 個固定單字已走完。接下來用歌詞與自由閱讀把日文變成真正的語感。";

  root.innerHTML = `
    <section class="path-home-heading">
      <div>
        <p class="eyebrow">${todayLabel}</p>
        <h1>只走一條路，慢慢走到 N1。</h1>
        <p>不用選今天要背單字、練五十音還是做哪個模式。Kotoba Path 會告訴你下一步。</p>
      </div>
      <a class="streak-pill" href="#/stats">${activity.streak ? `${activity.streak} 天連續` : "今天開始"} <span>↗</span></a>
    </section>

    <section class="path-hero-card">
      <div class="path-hero-copy">
        <div class="path-kicker">
          <span>CURRICULUM v${CURRICULUM_VERSION}</span>
          <strong>${esc(pathLabel)}</strong>
        </div>
        <h2>${esc(pathTitle)}</h2>
        <p>${esc(pathCopy)}</p>

        <div class="path-progress-track" role="progressbar" aria-label="主線單字進度" aria-valuenow="${snapshot.percent}" aria-valuemin="0" aria-valuemax="100">
          <span style="width:${snapshot.percent}%"></span>
        </div>
        <div class="path-progress-meta">
          <span><strong>${snapshot.pathVocabularyLearned.toLocaleString()}</strong> / ${TOTAL_VOCABULARY_TARGET.toLocaleString()} 主線單字</span>
          <span>Unit ${Math.min(PATH_UNIT_COUNT, Math.max(1, unit?.order ?? PATH_UNIT_COUNT))} / ${PATH_UNIT_COUNT}</span>
        </div>

        <div class="path-hero-actions">
          <a class="primary-button path-continue" href="${href}">${snapshot.foundationDone ? "繼續學習" : "開始 Foundation"} <span>→</span></a>
          <a class="quiet-link" href="#/path">查看完整 100 Units →</a>
        </div>

        ${!snapshot.foundationDone ? `
          <button class="path-skip-foundation" id="path-skip-foundation" type="button">我已熟悉五十音，從 N5 開始</button>
        ` : ""}
      </div>

      <aside class="path-today-card">
        <p class="eyebrow">NEXT LESSON</p>
        <strong>${snapshot.foundationDone && lesson ? `${lessonDone}/${lessonSize}` : `${snapshot.foundationReviewed}/${snapshot.foundationTotal}`}</strong>
        <span>${snapshot.foundationDone ? "本課單字" : "基本假名"}</span>
        <div class="path-today-rule"></div>
        <small>${due ? `${due} 個到期複習會自動穿插` : "目前沒有到期複習"}</small>
      </aside>
    </section>

    <section class="path-stat-row" aria-label="Kotoba Curriculum">
      <div><strong>7,777</strong><span>固定單字 · N5 → N1</span></div>
      <div><strong>600</strong><span>固定句型目標</span></div>
      <div><strong>100</strong><span>Units · 一條主線</span></div>
      <div><strong>${snapshot.vocabularyEncountered.toLocaleString()}</strong><span>已接觸的單字</span></div>
    </section>

    <section class="path-secondary-grid">
      <a class="path-immersion-card" href="#/lyrics">
        <div>
          <p class="eyebrow">IMMERSION</p>
          <h2>♪ 每日歌詞</h2>
          <p>主線負責系統性；歌詞保留成真實日文。聽原曲、跟著 Karaoke timing，再把學過的東西認出來。</p>
        </div>
        <span>進入歌詞 →</span>
      </a>

      <div class="path-week-card">
        <p class="eyebrow">THIS WEEK</p>
        <div class="path-week-strip">${recentDays(7, now).map((day) => {
          const active = activity.counts.has(day);
          const today = day === dateKey(now);
          const weekday = ["日","一","二","三","四","五","六"][new Date(day + "T12:00:00").getDay()];
          return `<div class="${active ? "is-active" : ""} ${today ? "is-today" : ""}"><span>${weekday}</span><b>${active ? "✓" : "·"}</b></div>`;
        }).join("")}</div>
        <p>${activity.today ? `今天已完成 ${activity.today} 題。` : "今天還沒開始，下一課已經替你排好。"}</p>
      </div>
    </section>

    <details class="path-free-practice">
      <summary>
        <span><strong>自由練習</strong><small>主線以外，需要時再打開</small></span>
        <b>＋</b>
      </summary>
      <div>
        <a href="#/kana">五十音表</a>
        <a href="#/library">單字筆記</a>
        <a href="#/studio?tab=grammar">文法手帖</a>
        <a href="#/studio?tab=reading">閱讀</a>
        <a href="#/studio?tab=speaking">口說</a>
      </div>
    </details>
  `;

  root.querySelector<HTMLButtonElement>("#path-skip-foundation")?.addEventListener("click", async () => {
    const latest = await context.repository.getNotebook();
    await context.repository.putNotebook({
      ...latest,
      path: {
        curriculumVersion: CURRICULUM_VERSION,
        foundationSkipped: true,
      },
    });
    if (root.isConnected) await renderHome(root, context);
  });
}
