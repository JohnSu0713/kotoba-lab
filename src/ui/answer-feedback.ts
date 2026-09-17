import { speakJapanese } from './speech.js';

function vibrate(pattern: number | number[]): boolean {
  if (!('vibrate' in navigator)) return false;
  try {
    return navigator.vibrate(pattern);
  } catch {
    return false;
  }
}

export function giveAnswerFeedback(
  speakText: string | undefined,
  correct: boolean,
  speakAnswers: boolean,
): void {
  // Android/Chromium supports the Vibration API; iOS currently does not. Keep
  // the pattern intentionally subtle so it feels like confirmation, not an alert.
  vibrate(correct ? 24 : [48, 38, 72]);

  if (speakAnswers && speakText) {
    window.setTimeout(() => speakJapanese(speakText), 40);
  }
}
