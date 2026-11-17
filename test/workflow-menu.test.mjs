import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createGPTBridge } from '../web/src/gpt.js';
import { nativeScene, plain } from './native-support.mjs';

function web(t) {
  const dom = new JSDOM('<form><textarea id="prompt-textarea">原草稿</textarea><div class="tools"><button type="button" id="composer-plus-btn">＋</button><button type="submit">发送</button></div></form>', { url: 'https://chatgpt.com/', pretendToBeVisual: true });
  const host = dom.window, events = new WeakMap(), navigations = []; let href = 'https://chatgpt.com/';
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
  host.HTMLElement.prototype.getBoundingClientRect = function () { return this.id === 'aib-workflow-menu' ? { height: 210 } : { left: 180, top: 500, bottom: 532 }; };
  const add = host.EventTarget.prototype.addEventListener;
  host.EventTarget.prototype.addEventListener = function (type, handler, ...args) {
    if (!events.has(this)) events.set(this, new Map()); events.get(this).set(type, handler);
    return add.call(this, type, handler, ...args);
  };
  const location = { origin: 'https://chatgpt.com', pathname: '/', get href() { return href; }, set href(value) { navigations.push(value); } };
  const proxy = new Proxy(host, { get(target, key) { if (key === 'location') return location; const value = Reflect.get(target, key); return typeof value === 'function' ? value.bind(target) : value; } });
  const bridge = createGPTBridge(proxy); bridge.connect('current');
  t.after(() => { bridge.disconnect(); host.close(); });
  const click = (el, isTrusted = true) => events.get(el).get('click')({ isTrusted, preventDefault() {}, stopPropagation() {} });
  const open = () => { click(host.document.querySelector('#aib-upload-button')); return new URL(navigations.at(-1)).searchParams.get('request'); };
  return { host, bridge, navigations, click, open, navigate() { href = 'https://chatgpt.com/c/other'; } };
}
const items = [{ id: 'wf-a', name: '<b>讲解</b>', site: 'gpt' }, { id: 'wf-b', name: '检查手写', site: 'gemini' }, { id: 'wf-doubao', name: '豆包工作流', site: 'doubao' }, { id: 'wf-invalid', name: '不支持的工作流', site: 'unknown' }];

test('三横线展开工作流，列表安全展示名称，选择后只发出对应工作流命令且不直接上传', t => {
  const w = web(t), doc = w.host.document, request = w.open();
  assert.equal(w.navigations.length, 1); assert.match(w.navigations[0], /^aibridge:\/\/workflows\?/);
  assert.equal(w.bridge.workflowMenu(request, { items }), true);
  const menu = doc.querySelector('#aib-workflow-menu');
  assert.equal(menu.querySelectorAll('button').length, 4); assert.equal(menu.querySelector('b'), null); assert.match(menu.textContent, /豆包工作流/); assert.doesNotMatch(menu.textContent, /不支持的工作流/);
  assert.equal(doc.querySelector('textarea').value, '原草稿'); assert.equal(doc.querySelector('iframe'), null);
  assert.equal(menu.style.top, '282px');
  w.click(menu.querySelector('button'), false); assert.equal(w.navigations.length, 1);
  w.click(menu.querySelectorAll('button')[1]);
  assert.equal(w.navigations[1], 'aibridge://workflow?token=current&id=wf-b'); assert.equal(doc.querySelector('#aib-workflow-menu'), null);
  assert.equal(doc.querySelector('#aib-upload-button').getAttribute('aria-expanded'), 'false');
});

test('旧菜单响应、切换对话和输入框替换后不能执行；重复连接释放菜单且只留一个入口', t => {
  const w = web(t), doc = w.host.document, old = w.open();
  w.click(doc.querySelector('#aib-upload-button')); const current = w.open();
  assert.equal(w.bridge.workflowMenu(old, { items }), false); assert.equal(w.bridge.workflowMenu(current, { items }), true);
  const row = doc.querySelector('#aib-workflow-menu button'); w.navigate(); w.click(row); assert.equal(w.navigations.length, 2);
  w.bridge.connect('next'); assert.equal(doc.querySelectorAll('#aib-upload-button').length, 1); assert.equal(doc.querySelector('#aib-workflow-menu'), null);
  const pending = w.open(); doc.querySelector('textarea').replaceWith(doc.createElement('textarea'));
  assert.equal(w.bridge.workflowMenu(pending, { items }), false);
});

test('空列表和读取错误仍提供工作流库入口，支持 Escape、点击外部关闭和键盘选择', t => {
  const w = web(t), doc = w.host.document;
  const id = w.open(); w.bridge.workflowMenu(id, { items: [] }); assert.match(doc.querySelector('#aib-workflow-menu').textContent, /还没有工作流/);
  doc.querySelector('#aib-upload-button').focus();
  doc.dispatchEvent(new w.host.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  assert.equal(doc.activeElement.textContent, '工作流库›');
  doc.dispatchEvent(new w.host.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); assert.equal(doc.querySelector('#aib-workflow-menu'), null);
  w.bridge.workflowMenu(w.open(), { error: '读取失败' }); assert.match(doc.querySelector('#aib-workflow-menu').textContent, /读取失败/);
  w.click(doc.querySelector('#aib-workflow-menu button')); assert.equal(w.navigations.at(-1), 'aibridge://workflow-library?token=current');
  w.open(); doc.body.dispatchEvent(new w.host.Event('pointerdown', { bubbles: true })); assert.equal(doc.querySelector('#aib-workflow-menu'), null);
});

function native() {
  const h = nativeScene(), d = h.open(); vm.runInContext(readFileSync('src/AIBSites.js', 'utf8'), h.context);
  const c = d.controller; c.activePage = 'gpt'; c.gptView = {}; c.webView = {};
  h.context.AIBSites.get(c, 'gpt').token = 'current';
  const replies = [], runs = [], managed = [];
  h.context.AIBNative.evaluate = async (view, code) => replies.push({ view, code });
  h.context.AIBWorkflowRunner.run = (addon, id, originSite) => runs.push({ addon, id, originSite });
  h.context.AIBWorkflowLibrary.manage = addon => managed.push(addon);
  const store = h.context.AIBWorkflows;
  for (const site of ['gpt', 'gemini', 'doubao']) store.save({ expectedRevision: store.read().revision, workflow: { name: site, site, cardItems: [1], handwriting: 'mindmap', extraText: '不能暴露到菜单的提示词' } });
  return { h, d, c, replies, runs, managed, remote: address => h.context.AIBWebCommands.remote(c, address, c.gptView) };
}

test('原生菜单包含豆包工作流且仅返回名称和目标网页，执行和管理使用独立命令', () => {
  const n = native(), bytes = Buffer.from(n.h.files.get('/documents/AI-Bridge/workflows.json'));
  assert.equal(n.remote('aibridge://workflows?token=current&request=menu-one'), true);
  const values = []; vm.runInNewContext(n.replies[0].code, { window: { __AIB_GPT__: { workflowMenu: (...args) => values.push(args) } } });
  assert.equal(values[0][0], 'menu-one'); assert.equal(values[0][1].items.length, 3);
  assert.ok(values[0][1].items.every(item => item.site === 'gpt'), '菜单标注实际接收内容的当前网页');
  for (const item of values[0][1].items) assert.deepEqual(Object.keys(item).sort(), ['id', 'name', 'site']);
  assert.equal(n.remote('aibridge://workflow?token=current&id=' + values[0][1].items[1].id), true);
  assert.deepEqual(n.runs, [{ addon: n.d.addon, id: values[0][1].items[1].id, originSite: 'gpt' }]);
  assert.equal(n.remote('aibridge://workflow-library?token=current'), true); assert.deepEqual(n.managed, [n.d.addon]);
  assert.equal(n.h.context.AIBWorkflows.read().items.length, 3); assert.deepEqual(n.h.files.get('/documents/AI-Bridge/workflows.json'), bytes);
});

test('后台、错视图、过期 token 和无效命令不能读取菜单或执行工作流', () => {
  const n = native(), address = 'aibridge://workflows?token=current&request=menu';
  for (const invalid of ['aibridge://workflows?token=stale&request=menu', 'aibridge://workflow?token=current&id=../x', 'aibridge://workflow?token=current', 'aibridge://workflows?token=current&id=wf-a', 'aibridge://workflow-library?token=current&id=wf-a']) assert.equal(n.remote(invalid), false);
  assert.equal(n.h.context.AIBWebCommands.remote(n.c, address, n.c.webView), false);
  n.c.visible = false; assert.equal(n.remote(address), false); n.c.visible = true;
  n.c.activePage = 'deepseek'; assert.equal(n.remote(address), false);
  assert.equal(n.replies.length, 0); assert.equal(n.runs.length, 0); assert.equal(n.managed.length, 0);
});

test('旧豆包工作流恢复到工作流库，不修改原存档', () => {
  const h = nativeScene(), d = h.open(), store = h.context.AIBWorkflows;
  const record = store.save({ expectedRevision: '', workflow: { name: '豆包工作流', site: 'doubao', cardItems: [], handwriting: 'none', extraText: '提示词' } });
  const before = Buffer.from(h.files.get('/documents/AI-Bridge/workflows.json'));
  assert.deepEqual(plain(store.visible().items), plain(record.items));
  assert.deepEqual(h.files.get('/documents/AI-Bridge/workflows.json'), before);
});
