const JA_LOCALE = 'ja-JP';
const KANA_RATE = 0.1125;
const DEFAULT_RATE = 0.96;
const VOICE_LOAD_TIMEOUT_MS = 400;
const HD_AUDIO_MANIFEST_URL = './audio/ja/manifest.json';

type AudioProfile = 'kana' | 'default';

type HdAudioManifest = {
  schemaVersion: 1;
  generatedAt?: string;
  voice?: string;
  profiles: Record<AudioProfile, Record<string, string>>;
};

let activeUtterance: SpeechSynthesisUtterance | undefined;
let activeAudio: HTMLAudioElement | undefined;
let speechRequestId = 0;
let hdAudioManifest: HdAudioManifest | undefined;
let hdManifestLoad: Promise<void> | undefined;

function isShortKana(text: string): boolean {
  return /^[ぁ-ゖァ-ヺー]{1,3}$/.test(text.trim());
}

function audioProfile(text: string): AudioProfile {
  return isShortKana(text) ? 'kana' : 'default';
}

function normalizeAudioKey(text: string): string {
  return text.trim().normalize('NFC');
}

function isHdAudioManifest(value: unknown): value is HdAudioManifest {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<HdAudioManifest>;
  return candidate.schemaVersion === 1
    && !!candidate.profiles
    && typeof candidate.profiles.kana === 'object'
    && typeof candidate.profiles.default === 'object';
}

export function initJapaneseAudio(): Promise<void> {
  if (hdManifestLoad) return hdManifestLoad;
  hdManifestLoad = fetch(HD_AUDIO_MANIFEST_URL, { cache: 'no-store' })
    .then(async (response) => {
      if (!response.ok) return;
      const parsed = await response.json() as unknown;
      if (isHdAudioManifest(parsed)) hdAudioManifest = parsed;
    })
    .catch((error) => {
      // HD audio is an enhancement. A missing manifest must never prevent study;
      // browser speech synthesis remains the offline/first-deploy fallback.
      console.info('Kotoba HD audio manifest unavailable; using browser speech.', error);
    });
  return hdManifestLoad;
}

function hdAudioUrl(text: string): string | undefined {
  const key = normalizeAudioKey(text);
  if (!key || !hdAudioManifest) return undefined;
  return hdAudioManifest.profiles[audioProfile(key)]?.[key];
}

function voiceScore(voice: SpeechSynthesisVoice): number {
  const lang = voice.lang.toLowerCase();
  const name = voice.name.toLowerCase();
  let score = 0;

  if (lang === 'ja-jp') score += 100;
  else if (lang.startsWith('ja')) score += 70;

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

function speechRate(text: string): number {
  // This rate is only used by the browser fallback. Generated Chirp audio has its
  // learning pace baked into the asset at generation time.
  return isShortKana(text) ? KANA_RATE : DEFAULT_RATE;
}

function createUtterance(text: string, voice?: SpeechSynthesisVoice): SpeechSynthesisUtterance {
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
      window.setTimeout(() => speakWithVoice(synth, text, undefined, requestId, false), 0);
    }
  };

  if (synth.paused) synth.resume();
  synth.speak(utterance);
}

function speakWithBrowser(text: string, requestId: number): void {
  if (!canSpeakJapanese() || requestId !== speechRequestId) return;
  const synth = window.speechSynthesis;
  const initialVoices = synth.getVoices();
  const initialJapaneseVoice = bestJapaneseVoice(initialVoices);

  if (initialJapaneseVoice || initialVoices.length > 0) {
    speakWithVoice(synth, text, initialJapaneseVoice, requestId);
    return;
  }

  let settled = false;
  const finish = (): void => {
    if (settled || requestId !== speechRequestId) return;
    settled = true;
    synth.removeEventListener?.('voiceschanged', onVoicesChanged);
    speakWithVoice(synth, text, bestJapaneseVoice(synth.getVoices()), requestId);
  };

  const onVoicesChanged = (): void => finish();
  synth.addEventListener?.('voiceschanged', onVoicesChanged, { once: true });
  window.setTimeout(finish, VOICE_LOAD_TIMEOUT_MS);
}

function speakWithHdAsset(text: string, src: string, requestId: number): boolean {
  try {
    const audio = new Audio(src);
    activeAudio = audio;
    audio.preload = 'auto';

    let fellBack = false;
    const fallback = (): void => {
      if (fellBack || requestId !== speechRequestId) return;
      fellBack = true;
      if (activeAudio === audio) activeAudio = undefined;
      speakWithBrowser(text, requestId);
    };

    audio.addEventListener('ended', () => {
      if (activeAudio === audio) activeAudio = undefined;
    }, { once: true });
    audio.addEventListener('error', fallback, { once: true });

    const play = audio.play();
    if (play) void play.catch(fallback);
    return true;
  } catch {
    return false;
  }
}

export function canSpeakJapanese(): boolean {
  return 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
}

export function speakJapanese(text: string): void {
  const clean = normalizeAudioKey(text);
  if (!clean) return;

  const requestId = ++speechRequestId;
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = undefined;
  }
  if (canSpeakJapanese()) window.speechSynthesis.cancel();

  const staticAudio = hdAudioUrl(clean);
  if (staticAudio && speakWithHdAsset(clean, staticAudio, requestId)) return;
  speakWithBrowser(clean, requestId);
}

// Warm both sources at startup. The manifest is intentionally loaded in advance
// so a later user tap can call HTMLMediaElement.play() synchronously, which keeps
// iOS/Safari and Chrome inside their user-gesture media policy.
void initJapaneseAudio();
if (canSpeakJapanese()) {
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.addEventListener?.('voiceschanged', () => { synth.getVoices(); }, { once: true });
}
