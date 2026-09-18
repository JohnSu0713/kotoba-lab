import type { DailyLyricLesson, FollowedArtist } from './models.js';

interface LrcLibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
}

interface SyncedLine {
  text: string;
  startSeconds: number;
  endSeconds: number;
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

function validLearningLine(line: string): boolean {
  return line.length >= 3
    && line.length <= 72
    && !/^\[[^\]]+\]$/.test(line)
    && /[ぁ-ゖァ-ヺ一-龯]/.test(line);
}

function lyricLines(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map((line) => line.replace(/^\[[0-9:.]+\]\s*/, '').trim())
    .filter(validLearningLine);
}

function parseTimestamp(value: string): number | undefined {
  const match = value.match(/^(\d+):(\d{2})(?:\.(\d{1,3}))?$/);
  if (!match) return undefined;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  const fraction = Number('0.' + (match[3] ?? '0'));
  if (!Number.isFinite(minutes) || !Number.isFinite(seconds) || seconds >= 60) return undefined;
  return minutes * 60 + seconds + fraction;
}

function syncedLines(raw: string, trackDuration?: number): SyncedLine[] {
  const parsed = raw
    .split(/\r?\n/)
    .map((line) => {
      const match = line.match(/^\[(\d+:\d{2}(?:\.\d{1,3})?)\]\s*(.*)$/);
      if (!match) return undefined;
      const startSeconds = parseTimestamp(match[1] ?? '');
      const text = (match[2] ?? '').trim();
      if (startSeconds === undefined || !validLearningLine(text)) return undefined;
      return { text, startSeconds };
    })
    .filter((line): line is { text: string; startSeconds: number } => !!line)
    .sort((a, b) => a.startSeconds - b.startSeconds);

  return parsed.map((line, index) => {
    const next = parsed[index + 1];
    const naturalEnd = next?.startSeconds
      ?? (trackDuration && trackDuration > line.startSeconds ? trackDuration : line.startSeconds + 8);
    const endSeconds = Math.max(line.startSeconds + 2.5, Math.min(naturalEnd + 0.2, line.startSeconds + 12));
    return {
      text: line.text,
      startSeconds: Math.max(0, line.startSeconds - 0.35),
      endSeconds,
    };
  });
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
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Lrclib-Client': 'Kotoba Lab (https://github.com/JohnSu0713/kotoba-lab)',
    },
  });
  if (!response.ok) throw new Error('Lyrics search failed: ' + response.status);

  const results = await response.json() as LrcLibTrack[];
  const target = normalized(artist.name);
  return results.filter((track) => {
    if (track.instrumental || (!track.plainLyrics && !track.syncedLyrics)) return false;
    const credited = normalized(track.artistName);
    return credited.includes(target) || target.includes(credited);
  });
}

export async function fetchDailyLyric(artist: FollowedArtist, dateKey: string): Promise<DailyLyricLesson> {
  const tracks = await searchArtistTracks(artist);
  if (!tracks.length) throw new Error('目前找不到 ' + artist.name + ' 的可用歌詞。');

  const synchronizedTracks = tracks.filter((track) => !!track.syncedLyrics);
  const pool = synchronizedTracks.length ? synchronizedTracks : tracks;
  const track = pool[stableHash('track:' + dateKey + ':' + artist.id) % pool.length];
  if (!track) throw new Error('Selected track is unavailable.');

  const timed = track.syncedLyrics ? syncedLines(track.syncedLyrics, track.duration) : [];
  const timedLine = timed.length
    ? timed[stableHash('line:' + dateKey + ':' + track.id) % timed.length]
    : undefined;
  const plain = track.plainLyrics ? lyricLines(track.plainLyrics) : [];
  const lineJa = timedLine?.text
    ?? plain[stableHash('line:' + dateKey + ':' + track.id) % Math.max(1, plain.length)];

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
    timingResolved: true,
    ...(timedLine ? {
      lineStartSeconds: timedLine.startSeconds,
      lineEndSeconds: timedLine.endSeconds,
    } : {}),
    fetchedAt: new Date().toISOString(),
    source: 'lrclib+mymemory',
  };
}
