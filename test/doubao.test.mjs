import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDoubaoBridge } from '../web/src/doubao.js';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const file = () => ({ name: '卡片图片.png', type: 'image/png', base64: PNG, bytes: Buffer.from(PNG, 'base64').length });
// 对应实际网页的输入引擎、固定宽度附件壳与 Tiptap 编辑器结构。
const HTML = '<div id="input-engine-container" aria-label="doc_editor"><div class="tools"><div class="narrow" style="width:36px"><button type="button" data-testid="upload_file_button">+</button></div><div><button type="button" data-testid="chat_input_action_mode">对话</button></div><div><button type="button" data-testid="chat_input_action_model">快速</button></div></div><div><div class="tiptap ProseMirror" contenteditable="true"><p>已有草稿</p></div></div></div>';
function setup(t, html = HTML, url = 'https://www.doubao.com/chat/') {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true }), host = dom.window;
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
  host.DataTransfer = class { constructor() { this.files = []; this.items = { add: f => this.files.push(f) }; } };
  host.ClipboardEvent = class extends host.Event { constructor(type, options) { super(type, options); this.clipboardData = options.clipboardData; } };
  for (const input of host.document.querySelectorAll('input[type="file"]')) {
    let files = []; Object.defineProperty(input, 'files', { get: () => files, set: value => files = value });
  }
  const bridge = createDoubaoBridge(host); t.after(() => { bridge.disconnect(); host.close(); });
  return { host, bridge, editor: host.document.querySelector('[contenteditable],textarea') };
}
function stage(bridge, bundle) { const c = bridge.context(), data = JSON.stringify(bundle); bridge.prepare(c, 'job', data.length); bridge.append('job', 0, data); return 'job'; }

test('豆包工作工具栏把插件入口放在自动高左侧的独立位置，避开云电脑和原附件容器', t => {
  const html = '<div id="input-engine-container"><div><div class="tiptap ProseMirror" contenteditable="true"><p>草稿</p></div></div>' +
    '<div class="guidance-input-actions" style="display:flex;flex-wrap:nowrap;gap:6px;overflow:hidden"><div class="left" style="display:flex;min-width:0;flex:1;overflow:hidden"><div class="native-wrap"><div><button type="button" data-testid="upload_file_button">+</button></div></div><div><button type="button" data-testid="chat_input_action_mode">云电脑</button></div><div class="overflow-list"><button type="button">项目</button><button type="button">技能</button><button type="button">插件</button></div></div><div class="right" style="display:flex;flex-shrink:0"><div><button type="button" data-testid="chat_input_action_model">自动 高</button></div></div></div></div>';
  const { host, bridge } = setup(t, html); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.parentElement.className, 'guidance-input-actions');
  assert.equal(upload.nextElementSibling.className, 'right');
  assert.equal(upload.getAttribute('aria-label'), '选择工作流');
  assert.equal(upload.style.flexShrink, '0');
  assert.equal(upload.style.marginRight, '8px');
});

test('豆包当前输入引擎可识别，MN 上传位于快速控件左侧同一工具行且不重复', t => {
  const { host, bridge } = setup(t); bridge.connect('token'); bridge.connect('new');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.type, 'button'); assert.equal(upload.parentElement.className, 'tools'); assert.equal(upload.nextElementSibling.querySelector('[data-testid="chat_input_action_model"]').textContent, '快速');
  assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1); assert.equal(upload.style.backgroundColor, 'transparent');
});

test('豆包富文本追加原文和公式，保留草稿且不会发送', t => {
  const { host, bridge, editor } = setup(t); let sends = 0, input = 0;
  editor.addEventListener('input', () => input++); host.document.addEventListener('submit', () => sends++);
  assert.equal(bridge.commit(stage(bridge, { text: '题目 $x^2$\n第二行', files: [] })), true);
  assert.equal(editor.textContent, '已有草稿\n\n题目 $x^2$\n第二行'); assert.equal(input, 1); assert.equal(sends, 0); assert.equal(bridge.read('job').status, 'pasted');
});

test('豆包实际浏览器把换行转换为多个段落时，不把完整填入误判为失败', t => {
  const { host, bridge, editor } = setup(t);
  host.document.execCommand = (command, ui, text) => {
    assert.equal(command, 'insertText'); assert.equal(text, '\n\n原文 $x^2$\n第二行');
    editor.innerHTML = '<p>已有草稿</p><p><br></p><p>原文 $x^2$</p><p>第二行</p>';
    Object.defineProperty(editor, 'innerText', { configurable: true, value: '已有草稿\n\n\n\n\n原文 $x^2$\n\n第二行' }); return true;
  };
  assert.equal(bridge.commit(stage(bridge, { text: '原文 $x^2$\n第二行', files: [] })), true);
  assert.equal(bridge.read('job').status, 'pasted');
});

test('豆包没有常驻附件控件时，图片交给编辑器的粘贴处理并保持原草稿', t => {
  const { bridge, editor } = setup(t); const received = [];
  editor.addEventListener('paste', e => { received.push(...e.clipboardData.files); e.preventDefault(); });
  assert.equal(bridge.commit(stage(bridge, { text: '', files: [file(), file()] })), true);
  assert.equal(received.length, 2); assert.equal(received[0].name, '卡片图片.png'); assert.equal(editor.textContent, '已有草稿'); assert.equal(bridge.read('job').status, 'handed-off');
  assert.match(bridge.read('job').message, /交给 豆包/);
});

test('豆包有唯一附件控件时直接传入，不再重复粘贴', t => {
  const { bridge, host, editor } = setup(t, HTML.replace('</div></div></div>', '</div></div><input type="file" accept="image/*" multiple hidden></div>'));
  const input = host.document.querySelector('input[type=file]'); let changes = 0, pastes = 0;
  input.addEventListener('change', () => changes++); editor.addEventListener('paste', () => pastes++);
  assert.equal(bridge.commit(stage(bridge, { text: '附加提示词', files: [file()] })), true);
  assert.equal(changes, 1); assert.equal(pastes, 0); assert.equal(input.files[0].name, '卡片图片.png');
});

test('豆包未确认接收图片时，不提示成功、不追加卡片文字', t => {
  const { bridge, editor } = setup(t);
  assert.equal(bridge.commit(stage(bridge, { text: '不能重复填入', files: [file()] })), false);
  assert.equal(editor.textContent, '已有草稿'); assert.equal(bridge.read('job').status, 'error'); assert.match(bridge.read('job').message, /豆包 未确认接收/);
});

test('豆包正文编辑器变化、草稿变化或切换对话后取消传入', t => {
  for (const change of [d => d.host.history.pushState(null, '', '/chat/other'), d => d.editor.textContent = '新草稿', d => d.editor.replaceWith(d.editor.cloneNode(true))]) {
    const d = setup(t); stage(d.bridge, { text: '卡片', files: [] }); change(d); assert.equal(d.bridge.commit('job'), false);
  }
});

test('豆包工具区被重建后恢复按钮，单独的侧栏上传控件不会被使用', async t => {
  const { bridge, host } = setup(t, '<aside><button aria-label="上传文件">上传文件</button></aside>' + HTML);
  bridge.connect('token'); const tools = host.document.querySelector('.tools');
  tools.innerHTML = '<button type="button" data-testid="upload_file_button">+</button><button type="button">对话</button>';
  await new Promise(r => setTimeout(r, 180));
  assert.equal(host.document.querySelector('#aib-upload-button').parentElement, tools);
  assert.equal(host.document.querySelector('aside #aib-upload-button'), null);
});

test('豆包旧版 textarea 可用，附件没有固定标识时按名称定位', t => {
  const { host, bridge, editor } = setup(t, '<div data-testid="chat_input"><textarea data-testid="chat_input_input">草稿</textarea><div><button type="button" aria-label="上传文件">附件</button><button type="button">发送</button></div></div>');
  bridge.connect('token'); assert.equal(host.document.querySelector('#aib-upload-button').previousElementSibling.getAttribute('aria-label'), '上传文件');
  assert.equal(bridge.commit(stage(bridge, { text: '正文', files: [] })), true); assert.equal(editor.value, '草稿\n\n正文');
});

test('豆包网页工具尚未出现时仍在输入区提供入口，其他网站和登录页不注入', t => {
  const d = setup(t, '<div id="input-engine-container"><div contenteditable="true"></div></div>'); d.bridge.connect('token'); assert.ok(d.host.document.querySelector('#aib-upload-button'));
  for (const url of ['https://chatgpt.com/', 'https://www.doubao.com/login']) {
    const x = setup(t, HTML, url); assert.throws(() => x.bridge.context(), /官网|登录/); x.bridge.connect('token'); assert.equal(x.host.document.querySelector('#aib-upload-button'), null);
  }
});

test('豆包上传使用原生拦截的页面命令，不依赖 iframe 或脚本点击', t => {
  const { host } = setup(t); let handler; const navigations = [], add = host.EventTarget.prototype.addEventListener;
  host.EventTarget.prototype.addEventListener = function (type, listener, ...args) { if (this.id === 'aib-upload-button' && type === 'click') handler = listener; return add.call(this, type, listener, ...args); };
  const location = { origin: 'https://www.doubao.com', pathname: '/chat/', get href() { return 'https://www.doubao.com/chat/'; }, set href(value) { navigations.push(value); } };
  const proxy = new Proxy(host, { get(target, key) { if (key === 'location') return location; const v = Reflect.get(target, key); return typeof v === 'function' ? v.bind(target) : v; } });
  const bridge = createDoubaoBridge(proxy); t.after(() => bridge.disconnect()); bridge.connect('current');
  const event = { isTrusted: true, preventDefault() {}, stopPropagation() {} }; handler(event); handler({ ...event, isTrusted: false });
  assert.equal(navigations.length, 1); assert.match(navigations[0], /^aibridge:\/\/workflows\?token=current&request=/); assert.equal(host.document.querySelector('iframe'), null);
});
