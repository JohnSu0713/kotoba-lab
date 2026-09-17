const JA_LOCALE = 'ja-JP';

function voiceScore(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;

  if (lang === 'ja-jp') score += 100;
  else if (lang.startsWith('ja')) score += 70;

  // Prefer high-quality system voices when the browser exposes them. Names vary
  // across Apple, Google, and Microsoft platforms, so these are only quality hints.
  if (/(premium|enhanced|natural|neural|siri)/i.test(name)) score += 40;
  if (/(kyoko|otoya|nanami|google.*日本|google.*japanese)/i.test(name)) score += 24;
  if (voice.localService) score += 12;
  if (voice.default) score += 5;
  if (/compact/i.test(name)) score -= 18;

  return score;
}

function bestJapaneseVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  return voices
    .filter((voice) => voice.lang.toLowerCase().startsWith('ja'))
    .sort((a, b) => voiceScore(b) - voiceScore(a))[0];
}

function isShortKana(text: string): boolean {
  return /^[ぁ-ゖァ-ヺー]{1,3}$/.test(text.trim());
}

function speechRate(text: string): number {
  // Keep words and sentences near natural speed. Isolated kana are deliberately
  // much slower for beginner listening practice: half of the previous 0.9 rate.
  return isShortKana(text) ? 0.45 : 0.96;
}

export function canSpeakJapanese(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function speakJapanese(text: string): void {
  const clean = text.trim();
  if (!canSpeakJapanese() || !clean) return;

  const synth = window.speechSynthesis;
  synth.cancel();

  // A Japanese full stop helps some iOS voices avoid clipping a one-mora utterance.
  const spokenText = isShortKana(clean) ? `${clean}。` : clean;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = JA_LOCALE;
  utterance.rate = speechRate(clean);
  utterance.pitch = 1;
  utterance.volume = 1;

  const voice = bestJapaneseVoice(synth.getVoices());
  if (voice) utterance.voice = voice;

  synth.speak(utterance);
}

// Safari/iOS may populate voices asynchronously. Warm the list and listen once so
// the first user-triggered pronunciation can use the best available Japanese voice.
if (canSpeakJapanese()) {
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.addEventListener?.('voiceschanged', () => { synth.getVoices(); }, { once: true });
}
