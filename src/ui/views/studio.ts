import type { AppContext } from "../../app/context.js";
import {
  grammar,
  readings,
  scenes,
  type Check,
} from "../../features/studio/content.js";
import { escapeHtml as esc } from "../html.js";
import { speakJapanese } from "../speech.js";
import { icons } from "../components/icons.js";

export async function renderStudio(
  root: HTMLElement,
  context: AppContext,
  params: URLSearchParams,
): Promise<void> {
  const tab = ["grammar", "reading", "speaking"].includes(
    params.get("tab") ?? "",
  )
    ? params.get("tab")!
    : "grammar";
  const id = params.get("id");
  const activities = await context.repository.getActivities();
  const done = new Set(
    activities
      .filter((a) => a.correct && a.modeId.startsWith("studio-"))
      .map((a) => a.itemId),
  );
  let speed = 1;
  const speakButton = (text: string, label = "播放日文") =>
    `<button class="icon-button" data-speak="${esc(text)}" aria-label="${esc(label)}">${icons.volume}</button>`;
  const heading = `<section class="page-header"><p class="eyebrow">A LITTLE JAPANESE, EVERY DAY</p><h1>在句子裡，遇見日文。</h1><p>讀一小段、懂一個句型，再親口說一次。</p></section><nav class="studio-tabs" aria-label="練習室分類">${[
    ["grammar", "文法手帖"],
    ["reading", "小篇閱讀"],
    ["speaking", "情境口說"],
  ]
    .map(
      ([key, label]) =>
        `<a href="#/studio?tab=${key}" ${tab === key ? 'aria-current="page"' : ""}>${label}</a>`,
    )
    .join("")}</nav>`;
  const quiz = (check: Check) =>
    `<section class="comprehension"><p class="eyebrow">TRY IT</p><h3>${esc(check.prompt)}</h3><div class="check-options">${check.options.map((o, i) => `<button data-answer="${i}"><span>${i + 1}</span>${esc(o)}</button>`).join("")}</div><p id="check-feedback" role="status"></p></section>`;
  const toolbar = `<div class="reading-tools"><label><input id="show-reading" type="checkbox"> 顯示讀音</label><label><input id="show-translation" type="checkbox"> 顯示翻譯</label><label>語速 <select id="speech-speed"><option value="1">正常</option><option value="0.75">慢速</option></select></label></div>`;
  const lesson = grammar.find((g) => g.id === id),
    reading = readings.find((r) => r.id === id),
    scene = scenes.find((s) => s.id === id);
  let check: Check | undefined,
    activityId = "";
  if (tab === "grammar" && lesson) {
    check = lesson.check;
    activityId = `grammar:${lesson.id}`;
    root.innerHTML =
      heading +
      `<a class="back-link studio-back" href="#/studio?tab=grammar">← 所有句型</a><article class="lesson-paper"><div class="lesson-top"><span class="status-chip">${lesson.level}</span><span>${done.has(activityId) ? "已答對 ✓" : "一個句型，一次練習"}</span></div><h2 class="grammar-pattern" lang="ja">${esc(lesson.pattern)}</h2><h3>${lesson.title}</h3><p>${lesson.explanation}</p><div class="example-paper"><div class="phrase-line"><p lang="ja">${lesson.example}</p>${speakButton(lesson.reading)}</div><p class="pronunciation" lang="ja">${lesson.reading}</p><p>${lesson.translation}</p></div><aside class="lesson-note"><strong>留意一下</strong><p>${lesson.note}</p></aside>${quiz(check)}</article>`;
  } else if (tab === "reading" && reading) {
    check = reading.check;
    activityId = `reading:${reading.id}`;
    root.innerHTML =
      heading +
      `<a class="back-link studio-back" href="#/studio?tab=reading">← 所有短文</a><article class="lesson-paper"><div class="lesson-top"><span class="status-chip">${reading.tag}</span><span>約 ${reading.minutes} 分鐘 · 原創短文</span></div><h2 class="reading-title" lang="ja">${reading.title}</h2>${toolbar}<div class="reading-body">${reading.lines.map((line) => `<div class="reading-line"><div class="phrase-line"><p lang="ja">${line.ja}</p>${speakButton(line.reading, "朗讀這一句")}</div><p class="reading-hint pronunciation" hidden lang="ja">${line.reading}</p><p class="translation-hint" hidden>${line.zh}</p></div>`).join("")}</div><div class="reading-words"><h3>文中的小詞彙</h3>${reading.words.map(([word, kana, meaning]) => `<div><strong lang="ja">${word}</strong><span lang="ja">${kana}</span><span>${meaning}</span></div>`).join("")}</div>${quiz(check)}</article>`;
  } else if (tab === "speaking" && scene) {
    root.innerHTML =
      heading +
      `<a class="back-link studio-back" href="#/studio?tab=speaking">← 所有情境</a><article class="lesson-paper"><div class="lesson-top"><span class="status-chip">聽 → 跟讀 → 自己說</span><span>${scene.phrases.length} 句</span></div><h2 class="reading-title">${scene.title}</h2><p>先聽一次，跟著說；再遮住日文，看中文自己說。完成後可自行標記練習，不評估發音。</p><div class="reading-tools"><label><input id="hide-japanese" type="checkbox"> 遮住日文，試著自己說</label><label>語速 <select id="speech-speed"><option value="1">正常</option><option value="0.75">慢速</option></select></label></div><div class="speaking-lines">${scene.phrases.map((phrase, i) => `<section class="speaking-phrase"><div class="phrase-number">${String(i + 1).padStart(2, "0")}</div><div class="phrase-content"><p class="speaking-translation">${phrase.zh}</p><div class="phrase-line"><p class="japanese-hint" lang="ja">${phrase.ja}</p>${speakButton(phrase.reading)}</div><p class="japanese-hint pronunciation" lang="ja">${phrase.reading}</p><details><summary>說法小提醒</summary><p>${phrase.tip}</p></details><button class="filter-chip practiced-button" data-practiced="${i}" ${done.has(`speaking:${scene.id}:${i}`) ? "disabled" : ""}>${done.has(`speaking:${scene.id}:${i}`) ? "已練習過 ✓" : "我已開口練習"}</button></div></section>`).join("")}</div><p id="practice-status" role="status"></p></article>`;
  } else {
    const lists =
      tab === "grammar"
        ? grammar.map(
            (g, i) =>
              `<a class="studio-card" href="#/studio?tab=grammar&id=${g.id}"><div class="lesson-top"><span>${String(i + 1).padStart(2, "0")} · ${g.level}</span><span>${done.has(`grammar:${g.id}`) ? "✓" : "→"}</span></div><h2 lang="ja">${g.pattern}</h2><h3>${g.title}</h3><p>${g.translation}</p></a>`,
          )
        : tab === "reading"
          ? readings.map(
              (r, i) =>
                `<a class="studio-card reading-preview" href="#/studio?tab=reading&id=${r.id}"><div class="lesson-top"><span>${r.tag}</span><span>${done.has(`reading:${r.id}`) ? "已讀 ✓" : `${r.minutes} 分鐘`}</span></div><span class="reading-index" aria-hidden="true">${["珈", "旅", "新", "休"][i]}</span><h2 lang="ja">${r.title}</h2><p>${r.lines[0]!.zh}</p></a>`,
            )
          : scenes.map(
              (s) =>
                `<a class="studio-card scene-card" href="#/studio?tab=speaking&id=${s.id}"><span class="scene-mark" aria-hidden="true">${s.mark}</span><div><h2>${s.title}</h2><p>${s.subtitle}</p><span class="quiet">${s.phrases.length} 句 · 跟讀與回想</span></div><span>→</span></a>`,
            );
    root.innerHTML =
      heading +
      `<div class="studio-grid ${tab === "speaking" ? "scene-grid" : ""}">${lists.join("")}</div><p class="studio-footnote">${tab === "grammar" ? "依初學順序練習；這是入門手帖，並非完整 JLPT 課綱。" : tab === "reading" ? "本站原創練習短文。先不看翻譯，讀完再回答一個問題。" : "播放採既有日文語音系統；裝置支援的日文聲音與離線可用性可能不同。"}</p>`;
  }
  root
    .querySelectorAll<HTMLButtonElement>("[data-speak]")
    .forEach((b) => (b.onclick = () => speakJapanese(b.dataset.speak!, speed)));
  root
    .querySelector<HTMLSelectElement>("#speech-speed")
    ?.addEventListener("change", (e) => {
      speed = Number((e.target as HTMLSelectElement).value);
    });
  for (const [id, selector] of [
    ["show-reading", ".reading-hint"],
    ["show-translation", ".translation-hint"],
  ] as const) {
    root
      .querySelector<HTMLInputElement>(`#${id}`)
      ?.addEventListener("change", (e) =>
        root
          .querySelectorAll<HTMLElement>(selector)
          .forEach((n) => (n.hidden = !(e.target as HTMLInputElement).checked)),
      );
  }
  root
    .querySelector<HTMLInputElement>("#hide-japanese")
    ?.addEventListener("change", (e) =>
      root
        .querySelectorAll<HTMLElement>(".japanese-hint")
        .forEach((n) => (n.hidden = (e.target as HTMLInputElement).checked)),
    );
  let saving = false;
  root.querySelectorAll<HTMLButtonElement>("[data-answer]").forEach(
    (button) =>
      (button.onclick = async () => {
        if (saving || !check) return;
        saving = true;
        root
          .querySelectorAll<HTMLButtonElement>("[data-answer]")
          .forEach((b) => (b.disabled = true));
        const correct = Number(button.dataset.answer) === check.answer;
        const feedback = root.querySelector<HTMLElement>("#check-feedback")!;
        try {
          await context.repository.recordActivity({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            itemId: activityId,
            modeId: `studio-${tab}`,
            correct,
            isNew: false,
          });
          root
            .querySelector(`[data-answer="${check.answer}"]`)
            ?.classList.add("answer-correct");
          if (!correct) button.classList.add("answer-wrong");
          feedback.textContent = `${correct ? "答對了。" : "一起記住這個用法。"}${check.explanation}`;
          feedback.className = correct
            ? "answer-explanation correct"
            : "answer-explanation";
        } catch {
          feedback.textContent = "未能儲存這次作答，請再試一次。";
          saving = false;
          root
            .querySelectorAll<HTMLButtonElement>("[data-answer]")
            .forEach((b) => (b.disabled = false));
        }
      }),
  );
  root.querySelectorAll<HTMLButtonElement>("[data-practiced]").forEach(
    (button) =>
      (button.onclick = async () => {
        button.disabled = true;
        try {
          await context.repository.recordActivity({
            id: crypto.randomUUID(),
            at: new Date().toISOString(),
            itemId: `speaking:${scene!.id}:${button.dataset.practiced}`,
            modeId: "studio-speaking",
            correct: true,
            isNew: false,
          });
          button.textContent = "已開口練習 ✓";
        } catch {
          button.disabled = false;
          root.querySelector("#practice-status")!.textContent =
            "未能儲存，請再試一次。";
        }
      }),
  );
}
