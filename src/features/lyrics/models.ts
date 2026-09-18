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
  timingResolved?: boolean;
  lineStartSeconds?: number;
  lineEndSeconds?: number;
  fetchedAt: string;
  source: 'lrclib+mymemory';
}

export interface OriginalClipSource {
  provider: 'apple-preview' | 'deezer-preview';
  previewUrl: string;
  title: string;
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  previewSeconds: number;
}

export interface LyricsState {
  schemaVersion: 1;
  artists: FollowedArtist[];
  favoriteLessonIds: string[];
  cachedLessons: Record<string, DailyLyricLesson>;
}
