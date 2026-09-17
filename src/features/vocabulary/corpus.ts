import type { ContentPack } from '../../core/contracts/content.js';
import type { ContentRegistry } from '../../core/registry/content-registry.js';
import type { JlptLevel, VocabularyItem } from '../../domain/models.js';
import { sampleN5Pack } from './data.js';

const LEVELS: JlptLevel[] = ['N5', 'N4', 'N3', 'N2', 'N1'];

type CorpusPack = Omit<ContentPack, 'items'> & { items: VocabularyItem[] };

function packUrl(level: JlptLevel): string {
  return `./data/vocab/${level.toLowerCase()}.json`;
}

async function fetchPack(level: JlptLevel): Promise<CorpusPack> {
  const response = await fetch(packUrl(level), { cache: 'no-cache' });
  if (!response.ok) throw new Error(`Failed to load ${level} vocabulary (${response.status})`);
  const pack = await response.json() as CorpusPack;
  if (!Array.isArray(pack.items) || pack.items.length === 0) throw new Error(`${level} vocabulary pack is empty`);
  return pack;
}

export async function registerVocabularyCorpus(content: ContentRegistry): Promise<void> {
  const results = await Promise.allSettled(LEVELS.map(fetchPack));
  let n5Loaded = false;

  results.forEach((result, index) => {
    const level = LEVELS[index];
    if (!level || result.status !== 'fulfilled') {
      if (result.status === 'rejected') console.warn(`Vocabulary corpus ${level ?? 'unknown'} unavailable`, result.reason);
      return;
    }
    content.register(result.value);
    if (level === 'N5') n5Loaded = true;
  });

  // Keep the app usable on a first offline launch or if the external corpus ever
  // fails to deploy. The production corpus always wins when available.
  if (!n5Loaded) content.register(sampleN5Pack);
}
