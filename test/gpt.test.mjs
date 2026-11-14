import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGPTBridge } from '../web/src/gpt.js';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const HTML = '<form><div><div id="prompt-textarea" class="ProseMirror" contenteditable="true"><p>已有草稿</p></div></div><div class="tools"><button type="button" id="composer-plus-btn">+</button><button type="submit" id="composer-submit-button" disabled>发送</button></div><input type="file" accept="image/*,.pdf" multiple hidden></form>';
function setup(t, { html = HTML, url = 'https://chatgpt.com/' } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true }), host = dom.window;
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
  host.DataTransfer = class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } };
  for (const input of host.document.querySelectorAll('input[type="file"]')) {
    let files = []; Object.defineProperty(input, 'files', { get: () => files, set: value => { files = value; } });
  }
  const bridge = createGPTBridge(host);
  t.after(() => { bridge.disconnect(); host.close(); });
  return { host, bridge, editor: host.document.querySelector('#prompt-textarea'), input: host.document.querySelector('input[type="file"]') };
}
function stage(bridge, bundle) {
  const target = bridge.context(), data = JSON.stringify(bundle);
  bridge.prepare(target, 'job', data.length); bridge.append('job', 0, data); return 'job';
}

test('GPT 上传在附件按钮右侧同一行，重复连接只有一个入口', t => {
  const { host, bridge } = setup(t); bridge.connect('first'); bridge.connect('second');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.previousElementSibling.id, 'composer-plus-btn'); assert.equal(upload.parentElement.className, 'tools');
  assert.equal(upload.type, 'button'); assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
  assert.equal(upload.getAttribute('aria-label'), '选择工作流');
  upload.click(); assert.equal(host.document.querySelector('iframe'), null);
});

test('GPT 富文本草稿后追加文字和公式，触发输入而不发送', t => {
  const { bridge, editor } = setup(t); let inputs = 0, submits = 0;
  editor.addEventListener('input', () => inputs++); editor.closest('form').addEventListener('submit', () => submits++);
  const token = stage(bridge, { text: '卡片原文 $x^2$\n第二行', files: [] });
  assert.equal(bridge.commit(token), true); assert.equal(editor.textContent, '已有草稿\n\n卡片原文 $x^2$\n第二行');
  assert.equal(inputs, 1); assert.equal(submits, 0); assert.equal(bridge.read(token).status, 'pasted');
  assert.match(bridge.read(token).message, /ChatGPT/);
});

test('GPT 图片交给当前附件控件，保留草稿等待用户发送', t => {
  const { bridge, editor, input } = setup(t); let changes = 0;
  input.addEventListener('change', () => changes++);
  const token = stage(bridge, { text: '', files: [{ name: '手写.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), true); assert.equal(changes, 1); assert.equal(input.files[0].name, '手写.png');
  assert.equal(editor.textContent, '已有草稿'); assert.equal(bridge.read(token).status, 'handed-off');
  assert.match(bridge.read(token).message, /交给 ChatGPT/);
});

test('GPT 页面重建工具栏后恢复上传入口', async t => {
  const { bridge, host } = setup(t); bridge.connect('token');
  const tools = host.document.querySelector('.tools'); tools.innerHTML = '<button id="composer-plus-btn" type="button">+</button>';
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(tools.querySelector('#composer-plus-btn').nextElementSibling?.id, 'aib-upload-button');
  assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
});

test('GPT 缺少附件按钮时使用当前输入区发送按钮前的位置', t => {
  const { bridge, host } = setup(t, { html: HTML.replace('<button type="button" id="composer-plus-btn">+</button>', '') });
  bridge.connect('token'); assert.equal(host.document.querySelector('#aib-upload-button')?.nextElementSibling.id, 'composer-submit-button');
});

test('GPT 旧版 textarea 同样保留草稿，DeepSeek 页面不能使用 GPT 适配', t => {
  const { bridge, editor } = setup(t, { html: '<form><textarea id="prompt-textarea">草稿</textarea><button id="composer-plus-btn" type="button">+</button></form>' });
  const token = stage(bridge, { text: '正文', files: [] }); assert.equal(bridge.commit(token), true); assert.equal(editor.value, '草稿\n\n正文');
  const wrong = setup(t, { url: 'https://chat.deepseek.com/' }); assert.throws(() => wrong.bridge.context(), /ChatGPT 官网/);
  wrong.bridge.connect('token'); assert.equal(wrong.host.document.querySelector('#aib-upload-button'), null);
});

test('GPT 切换对话或继续编辑草稿会停止本次上传', t => {
  const first = setup(t), token = stage(first.bridge, { text: '卡片', files: [] });
  first.host.history.pushState(null, '', '/c/another'); assert.equal(first.bridge.commit(token), false);
  assert.equal(first.editor.textContent, '已有草稿');
  const second = setup(t), another = stage(second.bridge, { text: '卡片', files: [] });
  second.editor.textContent = '继续输入的新内容'; assert.equal(second.bridge.commit(another), false);
  assert.equal(second.editor.textContent, '继续输入的新内容');
});

test('GPT 找不到附件控件时不追加文字，提示点击网站附件按钮', t => {
  const { bridge, editor } = setup(t, { html: HTML.replace(/<input[^>]+>/, '') });
  const token = stage(bridge, { text: '卡片', files: [{ name: '图片.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), false); assert.equal(editor.textContent, '已有草稿');
  assert.match(bridge.read(token).message, /ChatGPT 的附件按钮/);
});

for (const mode of ['missing', 'multiple']) test('GPT ' + mode + ' 附件控件时通过输入框粘贴交付图片，不重复发送', t => {
  const html = mode === 'missing' ? HTML.replace(/<input[^>]+>/, '') : HTML.replace('</form>', '<input type="file" accept="image/*" multiple hidden></form>');
  const { host, bridge, editor } = setup(t, { html });
  host.ClipboardEvent = class extends host.Event {
    constructor(type, options) { super(type, options); this.clipboardData = options.clipboardData; }
  };
  const received = []; let changes = 0, submits = 0;
  editor.addEventListener('paste', event => { received.push(...event.clipboardData.files); event.preventDefault(); });
  editor.closest('form').addEventListener('change', () => changes++);
  editor.closest('form').addEventListener('submit', () => submits++);
  const token = stage(bridge, { text: '卡片正文', files: [{ name: '手写.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), true, bridge.read(token).message);
  assert.equal(received.length, 1); assert.equal(received[0].name, '手写.png');
  assert.equal(editor.textContent, '已有草稿\n\n卡片正文');
  assert.equal(changes, 0); assert.equal(submits, 0); assert.equal(bridge.read(token).status, 'handed-off');
});

test('GPT 不支持图片粘贴且无附件控件时，明确尚未交付且保留草稿', t => {
  const { bridge, editor } = setup(t, { html: HTML.replace(/<input[^>]+>/, '') });
  const token = stage(bridge, { text: '卡片', files: [{ name: '图片.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), false); assert.equal(bridge.read(token).delivery, 'none');
  assert.equal(editor.textContent, '已有草稿');
});

test('GPT 网页未处理粘贴事件时不宣称图片交付成功，也不继续追加文字', t => {
  const { host, bridge, editor } = setup(t, { html: HTML.replace(/<input[^>]+>/, '') });
  host.ClipboardEvent = class extends host.Event {
    constructor(type, options) { super(type, options); this.clipboardData = options.clipboardData; }
  };
  const token = stage(bridge, { text: '卡片', files: [{ name: '图片.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), false); assert.equal(bridge.read(token).status, 'error');
  assert.match(bridge.read(token).message, /未确认接收/); assert.equal(editor.textContent, '已有草稿');
});

test('GPT 不把图片交给输入框所在表单之外的其他上传控件', t => {
  const html = HTML.replace(/<input[^>]+>/, '') + '<form id="other"><input type="file" accept="image/*" multiple></form>';
  const { host, bridge, input } = setup(t, { html }); let changes = 0;
  input.addEventListener('change', () => changes++);
  const token = stage(bridge, { text: '卡片', files: [{ name: '图片.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), false); assert.equal(changes, 0);
  assert.equal(host.document.querySelector('#prompt-textarea').textContent, '已有草稿');
});

test('GPT 粘贴图片期间切换对话后，停止追加文字并保留可能已交付提示', t => {
  const { host, bridge, editor } = setup(t, { html: HTML.replace(/<input[^>]+>/, '') });
  host.ClipboardEvent = class extends host.Event {
    constructor(type, options) { super(type, options); this.clipboardData = options.clipboardData; }
  };
  let received = 0;
  editor.addEventListener('paste', event => { received += event.clipboardData.files.length; event.preventDefault(); host.history.pushState(null, '', '/c/other'); });
  const token = stage(bridge, { text: '卡片', files: [{ name: '图片.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG }] });
  assert.equal(bridge.commit(token), false); assert.equal(received, 1); assert.equal(editor.textContent, '已有草稿');
  assert.equal(bridge.read(token).delivery, 'possible'); assert.match(bridge.read(token).message, /部分图片可能/);
});

test('GPT 没有固定按钮标识时仍显示插件上传，按可见附件名称定位', t => {
  const html = HTML.replace('id="composer-plus-btn"', 'aria-label="添加照片和文件"').replace('id="composer-submit-button"', 'aria-label="发送消息"');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.ok(upload, '应显示 Ai Bridge 自己的上传按钮');
  assert.equal(upload.previousElementSibling.getAttribute('aria-label'), '添加照片和文件');
});

test('GPT 附件按钮包在窄容器里时，插件上传放在工具行而非窄容器内', t => {
  const html = HTML.replace('<button type="button" id="composer-plus-btn">+</button>', '<div class="narrow" style="width:32px;overflow:hidden"><button type="button" id="composer-plus-btn">+</button></div>');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.parentElement.className, 'tools'); assert.equal(upload.previousElementSibling.className, 'narrow');
});

test('GPT 有输入框但暂未出现网站工具按钮时，也提供插件上传入口', t => {
  const html = '<form><div id="prompt-textarea" contenteditable="true"><p>草稿</p></div></form>';
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.ok(upload); assert.equal(upload.type, 'button'); assert.equal(upload.previousElementSibling.id, 'prompt-textarea');
  const token = stage(bridge, { text: 'MN 卡片文字', files: [] });
  assert.equal(bridge.commit(token), true); assert.equal(bridge.read(token).status, 'pasted');
});

test('GPT 输入框没有固定 id 但保留编辑器语义时，仍能显示插件上传', t => {
  const html = HTML.replace('id="prompt-textarea"', 'role="textbox"');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  assert.ok(host.document.querySelector('#aib-upload-button'));
  const prose = setup(t, { html: HTML.replace('id="prompt-textarea"', '') }); prose.bridge.connect('token');
  assert.ok(prose.host.document.querySelector('#aib-upload-button'));
});

test('GPT 工具按钮晚于输入框出现时，插件上传从备用位置回到工具行且不重复', async t => {
  const { bridge, host } = setup(t, { html: '<form><div id="prompt-textarea" contenteditable="true"></div></form>' });
  bridge.connect('token'); assert.ok(host.document.querySelector('#aib-upload-button'));
  const tools = host.document.createElement('div'); tools.className = 'tools'; tools.innerHTML = '<button id="composer-plus-btn" type="button">+</button><button type="button" aria-label="语音">语音</button>';
  host.document.querySelector('form').appendChild(tools);
  await new Promise(resolve => setTimeout(resolve, 180));
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.parentElement, tools); assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
});

test('GPT 三横线工作流入口保留在加号右边，使用透明底深色图标', t => {
  const html = HTML.replace('<button type="submit" id="composer-submit-button" disabled>发送</button>', '<button type="button" aria-label="思考程度">Medium</button><button type="submit" id="composer-submit-button" disabled>发送</button>');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.previousElementSibling.id, 'composer-plus-btn');
  assert.equal(upload.style.color, 'rgb(68, 71, 70)'); assert.equal(upload.style.backgroundColor, 'transparent');
});

test('GPT 思考程度只有 Medium 名称时仍优先使用加号右侧', t => {
  const html = HTML.replace('<button type="submit" id="composer-submit-button" disabled>发送</button>', '<div class="right"><button type="button"><span>Medium</span><svg aria-hidden="true"></svg></button><button type="button">语音</button></div>');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.parentElement.className, 'tools'); assert.equal(upload.previousElementSibling.id, 'composer-plus-btn');
});

test('GPT 工作页合并模型控件时上传仍位于加号右侧', t => {
  const html = HTML.replace('<button type="submit" id="composer-submit-button" disabled>发送</button>', '<div class="right"><button type="button"><span>GPT-6.1 Sol</span> <span>轻度</span></button><button type="button">语音</button></div>');
  const { bridge, host } = setup(t, { html }); bridge.connect('token');
  const upload = host.document.querySelector('#aib-upload-button');
  assert.equal(upload.parentElement.className, 'tools'); assert.equal(upload.previousElementSibling.id, 'composer-plus-btn');
});

test('GPT 真实点击处理路径使用页面跳转通知 MN，不创建被限制的子框架', t => {
  const { host } = setup(t); const navigations = []; let handler;
  const nativeAdd = host.EventTarget.prototype.addEventListener;
  host.EventTarget.prototype.addEventListener = function (type, listener, ...args) {
    if (this.id === 'aib-upload-button' && type === 'click') handler = listener;
    return nativeAdd.call(this, type, listener, ...args);
  };
  const testLocation = { origin: 'https://chatgpt.com', pathname: '/', get href() { return 'https://chatgpt.com/'; }, set href(value) { navigations.push(value); } };
  const proxy = new Proxy(host, { get(target, key) { if (key === 'location') return testLocation; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
  const bridge = createGPTBridge(proxy); t.after(() => bridge.disconnect()); bridge.connect('current-token');
  assert.ok(handler); let stopped = false;
  handler({ isTrusted: true, preventDefault() {}, stopPropagation() { stopped = true; } });
  assert.equal(navigations.length, 1); assert.match(navigations[0], /^aibridge:\/\/workflows\?token=current-token&request=/);
  assert.equal(host.document.querySelector('iframe'), null); assert.equal(stopped, true);
  handler({ isTrusted: false, preventDefault() {}, stopPropagation() {} }); assert.equal(navigations.length, 1);
});
