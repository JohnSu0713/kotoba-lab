import type { AppContext } from "../../app/context.js";
import type { KanaItem, VocabularyItem } from "../../domain/models.js";
import {
  buildLearningPath,
  PATH_STAGES,
  TOTAL_PATTERN_TARGET,
  TOTAL_VOCABULARY_TARGET,
} from "../../features/path/curriculum.js";
import { learningPathSnapshot } from "../../features/path/progress.js";
import { studyHref } from "../router.js";

export async function renderPath(
  root: HTMLElement,
  context: AppContext,
): Promise<void> {
  const [reviews, notebook] = await Promise.all([
    context.repository.getAllReviews(),
    context.repository.getNotebook(),
  ]);
  const vocabulary = context.content.getAll({ kind: "vocabulary" }) as VocabularyItem[];
  const kana = context.content.getAll({ kind: "kana" }) as KanaItem[];
  const foundationIds = kana
    .filter((item) => item.group === "gojuon")
    .map((item) => item.id);
  const units = buildLearningPath(vocabulary);
  const snapshot = learningPathSnapshot(
    units,
    reviews,
    foundationIds,
    notebook.path?.foundationSkipped ?? false,
  );

  const currentOrder = snapshot.currentUnit?.order ?? 101;
  const currentHref = !snapshot.foundationDone
    ? studyHref("kana-recognition", { scope: "basic", limit: "15", path: "foundation" })
    : snapshot.currentUnit && snapshot.currentLesson
      ? studyHref("vocab-flashcard", {
          path: "1",
          pathUnit: String(snapshot.currentUnit.order),
          pathLesson: String(snapshot.currentLesson.order),
          limit: "10",
        })
      : "#/lyrics";

  root.innerHTML = `
    <section class="path-map-header">
      <a class="quiet-link" href="#/">← 回到今日</a>
      <p class="eyebrow">KOTOBA PATH</p>
      <h1>Foundation + 100 Units</h1>
      <p>固定 ${TOTAL_VOCABULARY_TARGET.toLocaleString()} 個單字、${TOTAL_PATTERN_TARGET} 個句型目標。每個單字只在 curriculum 裡有一個固定位置。</p>
      <div class="path-map-summary">
        <div><strong>${snapshot.completedUnits}</strong><span>/ 100 Units 完成</span></div>
        <div><strong>${snapshot.pathVocabularyLearned.toLocaleString()}</strong><span>/ 7,777 主線單字</span></div>
        <div><strong>${snapshot.percent}%</strong><span>主線進度</span></div>
      </div>
      <a class="primary-button path-map-continue" href="${currentHref}">繼續目前課程 →</a>
    </section>

    <section class="path-foundation-row ${snapshot.foundationDone ? "is-complete" : "is-current"}">
      <div>
        <span class="path-unit-number">0</span>
        <div><strong>Foundation</strong><p>平假名、片假名基本清音 · ${snapshot.foundationReviewed}/${snapshot.foundationTotal}</p></div>
      </div>
      <b>${snapshot.foundationDone ? "✓" : "CURRENT"}</b>
    </section>

    <div class="path-stage-list">
      ${PATH_STAGES.map((stage) => {
        const stageUnits = units.filter((unit) => unit.level === stage.level);
        const complete = stageUnits.every((unit) => unit.order < currentOrder);
        const active = stageUnits.some((unit) => unit.order === currentOrder);
        return `
          <section class="path-stage-card ${active ? "is-current" : ""} ${complete ? "is-complete" : ""}">
            <header>
              <div>
                <p class="eyebrow">${stage.level}</p>
                <h2>${stage.title}</h2>
                <p>${stage.subtitle}</p>
              </div>
              <div class="path-stage-targets">
                <span>${stage.vocabularyTarget.toLocaleString()} 新單字</span>
                <span>${stage.patternTarget} 句型目標</span>
              </div>
            </header>
            <div class="path-unit-grid">
              ${stageUnits.map((unit) => {
                const unitComplete = unit.order < currentOrder;
                const unitCurrent = unit.order === currentOrder;
                const unitFuture = unit.order > currentOrder;
                return `
                  <div class="path-unit-chip ${unitComplete ? "is-complete" : ""} ${unitCurrent ? "is-current" : ""} ${unitFuture ? "is-future" : ""}" title="${unit.vocabularyIds.length} 單字 · ${unit.patternTarget} 句型目標">
                    <strong>${unit.order}</strong>
                    <span>${unit.vocabularyIds.length}詞</span>
                    ${unitComplete ? "<b>✓</b>" : unitCurrent ? "<b>現在</b>" : ""}
                  </div>`;
              }).join("")}
            </div>
          </section>`;
      }).join("")}
    </div>

    <section class="path-contract-note">
      <p class="eyebrow">CURRICULUM CONTRACT</p>
      <h2>發布後，Unit 不偷偷換內容。</h2>
      <p>Curriculum v1 固定單字順序與單元邊界。字典可以持續更新，但不會把既有學習進度重新洗牌；真正需要調整課綱時才發布新的 curriculum version。</p>
    </section>
  `;
}
