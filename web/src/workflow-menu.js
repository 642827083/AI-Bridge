export function createWorkflowMenu(host, options) {
  const doc = host.document, sites = { deepseek: 'DeepSeek', doubao: '豆包', gpt: 'GPT', gemini: 'Gemini' };
  let menu = null, anchor = null, requestId = '', snapshot = null, timer = null;
  function close(focus = false) {
    if (timer) host.clearTimeout(timer); timer = null;
    if (menu) menu.remove(); menu = null; requestId = ''; snapshot = null;
    if (anchor) { anchor.setAttribute('aria-expanded', 'false'); if (focus && anchor.isConnected) anchor.focus(); }
    anchor = null;
  }
  function current() { return menu && anchor?.isConnected && options.current(snapshot); }
  function position() {
    if (!current()) { close(); return; }
    const rect = anchor.getBoundingClientRect(), width = Math.min(240, Math.max(1, host.innerWidth - 16));
    if (menu.style.width !== width + 'px') menu.style.width = width + 'px';
    const height = menu.getBoundingClientRect().height;
    const left = Math.max(8, Math.min(rect.left, host.innerWidth - width - 8)) + 'px';
    const top = Math.max(8, Math.min(rect.top >= height + 16 ? rect.top - height - 8 : rect.bottom + 8, host.innerHeight - height - 8)) + 'px';
    if (menu.style.left !== left) menu.style.left = left;
    if (menu.style.top !== top) menu.style.top = top;
  }
  function line(text) {
    const label = doc.createElement('div'); label.textContent = text;
    label.style.cssText = 'padding:12px 10px;color:#6b7280;font-size:12px;line-height:1.6;'; menu.append(label);
  }
  function action(title, detail, callback) {
    const row = doc.createElement('button'); row.type = 'button'; row.setAttribute('role', 'menuitem');
    row.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:40px;text-align:left;padding:9px 10px;border:0;border-radius:7px;background:transparent;color:#212f6b;font:500 13px -apple-system,sans-serif;cursor:pointer;';
    const label = doc.createElement('span'); label.textContent = title; label.style.cssText = 'overflow-wrap:anywhere;'; row.append(label);
    if (detail) { const sub = doc.createElement('small'); sub.textContent = detail; sub.style.cssText = 'color:#8a8d98;font-size:10px;flex-shrink:0;'; row.append(sub); }
    row.addEventListener('mouseenter', () => { row.style.background = '#f1f4fa'; });
    row.addEventListener('mouseleave', () => { row.style.background = 'transparent'; });
    row.addEventListener('click', event => {
      if (!event.isTrusted || !current()) return;
      event.preventDefault(); event.stopPropagation(); callback();
    });
    menu.append(row);
  }
  function receive(id, payload) {
    if (id !== requestId || !current()) return false;
    if (timer) host.clearTimeout(timer); timer = null; menu.replaceChildren();
    if (payload?.error) line(payload.error);
    else {
      const items = Array.isArray(payload?.items) ? payload.items.filter(item => sites[item.site] && /^wf-[a-z0-9-]{1,120}$/.test(item.id) && typeof item.name === 'string').slice(0, 20) : [];
      if (!items.length) line('还没有工作流');
      for (const item of items) action(item.name, sites[item.site], () => { close(); options.navigate('workflow', 'id=' + encodeURIComponent(item.id)); });
    }
    const divider = doc.createElement('div'); divider.style.cssText = 'height:1px;background:#edf0f5;margin:5px 4px;'; menu.append(divider);
    action('工作流库', '›', () => { close(); options.navigate('workflow-library'); }); position();
    return true;
  }
  function toggle(event, button) {
    if (!event.isTrusted) return;
    event.preventDefault(); event.stopPropagation();
    if (menu) { close(); return; }
    snapshot = options.snapshot(); if (!snapshot) return;
    anchor = button; requestId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    menu = doc.createElement('div'); menu.id = 'aib-workflow-menu'; menu.setAttribute('role', 'menu'); menu.setAttribute('aria-label', '选择工作流');
    menu.style.cssText = 'position:fixed;z-index:2147483647;box-sizing:border-box;max-height: min(320px, calc(100vh - 16px));overflow:auto;padding:6px;background:#fff;border:1px solid #e4e7ef;border-radius:12px;box-shadow:0 8px 30px #17204624;font-family:-apple-system,sans-serif;';
    anchor.setAttribute('aria-expanded', 'true'); doc.body.append(menu); line('正在读取工作流…'); position();
    const pending = requestId;
    timer = host.setTimeout(() => receive(pending, { error: '读取超时，请重新展开工作流' }), 12000);
    options.navigate('workflows', 'request=' + requestId);
  }
  function outside(event) { if (menu && !menu.contains(event.target) && !anchor?.contains(event.target)) close(); }
  function key(event) {
    if (!menu) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); return; }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); event.stopPropagation();
    const rows = Array.from(menu.querySelectorAll('button')), index = rows.indexOf(doc.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? rows.length - 1 : (index + (event.key === 'ArrowUp' ? -1 : 1) + rows.length) % rows.length;
    rows[next]?.focus();
  }
  doc.addEventListener('pointerdown', outside, true); doc.addEventListener('keydown', key, true);
  host.addEventListener('resize', position); host.addEventListener('scroll', position, true);
  function disconnect() {
    close(); doc.removeEventListener('pointerdown', outside, true); doc.removeEventListener('keydown', key, true);
    host.removeEventListener('resize', position); host.removeEventListener('scroll', position, true);
  }
  return { toggle, receive, close, position, disconnect };
}
