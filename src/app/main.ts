import { ContentRegistry } from "../core/registry/content-registry.js";
import { StudyModeRegistry } from "../core/registry/study-mode-registry.js";
import { IndexedDbRepository } from "../core/storage/indexeddb.js";
import { AdaptiveScheduler } from "../core/scheduler/adaptive-scheduler.js";
import { registerKanaModule } from "../features/kana/kana-module.js";
import { registerVocabularyModule } from "../features/vocabulary/vocabulary-module.js";
import { SessionEngine } from "../features/study/session-engine.js";
import type { AppContext } from "./context.js";
import { currentRoute } from "../ui/router.js";
import { renderShell } from "../ui/shell.js";
import { renderHome } from "../ui/views/home.js";
import { renderKana } from "../ui/views/kana.js";
import { renderLyrics } from "../ui/views/lyrics.js";
import { renderStudy } from "../ui/views/study.js";
import { renderStats } from "../ui/views/stats.js";
import { renderSettings } from "../ui/views/settings.js";
import "../ui/theme/appearance.js";
import { renderLibrary } from "../ui/views/library.js";
import { renderStudio } from "../ui/views/studio.js";
import { stopJapanese } from "../ui/speech.js";
import { escapeHtml } from "../ui/html.js";

const appRoot = document.querySelector<HTMLElement>("#app");
if (!appRoot) throw new Error("Missing #app root");
const app: HTMLElement = appRoot;

async function bootstrap(): Promise<void> {
  app.innerHTML = '<section class="loading">正在載入 Kotoba Lab…</section>';

  const content = new ContentRegistry();
  const modes = new StudyModeRegistry();
  registerKanaModule(content, modes);
  await registerVocabularyModule(content, modes);

  const repository = new IndexedDbRepository();
  const scheduler = new AdaptiveScheduler();
  const context: AppContext = {
    content,
    modes,
    repository,
    scheduler,
    sessions: new SessionEngine(content, scheduler, repository),
  };

  const render = async (): Promise<void> => {
    stopJapanese();
    const route = currentRoute();
    document.title =
      "Kotoba Lab · " +
      ({
        "/": "今日",
        "/library": "詞彙筆記",
        "/studio": "練習室",
        "/kana": "五十音",
        "/stats": "學習統計",
        "/settings": "設定",
        "/lyrics": "歌詞",
        "/study": "練習",
      }[route.path] ?? "日文學習");
    if (route.path === "/study") {
      app.innerHTML = '<div id="page" class="study-page"></div>';
      const page = document.querySelector<HTMLElement>("#page");
      if (page) await renderStudy(page, context, route.params);
      return;
    }
    renderShell(app);
    const page = document.querySelector<HTMLElement>("#page");
    if (!page) return;
    document.querySelectorAll<HTMLElement>("[data-nav]").forEach((node) => {
      if (node.dataset.nav === route.path) {
        node.classList.add("active");
        node.setAttribute("aria-current", "page");
      }
    });
    if (route.path === "/library")
      await renderLibrary(page, context, route.params);
    else if (route.path === "/studio")
      await renderStudio(page, context, route.params);
    else if (route.path === "/kana") await renderKana(page, context);
    else if (route.path === "/lyrics") await renderLyrics(page, context);
    else if (route.path === "/stats") await renderStats(page, context);
    else if (route.path === "/settings") await renderSettings(page, context);
    else await renderHome(page, context);
  };

  const safeRender = async () => {
    try {
      await render();
    } catch (error) {
      showError(error);
    }
  };
  window.addEventListener("hashchange", () => {
    window.scrollTo(0, 0);
    void safeRender();
  });
  window.addEventListener("kotoba:rerender", () => {
    void safeRender();
  });
  await safeRender();

  if ("serviceWorker" in navigator) {
    const hadController = Boolean(navigator.serviceWorker.controller);
    const registerWorker = () => {
      void (async () => {
        const registration = await navigator.serviceWorker.register("./sw.js", {
          updateViaCache: "none",
        });
        await registration.update().catch(() => undefined);

        if (registration.waiting) {
          registration.waiting.postMessage({ type: "SKIP_WAITING" });
        }

        navigator.serviceWorker.addEventListener(
          "controllerchange",
          () => {
            if (!hadController || currentRoute().path === "/study") return;
            const key = "kotoba-lab:sw-refresh:v0.10.0";
            if (sessionStorage.getItem(key)) return;
            sessionStorage.setItem(key, "1");
            location.reload();
          },
          { once: true },
        );
      })().catch((error) => console.info("Offline setup unavailable", error));
    };
    if (document.readyState === "complete") registerWorker();
    else window.addEventListener("load", registerWorker, { once: true });
  }
}

function showError(error: unknown): void {
  app.innerHTML = `<section class="empty-state"><h1>這次沒有順利載入</h1><p>${escapeHtml(error instanceof Error ? error.message : "請再試一次。")}</p><button id="retry-app" class="primary-button">重新整理</button><a href="#/">回首頁</a></section>`;
  document
    .querySelector("#retry-app")
    ?.addEventListener("click", () => location.reload());
}
void bootstrap().catch(showError);
