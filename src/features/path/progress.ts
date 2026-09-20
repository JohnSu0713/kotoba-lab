import type { ReviewRecord } from '../../domain/models.js';
import type { PathLessonDefinition, PathUnitDefinition } from './curriculum.js';

export interface LearningPathSnapshot {
  foundationDone: boolean;
  foundationReviewed: number;
  foundationTotal: number;
  completedUnits: number;
  completedLessons: number;
  currentUnit?: PathUnitDefinition;
  currentLesson?: PathLessonDefinition;
  pathVocabularyLearned: number;
  vocabularyEncountered: number;
  totalVocabulary: number;
  percent: number;
}

function reviewedIds(
  reviews: ReviewRecord[],
  predicate: (review: ReviewRecord) => boolean,
): Set<string> {
  return new Set(
    reviews
      .filter((review) => review.reps > 0 && predicate(review))
      .map((review) => review.itemId),
  );
}

function lessonComplete(
  lesson: PathLessonDefinition,
  pathVocabulary: Set<string>,
): boolean {
  return lesson.vocabularyIds.length === 0
    || lesson.vocabularyIds.every((id) => pathVocabulary.has(id));
}

export function learningPathSnapshot(
  units: PathUnitDefinition[],
  reviews: ReviewRecord[],
  foundationIds: string[],
  foundationSkipped = false,
): LearningPathSnapshot {
  const pathVocabulary = reviewedIds(
    reviews,
    (review) => review.modeId === 'vocab-flashcard',
  );
  const kanaReviewed = reviewedIds(
    reviews,
    (review) => review.modeId === 'kana-recognition',
  );
  const vocabularyUniverse = new Set(units.flatMap((unit) => unit.vocabularyIds));
  const encountered = reviewedIds(
    reviews,
    (review) => vocabularyUniverse.has(review.itemId),
  );

  const foundationReviewed = foundationIds.filter((id) => kanaReviewed.has(id)).length;
  const foundationDone = foundationSkipped
    || (foundationIds.length > 0 && foundationReviewed >= foundationIds.length);

  let completedUnits = 0;
  let completedLessons = 0;
  let currentUnit: PathUnitDefinition | undefined;
  let currentLesson: PathLessonDefinition | undefined;

  for (const unit of units) {
    const incompleteLesson = unit.lessons.find(
      (lesson) => !lessonComplete(lesson, pathVocabulary),
    );
    completedLessons += unit.lessons.filter(
      (lesson) => lessonComplete(lesson, pathVocabulary),
    ).length;

    if (!incompleteLesson) {
      completedUnits += 1;
      continue;
    }
    if (!currentUnit) {
      currentUnit = unit;
      currentLesson = incompleteLesson;
    }
  }

  const totalVocabulary = units.reduce(
    (total, unit) => total + unit.vocabularyIds.length,
    0,
  );
  const pathVocabularyLearned = [...pathVocabulary].filter(
    (id) => vocabularyUniverse.has(id),
  ).length;
  const percent = totalVocabulary
    ? Math.min(100, Math.round((pathVocabularyLearned / totalVocabulary) * 100))
    : 0;

  return {
    foundationDone,
    foundationReviewed,
    foundationTotal: foundationIds.length,
    completedUnits,
    completedLessons,
    currentUnit,
    currentLesson,
    pathVocabularyLearned,
    vocabularyEncountered: encountered.size,
    totalVocabulary,
    percent,
  };
}
