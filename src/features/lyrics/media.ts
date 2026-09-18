import type { DailyLyricLesson, OriginalClipSource } from './models.js';

interface AppleTrack {
  trackName?: string;
  artistName?: string;
  collectionName?: string;
  previewUrl?: string;
  artworkUrl100?: string;
  trackId?: number;
}

interface AppleSearchResponse {
  resultCount?: number;
  results?: AppleTrack[];
}

export type OriginalClipResolution =
  | { state: 'ready'; source: OriginalClipSource }
  | { state: 'not-found' | 'error' };

const CACHE_PREFIX = 'kotoba-lab:apple-preview:v2:';
const STOREFRONTS = ['US', 'JP', 'TW'] as const;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s・･._\-()[\]【】「」『』"'’‘“”]+/g, '');
}

function scoreResult(item: AppleTrack, lesson: DailyLyricLesson): number {
  const title = item.trackName ?? '';
  const artist = item.artistName ?? '';
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const targetTitle = normalize(lesson.trackName);
  const targetArtist = normalize(lesson.artistName);

  let score = 0;
  if (targetTitle && normalizedTitle === targetTitle) score += 20;
  else if (targetTitle && normalizedTitle.includes(targetTitle)) score += 10;
  else if (targetTitle && targetTitle.includes(normalizedTitle)) score += 7;

  if (targetArtist && normalizedArtist === targetArtist) score += 14;
  else if (targetArtist && normalizedArtist.includes(targetArtist)) score += 7;
  else if (targetArtist && targetArtist.includes(normalizedArtist)) score += 5;

  const noisy = title + ' ' + (item.collectionName ?? '');
  if (/live|remix|instrumental|karaoke|cover|tribute/i.test(noisy)) score -= 10;
  if (item.previewUrl) score += 4;
  return score;
}

function cachedSource(key: string): OriginalClipSource | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OriginalClipSource;
    if (parsed.provider !== 'apple-preview' || !parsed.previewUrl) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function cacheSource(key: string, source: OriginalClipSource): void {
  try {
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify(source));
  } catch {
    // Preview lookup is an enhancement; storage failure must not break Lyrics.
  }
}

function searchUrl(lesson: DailyLyricLesson, country: string): URL {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', lesson.artistName + ' ' + lesson.trackName);
  url.searchParams.set('country', country);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '25');
  return url;
}

async function searchWithFetch(
  lesson: DailyLyricLesson,
  country: string,
): Promise<AppleSearchResponse> {
  const response = await fetch(searchUrl(lesson, country), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Apple preview lookup failed: ' + response.status);
  return await response.json() as AppleSearchResponse;
}

async function searchWithJsonp(
  lesson: DailyLyricLesson,
  country: string,
): Promise<AppleSearchResponse> {
  return await new Promise<AppleSearchResponse>((resolve, reject) => {
    const callbackName = '__kotobaApplePreview' + Date.now().toString(36);
    const script = document.createElement('script');
    const globals = window as unknown as Record<string, unknown>;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Apple preview lookup timed out.'));
    }, 8000);

    const cleanup = (): void => {
      window.clearTimeout(timeout);
      delete globals[callbackName];
      script.remove();
    };

    globals[callbackName] = (data: AppleSearchResponse): void => {
      cleanup();
      resolve(data);
    };

    const url = searchUrl(lesson, country);
    url.searchParams.set('callback', callbackName);
    script.src = url.toString();
    script.async = true;
    script.addEventListener('error', () => {
      cleanup();
      reject(new Error('Apple preview lookup failed.'));
    });
    document.head.appendChild(script);
  });
}

async function searchStorefront(
  lesson: DailyLyricLesson,
  country: string,
): Promise<AppleSearchResponse> {
  try {
    return await searchWithFetch(lesson, country);
  } catch {
    return await searchWithJsonp(lesson, country);
  }
}

async function searchApple(lesson: DailyLyricLesson): Promise<AppleSearchResponse> {
  const merged: AppleTrack[] = [];
  for (const country of STOREFRONTS) {
    try {
      const response = await searchStorefront(lesson, country);
      merged.push(...(response.results ?? []));
      if (merged.some((item) => !!item.previewUrl && scoreResult(item, lesson) >= 18)) break;
    } catch {
      // A storefront can omit or block previews; continue to the next region.
    }
  }

  const deduped = Array.from(
    new Map(
      merged.map((item) => [
        String(item.trackId ?? '') + '|' + (item.previewUrl ?? '') + '|' + (item.trackName ?? ''),
        item,
      ]),
    ).values(),
  );
  return { resultCount: deduped.length, results: deduped };
}

export async function resolveOriginalClip(lesson: DailyLyricLesson): Promise<OriginalClipResolution> {
  const key = normalize(lesson.artistName + ':' + lesson.trackName);
  const cached = cachedSource(key);
  if (cached) return { state: 'ready', source: cached };

  try {
    const data = await searchApple(lesson);
    const candidates = (data.results ?? [])
      .filter((item) => !!item.previewUrl)
      .sort((a, b) => scoreResult(b, lesson) - scoreResult(a, lesson));

    const selected = candidates[0];
    if (!selected?.previewUrl) return { state: 'not-found' };

    const source: OriginalClipSource = {
      provider: 'apple-preview',
      previewUrl: selected.previewUrl,
      title: selected.trackName ?? lesson.trackName,
      artistName: selected.artistName ?? lesson.artistName,
      ...(selected.collectionName ? { albumName: selected.collectionName } : {}),
      ...(selected.artworkUrl100 ? { artworkUrl: selected.artworkUrl100.replace('100x100bb', '300x300bb') } : {}),
      previewSeconds: 15,
    };
    cacheSource(key, source);
    return { state: 'ready', source };
  } catch {
    return { state: 'error' };
  }
}
