import type { DailyLyricLesson, FollowedArtist } from './models.js';

interface LrcLibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

interface MyMemoryResponse {
  responseData?: {
    translatedText?: string;
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function normalized(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/[\s・･._-]+/g, '');
}

function lyricLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[0-9:.]+\]\s*/, '').trim())
    .filter((line) => line.length >= 3 && line.length <= 72)
    .filter((line) => !/^\[[^\]]+\]$/.test(line))
    .filter((line) => /[ぁ-ゖァ-ヺ一-龯]/.test(line));
}

export function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return year + '-' + month + '-' + day;
}

export function pickDailyArtist(artists: FollowedArtist[], dateKey: string): FollowedArtist | undefined {
  if (!artists.length) return undefined;
  return artists[stableHash('artist:' + dateKey) % artists.length];
}

async function translateToTraditionalChinese(text: string): Promise<string> {
  const pairs = ['ja-JP|zh-TW', 'ja|zh-TW'];
  for (const pair of pairs) {
    try {
      const url = new URL('https://api.mymemory.translated.net/get');
      url.searchParams.set('q', text);
      url.searchParams.set('langpair', pair);
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) continue;
      const data = await response.json() as MyMemoryResponse;
      const translated = data.responseData?.translatedText?.trim();
      if (translated && translated !== text) return translated;
    } catch {
      // Try the fallback language pair.
    }
  }
  return '中文翻譯暫時無法取得，先用日文原句練習語感。';
}

async function searchArtistTracks(artist: FollowedArtist): Promise<LrcLibTrack[]> {
  const url = new URL('https://lrclib.net/api/search');
  url.searchParams.set('q', artist.name);
  const response = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error('Lyrics search failed: ' + response.status);

  const results = await response.json() as LrcLibTrack[];
  const target = normalized(artist.name);
  return results.filter((track) => {
    if (track.instrumental || !track.plainLyrics) return false;
    const credited = normalized(track.artistName);
    return credited.includes(target) || target.includes(credited);
  });
}

export async function fetchDailyLyric(artist: FollowedArtist, dateKey: string): Promise<DailyLyricLesson> {
  const tracks = await searchArtistTracks(artist);
  if (!tracks.length) throw new Error('目前找不到 ' + artist.name + ' 的可用歌詞。');

  const track = tracks[stableHash('track:' + dateKey + ':' + artist.id) % tracks.length];
  if (!track?.plainLyrics) throw new Error('Selected track does not include plain lyrics.');

  const lines = lyricLines(track.plainLyrics);
  if (!lines.length) throw new Error('No suitable Japanese lyric line was found.');

  const lineJa = lines[stableHash('line:' + dateKey + ':' + track.id) % lines.length] ?? lines[0];
  if (!lineJa) throw new Error('No suitable Japanese lyric line was found.');
  const lineZhTw = await translateToTraditionalChinese(lineJa);

  return {
    id: dateKey + ':' + track.id + ':' + stableHash(lineJa).toString(36),
    dateKey,
    artistId: artist.id,
    artistName: track.artistName || artist.name,
    trackId: track.id,
    trackName: track.trackName,
    ...(track.albumName ? { albumName: track.albumName } : {}),
    lineJa,
    lineZhTw,
    fetchedAt: new Date().toISOString(),
    source: 'lrclib+mymemory',
  };
}
