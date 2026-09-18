import type { AppContext } from '../../app/context.js';
import type { VocabularyItem } from '../../domain/models.js';
import {
  fetchDailyLyric,
  localDateKey,
  pickDeckArtist,
} from '../../features/lyrics/provider.js';
import { resolveOriginalClip } from '../../features/lyrics/media.js';
import {
  playPreciseSegment,
  resolvePrecisePlayback,
  type PrecisePlaybackController,
} from '../../features/lyrics/musickit.js';
import type {
  DailyLyricLesson,
  FollowedArtist,
  OriginalClipSource,
  PrecisePlaybackSource,
} from '../../features/lyrics/models.js';
import { lyricsStore } from '../../features/lyrics/store.js';
import { icons } from '../components/icons.js';
import { speakJapanese } from '../speech.js';

const SUGGESTED_ARTISTS = ['YOASOBI', '藤井 風', '米津玄師', 'Aimer', 'あいみょん', 'Official髭男dism'];
const LYRIC_DECK_SIZE = 6;
const DECK_POSITION_PREFIX = 'kotoba-lab:lyrics-deck-position:';

let activePreview: HTMLAudioElement | undefined;
let activePreviewTimer: number | undefined;
let activePreciseController: PrecisePlaybackController | undefined;

function stopActivePreview(): void {
  if (activePreviewTimer !== undefined) {
    window.clearInterval(activePreviewTimer);
    activePreviewTimer = undefined;
  }
  if (activePreview) {
    activePreview.pause();
    activePreview.currentTime = 0;
    activePreview = undefined;
  }
}

async function stopActivePrecise(): Promise<void> {
  const controller = activePreciseController;
  activePreciseController = undefined;
  if (controller) await controller.stop().catch(() => undefined);
}

function stopAllPlayback(): void {
  stopActivePreview();
  void stopActivePrecise();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function cacheKey(dateKey: string, artist: FollowedArtist, cardIndex: number): string {
  return dateKey + ':card:' + cardIndex + ':' + artist.id;
}

function normalizedDeckIndex(index: number): number {
  return ((index % LYRIC_DECK_SIZE) + LYRIC_DECK_SIZE) % LYRIC_DECK_SIZE;
}

function readDeckIndex(dateKey: string): number {
  try {
    const value = Number(localStorage.getItem(DECK_POSITION_PREFIX + dateKey) ?? '0');
    return Number.isFinite(value) ? normalizedDeckIndex(value) : 0;
  } catch {
    return 0;
  }
}

function writeDeckIndex(dateKey: string, index: number): void {
  try {
    localStorage.setItem(DECK_POSITION_PREFIX + dateKey, String(normalizedDeckIndex(index)));
  } catch {
    // Deck position is a convenience only.
  }
}

function deckSelectionSeed(dateKey: string, cardIndex: number): string {
  return dateKey + ':card:' + normalizedDeckIndex(cardIndex);
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
        <h2>把喜歡的歌手，變成一疊每日歌詞卡。</h2>
        <p>每天會固定生成一組可左右翻閱的歌詞卡；同一天重開 App，卡片內容與位置都會保留。</p>
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

function deckNav(cardIndex: number): string {
  const index = normalizedDeckIndex(cardIndex);
  const dots = Array.from({ length: LYRIC_DECK_SIZE }, (_, dotIndex) =>
    '<span class="lyric-deck-dot ' + (dotIndex === index ? 'active' : '') + '" aria-hidden="true"></span>',
  ).join('');

  return `
    <div class="lyric-deck-nav" aria-label="每日歌詞卡片">
      <button id="lyric-deck-prev" type="button" aria-label="上一張歌詞卡">${icons.arrow}</button>
      <div class="lyric-deck-position">
        <div class="lyric-deck-dots">${dots}</div>
        <span>${index + 1} / ${LYRIC_DECK_SIZE}</span>
      </div>
      <button id="lyric-deck-next" type="button" aria-label="下一張歌詞卡">${icons.arrow}</button>
    </div>`;
}

function loadingDaily(artist: FollowedArtist, cardIndex: number): string {
  return `
    <section class="lyric-daily-card lyric-loading-card" data-lyric-card>
      <div class="lyric-record is-spinning" aria-hidden="true"><span>♪</span></div>
      <div>
        <p class="eyebrow">CARD ${normalizedDeckIndex(cardIndex) + 1} · ${escapeHtml(artist.name)}</p>
        <h2>正在替你挑這張歌詞卡…</h2>
        <p>優先挑能落在原曲試聽範圍裡的同步歌詞，讓播放更快進到這一句。</p>
      </div>
    </section>`;
}

function errorDaily(artist: FollowedArtist, message: string, cardIndex: number): string {
  return `
    <section class="lyric-daily-card lyric-error-card" data-lyric-card>
      <div class="lyric-record" aria-hidden="true"><span>?</span></div>
      <div>
        <p class="eyebrow">CARD ${normalizedDeckIndex(cardIndex) + 1} · ${escapeHtml(artist.name)}</p>
        <h2>這張卡暫時沒有抓到可用句子。</h2>
        <p>${escapeHtml(message)}</p>
        <button class="secondary-button" id="lyric-retry" type="button">再試一次</button>
      </div>
      ${deckNav(cardIndex)}
    </section>`;
}

function lyricMarkup(lesson: DailyLyricLesson): string {
  if (lesson.words?.length) {
    return lesson.words.map((word, index) =>
      '<span class="lyric-sync-word" data-lyric-word="' + index + '">'
      + escapeHtml(word.text)
      + '</span>',
    ).join('');
  }
  return '<span class="lyric-sync-line" id="lyric-sync-line">' + escapeHtml(lesson.lineJa) + '</span>';
}

function dailyLesson(
  context: AppContext,
  lesson: DailyLyricLesson,
  cardIndex: number,
): string {
  const vocab = lessonVocabulary(context, lesson.lineJa);
  const grammar = grammarHint(lesson.lineJa);
  const favorite = lyricsStore.isFavorite(lesson.id);

  return `
    <section class="lyric-daily-card" data-lyric-card>
      <div class="lyric-card-top">
        <div class="lyric-song-meta">
          <div class="lyric-record" aria-hidden="true"><span>♪</span></div>
          <div>
            <p class="eyebrow">LYRIC CARD · ${normalizedDeckIndex(cardIndex) + 1}</p>
            <strong>${escapeHtml(lesson.trackName)}</strong>
            <span>${escapeHtml(lesson.artistName)}${lesson.albumName ? ' · ' + escapeHtml(lesson.albumName) : ''}</span>
          </div>
        </div>
        <button class="lyric-save-button ${favorite ? 'selected' : ''}" id="lyric-favorite" type="button" aria-label="${favorite ? '取消收藏' : '收藏這句'}">
          ${favorite ? icons.heartFilled : icons.heart}
        </button>
      </div>

      ${deckNav(cardIndex)}

      <div class="lyric-quote">
        <p lang="ja" id="lyric-sync-text">${lyricMarkup(lesson)}</p>
        <div class="lyric-translation">
          <span>繁中</span>
          <strong>${escapeHtml(lesson.lineZhTw)}</strong>
        </div>

        <div class="lyric-playback-row">
          <button class="lyric-primary-play" id="lyric-original" type="button" disabled>
            <span class="lyric-play-symbol" id="lyric-original-icon">${icons.play}</span>
            <span class="lyric-play-copy">
              <strong id="lyric-original-label">原曲片段</strong>
              <small id="lyric-original-status">音訊準備中</small>
            </span>
            <span class="lyric-audio-progress" aria-hidden="true"><span id="lyric-audio-progress-fill"></span></span>
          </button>
          <button class="lyric-pronounce" id="lyric-pronounce" type="button" aria-label="播放標準日文發音">
            ${icons.volume}
            <span>發音</span>
          </button>
        </div>
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

      <p class="lyric-source">左右滑動翻卡 · LRCLIB 同步時間 · 原曲音訊 · MyMemory 繁中對照。</p>
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

function setBasicPlaybackState(
  root: HTMLElement,
  playing: boolean,
  progress: number,
): void {
  const icon = root.querySelector<HTMLElement>('#lyric-original-icon');
  const fill = root.querySelector<HTMLElement>('#lyric-audio-progress-fill');
  const button = root.querySelector<HTMLButtonElement>('#lyric-original');
  if (!icon || !fill || !button) return;

  icon.innerHTML = playing ? icons.pause : icons.play;
  button.classList.toggle('playing', playing);
  fill.style.width = (Math.max(0, Math.min(1, progress)) * 100).toFixed(1) + '%';
}

function resetLyricHighlight(root: HTMLElement): void {
  root.querySelectorAll<HTMLElement>('.lyric-sync-word, .lyric-sync-line').forEach((element) => {
    element.classList.remove('active');
  });
}

function updateLyricHighlight(
  root: HTMLElement,
  lesson: DailyLyricLesson,
  currentSeconds: number,
): void {
  resetLyricHighlight(root);

  if (lesson.words?.length) {
    lesson.words.forEach((word, index) => {
      if (currentSeconds >= word.startSeconds && currentSeconds < word.endSeconds) {
        root.querySelector<HTMLElement>('[data-lyric-word="' + index + '"]')?.classList.add('active');
      }
    });
    return;
  }

  if (
    lesson.lineStartSeconds !== undefined
    && lesson.lineEndSeconds !== undefined
    && currentSeconds >= lesson.lineStartSeconds
    && currentSeconds < lesson.lineEndSeconds
  ) {
    root.querySelector<HTMLElement>('#lyric-sync-line')?.classList.add('active');
  }
}

function setPreviewState(
  root: HTMLElement,
  source: OriginalClipSource,
  playing: boolean,
  elapsedSeconds = 0,
): void {
  const label = root.querySelector<HTMLElement>('#lyric-original-label');
  const status = root.querySelector<HTMLElement>('#lyric-original-status');
  if (!label || !status) return;

  label.textContent = '原曲試聽';
  setBasicPlaybackState(root, playing, elapsedSeconds / source.previewSeconds);

  if (playing) {
    status.textContent = Math.max(0, Math.ceil(source.previewSeconds - elapsedSeconds)) + ' 秒 · 播放中';
  } else {
    status.textContent = source.previewSeconds + ' 秒 · 純音訊';
  }
}

function playOriginalPreview(root: HTMLElement, source: OriginalClipSource): void {
  const status = root.querySelector<HTMLElement>('#lyric-original-status');

  if (activePreview && !activePreview.paused) {
    stopActivePreview();
    setPreviewState(root, source, false);
    return;
  }

  void stopActivePrecise();
  stopActivePreview();
  resetLyricHighlight(root);

  // Keep a real media element attached to the document. This is more reliable
  // than a detached Audio() object in iOS standalone PWAs.
  const audio = document.createElement('audio');
  audio.src = source.previewUrl;
  audio.preload = 'auto';
  audio.volume = 1;
  audio.muted = false;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.hidden = true;
  document.body.appendChild(audio);

  activePreview = audio;
  audio.load();

  let finished = false;
  let startWatchdog: number | undefined = window.setTimeout(() => {
    if (audio.currentTime < 0.05) finish(true);
  }, 5000);

  const finish = (failed = false): void => {
    if (finished) return;
    finished = true;

    if (activePreviewTimer !== undefined) {
      window.clearInterval(activePreviewTimer);
      activePreviewTimer = undefined;
    }
    if (startWatchdog !== undefined) {
      window.clearTimeout(startWatchdog);
      startWatchdog = undefined;
    }

    audio.pause();
    audio.remove();
    if (activePreview === audio) activePreview = undefined;

    if (!root.isConnected) return;
    setPreviewState(root, source, false);
    if (failed && status) {
      status.textContent = '音訊載入失敗 · 再按一次重試';
    }
  };

  audio.addEventListener('ended', () => finish(false), { once: true });
  audio.addEventListener('error', () => finish(true), { once: true });
  audio.addEventListener('playing', () => {
    if (startWatchdog !== undefined) {
      window.clearTimeout(startWatchdog);
      startWatchdog = undefined;
    }
  }, { once: true });

  if (status) status.textContent = '正在載入音訊…';

  void audio.play().then(() => {
    if (!root.isConnected) {
      finish(false);
      return;
    }

    setPreviewState(root, source, true, 0);
    activePreviewTimer = window.setInterval(() => {
      if (activePreview !== audio || !root.isConnected) {
        finish(false);
        return;
      }

      if (audio.error) {
        finish(true);
        return;
      }

      const elapsed = Math.min(audio.currentTime, source.previewSeconds);
      setPreviewState(root, source, true, elapsed);
      if (elapsed >= source.previewSeconds) finish(false);
    }, 180);
  }).catch(() => {
    finish(true);
  });
}

async function playPrecise(
  root: HTMLElement,
  lesson: DailyLyricLesson,
  source: PrecisePlaybackSource,
  fallback?: OriginalClipSource,
): Promise<void> {
  const status = root.querySelector<HTMLElement>('#lyric-original-status');
  const label = root.querySelector<HTMLElement>('#lyric-original-label');
  if (!status || !label) return;

  if (activePreciseController) {
    await stopActivePrecise();
    resetLyricHighlight(root);
    setBasicPlaybackState(root, false, 0);
    label.textContent = '原曲片段';
    status.textContent = '前後各 7 秒 · 精準同步';
    return;
  }

  stopActivePreview();
  label.textContent = '原曲片段';
  status.textContent = '連接 Apple Music…';
  setBasicPlaybackState(root, true, 0);

  try {
    activePreciseController = await playPreciseSegment(source, ({ currentSeconds, progress }) => {
      if (!root.isConnected) return;
      setBasicPlaybackState(root, true, progress);
      updateLyricHighlight(root, lesson, currentSeconds);

      const remaining = Math.max(0, Math.ceil(source.endSeconds - currentSeconds));
      const inLine = lesson.lineStartSeconds !== undefined
        && lesson.lineEndSeconds !== undefined
        && currentSeconds >= lesson.lineStartSeconds
        && currentSeconds <= lesson.lineEndSeconds;
      status.textContent = inLine
        ? '正在唱這一句 · ' + remaining + ' 秒'
        : '精準片段 · ' + remaining + ' 秒';

      if (progress >= 0.999) {
        activePreciseController = undefined;
        resetLyricHighlight(root);
        setBasicPlaybackState(root, false, 0);
        status.textContent = '前後各 7 秒 · 精準同步';
      }
    });
  } catch {
    activePreciseController = undefined;
    resetLyricHighlight(root);
    setBasicPlaybackState(root, false, 0);

    if (fallback) {
      setPreviewState(root, fallback, false);
      status.textContent = fallback.previewSeconds + ' 秒 · 試聽模式';
      playOriginalPreview(root, fallback);
    } else {
      status.textContent = 'Apple Music 授權後可精準播放';
    }
  }
}

async function hydrateOriginalPlayback(root: HTMLElement, lesson: DailyLyricLesson): Promise<void> {
  const button = root.querySelector<HTMLButtonElement>('#lyric-original');
  const label = root.querySelector<HTMLElement>('#lyric-original-label');
  const status = root.querySelector<HTMLElement>('#lyric-original-status');
  if (!button || !label || !status) return;

  // Never let the optional precise MusicKit path block the proven audio-preview
  // path. Resolve the preview first, make the button usable immediately, then
  // upgrade the same button to precise playback in the background when possible.
  const precisePromise = resolvePrecisePlayback(lesson);

  const preview = await resolveOriginalClip(lesson);
  if (!root.isConnected) return;

  let fallback: OriginalClipSource | undefined;
  if (preview.state === 'ready') {
    fallback = preview.source;
    button.disabled = false;
    setPreviewState(root, fallback, false);
    button.onclick = () => playOriginalPreview(root, fallback!);
  } else {
    label.textContent = '原曲片段';
    status.textContent = '正在準備精準片段…';
  }

  const precise = await precisePromise;
  if (!root.isConnected) return;

  if (precise.state === 'ready') {
    button.disabled = false;
    label.textContent = '原曲片段';
    status.textContent = '前後各 7 秒 · 精準同步';
    const preciseSource = precise.source;
    button.onclick = () => {
      void playPrecise(root, lesson, preciseSource, fallback);
    };
    return;
  }

  if (fallback) {
    // Keep the already-working preview enabled. Precise playback is an upgrade,
    // not a prerequisite.
    button.disabled = false;
    setPreviewState(root, fallback, false);
    button.onclick = () => playOriginalPreview(root, fallback!);
    return;
  }

  button.disabled = true;
  label.textContent = '原曲片段';
  status.textContent = '暫時無法取得音訊';
}

function bindLessonInteractions(root: HTMLElement, lesson: DailyLyricLesson): void {
  root.querySelector<HTMLButtonElement>('#lyric-pronounce')?.addEventListener('click', () => {
    stopAllPlayback();
    resetLyricHighlight(root);
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
  stopAllPlayback();
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

  if (cached?.timingResolved && cached.timingVersion === 2) {
    root.innerHTML = pageHtml(state.artists, dailyLesson(context, cached));
    bindSharedInteractions(root);
    bindLessonInteractions(root, cached);
    return;
  }

  await fetchAndRenderLesson(root, context, state.artists, artist, dateKey, key);
}
