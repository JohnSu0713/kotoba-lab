import { icons } from './components/icons.js';
import { appearance } from './theme/appearance.js';

export function renderShell(app: HTMLElement, contentHtml = ''): void {
  const dark = appearance.resolved() === 'dark';
  app.innerHTML = `
    <div class="app-shell">
      <header class="topbar">
        <a href="#/" class="brand" aria-label="Kotoba Lab 首頁">
          <span class="brand-mark">こ</span>
          <span class="brand-copy"><strong>Kotoba Lab</strong><small>Japanese, remembered.</small></span>
        </a>
        <button class="icon-button theme-toggle" id="theme-toggle" type="button" aria-label="切換亮暗模式">${dark ? icons.sun : icons.moon}</button>
      </header>
      <main id="page">${contentHtml}</main>
      <nav class="bottom-nav" aria-label="主要導覽">
        <a href="#/" data-nav="/">${icons.today}<span>今日</span></a>
        <a href="#/kana" data-nav="/kana">${icons.kana}<span>五十音</span></a>
        <a href="#/lyrics" data-nav="/lyrics">${icons.lyrics}<span>歌詞</span></a>
        <a href="#/stats" data-nav="/stats">${icons.stats}<span>統計</span></a>
        <a href="#/settings" data-nav="/settings">${icons.settings}<span>設定</span></a>
      </nav>
    </div>`;

  app.querySelector<HTMLButtonElement>('#theme-toggle')?.addEventListener('click', () => {
    appearance.toggleResolved();
    window.dispatchEvent(new CustomEvent('kotoba:rerender'));
  }, { once: true });
}
