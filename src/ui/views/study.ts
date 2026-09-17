import type { AppContext } from '../../app/context.js';
import type { Rating, Script } from '../../domain/models.js';
import type { StudyQuestion } from '../../core/contracts/study-mode.js';
import { icons } from '../components/icons.js';
import { speakJapanese } from '../speech.js';
import { giveAnswerFeedback } from '../answer-feedback.js';

type FeedbackState = {
  correct: boolean;
  answer: string;
  question: StudyQuestion;
  position: number;
  sourceModeTitle: string;
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[char] ?? char);
}

function correctLabel(question: StudyQuestion): string {
  if (question.type === 'choice') {
    return question.choices.find((choice) => choice.value === question.correctValue)?.label ?? question.correctValue;
  }
  if (question.type === 'text') return question.acceptedAnswers.join(' / ');
  return question.back;
}

function predicateFor(params: URLSearchParams, enabledGroups: string[]): (item: import('../../domain/models.js').ContentItem) => boolean {
  const script = params.get('script') as Script | null;
  const scope = params.get('scope');
  const jlpt = params.get('jlpt');
  return (item) => {
    if (item.kind === 'kana') {
      if (script && item.script !== script) return false;
      if (scope === 'basic' && item.group !== 'gojuon') return false;
      if (scope === 'all' && !enabledGroups.includes(item.group)) return false;
    }
    if (item.kind === 'vocabulary' && jlpt && item.jlpt !== jlpt) return false;
    return true;
  };
}

export async function renderStudy(root: HTMLElement, context: AppContext, params: URLSearchParams): Promise<void> {
  const modeId = params.get('mode');
  if (!modeId) {
    root.innerHTML = '<section class="empty"><h2>缺少學習模式</h2><a href="#/">回首頁</a></section>';
    return;
  }

  const settings = await context.repository.getSettings();
  const isMixed = modeId === 'daily-mixed';
  const mode = isMixed ? undefined : context.modes.get(modeId);
  const pageTitle = isMixed ? '10 分鐘混合練習' : mode!.title;
  const predicate = predicateFor(params, settings.enabledKanaGroups);
  const mixedModes = context.modes.list().filter((candidate) => candidate.id.startsWith('kana-') || candidate.id.startsWith('vocab-'));

  root.innerHTML = `<section class="loading">正在準備 ${escapeHtml(pageTitle)}…</section>`;
  const session = isMixed
    ? await context.sessions.createMixed(mixedModes, { predicate })
    : await context.sessions.create(mode!, { predicate });
  let feedback: FeedbackState | undefined;
  let revealed = false;

  const draw = (): void => {
    // Keep the answered card visible during feedback. The session advances as soon
    // as an answer is submitted, but the next card must not appear until the user
    // explicitly taps "下一題".
    if (!feedback && session.isDone) {
      root.innerHTML = `
        <section class="study-shell complete-card">
          <a class="back-link" href="#/">← 首頁</a>
          <div class="completion-mark">✓</div>
          <p class="eyebrow">SESSION COMPLETE</p>
          <h1>今天這組完成了</h1>
          <p>完成 ${session.total} 題。記憶排程已更新，下次到期時再回來。</p>
          <a class="primary-button" href="#/">回到今日</a>
        </section>`;
      return;
    }

    const card = feedback ? undefined : session.current();
    if (!feedback && !card) {
      root.innerHTML = `
        <section class="study-shell complete-card">
          <a class="back-link" href="#/">← 首頁</a>
          <p class="eyebrow">ALL CLEAR</p>
          <h1>目前沒有到期或新內容</h1>
          <p>可以切換另一種練習方式，或等排程到期再回來。</p>
          <a class="primary-button" href="#/">選其他模式</a>
        </section>`;
      return;
    }

    const q = feedback?.question ?? card!.question;
    const sourceModeTitle = feedback?.sourceModeTitle ?? card!.mode.title;
    const questionNumber = feedback?.position ?? session.completed + 1;
    const progress = session.total === 0 ? 0 : Math.round((session.completed / session.total) * 100);
    root.innerHTML = `
      <section class="study-shell">
        <header class="study-topbar">
          <a class="back-link" href="#/">← 離開</a>
          <div class="study-mode-name">${escapeHtml(pageTitle)}</div>
          <div class="study-count">${questionNumber}/${session.total}</div>
        </header>
        <div class="progress-track"><span style="width:${progress}%"></span></div>
        <main class="question-card">
          ${isMixed ? `<div class="mixed-mode-chip">${escapeHtml(sourceModeTitle)}</div>` : ''}
          ${q.speakText ? `<button class="speaker" data-action="speak" aria-label="播放日文發音">${icons.volume}</button>` : ''}
          <div class="question-prompt">${escapeHtml(q.type === 'flashcard' ? q.front : q.prompt)}</div>
          ${q.type === 'flashcard' && q.frontSub ? `<div class="question-sub">${escapeHtml(q.frontSub)}</div>` : q.type !== 'flashcard' && q.subtitle ? `<div class="question-sub">${escapeHtml(q.subtitle)}</div>` : ''}

          ${feedback ? `
            <div class="feedback ${feedback.correct ? 'correct' : 'wrong'}">
              <strong>${feedback.correct ? '答對了' : '再加深一次'}</strong>
              ${feedback.correct ? '' : `<span>正確答案：${escapeHtml(feedback.answer)}</span>`}
            </div>
            <button class="primary-button wide" data-action="next">下一題</button>
          ` : renderQuestion(q, revealed)}
        </main>
      </section>`;

    root.querySelector<HTMLElement>('[data-action="speak"]')?.addEventListener('click', () => {
      if (q.speakText) speakJapanese(q.speakText);
    });

    if (feedback) {
      root.querySelector('[data-action="next"]')?.addEventListener('click', () => {
        feedback = undefined;
        revealed = false;
        draw();
      });
      return;
    }

    if (q.type === 'choice') {
      root.querySelectorAll<HTMLButtonElement>('[data-choice]').forEach((button) => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          const answer = button.dataset.choice ?? '';
          const expected = correctLabel(q);
          const answeredQuestion = q;
          const answeredModeTitle = card!.mode.title;
          const position = session.completed + 1;
          const outcome = await session.submit(answer);
          feedback = { correct: outcome.correct, answer: expected, question: answeredQuestion, position, sourceModeTitle: answeredModeTitle };
          draw();
          giveAnswerFeedback(answeredQuestion.speakText, outcome.correct, settings.speakAnswers);
        });
      });
    } else if (q.type === 'text') {
      const form = root.querySelector<HTMLFormElement>('#text-answer');
      form?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const input = form.elements.namedItem('answer') as HTMLInputElement;
        const submitButton = form.querySelector<HTMLButtonElement>('button[type="submit"]');
        if (submitButton) submitButton.disabled = true;
        const expected = correctLabel(q);
        const answeredQuestion = q;
        const answeredModeTitle = card!.mode.title;
        const position = session.completed + 1;
        const outcome = await session.submit(input.value);
        feedback = { correct: outcome.correct, answer: expected, question: answeredQuestion, position, sourceModeTitle: answeredModeTitle };
        draw();
        giveAnswerFeedback(answeredQuestion.speakText, outcome.correct, settings.speakAnswers);
      });
      root.querySelector<HTMLInputElement>('input[name="answer"]')?.focus();
    } else if (q.type === 'flashcard') {
      root.querySelector('[data-action="reveal"]')?.addEventListener('click', () => {
        revealed = true;
        draw();
      });
      root.querySelectorAll<HTMLButtonElement>('[data-rating]').forEach((button) => {
        button.addEventListener('click', async () => {
          button.disabled = true;
          const rating = button.dataset.rating as Rating;
          const answeredQuestion = q;
          const outcome = await session.submit('', rating);
          feedback = undefined;
          revealed = false;
          draw();
          giveAnswerFeedback(answeredQuestion.speakText, outcome.correct, settings.speakAnswers);
        });
      });
    }
  };

  draw();
}

function renderQuestion(question: StudyQuestion, revealed: boolean): string {
  if (question.type === 'choice') {
    return `<div class="choice-grid">${question.choices.map((choice) => `<button data-choice="${escapeHtml(choice.value)}">${escapeHtml(choice.label)}</button>`).join('')}</div>`;
  }
  if (question.type === 'text') {
    return `<form id="text-answer" class="text-answer"><input name="answer" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${escapeHtml(question.placeholder)}"><button class="primary-button" type="submit">確認</button></form>`;
  }
  if (!revealed) {
    return `<button class="primary-button wide reveal" data-action="reveal">顯示答案</button>`;
  }
  return `
    <div class="flash-back"><div>${escapeHtml(question.back)}</div>${question.backSub ? `<small>${escapeHtml(question.backSub)}</small>` : ''}</div>
    <div class="rating-grid">
      <button data-rating="again"><strong>Again</strong><small>忘了</small></button>
      <button data-rating="hard"><strong>Hard</strong><small>勉強</small></button>
      <button data-rating="good"><strong>Good</strong><small>記得</small></button>
      <button data-rating="easy"><strong>Easy</strong><small>太簡單</small></button>
    </div>`;
}
