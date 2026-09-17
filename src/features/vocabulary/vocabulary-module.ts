import type { ContentRegistry } from '../../core/registry/content-registry.js';
import type { StudyModeRegistry } from '../../core/registry/study-mode-registry.js';
import { registerVocabularyCorpus } from './corpus.js';
import { vocabFlashcardMode } from './modes/flashcard.js';
import { vocabMeaningChoiceMode } from './modes/meaning-choice.js';
import { vocabReadingChoiceMode } from './modes/reading-choice.js';
import { vocabAudioMeaningMode } from './modes/audio-meaning.js';

export async function registerVocabularyModule(content: ContentRegistry, modes: StudyModeRegistry): Promise<void> {
  modes.register(vocabFlashcardMode);
  modes.register(vocabMeaningChoiceMode);
  modes.register(vocabReadingChoiceMode);
  modes.register(vocabAudioMeaningMode);
  await registerVocabularyCorpus(content);
}
