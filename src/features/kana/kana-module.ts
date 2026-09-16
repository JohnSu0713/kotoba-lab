import type { ContentRegistry } from '../../core/registry/content-registry.js';
import type { StudyModeRegistry } from '../../core/registry/study-mode-registry.js';
import { kanaPack } from './data.js';
import { kanaRecognitionMode } from './modes/recognition.js';
import { kanaRecallMode } from './modes/recall.js';
import { kanaAudioChoiceMode } from './modes/audio-choice.js';
import { kanaScriptPairMode } from './modes/script-pair.js';
export function registerKanaModule(content: ContentRegistry,modes: StudyModeRegistry): void { content.register(kanaPack); modes.register(kanaRecognitionMode); modes.register(kanaRecallMode); modes.register(kanaAudioChoiceMode); modes.register(kanaScriptPairMode); }
