import { icons } from "./components/icons.js";
import { appearance } from "./theme/appearance.js";

export function renderShell(app: HTMLElement, contentHtml = ""): void {
  const dark = appearance.resolved() === "dark";
  app.innerHTML = `
    <a class="skip-link" href="#page">跳到主要內容</a><div class="app-shell">
      <header class="topbar">
        <a href="#/" class="brand" aria-label="Kotoba Lab 首頁">
          <span class="brand-mark">こ</span>
          <span class="brand-copy"><strong>Kotoba Lab</strong><small>Japanese, remembered.</small></span>
        </a>
        <div class="topbar-actions"><a class="icon-button" href="#/settings" aria-label="設定">${icons.settings}</a><button class="icon-button theme-toggle" id="theme-toggle" type="button" aria-label="切換亮暗模式">${dark ? icons.sun : icons.moon}</button></div>
      </header>
      <main id="page" tabindex="-1">${contentHtml}</main>
      <nav class="bottom-nav" aria-label="主要導覽">
        <a href="#/" data-nav="/">${icons.today}<span>學習</span></a>
        <a href="#/lyrics" data-nav="/lyrics">${icons.lyrics}<span>歌詞</span></a>
        <a href="#/library" data-nav="/library">${icons.modeVocab}<span>筆記</span></a>
        <a href="#/stats" data-nav="/stats">${icons.stats}<span>進度</span></a>
      </nav>
    </div>`;

  app
    .querySelector<HTMLAnchorElement>(".skip-link")
    ?.addEventListener("click", (event) => {
      event.preventDefault();
      app.querySelector<HTMLElement>("#page")?.focus();
    });
  app.querySelector<HTMLButtonElement>("#theme-toggle")?.addEventListener(
    "click",
    () => {
      appearance.toggleResolved();
      window.dispatchEvent(new CustomEvent("kotoba:rerender"));
    },
    { once: true },
  );
}
