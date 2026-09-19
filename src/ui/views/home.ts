import type { AppContext } from "../../app/context.js";
import type { JlptLevel, VocabularyItem } from "../../domain/models.js";
import {
  activitySummary,
  dateKey,
  recentDays,
} from "../../features/progress/activity.js";
import { studyHref } from "../router.js";
import { icons } from "../components/icons.js";
import { escapeHtml as esc } from "../html.js";
import { speakJapanese } from "../speech.js";

export async function renderHome(
  root: HTMLElement,
  context: AppContext,
): Promise<void> {
  const [reviews, settings, activities, notebook] = await Promise.all([
    context.repository.getAllReviews(),
    context.repository.getSettings(),
    context.repository.getActivities(),
    context.repository.getNotebook(),
  ]);
  const now = new Date(),
    summary = activitySummary(activities, now);
  const due = reviews.filter((r) => {
    const item = context.content.getById(r.itemId);
    return (
      context.scheduler.isDue(r, now) &&
      (item?.kind === "vocabulary"
        ? item.jlpt === notebook.level
        : item?.kind === "kana" &&
          settings.enabledKanaGroups.includes(item.group))
    );
  }).length;
  const weak = new Set(reviews.filter((r) => r.lapses > 0).map((r) => r.itemId))
    .size;
  const words = context.content.getAll({
    kind: "vocabulary",
  }) as VocabularyItem[];
  const levelWords = words.filter((w) => w.jlpt === notebook.level);
  const seed =
    [...dateKey(now)].reduce((s, c) => s * 31 + c.charCodeAt(0), 0) >>> 0;
  const word = levelWords[seed % levelWords.length];
  const percent = Math.min(
    100,
    Math.round((summary.today / notebook.dailyGoal) * 100),
  );
  const todayLabel = new Intl.DateTimeFormat("zh-TW", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(now);
  const greet =
    now.getHours() < 12
      ? "早安，慢慢來。"
      : now.getHours() < 18
        ? "留一點時間，給日文。"
        : "晚安前，再學一點。";
  const shortcut = (url: string, symbol: string, title: string, desc: string) =>
    `<a class="practice-tile" href="${url}"><span class="tile-symbol" aria-hidden="true">${symbol}</span><strong>${title}</strong><p>${desc}</p><span class="tile-arrow" aria-hidden="true">↗</span></a>`;
  root.innerHTML = `<section class="daily-heading"><div><p class="eyebrow">${todayLabel}</p><h1>${greet}</h1></div><a class="streak-pill" href="#/stats">${summary.streak ? `${summary.streak} 天，持續累積` : "從今天開始累積"} <span>↗</span></a></section>
    <div class="today-grid"><section class="daily-plan"><div class="lesson-top"><p class="eyebrow">YOUR DAILY PRACTICE</p><label class="level-select">學習程度 <select id="daily-level">${["N5", "N4", "N3", "N2", "N1"].map((l) => `<option ${l === notebook.level ? "selected" : ""}>${l}</option>`).join("")}</select></label></div><div class="daily-plan-title"><div><h2>今天的一小步</h2><p>${due ? `${due} 張到期卡片，從熟悉的地方開始。` : "先回想，再看答案。讓記憶多留一天。"}</p></div><div class="goal-ring" style="--progress:${percent}%" role="img" aria-label="每日目標完成 ${percent}%"><div><strong>${summary.today}</strong><small>/ ${notebook.dailyGoal} 題</small></div></div></div><a class="primary-button daily-start" href="${studyHref("daily-mixed", { jlpt: notebook.level })}">開始今日練習 <span>→</span></a><div class="plan-details"><span>到期優先 · 最多 ${settings.sessionSize} 題</span><span>今日還可學 ${Math.max(0, settings.dailyNew - summary.todayNew)} 張新卡</span></div><div class="week-strip" aria-label="近七天學習紀錄">${recentDays(
      7,
      now,
    )
      .map(
        (d, i) =>
          `<div class="${summary.counts.has(d) ? "is-active" : ""} ${d === dateKey(now) ? "is-today" : ""}"><span>${["日", "一", "二", "三", "四", "五", "六"][new Date(`${d}T12:00:00`).getDay()]}</span><b title="${d}：${summary.counts.get(d) ?? 0} 題">${summary.counts.has(d) ? "✓" : i === 6 ? "·" : "—"}</b></div>`,
      )
      .join("")}</div></section>
    <aside class="daily-word"><div class="lesson-top"><p class="eyebrow">一日一語</p><span>${notebook.level}</span></div>${word ? `<div class="daily-word-center"><p lang="ja">${esc(word.reading)}</p><h2 lang="ja">${esc(word.expression)}</h2><p>${esc(word.meaningsZhTw.slice(0, 2).join("；"))}</p></div><div class="daily-word-actions"><button class="icon-button" id="daily-speak" aria-label="播放今日單字">${icons.volume}</button><a class="quiet-link" href="${studyHref("vocab-flashcard", { item: word.id, strategy: "practice" })}">細讀這張詞卡 →</a></div>` : "<p>先從五十音開始。</p>"}</aside></div>
    <section class="focus-strip"><a href="${studyHref("daily-mixed", { strategy: "weak" })}"><span class="focus-icon">↺</span><div><strong>再見一次，難記的字</strong><p>${weak ? `${weak} 個曾忘記的項目，集中練習` : "作答後，曾忘記的項目會出現在這裡"}</p></div><span>→</span></a><a href="#/library?saved=1"><span class="focus-icon">♡</span><div><strong>我的詞彙筆記</strong><p>${notebook.savedIds.length} 個收藏 · 搜尋與自主複習</p></div><span>→</span></a></section>
    <section class="section"><div class="section-heading"><div><p class="eyebrow">MAKE IT YOURS</p><h2>今天，想怎麼學？</h2></div><a class="quiet-link" href="#/studio">打開練習室 →</a></div><div class="practice-grid">${shortcut("#/kana", "あ", "五十音", "平假名、片假名與聽音辨字")}${shortcut("#/library", "語", "單字筆記", `${words.length.toLocaleString()} 詞 · 搜尋、收藏、複習`)}${shortcut("#/studio?tab=grammar", "文", "文法手帖", "12 個句型，理解後馬上練習")}${shortcut("#/studio?tab=reading", "本", "小篇閱讀", "四篇生活短文，慢慢讀懂")}${shortcut("#/studio?tab=speaking", "話", "情境口說", "旅行、課堂與工作的開口練習")}${shortcut("#/lyrics", "♪", "在歌裡學", "聽原曲片段，再主動回想")}</div></section>
    <section class="section"><div class="section-heading"><div><p class="eyebrow">FOUNDATION & RECALL</p><h2>練到熟悉，自然想起</h2></div></div><div class="mode-list two-column">${[
      ["kana-recognition", "平假名辨識", "hiragana"],
      ["kana-recognition", "片假名辨識", "katakana"],
      ["kana-audio-choice", "聽音辨字", ""],
      ["kana-recall", "主動輸入", "hiragana"],
      ["kana-script-pair", "平片轉換", ""],
      ["vocab-audio-meaning", "單字聽力", ""],
    ]
      .map(
        ([mode, title, script]) =>
          `<a class="mode-card" href="${studyHref(mode!, { ...(script ? { script } : {}), scope: "basic", jlpt: notebook.level })}"><span class="mode-icon">${mode!.includes("audio") ? icons.volume : icons.kana}</span><div><strong>${title}</strong><span>${mode!.startsWith("vocab") ? notebook.level : "基礎清音"} · 少量練習</span></div><b>${icons.arrow}</b></a>`,
      )
      .join(
        "",
      )}</div></section><p class="home-footnote">ことばを、少しずつ。<span>每天一點，慢慢成為自己的語言。</span></p>`;
  root.querySelector("#daily-speak")?.addEventListener("click", () => {
    if (word) speakJapanese(word.reading);
  });
  root.querySelector<HTMLSelectElement>("#daily-level")!.onchange = async (
    e,
  ) => {
    const select = e.target as HTMLSelectElement;
    select.disabled = true;
    try {
      const latest = await context.repository.getNotebook();
      await context.repository.putNotebook({
        ...latest,
        level: select.value as JlptLevel,
      });
      if (root.isConnected) await renderHome(root, context);
    } catch {
      select.disabled = false;
      select.value = notebook.level;
    }
  };
}
