export function speakJapanese(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'ja-JP';
  utterance.rate = 0.85;
  const voices = window.speechSynthesis.getVoices();
  const jaVoice = voices.find((voice) => voice.lang.toLowerCase().startsWith('ja'));
  if (jaVoice) utterance.voice = jaVoice;
  window.speechSynthesis.speak(utterance);
}
