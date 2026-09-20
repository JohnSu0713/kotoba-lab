import type { JlptLevel, VocabularyItem } from '../../domain/models.js';
import { assignVocabularyToThemes, THEMES_BY_LEVEL } from './themes.js';

export const CURRICULUM_VERSION = 2;
export const PATH_UNIT_COUNT = 100;
export const LESSONS_PER_UNIT = 10;
export const TOTAL_VOCABULARY_TARGET = 7777;
export const TOTAL_PATTERN_TARGET = 600;

export interface PathStageDefinition {
  level: JlptLevel;
  title: string;
  subtitle: string;
  firstUnit: number;
  unitCount: number;
  vocabularyTarget: number;
  patternTarget: number;
}

export interface PathLessonDefinition {
  id: string;
  order: number;
  vocabularyIds: string[];
  patternTarget: number;
}

export interface PathUnitDefinition {
  id: string;
  order: number;
  level: JlptLevel;
  stageTitle: string;
  stageSubtitle: string;
  topicId: string;
  topicTitle: string;
  topicFocus: string;
  vocabularyIds: string[];
  patternTarget: number;
  lessons: PathLessonDefinition[];
}

export const PATH_STAGES: readonly PathStageDefinition[] = [
  {
    level: 'N5',
    title: 'First Japanese',
    subtitle: '讀懂最基本的日常日文',
    firstUnit: 1,
    unitCount: 9,
    vocabularyTarget: 692,
    patternTarget: 60,
  },
  {
    level: 'N4',
    title: 'Everyday Japanese',
    subtitle: '把基礎變成日常理解與表達',
    firstUnit: 10,
    unitCount: 8,
    vocabularyTarget: 646,
    patternTarget: 80,
  },
  {
    level: 'N3',
    title: 'Connected Japanese',
    subtitle: '開始連續理解句子與短篇內容',
    firstUnit: 18,
    unitCount: 21,
    vocabularyTarget: 1648,
    patternTarget: 120,
  },
  {
    level: 'N2',
    title: 'Real Japanese',
    subtitle: '跟上更自然、更密集的真實日文',
    firstUnit: 39,
    unitCount: 22,
    vocabularyTarget: 1737,
    patternTarget: 150,
  },
  {
    level: 'N1',
    title: 'Precise Japanese',
    subtitle: '精準掌握抽象、書面與細微語感',
    firstUnit: 61,
    unitCount: 40,
    vocabularyTarget: 3054,
    patternTarget: 190,
  },
] as const;

function distribute(total: number, buckets: number): number[] {
  const base = Math.floor(total / buckets);
  const remainder = total % buckets;
  return Array.from({ length: buckets }, (_, index) => base + (index < remainder ? 1 : 0));
}

function sliceBySizes<T>(items: T[], sizes: number[]): T[][] {
  const slices: T[][] = [];
  let cursor = 0;
  for (const size of sizes) {
    slices.push(items.slice(cursor, cursor + size));
    cursor += size;
  }
  return slices;
}

function lessonDefinitions(
  unitId: string,
  vocabularyIds: string[],
  patternTarget: number,
): PathLessonDefinition[] {
  const vocabSlices = sliceBySizes(
    vocabularyIds,
    distribute(vocabularyIds.length, LESSONS_PER_UNIT),
  );
  const patternSlices = distribute(patternTarget, LESSONS_PER_UNIT);

  return Array.from({ length: LESSONS_PER_UNIT }, (_, index) => ({
    id: unitId + '-lesson-' + String(index + 1).padStart(2, '0'),
    order: index + 1,
    vocabularyIds: vocabSlices[index] ?? [],
    patternTarget: patternSlices[index] ?? 0,
  }));
}

export function buildLearningPath(
  vocabulary: VocabularyItem[],
): PathUnitDefinition[] {
  const units: PathUnitDefinition[] = [];

  for (const stage of PATH_STAGES) {
    const levelItems = vocabulary
      .filter((item) => item.jlpt === stage.level)
      .sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));

    const vocabPerUnit = distribute(levelItems.length, stage.unitCount);
    const themes = THEMES_BY_LEVEL[stage.level];
    const vocabSlices = assignVocabularyToThemes(levelItems, themes, vocabPerUnit);
    const patternsPerUnit = distribute(stage.patternTarget, stage.unitCount);

    for (let stageIndex = 0; stageIndex < stage.unitCount; stageIndex += 1) {
      const order = stage.firstUnit + stageIndex;
      const unitId = stage.level.toLocaleLowerCase() + '-unit-' + String(order).padStart(3, '0');
      const ids = (vocabSlices[stageIndex] ?? []).map((item) => item.id);
      const patternTarget = patternsPerUnit[stageIndex] ?? 0;
      const theme = themes[stageIndex];
      if (!theme) throw new Error(`Missing theme for ${stage.level} unit ${order}`);
      units.push({
        id: unitId,
        order,
        level: stage.level,
        stageTitle: stage.title,
        stageSubtitle: stage.subtitle,
        topicId: theme.id,
        topicTitle: theme.title,
        topicFocus: theme.focus,
        vocabularyIds: ids,
        patternTarget,
        lessons: lessonDefinitions(unitId, ids, patternTarget),
      });
    }
  }

  return units.sort((a, b) => a.order - b.order);
}

export function stageForUnit(order: number): PathStageDefinition | undefined {
  return PATH_STAGES.find(
    (stage) => order >= stage.firstUnit && order < stage.firstUnit + stage.unitCount,
  );
}

export function cumulativeVocabularyTarget(level: JlptLevel): number {
  let total = 0;
  for (const stage of PATH_STAGES) {
    total += stage.vocabularyTarget;
    if (stage.level === level) return total;
  }
  return total;
}

export function cumulativePatternTarget(level: JlptLevel): number {
  let total = 0;
  for (const stage of PATH_STAGES) {
    total += stage.patternTarget;
    if (stage.level === level) return total;
  }
  return total;
}
