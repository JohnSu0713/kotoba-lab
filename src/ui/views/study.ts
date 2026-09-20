import type { AppContext } from "../../app/context.js";
import type { Rating, Script, VocabularyItem } from "../../domain/models.js";
import { buildLearningPath } from "../../features/path/curriculum.js";
import type {
  FlashcardQuestion,
  StudyQuestion,
} from "../../core/contracts/study-mode.js";
import { icons } from "../components/icons.js";
import { speakJapanese } from "../speech.js";
import { studyHref } from "../router.js";
import { giveAnswerFeedback } from "../answer-feedback.js";

type FeedbackState = {
  correct: boolean;
  answer: string;
  question: StudyQuestion;
  position: number;
  sourceModeTitle: string;
};

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        char
      ] ?? char,
  );
}

function correctLabel(question: StudyQuestion): string {
  if (question.type === "choice") {
    return (
      question.choices.find((choice) => choice.value === question.correctValue)
        ?.label ?? question.correctValue
    );
  }
  if (question.type === "text") return question.acceptedAnswers.join(" / ");
  return question.back;
}

function predicateFor(
  params: URLSearchParams,
  enabledGroups: string[],
): (item: import("../../domain/models.js").ContentItem) => boolean {
  const script = params.get("script") as Script | null;
  const scope = params.get("scope");
  const jlpt = params.get("jlpt");
  return (item) => {
    if (item.kind === "kana") {
      if (script && item.script !== script) return false;
      if (scope === "basic" && item.group !== "gojuon") return false;
      if (scope !== "basic" && !enabledGroups.includes(item.group))
        return false;
    }
    if (item.kind === "vocabulary" && jlpt && item.jlpt !== jlpt) return false;
    return true;
  };
}

function renderFlashcard(
  question: FlashcardQuestion,
  revealed: boolean,
): string {
  const chips = question.chips ?? [];
  const collocations = question.collocations ?? [];
  const details = question.details ?? [];
  const interactive = revealed
    ? ""
    : ' role="button" tabindex="0" aria-label="翻看答案"';
  return `
    <div class="vocab-flip-card ${revealed ? "is-flipped" : ""}" data-flip-card${interactive}>
      <div class="vocab-flip-inner">
        <article class="vocab-face vocab-front" aria-hidden="${revealed}">
          <div class="vocab-face-top">
            ${question.badge ? `<span class="vocab-level-badge">${escapeHtml(question.badge)}</span>` : "<span></span>"}
            <span class="vocab-side-label">QUESTION</span>
          </div>
          <div class="vocab-front-main">
            <div class="vocab-expression">${escapeHtml(question.front)}</div>
          </div>
          <div class="vocab-front-hint"><span>先回想讀音、意思與用法</span><span aria-hidden="true">↻</span></div>
        </article>

        <article class="vocab-face vocab-back" aria-hidden="${!revealed}">
          <div class="vocab-face-top">
            ${question.badge ? `<span class="vocab-level-badge">${escapeHtml(question.badge)}</span>` : "<span></span>"}
            <span class="vocab-side-label">ANSWER</span>
          </div>
          <div class="vocab-answer-block">
            ${question.frontSub ? `<div class="vocab-answer-reading" lang="ja">${escapeHtml(question.frontSub)}</div>` : ""}
            <p class="vocab-answer-label">意思</p>
            <div class="vocab-meaning">${escapeHtml(question.back)}</div>
            ${chips.length ? `<div class="vocab-pos-chips">${chips.map((chip) => `<span>${escapeHtml(chip)}</span>`).join("")}</div>` : ""}
            ${collocations.length ? `<div class="vocab-collocations"><small>常用搭配</small><div>${collocations.map((value) => `<span lang="ja">${escapeHtml(value)}</span>`).join("")}</div></div>` : ""}
          </div>
          ${
            question.example
              ? `
            <div class="vocab-example">
              <div class="vocab-example-head">
                <span>例句</span>
                <div class="vocab-example-tools">
                  ${question.example.sourceLabel ? `<small>${escapeHtml(question.example.sourceLabel)}</small>` : ""}
                  <button class="vocab-example-speak" type="button" data-example-speak aria-label="播放例句發音" title="播放例句發音">${icons.volume}</button>
                </div>
              </div>
              <p class="vocab-example-ja" lang="ja">${escapeHtml(question.example.ja)}</p>
              ${question.example.kana ? `<p class="vocab-example-kana" lang="ja">${escapeHtml(question.example.kana)}</p>` : ""}
              ${question.example.translation ? `<div class="vocab-example-translation"><small>${escapeHtml(question.example.translationLabel ?? "翻譯")}</small><span>${escapeHtml(question.example.translation)}</span></div>` : ""}
            </div>`
              : `
            <div class="vocab-example vocab-example-empty">
              <div class="vocab-example-head"><span>例句</span></div>
              <p>這個詞目前沒有經過篩選的例句；先以詞義與詞性建立記憶。</p>
            </div>`
          }
          ${details.length ? `<dl class="vocab-details">${details.map((detail) => `<div><dt>${escapeHtml(detail.label)}</dt><dd>${escapeHtml(detail.value)}</dd></div>`).join("")}</dl>` : ""}
          ${question.sourceNote ? `<p class="vocab-source-note">${escapeHtml(question.sourceNote)}</p>` : ""}
        </article>
      </div>
    </div>`;
}

function ratingControls(): string {
  return `
    <div class="rating-intro"><span>這次記得多清楚？</span><small>你的評分會決定下次出現時間</small></div>
    <div class="rating-grid">
      <button data-rating="again"><strong>Again</strong><small>忘了</small></button>
      <button data-rating="hard"><strong>Hard</strong><small>有點勉強</small></button>
      <button data-rating="good"><strong>Good</strong><small>記得</small></button>
      <button data-rating="easy"><strong>Easy</strong><small>很熟</small></button>
    </div>`;
}

export async function renderStudy(
  root: HTMLElement,
  context: AppContext,
  params: URLSearchParams,
): Promise<void> {
  const modeId = params.get("mode");
  if (!modeId) {
    root.innerHTML =
      '<section class="empty"><h2>缺少學習模式</h2><a href="#/">回首頁</a></section>';
    return;
  }

  const settings = await context.repository.getSettings();
  const notebook = await context.repository.getNotebook();
  const savedIds = new Set(notebook.savedIds);
  const isMixed = modeId === "daily-mixed";
  const mode = isMixed
    ? undefined
    : context.modes.list().find((m) => m.id === modeId);
  if (!isMixed && !mode) {
    root.innerHTML =
      '<section class="empty-state"><h2>找不到這個練習模式</h2><a href="#/">回到今日</a></section>';
    return;
  }
  const strategy =
    params.get("strategy") === "weak"
      ? "weak"
      : params.get("strategy") === "practice"
        ? "practice"
        : "scheduled";
  const pathUnitOrder = Number(params.get("pathUnit") ?? "");
  const pathLessonOrder = Number(params.get("pathLesson") ?? "");
  const isPathSession = params.get("path") === "1";
  const isFoundationSession = params.get("path") === "foundation";
  const pathUnit = Number.isInteger(pathUnitOrder)
    ? buildLearningPath(
        context.content.getAll({ kind: "vocabulary" }) as VocabularyItem[],
      ).find((unit) => unit.order === pathUnitOrder)
    : undefined;
  const pathLesson = pathUnit && Number.isInteger(pathLessonOrder)
    ? pathUnit.lessons.find((lesson) => lesson.order === pathLessonOrder)
    : undefined;
  const pathIds = pathLesson ? new Set(pathLesson.vocabularyIds) : undefined;
  const pageTitle = isFoundationSession
    ? "Foundation · 五十音"
    : isPathSession && pathUnit && pathLesson
      ? `${pathUnit.level} · Unit ${pathUnit.order} · ${pathUnit.topicTitle} · Lesson ${pathLesson.order}/10`
      : strategy === "weak"
        ? "弱項再練習"
        : isMixed
          ? "今日混合練習"
          : mode!.title;
  const basePredicate = predicateFor(params, settings.enabledKanaGroups);
  const predicate = (item: import("../../domain/models.js").ContentItem) =>
    basePredicate(item) &&
    (!params.get("item") || item.id === params.get("item")) &&
    (params.get("saved") !== "1" || savedIds.has(item.id));
  const mixedModes = context.modes
    .list()
    .filter(
      (candidate) =>
        candidate.id.startsWith("kana-") || candidate.id.startsWith("vocab-"),
    );

  root.innerHTML = `<section class="loading">正在準備 ${escapeHtml(pageTitle)}…</section>`;
  const requestedLimit = Number(params.get("limit") ?? "");
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? requestedLimit
    : isPathSession
      ? 16
      : isFoundationSession
        ? 15
        : undefined;
  const sessionFilter: import("../../features/study/session-engine.js").SessionFilter = {
    predicate,
    strategy,
    ...(limit !== undefined ? { limit } : {}),
    ...(isPathSession && pathIds ? {
      freshPredicate: (item: import("../../domain/models.js").ContentItem) => pathIds.has(item.id),
      dueLimit: 6,
      ignoreDailyNewLimit: true,
    } : {}),
    ...(isFoundationSession ? {
      dueLimit: 4,
      ignoreDailyNewLimit: true,
    } : {}),
  };
  const session = isMixed
    ? await context.sessions.createMixed(mixedModes, sessionFilter)
    : await context.sessions.create(mode!, sessionFilter);
  let feedback: FeedbackState | undefined;
  let revealed = false;
  let submitting = false;
  let correctCount = 0;
  const missedIds = new Set<string>();
  const startedAt = Date.now();
  const saveAnswer = async (answer: string, rating?: Rating) => {
    if (submitting) return undefined;
    submitting = true;
    root
      .querySelectorAll<HTMLButtonElement>(
        '[data-choice], [data-rating], button[type="submit"]',
      )
      .forEach((b) => (b.disabled = true));
    const itemId = session.current()?.item.id;
    try {
      const outcome = await session.submit(answer, rating);
      if (outcome.correct) correctCount++;
      else if (itemId) missedIds.add(itemId);
      return outcome;
    } catch {
      const status = root.querySelector("#study-status");
      if (status) status.textContent = "未能儲存作答，請再試一次。";
      root
        .querySelectorAll<HTMLButtonElement>(
          '[data-choice], [data-rating], button[type="submit"]',
        )
        .forEach((b) => (b.disabled = false));
      return undefined;
    } finally {
      submitting = false;
    }
  };
  root.tabIndex = -1;
  root.onkeydown = (event) => {
    if (
      event.isComposing ||
      event.repeat ||
      event.ctrlKey ||
      event.metaKey ||
      event.altKey ||
      (event.target as HTMLElement).matches("input,textarea,select")
    )
      return;
    let target: HTMLElement | null = null;
    if (event.key === " " || event.key === "Enter") {
      if ((event.target as HTMLElement).closest('button,a,[role="button"]'))
        return;
      target = root.querySelector(
        '[data-action="next"], [data-action="reveal"]',
      );
    } else if (/^[1-4]$/.test(event.key)) {
      target =
        root.querySelectorAll<HTMLElement>("[data-choice], [data-rating]")[
          Number(event.key) - 1
        ] ?? null;
    } else if (event.key.toLowerCase() === "r")
      target = root.querySelector('[data-action="speak"]');
    if (target) {
      event.preventDefault();
      target.click();
    }
  };

  const draw = (): void => {
    if (!feedback && session.isDone && session.total > 0) {
      root.innerHTML = `
        <section class="study-shell complete-card">
          <a class="back-link" href="#/">← 首頁</a>
          <div class="completion-mark">✓</div>
          <p class="eyebrow">${isPathSession || isFoundationSession ? "PATH COMPLETE" : "SESSION COMPLETE"}</p>
          <h1>${isPathSession ? "這一課完成了" : isFoundationSession ? "這一段 Foundation 完成了" : "今天這組完成了"}</h1>
          <p>完成 ${session.total} 題 · ${Math.max(1, Math.round((Date.now() - startedAt) / 60000))} 分鐘。記憶排程已儲存。</p>
          <div class="session-summary"><div><strong>${correctCount}</strong><span>答對或自評記得</span></div><div><strong>${missedIds.size}</strong><span>需要再回想的項目</span></div></div>
          ${!isPathSession && !isFoundationSession && missedIds.size ? `<a class="secondary-button" href="${studyHref("daily-mixed", { strategy: "weak" })}">再練習弱項 →</a>` : ""}
          <a class="primary-button" href="#/">${isPathSession || isFoundationSession ? "回到路徑，繼續下一步" : "回到今日"}</a>
        </section>`;
      return;
    }

    const card = feedback ? undefined : session.current();
    if (!feedback && !card) {
      root.innerHTML = `
        <section class="study-shell complete-card">
          <a class="back-link" href="#/">← 首頁</a>
          <p class="eyebrow">ALL CLEAR</p>
          <h1>${strategy === "weak" ? "還沒有需要加強的項目" : params.get("saved") === "1" ? "先收藏想練習的字" : "這一輪，可以先休息了"}</h1>
          <p>${isPathSession || isFoundationSession ? "這一課目前沒有待完成項目。回到主線會自動帶你到下一步。" : strategy === "scheduled" ? "目前沒有到期卡片，或今日新卡額度已用完。也可以到練習室讀一篇短文。" : "完成一般練習或收藏詞彙後，再回來看看。"}</p>
          ${isPathSession || isFoundationSession ? "" : '<a class="secondary-button" href="#/studio">到練習室 →</a>'}
          <a class="primary-button" href="#/">${isPathSession || isFoundationSession ? "回到學習路徑" : "選其他模式"}</a>
        </section>`;
      return;
    }

    const q = feedback?.question ?? card!.question;
    const sourceModeTitle = feedback?.sourceModeTitle ?? card!.mode.title;
    const questionNumber = feedback?.position ?? session.completed + 1;
    const progress =
      session.total === 0
        ? 0
        : Math.round((session.completed / session.total) * 100);
    root.innerHTML = `
      <section class="study-shell ${q.type === "flashcard" ? "vocab-study-shell" : ""}">
        <header class="study-topbar">
          <a class="back-link" href="#/">← 離開</a>
          <div class="study-mode-name">${escapeHtml(pageTitle)}</div>
          <div class="study-count">${questionNumber}/${session.total}</div>
        </header>
        <div class="progress-track" role="progressbar" aria-label="本組進度" aria-valuenow="${progress}" aria-valuemin="0" aria-valuemax="100"><span style="width:${progress}%"></span></div>
        <p id="study-status" role="status"></p>
        <main class="question-card ${q.type === "flashcard" ? "vocab-question-card" : ""}">
          ${card?.item.kind === "vocabulary" ? `<button class="study-bookmark filter-chip" data-bookmark="${escapeHtml(card.item.id)}" aria-pressed="${savedIds.has(card.item.id)}">${savedIds.has(card.item.id) ? "♥ 已收藏" : "♡ 收藏"}</button>` : ""}
          ${isMixed ? `<div class="mixed-mode-chip">${escapeHtml(sourceModeTitle)}</div>` : ""}
          ${q.speakText ? `<button class="speaker" data-action="speak" aria-label="播放日文發音">${icons.volume}</button>` : ""}
          ${
            q.type === "flashcard"
              ? renderFlashcard(q, revealed)
              : `
            <div class="question-prompt">${escapeHtml(q.prompt)}</div>
            ${q.subtitle ? `<div class="question-sub">${escapeHtml(q.subtitle)}</div>` : ""}`
          }

          ${
            feedback
              ? `
            <div class="feedback ${feedback.correct ? "correct" : "wrong"}">
              <strong>${feedback.correct ? "答對了" : "再加深一次"}</strong>
              ${feedback.correct ? "" : `<span>正確答案：${escapeHtml(feedback.answer)}</span>`}
            </div>
            <button class="primary-button wide" data-action="next">下一題</button>
          `
              : q.type === "flashcard"
                ? `<div class="flashcard-actions">${revealed ? ratingControls() : '<button class="primary-button wide reveal flip-reveal" data-action="reveal"><span>翻看答案</span><b aria-hidden="true">↻</b></button>'}</div>`
                : renderQuestion(q)
          }
        </main><p class="keyboard-hint">空白鍵：翻卡／下一題 · 1–4：作答 · R：重播</p>
      </section>`;

    root.focus({ preventScroll: true });
    root
      .querySelector<HTMLButtonElement>("[data-bookmark]")
      ?.addEventListener("click", async (event) => {
        const b = event.currentTarget as HTMLButtonElement;
        b.disabled = true;
        const id = b.dataset.bookmark!;
        try {
          const latest = await context.repository.getNotebook();
          const ids = new Set(latest.savedIds);
          if (ids.has(id)) ids.delete(id);
          else ids.add(id);
          await context.repository.putNotebook({
            ...latest,
            savedIds: [...ids],
          });
          savedIds.clear();
          ids.forEach((v) => savedIds.add(v));
          b.textContent = ids.has(id) ? "♥ 已收藏" : "♡ 收藏";
          b.setAttribute("aria-pressed", String(ids.has(id)));
        } catch {
          root.querySelector("#study-status")!.textContent =
            "收藏未能儲存，請再試一次。";
        } finally {
          b.disabled = false;
        }
      });
    if (q.type === "flashcard" && revealed) {
      const flip = root.querySelector<HTMLElement>("[data-flip-card]");
      if (
        flip &&
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ) {
        flip.classList.remove("is-flipped");
        requestAnimationFrame(() =>
          requestAnimationFrame(() => flip.classList.add("is-flipped")),
        );
      }
    }

    root
      .querySelector<HTMLElement>('[data-action="speak"]')
      ?.addEventListener("click", () => {
        if (q.speakText) speakJapanese(q.speakText);
      });

    root
      .querySelector<HTMLButtonElement>("[data-example-speak]")
      ?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (q.type === "flashcard" && q.example?.ja) {
          speakJapanese(q.example.ja);
        }
      });

    if (feedback) {
      root
        .querySelector('[data-action="next"]')
        ?.addEventListener("click", () => {
          feedback = undefined;
          revealed = false;
          draw();
          root.focus();
        });
      return;
    }

    if (q.type === "choice") {
      root
        .querySelectorAll<HTMLButtonElement>("[data-choice]")
        .forEach((button) => {
          button.addEventListener("click", async () => {
            button.disabled = true;
            const answer = button.dataset.choice ?? "";
            const expected = correctLabel(q);
            const answeredQuestion = q;
            const answeredModeTitle = card!.mode.title;
            const position = session.completed + 1;
            const outcome = await saveAnswer(answer);
            if (!outcome) return;
            feedback = {
              correct: outcome.correct,
              answer: expected,
              question: answeredQuestion,
              position,
              sourceModeTitle: answeredModeTitle,
            };
            draw();
            giveAnswerFeedback(
              answeredQuestion.speakText,
              outcome.correct,
              settings.speakAnswers,
            );
          });
        });
    } else if (q.type === "text") {
      const form = root.querySelector<HTMLFormElement>("#text-answer");
      form?.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.elements.namedItem("answer") as HTMLInputElement;
        const submitButton = form.querySelector<HTMLButtonElement>(
          'button[type="submit"]',
        );
        if (submitButton) submitButton.disabled = true;
        const expected = correctLabel(q);
        const answeredQuestion = q;
        const answeredModeTitle = card!.mode.title;
        const position = session.completed + 1;
        const outcome = await saveAnswer(input.value);
        if (!outcome) return;
        feedback = {
          correct: outcome.correct,
          answer: expected,
          question: answeredQuestion,
          position,
          sourceModeTitle: answeredModeTitle,
        };
        draw();
        giveAnswerFeedback(
          answeredQuestion.speakText,
          outcome.correct,
          settings.speakAnswers,
        );
      });
      root.querySelector<HTMLInputElement>('input[name="answer"]')?.focus();
    } else if (q.type === "flashcard") {
      const reveal = (): void => {
        if (revealed) return;
        revealed = true;
        draw();
        // The learner receives the answer at reveal time. Pronunciation/haptics
        // should reinforce that moment, not the later SRS self-rating.
        giveAnswerFeedback(q.speakText, true, settings.speakAnswers);
      };
      root
        .querySelector('[data-action="reveal"]')
        ?.addEventListener("click", reveal);
      const flipCard = root.querySelector<HTMLElement>("[data-flip-card]");
      flipCard?.addEventListener("click", reveal);
      flipCard?.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          reveal();
        }
      });
      root
        .querySelectorAll<HTMLButtonElement>("[data-rating]")
        .forEach((button) => {
          button.addEventListener("click", async () => {
            button.disabled = true;
            const rating = button.dataset.rating as Rating;
            const outcome = await saveAnswer("", rating);
            if (!outcome) return;
            revealed = false;
            draw();
          });
        });
    }
  };

  draw();
  root.focus();
}

function renderQuestion(question: StudyQuestion): string {
  if (question.type === "choice") {
    return `<div class="choice-grid">${question.choices.map((choice) => `<button data-choice="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</button>`).join("")}</div>`;
  }
  if (question.type === "text") {
    return `<form id="text-answer" class="text-answer"><input name="answer" aria-label="輸入答案" required autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(question.placeholder)}"><button class="primary-button" type="submit">確認</button></form>`;
  }
  return "";
}
