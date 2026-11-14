import { createComposerBridge } from './composer-bridge.js';
import { readBlockDraft } from './rich-text.js';

export function createGeminiBridge(host = window) {
  const CONTROL = 'button,[role="button"]';
  function names(control) { return [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent].filter(Boolean).map(value => value.replace(/\s+/g, ' ').trim()); }
  function find(root, pattern, shown) {
    const controls = Array.from(root.querySelectorAll(CONTROL)).filter(control => control.id !== 'aib-upload-button' && shown(control) && names(control).some(value => pattern.test(value)));
    return controls.length === 1 ? controls[0] : null;
  }
  function attachment(root, shown) {
    // 先认附件组件，再认按钮名称；不依赖图标是否有可见文字或使用哪种语言。
    const selectors = 'simplified-input-menu button,simplified-input-menu [role="button"],button[data-test-id="upload-menu-button"],button[data-testid="upload-menu-button"]';
    const exact = Array.from(root.querySelectorAll(selectors)).filter(shown).filter(control => control.id !== 'aib-upload-button');
    if (exact.length === 1) return exact[0];
    return find(root, /^(?:[+＋]|add|上传(?:和工具|文件|图片)?|添加(?:文件|图片|附件)(?:和工具)?|附件(?:和工具)?|upload(?: files| and tools)?|open upload(?: file)? menu|add files(?: and more)?|attach(?: files|ments)?)$/i, shown);
  }
  return createComposerBridge(host, {
    title: 'Gemini', origin: 'https://gemini.google.com', loginPath: /\/(?:signin|login|auth)(?:\/|$)/,
    navigation: 'location', pasteFiles: true, buttonLabel: 'MN 上传', draftText: readBlockDraft,
    workflowButtonStyle: 'background:transparent;color:var(--gem-sys-color--on-surface,#444746);border-radius:50%;min-height:32px;',
    editors: ['rich-textarea .ql-editor[contenteditable="true"]', 'rich-textarea [contenteditable="true"][role="textbox"]',
      'input-container [contenteditable="true"][role="textbox"]', 'input-container textarea', 'main textarea'],
    scope(element) { return element.closest('input-area-v2,input-area-v3,input-container,.input-area,form') || element.parentElement?.parentElement || element.parentElement; },
    placement(element, { doc, shown }) {
      // 使用整个输入容器，附件栏可能在 input-area 的外面，与编辑器平级。
      const boundary = element.closest('input-container') || element.closest('form') || element.closest('main') || element.closest('input-area-v2,input-area-v3,.input-area');
      for (let root = element.parentElement; root && root !== doc.body; root = root.parentElement) {
        const upload = attachment(root, shown);
        if (upload) {
          const icon = upload.querySelector('mat-icon,svg,[data-mat-icon-name="add"]');
          // 按钮触摸区域过宽时按可见加号定位，不跟随整行的空白宽度。
          const dock = upload.getBoundingClientRect().width > 64 && shown(icon) && icon.getBoundingClientRect().width > 0 ? icon : upload;
          return { anchor: doc.body, position: 'beforeend', dock };
        }
        if (root === boundary) break;
      }
      // 未找到附件按钮时等待控件出现，不把入口放到编辑器中央。
      return null;
    }
  });
}

if (typeof window !== 'undefined') {
  if (window.__AIB_GEMINI__) window.__AIB_GEMINI__.disconnect();
  window.__AIB_GEMINI__ = createGeminiBridge(window);
}
