import type { StudyMode } from '../contracts/study-mode.js';

export class StudyModeRegistry {
  private readonly modes = new Map<string, StudyMode>();

  register(mode: StudyMode): void {
    if (this.modes.has(mode.id)) throw new Error(`Study mode already registered: ${mode.id}`);
    this.modes.set(mode.id, mode);
  }

  get(id: string): StudyMode {
    const mode = this.modes.get(id);
    if (!mode) throw new Error(`Unknown study mode: ${id}`);
    return mode;
  }

  list(): StudyMode[] {
    return [...this.modes.values()];
  }
}
