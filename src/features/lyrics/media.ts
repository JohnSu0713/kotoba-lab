import type { DailyLyricLesson, OriginalClipSource } from './models.js';

interface RuntimeConfig {
  youtubeDataApiKey?: string;
}

interface YouTubeSearchItem {
  id?: { videoId?: string };
  snippet?: {
    title?: string;
    channelTitle?: string;
  };
}

interface YouTubeSearchResponse {
  items?: YouTubeSearchItem[];
}

export type OriginalClipResolution =
  | { state: 'ready'; source: OriginalClipSource }
  | { state: 'unconfigured' | 'untimed' | 'not-found' | 'error' };

const CONFIG_URL = './runtime-config.json';
const CACHE_PREFIX = 'kotoba-lab:youtube-clip:v1:';
let configPromise: Promise<RuntimeConfig> | undefined;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s・･._\-()[\]【】「」『』"'’‘“”]+/g, '');
}

function scoreResult(item: YouTubeSearchItem, lesson: DailyLyricLesson): number {
  const title = item.snippet?.title ?? '';
  const channel = item.snippet?.channelTitle ?? '';
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(lesson.artistName);
  const normalizedTrack = normalize(lesson.trackName);
  const haystack = normalize(title + ' ' + channel);

  let score = 0;
  if (normalizedTrack && normalizedTitle.includes(normalizedTrack)) score += 8;
  if (normalizedArtist && haystack.includes(normalizedArtist)) score += 5;
  if (/official\s*audio|audio|topic/i.test(title + ' ' + channel)) score += 5;
  if (/official\s*(music\s*)?video|mv/i.test(title)) score += 2;
  if (/ - topic$/i.test(channel)) score += 4;
  if (/live|cover|karaoke|instrumental|reaction|shorts?/i.test(title)) score -= 8;
  return score;
}

async function runtimeConfig(): Promise<RuntimeConfig> {
  if (!configPromise) {
    configPromise = fetch(CONFIG_URL, { cache: 'no-store' })
      .then(async (response) => response.ok ? await response.json() as RuntimeConfig : {})
      .catch(() => ({}));
  }
  return configPromise;
}

function cachedSource(key: string): OriginalClipSource | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OriginalClipSource;
    if (parsed.provider !== 'youtube' || !parsed.videoId) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function cacheSource(key: string, source: OriginalClipSource): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(source));
  } catch {
    // Media resolution is an enhancement; storage failure must not break Lyrics.
  }
}

export function youtubeSearchUrl(lesson: DailyLyricLesson): string {
  return 'https://www.youtube.com/results?search_query='
    + encodeURIComponent(lesson.artistName + ' ' + lesson.trackName);
}

export function youtubeEmbedUrl(source: OriginalClipSource): string {
  const url = new URL('https://www.youtube.com/embed/' + source.videoId);
  url.searchParams.set('autoplay', '1');
  url.searchParams.set('playsinline', '1');
  url.searchParams.set('controls', '1');
  url.searchParams.set('rel', '0');
  url.searchParams.set('start', String(Math.max(0, Math.floor(source.startSeconds))));
  url.searchParams.set('end', String(Math.max(1, Math.ceil(source.endSeconds))));
  return url.toString();
}

export async function resolveOriginalClip(lesson: DailyLyricLesson): Promise<OriginalClipResolution> {
  if (lesson.lineStartSeconds === undefined || lesson.lineEndSeconds === undefined) {
    return { state: 'untimed' };
  }

  const key = normalize(lesson.artistName + ':' + lesson.trackName);
  const cached = cachedSource(key);
  if (cached) {
    return {
      state: 'ready',
      source: {
        ...cached,
        startSeconds: lesson.lineStartSeconds,
        endSeconds: lesson.lineEndSeconds,
      },
    };
  }

  const config = await runtimeConfig();
  const apiKey = config.youtubeDataApiKey?.trim();
  if (!apiKey) return { state: 'unconfigured' };

  try {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('videoEmbeddable', 'true');
    url.searchParams.set('videoSyndicated', 'true');
    url.searchParams.set('videoCategoryId', '10');
    url.searchParams.set('regionCode', 'JP');
    url.searchParams.set('relevanceLanguage', 'ja');
    url.searchParams.set('maxResults', '8');
    url.searchParams.set('q', lesson.artistName + ' ' + lesson.trackName + ' official audio');
    url.searchParams.set('key', apiKey);

    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) return { state: 'error' };
    const data = await response.json() as YouTubeSearchResponse;
    const candidates = (data.items ?? [])
      .filter((item) => !!item.id?.videoId)
      .sort((a, b) => scoreResult(b, lesson) - scoreResult(a, lesson));
    const selected = candidates[0];
    const videoId = selected?.id?.videoId;
    if (!videoId) return { state: 'not-found' };

    const source: OriginalClipSource = {
      provider: 'youtube',
      videoId,
      title: selected.snippet?.title ?? lesson.trackName,
      channelTitle: selected.snippet?.channelTitle ?? '',
      startSeconds: lesson.lineStartSeconds,
      endSeconds: lesson.lineEndSeconds,
    };
    cacheSource(key, source);
    return { state: 'ready', source };
  } catch {
    return { state: 'error' };
  }
}
