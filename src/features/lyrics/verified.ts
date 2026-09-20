import type { DailyLyricLesson, FollowedArtist, LyricWordTiming } from './models.js';
import { approximateKaraokeTimings, normalizeKaraokeTimings } from './karaoke.js';

interface VerifiedCatalogEntry {
  id: string;
  artistName: string;
  artistAliases: string[];
  trackName: string;
  albumName?: string;
  lrclibTrackId: number;
  appleTrackId: number;
  storefront: string;
  trackDurationSeconds: number;
  lineJa: string;
  previewLineStartSeconds: number;
  previewLineEndSeconds: number;
  verificationScore: number;
  verificationCommonChars: number;
  words?: LyricWordTiming[];
}

interface VerifiedCatalog {
  schemaVersion: 1;
  generatedAt: string;
  verifier: string;
  storefront: string;
  entries: VerifiedCatalogEntry[];
}

export interface VerifiedArtistCoverage {
  artistId: string;
  artistName: string;
  count: number;
}

interface SupportedArtist {
  artist: FollowedArtist;
  entries: VerifiedCatalogEntry[];
}

let catalogPromise: Promise<VerifiedCatalog> | undefined;

function normalize(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\s・･._\-—–:|/\\()[\]{}【】「」『』"'’‘“”!！?？,，。]+/g, '');
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const char of value) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function matchesArtist(entry: VerifiedCatalogEntry, artist: FollowedArtist): boolean {
  const wanted = normalize(artist.name);
  return [entry.artistName, ...entry.artistAliases]
    .map(normalize)
    .some((candidate) =>
      candidate === wanted
      || (candidate.length >= 4 && candidate.includes(wanted))
      || (wanted.length >= 4 && wanted.includes(candidate)),
    );
}

async function loadCatalog(): Promise<VerifiedCatalog> {
  if (!catalogPromise) {
    catalogPromise = fetch('./data/verified-lyrics.json', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error('Verified lyric catalog unavailable.');
        const value = await response.json() as VerifiedCatalog;
        if (value.schemaVersion !== 1 || !Array.isArray(value.entries)) {
          throw new Error('Verified lyric catalog is invalid.');
        }
        return value;
      });
  }
  return await catalogPromise;
}

function entriesForArtist(
  catalog: VerifiedCatalog,
  artist: FollowedArtist,
): VerifiedCatalogEntry[] {
  return catalog.entries.filter((entry) => matchesArtist(entry, artist));
}

function sortedForCycle(
  entries: VerifiedCatalogEntry[],
  seed: string,
  cycle: number,
): VerifiedCatalogEntry[] {
  return [...entries].sort((a, b) => {
    const ha = stableHash(seed + ':cycle:' + cycle + ':' + a.id);
    const hb = stableHash(seed + ':cycle:' + cycle + ':' + b.id);
    if (ha !== hb) return ha - hb;
    return a.id.localeCompare(b.id);
  });
}

function entryForVisit(
  entries: VerifiedCatalogEntry[],
  dateKey: string,
  artistId: string,
  visitIndex: number,
): VerifiedCatalogEntry | undefined {
  if (!entries.length) return undefined;
  const cycle = Math.floor(visitIndex / entries.length);
  const position = visitIndex % entries.length;
  const seed = dateKey + ':artist:' + artistId;
  const ordered = sortedForCycle(entries, seed, cycle);

  // Avoid repeating the exact same card at an artist-pool cycle boundary.
  if (cycle > 0 && ordered.length > 1 && position === 0) {
    const previous = sortedForCycle(entries, seed, cycle - 1);
    if (previous.at(-1)?.id === ordered[0]?.id) {
      ordered.push(ordered.shift()!);
    }
  }
  return ordered[position];
}

function supportedArtists(
  catalog: VerifiedCatalog,
  artists: FollowedArtist[],
): SupportedArtist[] {
  return artists
    .map((artist) => ({ artist, entries: entriesForArtist(catalog, artist) }))
    .filter((item) => item.entries.length > 0);
}

function orderedArtistCycle(
  supported: SupportedArtist[],
  dateKey: string,
  cycle: number,
): SupportedArtist[] {
  return [...supported].sort((a, b) => {
    const ha = stableHash(dateKey + ':artist-cycle:' + cycle + ':' + a.artist.id);
    const hb = stableHash(dateKey + ':artist-cycle:' + cycle + ':' + b.artist.id);
    if (ha !== hb) return ha - hb;
    return a.artist.id.localeCompare(b.artist.id);
  });
}

export async function verifiedArtistCoverage(
  artists: FollowedArtist[],
): Promise<VerifiedArtistCoverage[]> {
  const catalog = await loadCatalog();
  return artists.map((artist) => ({
    artistId: artist.id,
    artistName: artist.name,
    count: entriesForArtist(catalog, artist).length,
  }));
}

export async function verifiedDeckLesson(
  artists: FollowedArtist[],
  dateKey: string,
  cardIndex: number,
): Promise<DailyLyricLesson> {
  const catalog = await loadCatalog();
  const supported = supportedArtists(catalog, artists);

  if (!supported.length) {
    throw new Error('目前追蹤的歌手還沒有通過實際原曲音訊驗證的歌詞卡。');
  }

  const safeIndex = Math.max(0, Math.floor(cardIndex));

  // Artist-first scheduling: every supported followed artist gets one turn
  // before any artist gets a second. This keeps a six-card artist from
  // overwhelming a two-card artist and makes newly added artists visible fast.
  const artistCycle = Math.floor(safeIndex / supported.length);
  const artistPosition = safeIndex % supported.length;
  const artistOrder = orderedArtistCycle(supported, dateKey, artistCycle);
  const selected = artistOrder[artistPosition];
  if (!selected) throw new Error('Verified lyric artist unavailable.');

  const visitIndex = artistCycle;
  const entry = entryForVisit(
    selected.entries,
    dateKey,
    selected.artist.id,
    visitIndex,
  );
  if (!entry) throw new Error('Verified lyric card unavailable.');

  const preciseWords = normalizeKaraokeTimings(
    entry.words,
    entry.previewLineStartSeconds,
    entry.previewLineEndSeconds,
  );
  const words = preciseWords ?? approximateKaraokeTimings(
    entry.lineJa,
    entry.previewLineStartSeconds,
    entry.previewLineEndSeconds,
  );

  return {
    id: dateKey + ':' + entry.id,
    dateKey,
    artistId: selected.artist.id,
    artistName: entry.artistName,
    trackId: entry.lrclibTrackId,
    appleTrackId: entry.appleTrackId,
    trackName: entry.trackName,
    ...(entry.albumName ? { albumName: entry.albumName } : {}),
    trackDurationSeconds: entry.trackDurationSeconds,
    lineJa: entry.lineJa,
    lineZhTw: '',
    timingResolved: true,
    timingVersion: 6,
    lineStartSeconds: entry.previewLineStartSeconds,
    lineEndSeconds: entry.previewLineEndSeconds,
    ...(words.length ? { words } : {}),
    fetchedAt: new Date().toISOString(),
    source: 'verified-preview',
  };
}

export async function verifiedCatalogCountForArtists(
  artists: FollowedArtist[],
): Promise<number> {
  const coverage = await verifiedArtistCoverage(artists);
  return coverage.reduce((total, item) => total + item.count, 0);
}
