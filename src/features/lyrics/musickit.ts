import type { DailyLyricLesson, PrecisePlaybackSource } from './models.js';

interface RuntimeConfig {
  appleMusicDeveloperToken?: string;
}

interface AppleCatalogSong {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
  };
}

interface AppleCatalogSearchResponse {
  results?: {
    songs?: {
      data?: AppleCatalogSong[];
    };
  };
}

interface MusicKitInstance {
  isAuthorized: boolean;
  currentPlaybackTime: number;
  storefrontCountryCode?: string;
  storefrontId?: string;
  previewOnly: boolean;
  authorize(): Promise<string | void>;
  setQueue(options: Record<string, unknown>): Promise<unknown>;
  play(): void | Promise<void>;
  pause(): void | Promise<void>;
  stop(): void | Promise<void>;
  seekToTime(time: number): Promise<void>;
}

interface MusicKitGlobal {
  configure(options: {
    developerToken: string;
    app: { name: string; build: string };
    storefrontId?: string;
    features?: string[];
  }): Promise<MusicKitInstance> | MusicKitInstance;
  getInstance(): MusicKitInstance;
}

interface MusicKitWindow extends Window {
  MusicKit?: MusicKitGlobal;
}

export interface PrecisePlaybackTick {
  currentSeconds: number;
  progress: number;
}

export interface PrecisePlaybackController {
  stop(): Promise<void>;
}

export type PrecisePlaybackAvailability =
  | { state: 'ready'; source: PrecisePlaybackSource }
  | { state: 'unconfigured' | 'not-found' | 'error' };

const CONFIG_URL = './runtime-config.json';
const SCRIPT_URL = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
const PRE_ROLL_SECONDS = 7;
const POST_ROLL_SECONDS = 7;
const STOREFRONTS = ['us', 'jp', 'tw'] as const;

let configPromise: Promise<RuntimeConfig> | undefined;
let scriptPromise: Promise<void> | undefined;
let musicPromise: Promise<MusicKitInstance | undefined> | undefined;
let activeTimer: number | undefined;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s・･._\-()[\]【】「」『』"'’‘“”]+/g, '');
}

async function runtimeConfig(): Promise<RuntimeConfig> {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as RuntimeConfig : {})
      .catch(() => ({}));
  }
  return await configPromise;
}

async function loadMusicKitScript(): Promise<void> {
  const target = window as MusicKitWindow;
  if (target.MusicKit) return;

  if (!scriptPromise) {
    scriptPromise = new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-kotoba-musickit]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('MusicKit failed to load.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = SCRIPT_URL;
      script.async = true;
      script.dataset.kotobaMusickit = 'true';
      script.addEventListener('load', () => resolve(), { once: true });
      script.addEventListener('error', () => reject(new Error('MusicKit failed to load.')), { once: true });
      document.head.appendChild(script);
    });
  }

  await scriptPromise;
}

async function musicInstance(): Promise<MusicKitInstance | undefined> {
  if (musicPromise) return await musicPromise;

  musicPromise = (async () => {
    const config = await runtimeConfig();
    const developerToken = config.appleMusicDeveloperToken?.trim();
    if (!developerToken) return undefined;

    await loadMusicKitScript();
    const musicKit = (window as MusicKitWindow).MusicKit;
    if (!musicKit) return undefined;

    try {
      const configured = await musicKit.configure({
        developerToken,
        app: {
          name: 'Kotoba Lab',
          build: '0.6.0',
        },
        storefrontId: 'us',
        features: ['player-accurate-timing'],
      });
      return configured ?? musicKit.getInstance();
    } catch {
      try {
        return musicKit.getInstance();
      } catch {
        return undefined;
      }
    }
  })();

  return await musicPromise;
}

function scoreSong(song: AppleCatalogSong, lesson: DailyLyricLesson): number {
  const title = normalize(song.attributes?.name ?? '');
  const artist = normalize(song.attributes?.artistName ?? '');
  const targetTitle = normalize(lesson.trackName);
  const targetArtist = normalize(lesson.artistName);

  let score = 0;
  if (title === targetTitle) score += 24;
  else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 12;

  if (artist === targetArtist) score += 18;
  else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 9;

  return score;
}

async function searchCatalog(
  developerToken: string,
  storefront: string,
  lesson: DailyLyricLesson,
): Promise<AppleCatalogSong[]> {
  const url = new URL('https://api.music.apple.com/v1/catalog/' + storefront + '/search');
  url.searchParams.set('term', lesson.artistName + ' ' + lesson.trackName);
  url.searchParams.set('types', 'songs');
  url.searchParams.set('limit', '10');

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      Authorization: 'Bearer ' + developerToken,
    },
  });
  if (!response.ok) return [];

  const data = await response.json() as AppleCatalogSearchResponse;
  return data.results?.songs?.data ?? [];
}

export async function resolvePrecisePlayback(
  lesson: DailyLyricLesson,
): Promise<PrecisePlaybackAvailability> {
  if (lesson.lineStartSeconds === undefined || lesson.lineEndSeconds === undefined) {
    return { state: 'not-found' };
  }

  const config = await runtimeConfig();
  const developerToken = config.appleMusicDeveloperToken?.trim();
  if (!developerToken) return { state: 'unconfigured' };

  try {
    const music = await musicInstance();
    const preferred = music?.storefrontCountryCode?.toLocaleLowerCase();
    const storefronts = Array.from(new Set([
      preferred,
      ...STOREFRONTS,
    ].filter((value): value is string => !!value)));

    let best: { storefront: string; song: AppleCatalogSong; score: number } | undefined;

    for (const storefront of storefronts) {
      const songs = await searchCatalog(developerToken, storefront, lesson);
      for (const song of songs) {
        const score = scoreSong(song, lesson);
        if (!best || score > best.score) best = { storefront, song, score };
      }
      if (best && best.score >= 36) break;
    }

    if (!best?.song.id || best.score < 18) return { state: 'not-found' };

    return {
      state: 'ready',
      source: {
        provider: 'apple-music',
        songId: best.song.id,
        title: best.song.attributes?.name ?? lesson.trackName,
        artistName: best.song.attributes?.artistName ?? lesson.artistName,
        storefront: best.storefront,
        startSeconds: Math.max(0, lesson.lineStartSeconds - PRE_ROLL_SECONDS),
        endSeconds: lesson.lineEndSeconds + POST_ROLL_SECONDS,
      },
    };
  } catch {
    return { state: 'error' };
  }
}

async function safePause(music: MusicKitInstance): Promise<void> {
  await Promise.resolve(music.pause()).catch(() => undefined);
}

async function safeStop(music: MusicKitInstance): Promise<void> {
  await Promise.resolve(music.stop()).catch(() => undefined);
}

export async function playPreciseSegment(
  source: PrecisePlaybackSource,
  onTick: (tick: PrecisePlaybackTick) => void,
): Promise<PrecisePlaybackController> {
  const music = await musicInstance();
  if (!music) throw new Error('Apple Music 尚未設定。');

  if (!music.isAuthorized) {
    await music.authorize();
  }
  if (!music.isAuthorized) {
    throw new Error('需要授權 Apple Music 才能播放精準片段。');
  }

  if (activeTimer !== undefined) {
    window.clearInterval(activeTimer);
    activeTimer = undefined;
  }

  await safePause(music);
  music.previewOnly = false;

  await music.setQueue({
    song: source.songId,
    startPlaying: false,
  });

  // MusicKit needs a current media item before seeking on Safari/iOS.
  await Promise.resolve(music.play());
  await music.seekToTime(source.startSeconds);

  const duration = Math.max(1, source.endSeconds - source.startSeconds);
  let stopped = false;

  const stop = async (): Promise<void> => {
    if (stopped) return;
    stopped = true;
    if (activeTimer !== undefined) {
      window.clearInterval(activeTimer);
      activeTimer = undefined;
    }
    await safePause(music);
  };

  activeTimer = window.setInterval(() => {
    const currentSeconds = Number(music.currentPlaybackTime);
    if (!Number.isFinite(currentSeconds)) return;

    const progress = Math.max(
      0,
      Math.min(1, (currentSeconds - source.startSeconds) / duration),
    );
    onTick({ currentSeconds, progress });

    if (currentSeconds >= source.endSeconds) {
      void stop();
    }
  }, 50);

  onTick({
    currentSeconds: source.startSeconds,
    progress: 0,
  });

  return {
    stop: async () => {
      await stop();
      if (Number.isFinite(music.currentPlaybackTime)
        && music.currentPlaybackTime >= source.endSeconds - 0.25) {
        await safeStop(music);
      }
    },
  };
}
