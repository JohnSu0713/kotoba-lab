export interface FollowedArtist {
  id: string;
  name: string;
  addedAt: string;
}

export interface DailyLyricLesson {
  id: string;
  dateKey: string;
  artistId: string;
  artistName: string;
  trackId: number;
  trackName: string;
  albumName?: string;
  lineJa: string;
  lineZhTw: string;
  fetchedAt: string;
  source: 'lrclib+mymemory';
}

export interface LyricsState {
  schemaVersion: 1;
  artists: FollowedArtist[];
  favoriteLessonIds: string[];
  cachedLessons: Record<string, DailyLyricLesson>;
}
