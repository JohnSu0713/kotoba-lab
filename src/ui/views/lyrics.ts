import type { AppContext } from '../../app/context.js';
import type { VocabularyItem } from '../../domain/models.js';
import { fetchDailyLyric, localDateKey, pickDailyArtist } from '../../features/lyrics/provider.js';
import type { DailyLyricLesson, FollowedArtist } from '../../features/lyrics/models.js';
import { lyricsStore } from '../../features/lyrics/store.js';
import { icons } from '../components/icons.js';
import { speakJapanese } from '../speech.js';

const SUGGESTED_ARTISTS = ['YOASOBI', '藤井 風', '米津玄師', 'Aimer', 'あいみょん', 'Official髭男dism'];

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cacheKey(dateKey: string, artist: FollowedArtist): string {
  return dateKey + ':' + artist.id;
}

function lessonVocabulary(context: AppContext, line: string): VocabularyItem[] {
  const seen = new Set<string>();
  return context.content
    .getAll({ kind: 'vocabulary' })
    .filter((item): item is VocabularyItem => item.kind === 'vocabulary')
    .filter((item) => item.expression.length > 0 && line.includes(item.expression))
    .filter((item) => {
      if (seen.has(item.expression)) return false;
      seen.add(item.expression);
      return true;
    })
    .sort((a, b) => {
      if (b.expression.length !== a.expression.length) return b.expression.length - a.expression.length;
      return (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER);
    })
    .slice(0, 3);
}

function grammarHint(line: string): { title: string; copy: string } {
  const rules: Array<[RegExp, string, string]> = [
    [/ように/, '〜ように', '常見於「像……一樣」或「為了能……」的表達。先看前後文判斷是比喻、方式還是目的。'],
    [/たい/, '〜たい', '動詞ます形去掉「ます」加「たい」，表示說話者想做某件事。歌詞裡很常用來直接表達願望。'],
    [/ても|でも/, '〜ても / 〜でも', '帶有「即使……也……」的讓步語感，常用來把兩個情緒或情境拉出對比。'],
    [/なら/, '〜なら', '把前面的情況當作條件或話題，接近「如果是……的話」。'],
    [/のに/, '〜のに', '表示「明明……卻……」，帶有落差、遺憾或意外感。'],
    [/ている|てる/, '〜ている', '可以表示動作正在持續，也可能表示動作完成後留下的狀態。口語和歌詞常縮成「〜てる」。'],
    [/から/, '〜から', '依上下文可表示原因「因為……」或起點「從……」。'],
    [/だけ/, '〜だけ', '表示範圍限定「只有／只是……」，歌詞中常用來把焦點收得很窄。'],
  ];
  const matched = rules.find(([pattern]) => pattern.test(line));
  if (matched) return { title: matched[1], copy: matched[2] };
  return {
    title: '整句語感',
    copy: '先不要逐字翻譯。聽一遍日文、看一次中文，再回到原句，把整句當成一個語塊記住。',
  };
}

function artistChips(artists: FollowedArtist[]): string {
  if (!artists.length) return '';
  return '<div class="lyric-artist-row">' + artists.map((artist) =>
    '<span class="lyric-artist-chip"><span>' + escapeHtml(artist.name) +
    '</span><button type="button" data-remove-artist="' + escapeHtml(artist.id) +
    '" aria-label="移除 ' + escapeHtml(artist.name) + '">×</button></span>',
  ).join('') + '</div>';
}

function addArtistPanel(artists: FollowedArtist[]): string {
  const existing = new Set(artists.map((artist) => artist.name.toLocaleLowerCase()));
  const suggestions = SUGGESTED_ARTISTS.filter((name) => !existing.has(name.toLocaleLowerCase()));
  return `
    <section class="lyric-add-card">
      <div class="lyric-add-copy">
        <p class="eyebrow">YOUR ARTISTS</p>
        <h2>把喜歡的歌手，變成每天一小句日文。</h2>
        <p>加入歌手後，Kotoba Lab 每天固定挑一首歌，只取一小句做日文 × 繁中學習。</p>
      </div>
      <form class="lyric-add-form" id="lyric-add-form">
        <label for="lyric-artist-input">歌手名稱</label>
        <div>
          <input id="lyric-artist-input" name="artist" autocomplete="off" placeholder="例如 YOASOBI、藤井 風" maxlength="80">
          <button class="primary-button" type="submit">Add Artist</button>
        </div>
      </form>
      ${suggestions.length ? '<div class="lyric-suggestions"><span>快速加入</span>' + suggestions.map((name) =>
        '<button type="button" data-suggest-artist="' + escapeHtml(name) + '">＋ ' + escapeHtml(name) + '</button>',
      ).join('') + '</div>' : ''}
      ${artistChips(artists)}
    </section>`;
}

function emptyDaily(): string {
  return `
    <section class="lyric-empty">
      <div class="lyric-record" aria-hidden="true"><span>歌</span></div>
      <div>
        <p class="eyebrow">DAILY LYRIC</p>
        <h2>先加入一位你真的會聽的歌手。</h2>
        <p>明天打開時會是另一句；今天重開 App，仍會保留今天同一句。</p>
      </div>
    </section>`;
}

function loadingDaily(artist: FollowedArtist): string {
  return `
    <section class="lyric-daily-card lyric-loading-card">
      <div class="lyric-record is-spinning" aria-hidden="true"><span>♪</span></div>
      <div>
        <p class="eyebrow">TODAY · ${escapeHtml(artist.name)}</p>
        <h2>正在替你挑今天的一句…</h2>
        <p>只取一小句，不把完整歌詞塞進學習畫面。</p>
      </div>
    </section>`;
}

function errorDaily(artist: FollowedArtist, message: string): string {
  return `
    <section class="lyric-daily-card lyric-error-card">
      <div class="lyric-record" aria-hidden="true"><span>?</span></div>
      <div>
        <p class="eyebrow">TODAY · ${escapeHtml(artist.name)}</p>
        <h2>今天這位歌手暫時沒有抓到可用句子。</h2>
        <p>${escapeHtml(message)}</p>
        <button class="secondary-button" id="lyric-retry" type="button">再試一次</button>
      </div>
    </section>`;
}

function dailyLesson(context: AppContext, lesson: DailyLyricLesson): string {
  const vocab = lessonVocabulary(context, lesson.lineJa);
  const grammar = grammarHint(lesson.lineJa);
  const favorite = lyricsStore.isFavorite(lesson.id);
  const searchUrl = 'https://www.youtube.com/results?search_query=' +
    encodeURIComponent(lesson.artistName + ' ' + lesson.trackName);

  return `
    <section class="lyric-daily-card">
      <div class="lyric-card-top">
        <div class="lyric-song-meta">
          <div class="lyric-record" aria-hidden="true"><span>♪</span></div>
          <div>
            <p class="eyebrow">TODAY'S LYRIC</p>
            <strong>${escapeHtml(lesson.trackName)}</strong>
            <span>${escapeHtml(lesson.artistName)}${lesson.albumName ? ' · ' + escapeHtml(lesson.albumName) : ''}</span>
          </div>
        </div>
        <span class="lyric-date-chip">${escapeHtml(lesson.dateKey.replaceAll('-', '.'))}</span>
      </div>

      <div class="lyric-quote">
        <button class="lyric-listen" id="lyric-listen" type="button" aria-label="播放今日歌詞">${icons.volume}</button>
        <p lang="ja">${escapeHtml(lesson.lineJa)}</p>
        <div class="lyric-translation"><span>繁中</span><strong>${escapeHtml(lesson.lineZhTw)}</strong></div>
      </div>

      <div class="lyric-learning-grid">
        <article>
          <p class="eyebrow">WORDS</p>
          <h3>這句值得帶走的詞</h3>
          <div class="lyric-vocab-list">
            ${vocab.length ? vocab.map((item) =>
              '<div><strong>' + escapeHtml(item.expression) + '</strong><span>' +
              escapeHtml(item.reading) + '</span><p>' +
              escapeHtml(item.meaningsZhTw.slice(0, 2).join('；')) + '</p></div>',
            ).join('') : '<p class="quiet">這句沒有命中目前詞庫；先把整句當作語塊記憶。</p>'}
          </div>
        </article>
        <article>
          <p class="eyebrow">PATTERN</p>
          <h3>${escapeHtml(grammar.title)}</h3>
          <p class="lyric-grammar-copy">${escapeHtml(grammar.copy)}</p>
        </article>
      </div>

      <div class="lyric-actions">
        <button class="secondary-button lyric-favorite ${favorite ? 'selected' : ''}" id="lyric-favorite" type="button">
          ${favorite ? icons.heartFilled : icons.heart}<span>${favorite ? '已收藏' : '收藏這句'}</span>
        </button>
        <a class="text-link" href="${searchUrl}" target="_blank" rel="noopener noreferrer">找這首歌 <span>↗</span></a>
      </div>
      <p class="lyric-source">歌詞片段由 LRCLIB 查詢；中文由 MyMemory 機器翻譯。只顯示每日一小句供語言學習。</p>
    </section>`;
}

function bindInteractions(root: HTMLElement): void {
  root.querySelector<HTMLFormElement>('#lyric-add-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const artist = String(data.get('artist') ?? '').trim();
    if (!artist) return;
    lyricsStore.followArtist(artist);
    window.dispatchEvent(new CustomEvent('kotoba:rerender'));
  });

  root.querySelectorAll<HTMLButtonElement>('[data-suggest-artist]').forEach((button) => {
    button.addEventListener('click', () => {
      const artist = button.dataset.suggestArtist;
      if (!artist) return;
      lyricsStore.followArtist(artist);
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
  });

  root.querySelectorAll<HTMLButtonElement>('[data-remove-artist]').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.removeArtist;
      if (!id) return;
      lyricsStore.removeArtist(id);
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
  });
}

function pageHtml(artists: FollowedArtist[], daily: string): string {
  return `
    <section class="page-header lyric-page-header">
      <div>
        <p class="eyebrow">MUSIC → LANGUAGE</p>
        <h1>每日歌詞</h1>
        <p>你喜歡的歌，本來就值得成為教材。</p>
      </div>
      <div class="lyric-header-mark" aria-hidden="true">歌</div>
    </section>
    ${daily}
    ${addArtistPanel(artists)}
  `;
}

export async function renderLyrics(root: HTMLElement, context: AppContext): Promise<void> {
  const state = lyricsStore.getState();
  const dateKey = localDateKey();
  const artist = pickDailyArtist(state.artists, dateKey);

  if (!artist) {
    root.innerHTML = pageHtml(state.artists, emptyDaily());
    bindInteractions(root);
    return;
  }

  const key = cacheKey(dateKey, artist);
  const cached = lyricsStore.cachedLesson(key);
  if (cached) {
    root.innerHTML = pageHtml(state.artists, dailyLesson(context, cached));
    bindInteractions(root);
    root.querySelector<HTMLButtonElement>('#lyric-listen')?.addEventListener('click', () => speakJapanese(cached.lineJa));
    root.querySelector<HTMLButtonElement>('#lyric-favorite')?.addEventListener('click', () => {
      lyricsStore.toggleFavorite(cached.id);
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
    return;
  }

  root.innerHTML = pageHtml(state.artists, loadingDaily(artist));
  bindInteractions(root);

  try {
    const lesson = await fetchDailyLyric(artist, dateKey);
    if (!root.isConnected) return;
    lyricsStore.cacheLesson(key, lesson);
    root.innerHTML = pageHtml(lyricsStore.getState().artists, dailyLesson(context, lesson));
    bindInteractions(root);
    root.querySelector<HTMLButtonElement>('#lyric-listen')?.addEventListener('click', () => speakJapanese(lesson.lineJa));
    root.querySelector<HTMLButtonElement>('#lyric-favorite')?.addEventListener('click', () => {
      lyricsStore.toggleFavorite(lesson.id);
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
  } catch (error) {
    if (!root.isConnected) return;
    const message = error instanceof Error ? error.message : '未知錯誤';
    root.innerHTML = pageHtml(lyricsStore.getState().artists, errorDaily(artist, message));
    bindInteractions(root);
    root.querySelector<HTMLButtonElement>('#lyric-retry')?.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
  }
}
