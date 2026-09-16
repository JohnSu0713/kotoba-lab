import type { AppContext } from '../../app/context.js';
import type { KanaItem, Script } from '../../domain/models.js';
import { studyHref } from '../router.js';
import { speakJapanese } from '../speech.js';

const rows = ['vowel', 'k', 's', 't', 'n', 'h', 'm', 'y', 'r', 'w', 'n-final'];

function chart(items: KanaItem[], script: Script): string {
  const filtered = items.filter((item) => item.script === script && item.group === 'gojuon');
  return `<div class="kana-chart">${rows.map((row) => {
    const rowItems = filtered.filter((item) => item.row === row);
    if (!rowItems.length) return '';
    return `<div class="kana-chart-row">${rowItems.map((item) => `<button type="button" class="kana-cell" data-speak-kana="${item.kana}" aria-label="播放 ${item.kana} 的日文發音"><strong>${item.kana}</strong><span>${item.romaji} · 🔊</span></button>`).join('')}</div>`;
  }).join('')}</div>`;
}

export async function renderKana(root: HTMLElement, context: AppContext): Promise<void> {
  const kana = context.content.getAll({ kind: 'kana' }).filter((item): item is KanaItem => item.kind === 'kana');
  root.innerHTML = `
    <section class="page-header compact">
      <p class="eyebrow">FOUNDATION</p>
      <h1>五十音</h1>
      <p>先建立看到、聽到、輸入都能直接反應的假名能力。點任一假名即可播放發音。</p>
    </section>

    <section class="kana-overview-grid">
      <article class="learning-card feature-card">
        <div class="feature-heading"><span class="kana-mark large">あ</span><div><p class="eyebrow">HIRAGANA</p><h2>平假名</h2></div></div>
        <div class="practice-pills">
          <a href="${studyHref('kana-recognition', { script: 'hiragana', scope: 'basic' })}">辨識</a>
          <a href="${studyHref('kana-recall', { script: 'hiragana', scope: 'basic' })}">輸入</a>
          <a href="${studyHref('kana-audio-choice', { script: 'hiragana', scope: 'basic' })}">聽力</a>
        </div>
        ${chart(kana, 'hiragana')}
      </article>

      <article class="learning-card feature-card">
        <div class="feature-heading"><span class="kana-mark large">ア</span><div><p class="eyebrow">KATAKANA</p><h2>片假名</h2></div></div>
        <div class="practice-pills">
          <a href="${studyHref('kana-recognition', { script: 'katakana', scope: 'basic' })}">辨識</a>
          <a href="${studyHref('kana-recall', { script: 'katakana', scope: 'basic' })}">輸入</a>
          <a href="${studyHref('kana-audio-choice', { script: 'katakana', scope: 'basic' })}">聽力</a>
        </div>
        ${chart(kana, 'katakana')}
      </article>
    </section>

    <section class="section">
      <div class="section-heading"><div><p class="eyebrow">TRANSFER</p><h2>不要只靠羅馬字</h2></div></div>
      <div class="mode-list">
        <a class="mode-card" href="${studyHref('kana-script-pair', { scope: 'basic' })}"><span class="mode-icon">↔</span><div><strong>平片假名配對</strong><span>直接建立 あ ⇄ ア 的連結</span></div><b>›</b></a>
        <a class="mode-card soft" href="${studyHref('kana-recognition', { scope: 'all' })}"><span class="mode-icon">濁</span><div><strong>進階假名混合</strong><span>濁音・半濁音・拗音一起練</span></div><b>›</b></a>
      </div>
    </section>`;

  root.querySelectorAll<HTMLButtonElement>('[data-speak-kana]').forEach((button) => {
    button.addEventListener('click', () => {
      const text = button.dataset.speakKana;
      if (text) speakJapanese(text);
    });
  });
}
