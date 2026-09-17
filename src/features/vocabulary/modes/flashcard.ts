import type { FlashcardQuestion, StudyMode } from '../../../core/contracts/study-mode.js';
import type { VocabularyExample } from '../../../domain/models.js';

function posLabel(raw: string): string {
  const value = raw.toLowerCase();
  if (value.includes('ichidan')) return '一段動詞';
  if (value.includes('godan')) return '五段動詞';
  if (value.includes('suru')) return 'する動詞';
  if (value.includes('kuru')) return 'くる動詞';
  if (value.includes('transitive')) return '他動詞';
  if (value.includes('intransitive')) return '自動詞';
  if (value.includes('adjectival nouns') || value.includes('na-adjective') || value.includes('keiyodoshi')) return 'な形容詞';
  if (value.includes('adjective') || value.includes('keiyoushi')) return 'い形容詞';
  if (value.includes('adverb')) return '副詞';
  if (value.includes('pronoun')) return '代名詞';
  if (value.includes('particle')) return '助詞';
  if (value.includes('conjunction')) return '接續詞';
  if (value.includes('interjection')) return '感動詞';
  if (value.includes('auxiliary')) return '助動詞';
  if (value.includes('counter')) return '助數詞';
  if (value.includes('prefix')) return '接頭詞';
  if (value.includes('suffix')) return '接尾詞';
  if (value.includes('expression')) return '慣用表現';
  if (value.includes('noun')) return '名詞';
  return raw.length > 22 ? `${raw.slice(0, 21)}…` : raw;
}

function exampleFor(example: VocabularyExample | undefined): FlashcardQuestion['example'] | undefined {
  if (!example) return undefined;
  const translation = example.zhTw ?? example.en;
  return {
    ja: example.ja,
    ...(translation ? { translation } : {}),
    ...(example.zhTw ? { translationLabel: '繁中' } : example.en ? { translationLabel: 'EN' } : {}),
    ...(example.source === 'tatoeba' ? { sourceLabel: example.sourceId ? `Tatoeba #${example.sourceId}` : 'Tatoeba' } : {}),
  };
}

export const vocabFlashcardMode: StudyMode = {
  id: 'vocab-flashcard',
  title: '單字卡',
  description: '先看日文主動回想，再翻卡確認意思、詞性與例句。',
  supports: (item) => item.kind === 'vocabulary',
  createQuestion(item) {
    if (item.kind !== 'vocabulary') throw new Error('Vocabulary mode received non-vocabulary item');
    const pos = [...new Set((item.partsOfSpeech ?? []).map(posLabel))].slice(0, 4);
    const details: Array<{ label: string; value: string }> = [];
    if (pos.length > 0) details.push({ label: '詞性', value: pos.join(' · ') });
    if (item.frequencyRank) details.push({ label: '常用度', value: `JMdict priority #${item.frequencyRank.toLocaleString()}` });
    if (item.common) details.push({ label: '標記', value: '常用詞' });

    const question: FlashcardQuestion = {
      type: 'flashcard',
      front: item.expression,
      frontSub: item.reading,
      back: item.meaningsZhTw.slice(0, 4).join('；'),
      speakText: item.reading,
      badge: item.jlpt,
      chips: pos,
      details,
      sourceNote: 'JMdict / Tomoshi · JLPT 分級為社群估計',
    };
    const example = exampleFor(item.examples[0]);
    if (example) question.example = example;
    return question;
  },
  grade() {
    return { correct: true, rating: 'good' };
  },
};
