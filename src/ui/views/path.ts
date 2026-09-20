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

  const currentOrder = snapshot.foundationDone ? (snapshot.currentUnit?.order ?? 101) : 0;
  const currentHref = !snapshot.foundationDone
    ? studyHref("kana-recognition", { scope: "basic", limit: "15", path: "foundation" })
    : snapshot.currentUnit && snapshot.currentLesson
      ? studyHref("vocab-flashcard", {
          path: "1",
          pathUnit: String(snapshot.currentUnit.order),
          pathLesson: String(snapshot.currentLesson.order),
          limit: "16",
        })
      : "#/lyrics";

  root.innerHTML = `
    <section class="path-map-header">
      <a class="quiet-link" href="#/">← 回到今日</a>
      <p class="eyebrow">KOTOBA PATH</p>
      <h1>Foundation + 100 Units</h1>
      <p>Curriculum v2 將 ${TOTAL_VOCABULARY_TARGET.toLocaleString()} 個單字依生活與語義主題重新組織；${TOTAL_PATTERN_TARGET} 個句型目標會沿著同一條路徑逐級展開。</p>
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
                  <div class="path-unit-chip ${unitComplete ? "is-complete" : ""} ${unitCurrent ? "is-current" : ""} ${unitFuture ? "is-future" : ""}" title="${unit.topicFocus}">
                    <div class="path-unit-chip-top"><strong>Unit ${unit.order}</strong>${unitComplete ? "<b>✓</b>" : unitCurrent ? "<b>現在</b>" : ""}</div>
                    <span class="path-unit-topic">${unit.topicTitle}</span>
                    <small>${unit.vocabularyIds.length} 單字 · ${unit.patternTarget} 句型目標</small>
                  </div>`;
              }).join("")}
            </div>
          </section>`;
      }).join("")}
    </div>

    <section class="path-contract-note">
      <p class="eyebrow">CURRICULUM CONTRACT</p>
      <h2>Curriculum v2：主題先行，版本化調整。</h2>
      <p>這次主題化是一次正式 curriculum revision，所以版本提升到 v2。之後字典資料仍可更新，但若要重新分配 Unit，必須再提升 curriculum version，不會無聲改變學習路徑。</p>
    </section>
  `;
}
