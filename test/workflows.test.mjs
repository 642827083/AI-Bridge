import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { pets, plain, picture } from './pet-support.mjs';

const workflow = (overrides = {}) => ({ name: '讲解题目', site: 'deepseek', cardItems: [1, 3], handwriting: 'last', extraText: '请讲解这道题', ...overrides });
const path = '/documents/AI-Bridge/workflows.json';
function save(h, item = workflow()) { const store = h.context.AIBWorkflows; return store.save({ expectedRevision: store.read().revision, workflow: item }); }

test('直接读取用户已移到 AI-Bridge 的工作流，只在新目录保存，不读取或清理旧目录', () => {
  const seed = pets(), record = save(seed), bytes = Buffer.from(seed.files.get(path));
  const oldPath = '/documents/cn.marginnote.ai-bridge/workflows.json', oldBytes = Buffer.from('旧目录原样保留');
  const files = new Map([[path, bytes], [oldPath, oldBytes]]), h = pets({ files }), store = h.context.AIBWorkflows;
  assert.deepEqual(plain(store.read()), plain(record));
  const updated = save(h, { ...record.items[0], name: '新目录修改' });
  assert.equal(updated.items[0].name, '新目录修改'); assert.equal(h.writes.at(-1).path, path);
  assert.deepEqual(files.get(oldPath), oldBytes);
  const oldOnly = pets({ files: new Map([[oldPath, bytes]]) });
  assert.equal(oldOnly.context.AIBWorkflows.read().items.length, 0);
  assert.equal(oldOnly.files.has(path), false); assert.equal(oldOnly.writes.length, 0);
  assert.deepEqual(oldOnly.files.get(oldPath), bytes);
});

test('工作流通过原生文件保存、修改、删除并在重启后恢复，不覆盖通用设置', () => {
  const h = pets(), store = h.context.AIBWorkflows;
  h.context.AIBSettings.write({ cardItems: [2], handwriting: 'none', extraText: '通用提示词' }); const before = Array.from(h.values);
  let record = save(h, workflow({ cardItems: [3, 1, 3] })); const first = record.items[0];
  assert.deepEqual(Array.from(first.cardItems), [1, 3]); assert.match(first.id, /^wf-/); assert.ok(record.revision);
  assert.equal(h.writes.at(-1).atomic, true); assert.equal(h.writes.at(-1).path, path);
  assert.deepEqual(plain(pets({ files: h.files }).context.AIBWorkflows.read()), plain(record));
  record = save(h, { ...first, site: 'gpt', name: '检查答案', handwriting: 'mindmap' });
  assert.equal(record.items.length, 1); assert.equal(record.items[0].site, 'gpt');
  assert.deepEqual(Array.from(h.values), before);
  assert.equal(store.remove({ expectedRevision: record.revision, id: first.id }).items.length, 0);
  assert.throws(() => store.get(first.id), /不存在/);
});

test('两个窗口的旧版本编辑被拒绝，磁盘写入失败保留原文件', () => {
  const h = pets(), first = save(h), bytes = Buffer.from(h.files.get(path));
  const other = pets({ files: h.files }); save(other, workflow({ name: '第二个' }));
  assert.throws(() => h.context.AIBWorkflows.save({ expectedRevision: first.revision, workflow: { ...first.items[0], name: '旧编辑' } }), /其他窗口更新/);
  const current = Buffer.from(h.files.get(path)); h.failWrite(path);
  assert.throws(() => save(h, workflow({ name: '无法保存' })), /保存失败/);
  assert.deepEqual(h.files.get(path), current); assert.notDeepEqual(current, bytes);
});

test('损坏或不兼容的工作流文件不会被空列表覆盖', () => {
  for (const text of ['', '{broken', JSON.stringify({ schema: 2, revision: 'x', items: [] }), JSON.stringify({ schema: 1, revision: 'x', items: [workflow({ id: 'wf-a', site: 'bad' })] })]) {
    const h = pets({ files: new Map([[path, Buffer.from(text)]]) });
    assert.throws(() => h.context.AIBWorkflows.read());
    assert.throws(() => h.context.AIBWorkflows.save({ expectedRevision: '', workflow: workflow() }));
    assert.equal(h.files.get(path).toString(), text); assert.equal(h.writes.length, 0);
  }
});

test('限制重复名称、无效来源、空内容及数量；纯提示词工作流可保存', () => {
  const h = pets(), store = h.context.AIBWorkflows; save(h);
  assert.throws(() => save(h), /名称已存在/);
  for (const input of [workflow({ name: ' ' }), workflow({ site: 'https://evil.invalid' }), workflow({ cardItems: [0] }), workflow({ handwriting: 'clipboard' }), workflow({ cardItems: [], handwriting: 'none', extraText: ' ' })]) assert.throws(() => store.validate(input));
  assert.equal(store.validate(workflow({ cardItems: [], handwriting: 'none' })).cardItems.length, 0);
  for (let n = 1; n < 20; n++) save(h, workflow({ name: '流程 ' + n }));
  assert.throws(() => save(h, workflow({ name: '第 21 个' })), /最多保存 20/);
});

test('桌宠右上角三横线展开工作流名称，长列表布局后仍可滚动到底，拖动或后台时关闭', () => {
  const h = pets(), d = h.open(); h.upload(d, 'image', picture);
  for (let n = 1; n <= 10; n++) save(h, workflow({ name: '流程 ' + n }));
  const plus = d.s.workflowButton; assert.equal(plus.superview, d.s.view.superview); assert.notEqual(plus.superview, d.s.view);
  assert.equal(plus.selector, 'petWorkflowMenu:'); assert.equal(plus.target, d.addon);
  const parent = d.s.view.superview, panel = new h.context.UIView({ x: 0, y: 0, width: 700, height: 500 }); parent.addSubview(panel);
  h.context.AIBPets.front(d.addon); assert.equal(parent.subviews.at(-1), plus); assert.equal(parent.subviews.at(-2), d.s.view);
  h.call(d.addon, 'petWorkflowMenu');
  assert.equal(d.s.workflowMenuButtons.length, 10); assert.equal(d.s.workflowRowLabels[9].name.text, '流程 10');
  assert.equal(d.s.workflowRowLabels[9].site.text, 'DeepSeek');
  assert.equal(plus.title, ''); assert.equal(plus.subviews.length, 3);
  assert.ok(plus.subviews.every(view => view.userInteractionEnabled === false));
  assert.equal(plus.accessibilityLabel, '收起工作流');
  h.context.AIBPets.layout(d.addon);
  assert.equal(d.s.workflowScroll.contentSize.height, 480); assert.ok(d.s.workflowScroll.frame.height < 480);
  h.call(d.addon, 'petPan', { state: 1, translationInView: () => ({ x: 2, y: 3 }) });
  assert.equal(d.s.workflowMenu, null); assert.equal(plus.accessibilityLabel, '展开工作流');
  h.call(d.addon, 'petWorkflowMenu'); h.call(d.addon, 'sceneWillResignActive');
  assert.equal(d.s.workflowMenu, null); assert.equal(plus.superview, null);
  h.call(d.addon, 'sceneDidDisconnect'); assert.equal(d.s.workflowButton, null);
});

test('三横线在桌宠右上，列表默认在上方，窗口边缘始终可收起', () => {
  const h = pets(), bounds = { width: 1024, height: 768 }, pet = { x: 700, y: 450, width: 112, height: 112 };
  const plan = h.context.AIBWorkflowPet.geometry(bounds, pet, 2);
  assert.ok(plan.toggle.x > pet.x && plan.toggle.y === pet.y);
  assert.equal(plan.menu.x + plan.menu.width, plan.toggle.x + plan.toggle.width);
  assert.ok(plan.menu.y + plan.menu.height < plan.toggle.y);
  const top = h.context.AIBWorkflowPet.geometry(bounds, { ...pet, y: 64 }, 3);
  assert.ok(top.menu.x + top.menu.width < pet.x, '顶边不足时菜单移到角色外侧，保留完整形象');
  for (const size of [{ width: 1024, height: 768 }, { width: 320, height: 240 }]) {
    for (const x of [0, (size.width - 112) / 2, size.width - 112]) for (const y of [0, (size.height - 112) / 2, size.height - 112]) {
      const frame = h.context.AIBWorkflowPet.geometry(size, { ...pet, x, y }, 20);
      for (const item of [frame.toggle, frame.menu]) {
        assert.ok(item.width > 0 && item.height > 0);
        assert.ok(item.x >= 8 && item.y >= 8 && item.x + item.width <= size.width - 8 && item.y + item.height <= size.height - 8);
      }
      const m = frame.menu, t = frame.toggle;
      assert.ok(m.x + m.width <= t.x || m.x >= t.x + t.width || m.y + m.height <= t.y || m.y >= t.y + t.height);
    }
  }
});

test('角色被重新置前后，拖动与布局会恢复按钮和菜单的显示及点击层级', () => {
  const h = pets(), d = h.open(), parent = d.s.view.superview;
  const abovePet = () => {
    assert.ok(parent.subviews.indexOf(d.s.workflowButton) > parent.subviews.indexOf(d.s.view), '按钮点击层级高于桌宠');
    assert.ok(d.s.workflowButton.layer.zPosition > (d.s.view.layer.zPosition || 0), '按钮显示层级高于桌宠');
    if (d.s.workflowMenu) {
      assert.ok(parent.subviews.indexOf(d.s.workflowMenu) > parent.subviews.indexOf(d.s.view));
      assert.ok(parent.subviews.indexOf(d.s.workflowButton) > parent.subviews.indexOf(d.s.workflowMenu));
      assert.ok(d.s.workflowMenu.layer.zPosition > (d.s.view.layer.zPosition || 0));
      assert.ok(d.s.workflowButton.layer.zPosition > d.s.workflowMenu.layer.zPosition);
    }
  };
  parent.addSubview(d.s.view); d.s.view.layer.zPosition = 4;
  h.call(d.addon, 'controllerWillLayoutSubviews'); abovePet();
  h.call(d.addon, 'petWorkflowMenu'); parent.addSubview(d.s.view);
  h.call(d.addon, 'controllerWillLayoutSubviews'); abovePet();
  parent.addSubview(d.s.view);
  h.call(d.addon, 'petPan', { state: 1, translationInView: () => ({ x: 2000, y: 2000 }) }); abovePet();
  h.upload(d); abovePet();
  d.command('setPetOptions', { source: 'builtin' }); abovePet();
  h.call(d.addon, 'sceneWillResignActive'); h.call(d.addon, 'sceneDidBecomeActive'); d.s.mountTimer.fire(); abovePet();
  h.context.AIBPets.front(d.addon); abovePet();
});

test('工作流菜单只接收当前行按钮，添加入口打开设置桌宠工作流区域', async () => {
  const h = pets(), d = h.open(); h.upload(d, 'image', picture); const item = save(h).items[0], runs = [];
  h.context.AIBWorkflowRunner.run = (addon, id) => runs.push([addon, id]);
  h.call(d.addon, 'petWorkflowMenu'); h.call(d.addon, 'petRunWorkflow', { tag: 0 }); assert.equal(runs.length, 0);
  const button = d.s.workflowMenuButtons[0]; h.call(d.addon, 'petRunWorkflow', button);
  assert.deepEqual(runs, [[d.addon, item.id]]); assert.equal(d.s.workflowMenu, null);
  h.call(d.addon, 'petRunWorkflow', button); assert.equal(runs.length, 1);
  const pages = []; h.context.AIBPanel.show = c => { c.visible = true; }; h.context.AIBPanel.page = (c, page) => { c.activePage = page; pages.push(page); };
  h.call(d.addon, 'petManageWorkflows'); await Promise.resolve(); await Promise.resolve();
  assert.deepEqual(pages, ['settings']); assert.ok(d.controller.settingsView.scripts.some(code => code.includes('__AIB_OPEN_WORKFLOWS__')));
});

function execution(item = workflow(), options = {}) {
  const h = pets(), d = h.open(), contexts = new Map(), calls = [], bundles = [], media = [];
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

for (const site of ['deepseek', 'gpt', 'gemini']) test(site + ' 工作流打开对应网页，用专用范围上传并保留通用设置', async () => {
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
  const h = pets(), d = h.open(); const replies = [];
  h.context.AIBNative.evaluate = async (view, code) => { replies.push(code); };
  const address = command => 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ command, requestId: '1', token: 'settings', payload: { expectedRevision: '', workflow: workflow() } }));
  assert.equal(h.context.AIBWebCommands.local(d.controller, address('saveWorkflow'), {}), false); assert.equal(h.files.has(path), false);
  assert.equal(h.context.AIBWebCommands.local(d.controller, address('saveWorkflow'), d.controller.settingsView), true); assert.equal(h.context.AIBWorkflows.read().items.length, 1);
  h.context.AIBWebCommands.local(d.controller, address('runWorkflow'), d.controller.settingsView); assert.match(replies.at(-1), /不支持的设置命令/);
});

for (const active of ['deepseek', 'gpt', 'gemini']) test(active + ' 网页执行只使用工作流范围和提示词，任何指定网站都不会使当前网页跳转', async () => {
  for (const savedSite of ['deepseek', 'gpt', 'gemini']) {
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
