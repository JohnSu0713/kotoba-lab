import type { DailyLyricLesson, FollowedArtist } from './models.js';

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
}

interface VerifiedCatalog {
  schemaVersion: 1;
  generatedAt: string;
  verifier: string;
  storefront: string;
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
    .some((candidate) => candidate === wanted || candidate.includes(wanted) || wanted.includes(candidate));
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

export async function verifiedDeckLesson(
  artists: FollowedArtist[],
  dateKey: string,
  cardIndex: number,
): Promise<DailyLyricLesson> {
  const catalog = await loadCatalog();
  const followed = catalog.entries.filter((entry) =>
    artists.some((artist) => matchesArtist(entry, artist)),
  );

  if (!followed.length) {
    throw new Error('目前追蹤的歌手還沒有通過實際原曲音訊驗證的歌詞卡。');
  }

  const ordered = [...followed].sort((a, b) => {
    const ha = stableHash(dateKey + ':' + a.id);
    const hb = stableHash(dateKey + ':' + b.id);
    if (ha !== hb) return ha - hb;
    return a.id.localeCompare(b.id);
  });
  const entry = ordered[((cardIndex % ordered.length) + ordered.length) % ordered.length];
  if (!entry) throw new Error('Verified lyric card unavailable.');

  const artist = artists.find((candidate) => matchesArtist(entry, candidate)) ?? artists[0];
  if (!artist) throw new Error('No followed artist available.');

  return {
    id: dateKey + ':' + entry.id,
    dateKey,
    artistId: artist.id,
    artistName: entry.artistName,
    trackId: entry.lrclibTrackId,
    appleTrackId: entry.appleTrackId,
    trackName: entry.trackName,
    ...(entry.albumName ? { albumName: entry.albumName } : {}),
    trackDurationSeconds: entry.trackDurationSeconds,
    lineJa: entry.lineJa,
    lineZhTw: '',
    timingResolved: true,
    timingVersion: 5,
    lineStartSeconds: entry.previewLineStartSeconds,
    lineEndSeconds: entry.previewLineEndSeconds,
    fetchedAt: new Date().toISOString(),
    source: 'verified-preview',
  };
}

export async function verifiedCatalogCountForArtists(
  artists: FollowedArtist[],
): Promise<number> {
  const catalog = await loadCatalog();
  return catalog.entries.filter((entry) =>
    artists.some((artist) => matchesArtist(entry, artist)),
  ).length;
}
