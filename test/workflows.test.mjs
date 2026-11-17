import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { nativeScene, plain, picture } from './native-support.mjs';

const workflow = (overrides = {}) => ({ name: '讲解题目', site: 'deepseek', cardItems: [1, 3], handwriting: 'last', extraText: '请讲解这道题', ...overrides });
const path = '/documents/AI-Bridge/workflows.json';
function save(h, item = workflow()) { const store = h.context.AIBWorkflows; return store.save({ expectedRevision: store.read().revision, workflow: item }); }

test('排序包括恢复显示的豆包，列表与网页读取同一顺序，重启仍保留', () => {
  const h = nativeScene(), d = h.open(), store = h.context.AIBWorkflows;
  for (const [name, site] of [['甲', 'deepseek'], ['豆包', 'doubao'], ['乙', 'gpt'], ['丙', 'gemini']]) save(h, workflow({ name, site }));
  const before = plain(store.read()), target = before.items[2];
  const sorted = store.move({ expectedRevision: before.revision, id: target.id, direction: -1 });
  assert.deepEqual(Array.from(sorted.items, item => item.name), ['甲', '乙', '豆包', '丙']);
  assert.deepEqual(plain(sorted.items[2]), before.items[1]);
  for (const item of sorted.items) assert.deepEqual(plain(item), before.items.find(old => old.id === item.id));
  const restored = nativeScene({ files: h.files }).context.AIBWorkflows.visible();
  assert.deepEqual(Array.from(restored.items, item => item.name), ['甲', '乙', '豆包', '丙']);
  let response;
  d.controller.settingsView.evaluateJavaScript = (code, callback) => { response = JSON.parse(code.match(/__AIB_BRIDGE_RECEIVE__\((.*)\)$/)[1]); callback(true); };
  const request = { command: 'getWorkflows', token: 'settings', requestId: 'read-order' };
  h.context.AIBWebCommands.local(d.controller, 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify(request)), d.controller.settingsView);
  assert.deepEqual(response.payload.items.map(item => item.id), Array.from(restored.items, item => item.id));
});

test('排序拒绝过期版本和非法请求，保存失败保留顺序，首尾越界不写文件', () => {
  const h = nativeScene(), store = h.context.AIBWorkflows; save(h); const before = save(h, workflow({ name: '第二个' }));
  const first = before.items[0], last = before.items[1], payload = { expectedRevision: before.revision, id: first.id, direction: 1 };
  const original = Buffer.from(h.files.get(path)), writes = h.writes.length;
  store.move({ ...payload, direction: -1 }); store.move({ ...payload, id: last.id });
  assert.equal(h.writes.length, writes);
  for (const invalid of [{ direction: 0 }, { direction: '1' }, { id: 'wf-missing' }, { expectedRevision: 'old' }]) assert.throws(() => store.move({ ...payload, ...invalid }));
  h.failWrite(path); assert.throws(() => store.move(payload), /保存失败/); assert.deepEqual(h.files.get(path), original);
  h.failWrite(''); store.move(payload);
  assert.throws(() => store.move(payload), /其他窗口更新/);
});

test('直接读取用户已移到 AI-Bridge 的工作流，只在新目录保存，不读取或清理旧目录', () => {
  const seed = nativeScene(), record = save(seed), bytes = Buffer.from(seed.files.get(path));
  const oldPath = '/documents/cn.marginnote.ai-bridge/workflows.json', oldBytes = Buffer.from('旧目录原样保留');
  const files = new Map([[path, bytes], [oldPath, oldBytes]]), h = nativeScene({ files }), store = h.context.AIBWorkflows;
  assert.deepEqual(plain(store.read()), plain(record));
  const updated = save(h, { ...record.items[0], name: '新目录修改' });
  assert.equal(updated.items[0].name, '新目录修改'); assert.equal(h.writes.at(-1).path, path);
  assert.deepEqual(files.get(oldPath), oldBytes);
  const oldOnly = nativeScene({ files: new Map([[oldPath, bytes]]) });
  assert.equal(oldOnly.context.AIBWorkflows.read().items.length, 0);
  assert.equal(oldOnly.files.has(path), false); assert.equal(oldOnly.writes.length, 0);
  assert.deepEqual(oldOnly.files.get(oldPath), bytes);
});

test('工作流通过原生文件保存、修改、删除并在重启后恢复，不覆盖通用设置', () => {
  const h = nativeScene(), store = h.context.AIBWorkflows;
  h.context.AIBSettings.write({ cardItems: [2], handwriting: 'none', extraText: '通用提示词' }); const before = Array.from(h.values);
  let record = save(h, workflow({ cardItems: [3, 1, 3] })); const first = record.items[0];
  assert.deepEqual(Array.from(first.cardItems), [1, 3]); assert.match(first.id, /^wf-/); assert.ok(record.revision);
  assert.equal(h.writes.at(-1).atomic, true); assert.equal(h.writes.at(-1).path, path);
  assert.deepEqual(plain(nativeScene({ files: h.files }).context.AIBWorkflows.read()), plain(record));
  record = save(h, { ...first, site: 'gpt', name: '检查答案', handwriting: 'mindmap' });
  assert.equal(record.items.length, 1); assert.equal(record.items[0].site, 'gpt');
  assert.deepEqual(Array.from(h.values), before);
  assert.equal(store.remove({ expectedRevision: record.revision, id: first.id }).items.length, 0);
  assert.throws(() => store.get(first.id), /不存在/);
});

test('两个窗口的旧版本编辑被拒绝，磁盘写入失败保留原文件', () => {
  const h = nativeScene(), first = save(h), bytes = Buffer.from(h.files.get(path));
  const other = nativeScene({ files: h.files }); save(other, workflow({ name: '第二个' }));
  assert.throws(() => h.context.AIBWorkflows.save({ expectedRevision: first.revision, workflow: { ...first.items[0], name: '旧编辑' } }), /其他窗口更新/);
  const current = Buffer.from(h.files.get(path)); h.failWrite(path);
  assert.throws(() => save(h, workflow({ name: '无法保存' })), /保存失败/);
  assert.deepEqual(h.files.get(path), current); assert.notDeepEqual(current, bytes);
});

test('损坏或不兼容的工作流文件不会被空列表覆盖', () => {
  for (const text of ['', '{broken', JSON.stringify({ schema: 2, revision: 'x', items: [] }), JSON.stringify({ schema: 1, revision: 'x', items: [workflow({ id: 'wf-a', site: 'bad' })] })]) {
    const h = nativeScene({ files: new Map([[path, Buffer.from(text)]]) });
    assert.throws(() => h.context.AIBWorkflows.read());
    assert.throws(() => h.context.AIBWorkflows.save({ expectedRevision: '', workflow: workflow() }));
    assert.equal(h.files.get(path).toString(), text); assert.equal(h.writes.length, 0);
  }
});

test('限制重复名称、无效来源、空内容及数量；纯提示词工作流可保存', () => {
  const h = nativeScene(), store = h.context.AIBWorkflows; save(h);
  assert.throws(() => save(h), /名称已存在/);
  for (const input of [workflow({ name: ' ' }), workflow({ site: 'https://evil.invalid' }), workflow({ cardItems: [0] }), workflow({ handwriting: 'clipboard' }), workflow({ cardItems: [], handwriting: 'none', extraText: ' ' })]) assert.throws(() => store.validate(input));
  assert.equal(store.validate(workflow({ cardItems: [], handwriting: 'none' })).cardItems.length, 0);
  for (let n = 1; n < 20; n++) save(h, workflow({ name: '流程 ' + n }));
  assert.throws(() => save(h, workflow({ name: '第 21 个' })), /最多保存 20/);
});

function execution(item = workflow(), options = {}) {
  const h = nativeScene(), d = h.open(), contexts = new Map(), calls = [], bundles = [], media = [];
  const book = { notebookId: 'book', mindmapView: { selViewLst: [{ noteId: 'note' }] } };
  h.context.Application.sharedInstance().studyController(d.addon.window).notebookController = book;
  h.context.Database = { sharedInstance: () => ({ getNoteById: id => ({ noteId: id, notebookId: 'book' }) }) };
  h.context.AIBMedia = { cancel() {}, read: async (c, operation) => { media.push(plain({ settings: operation.settings, noteId: operation.source.noteId })); options.onMedia?.(h, d); operation.guard(); return { text: '卡片文字\n' + operation.settings.extraText, files: [{ name: '手写.png', base64: picture }] }; } };
  for (const name of ['AIBNotes', 'AIBSites', 'AIBUpload']) vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), h.context);
  for (const site of h.context.AIBSites.all(d.controller)) {
    let text = '';
    const web = vm.createContext({ window: { [site.prefix.replace('window.', '')]: {
      context: () => { calls.push([site.name, 'context']); options.onContext?.(h, d); return { composer: site.name }; },
      prepare: () => { calls.push([site.name, 'prepare']); text = ''; return true; },
      append: (token, offset, chunk) => { text += chunk; return true; },
      commit: () => { calls.push([site.name, 'commit']); bundles.push(JSON.parse(text)); return true; },
      read: () => ({ status: 'handed-off', message: '请检查附件并发送' }), cancel: () => true,
      send: () => assert.fail('工作流不自动发送')
    } } }); contexts.set(site.name, web);
    d.controller[site.viewKey] = { evaluateJavaScript: (code, callback) => callback(vm.runInContext(code, web)) };
  }
  let injected = 0;
  h.context.AIBPanel = {
    show(c) { c.visible = true; options.onShow?.(h, d); },
    page(c, name, temporary) { assert.equal(temporary, true); h.context.AIBWorkflowRunner.cancel(c); c.activePage = name; calls.push(['page', name]); },
    async inject(c, site) { if (++injected >= (options.readyAfter || 1)) site.token = 'ready'; }
  };
  h.context.AIBNative.delay = async seconds => { if (seconds === .5) await options.onWait?.(h, d); };
  h.context.AIBSettings.write({ cardItems: [2], handwriting: 'none', extraText: '通用设置' });
  const stored = save(h, item).items[0];
  return { h, d, book, stored, calls, media, bundles, run: originSite => h.context.AIBWorkflowRunner.run(d.addon, stored.id, originSite) };
}

for (const site of ['deepseek', 'doubao', 'gpt', 'gemini']) test(site + ' 工作流打开对应网页，用专用范围上传并保留通用设置', async () => {
  const e = execution(workflow({ site, cardItems: [2, 4], handwriting: 'mindmap', extraText: '检查我的手写' }), { readyAfter: 3 });
  const before = plain(e.h.context.AIBSettings.read()); await e.run();
  assert.equal(e.d.controller.activePage, site); assert.equal(e.d.controller.workflowRun, null); assert.equal(e.d.controller.uploadOperation, null);
  assert.deepEqual(e.media, [{ settings: { schema: 2, cardItems: [2, 4], handwriting: 'mindmap', extraText: '检查我的手写' }, noteId: 'note' }]);
  assert.equal(e.bundles.length, 1); assert.equal(e.bundles[0].text, '卡片文字\n检查我的手写'); assert.equal(e.bundles[0].files[0].name, '手写.png');
  assert.deepEqual(plain(e.h.context.AIBSettings.read()), before);
  assert.deepEqual(e.calls.filter(row => row[1] === 'commit'), [[site, 'commit']]);
});

test('纯提示词工作流无需选卡或媒体读取，只有提示词被填入目标网页', async () => {
  const e = execution(workflow({ cardItems: [], handwriting: 'none', site: 'gpt' })); e.book.mindmapView.selViewLst = [];
  await e.run(); assert.equal(e.media.length, 0); assert.deepEqual(e.bundles, [{ text: '请讲解这道题', files: [] }]);
});

test('外部菜单工作流保留卡片快照，清空选中项也可上传，切换焦点后停止', async () => {
  for (const changed of [false, true]) {
    const e = execution(workflow(), { readyAfter: 2, onWait() { if (changed) e.book.focusNote = { noteId: 'another' }; } });
    e.book.focusNote = { noteId: 'note' }; e.book.mindmapView.selViewLst = [];
    const source = e.h.context.AIBNotes.captureExternal(e.d.addon, { noteId: 'note', notebookId: 'book' });
    e.h.context.AIBNotes.capture = () => assert.fail('不能重新捕获已被菜单清空的选中项');
    await e.h.context.AIBWorkflowRunner.run(e.d.addon, e.stored.id, null, { source });
    assert.equal(e.bundles.length, changed ? 0 : 1);
    if (changed) assert.match(e.h.hud.at(-1), /卡片已切换/);
    else assert.equal(e.media[0].noteId, 'note');
  }
});

test('打开面板导致选卡发生变化时，不会把后来的卡片作为工作流来源', async () => {
  const e = execution(workflow(), { onShow(h, d) { h.context.Application.sharedInstance().studyController(d.addon.window).notebookController.mindmapView.selViewLst = [{ noteId: 'other' }]; } });
  await e.run(); assert.equal(e.bundles.length, 0); assert.equal(e.media.length, 0); assert.match(e.h.hud.at(-1), /已切换/);
});

test('工作流捕获打开面板前选中的卡片，换卡、关闭或后台时停止等待', async () => {
  for (const action of ['card', 'close', 'background']) {
    let waited = false;
    const e = execution(workflow(), { readyAfter: 3, onWait(h, d) {
      if (waited) return; waited = true;
      if (action === 'card') e.book.mindmapView.selViewLst = [{ noteId: 'another' }];
      if (action === 'close') { d.controller.visible = false; h.context.AIBWorkflowRunner.cancel(d.controller); }
      if (action === 'background') h.call(d.addon, 'sceneWillResignActive');
    } });
    await e.run(); assert.equal(e.bundles.length, 0); assert.equal(e.media.length, 0); assert.equal(e.d.controller.workflowRun, null);
    if (action === 'card') assert.match(e.h.hud.at(-1), /卡片或学习集已切换/);
  }
});

test('重复执行和手动上传不会与等待中的工作流并发，通用设置更改不改写工作流快照', async () => {
  let waited = false;
  const e = execution(workflow(), { readyAfter: 2, async onWait(h, d) {
    if (waited) return; waited = true;
    await e.run(); await h.context.AIBUpload.start(d.controller);
    h.context.AIBSettings.write({ cardItems: [5], handwriting: 'none', extraText: '新的通用设置' });
    save(h, { ...e.stored, extraText: '下一次执行的新提示词' });
  } });
  await e.run(); assert.equal(e.bundles.length, 1); assert.match(e.bundles[0].text, /请讲解这道题/);
  assert.ok(e.h.hud.some(message => /仍在处理中/.test(message))); assert.ok(e.h.hud.some(message => /工作流正在准备/.test(message)));
  assert.equal(e.h.context.AIBSettings.read().extraText, '新的通用设置');
});

test('上传中改变来源会在提交之前停止，网页未就绪时不会读卡或误报成功', async () => {
  const e = execution(workflow(), { onMedia(h, d) { e.book.mindmapView.selViewLst = []; } });
  await e.run(); assert.equal(e.bundles.length, 0); assert.equal(e.d.controller.uploadOperation, null);
  const timeout = execution(workflow(), { readyAfter: 100 }); await timeout.run();
  assert.equal(timeout.media.length, 0); assert.equal(timeout.bundles.length, 0); assert.match(timeout.h.hud.at(-1), /网页尚未就绪/);
});

test('网页 bridge 只能触发普通上传，不能读取、保存或执行原生工作流', () => {
  const h = nativeScene(), d = h.open(); const replies = [];
  h.context.AIBNative.evaluate = async (view, code) => { replies.push(code); };
  const address = command => 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ command, requestId: '1', token: 'settings', payload: { expectedRevision: '', workflow: workflow() } }));
  assert.equal(h.context.AIBWebCommands.local(d.controller, address('saveWorkflow'), {}), false); assert.equal(h.files.has(path), false);
  assert.equal(h.context.AIBWebCommands.local(d.controller, address('saveWorkflow'), d.controller.settingsView), true); assert.equal(h.context.AIBWorkflows.read().items.length, 1);
  h.context.AIBWebCommands.local(d.controller, address('runWorkflow'), d.controller.settingsView); assert.match(replies.at(-1), /不支持的设置命令/);
});

for (const active of ['deepseek', 'doubao', 'gpt', 'gemini']) test(active + ' 网页执行只使用工作流范围和提示词，任何指定网站都不会使当前网页跳转', async () => {
  for (const savedSite of ['deepseek', 'doubao', 'gpt', 'gemini']) {
    const e = execution(workflow({ site: savedSite, cardItems: [2, 4], handwriting: 'mindmap', extraText: '当前页提示词' }));
    e.d.controller.activePage = active; const before = plain(e.h.context.AIBWorkflows.read());
    await e.run(active);
    assert.equal(e.d.controller.activePage, active); assert.equal(e.calls.some(row => row[0] === 'page'), false);
    assert.deepEqual(e.calls.filter(row => row[1] === 'commit'), [[active, 'commit']]);
    assert.deepEqual(e.media, [{ settings: { schema: 2, cardItems: [2, 4], handwriting: 'mindmap', extraText: '当前页提示词' }, noteId: 'note' }]);
    assert.equal(e.bundles[0].text, '卡片文字\n当前页提示词'); assert.deepEqual(plain(e.h.context.AIBWorkflows.read()), before);
  }
});

test('网页工作流开始时或读取目标期间换页、导航，均不回退到工作流指定网站', async () => {
  const stale = execution(workflow({ site: 'deepseek' })); await stale.run('gemini');
  assert.equal(stale.media.length, 0); assert.equal(stale.calls.length, 0); assert.match(stale.h.hud.at(-1), /已切换/);
  for (const changed of ['tab', 'navigation']) {
    const e = execution(workflow({ site: 'deepseek' }), { onContext(h, d) {
      if (changed === 'tab') d.controller.activePage = 'gpt';
      else h.context.AIBSites.get(d.controller, 'gemini').epoch++;
    } });
    e.d.controller.activePage = 'gemini'; await e.run('gemini');
    assert.equal(e.media.length, 0); assert.equal(e.bundles.length, 0); assert.equal(e.calls.some(row => row[0] === 'page'), false);
  }
});
