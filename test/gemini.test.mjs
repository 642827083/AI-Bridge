import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createGeminiBridge } from '../web/src/gemini.js';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
const HTML = '<main><input-container><div class="input-area"><div class="text-input-field"><simplified-input-menu><div><gem-icon-button><button type="button" aria-label="上传和工具">＋</button></gem-icon-button></div></simplified-input-menu><div class="single-line-format"><div><div><rich-textarea><div class="ql-editor" contenteditable="true" role="textbox"><p>已有草稿</p></div><div class="ql-clipboard" contenteditable="true" hidden></div></rich-textarea></div></div></div><div class="right"><button type="button" aria-label="打开模式选择器">Flash</button><button type="button" aria-label="语音输入">麦克风</button></div></div><input type="file" accept="image/*,application/pdf" multiple hidden></div></input-container></main>';
function setup(t, { html = HTML, url = 'https://gemini.google.com/app' } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true }), host = dom.window;
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
  host.DataTransfer = class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } };
  host.ClipboardEvent = class extends host.Event { constructor(name, options) { super(name, options); this.clipboardData = options.clipboardData; } };
  for (const input of host.document.querySelectorAll('input[type="file"]')) { let files = []; Object.defineProperty(input, 'files', { get: () => files, set: value => { files = value; } }); }
  const bridge = createGeminiBridge(host); t.after(() => { bridge.disconnect(); host.close(); });
  return { host, doc: host.document, bridge, editor: host.document.querySelector('.ql-editor,textarea'), input: host.document.querySelector('input[type="file"]') };
}
function stage(bridge, bundle) { const target = bridge.context(), data = JSON.stringify(bundle); bridge.prepare(target, 'job', data.length); bridge.append('job', 0, data); return 'job'; }
const file = { name: '手写.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG };

test('Gemini 当前嵌套输入区中，MN 上传位于定宽附件组件外，重复连接不重复创建', t => {
  const { bridge, doc } = setup(t); bridge.connect('old'); bridge.connect('current');
  const button = doc.querySelector('#aib-upload-button');
  assert.equal(button.getAttribute('aria-label'), '选择工作流'); assert.equal(button.type, 'button'); assert.equal(button.parentElement, doc.body); assert.equal(button.style.position, 'fixed');
  assert.equal(doc.querySelector('simplified-input-menu').nextElementSibling.className, 'single-line-format'); assert.equal(doc.querySelectorAll('#aib-upload-button').length, 1);
  button.click(); assert.equal(doc.querySelector('iframe'), null);
});

test('Gemini 原文、公式及多行文字追加到 Quill 草稿，不点击发送', t => {
  const { bridge, editor, doc, host } = setup(t); let sends = 0;
  doc.querySelectorAll('button').forEach(button => button.addEventListener('click', () => sends++));
  editor.addEventListener('input', () => {
    const paragraphs = editor.textContent.split('\n').map(line => { const p = doc.createElement('p'); if (line) p.textContent = line; else p.append(doc.createElement('br')); return p; }); editor.replaceChildren(...paragraphs);
  });
  const token = stage(bridge, { text: '卡片原文 $x^2$\n第二行', files: [] });
  assert.equal(bridge.commit(token), true); assert.equal(bridge.read(token).status, 'pasted'); assert.equal(sends, 0);
  assert.match(bridge.read(token).message, /Gemini/); assert.equal(editor.querySelectorAll('p').length, 4);
  host.history.pushState(null, '', '/app/other'); assert.equal(bridge.read(token).status, 'error');
});

test('Gemini 深层输入框的附件从所属输入区读取，不误用页面其他文件入口', t => {
  const { bridge, editor, input } = setup(t, { html: HTML + '<input type="file" accept="image/*" id="avatar">' }); let changes = 0;
  input.addEventListener('change', () => changes++);
  const token = stage(bridge, { text: '检查手写', files: [file] }); assert.equal(bridge.commit(token), true);
  assert.equal(changes, 1); assert.equal(input.files[0].name, '手写.png'); assert.match(editor.textContent, /已有草稿\n\n检查手写/);
  assert.equal(bridge.read(token).status, 'handed-off'); assert.match(bridge.read(token).message, /交给 Gemini.*检查附件/);
});

test('Gemini 未挂载附件控件时用图片粘贴交付，未确认接收时不追加文字', t => {
  for (const accepted of [true, false]) {
    const { bridge, editor } = setup(t, { html: HTML.replace(/<input type="file"[^>]*>/, '') }); const pasted = [];
    editor.addEventListener('paste', event => { pasted.push(...event.clipboardData.files); if (accepted) event.preventDefault(); });
    const token = stage(bridge, { text: '附加提示词', files: [file] }); assert.equal(bridge.commit(token), accepted);
    assert.equal(pasted.length, 1); assert.equal(pasted[0].name, '手写.png');
    if (accepted) assert.equal(bridge.read(token).status, 'handed-off');
    else { assert.equal(editor.textContent, '已有草稿'); assert.match(bridge.read(token).message, /未确认接收/); }
  }
});

test('Gemini 旧 textarea 与空 Quill 输入可用，侧栏上传不会匹配为输入区工具', t => {
  const { bridge, editor, doc } = setup(t, { html: '<aside><button aria-label="上传文件">上传</button></aside><main><input-container><textarea>旧草稿</textarea></input-container></main>' });
  bridge.connect('token'); assert.equal(doc.querySelector('#aib-upload-button'), null);
  const token = stage(bridge, { text: '正文', files: [] }); assert.equal(bridge.commit(token), true); assert.equal(editor.value, '旧草稿\n\n正文');
  const empty = setup(t, { html: HTML.replace('<p>已有草稿</p>', '<p><br></p>') });
  assert.equal(empty.bridge.commit(stage(empty.bridge, { text: '第一行\n第二行', files: [] })), true);
});

test('Gemini 切换对话、重建输入框或修改草稿时停止，不修改新内容', t => {
  for (const action of ['navigate', 'edit', 'replace']) {
    const p = setup(t), token = stage(p.bridge, { text: '不应填入', files: [] });
    if (action === 'navigate') p.host.history.pushState(null, '', '/app/another');
    if (action === 'edit') p.editor.textContent = '新的草稿';
    if (action === 'replace') p.editor.replaceWith(p.editor.cloneNode(true));
    assert.equal(p.bridge.commit(token), false); assert.doesNotMatch(p.doc.body.textContent, /不应填入/);
  }
});

test('Gemini 工具栏重建后恢复一个 MN 上传入口，移除编辑器后清除按钮', async t => {
  const { bridge, doc, editor } = setup(t); bridge.connect('token');
  doc.querySelector('simplified-input-menu').outerHTML = '<simplified-input-menu><gem-icon-button><button aria-label="Upload and tools">＋</button></gem-icon-button></simplified-input-menu>';
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(doc.querySelector('#aib-upload-button').parentElement, doc.body); assert.equal(doc.querySelectorAll('#aib-upload-button').length, 1);
  editor.remove(); await new Promise(resolve => setTimeout(resolve, 180)); assert.equal(doc.querySelector('#aib-upload-button'), null);
});

test('Gemini 错误域名、登录页或多个可见聊天输入框不允许上传', t => {
  for (const url of ['https://accounts.google.com/', 'https://chatgpt.com/', 'https://gemini.google.com/signin']) {
    const { bridge, doc } = setup(t, { url }); assert.throws(() => bridge.context()); bridge.connect('token'); assert.equal(doc.querySelector('#aib-upload-button'), null);
  }
  const { bridge } = setup(t, { html: HTML + '<rich-textarea><div class="ql-editor" contenteditable="true"></div></rich-textarea>' }); assert.throws(() => bridge.context(), /多个输入框/);
});

test('Gemini 双行输入区即使加号所在容器占满整行，入口仍跟在加号旁且不改网页布局，滚动后跟随', t => {
  const html = '<main><input-container><div class="input-area"><rich-textarea><div class="ql-editor" contenteditable="true">草稿</div></rich-textarea><div class="bottom" style="display:flex;justify-content:space-between"><div class="left" style="flex:1"><simplified-input-menu><button type="button" aria-label="Add files">＋</button></simplified-input-menu></div><button aria-label="语音输入">mic</button></div></div></input-container></main>';
  const { bridge, doc, host, editor } = setup(t, { html }); let shift = 0;
  const plus = doc.querySelector('simplified-input-menu button');
  plus.getBoundingClientRect = () => ({ left: 40, right: 80, top: 120 + shift, bottom: 160 + shift, width: 40, height: 40 });
  editor.getBoundingClientRect = () => ({ left: 40, right: 400, top: 60 + shift, bottom: 100 + shift, width: 360, height: 40 });
  const before = doc.querySelector('.left').outerHTML; bridge.connect('token');
  const button = doc.querySelector('#aib-upload-button');
  assert.equal(button.parentElement, doc.body); assert.equal(button.style.position, 'fixed');
  assert.equal(button.style.left, '86px'); assert.equal(button.style.top, '124px');
  assert.equal(button.style.backgroundColor, 'transparent'); assert.equal(doc.querySelector('.left').outerHTML, before);
  shift = -20; host.dispatchEvent(new host.Event('scroll')); assert.equal(button.style.top, '104px');
  bridge.disconnect(); assert.equal(doc.querySelector('#aib-upload-button'), null); assert.equal(doc.querySelector('.left').outerHTML, before);
});

test('Gemini 加号在外层工具区、编辑器高度覆盖工具行时仍固定在加号右侧，不退回输入框中间', t => {
  const html = '<main><input-container><input-area-v3><rich-textarea><div class="ql-editor" contenteditable="true">草稿</div></rich-textarea></input-area-v3><div class="bottom"><simplified-input-menu><button aria-label="Open upload menu"><span>add</span></button></simplified-input-menu><button aria-label="语音输入">mic</button></div></input-container></main>';
  const { bridge, doc, editor } = setup(t, { html });
  const plus = doc.querySelector('simplified-input-menu button');
  plus.getBoundingClientRect = () => ({ left: 40, right: 80, top: 120, bottom: 160, width: 40, height: 40 });
  editor.getBoundingClientRect = () => ({ left: 40, right: 400, top: 60, bottom: 180, width: 360, height: 120 });
  bridge.connect('token'); const button = doc.querySelector('#aib-upload-button');
  assert.equal(button.parentElement, doc.body); assert.equal(button.style.position, 'fixed');
  assert.equal(button.style.left, '86px'); assert.equal(button.style.top, '124px');
});

test('Gemini 附件按钮命中区域占满整行时按加号图形定位，按钮延迟出现时不在中央显示备用入口', async t => {
  const html = '<main><input-container><rich-textarea><div class="ql-editor" contenteditable="true">草稿</div></rich-textarea><div id="tools"></div></input-container></main>';
  const { bridge, doc } = setup(t, { html }); bridge.connect('token');
  assert.equal(doc.querySelector('#aib-upload-button'), null);
  doc.querySelector('#tools').innerHTML = '<simplified-input-menu><button aria-label="任意语言"><mat-icon>add</mat-icon></button></simplified-input-menu>';
  const plus = doc.querySelector('simplified-input-menu button'), icon = plus.querySelector('mat-icon');
  plus.getBoundingClientRect = () => ({ left: 40, right: 640, top: 120, bottom: 160, width: 600, height: 40 });
  icon.getBoundingClientRect = () => ({ left: 48, right: 72, top: 128, bottom: 152, width: 24, height: 24 });
  await new Promise(resolve => setTimeout(resolve, 180));
  const button = doc.querySelector('#aib-upload-button'); assert.equal(button.style.left, '78px'); assert.equal(button.style.top, '124px');
  assert.equal(doc.querySelectorAll('#aib-upload-button').length, 1);
});
