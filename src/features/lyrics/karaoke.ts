import type { LyricWordTiming } from './models.js';

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
