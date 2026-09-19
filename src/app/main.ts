import { ContentRegistry } from '../core/registry/content-registry.js';
import { StudyModeRegistry } from '../core/registry/study-mode-registry.js';
import { IndexedDbRepository } from '../core/storage/indexeddb.js';
import { AdaptiveScheduler } from '../core/scheduler/adaptive-scheduler.js';
import { registerKanaModule } from '../features/kana/kana-module.js';
import { registerVocabularyModule } from '../features/vocabulary/vocabulary-module.js';
import { SessionEngine } from '../features/study/session-engine.js';
import type { AppContext } from './context.js';
import { currentRoute } from '../ui/router.js';
import { renderShell } from '../ui/shell.js';
import { renderHome } from '../ui/views/home.js';
import { renderKana } from '../ui/views/kana.js';
import { renderLyrics } from '../ui/views/lyrics.js';
import { renderStudy } from '../ui/views/study.js';
import { renderStats } from '../ui/views/stats.js';
import { renderSettings } from '../ui/views/settings.js';
import '../ui/theme/appearance.js';

const appRoot = document.querySelector<HTMLElement>('#app');
if (!appRoot) throw new Error('Missing #app root');
const app: HTMLElement = appRoot;

async function bootstrap(): Promise<void> {
  app.innerHTML = '<section class="loading">正在載入 Kotoba Lab…</section>';

  const content = new ContentRegistry();
  const modes = new StudyModeRegistry();
  registerKanaModule(content, modes);
  await registerVocabularyModule(content, modes);

  const repository = new IndexedDbRepository();
  const scheduler = new AdaptiveScheduler();
  const context: AppContext = { content, modes, repository, scheduler, sessions: new SessionEngine(content, scheduler, repository) };

  const render = async (): Promise<void> => {
    const route = currentRoute();
    if (route.path === '/study') {
      app.innerHTML = '<div id="page" class="study-page"></div>';
      const page = document.querySelector<HTMLElement>('#page');
      if (page) await renderStudy(page, context, route.params);
      return;
    }
    renderShell(app);
    const page = document.querySelector<HTMLElement>('#page');
    if (!page) return;
    document.querySelectorAll<HTMLElement>('[data-nav]').forEach((node) => {
      if (node.dataset.nav === route.path) node.classList.add('active');
    });
    if (route.path === '/kana') await renderKana(page, context);
    else if (route.path === '/lyrics') await renderLyrics(page, context);
    else if (route.path === '/stats') await renderStats(page, context);
    else if (route.path === '/settings') await renderSettings(page, context);
    else await renderHome(page, context);
  };

  window.addEventListener('hashchange', () => { void render(); });
  window.addEventListener('kotoba:rerender', () => { void render(); });
  await render();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      void (async () => {
        const registration = await navigator.serviceWorker.register('./sw.js', {
          updateViaCache: 'none',
        });
        await registration.update().catch(() => undefined);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }

        navigator.serviceWorker.addEventListener('controllerchange', () => {
          const key = 'kotoba-lab:sw-refresh:v0.9.0';
          if (sessionStorage.getItem(key)) return;
          sessionStorage.setItem(key, '1');
          location.reload();
        }, { once: true });
      })();
    });
  }
}

void bootstrap();
