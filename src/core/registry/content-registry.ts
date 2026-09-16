import type { ContentFilter, ContentPack } from '../contracts/content.js';
import type { ContentItem } from '../../domain/models.js';

export class ContentRegistry {
  private readonly packs = new Map<string, ContentPack>();

  register(pack: ContentPack): void {
    if (this.packs.has(pack.id)) {
      throw new Error(`Content pack already registered: ${pack.id}`);
    }
    this.packs.set(pack.id, pack);
  }

  listPacks(): ContentPack[] {
    return [...this.packs.values()];
  }

  getAll(filter: ContentFilter = {}): ContentItem[] {
    let items = [...this.packs.values()].flatMap((pack) => pack.items);
    if (filter.kind) items = items.filter((item) => item.kind === filter.kind);
    if (filter.predicate) items = items.filter(filter.predicate);
    return items.sort((a, b) => a.order - b.order);
  }

  getById(id: string): ContentItem | undefined {
    for (const pack of this.packs.values()) {
      const item = pack.items.find((candidate) => candidate.id === id);
      if (item) return item;
    }
    return undefined;
  }
}
