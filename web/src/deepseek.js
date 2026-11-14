import { createComposerBridge } from './composer-bridge.js';
export function createDeepSeekBridge(host = window) {
  const CONTROL_SELECTOR = 'button,[role="button"],.ds-button,.ds-toggle-button,[aria-pressed],[tabindex]';
  const SEARCH_NAME = /^(智能搜索|联网搜索|搜索|search|websearch)$/;
  function normalizeName(value) { return String(value || '').replace(/\s+/g, '').toLowerCase(); }
  function searchName(control) {
    // 说明文字、图标标题和辅助标签不能遮盖可见的搜索名称。
    const names = [control.getAttribute('aria-label'), control.getAttribute('title'), control.innerText, control.textContent];
    for (const label of control.querySelectorAll('span')) names.push(label.textContent);
    return names.some(name => SEARCH_NAME.test(normalizeName(name)));
  }
  function findSearch(root, element, shown) {
    let controls = Array.from(root.querySelectorAll(CONTROL_SELECTOR)).filter(control => shown(control) && !control.contains(element) && searchName(control));
    if (!controls.length) {
      // 部分版本没有按钮角色或稳定类名，按短标签找到它所在的实际控件。
      for (const label of root.querySelectorAll('span,div')) {
        if (!SEARCH_NAME.test(normalizeName(label.textContent)) || label.contains(element) || label.closest('svg,[role="tooltip"]')) continue;
        const control = label.closest(CONTROL_SELECTOR) || (label.tagName === 'DIV' ? label : label.closest('div'));
        if (control && root.contains(control) && !control.contains(element) && shown(control)) controls.push(control);
      }
    }
    controls = Array.from(new Set(controls));
    const targets = controls.filter(control => !controls.some(other => other !== control && control.contains(other)));
    return targets.length === 1 ? targets[0] : null;
  }
  return createComposerBridge(host, {
    title: 'DeepSeek', origin: 'https://chat.deepseek.com', loginPath: /\/(sign_in|login|sign_up)(\/|$)/,
    buttonLabel: 'MN 上传',
    buttonStyle: 'color:#262626;border-color:rgba(0,0,0,.14);',
    editors: ['textarea#chat-input', 'textarea[placeholder*="DeepSeek"]', 'textarea[placeholder*="发送"]',
      'textarea[placeholder*="Message"]', '[contenteditable="true"][role="textbox"]', 'main textarea'],
    placement(element, { doc, shown }) {
      for (let root = element.parentElement; root && root !== doc.body; root = root.parentElement) {
        const anchor = findSearch(root, element, shown);
        if (anchor) return { anchor };
        if (root.tagName === 'FORM') break;
      }
      return null;
    }
  });
}
if (typeof window !== 'undefined') {
  if (window.__AIB_DEEPSEEK__) window.__AIB_DEEPSEEK__.disconnect();
  window.__AIB_DEEPSEEK__ = createDeepSeekBridge(window);
}
