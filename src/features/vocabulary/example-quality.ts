import type { VocabularyExample, VocabularyItem } from '../../domain/models.js';

function normalized(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\s、。！？!?「」『』（）()［］【】,.，．]/gu, '')
    .toLowerCase();
}

function scoreExample(item: VocabularyItem, example: VocabularyExample): number {
  const ja = example.ja.trim();
  const length = Array.from(ja).length;
  let score = 0;

  if (example.source === 'project') score += 60;
  if (example.zhTw) score += 28;

  const surface = normalized(item.expression);
  const reading = normalized(item.reading);
  const sentence = normalized(ja);
  const kana = normalized(example.kana ?? '');

  if (surface && sentence.includes(surface)) score += 18;
  else if (reading && (sentence.includes(reading) || kana.includes(reading))) score += 12;

  if (length >= 5 && length <= 22) score += 18;
  else if (length <= 32) score += 12;
  else if (length <= 45) score += 5;
  else if (length > 65) score -= 16;

  const punctuation = (ja.match(/[、，,。！？!?]/gu) ?? []).length;
  if (punctuation <= 2) score += 4;
  else if (punctuation >= 5) score -= 6;

  if (/「|」|『|』/.test(ja)) score -= 3;
  if (/\d{3,}/.test(ja)) score -= 2;

  return score;
}

export function bestVocabularyExample(
  item: VocabularyItem,
): VocabularyExample | undefined {
  return item.examples
    .map((example, index) => ({
      example,
      index,
      score: scoreExample(item, example),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index)[0]?.example;
}
