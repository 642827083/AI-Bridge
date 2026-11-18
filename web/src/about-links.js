import { MNBridge } from './lib/mnBridge.js';

export function setupAboutLinks() {
  const status = document.getElementById('about-status');
  const rows = Array.from(document.querySelectorAll('.about-row[data-url]'));
  function message(text) { status.textContent = text; status.hidden = !text; }
  for (const row of rows) {
    row.addEventListener('click', async () => {
      if (row.dataset.busy === 'true') return;
      // 跳转交给原生打开，网页内不做 window.open，避免被 WebView 拦截。
      row.dataset.busy = 'true'; message('');
      try { await MNBridge.send('openURL', { url: row.dataset.url }); }
      catch (error) { message(String(error.message || error)); }
      finally { delete row.dataset.busy; }
    });
  }
}
