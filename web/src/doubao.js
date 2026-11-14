import { createComposerBridge } from './composer-bridge.js';

import { readBlockDraft as doubaoDraftText } from './rich-text.js';
export { doubaoDraftText };

export function createDoubaoBridge(host = window) {
  const CONTROL = 'button,[role="button"],[role="combobox"]';
  function unique(root, selector, shown) {
    const found = Array.from(root.querySelectorAll(selector)).filter(shown);
    return found.length === 1 ? found[0] : null;
  }
  function placement(control, element, doc, shown, position = 'afterend') {
    // 原附件按钮在固定宽度的图标壳内，上传放在它所在的工具行，避免裁切。
    let anchor = control;
    for (let root = control.parentElement; root && root !== doc.body && !root.contains(element); root = root.parentElement) {
      const others = Array.from(root.querySelectorAll(CONTROL)).filter(item => item.id !== 'aib-upload-button' && shown(item));
      if (others.some(item => !anchor.contains(item) && !item.contains(anchor))) return { anchor, position };
      anchor = root;
    }
    return { anchor: control, position };
  }
  return createComposerBridge(host, {
    title: '豆包', origin: 'https://www.doubao.com', loginPath: /\/(login|signin|passport)(\/|$)/,
    navigation: 'location', pasteFiles: true,
    draftText: doubaoDraftText,
    buttonLabel: 'MN 上传',
    buttonStyle: 'color:var(--dbx-text-primary,inherit);border-color:var(--dbx-line-10,rgba(128,128,128,.3));margin-left:8px;margin-right:8px;min-width:76px;',
    editors: ['#input-engine-container .ProseMirror[contenteditable="true"]',
      '#input-engine-container [contenteditable="true"]', '#input-engine-container textarea',
      'textarea[data-testid="chat_input_input"]', 'textarea#chat-input-textarea',
      '[data-testid="chat_input_input"][contenteditable="true"]', '[data-testid="chat_input"] textarea'],
    placement(element, { doc, shown }) {
      const root = element.closest('#input-engine-container,[data-testid="chat_input"],form') || element.parentElement?.parentElement;
      if (!root) return null;
      // 工作模式左侧为会收缩的云电脑、技能区，优先在右侧模型组之前提供独立位置。
      const model = unique(root, '[data-testid="chat_input_action_model"]', shown);
      if (model) return placement(model, element, doc, shown, 'beforebegin');
      const upload = unique(root, '[data-testid="upload_file_button"],[data-testid="upload-file-button"]', shown);
      if (upload) return placement(upload, element, doc, shown);
      const named = Array.from(root.querySelectorAll(CONTROL)).filter(shown).filter(control =>
        control.id !== 'aib-upload-button' && [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent]
          .some(text => /^(?:上传(?:文件|图片)?|添加附件|附件|添加文件|attach(?: files)?|upload(?: files)?)$/i.test((text || '').trim())));
      if (named.length === 1) return placement(named[0], element, doc, shown);
      return { anchor: element, position: 'afterend' };
    }
  });
}

if (typeof window !== 'undefined') {
  if (window.__AIB_DOUBAO__) window.__AIB_DOUBAO__.disconnect();
  window.__AIB_DOUBAO__ = createDoubaoBridge(window);
}
