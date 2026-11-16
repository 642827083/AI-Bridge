import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function panel(t) {
  const h = pets(), scene = h.open(), context = h.context, documents = [], loads = [];
  let controller, definition, delayed = false, failing = false;
  context.UIColor.lightGrayColor = () => 'lightgray';
  const loadImage = context.UIImage.imageWithContentsOfFile;
  context.UIImage.imageWithContentsOfFile = path => path.startsWith('/addon/web-dist/toolbar/') ? { size: { width: 60, height: 60 } } : loadImage(path);
  context.NSURL.URLWithString = url => ({ absoluteString: url });
  context.NSURLRequest = { requestWithURL: URL => ({ URL }) };
  context.UIView.prototype.endEditing = () => {};
  context.UIWebView.prototype.loadRequest = function (request) { (this.requests ||= []).push(request); };
  context.UIWebView.prototype.loadHTMLStringBaseURL = function (html) {
    loads.push(html);
    if (delayed || failing) return;
    const view = this;
    const dom = new JSDOM(html, { url: 'https://settings.invalid/', runScripts: 'dangerously', beforeParse(window) {
      window.scrollTo = () => {};
      window.mn = { call: async (command, payload) => command === 'getNavigation' ? { sites: ['deepseek'] } : command === 'getWorkflows' ? plain(context.AIBWorkflows.visible()) : plain(context.AIBPets.command(controller, command, payload)) };
    } });
    documents.push(dom); view.dom = dom;
  };
  context.UIWebView.prototype.evaluateJavaScript = function (code, callback) {
    this.scripts.push(code); callback(this.dom ? this.dom.window.eval(code) : undefined);
  };
  context.AIBResources = { settingsHTML };
  context.JSB.defineClass = (_name, methods) => { definition = methods; return { new: () => Object.assign({ view: new context.UIView({ x: 0, y: 0, width: 700, height: 600 }) }, methods) }; };
  for (const name of ['AIBSites', 'AIBWindow', 'AIBNavigationMotion', 'AIBSettingsPage', 'AIBPanelActions', 'AIBToolbarIcons', 'AIBPanel']) vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), context);
  controller = context.AIBPanel.create(scene.addon); scene.addon.panelController = controller; context.self = controller; definition.viewDidLoad();
  t.after(() => { context.AIBPanel.dispose(controller); documents.forEach(dom => dom.window.close()); });
  await flush();
  return { h, context, controller, loads, get doc() { return controller.settingsView.dom?.window.document; },
    blank() { const dom = new JSDOM('<!doctype html><html><body></body></html>', { runScripts: 'dangerously' }); documents.push(dom); controller.settingsView.dom = dom; },
    delayed(value) { delayed = value; }, failing(value) { failing = value; },
    finish() { if (!failing) { context.UIWebView.prototype.loadHTMLStringBaseURL.call(controller.settingsView, settingsHTML); } context.self = controller; definition.webViewDidFinishLoad(controller.settingsView); },
    manage() { context.AIBWorkflowPet.manage(scene.addon); },
    async settle(ticks = 24) { for (let n = 0; n < ticks; n++) { await flush(); h.timers.find(timer => timer.valid && timer.seconds < 8)?.fire(); } },
    call(name, ...args) { context.self = controller; return definition[name](...args); }
  };
}

test('设置文档为空时从桌宠管理工作流进入，恢复设置内容并显示工作流', async t => {
  const p = await panel(t); p.manage(); await p.settle();
  assert.equal(p.doc.querySelector('#workflows-panel').hidden, false);
  const before = p.loads.length; p.blank(); p.manage(); await p.settle();
  assert.equal(p.controller.activePage, 'settings'); assert.equal(p.controller.settingsView.hidden, false);
  assert.ok(p.doc.querySelector('#settings-main'), '导航正常但设置内容持续空白');
  assert.equal(p.doc.querySelector('#workflows-panel').hidden, false);
  assert.equal(p.loads.length, before + 1);
});

test('健康设置页反复从桌宠和顶栏进入不重载，不丢失工作流编辑草稿', async t => {
  const p = await panel(t); p.manage(); await p.settle(); const before = p.loads.length;
  p.doc.querySelector('#workflow-new').click(); p.doc.querySelector('#workflow-name').value = '尚未保存';
  p.doc.querySelector('#workflow-prompt').value = '保留这段提示词';
  for (let n = 0; n < 12; n++) { p.manage(); await p.settle(); p.call('openDeepSeek'); p.call('openSettings'); await p.settle(); }
  assert.equal(p.loads.length, before); assert.equal(p.doc.querySelector('#workflow-name').value, '尚未保存');
  assert.equal(p.doc.querySelector('#workflow-prompt').value, '保留这段提示词'); assert.equal(p.doc.querySelector('#workflow-editor').hidden, false);
});

test('设置页延迟加载时等待初始化，加载完成后仍进入管理工作流', async t => {
  const p = await panel(t); p.blank(); p.delayed(true); p.manage();
  await p.settle(2);
  assert.equal(p.controller.openWorkflows, true);
  p.delayed(false); p.finish(); await p.settle();
  assert.equal(p.doc.querySelector('#workflows-panel').hidden, false); assert.equal(p.controller.openWorkflows, false);
  assert.equal(p.controller.settingsRecoveryButton.hidden, true);
});

test('设置加载失败显示原生重试按钮，点击恢复；晚到的成功通知也能恢复', async t => {
  const p = await panel(t); p.blank(); p.failing(true); p.manage(); await p.settle();
  assert.equal(p.controller.settingsRecoveryButton.hidden, false); assert.equal(p.controller.settingsRecoveryButton.enabled, true);
  assert.match(p.controller.settingsRecoveryButton.title, /点击重试/);
  p.failing(false); p.call('retrySettings'); await p.settle();
  assert.equal(p.doc.querySelector('#workflows-panel').hidden, false); assert.equal(p.controller.settingsRecoveryButton.hidden, true);
  p.blank(); p.failing(true); p.call('openSettings'); await p.settle();
  p.failing(false); p.finish(); await p.settle();
  assert.ok(p.doc.querySelector('#settings-main')); assert.equal(p.controller.settingsRecoveryButton.hidden, true);
});

test('设置检查期间换页或关闭，旧回调不会重新加载设置、弹出提示或影响 AI 草稿', async t => {
  const p = await panel(t); p.manage(); await p.settle();
  const before = p.loads.length; p.blank(); p.manage(); p.call('openDeepSeek'); await p.settle();
  assert.equal(p.loads.length, before); assert.equal(p.controller.activePage, 'deepseek');
  assert.ok(!p.controller.settingsRecoveryButton || p.controller.settingsRecoveryButton.hidden);
  const nativeFiles = Array.from(p.h.files.keys());
  p.call('openSettings'); p.context.AIBPanel.hide(p.controller); await p.settle();
  assert.equal(p.controller.visible, false); assert.equal(p.loads.length, before);
  assert.deepEqual(Array.from(p.h.files.keys()), nativeFiles);
  assert.equal(p.controller.webView.requests.length, 1);
});

test('设置页子框架完成通知不导致重复刷新或重新加载', async t => {
  const p = await panel(t); p.manage(); await p.settle();
  const before = p.loads.length, scripts = p.controller.settingsView.scripts.length;
  for (let n = 0; n < 20; n++) p.call('webViewDidFinishLoad', p.controller.settingsView);
  await p.settle(); assert.equal(p.loads.length, before); assert.equal(p.controller.settingsView.scripts.length, scripts);
});

test('重建前的工作流跳转回调晚到时，不清除新页面的跳转请求', async t => {
  const p = await panel(t); p.manage(); await p.settle();
  const view = p.controller.settingsView, evaluate = view.evaluateJavaScript, held = [];
  view.evaluateJavaScript = function (code, callback) {
    if (code.startsWith('Boolean(')) held.push({ code, callback }); else evaluate.call(this, code, callback);
  };
  p.manage(); await p.settle(2); assert.equal(held.length, 1);
  p.blank(); p.manage(); await p.settle(); assert.equal(held.length, 2);
  const pending = p.controller.workflowRevealPending;
  held[0].callback(true); await flush(); assert.equal(p.controller.workflowRevealPending, pending); assert.equal(p.controller.openWorkflows, true);
  held[1].callback(view.dom.window.eval(held[1].code)); await p.settle();
  assert.equal(p.controller.openWorkflows, false); assert.equal(p.doc.querySelector('#workflows-panel').hidden, false);
});
