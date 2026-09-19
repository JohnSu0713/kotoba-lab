export type Script = "hiragana" | "katakana";
export type KanaGroup = "gojuon" | "dakuten" | "handakuten" | "yoon";
export type JlptLevel = "N5" | "N4" | "N3" | "N2" | "N1";

export interface KanaItem {
  id: string;
  kind: "kana";
  script: Script;
  kana: string;
  romaji: string;
  group: KanaGroup;
  row: string;
  pairId: string;
  order: number;
}

export interface VocabularyExample {
  ja: string;
  romaji?: string;
  zhTw?: string;
  en?: string;
  source?: "tatoeba" | "project";
  sourceId?: string;
}

export interface VocabularyItem {
  id: string;
  kind: "vocabulary";
  expression: string;
  reading: string;
  meaningsZhTw: string[];
  jlpt: JlptLevel;
  tags: string[];
  examples: VocabularyExample[];
  order: number;
  partsOfSpeech?: string[];
  fields?: string[];
  common?: boolean;
  frequencyRank?: number | null;
  sourceEntryId?: string;
  jlptConfidence?: "community-estimate" | "project";
}

export type ContentItem = KanaItem | VocabularyItem;
export type Rating = "again" | "hard" | "good" | "easy";
export interface ReviewRecord {
  key: string;
  itemId: string;
  modeId: string;
  dueAt: string;
  lastReviewAt?: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
}
export interface LearningActivity {
  id: string;
  at: string;
  itemId: string;
  modeId: string;
  correct: boolean;
  isNew: boolean;
}
export interface Notebook {
  savedIds: string[];
  dailyGoal: number;
  level: JlptLevel;
}
export interface AppSettings {
  dailyNew: number;
  sessionSize: number;
  speakAnswers: boolean;
  enabledKanaGroups: KanaGroup[];
}
export interface BackupSnapshot {
  schemaVersion: 1;
  exportedAt: string;
  reviews: ReviewRecord[];
  settings: AppSettings;
  activities?: LearningActivity[];
  notebook?: Notebook;
}
