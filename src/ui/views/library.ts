import type { AppContext } from "../../app/context.js";
import type { JlptLevel, VocabularyItem } from "../../domain/models.js";
import { escapeHtml as esc } from "../html.js";
import { speakJapanese } from "../speech.js";
import { studyHref } from "../router.js";
import { icons } from "../components/icons.js";

export async function renderLibrary(
  root: HTMLElement,
  context: AppContext,
  params: URLSearchParams,
): Promise<void> {
  const notebook = await context.repository.getNotebook();
  const items = context.content.getAll({
    kind: "vocabulary",
  }) as VocabularyItem[];
  const reviews = await context.repository.getAllReviews();
  const started = new Set(reviews.map((r) => r.itemId));
  let level = params.get("level") ?? "all",
    savedOnly = params.get("saved") === "1",
    query = "",
    page = 0;
  const saved = new Set(notebook.savedIds);
  root.innerHTML = `<section class="page-header"><p class="eyebrow">WORD NOTEBOOK</p><h1>把遇見的字，留下來。</h1><p>搜尋日文、讀音或繁體中文。收藏後，隨時練習自己的詞卡。</p></section>
    <section class="library-toolbar learning-card"><label class="search-field"><span>搜尋詞彙</span><input id="word-search" type="search" placeholder="例如：旅行、りょこう、旅遊" autocomplete="off"></label>
    <div class="filter-row"><label>程度 <select id="word-level"><option value="all">全部程度</option>${["N5", "N4", "N3", "N2", "N1"].map((l) => `<option ${l === level ? "selected" : ""}>${l}</option>`).join("")}</select></label><button id="saved-filter" class="filter-chip" aria-pressed="${savedOnly}">只看收藏 <span id="saved-count">${saved.size}</span></button><a class="secondary-button" href="${studyHref("vocab-flashcard", { saved: "1", strategy: "practice" })}">練習收藏 →</a></div></section>
    <div class="results-meta"><p id="word-count" role="status"></p><span>詞彙級別為社群估計</span></div><div id="word-results" class="word-grid"></div><div id="word-pages" class="pagination"></div>`;
  const draw = () => {
    const normalized = query.trim().normalize("NFKC").toLocaleLowerCase();
    const found = items.filter(
      (item) =>
        (level === "all" || item.jlpt === level) &&
        (!savedOnly || saved.has(item.id)) &&
        (!normalized ||
          [item.expression, item.reading, ...item.meaningsZhTw]
            .join(" ")
            .normalize("NFKC")
            .toLocaleLowerCase()
            .includes(normalized)),
    );
    const size = 24;
    page = Math.min(page, Math.max(0, Math.ceil(found.length / size) - 1));
    root.querySelector("#word-count")!.textContent =
      `${found.length.toLocaleString()} 個詞彙${found.length ? ` · 第 ${page + 1} / ${Math.ceil(found.length / size)} 頁` : ""}`;
    root.querySelector("#word-results")!.innerHTML = found.length
      ? found
          .slice(page * size, (page + 1) * size)
          .map(
            (item) =>
              `<article class="word-card"><div class="word-meta"><span>${item.jlpt} ${started.has(item.id) ? "· 已練習" : ""}</span><button class="bookmark-button" data-save="${esc(item.id)}" aria-label="${saved.has(item.id) ? "取消收藏" : "收藏"} ${esc(item.expression)}" aria-pressed="${saved.has(item.id)}">${saved.has(item.id) ? "♥" : "♡"}</button></div><div class="word-title"><div><h2 lang="ja">${esc(item.expression)}</h2><p lang="ja">${esc(item.reading)}</p></div><button class="icon-button" data-speak="${esc(item.reading)}" aria-label="播放 ${esc(item.expression)} 的讀音">${icons.volume}</button></div><p class="word-meaning">${esc(item.meaningsZhTw.join("；"))}</p>${item.examples[0] ? `<details><summary>看例句</summary><p lang="ja">${esc(item.examples[0].ja)}</p><p>${esc(item.examples[0].zhTw ?? item.examples[0].en ?? "")}</p></details>` : ""}<a class="quiet-link" href="${studyHref("vocab-flashcard", { item: item.id, strategy: "practice" })}">練習這個字 →</a></article>`,
          )
          .join("")
      : `<div class="empty-state"><span class="empty-symbol">${savedOnly ? "♡" : "語"}</span><h2>${savedOnly ? "收藏從一個字開始" : "沒有找到這個詞"}</h2><p>${savedOnly ? "按詞卡上的愛心，建立自己的複習清單。" : "試試假名、漢字或較短的關鍵字。"}</p></div>`;
    root.querySelector("#word-pages")!.innerHTML =
      found.length > size
        ? `<button class="secondary-button" id="prev-words" ${page === 0 ? "disabled" : ""}>← 上一頁</button><span>${page + 1} / ${Math.ceil(found.length / size)}</span><button class="secondary-button" id="next-words" ${(page + 1) * size >= found.length ? "disabled" : ""}>下一頁 →</button>`
        : "";
    root.querySelector("#prev-words")?.addEventListener("click", () => {
      page--;
      draw();
      root
        .querySelector(".library-toolbar")
        ?.scrollIntoView({ block: "start" });
    });
    root.querySelector("#next-words")?.addEventListener("click", () => {
      page++;
      draw();
      root
        .querySelector(".library-toolbar")
        ?.scrollIntoView({ block: "start" });
    });
    root
      .querySelectorAll<HTMLButtonElement>("[data-speak]")
      .forEach((b) => (b.onclick = () => speakJapanese(b.dataset.speak!)));
    root.querySelectorAll<HTMLButtonElement>("[data-save]").forEach(
      (b) =>
        (b.onclick = async () => {
          b.disabled = true;
          const id = b.dataset.save!;
          const latest = await context.repository.getNotebook();
          const next = new Set(latest.savedIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          try {
            await context.repository.putNotebook({
              ...latest,
              savedIds: [...next],
            });
            saved.clear();
            next.forEach((v) => saved.add(v));
            root.querySelector("#saved-count")!.textContent = String(
              saved.size,
            );
            draw();
          } catch {
            b.disabled = false;
            root.querySelector("#word-count")!.textContent =
              "收藏未能儲存，請再試一次。";
          }
        }),
    );
  };
  root.querySelector<HTMLInputElement>("#word-search")!.oninput = (event) => {
    query = (event.target as HTMLInputElement).value;
    page = 0;
    draw();
  };
  root.querySelector<HTMLSelectElement>("#word-level")!.onchange = (event) => {
    level = (event.target as HTMLSelectElement).value as JlptLevel;
    page = 0;
    draw();
  };
  root.querySelector<HTMLButtonElement>("#saved-filter")!.onclick = (event) => {
    savedOnly = !savedOnly;
    (event.currentTarget as HTMLElement).setAttribute(
      "aria-pressed",
      String(savedOnly),
    );
    page = 0;
    draw();
  };
  draw();
}
