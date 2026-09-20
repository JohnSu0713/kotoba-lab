export interface FollowedArtist {
  id: string;
  name: string;
  addedAt: string;
}

export interface LyricWordTiming {
  text: string;
  startSeconds: number;
  endSeconds: number;
}

export interface DailyLyricLesson {
  id: string;
  dateKey: string;
  artistId: string;
  artistName: string;
  trackId: number;
  appleTrackId?: number;
  trackName: string;
  albumName?: string;
  trackDurationSeconds?: number;
  lineJa: string;
  lineZhTw: string;
  timingResolved?: boolean;
  timingVersion?: 4 | 5 | 6;
  lineStartSeconds?: number;
  lineEndSeconds?: number;
  words?: LyricWordTiming[];
  fetchedAt: string;
  source: 'lrclib+mymemory' | 'verified-preview';
}

export interface OriginalClipSource {
  provider: 'apple-preview' | 'deezer-preview';
  previewUrl: string;
  title: string;
  artistName: string;
  albumName?: string;
  artworkUrl?: string;
  previewSeconds: number;
  fullTrackStartSeconds?: number;
}

export interface PrecisePlaybackSource {
  provider: 'apple-music';
  songId: string;
  title: string;
  artistName: string;
  storefront: string;
  startSeconds: number;
  endSeconds: number;
}

export interface LyricsState {
  schemaVersion: 1;
  artists: FollowedArtist[];
  favoriteLessonIds: string[];
  cachedLessons: Record<string, DailyLyricLesson>;
}
