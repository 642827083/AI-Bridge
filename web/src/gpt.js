import { createComposerBridge } from './composer-bridge.js';

export function createGPTBridge(host = window) {
  const CONTROL = 'button,[role="button"],[role="combobox"]';
  function controls(root, shown) {
    return Array.from(root.querySelectorAll(CONTROL)).filter(control => control.id !== 'aib-upload-button' && shown(control));
  }
  function name(control) {
    return [control.getAttribute('aria-label'), control.getAttribute('title'), control.textContent]
      .concat(Array.from(control.querySelectorAll('span'), label => label.textContent))
      .filter(Boolean).map(value => value.replace(/\s+/g, ' ').trim().replace(/[⌄▾▼⌃]+$/, '').trim());
  }
  function find(root, selector, pattern, shown) {
    const exact = Array.from(new Set(Array.from(root.querySelectorAll(selector), element => element.closest(CONTROL) || element))).filter(shown);
    if (exact.length === 1) return exact[0];
    const named = controls(root, shown).filter(control => name(control).some(value => pattern.test(value)));
    return named.length === 1 ? named[0] : null;
  }
  function placement(control, position, element, doc, shown) {
    // 按钮可能装在定宽的图标容器里，将插件按钮放到共同工具行，避免被裁切。
    let anchor = control;
    for (let root = control.parentElement; root && root !== doc.body && !root.contains(element); root = root.parentElement) {
      if (controls(root, shown).some(other => !anchor.contains(other) && !other.contains(anchor))) return { anchor, position };
      anchor = root;
    }
    return { anchor: control, position };
  }
  return createComposerBridge(host, {
    title: 'ChatGPT', origin: 'https://chatgpt.com', loginPath: /\/(auth|login|signup)(\/|$)/,
    navigation: 'location',
    buttonLabel: 'MN 上传',
    pasteFiles: true,
    buttonStyle: 'color:var(--text-primary,inherit);border-color:var(--border-light,rgba(128,128,128,.35));margin-left:8px;margin-right:8px;',
    editors: ['#prompt-textarea[contenteditable="true"]', 'textarea#prompt-textarea',
      'form [contenteditable="true"][role="textbox"]', 'form .ProseMirror[contenteditable="true"]',
      'form textarea[data-id="root"]', 'form textarea[name="prompt-textarea"]', '#thread-bottom textarea'],
    placement(element, { doc, shown }) {
      const roots = [];
      for (let root = element.parentElement; root && root !== doc.body; root = root.parentElement) {
        roots.push(root); if (root.tagName === 'FORM') break;
      }
      // 只在当前输入区内寻找附件或发送控件，不匹配侧栏和历史消息的按钮。
      for (const root of roots) {
        const plus = find(root, '#composer-plus-btn,[data-testid="composer-plus-btn"],[data-testid="attach-file-button"]',
          /^(?:[+＋]|添加(?:照片|图片|文件|附件).{0,20}|上传(?:图片|文件)|附件|附加文件|add (?:photos|files|attachments).{0,40}|attach(?: files|ments)?)$/i, shown);
        if (plus) return placement(plus, 'afterend', element, doc, shown);
        const send = find(root, '#composer-submit-button,button[data-testid="send-button"],button[data-testid="composer-send-button"],button[type="submit"]',
          /^(?:发送(?:消息)?|send(?: message| prompt)?|提交|submit(?: prompt)?)$/i, shown);
        if (send) return placement(send, 'beforebegin', element, doc, shown);
        if (root.tagName === 'FORM') break;
      }
      // 网页工具尚未出现或标识改变时，仍在已确认的聊天输入框旁提供插件入口。
      return { anchor: element, position: 'afterend' };
    }
  });
}

if (typeof window !== 'undefined') {
  if (window.__AIB_GPT__) window.__AIB_GPT__.disconnect();
  window.__AIB_GPT__ = createGPTBridge(window);
}
