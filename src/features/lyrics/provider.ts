import type {
  DailyLyricLesson,
  FollowedArtist,
  LyricWordTiming,
} from './models.js';

interface LrcLibTrack {
  id: number;
  trackName: string;
  artistName: string;
  albumName?: string;
  duration?: number;
  instrumental: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
  lyricsfile?: string | null;
}

interface SyncedLine {
  text: string;
  startSeconds: number;
  endSeconds: number;
  words?: LyricWordTiming[];
}

interface ParsedLyricsfileLine {
  text: string;
  startSeconds?: number;
  endSeconds?: number;
  words: LyricWordTiming[];
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

function parseYamlScalar(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try {
      return JSON.parse(trimmed) as string;
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/''/g, "'");
  }
  return trimmed;
}

function parseLyricsfile(raw?: string | null): ParsedLyricsfileLine[] {
  if (!raw) return [];

  interface TempWord {
    text: string;
    startMs?: number;
    endMs?: number;
  }

  interface TempLine {
    text: string;
    startMs?: number;
    endMs?: number;
    words: TempWord[];
  }

  const source = raw.split(/\r?\n/);
  const startIndex = source.findIndex((line) => /^\s*lines:\s*$/.test(line));
  if (startIndex < 0) return [];

  const parsed: TempLine[] = [];
  let lineIndent: number | undefined;
  let currentLine: TempLine | undefined;
  let currentWord: TempWord | undefined;

  const flushWord = (): void => {
    if (currentLine && currentWord?.text && currentWord.startMs !== undefined) {
      currentLine.words.push(currentWord);
    }
    currentWord = undefined;
  };

  const flushLine = (): void => {
    flushWord();
    if (currentLine?.text) parsed.push(currentLine);
    currentLine = undefined;
  };

  for (const rawLine of source.slice(startIndex + 1)) {
    if (/^\S/.test(rawLine) && rawLine.trim()) break;

    const textMatch = rawLine.match(/^(\s*)-\s+text:\s*(.*)$/);
    if (textMatch) {
      const indent = textMatch[1]?.length ?? 0;
      const text = parseYamlScalar(textMatch[2] ?? '');

      if (lineIndent === undefined) lineIndent = indent;
      if (indent === lineIndent) {
        flushLine();
        currentLine = { text, words: [] };
      } else if (currentLine && indent > lineIndent) {
        flushWord();
        currentWord = { text };
      }
      continue;
    }

    if (!currentLine || lineIndent === undefined) continue;
    const propertyMatch = rawLine.match(/^(\s*)(start_ms|end_ms):\s*(\d+)/);
    if (!propertyMatch) continue;

    const indent = propertyMatch[1]?.length ?? 0;
    const property = propertyMatch[2];
    const value = Number(propertyMatch[3]);
    if (!Number.isFinite(value)) continue;

    if (currentWord && indent > lineIndent + 2) {
      if (property === 'start_ms') currentWord.startMs = value;
      else currentWord.endMs = value;
    } else {
      flushWord();
      if (property === 'start_ms') currentLine.startMs = value;
      else currentLine.endMs = value;
    }
  }
  flushLine();

  return parsed.map((line) => {
    const lineStart = line.startMs === undefined ? undefined : line.startMs / 1000;
    const lineEnd = line.endMs === undefined ? undefined : line.endMs / 1000;
    const words: LyricWordTiming[] = [];

    line.words.forEach((word, index) => {
      if (word.startMs === undefined) return;
      const next = line.words[index + 1];
      const endMs = word.endMs
        ?? next?.startMs
        ?? line.endMs
        ?? (word.startMs + 900);
      words.push({
        text: word.text,
        startSeconds: word.startMs / 1000,
        endSeconds: Math.max(word.startMs / 1000 + 0.08, endMs / 1000),
      });
    });

    return {
      text: line.text,
      ...(lineStart !== undefined ? { startSeconds: lineStart } : {}),
      ...(lineEnd !== undefined ? { endSeconds: lineEnd } : {}),
      words,
    };
  });
}

function syncedLines(
  raw: string,
  trackDuration?: number,
  lyricsfile?: string | null,
): SyncedLine[] {
  const richLines = parseLyricsfile(lyricsfile);

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
    const rich = richLines
      .filter((candidate) => normalized(candidate.text) === normalized(line.text))
      .sort((a, b) =>
        Math.abs((a.startSeconds ?? line.startSeconds) - line.startSeconds)
        - Math.abs((b.startSeconds ?? line.startSeconds) - line.startSeconds),
      )[0];

    const naturalEnd = rich?.endSeconds
      ?? next?.startSeconds
      ?? (trackDuration && trackDuration > line.startSeconds ? trackDuration : line.startSeconds + 6);
    const endSeconds = Math.max(line.startSeconds + 1.2, naturalEnd);

    return {
      text: line.text,
      startSeconds: rich?.startSeconds ?? line.startSeconds,
      endSeconds,
      ...(rich?.words.length ? { words: rich.words } : {}),
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

export function pickDeckArtist(
  artists: FollowedArtist[],
  dateKey: string,
  cardIndex: number,
): FollowedArtist | undefined {
  if (!artists.length) return undefined;
  return artists[stableHash('artist:' + dateKey + ':card:' + cardIndex) % artists.length];
}

function previewWindow(trackDuration?: number): { start: number; end: number } | undefined {
  if (!trackDuration || trackDuration <= 0) return undefined;
  const start = trackDuration > 60
    ? 30
    : trackDuration > 30
      ? Math.max(0, trackDuration - 30)
      : 0;
  return {
    start,
    end: Math.min(trackDuration, start + 30),
  };
}

function focusableTimedLines(lines: SyncedLine[], trackDuration?: number): SyncedLine[] {
  const window = previewWindow(trackDuration);
  if (!window) return lines;

  const withContext = lines.filter((line) =>
    line.startSeconds >= window.start + 4
    && line.endSeconds <= window.end - 4,
  );
  if (withContext.length) return withContext;

  return lines.filter((line) =>
    line.startSeconds >= window.start
    && line.endSeconds <= window.end,
  );
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

export async function fetchDailyLyric(
  artist: FollowedArtist,
  dateKey: string,
  selectionSeed = dateKey,
): Promise<DailyLyricLesson> {
  const tracks = await searchArtistTracks(artist);
  if (!tracks.length) throw new Error('目前找不到 ' + artist.name + ' 的可用歌詞。');

  const prepared = tracks
    .map((track) => {
      const timed = track.syncedLyrics
        ? syncedLines(track.syncedLyrics, track.duration, track.lyricsfile)
        : [];
      return {
        track,
        timed,
        focusedTimed: focusableTimedLines(timed, track.duration),
        plain: track.plainLyrics ? lyricLines(track.plainLyrics) : [],
      };
    })
    .filter(({ timed, plain }) => timed.length > 0 || plain.length > 0);

  if (!prepared.length) {
    throw new Error('目前找到的歌曲沒有適合學習的日文歌詞，請再試一次或加入其他歌手。');
  }

  const previewSynchronized = prepared.filter(({ focusedTimed }) => focusedTimed.length > 0);
  const synchronized = prepared.filter(({ timed }) => timed.length > 0);
  const pool = previewSynchronized.length
    ? previewSynchronized
    : synchronized.length
      ? synchronized
      : prepared;
  const selected = pool[stableHash('track:' + selectionSeed + ':' + artist.id) % pool.length];
  if (!selected) throw new Error('目前找不到適合學習的日文歌詞。');

  const { track, timed, focusedTimed, plain } = selected;
  const timedPool = focusedTimed.length ? focusedTimed : timed;
  const timedLine = timedPool.length
    ? timedPool[stableHash('line:' + selectionSeed + ':' + track.id) % timedPool.length]
    : undefined;
  const lineJa = timedLine?.text
    ?? plain[stableHash('line:' + selectionSeed + ':' + track.id) % plain.length];

  if (!lineJa) throw new Error('目前找不到適合學習的日文歌詞。');
  const lineZhTw = await translateToTraditionalChinese(lineJa);

  return {
    id: dateKey + ':' + track.id + ':' + stableHash(lineJa).toString(36),
    dateKey,
    artistId: artist.id,
    artistName: track.artistName || artist.name,
    trackId: track.id,
    trackName: track.trackName,
    ...(track.albumName ? { albumName: track.albumName } : {}),
    ...(track.duration ? { trackDurationSeconds: track.duration } : {}),
    lineJa,
    lineZhTw,
    timingResolved: true,
    timingVersion: 2,
    ...(timedLine ? {
      lineStartSeconds: timedLine.startSeconds,
      lineEndSeconds: timedLine.endSeconds,
      ...(timedLine.words?.length ? { words: timedLine.words } : {}),
    } : {}),
    fetchedAt: new Date().toISOString(),
    source: 'lrclib+mymemory',
  };
}
