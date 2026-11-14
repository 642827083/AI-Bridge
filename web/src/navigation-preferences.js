import { MNBridge } from './lib/mnBridge.js';

export async function setupNavigationPreferences() {
  const fields = document.getElementById('navigation-fields');
  const boxes = Array.from(fields.querySelectorAll('input[value]'));
  const status = document.getElementById('navigation-status');
  let saved = [];
  function render(sites) {
    for (const box of boxes) {
      box.checked = sites.includes(box.value);
      box.disabled = sites.length === 1 && box.checked;
    }
  }
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  try {
    const value = await MNBridge.send('getNavigation');
    saved = value.sites; render(saved); fields.disabled = false; message('');
  } catch (error) { message(error.message, true); }
  fields.addEventListener('change', async () => {
    if (fields.disabled) return;
    const sites = boxes.filter(box => box.checked).map(box => box.value);
    if (!sites.length) { render(saved); message('至少保留一个网页', true); return; }
    fields.disabled = true; message('正在保存…');
    try {
      const value = await MNBridge.send('saveNavigation', { sites });
      saved = value.sites; render(saved); message('导航栏已保存');
    } catch (error) { render(saved); message(error.message, true); }
    finally { fields.disabled = false; }
  });
}
