import type { DailyLyricLesson, FollowedArtist, LyricsState } from './models.js';

const STORAGE_KEY = 'kotoba-lab:lyrics:v1';

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

  cacheLesson(key: string, lesson: DailyLyricLesson): void {
    const state = read();
    state.cachedLessons[key] = lesson;
    state.cachedLessons = Object.fromEntries(
      Object.entries(state.cachedLessons)
        .sort(([, a], [, b]) => b.fetchedAt.localeCompare(a.fetchedAt))
        .slice(0, 120),
    );
    write(state);
  }

  toggleFavorite(lessonId: string): boolean {
    const state = read();
    const selected = state.favoriteLessonIds.includes(lessonId);
    state.favoriteLessonIds = selected
      ? state.favoriteLessonIds.filter((id) => id !== lessonId)
      : [...state.favoriteLessonIds, lessonId];
    write(state);
    return !selected;
  }

  isFavorite(lessonId: string): boolean {
    return read().favoriteLessonIds.includes(lessonId);
  }
}

export const lyricsStore = new LyricsStore();
