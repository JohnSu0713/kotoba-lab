import type { AppContext } from '../../app/context.js';
import type { KanaItem } from '../../domain/models.js';
import { studyHref } from '../router.js';
import { icons } from '../components/icons.js';

function modeCard(href: string, glyph: string, title: string, caption: string, tone = ''): string {
  return `<a class="mode-card ${tone}" href="${href}"><span class="mode-icon">${glyph}</span><div><strong>${title}</strong><span>${caption}</span></div><b>${icons.arrow}</b></a>`;
}

export async function renderHome(root: HTMLElement, context: AppContext): Promise<void> {
  const [reviews, settings] = await Promise.all([context.repository.getAllReviews(), context.repository.getSettings()]);
  const now = new Date();
  const due = reviews.filter((record) => context.scheduler.isDue(record, now)).length;
  const uniqueStarted = new Set(reviews.map((record) => record.itemId)).size;
  const kana = context.content.getAll({ kind: 'kana' }).filter((item): item is KanaItem => item.kind === 'kana');
  const kanaTotal = kana.length;
  const mastered = reviews.filter((record) => record.intervalDays >= 21).length;

  root.innerHTML = `
    <section class="hero">
      <div class="hero-copy-wrap">
        <p class="eyebrow">TODAY</p>
        <h1>今天只學<br><em>該學的。</em></h1>
        <p class="hero-copy">${due > 0 ? `有 ${due} 個記憶已到期。先複習，再加入少量新內容。` : '目前沒有到期複習。用短 session 穩定建立日文反射。'}</p>
        <div class="hero-actions">
          <a class="primary-button hero-primary" href="${studyHref('kana-recognition', { script: 'hiragana', scope: 'basic' })}">${due > 0 ? '開始今天的複習' : '開始 10 分鐘練習'}</a>
          <a class="text-link" href="#/kana">查看五十音 <span>→</span></a>
        </div>
      </div>
      <div class="hero-orbit" aria-hidden="true">
        <div class="orbit-main">あ</div>
        <span class="orbit-chip chip-one">ア</span>
        <span class="orbit-chip chip-two">日</span>
        <span class="orbit-chip chip-three">語</span>
      </div>
    </section>

    <section class="quick-stats" aria-label="今日摘要">
      <div><strong>${due}</strong><span>待複習</span></div>
      <div><strong>${settings.dailyNew}</strong><span>每日新項目</span></div>
      <div><strong>${uniqueStarted}</strong><span>已開始</span></div>
      <div><strong>${mastered}</strong><span>長期記住</span></div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div><p class="eyebrow">FOUNDATION</p><h2>先把五十音變成反射</h2></div>
        <a class="quiet-link" href="#/kana">完整表格 →</a>
      </div>
      <div class="foundation-grid">
        <a class="learning-card foundation-card" href="${studyHref('kana-recognition', { script: 'hiragana', scope: 'basic' })}">
          <div class="foundation-top"><span class="kana-mark large">あ</span><span class="status-chip">${Math.floor(kanaTotal / 2)} items</span></div>
          <div><p class="eyebrow">HIRAGANA</p><h3>平假名</h3><p>看字、聽音、主動輸入三種記憶路徑。</p></div>
          <span class="card-arrow">${icons.arrow}</span>
        </a>
        <a class="learning-card foundation-card" href="${studyHref('kana-recognition', { script: 'katakana', scope: 'basic' })}">
          <div class="foundation-top"><span class="kana-mark large alt">ア</span><span class="status-chip">${Math.floor(kanaTotal / 2)} items</span></div>
          <div><p class="eyebrow">KATAKANA</p><h3>片假名</h3><p>同一套節奏，不再依賴羅馬字中介。</p></div>
          <span class="card-arrow">${icons.arrow}</span>
        </a>
      </div>
    </section>

    <section class="section">
      <div class="section-heading"><div><p class="eyebrow">PRACTICE</p><h2>換一種方式記住</h2></div><span class="quiet">每種模式有獨立記憶排程</span></div>
      <div class="mode-list two-column">
        ${modeCard(studyHref('kana-audio-choice', { scope: 'all' }), '耳', '聽音辨字', '先聽，再做選擇')}
        ${modeCard(studyHref('kana-recall', { script: 'hiragana', scope: 'basic' }), '鍵', '主動輸入', '從 romaji 回想假名')}
        ${modeCard(studyHref('kana-script-pair', { scope: 'basic' }), '↔', '平片轉換', '建立兩套字形直接連結', 'soft')}
        ${modeCard(studyHref('vocab-flashcard', { jlpt: 'N5' }), '語', 'N5 單字卡', '目前為小型示範詞庫', 'soft')}
      </div>
    </section>

    <section class="section philosophy-card">
      <p class="eyebrow">DESIGN PRINCIPLE</p>
      <h2>少功能，不少方法。</h2>
      <p>首頁不塞文章、社群或廣告。內容模組可以一直擴充，但每天的核心流程只保留「到期複習 → 少量新內容 → 完成」。</p>
    </section>`;
}
