import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function environment() {
  const values = new Map(), notices = [], views = [{ note: { noteId: 'note-1' } }];
  const notebook = { notebookId: 'book-1', mindmapView: { selViewLst: views } };
  const study = { notebookController: notebook, view: { bounds: { x: 0, y: 0, width: 1024, height: 768 } } };
  const notes = new Map([['note-1', { noteId: 'note-1', notebookId: 'book-1' }]]);
  const context = vm.createContext({ console, Application: { sharedInstance: () => ({ studyController: () => study, showHUD: text => notices.push(text) }) },
    Database: { sharedInstance: () => ({ getNoteById: id => notes.get(id) }) },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: key => values.get(key), setObjectForKey: (value, key) => values.set(key, value) }) },
    NSTimer: { scheduledTimerWithTimeInterval: (seconds, repeat, callback) => { const timer = setTimeout(callback, Math.min(seconds * 1000, 50)); return { invalidate: () => clearTimeout(timer) }; } }
  });
  for (const name of ['AIBNative', 'AIBSettings', 'AIBNotes', 'AIBMedia', 'AIBSites', 'AIBUpload', 'WebBridgeCommands', 'AIBWindow']) {
    vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), context);
  }
  const controller = { addon: { window: {} }, activePage: 'deepseek', visible: true, pageEpoch: 0 };
  return { context, controller, values, notices, notebook, notes, study };
}
test('设置按插件前缀保存，非法旧数据恢复默认值', () => {
  const { context, values } = environment();
  assert.equal(context.AIBSettings.read().handwriting, 'none');
  const settings = { cardItems: [1], handwriting: 'mindmap', extraText: '请检查推导' };
  context.AIBSettings.write(settings); assert.equal(context.AIBSettings.read().extraText, settings.extraText);
  assert.equal(typeof values.get('cn.marginnote.ai-bridge.settings'), 'string');
  values.set('cn.marginnote.ai-bridge.settings', '{bad'); assert.equal(context.AIBSettings.read().handwriting, 'none');
  assert.throws(() => context.AIBSettings.write({ ...settings, extraText: 'x'.repeat(10001) }), /设置内容无效/);
});
test('单选来源固定，换卡、删卡或多选都会拒绝', () => {
  const { context, controller, notebook, notes } = environment(); const source = context.AIBNotes.capture(controller);
  source.validate(); notebook.mindmapView.selViewLst.push({ note: { noteId: 'note-2' } }); assert.throws(() => source.validate(), /一张/);
  notebook.mindmapView.selViewLst.pop(); notes.delete('note-1'); assert.throws(() => source.validate(), /删除/);
});
test('媒体分块校验来源、顺序、总长度及图片字节数', () => {
  const { context, controller } = environment(); let finished = null;
  const panel = {}, operation = { guard() {}, settings: {}, source: { noteId: 'note-1', notebookId: 'book-1' } };
  function request() { controller.mediaRequest = { panel, operation, token: 'media', chunks: [], offset: 0, finish: (value, error) => { finished = { value, error }; } }; }
  request(); assert.equal(context.AIBMedia.receive(controller, { phase: 'ready' }, panel).noteId, 'note-1');
  assert.throws(() => context.AIBMedia.receive(controller, { phase: 'begin', token: 'forged', length: 10 }, panel), /来源不符/);
  request(); context.AIBMedia.receive(controller, { phase: 'ready' }, panel);
  const payload = JSON.stringify({ text: '文字', files: [] });
  context.AIBMedia.receive(controller, { phase: 'begin', token: 'media', length: payload.length }, panel);
  assert.throws(() => context.AIBMedia.receive(controller, { phase: 'chunk', token: 'media', offset: 1, text: payload }, panel), /分块/);
  assert.ok(finished.error);
  const file = { name: '手写.png', type: 'image/png', bytes: Buffer.from(PNG, 'base64').length, base64: PNG };
  assert.equal(context.AIBMedia.validBundle({ text: '', files: [file] }).files.length, 1);
  assert.throws(() => context.AIBMedia.validBundle({ text: '', files: [{ ...file, bytes: 3 }] }), /不完整/);
});
test('未开放官方面板时返回可操作提示', async () => {
  const { context, controller } = environment(); await assert.rejects(context.AIBMedia.read(controller, {}), /4.5.0/);
});
test('网页求值超时能够结束，避免上传按钮永久忙碌', async () => {
  const { context } = environment(); await assert.rejects(context.AIBNative.evaluate({ evaluateJavaScript() {} }, '1'), /超时/);
});
test('设置 bridge 拒绝远程视图及伪造 token', () => {
  const { context, controller, values } = environment(); controller.settingsView = {}; controller.settingsToken = 'correct';
  const request = { token: 'wrong', requestId: '1', command: 'saveSettings', payload: { cardItems: [1], handwriting: 'mindmap', extraText: '' } };
  const url = 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify(request));
  assert.equal(context.AIBWebCommands.local(controller, url, controller.settingsView), false);
  assert.equal(context.AIBWebCommands.local(controller, url, {}), false); assert.equal(values.size, 0);
});
test('远程网页只能用当前网站 token 触发上传', () => {
  const { context, controller } = environment(); let uploads = 0;
  context.AIBUpload.start = () => uploads++; controller.webView = {}; controller.gptView = {};
  context.AIBSites.get(controller, 'deepseek').token = 'current'; context.AIBSites.get(controller, 'gpt').token = 'gpt-current';
  const remote = (token, view = controller.webView) => context.AIBWebCommands.remote(controller, 'aibridge://upload?token=' + token, view);
  assert.equal(remote('old'), false); assert.equal(remote('current'), true);
  assert.equal(remote('gpt-current', controller.gptView), false);
  controller.activePage = 'gpt'; assert.equal(remote('current'), false);
  assert.equal(remote('current', controller.gptView), false); assert.equal(remote('gpt-current', controller.gptView), true);
  assert.equal(remote('gpt-current', {}), false);
  controller.visible = false; assert.equal(remote('gpt-current', controller.gptView), false); assert.equal(uploads, 2);
});

test('导航设置仅通过本地设置页保存并刷新导航，拒绝空网页列表', () => {
  const { context, controller } = environment();
  controller.settingsView = {}; controller.settingsToken = 'settings';
  let refreshed = 0; const replies = [];
  context.AIBPanel = { refreshNavigation(c) { assert.equal(c, controller); refreshed++; } };
  context.AIBNative.evaluate = async (view, script) => { replies.push(script); };
  const send = (sites, view = controller.settingsView) => context.AIBWebCommands.local(controller,
    'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ token: 'settings', requestId: 'nav', command: 'saveNavigation', payload: { sites } })), view);
  assert.equal(send(['gpt'], {}), false); assert.equal(refreshed, 0);
  assert.equal(send(['gpt']), true); assert.equal(refreshed, 1);
  assert.deepEqual(Array.from(context.AIBSettings.readNavigation().sites), ['gpt']);
  assert.equal(send([]), true); assert.equal(refreshed, 1);
  assert.match(replies.at(-1), /至少保留一个网页/);
  assert.deepEqual(Array.from(context.AIBSettings.readNavigation().sites), ['gpt']);
});

for (const name of ['deepseek', 'doubao', 'gpt', 'gemini']) test(name + ' 完整上传调用顺序、清理及只报告附件交付', async () => {
  const { context, controller, notices } = environment(); const calls = [];
  controller.activePage = name;
  const site = context.AIBSites.get(controller), view = controller[site.viewKey] = {};
  const webContext = vm.createContext({ window: { [site.prefix.replace('window.', '')]: {
    context: () => { calls.push('context'); return { id: 'web' }; },
    prepare: () => { calls.push('prepare'); return true; }, append: () => { calls.push('append'); return true; },
    commit: () => { calls.push('commit'); return true; }, read: () => ({ status: 'handed-off', message: '图片已交给 DeepSeek 处理，请检查附件上传状态后发送' }), cancel: () => true
  } } });
  view.evaluateJavaScript = (code, callback) => callback(vm.runInContext(code, webContext));
  for (const other of context.AIBSites.all(controller)) if (other !== site) controller[other.viewKey] = { evaluateJavaScript() { assert.fail('上传不应调用另一网站'); } };
  let panel;
  context.AddonWebPanel = { panel: () => (panel = {
    loadPanel: () => true, hideFloating() { calls.push('hide-media'); },
    showFloatingIn() {
      queueMicrotask(() => {
        const input = panel.onMessage('receiveMedia', { phase: 'ready' });
        const data = JSON.stringify({ text: '卡片', files: [] });
        panel.onMessage('receiveMedia', { phase: 'begin', token: input.token, length: data.length });
        panel.onMessage('receiveMedia', { phase: 'chunk', token: input.token, offset: 0, text: data });
        panel.onMessage('receiveMedia', { phase: 'finish', token: input.token });
      });
    }
  }) };
  await context.AIBUpload.start(controller);
  assert.deepEqual(calls, ['context', 'hide-media', 'prepare', 'append', 'commit']);
  assert.equal(controller.uploadOperation, null); assert.equal(controller.mediaRequest, null);
  assert.match(notices.at(-1), /请检查附件/);
});
test('读取途中换卡，中断操作且释放上传状态', async () => {
  const { context, controller, notebook, notices } = environment(); let commits = 0;
  controller.webView = { evaluateJavaScript: (code, callback) => { if (code.includes('.commit(')) commits++; callback(JSON.stringify({ value: { id: 'web' } })); } };
  let panel;
  context.AddonWebPanel = { panel: () => (panel = {
    loadPanel: () => true, hideFloating() {}, showFloatingIn() {
      queueMicrotask(() => {
        notebook.notebookId = 'other';
        try { panel.onMessage('receiveMedia', { phase: 'ready' }); } catch (ignored) {}
      });
    }
  }) };
  await context.AIBUpload.start(controller); assert.equal(commits, 0); assert.equal(controller.uploadOperation, null); assert.match(notices.at(-1), /学习集/);
});
test('小屏幕与坏窗口数据都能恢复到可见范围', () => {
  const { context, controller, study, values } = environment();
  study.view.bounds = { x: 0, y: 0, width: 320, height: 240 }; controller.view = { frame: { x: 0, y: 0, width: 1, height: 1 } };
  values.set('cn.marginnote.ai-bridge.windowFrame', JSON.stringify({ x: -999, y: 999, width: 9999, height: 9999 }));
  const frame = context.AIBWindow.layout(controller); assert.ok(frame.x >= 0 && frame.y >= 0 && frame.x + frame.width <= 320 && frame.y + frame.height <= 240);
});

test('切换网站后，取消命令仍只发给原网页', async () => {
  const { context, controller, notices } = environment(); const calls = [];
  controller.webView = { evaluateJavaScript(code, callback) {
    calls.push(code.includes('.cancel(') ? 'cancel-deepseek' : 'context-deepseek');
    callback(JSON.stringify({ value: { id: 'web' } }));
  } };
  controller.gptView = { evaluateJavaScript() { assert.fail('旧任务不应触碰 GPT 草稿'); } };
  context.AIBMedia.read = async () => { controller.activePage = 'gpt'; context.AIBUpload.cancel(controller); return { text: '卡片', files: [] }; };
  await context.AIBUpload.start(controller);
  assert.deepEqual(calls, ['context-deepseek', 'cancel-deepseek']); assert.equal(controller.uploadOperation, null);
  assert.equal(notices.length, 0);
});

for (const delivery of ['none', 'possible']) test('网页明确交付状态为 ' + delivery + ' 时上传提示准确', async () => {
  const { context, controller, notices } = environment();
  context.AIBMedia.read = async () => ({ text: '卡片', files: [] });
  controller.webView = { evaluateJavaScript(code, callback) {
    const value = code.includes('.read(') ? { status: 'error', delivery, message: '图片交付失败' } : code.includes('.context(') ? { id: 'web' } : true;
    callback(JSON.stringify({ value }));
  } };
  await context.AIBUpload.start(controller);
  if (delivery === 'none') assert.equal(notices.at(-1), '图片交付失败');
  else assert.match(notices.at(-1), /可能已加入网页/);
  assert.equal(controller.uploadOperation, null);
});

test('豆包的上传 token 与其他网页隔离，后台网页与伪造 token 均无效', () => {
  const { context, controller } = environment(); let uploads = 0;
  context.AIBUpload.start = () => uploads++; controller.webView = {}; controller.gptView = {}; controller.doubaoView = {};
  context.AIBSites.get(controller, 'doubao').token = 'doubao-token'; context.AIBSites.get(controller, 'gpt').token = 'gpt-token';
  const address = 'aibridge://upload?token=doubao-token';
  assert.equal(context.AIBWebCommands.remote(controller, address, controller.doubaoView), false);
  controller.activePage = 'doubao'; assert.equal(context.AIBWebCommands.remote(controller, address, controller.gptView), false);
  assert.equal(context.AIBWebCommands.remote(controller, 'aibridge://upload?token=gpt-token', controller.doubaoView), false);
  assert.equal(context.AIBWebCommands.remote(controller, address, controller.doubaoView), true); assert.equal(uploads, 1);
  controller.visible = false;
  assert.equal(context.AIBWebCommands.remote(controller, address, controller.doubaoView), false); assert.equal(uploads, 1);
});
