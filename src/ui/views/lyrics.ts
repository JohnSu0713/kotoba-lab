import type { AppContext } from '../../app/context.js';
import type { VocabularyItem } from '../../domain/models.js';
import {
  fetchDailyLyric,
  localDateKey,
  pickDailyArtist,
} from '../../features/lyrics/provider.js';
import {
  resolveOriginalClip,
  youtubeEmbedUrl,
  youtubeSearchUrl,
} from '../../features/lyrics/media.js';
import type {
  DailyLyricLesson,
  FollowedArtist,
  OriginalClipSource,
} from '../../features/lyrics/models.js';
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
    [/ように/, '〜ように', '常見於「像……一樣」或「為了能……」。先看前後文判斷是比喻、方式還是目的。'],
    [/たい/, '〜たい', '表示「想做……」。歌詞裡常用來直接把願望放到句子中央。'],
    [/ても|でも/, '〜ても / 〜でも', '帶有「即使……也……」的讓步語感，常用來做情緒對比。'],
    [/なら/, '〜なら', '把前面的情況當作條件或話題，接近「如果是……的話」。'],
    [/のに/, '〜のに', '表示「明明……卻……」，常帶有落差、遺憾或意外。'],
    [/ている|てる/, '〜ている', '可表示正在持續，也可表示動作完成後留下的狀態；歌詞常縮成「〜てる」。'],
    [/から/, '〜から', '依上下文可表示原因「因為……」或起點「從……」。'],
    [/だけ/, '〜だけ', '表示限定「只有／只是……」，把焦點收得很窄。'],
  ];
  const matched = rules.find(([pattern]) => pattern.test(line));
  if (matched) return { title: matched[1], copy: matched[2] };
  return {
    title: '整句語感',
    copy: '先聽一次，再看中文；最後回到日文，把整句當成一個語塊記住。',
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
        <h2>把喜歡的歌手，變成每天一句。</h2>
        <p>加入歌手後，每天固定挑一首歌與一句日文；同一天重開 App 仍是同一句。</p>
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
        <p>明天會換一句；今天則固定保留同一句。</p>
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
        <p>會優先挑有同步時間戳的歌詞，之後才能直接播放這一句的原曲片段。</p>
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

function clipDuration(lesson: DailyLyricLesson): number | undefined {
  if (lesson.lineStartSeconds === undefined || lesson.lineEndSeconds === undefined) return undefined;
  return Math.max(1, Math.round(lesson.lineEndSeconds - lesson.lineStartSeconds));
}

function dailyLesson(context: AppContext, lesson: DailyLyricLesson): string {
  const vocab = lessonVocabulary(context, lesson.lineJa);
  const grammar = grammarHint(lesson.lineJa);
  const favorite = lyricsStore.isFavorite(lesson.id);
  const duration = clipDuration(lesson);

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
        <button class="lyric-save-button ${favorite ? 'selected' : ''}" id="lyric-favorite" type="button" aria-label="${favorite ? '取消收藏' : '收藏這句'}">
          ${favorite ? icons.heartFilled : icons.heart}
        </button>
      </div>

      <div class="lyric-quote">
        <p lang="ja">${escapeHtml(lesson.lineJa)}</p>
        <div class="lyric-translation">
          <span>繁中</span>
          <strong>${escapeHtml(lesson.lineZhTw)}</strong>
        </div>

        <div class="lyric-playback-row">
          <button class="lyric-primary-play" id="lyric-original" type="button" disabled>
            <span class="lyric-play-symbol">${icons.play}</span>
            <span>
              <strong>原曲片段</strong>
              <small id="lyric-original-status">${duration ? duration + ' 秒 · 準備中' : '這句沒有同步時間'}</small>
            </span>
          </button>
          <button class="lyric-pronounce" id="lyric-pronounce" type="button" aria-label="播放標準日文發音">
            ${icons.volume}
            <span>發音</span>
          </button>
        </div>

        <div class="lyric-player-shell" id="lyric-player-shell" hidden></div>
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

      <p class="lyric-source">LRCLIB 同步歌詞 · MyMemory 繁中對照 · 每日只取一小句。</p>
    </section>`;
}

function bindSharedInteractions(root: HTMLElement): void {
  root.querySelector<HTMLFormElement>('#lyric-add-form')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const form = event.currentTarget as HTMLFormElement;
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

function openPlayer(root: HTMLElement, source: OriginalClipSource): void {
  const shell = root.querySelector<HTMLElement>('#lyric-player-shell');
  if (!shell) return;

  shell.hidden = false;
  shell.innerHTML = `
    <div class="lyric-player-frame">
      <button class="lyric-player-close" id="lyric-player-close" type="button" aria-label="關閉原曲播放器">×</button>
      <iframe
        src="${escapeHtml(youtubeEmbedUrl(source))}"
        title="${escapeHtml(source.title)}"
        allow="autoplay; encrypted-media; picture-in-picture"
        referrerpolicy="strict-origin-when-cross-origin"
        allowfullscreen
      ></iframe>
    </div>
    <div class="lyric-player-meta">
      <span>原曲 · ${Math.max(1, Math.round(source.endSeconds - source.startSeconds))} 秒</span>
      <strong>${escapeHtml(source.title)}</strong>
    </div>
  `;

  shell.querySelector<HTMLButtonElement>('#lyric-player-close')?.addEventListener('click', () => {
    shell.innerHTML = '';
    shell.hidden = true;
  });
}

async function hydrateOriginalPlayback(root: HTMLElement, lesson: DailyLyricLesson): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>('#lyric-original');
  const status = root.querySelector<HTMLElement>('#lyric-original-status');
  if (!button || !status) return;

  const resolution = await resolveOriginalClip(lesson);
  if (!root.isConnected) return;

  if (resolution.state === 'ready') {
    const seconds = Math.max(1, Math.round(resolution.source.endSeconds - resolution.source.startSeconds));
    button.disabled = false;
    status.textContent = seconds + ' 秒 · 原曲';
    button.addEventListener('click', () => openPlayer(root, resolution.source));
    return;
  }

  button.disabled = false;
  button.classList.add('fallback');
  status.textContent = resolution.state === 'untimed' ? '找原曲' : '找原曲 · 外部開啟';
  button.addEventListener('click', () => {
    window.open(youtubeSearchUrl(lesson), '_blank', 'noopener,noreferrer');
  });
}

function bindLessonInteractions(root: HTMLElement, lesson: DailyLyricLesson): void {
  root.querySelector<HTMLButtonElement>('#lyric-pronounce')?.addEventListener('click', () => {
    speakJapanese(lesson.lineJa);
  });

  root.querySelector<HTMLButtonElement>('#lyric-favorite')?.addEventListener('click', () => {
    lyricsStore.toggleFavorite(lesson.id);
    window.dispatchEvent(new CustomEvent('kotoba:rerender'));
  });

  void hydrateOriginalPlayback(root, lesson);
}

function pageHtml(artists: FollowedArtist[], daily: string): string {
  return `
    <section class="page-header lyric-page-header">
      <div>
        <p class="eyebrow">MUSIC → LANGUAGE</p>
        <h1>每日歌詞</h1>
        <p>聽真正唱法，再把這一句記住。</p>
      </div>
      <div class="lyric-header-mark" aria-hidden="true">歌</div>
    </section>
    ${daily}
    ${addArtistPanel(artists)}
  `;
}

async function fetchAndRenderLesson(
  root: HTMLElement,
  context: AppContext,
  artists: FollowedArtist[],
  artist: FollowedArtist,
  dateKey: string,
  key: string,
): Promise<void> {
  root.innerHTML = pageHtml(artists, loadingDaily(artist));
  bindSharedInteractions(root);

  try {
    const lesson = await fetchDailyLyric(artist, dateKey);
    if (!root.isConnected) return;
    lyricsStore.cacheLesson(key, lesson);
    root.innerHTML = pageHtml(lyricsStore.getState().artists, dailyLesson(context, lesson));
    bindSharedInteractions(root);
    bindLessonInteractions(root, lesson);
  } catch (error) {
    if (!root.isConnected) return;
    const message = error instanceof Error ? error.message : '未知錯誤';
    root.innerHTML = pageHtml(lyricsStore.getState().artists, errorDaily(artist, message));
    bindSharedInteractions(root);
    root.querySelector<HTMLButtonElement>('#lyric-retry')?.addEventListener('click', () => {
      void fetchAndRenderLesson(root, context, lyricsStore.getState().artists, artist, dateKey, key);
    });
  }
}

export async function renderLyrics(root: HTMLElement, context: AppContext): Promise<void> {
  const state = lyricsStore.getState();
  const dateKey = localDateKey();
  const artist = pickDailyArtist(state.artists, dateKey);

  if (!artist) {
    root.innerHTML = pageHtml(state.artists, emptyDaily());
    bindSharedInteractions(root);
    return;
  }

  const key = cacheKey(dateKey, artist);
  const cached = lyricsStore.cachedLesson(key);

  if (cached?.timingResolved) {
    root.innerHTML = pageHtml(state.artists, dailyLesson(context, cached));
    bindSharedInteractions(root);
    bindLessonInteractions(root, cached);
    return;
  }

  await fetchAndRenderLesson(root, context, state.artists, artist, dateKey, key);
}
