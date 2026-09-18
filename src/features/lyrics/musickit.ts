import type { DailyLyricLesson, PrecisePlaybackSource } from './models.js';

interface RuntimeConfig {
  appleMusicDeveloperToken?: string;
}

interface MusicKitSong {
  id: string;
  attributes?: {
    name?: string;
    artistName?: string;
  };
}

interface MusicKitInstance {
  isAuthorized: boolean;
  isPlaying: boolean;
  currentPlaybackTime: number;
  storefrontCountryCode?: string;
  storefrontId?: string;
  previewOnly: boolean;
  authorize(): Promise<string | void>;
  api: {
    search(term: string, options: Record<string, unknown>): Promise<unknown>;
  };
  setQueue(options: Record<string, unknown>): Promise<unknown>;
  play(): Promise<void>;
  pause(): Promise<void>;
  stop(): Promise<void>;
  seekToTime(time: number): Promise<void>;
}

interface MusicKitGlobal {
  configure(options: {
    developerToken: string;
    app: { name: string; build: string };
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
  return configPromise;
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

function collectSongs(payload: unknown): MusicKitSong[] {
  if (!payload || typeof payload !== 'object') return [];
  const root = payload as Record<string, unknown>;

  const candidates = [
    root,
    root.results,
    root.data,
    root.data && typeof root.data === 'object'
      ? (root.data as Record<string, unknown>).results
      : undefined,
  ].filter((value): value is Record<string, unknown> => !!value && typeof value === 'object');

  for (const candidate of candidates) {
    const songs = candidate.songs;
    if (!songs || typeof songs !== 'object') continue;
    const data = (songs as Record<string, unknown>).data;
    if (Array.isArray(data)) return data as MusicKitSong[];
  }
  return [];
}

function scoreSong(song: MusicKitSong, lesson: DailyLyricLesson): number {
  const title = normalize(song.attributes?.name ?? '');
  const artist = normalize(song.attributes?.artistName ?? '');
  const targetTitle = normalize(lesson.trackName);
  const targetArtist = normalize(lesson.artistName);

  let score = 0;
  if (title === targetTitle) score += 20;
  else if (title.includes(targetTitle) || targetTitle.includes(title)) score += 10;

  if (artist === targetArtist) score += 16;
  else if (artist.includes(targetArtist) || targetArtist.includes(artist)) score += 8;

  return score;
}

export async function resolvePrecisePlayback(
  lesson: DailyLyricLesson,
): Promise<PrecisePlaybackAvailability> {
  if (lesson.lineStartSeconds === undefined || lesson.lineEndSeconds === undefined) {
    return { state: 'not-found' };
  }

  const music = await musicInstance();
  if (!music) return { state: 'unconfigured' };

  try {
    const payload = await music.api.search(
      lesson.artistName + ' ' + lesson.trackName,
      { types: 'songs', limit: 10 },
    );
    const song = collectSongs(payload)
      .sort((a, b) => scoreSong(b, lesson) - scoreSong(a, lesson))[0];
    if (!song?.id) return { state: 'not-found' };

    return {
      state: 'ready',
      source: {
        provider: 'apple-music',
        songId: song.id,
        title: song.attributes?.name ?? lesson.trackName,
        artistName: song.attributes?.artistName ?? lesson.artistName,
        storefront: music.storefrontCountryCode ?? music.storefrontId ?? 'us',
        startSeconds: Math.max(0, lesson.lineStartSeconds - PRE_ROLL_SECONDS),
        endSeconds: lesson.lineEndSeconds + POST_ROLL_SECONDS,
      },
    };
  } catch {
    return { state: 'error' };
  }
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

  await music.pause().catch(() => undefined);
  music.previewOnly = false;
  await music.setQueue({ song: source.songId, startPlaying: false });

  try {
    await music.seekToTime(source.startSeconds);
  } catch {
    await music.play();
    await music.seekToTime(source.startSeconds);
  }

  if (!music.isPlaying) await music.play();

  const duration = Math.max(1, source.endSeconds - source.startSeconds);
  const stop = async (): Promise<void> => {
    if (activeTimer !== undefined) {
      window.clearInterval(activeTimer);
      activeTimer = undefined;
    }
    await music.pause().catch(() => undefined);
  };

  activeTimer = window.setInterval(() => {
    const currentSeconds = music.currentPlaybackTime;
    const progress = Math.max(0, Math.min(1, (currentSeconds - source.startSeconds) / duration));
    onTick({ currentSeconds, progress });
    if (currentSeconds >= source.endSeconds) {
      void stop();
    }
  }, 90);

  onTick({
    currentSeconds: source.startSeconds,
    progress: 0,
  });

  return { stop };
}
