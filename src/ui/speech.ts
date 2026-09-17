const JA_LOCALE = 'ja-JP';
const KANA_RATE = 0.1125;
const DEFAULT_RATE = 0.96;
const VOICE_LOAD_TIMEOUT_MS = 400;

let activeUtterance: SpeechSynthesisUtterance | undefined;
let speechRequestId = 0;

function voiceScore(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;

  if (lang === 'ja-jp') score += 100;
  else if (lang.startsWith('ja')) score += 70;

  // Prefer high-quality system/browser voices. Chrome commonly exposes
  // "Google 日本語" / "Google Japanese"; Apple and Windows expose different names.
  if (/(premium|enhanced|natural|neural|siri)/i.test(name)) score += 40;
  if (/(google.*日本|google.*japanese|kyoko|otoya|nanami)/i.test(name)) score += 28;
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
  // Isolated kana are intentionally ultra-slow for beginner sound discrimination.
  // 0.1125 is exactly half of the previous 0.225 rate and stays above the Web
  // Speech API's practical minimum of 0.1 on Chromium/Safari engines.
  return isShortKana(text) ? KANA_RATE : DEFAULT_RATE;
}

function createUtterance(text: string, voice?: SpeechSynthesisVoice): SpeechSynthesisUtterance {
  // A Japanese full stop helps iOS/Safari and Chromium avoid clipping a one-mora
  // utterance at the end of a very short synthesis request.
  const spokenText = isShortKana(text) ? `${text}。` : text;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  utterance.lang = JA_LOCALE;
  utterance.rate = speechRate(text);
  utterance.pitch = 1;
  utterance.volume = 1;
  if (voice) utterance.voice = voice;
  return utterance;
}

function speakWithVoice(
  synth: SpeechSynthesis,
  text: string,
  voice: SpeechSynthesisVoice | undefined,
  requestId: number,
  allowFallback = true,
): void {
  if (requestId !== speechRequestId) return;

  const utterance = createUtterance(text, voice);
  activeUtterance = utterance;

  utterance.onend = () => {
    if (activeUtterance === utterance) activeUtterance = undefined;
  };

  utterance.onerror = (event) => {
    if (activeUtterance === utterance) activeUtterance = undefined;
    if (requestId !== speechRequestId || !allowFallback || !voice) return;

    const error = (event as SpeechSynthesisErrorEvent).error;
    if (error === 'voice-unavailable' || error === 'language-unavailable' || error === 'synthesis-failed') {
      // Chrome can occasionally expose a voice before it is actually ready. Retry
      // once without pinning the voice while keeping lang=ja-JP, allowing Chromium
      // to choose its own Japanese engine instead of falling back to another locale.
      window.setTimeout(() => speakWithVoice(synth, text, undefined, requestId, false), 0);
    }
  };

  if (synth.paused) synth.resume();
  synth.speak(utterance);
}

export function canSpeakJapanese(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function speakJapanese(text: string): void {
  const clean = text.trim();
  if (!canSpeakJapanese() || !clean) return;

  const synth = window.speechSynthesis;
  const requestId = ++speechRequestId;
  synth.cancel();

  const initialVoices = synth.getVoices();
  const initialJapaneseVoice = bestJapaneseVoice(initialVoices);

  // Safari usually has voices immediately. Chrome may return [] on the first call,
  // then emit voiceschanged shortly afterward. If Chrome already returned voices,
  // speak immediately; lang=ja-JP still constrains the fallback when no explicit
  // Japanese voice was exposed.
  if (initialJapaneseVoice || initialVoices.length > 0) {
    speakWithVoice(synth, clean, initialJapaneseVoice, requestId);
    return;
  }

  let settled = false;
  const finish = (): void => {
    if (settled || requestId !== speechRequestId) return;
    settled = true;
    synth.removeEventListener?.('voiceschanged', onVoicesChanged);
    speakWithVoice(synth, clean, bestJapaneseVoice(synth.getVoices()), requestId);
  };

  const onVoicesChanged = (): void => finish();
  synth.addEventListener?.('voiceschanged', onVoicesChanged, { once: true });
  window.setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
}

// Warm the voice list at startup. This is especially useful in Chrome/Chromium,
// where the first getVoices() call is often empty until voiceschanged fires.
if (canSpeakJapanese()) {
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.addEventListener?.('voiceschanged', () => { synth.getVoices(); }, { once: true });
}
