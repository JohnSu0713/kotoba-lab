import type { AppContext } from "../../app/context.js";
import {
  activitySummary,
  recentDays,
} from "../../features/progress/activity.js";
import { escapeHtml as esc } from "../html.js";
import { studyHref } from "../router.js";
export async function renderStats(
  root: HTMLElement,
  context: AppContext,
): Promise<void> {
  const [reviews, activities, notebook] = await Promise.all([
    context.repository.getAllReviews(),
    context.repository.getActivities(),
    context.repository.getNotebook(),
  ]);
  const summary = activitySummary(activities),
    days = recentDays(84);
  const totalReps = reviews.reduce((sum, r) => sum + r.reps, 0);
  const totalLapses = reviews.reduce((sum, r) => sum + r.lapses, 0);
  const mastered = new Set(
    reviews.filter((r) => r.intervalDays >= 21).map((r) => r.itemId),
  ).size;
  const byMode = new Map<string, number>();
  for (const r of reviews)
    byMode.set(r.modeId, (byMode.get(r.modeId) ?? 0) + r.reps);
  const modeTitle = (id: string) =>
    context.modes.list().find((m) => m.id === id)?.title ?? id;
  const weak = [...reviews]
    .filter((r) => r.lapses > 0)
    .sort(
      (a, b) => b.lapses / Math.max(1, b.reps) - a.lapses / Math.max(1, a.reps),
    )
    .slice(0, 8);
  root.innerHTML = `<section class="page-header"><p class="eyebrow">YOUR QUIET PROGRESS</p><h1>每一次回想，都算數。</h1><p>看見累積，也給難記的地方一點耐心。</p></section><section class="metric-grid"><div class="metric"><strong>${summary.streak}<small> 天</small></strong><span>連續練習</span></div><div class="metric"><strong>${summary.today}<small> / ${notebook.dailyGoal}</small></strong><span>今日練習</span></div><div class="metric"><strong>${totalReps}</strong><span>累積詞卡作答</span></div><div class="metric"><strong>${mastered}</strong><span>至少一種模式間隔 ≥ 21 天的項目</span></div></section>
    <section class="section activity-panel learning-card"><div class="section-heading"><div><p class="eyebrow">PAST 12 WEEKS</p><h2>練習的痕跡</h2></div><span class="quiet">${summary.counts.size} 個有紀錄的日子</span></div><div class="activity-grid" aria-label="過去十二週每日練習題數">${days
      .map((d) => {
        const count = summary.counts.get(d) ?? 0;
        return `<div class="activity-cell intensity-${count === 0 ? 0 : count < 5 ? 1 : count < 15 ? 2 : 3}" tabindex="0" aria-label="${d}：${count} 題" data-label="${d} · ${count} 題"></div>`;
      })
      .join(
        "",
      )}</div><div class="activity-caption"><span>${days[0]} — ${days.at(-1)}</span><span>淡 → 深：練習較少 → 較多</span></div><p class="quiet">每日紀錄從這次更新後開始累積；既有詞卡複習次數完整保留。口說標記為自行確認，不代表發音評分。</p></section>
    <div class="stats-columns"><section class="section"><div class="section-heading"><div><p class="eyebrow">GIVE IT ANOTHER LOOK</p><h2>需要多見幾次</h2></div><a class="quiet-link" href="${studyHref("daily-mixed", { strategy: "weak" })}">集中複習 →</a></div><div class="simple-list">${
      weak.length
        ? weak
            .map((r) => {
              const item = context.content.getById(r.itemId);
              return `<div><span><strong lang="ja">${esc(item?.kind === "kana" ? item.kana : item?.kind === "vocabulary" ? item.expression : r.itemId)}</strong><small class="list-sub">${esc(modeTitle(r.modeId))}</small></span><span>${r.lapses} 次忘記 / ${r.reps} 次作答</span></div>`;
            })
            .join("")
        : '<p class="quiet">還沒有弱項紀錄，完成一組練習再來看看。</p>'
    }</div></section><section class="section"><div class="section-heading"><div><p class="eyebrow">BY PRACTICE</p><h2>不同路徑的累積</h2></div></div><div class="simple-list">${byMode.size ? [...byMode].map(([id, count]) => `<div><span>${esc(modeTitle(id))}</span><strong>${count} 次</strong></div>`).join("") : '<p class="quiet">每一種練習，都從第一次開始。</p>'}</div><p class="quiet">詞卡共 ${totalLapses} 次標記忘記。這是複習的線索，不是考試成績。</p></section></div>`;
}
