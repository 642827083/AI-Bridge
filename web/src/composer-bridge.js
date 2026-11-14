import { createWorkflowMenu } from './workflow-menu.js';

export function createComposerBridge(host, adapter) {
  const doc = host.document, LIMIT = 15 * 1024 * 1024;
  let nonce = '', target = null, job = null, observer = null, timer = null, scheduled = null, button = null;
  let mountedEditor = null, mountedAnchor = null;
  let dock = null;
  let workflows = null;
  const uid = () => Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
  function origin() { return host.location.origin === adapter.origin; }
  function shown(element) {
    return element && element.isConnected && element.getClientRects().length > 0 && !element.closest('[hidden],[aria-hidden="true"]');
  }
  function visible(element) { return shown(element) && !element.disabled && element.getAttribute('aria-disabled') !== 'true'; }
  function editor() {
    if (!origin()) throw new Error('请先在面板内打开 ' + adapter.title + ' 官网');
    if (adapter.loginPath.test(host.location.pathname)) throw new Error('请先登录 ' + adapter.title);
    const selectors = adapter.editors;
    for (const selector of selectors) {
      const found = Array.from(doc.querySelectorAll(selector)).filter(visible).filter(item => !item.readOnly);
      if (found.length > 1) throw new Error('发现多个输入框，请关闭其他编辑区后重试');
      if (found.length === 1) return found[0];
    }
    throw new Error('未找到 ' + adapter.title + ' 输入框，请登录并等待页面加载完成');
  }
  function draft(element) {
    if (element.tagName === 'TEXTAREA') return element.value;
    return adapter.draftText ? adapter.draftText(element) : (element.innerText || element.textContent || '');
  }
  function scope(element) {
    if (adapter.scope) return adapter.scope(element);
    const form = element.closest('form');
    if (form) return form;
    // 只围绕对话输入区查找附件，避免误用页面其他上传入口。
    let root = element.parentElement;
    for (let depth = 0; root && root !== doc.body && depth < 5; depth++, root = root.parentElement) {
      if (root.querySelector('input[type="file"]')) return root;
    }
    return element.parentElement?.parentElement || element.parentElement;
  }
  function context() {
    if (job && !['error', 'cancelled', 'pasted', 'handed-off'].includes(job.status)) throw new Error('上一次上传仍在处理中');
    const element = editor();
    target = { id: uid(), href: host.location.href, element, draft: draft(element) };
    return { id: target.id, href: target.href };
  }
  function guard(snapshot, checkDraft = true) {
    if (!origin() || !target || snapshot.id !== target.id || snapshot.href !== target.href || host.location.href !== target.href) throw new Error('网页对话已切换，本次上传已停止');
    if (editor() !== target.element) throw new Error('网页输入框已变化，请重新上传');
    if (checkDraft && draft(target.element) !== target.draft) throw new Error('输入框草稿已变化，请重新点击上传');
    return target.element;
  }
  function prepare(snapshot, token, length) {
    guard(snapshot);
    if (typeof token !== 'string' || !token || !Number.isSafeInteger(length) || length < 4 || length > LIMIT) throw new Error('上传内容大小无效');
    job = { token, snapshot, length, chunks: [], offset: 0, status: 'receiving', message: '', delivery: 'none' };
    return true;
  }
  function append(token, offset, text) {
    if (!job || job.token !== token || job.status !== 'receiving') throw new Error('上传任务已失效');
    guard(job.snapshot);
    if (offset !== job.offset || typeof text !== 'string' || !text.length || text.length > 65536 || offset + text.length > job.length) throw new Error('上传分块不完整');
    job.chunks.push(text); job.offset += text.length; return true;
  }
  function fileInput(element, files) {
    const root = scope(element);
    let candidates = Array.from(root.querySelectorAll('input[type="file"]'));
    if (!candidates.length && !adapter.pasteFiles) candidates = Array.from(doc.querySelectorAll('input[type="file"]'));
    candidates = candidates.filter(input => !input.disabled && (!input.accept || input.accept.split(',').some(rule => /^(image\/(png|\*)|\.png|\*\/\*)$/i.test(rule.trim()))));
    if (candidates.length !== 1) {
      // GPT 的工作页面可能没有常驻附件控件，或同时存在多个入口，改走编辑器粘贴。
      if (adapter.pasteFiles) return null;
      throw new Error('请先点击 ' + adapter.title + ' 的附件按钮，再重试上传');
    }
    const input = candidates[0];
    if (input.files && input.files.length) throw new Error('网页附件控件仍有待处理文件，请检查附件后重试');
    if (files.length > 1 && !input.multiple) throw new Error('当前网页附件控件一次只接受一张图片，请减少卡片图片');
    return input;
  }
  function filesFrom(bundle) {
    if (!Array.isArray(bundle.files) || bundle.files.length > 5 || typeof bundle.text !== 'string' || bundle.text.length > 200000 || !bundle.text.trim() && !bundle.files.length) throw new Error('上传内容无效');
    let total = 0;
    return bundle.files.map(file => {
      if (!file || typeof file.name !== 'string' || file.name.length > 160 || file.type !== 'image/png' || typeof file.base64 !== 'string' || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(file.base64)) throw new Error('上传图片格式无效');
      const raw = host.atob(file.base64), bytes = new Uint8Array(raw.length);
      if (raw.length !== file.bytes || raw.length < 1) throw new Error('上传图片不完整');
      total += raw.length; if (total > 10 * 1024 * 1024) throw new Error('图片超过本插件大小上限');
      for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
      return new host.File([bytes], file.name, { type: file.type, lastModified: Date.now() });
    });
  }
  function insert(element, text) {
    if (!text) return;
    const before = draft(element), expected = before + (before ? '\n\n' : '') + text;
    element.focus();
    if (element.tagName === 'TEXTAREA') {
      const setter = Object.getOwnPropertyDescriptor(host.HTMLTextAreaElement.prototype, 'value').set;
      setter.call(element, expected);
      element.dispatchEvent(new host.Event('input', { bubbles: true }));
      element.setSelectionRange(expected.length, expected.length);
    } else {
      const selection = host.getSelection(), range = doc.createRange();
      range.selectNodeContents(element); range.collapse(false); selection.removeAllRanges(); selection.addRange(range);
      if (!doc.execCommand || !doc.execCommand('insertText', false, (before ? '\n\n' : '') + text)) {
        if (before) element.appendChild(doc.createTextNode('\n\n' + text));
        // 空 Quill 编辑器的占位段落不能和正文并存，否则会多出一个开头换行。
        else element.replaceChildren(doc.createTextNode(text));
      }
      element.dispatchEvent(new host.Event('input', { bubbles: true }));
    }
    if (draft(element).replace(/\r\n/g, '\n') !== expected.replace(/\r\n/g, '\n')) throw new Error('文字未能完整填入，请检查输入框，勿直接重复上传');
  }
  function commit(token) {
    if (!job || job.token !== token || job.status !== 'receiving') throw new Error('上传任务已结束');
    let dispatched = false;
    try {
      const element = guard(job.snapshot);
      if (job.offset !== job.length) throw new Error('上传内容不完整');
      const bundle = JSON.parse(job.chunks.join('')), files = filesFrom(bundle);
      // 先完整检查附件能力，再改动草稿，防止检查失败后反复追加文字。
      const input = files.length ? fileInput(element, files) : null;
      let transfer, paste;
      if (files.length) {
        if (typeof host.DataTransfer !== 'function') throw new Error('当前 WebView 不支持附件传入，请更新 MN');
        transfer = new host.DataTransfer(); files.forEach(file => transfer.items.add(file));
        if (!input) {
          if (typeof host.ClipboardEvent !== 'function') throw new Error('当前网页没有可用附件控件，且 WebView 不支持图片粘贴。请先点击 ' + adapter.title + ' 的附件按钮，再重试上传');
          paste = new host.ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true, composed: true });
          if (!paste.clipboardData || paste.clipboardData.files.length !== files.length) throw new Error('WebView 未能准备图片粘贴，尚未交付图片，请更新 MN 后重试');
        }
      }
      job.status = 'committing';
      if (input) {
        input.files = transfer.files;
        job.delivery = 'possible'; dispatched = true;
        input.dispatchEvent(new host.Event('change', { bubbles: true }));
      } else if (paste) {
        element.focus();
        guard(job.snapshot);
        job.delivery = 'possible'; dispatched = true;
        // 交给网页编辑器自己的图片处理流程；未确认接收时不补投其他入口，避免重复附件。
        element.dispatchEvent(paste);
        if (!paste.defaultPrevented) throw new Error(adapter.title + ' 未确认接收粘贴图片，请检查附件；若没有附件，请切换到聊天页或展开网站附件菜单后重试');
      }
      // 网页附件处理可能同步更换输入框，再核对一次，避免把文字填到其他对话。
      guard(job.snapshot);
      if (bundle.text) job.delivery = 'possible';
      insert(element, bundle.text);
      job.expectedText = bundle.text ? draft(element) : null;
      job.status = files.length ? 'handed-off' : 'pasted';
      job.delivery = job.status;
      job.message = files.length ? '图片已交给 ' + adapter.title + ' 处理，请检查附件上传状态后发送' : '文字已追加到 ' + adapter.title + ' 输入框，请检查后发送';
      return true;
    } catch (error) {
      job.status = 'error'; job.message = (dispatched ? '部分图片可能已加入附件，请先检查网页。' : '') + error.message;
      return false;
    } finally { if (job) job.chunks = []; }
  }
  function read(token) {
    if (!job || job.token !== token) return { status: 'cancelled', message: '上传任务已结束' };
    if (['pasted', 'handed-off'].includes(job.status)) {
      try {
        const element = guard(job.snapshot, false);
        if (job.expectedText !== null && draft(element) !== job.expectedText) throw new Error('网页文字已变化，请检查输入框，勿直接重复上传');
      } catch (error) { return { status: 'error', message: error.message, delivery: job.delivery }; }
    }
    return { status: job.status, message: job.message, delivery: job.delivery };
  }
  function cancel(token) {
    if (job && (!token || job.token === token)) { job.chunks = []; if (!['pasted', 'handed-off', 'error'].includes(job.status)) job.status = 'cancelled'; }
    return true;
  }
  function navigate(command, extra = '') {
    if (!nonce || !origin()) return;
    const address = 'aibridge://' + command + '?token=' + encodeURIComponent(nonce) + (extra ? '&' + extra : '');
    if (adapter.navigation === 'location') {
      // 原生 delegate 拦截后取消跳转，网页保持原位；不依赖网站允许创建子框架。
      host.location.href = address; return;
    }
    const frame = doc.createElement('iframe'); frame.hidden = true;
    frame.src = address; doc.body.appendChild(frame);
    host.setTimeout(() => frame.remove(), 500);
  }
  function request(event) { workflows?.toggle(event, button); }
  function positionButton() {
    if (!dock || !button) return;
    if (!shown(dock)) { button.remove(); workflows?.close(); return; }
    const rect = dock.getBoundingClientRect();
    const left = Math.max(4, Math.min(rect.right + 6, host.innerWidth - 36)) + 'px', top = (rect.top + (rect.height - 32) / 2) + 'px';
    if (button.style.left !== left) button.style.left = left;
    if (button.style.top !== top) button.style.top = top;
    workflows?.position();
  }
  function installButton() {
    if (!origin()) return;
    let element;
    try { element = editor(); } catch (error) { workflows?.close(); if (button) button.remove(); mountedEditor = null; mountedAnchor = null; return; }
    workflows?.position();
    const placement = adapter.placement(element, { doc, shown });
    const anchor = placement && placement.anchor, position = placement && placement.position || 'afterend';
    if (!anchor) {
      // 原控件仍在当前编辑器中时保留位置，避免短暂测量或标签收起使上传闪退。
      if (button && mountedEditor === element && shown(mountedAnchor) && button.parentElement === mountedAnchor.parentElement) return;
      if (button) button.remove(); mountedEditor = null; mountedAnchor = null; return;
    }
    if (button && placement.dock && dock === placement.dock && button.parentElement === doc.body) {
      mountedEditor = element; mountedAnchor = anchor; positionButton(); return;
    }
    if (button && !placement.dock && !dock && (position === 'beforebegin' ? button.nextElementSibling : button.previousElementSibling) === anchor && button.parentElement === anchor.parentElement) {
      mountedEditor = element; mountedAnchor = anchor; return;
    }
    if (!button) {
      button = doc.createElement('button'); button.id = 'aib-upload-button'; button.type = 'button';
      button.title = '选择工作流'; button.setAttribute('aria-label', '选择工作流'); button.setAttribute('aria-haspopup', 'menu'); button.setAttribute('aria-expanded', 'false');
      button.style.cssText = 'display:inline-flex;flex-direction:column;justify-content:center;align-items:center;align-self:center;gap:4px;flex:0 0 auto;box-sizing:border-box;width:32px;height:32px;min-width:32px;padding:7px;margin:0 8px;border:0;border-radius:50%;background:transparent;color:#444746;min-height:32px;cursor:pointer;';
      if (adapter.workflowButtonStyle) button.style.cssText += adapter.workflowButtonStyle;
      for (let i = 0; i < 3; i++) { const line = doc.createElement('span'); line.style.cssText = 'display:block;width:18px;height:2px;min-height:2px;flex-shrink:0;border-radius:1px;background:currentColor;pointer-events:none;'; button.append(line); }
      button.addEventListener('click', request);
    }
    anchor.insertAdjacentElement(position, button);
    dock = placement.dock || null;
    button.style.position = dock ? 'fixed' : ''; button.style.zIndex = dock ? '10' : '';
    button.style.margin = dock ? '0' : '0 8px';
    if (!dock) { button.style.left = ''; button.style.top = ''; }
    positionButton();
    mountedEditor = element; mountedAnchor = anchor;
  }
  function disconnect() {
    host.removeEventListener('pagehide', disconnect);
    host.removeEventListener('resize', positionButton); host.removeEventListener('scroll', positionButton, true);
    if (observer) observer.disconnect(); if (timer) host.clearInterval(timer); if (scheduled) host.clearTimeout(scheduled);
    observer = null; timer = null; scheduled = null; nonce = ''; target = null; cancel();
    workflows?.disconnect(); workflows = null;
    if (button) button.remove(); button = null;
    mountedEditor = null; mountedAnchor = null; dock = null;
  }
  function connect(token) {
    disconnect(); if (!origin() || typeof token !== 'string') return false; nonce = token;
    workflows = createWorkflowMenu(host, { navigate, snapshot() { try { return { href: host.location.href, element: editor() }; } catch { return null; } }, current(snapshot) { try { return !!nonce && snapshot && snapshot.href === host.location.href && snapshot.element === editor(); } catch { return false; } } });
    host.addEventListener('pagehide', disconnect);
    host.addEventListener('resize', positionButton); host.addEventListener('scroll', positionButton, true);
    installButton();
    if (host.MutationObserver) {
      observer = new host.MutationObserver(() => {
        if (!scheduled) scheduled = host.setTimeout(() => { scheduled = null; installButton(); }, 120);
      });
      observer.observe(doc.body, { childList: true, characterData: true, subtree: true, attributes: true,
        attributeFilter: ['class', 'style', 'hidden', 'aria-label', 'title', 'aria-disabled'] });
    }
    timer = host.setInterval(() => {
      if (job && ['receiving', 'committing'].includes(job.status) && target && host.location.href !== target.href) cancel(job.token);
      installButton();
    }, 1000);
    return true;
  }
  return { connect, disconnect, context, prepare, append, commit, read, cancel, workflowMenu: (id, payload) => workflows?.receive(id, payload) || false };
}
