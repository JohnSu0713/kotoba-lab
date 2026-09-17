import type { AppContext } from '../../app/context.js';
import type { BackupSnapshot, KanaGroup } from '../../domain/models.js';
import { downloadBackup } from '../../features/backup/download.js';
import { appearance, type Appearance } from '../theme/appearance.js';

const groups: Array<{ id: KanaGroup; label: string }> = [
  { id: 'gojuon', label: '基本五十音' },
  { id: 'dakuten', label: '濁音' },
  { id: 'handakuten', label: '半濁音' },
  { id: 'yoon', label: '拗音' },
];

const appearances: Array<{ id: Appearance; label: string; note: string }> = [
  { id: 'system', label: '跟隨系統', note: '自動配合裝置外觀' },
  { id: 'light', label: '亮色', note: '柔和紙張色調' },
  { id: 'dark', label: '暗色', note: '夜間低亮度閱讀' },
];

export async function renderSettings(root: HTMLElement, context: AppContext): Promise<void> {
  const settings = await context.repository.getSettings();
  root.innerHTML = `
    <section class="page-header compact"><p class="eyebrow">SETTINGS</p><h1>設定</h1><p>只保留真正會影響學習節奏的控制。</p></section>

    <section class="settings-section">
      <div class="section-heading"><div><p class="eyebrow">APPEARANCE</p><h2>外觀</h2></div></div>
      <div class="segmented appearance-picker" role="radiogroup" aria-label="外觀模式">
        ${appearances.map((option) => `<button type="button" data-appearance="${option.id}" class="${appearance.get() === option.id ? 'selected' : ''}"><strong>${option.label}</strong><small>${option.note}</small></button>`).join('')}
      </div>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><p class="eyebrow">PACE</p><h2>學習節奏</h2></div></div>
      <form id="settings-form" class="settings-form">
        <label><span><strong>每天新項目</strong><small>建議先從 10–15 開始</small></span><input name="dailyNew" type="number" min="1" max="100" value="${settings.dailyNew}"></label>
        <label><span><strong>單次 session 上限</strong><small>到期複習優先，再加入新內容</small></span><input name="sessionSize" type="number" min="5" max="200" value="${settings.sessionSize}"></label>
        <label class="toggle-row"><span><strong>作答後自動發音</strong><small>每次作答後唸出正確日文；支援的裝置也會提供輕微震動回饋</small></span><input name="speakAnswers" type="checkbox" ${settings.speakAnswers ? 'checked' : ''}></label>
        <fieldset><legend>進階假名範圍</legend>${groups.map((group) => `<label class="check-row"><input type="checkbox" name="kanaGroup" value="${group.id}" ${settings.enabledKanaGroups.includes(group.id) ? 'checked' : ''}><span>${group.label}</span></label>`).join('')}</fieldset>
        <div class="form-footer"><button class="primary-button" type="submit">儲存學習設定</button><span id="save-status" class="save-status"></span></div>
      </form>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><p class="eyebrow">LOCAL-FIRST</p><h2>資料</h2></div></div>
      <div class="learning-card data-card"><div><strong>目前只存在這台裝置</strong><p>學習紀錄存於 IndexedDB，不需要帳號。先保持簡單，之後再以 repository adapter 加入跨裝置同步。</p></div><div class="backup-actions"><button id="export-backup" class="secondary-button">匯出 JSON</button><label class="secondary-button file-button">匯入 JSON<input id="import-backup" type="file" accept="application/json"></label></div><p id="import-status" class="save-status"></p></div>
    </section>

    <section class="settings-section">
      <div class="section-heading"><div><p class="eyebrow">SOURCES</p><h2>詞庫來源</h2></div></div>
      <div class="learning-card data-card source-card">
        <div><strong>JLPT N5 → N1 · 7,777 詞</strong><p>詞形與讀音以 JMdict（EDRDG）為基礎，繁體中文釋義使用 Tomoshi Open Data 的 zh-TW 層；JLPT N5–N1 標籤源自 Jonathan Waller lineage，屬社群估計而非 JLPT 官方公布清單。</p></div>
        <p><a href="https://github.com/tomoshi-app/tomoshi-dict-data" target="_blank" rel="noreferrer">Tomoshi Open Data</a> · <a href="https://www.edrdg.org/" target="_blank" rel="noreferrer">EDRDG / JMdict</a> · CC BY-SA 4.0</p>
      </div>
    </section>`;

  root.querySelectorAll<HTMLButtonElement>('[data-appearance]').forEach((button) => {
    button.addEventListener('click', () => {
      appearance.set(button.dataset.appearance as Appearance);
      window.dispatchEvent(new CustomEvent('kotoba:rerender'));
    });
  });

  const form = root.querySelector<HTMLFormElement>('#settings-form');
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const enabledKanaGroups = data.getAll('kanaGroup') as KanaGroup[];
    await context.repository.putSettings({
      dailyNew: Number(data.get('dailyNew')),
      sessionSize: Number(data.get('sessionSize')),
      speakAnswers: data.get('speakAnswers') === 'on',
      enabledKanaGroups,
    });
    const status = root.querySelector('#save-status');
    if (status) status.textContent = '已儲存';
  });

  root.querySelector('#export-backup')?.addEventListener('click', async () => {
    downloadBackup(await context.repository.exportSnapshot());
  });

  root.querySelector<HTMLInputElement>('#import-backup')?.addEventListener('change', async (event) => {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    const status = root.querySelector('#import-status');
    try {
      const snapshot = JSON.parse(await file.text()) as BackupSnapshot;
      await context.repository.importSnapshot(snapshot);
      if (status) status.textContent = '備份已匯入。';
    } catch (error) {
      if (status) status.textContent = `匯入失敗：${error instanceof Error ? error.message : '未知錯誤'}`;
    }
  });
}
