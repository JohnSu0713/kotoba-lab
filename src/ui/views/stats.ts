import type { AppContext } from '../../app/context.js';

export async function renderStats(root: HTMLElement, context: AppContext): Promise<void> {
  const reviews = await context.repository.getAllReviews();
  const totalReps = reviews.reduce((sum, record) => sum + record.reps, 0);
  const totalLapses = reviews.reduce((sum, record) => sum + record.lapses, 0);
  const mastered = reviews.filter((record) => record.intervalDays >= 21).length;
  const uniqueItems = new Set(reviews.map((record) => record.itemId)).size;
  const byMode = new Map<string, number>();
  for (const record of reviews) byMode.set(record.modeId, (byMode.get(record.modeId) ?? 0) + 1);

  root.innerHTML = `
    <section class="page-header"><p class="eyebrow">PROGRESS</p><h1>學習統計</h1><p>先保持簡單：看真正有用的記憶數據。</p></section>
    <section class="metric-grid">
      <div class="metric"><strong>${uniqueItems}</strong><span>已開始項目</span></div>
      <div class="metric"><strong>${totalReps}</strong><span>累積複習</span></div>
      <div class="metric"><strong>${mastered}</strong><span>長期項目 ≥ 21天</span></div>
      <div class="metric"><strong>${totalLapses}</strong><span>忘記次數</span></div>
    </section>
    <section class="section">
      <div class="section-heading"><div><p class="eyebrow">BY MODE</p><h2>各練習模式</h2></div></div>
      <div class="simple-list">
        ${[...byMode.entries()].length ? [...byMode.entries()].map(([modeId, count]) => `<div><span>${context.modes.get(modeId).title}</span><strong>${count}</strong></div>`).join('') : '<p class="quiet">還沒有學習紀錄。</p>'}
      </div>
    </section>`;
}
