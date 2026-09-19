const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const server = spawn("python3", ["-m", "http.server", "4173", "-d", "public"], {
  stdio: "ignore",
});
process.on("exit", () => server.kill());
(async () => {
  const binary = process.env.CHROMIUM_EXECUTABLE;
  await new Promise((resolve) => setTimeout(resolve, 500));
  const browser = await chromium.launch({
    headless: true,
    ...(binary
      ? {
          executablePath: binary,
          args: ["--no-sandbox", "--disable-dev-shm-usage"],
        }
      : {}),
  });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  });
  const page = await context.newPage();
  const screenshot = async (options) => {
    if (process.env.QA_FONT_CSS) {
      await page.addStyleTag({ path: process.env.QA_FONT_CSS });
      await page.evaluate(() => document.fonts.ready);
    }
    await page.screenshot(options);
  };
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:4173");
  await page.locator(".daily-start").waitFor();
  await screenshot({ path: ".tmp/home-desktop.png", fullPage: true });
  await page.locator('a[href="#/library"]').first().click();
  await page.locator("#word-search").fill("旅行");
  assert.ok((await page.locator(".word-card").count()) > 0);
  const save = page.locator("[data-save]").first();
  await save.click();
  await page.locator('[data-save][aria-pressed="true"]').first().waitFor();
  await page.reload();
  await page.locator("#saved-filter").click();
  assert.ok((await page.locator(".word-card").count()) > 0);
  await page.locator(".word-card .quiet-link").first().click();
  await page.locator('[data-action="reveal"]').click();
  await page.locator('[data-rating="good"]').click();
  await page.locator(".completion-mark").waitFor();
  await page.goto("http://127.0.0.1:4173/#/studio?tab=grammar&id=desu");
  await page.locator('[data-answer="1"]').click();
  await page.locator(".answer-explanation.correct").waitFor();
  await page.goto("http://127.0.0.1:4173/#/studio?tab=reading&id=cafe");
  await page.locator("#show-translation").check();
  assert.equal(await page.locator(".translation-hint:visible").count(), 4);
  await screenshot({ path: ".tmp/reading-desktop.png", fullPage: true });
  await page.goto("http://127.0.0.1:4173/#/studio?tab=speaking&id=restaurant");
  await page.locator("#hide-japanese").check();
  assert.equal(await page.locator(".japanese-hint:visible").count(), 0);
  await page.locator("[data-practiced]").first().click();
  await page.getByText("已開口練習 ✓", { exact: true }).waitFor();
  await page.goto("http://127.0.0.1:4173/#/stats");
  await page.locator(".activity-grid").waitFor();
  assert.equal(await page.locator(".activity-cell").count(), 84);
  await page.goto("http://127.0.0.1:4173/#/settings");
  await page.locator('input[name="dailyGoal"]').fill("25");
  await page.locator('button[type="submit"]').click();
  await page.getByText("已儲存", { exact: true }).waitFor();
  const backup = await page.evaluate(async () => {
    const { IndexedDbRepository } =
      await import("./app/core/storage/indexeddb.js");
    return new IndexedDbRepository().exportSnapshot();
  });
  assert.equal(backup.notebook.dailyGoal, 25);
  assert.ok(backup.notebook.savedIds.length > 0);
  assert.equal(backup.activities.length, 3);
  assert.equal(backup.reviews.length, 1);
  const invalid = await page.evaluate(async () => {
    const { IndexedDbRepository } =
      await import("./app/core/storage/indexeddb.js");
    const repo = new IndexedDbRepository();
    try {
      await repo.importSnapshot({
        schemaVersion: 1,
        reviews: [{}],
        settings: {},
      });
    } catch {}
    return (await repo.getAllReviews()).length;
  });
  assert.equal(invalid, 1);
  await page.evaluate(async (backup) => {
    const { IndexedDbRepository } =
      await import("./app/core/storage/indexeddb.js");
    await new IndexedDbRepository().importSnapshot(backup);
  }, backup);
  await page.locator("#theme-toggle").click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "dark");
  await page.goto("http://127.0.0.1:4173/#/");
  await page.locator(".daily-start").waitFor();
  await screenshot({ path: ".tmp/home-dark.png", fullPage: true });
  await page.locator("#theme-toggle").click();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [route, selector] of [
    ["/", ".daily-start"],
    ["/kana", ".kana-cell"],
    ["/library", "#word-search"],
    ["/studio", ".studio-card"],
    ["/studio?tab=reading&id=trip", ".reading-body"],
    ["/studio?tab=speaking&id=hotel", ".speaking-lines"],
    ["/lyrics", "#lyric-add-form"],
    ["/stats", ".activity-grid"],
    ["/settings", "#settings-form"],
  ]) {
    await page.goto("http://127.0.0.1:4173/#" + route);
    await page.locator(selector).first().waitFor({ timeout: 15000 });
    const overflow = await page.evaluate(() =>
      [...document.querySelectorAll("body *")]
        .filter((e) => {
          const s = getComputedStyle(e),
            r = e.getBoundingClientRect();
          return (
            s.display !== "none" &&
            s.position !== "fixed" &&
            r.width > 0 &&
            (r.right > innerWidth + 1 || r.left < -1)
          );
        })
        .map((e) => e.className)
        .slice(0, 8),
    );
    console.log("MOBILE", route, JSON.stringify(overflow));
    if (route === "/")
      await screenshot({ path: ".tmp/home-mobile.png", fullPage: true });
  }
  await page.goto(
    "http://127.0.0.1:4173/#/study?mode=kana-recognition&strategy=practice",
  );
  await page.locator("[data-choice]").first().waitFor();
  await page.locator("[data-choice]").first().click();
  await page.locator('[data-action="next"]').waitFor();
  await page.keyboard.press("Enter");
  await page.locator("[data-choice]").first().waitFor();
  await page.goto("http://127.0.0.1:4173/#/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
  await context.setOffline(true);
  await page.reload();
  await page.locator(".daily-start").waitFor();
  await page.goto("http://127.0.0.1:4173/#/studio?tab=reading&id=cafe");
  await page.locator(".reading-body").waitFor();
  console.log("OFFLINE passed");
  assert.deepEqual(errors, []);
  await context.setOffline(false);
  const legacyContext = await browser.newContext({ serviceWorkers: "block" });
  const legacy = await legacyContext.newPage();
  await legacy.goto("http://127.0.0.1:4173/styles.css");
  await legacy.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const r = indexedDB.open("kotoba-lab", 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore("reviews", { keyPath: "key" });
          r.result.createObjectStore("settings", { keyPath: "key" });
        };
        r.onsuccess = () => {
          const db = r.result,
            tx = db.transaction("reviews", "readwrite");
          tx.objectStore("reviews").put({
            key: "test::legacy",
            itemId: "legacy",
            modeId: "test",
            dueAt: "2099-01-01T00:00:00Z",
            intervalDays: 10,
            ease: 2.5,
            reps: 4,
            lapses: 1,
          });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
        };
        r.onerror = () => reject(r.error);
      }),
  );
  await legacy.goto("http://127.0.0.1:4173");
  await legacy.locator(".daily-start").waitFor();
  const migrated = await legacy.evaluate(async () => {
    const { IndexedDbRepository } =
      await import("./app/core/storage/indexeddb.js");
    return new IndexedDbRepository().exportSnapshot();
  });
  assert.equal(migrated.reviews[0].reps, 4);
  assert.equal(migrated.activities.length, 0);
  console.log("MIGRATION passed");
  await legacyContext.close();
  console.log("BROWSER PASS, backup entries:", backup.activities.length);
  await browser.close();
  server.kill();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
