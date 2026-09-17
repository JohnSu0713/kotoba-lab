function japaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const japanese = voices.filter((voice) => voice.lang.toLowerCase().startsWith('ja'));
  return japanese.find((voice) => voice.lang.toLowerCase() === 'ja-jp') ?? japanese[0];
}

export function canSpeakJapanese(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function speakJapanese(text: string): void {
  if (!canSpeakJapanese() || !text.trim()) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.82;
  utterance.pitch = 1;

  const voice = japaneseVoice(synth.getVoices());
  if (voice) utterance.voice = voice;

  synth.speak(utterance);
}

// Safari/iOS can populate voices asynchronously. Touching getVoices here makes the
// first user-triggered pronunciation more reliable without adding a network dependency.
if (canSpeakJapanese()) {
  window.speechSynthesis.getVoices();
}
