import type { ContentItem } from '../../domain/models.js';
export interface ContentPack { id: string; title: string; description: string; version: string; sourceLabel: string; licenseLabel: string; items: ContentItem[]; }
export interface ContentFilter { kind?: ContentItem['kind']; predicate?: (item: ContentItem) => boolean; }
