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

interface DeezerTrack {
  id?: number;
  title?: string;
  title_short?: string;
  preview?: string;
  artist?: { name?: string };
  album?: {
    title?: string;
    cover_medium?: string;
  };
}

interface DeezerSearchResponse {
  data?: DeezerTrack[];
}

export type OriginalClipResolution =
  | { state: 'ready'; source: OriginalClipSource }
  | { state: 'not-found' | 'error' };

const CACHE_PREFIX = 'kotoba-lab:audio-preview:v3:';
const STOREFRONTS = ['US', 'JP', 'TW'] as const;

const ARTIST_ALIASES: Record<string, string> = {
  '藤井風': 'Fujii Kaze',
  '藤井 風': 'Fujii Kaze',
  '米津玄師': 'Kenshi Yonezu',
  'あいみょん': 'Aimyon',
  'official髭男dism': 'Official HIGE DANdism',
  'officialhigedandism': 'Official HIGE DANdism',
};

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s・･._\-()[\]【】「」『』"'’‘“”]+/g, '');
}

function romanizeKana(value: string): string {
  const pairs: Record<string, string> = {
    きゃ:'kya',きゅ:'kyu',きょ:'kyo',しゃ:'sha',しゅ:'shu',しょ:'sho',
    ちゃ:'cha',ちゅ:'chu',ちょ:'cho',にゃ:'nya',にゅ:'nyu',にょ:'nyo',
    ひゃ:'hya',ひゅ:'hyu',ひょ:'hyo',みゃ:'mya',みゅ:'myu',みょ:'myo',
    りゃ:'rya',りゅ:'ryu',りょ:'ryo',ぎゃ:'gya',ぎゅ:'gyu',ぎょ:'gyo',
    じゃ:'ja',じゅ:'ju',じょ:'jo',びゃ:'bya',びゅ:'byu',びょ:'byo',
    ぴゃ:'pya',ぴゅ:'pyu',ぴょ:'pyo',
  };
  const single: Record<string, string> = {
    あ:'a',い:'i',う:'u',え:'e',お:'o',
    か:'ka',き:'ki',く:'ku',け:'ke',こ:'ko',
    さ:'sa',し:'shi',す:'su',せ:'se',そ:'so',
    た:'ta',ち:'chi',つ:'tsu',て:'te',と:'to',
    な:'na',に:'ni',ぬ:'nu',ね:'ne',の:'no',
    は:'ha',ひ:'hi',ふ:'fu',へ:'he',ほ:'ho',
    ま:'ma',み:'mi',む:'mu',め:'me',も:'mo',
    や:'ya',ゆ:'yu',よ:'yo',
    ら:'ra',り:'ri',る:'ru',れ:'re',ろ:'ro',
    わ:'wa',を:'o',ん:'n',
    が:'ga',ぎ:'gi',ぐ:'gu',げ:'ge',ご:'go',
    ざ:'za',じ:'ji',ず:'zu',ぜ:'ze',ぞ:'zo',
    だ:'da',ぢ:'ji',づ:'zu',で:'de',ど:'do',
    ば:'ba',び:'bi',ぶ:'bu',べ:'be',ぼ:'bo',
    ぱ:'pa',ぴ:'pi',ぷ:'pu',ぺ:'pe',ぽ:'po',
    ぁ:'a',ぃ:'i',ぅ:'u',ぇ:'e',ぉ:'o',
    ゔ:'vu',
  };

  const hira = Array.from(value).map((char) => {
    const code = char.charCodeAt(0);
    if (code >= 0x30A1 && code <= 0x30F6) {
      return String.fromCharCode(code - 0x60);
    }
    return char;
  }).join('');

  let out = '';
  let geminate = false;
  for (let i = 0; i < hira.length; i += 1) {
    const char = hira[i] ?? '';
    if (char === 'っ') {
      geminate = true;
      continue;
    }

    const pair = hira.slice(i, i + 2);
    let syllable = pairs[pair];
    if (syllable) {
      i += 1;
    } else {
      syllable = single[char] ?? char;
    }

    if (geminate && /^[bcdfghjkmprstvwxyz]/i.test(syllable)) {
      syllable = syllable[0] + syllable;
    }
    geminate = false;
    out += syllable;
  }

  return out
    .replace(/ー/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function canonicalArtist(value: string): string {
  return ARTIST_ALIASES[value]
    ?? ARTIST_ALIASES[normalize(value)]
    ?? value;
}

function scoreNames(
  title: string,
  artist: string,
  lesson: DailyLyricLesson,
): number {
  const normalizedTitle = normalize(title);
  const normalizedArtist = normalize(artist);
  const targetTitle = normalize(lesson.trackName);
  const romanTitle = normalize(romanizeKana(lesson.trackName));
  const targetArtist = normalize(lesson.artistName);
  const aliasArtist = normalize(canonicalArtist(lesson.artistName));

  let score = 0;

  if (targetTitle && normalizedTitle === targetTitle) score += 20;
  else if (romanTitle && normalizedTitle === romanTitle) score += 18;
  else if (targetTitle && normalizedTitle.includes(targetTitle)) score += 10;
  else if (romanTitle && normalizedTitle.includes(romanTitle)) score += 9;

  if (targetArtist && normalizedArtist === targetArtist) score += 14;
  else if (aliasArtist && normalizedArtist === aliasArtist) score += 14;
  else if (targetArtist && normalizedArtist.includes(targetArtist)) score += 7;
  else if (aliasArtist && normalizedArtist.includes(aliasArtist)) score += 7;

  return score;
}

function scoreAppleResult(item: AppleTrack, lesson: DailyLyricLesson): number {
  let score = scoreNames(item.trackName ?? '', item.artistName ?? '', lesson);
  const noisy = (item.trackName ?? '') + ' ' + (item.collectionName ?? '');
  if (/live|remix|instrumental|karaoke|cover|tribute/i.test(noisy)) score -= 10;
  if (item.previewUrl) score += 4;
  return score;
}

function scoreDeezerResult(item: DeezerTrack, lesson: DailyLyricLesson): number {
  let score = scoreNames(
    item.title_short ?? item.title ?? '',
    item.artist?.name ?? '',
    lesson,
  );
  const noisy = (item.title ?? '') + ' ' + (item.album?.title ?? '');
  if (/live|remix|instrumental|karaoke|cover|tribute/i.test(noisy)) score -= 10;
  if (item.preview) score += 4;
  return score;
}

function cachedSource(key: string): OriginalClipSource | undefined {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as OriginalClipSource;
    if (!parsed.previewUrl) return undefined;
    if (parsed.provider !== 'apple-preview' && parsed.provider !== 'deezer-preview') return undefined;
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

function appleSearchUrl(lesson: DailyLyricLesson, country: string): URL {
  const url = new URL('https://itunes.apple.com/search');
  url.searchParams.set('term', lesson.artistName + ' ' + lesson.trackName);
  url.searchParams.set('country', country);
  url.searchParams.set('media', 'music');
  url.searchParams.set('entity', 'song');
  url.searchParams.set('limit', '25');
  return url;
}

async function appleFetch(
  lesson: DailyLyricLesson,
  country: string,
): Promise<AppleSearchResponse> {
  const response = await fetch(appleSearchUrl(lesson, country), {
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Apple preview lookup failed: ' + response.status);
  return await response.json() as AppleSearchResponse;
}

async function appleJsonp(
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
    }, 5000);

    const cleanup = (): void => {
      window.clearTimeout(timeout);
      delete globals[callbackName];
      script.remove();
    };

    globals[callbackName] = (data: AppleSearchResponse): void => {
      cleanup();
      resolve(data);
    };

    const url = appleSearchUrl(lesson, country);
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

async function searchApple(lesson: DailyLyricLesson): Promise<AppleTrack | undefined> {
  const merged: AppleTrack[] = [];

  for (const country of STOREFRONTS) {
    try {
      let response: AppleSearchResponse;
      try {
        response = await appleFetch(lesson, country);
      } catch {
        response = await appleJsonp(lesson, country);
      }
      merged.push(...(response.results ?? []));
    } catch {
      // Continue to the next storefront.
    }
  }

  return merged
    .filter((item) => !!item.previewUrl)
    .sort((a, b) => scoreAppleResult(b, lesson) - scoreAppleResult(a, lesson))[0];
}

function deezerQueries(lesson: DailyLyricLesson): string[] {
  const artist = canonicalArtist(lesson.artistName);
  const romanTitle = romanizeKana(lesson.trackName);
  return Array.from(new Set([
    'artist:"' + artist + '" track:"' + romanTitle + '"',
    artist + ' ' + romanTitle,
    artist + ' ' + lesson.trackName,
    lesson.artistName + ' ' + lesson.trackName,
  ].filter((query) => query.trim().length > 1)));
}

async function deezerJsonp(query: string): Promise<DeezerSearchResponse> {
  return await new Promise<DeezerSearchResponse>((resolve, reject) => {
    const callbackName = '__kotobaDeezerPreview' + Date.now().toString(36)
      + Math.random().toString(36).slice(2, 6);
    const script = document.createElement('script');
    const globals = window as unknown as Record<string, unknown>;
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error('Deezer preview lookup timed out.'));
    }, 5000);

    const cleanup = (): void => {
      window.clearTimeout(timeout);
      delete globals[callbackName];
      script.remove();
    };

    globals[callbackName] = (data: DeezerSearchResponse): void => {
      cleanup();
      resolve(data);
    };

    const url = new URL('https://api.deezer.com/search');
    url.searchParams.set('q', query);
    url.searchParams.set('limit', '25');
    url.searchParams.set('output', 'jsonp');
    url.searchParams.set('callback', callbackName);
    script.src = url.toString();
    script.async = true;
    script.addEventListener('error', () => {
      cleanup();
      reject(new Error('Deezer preview lookup failed.'));
    });
    document.head.appendChild(script);
  });
}

async function searchDeezer(lesson: DailyLyricLesson): Promise<DeezerTrack | undefined> {
  const merged: DeezerTrack[] = [];

  for (const query of deezerQueries(lesson)) {
    try {
      const response = await deezerJsonp(query);
      merged.push(...(response.data ?? []));
      if (merged.some((item) => !!item.preview && scoreDeezerResult(item, lesson) >= 20)) break;
    } catch {
      // Try the next query shape.
    }
  }

  return merged
    .filter((item) => !!item.preview)
    .sort((a, b) => scoreDeezerResult(b, lesson) - scoreDeezerResult(a, lesson))[0];
}

export async function resolveOriginalClip(lesson: DailyLyricLesson): Promise<OriginalClipResolution> {
  const key = normalize(lesson.artistName + ':' + lesson.trackName);
  const cached = cachedSource(key);
  if (cached) return { state: 'ready', source: cached };

  try {
    const apple = await searchApple(lesson);
    if (apple?.previewUrl) {
      const source: OriginalClipSource = {
        provider: 'apple-preview',
        previewUrl: apple.previewUrl,
        title: apple.trackName ?? lesson.trackName,
        artistName: apple.artistName ?? lesson.artistName,
        ...(apple.collectionName ? { albumName: apple.collectionName } : {}),
        ...(apple.artworkUrl100 ? { artworkUrl: apple.artworkUrl100.replace('100x100bb', '300x300bb') } : {}),
        previewSeconds: 20,
      };
      cacheSource(key, source);
      return { state: 'ready', source };
    }

    const deezer = await searchDeezer(lesson);
    if (deezer?.preview) {
      const source: OriginalClipSource = {
        provider: 'deezer-preview',
        previewUrl: deezer.preview,
        title: deezer.title_short ?? deezer.title ?? lesson.trackName,
        artistName: deezer.artist?.name ?? lesson.artistName,
        ...(deezer.album?.title ? { albumName: deezer.album.title } : {}),
        ...(deezer.album?.cover_medium ? { artworkUrl: deezer.album.cover_medium } : {}),
        previewSeconds: 20,
      };
      cacheSource(key, source);
      return { state: 'ready', source };
    }

    return { state: 'not-found' };
  } catch {
    return { state: 'error' };
  }
}
