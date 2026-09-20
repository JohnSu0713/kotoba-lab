import type { LyricWordTiming } from './models.js';

const PUNCTUATION = /^[\s、。！？!?…‥・,.;:：；「」『』（）()［］【】]+$/u;
const LIGHT_KANA = /^[ぁぃぅぇぉゃゅょっゎァィゥェォャュョッヮー]+$/u;

function lyricUnits(line: string): string[] {
  const units: string[] = [];
  for (const char of Array.from(line)) {
    if (PUNCTUATION.test(char) && units.length) {
      units[units.length - 1] += char;
    } else {
      units.push(char);
    }
  }
  return units.filter((unit) => unit.trim().length > 0);
}

function timingWeight(unit: string): number {
  const core = unit.replace(/[\s、。！？!?…‥・,.;:：；「」『』（）()［］【】]/gu, '');
  if (!core) return 0.15;
  return LIGHT_KANA.test(core) ? 0.62 : 1;
}

export function approximateKaraokeTimings(
  line: string,
  startSeconds: number,
  endSeconds: number,
): LyricWordTiming[] {
  const units = lyricUnits(line);
  if (!units.length || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return [];

  const start = Math.max(0, startSeconds);
  const end = Math.max(start + 0.24, endSeconds);
  const weights = units.map(timingWeight);
  const totalWeight = Math.max(0.01, weights.reduce((sum, weight) => sum + weight, 0));

  let cursor = start;
  let consumedWeight = 0;
  return units.map((text, index) => {
    const unitStart = cursor;
    consumedWeight += weights[index] ?? 1;
    const unitEnd = index === units.length - 1
      ? end
      : start + ((end - start) * consumedWeight) / totalWeight;
    cursor = Math.max(unitStart + 0.025, unitEnd);
    return {
      text,
      startSeconds: unitStart,
      endSeconds: Math.min(end, cursor),
    };
  });
}

export function normalizeKaraokeTimings(
  words: LyricWordTiming[] | undefined,
  lineStartSeconds: number,
  lineEndSeconds: number,
): LyricWordTiming[] | undefined {
  if (!words?.length) return undefined;

  let previousEnd = lineStartSeconds;
  const normalized: LyricWordTiming[] = [];
  for (const word of words) {
    if (
      !word.text
      || !Number.isFinite(word.startSeconds)
      || !Number.isFinite(word.endSeconds)
      || word.endSeconds <= word.startSeconds
    ) {
      return undefined;
    }

    const start = Math.max(lineStartSeconds, word.startSeconds, previousEnd - 0.04);
    const end = Math.min(lineEndSeconds, Math.max(start + 0.025, word.endSeconds));
    if (end <= start) return undefined;

    normalized.push({ text: word.text, startSeconds: start, endSeconds: end });
    previousEnd = end;
  }

  return normalized;
}
