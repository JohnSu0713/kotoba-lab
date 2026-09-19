import type { DailyLyricLesson, FollowedArtist, LyricsState } from './models.js';

const STORAGE_KEY = 'kotoba-lab:lyrics:v1';
const RECENT_LESSON_LIMIT = 120;

function initialState(): LyricsState {
  return { schemaVersion: 1, artists: [], favoriteLessonIds: [], cachedLessons: {} };
}

function stableId(value: string): string {
  let hash = 2166136261;
  for (const char of value.normalize('NFKC').toLocaleLowerCase()) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619);
  }
  return 'artist-' + (hash >>> 0).toString(36);
}

function read(): LyricsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState();
    const parsed = JSON.parse(raw) as Partial<LyricsState>;
    if (parsed.schemaVersion !== 1 || !Array.isArray(parsed.artists)) return initialState();
    return {
      schemaVersion: 1,
      artists: parsed.artists,
      favoriteLessonIds: Array.isArray(parsed.favoriteLessonIds) ? parsed.favoriteLessonIds : [],
      cachedLessons: parsed.cachedLessons ?? {},
    };
  } catch {
    return initialState();
  }
}

function write(state: LyricsState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function trimLessonCache(state: LyricsState): void {
  const favoriteIds = new Set(state.favoriteLessonIds);
  const entries = Object.entries(state.cachedLessons)
    .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt));

  // Saved lyric cards are learning material, not disposable cache. Keep every
  // favorite available for later review while bounding only the recent,
  // non-favorite browsing history.
  const favorites = entries.filter(([, lesson]) => favoriteIds.has(lesson.id));
  const recent = entries
    .filter(([, lesson]) => !favoriteIds.has(lesson.id))
    .slice(0, RECENT_LESSON_LIMIT);

  state.cachedLessons = Object.fromEntries([...favorites, ...recent]);
}

export class LyricsStore {
  getState(): LyricsState {
    return read();
  }

  followArtist(name: string): FollowedArtist {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) throw new Error('Artist name is required');
    const state = read();
    const id = stableId(clean);
    const existing = state.artists.find((artist) => artist.id === id);
    if (existing) return existing;

    const artist: FollowedArtist = { id, name: clean, addedAt: new Date().toISOString() };
    state.artists.push(artist);
    write(state);
    return artist;
  }

  removeArtist(id: string): void {
    const state = read();
    state.artists = state.artists.filter((artist) => artist.id !== id);
    write(state);
  }

  cachedLesson(key: string): DailyLyricLesson | undefined {
    return read().cachedLessons[key];
  }

  cachedLessonById(lessonId: string): DailyLyricLesson | undefined {
    return Object.values(read().cachedLessons)
      .find((lesson) => lesson.id === lessonId);
  }

  favoriteLessons(): DailyLyricLesson[] {
    const state = read();
    const order = new Map(state.favoriteLessonIds.map((id, index) => [id, index]));
    return Object.values(state.cachedLessons)
      .filter((lesson) => order.has(lesson.id))
      .sort((a, b) => (order.get(b.id) ?? 0) - (order.get(a.id) ?? 0));
  }

  cacheLesson(key: string, lesson: DailyLyricLesson): void {
    const state = read();
    state.cachedLessons[key] = lesson;
    trimLessonCache(state);
    write(state);
  }

  toggleFavorite(lessonId: string): boolean {
    const state = read();
    const selected = state.favoriteLessonIds.includes(lessonId);
    state.favoriteLessonIds = selected
      ? state.favoriteLessonIds.filter((id) => id !== lessonId)
      : [...state.favoriteLessonIds, lessonId];
    trimLessonCache(state);
    write(state);
    return !selected;
  }

  isFavorite(lessonId: string): boolean {
    return read().favoriteLessonIds.includes(lessonId);
  }
}

export const lyricsStore = new LyricsStore();
