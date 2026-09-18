const JA_LOCALE = 'ja-JP';
const KANA_RATE = 0.90;
const DEFAULT_RATE = 0.96;
const KANA_TARGET_RATE = 0.90;
const VOICE_LOAD_TIMEOUT_MS = 400;
const HD_AUDIO_START_TIMEOUT_MS = 1400;
const HD_AUDIO_MANIFEST_URL = './audio/ja/manifest.json';

type AudioProfile = 'kana' | 'default';

type HdAudioManifest = {
  schemaVersion: 1;
  generatedAt?: string;
  voice?: string;
  rates?: Partial<Record<AudioProfile, number>>;
  profiles: Record<AudioProfile, Record<string, string>>;
};

let activeUtterance: SpeechSynthesisUtterance | undefined;
let activeAudio: HTMLAudioElement | undefined;
let speechRequestId = 0;

function getAudioElement(): HTMLAudioElement {
  if (activeAudio?.isConnected) return activeAudio;
  const audio = document.createElement('audio');
  audio.preload = 'auto';
  audio.volume = 1;
  audio.muted = false;
  audio.setAttribute('playsinline', '');
  audio.setAttribute('webkit-playsinline', '');
  audio.hidden = true;
  document.body.appendChild(audio);
  activeAudio = audio;
  return audio;
}
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
      console.info('Kotoba HD audio manifest unavailable; using browser speech.', error);
    });
  return hdManifestLoad;
}

function hdAudioUrl(text: string): string | undefined {
  const key = normalizeAudioKey(text);
  if (!key || !hdAudioManifest) return undefined;
  return hdAudioManifest.profiles[audioProfile(key)]?.[key];
}

function hdPlaybackRate(text: string): number {
  if (!isShortKana(text)) return 1;
  const generatedRate = hdAudioManifest?.rates?.kana;
  if (!generatedRate || generatedRate <= 0) return 1.7;
  return Math.max(0.8, Math.min(2, KANA_TARGET_RATE / generatedRate));
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

function stopActiveAudio(): void {
  if (!activeAudio) return;
  activeAudio.pause();
  try { activeAudio.currentTime = 0; } catch { /* metadata may not be ready */ }
}

function speakWithHdAsset(text: string, src: string, requestId: number): boolean {
  try {
    const audio = getAudioElement();
    stopActiveAudio();
    audio.src = src;
    audio.playbackRate = hdPlaybackRate(text);
    audio.defaultPlaybackRate = audio.playbackRate;
    audio.load();

    let settled = false;
    let startTimer: number | undefined;

    const clearStartTimer = (): void => {
      if (startTimer !== undefined) {
        window.clearTimeout(startTimer);
        startTimer = undefined;
      }
    };

    const fallback = (): void => {
      if (settled || requestId !== speechRequestId) return;
      settled = true;
      clearStartTimer();
      audio.pause();
      speakWithBrowser(text, requestId);
    };

    const onPlaying = (): void => {
      if (requestId !== speechRequestId) return;
      clearStartTimer();
    };
    const onEnded = (): void => {
      if (requestId !== speechRequestId) return;
      settled = true;
      clearStartTimer();
    };
    const onError = (): void => fallback();

    audio.addEventListener('playing', onPlaying, { once: true });
    audio.addEventListener('ended', onEnded, { once: true });
    audio.addEventListener('error', onError, { once: true });

    startTimer = window.setTimeout(fallback, HD_AUDIO_START_TIMEOUT_MS);
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
  stopActiveAudio();
  if (canSpeakJapanese()) window.speechSynthesis.cancel();

  const staticAudio = hdAudioUrl(clean);
  if (staticAudio && speakWithHdAsset(clean, staticAudio, requestId)) return;
  speakWithBrowser(clean, requestId);
}

void initJapaneseAudio();
if (canSpeakJapanese()) {
  const synth = window.speechSynthesis;
  synth.getVoices();
  synth.addEventListener?.('voiceschanged', () => { synth.getVoices(); }, { once: true });
}
