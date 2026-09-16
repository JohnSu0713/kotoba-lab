import type { ContentRegistry } from '../../core/registry/content-registry.js';
import type { StudyModeRegistry } from '../../core/registry/study-mode-registry.js';
import { sampleN5Pack } from './data.js';
import { vocabFlashcardMode } from './modes/flashcard.js';
import { vocabMeaningChoiceMode } from './modes/meaning-choice.js';
import { vocabReadingChoiceMode } from './modes/reading-choice.js';
import { vocabAudioMeaningMode } from './modes/audio-meaning.js';
export function registerVocabularyModule(content:ContentRegistry,modes:StudyModeRegistry):void{content.register(sampleN5Pack);modes.register(vocabFlashcardMode);modes.register(vocabMeaningChoiceMode);modes.register(vocabReadingChoiceMode);modes.register(vocabAudioMeaningMode);}
