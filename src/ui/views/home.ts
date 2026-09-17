import type { AppContext } from '../../app/context.js';
import type { JlptLevel, KanaItem, VocabularyItem } from '../../domain/models.js';
import { studyHref } from '../router.js';
import { icons } from '../components/icons.js';

const JLPT_LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

function modeCard(href: string, icon: string, title: string, caption: string, tone = ''): string {
  return `<a class="mode-card ${tone}" href="${href}"><span class="mode-icon">${icon}</span><div><strong>${title}</strong><span>${caption}</span></div><b>${icons.arrow}</b></a>`;
}

export async function renderHome(root: HTMLElement, context: AppContext): Promise<void> {
  const [reviews, settings] = await Promise.all([context.repository.getAllReviews(), context.repository.getSettings()]);
  const now = new Date();
  const due = reviews.filter((record) => context.scheduler.isDue(record, now)).length;
  const uniqueStarted = new Set(reviews.map((record) => record.itemId)).size;
  const kana = context.content.getAll({ kind: 'kana' }).filter((item): item is KanaItem => item.kind === 'kana');
  const vocabulary = context.content.getAll({ kind: 'vocabulary' }).filter((item): item is VocabularyItem => item.kind === 'vocabulary');
  const kanaTotal = kana.length;
  const mastered = reviews.filter((record) => record.intervalDays >= 21).length;
  const vocabCounts = new Map<JlptLevel, number>(JLPT_LEVELS.map((level) => [level, vocabulary.filter((item) => item.jlpt === level).length]));
  const corpusTotal = [...vocabCounts.values()].reduce((sum, count) => sum + count, 0);
  const n5Count = vocabCounts.get('N5') ?? 0;
  const mixedHref = studyHref('daily-mixed', { scope: 'basic', jlpt: 'N5' });

  root.innerHTML = `
    <section class="hero">
      <div class="hero-copy-wrap">
        <p class="eyebrow">TODAY</p>
        <h1>今天只學<br><em>該學的。</em></h1>
        <p class="hero-copy">${due > 0 ? `有 ${due} 個記憶已到期。混合不同題型，把辨字、聽力、回想和單字放在同一個短 session。` : '目前沒有到期複習。用 10 分鐘混合題型，穩定建立日文反射。'}</p>
        <div class="hero-actions">
          <a class="primary-button hero-primary" href="${mixedHref}">${due > 0 ? '開始今天的混合複習' : '開始 10 分鐘練習'}</a>
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
        ${modeCard(studyHref('kana-audio-choice', { scope: 'all' }), icons.modeAudio, '聽音辨字', '先聽，再做選擇')}
        ${modeCard(studyHref('kana-recall', { script: 'hiragana', scope: 'basic' }), icons.modeKeyboard, '主動輸入', '從 romaji 回想假名')}
        ${modeCard(studyHref('kana-script-pair', { scope: 'basic' }), icons.modeSwitch, '平片轉換', '建立兩套字形直接連結', 'soft')}
        ${modeCard(studyHref('vocab-flashcard', { jlpt: 'N5' }), icons.modeVocab, 'N5 單字卡', `${n5Count.toLocaleString()} 詞 · 繁體中文`, 'soft')}
      </div>
    </section>

    <section class="section">
      <div class="section-heading">
        <div><p class="eyebrow">VOCABULARY</p><h2>JLPT N5 → N1 詞彙庫</h2></div>
        <span class="quiet">${corpusTotal.toLocaleString()} 詞 · 繁體中文</span>
      </div>
      <div class="learning-card vocab-library-card">
        <div class="vocab-library-copy">
          <span class="vocab-library-mark">語</span>
          <div><strong>按程度進入，不把全部內容一次塞給你。</strong><p>日文詞形與讀音以 JMdict 為基礎；JLPT 級別為社群估計，並保留來源與授權資訊。</p></div>
        </div>
        <div class="jlpt-level-grid" aria-label="JLPT 詞彙等級">
          ${JLPT_LEVELS.map((level) => `<a class="jlpt-level-card" href="${studyHref('vocab-flashcard', { jlpt: level })}"><strong>${level}</strong><span>${(vocabCounts.get(level) ?? 0).toLocaleString()} 詞</span><b>${icons.arrow}</b></a>`).join('')}
        </div>
      </div>
    </section>

    <section class="section philosophy-card">
      <p class="eyebrow">DESIGN PRINCIPLE</p>
      <h2>少功能，不少方法。</h2>
      <p>首頁不塞文章、社群或廣告。內容模組可以一直擴充，但每天的核心流程只保留「到期複習 → 少量新內容 → 完成」。</p>
    </section>`;
}
