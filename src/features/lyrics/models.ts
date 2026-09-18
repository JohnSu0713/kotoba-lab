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
  lineStartSeconds?: number;
  lineEndSeconds?: number;
  fetchedAt: string;
  source: 'lrclib+mymemory';
}

export interface OriginalClipSource {
  provider: 'youtube';
  videoId: string;
  title: string;
  channelTitle: string;
  startSeconds: number;
  endSeconds: number;
}

export interface LyricsState {
  schemaVersion: 1;
  artists: FollowedArtist[];
  favoriteLessonIds: string[];
  cachedLessons: Record<string, DailyLyricLesson>;
}
