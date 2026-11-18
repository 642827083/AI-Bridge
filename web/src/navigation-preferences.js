import { MNBridge } from './lib/mnBridge.js';

// 顶部导航只列 AI 网站，勾选结果即时保存。
export async function setupNavigationPreferences() {
  const fields = document.getElementById('navigation-fields');
  const boxes = Array.from(fields.querySelectorAll('input[value]'));
  const status = document.getElementById('navigation-status');
  const trigger = document.getElementById('navigation-open');
  const dialog = document.getElementById('navigation-dialog');
  const mask = document.getElementById('navigation-dialog-mask');
  const cancel = document.getElementById('navigation-dialog-cancel');
  let saved = [];
  function render(sites) {
    for (const box of boxes) {
      box.checked = sites.includes(box.value);
      // 只剩一个网页时锁定，避免用户取消后再也点不回来。
      box.disabled = sites.length === 1 && box.checked;
    }
  }
  function message(text, error = false) { status.textContent = text; status.dataset.error = String(error); }
  function open() {
    dialog.hidden = false; trigger.setAttribute('aria-expanded', 'true');
    const target = boxes.find(box => box.checked && !box.disabled) || cancel;
    target.focus();
  }
  function close() {
    if (dialog.hidden) return;
    dialog.hidden = true; trigger.setAttribute('aria-expanded', 'false');
    trigger.focus();
  }
  trigger.addEventListener('click', open);
  cancel.addEventListener('click', close);
  mask.addEventListener('click', close);
  dialog.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); close(); } });
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
      saved = value.sites; render(saved); message('');
    } catch (error) { render(saved); message(error.message, true); }
    finally { fields.disabled = false; }
  });
}
