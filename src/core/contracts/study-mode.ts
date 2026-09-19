import type { ContentItem, Rating } from '../../domain/models.js';

export interface ChoiceQuestion {
  type: 'choice';
  prompt: string;
  subtitle?: string;
  choices: Array<{ label: string; value: string }>;
  correctValue: string;
  speakText?: string;
}

export interface TextQuestion {
  type: 'text';
  prompt: string;
  subtitle?: string;
  placeholder: string;
  acceptedAnswers: string[];
  speakText?: string;
}

export interface FlashcardExample {
  ja: string;
  kana?: string;
  translation?: string;
  translationLabel?: string;
  sourceLabel?: string;
}

export interface FlashcardQuestion {
  type: 'flashcard';
  front: string;
  frontSub?: string;
  back: string;
  backSub?: string;
  speakText?: string;
  badge?: string;
  chips?: string[];
  details?: Array<{ label: string; value: string }>;
  example?: FlashcardExample;
  sourceNote?: string;
}

export type StudyQuestion = ChoiceQuestion | TextQuestion | FlashcardQuestion;

export interface QuestionContext {
  allItems: ContentItem[];
  random: () => number;
}

export interface GradeResult {
  correct: boolean;
  rating: Rating;
}

export interface StudyMode {
  id: string;
  title: string;
  description: string;
  supports(item: ContentItem): boolean;
  createQuestion(item: ContentItem, context: QuestionContext): StudyQuestion;
  grade(question: StudyQuestion, answer: string): GradeResult;
}
