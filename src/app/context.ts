import type { AppRepository } from '../core/contracts/repository.js';
import type { Scheduler } from '../core/contracts/scheduler.js';
import type { ContentRegistry } from '../core/registry/content-registry.js';
import type { StudyModeRegistry } from '../core/registry/study-mode-registry.js';
import type { SessionEngine } from '../features/study/session-engine.js';

export interface AppContext {
  content: ContentRegistry;
  modes: StudyModeRegistry;
  repository: AppRepository;
  scheduler: Scheduler;
  sessions: SessionEngine;
}
