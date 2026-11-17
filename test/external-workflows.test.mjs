import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { nativeScene, plain } from './native-support.mjs';

function setup(cards = true) {
  const h = nativeScene(), subscriptions = [], removed = [], replies = [], runs = [];
  h.context.NSNotificationCenter = { defaultCenter: () => ({
    addObserverSelectorName: (target, selector, name) => subscriptions.push({ target, selector, name }),
    removeObserverName: (target, name) => removed.push({ target, name }),
    postNotificationNameObjectUserInfo: (name, window, info) => replies.push({ name, window, payload: JSON.parse(info.payload) })
  }) };
  const d = h.open(), store = h.context.AIBWorkflows;
  const notebook = { notebookId: 'book', focusNote: { noteId: 'note' }, mindmapView: { selViewLst: [{ noteId: 'note' }] } };
  const app = h.context.Application.sharedInstance(); app.focusWindow = d.addon.window;
  h.context.Application.sharedInstance = () => app;
  app.studyController(d.addon.window).notebookController = notebook;
  h.context.Database = { sharedInstance: () => ({ getNoteById: id => id === 'note' ? { noteId: id, notebookId: 'book' } : null }) };
  vm.runInContext(readFileSync('src/AIBNotes.js', 'utf8'), h.context);
  const record = store.save({ expectedRevision: '', workflow: { name: '检查解题', site: 'gpt', cardItems: cards ? [1, 3] : [], handwriting: cards ? 'mindmap' : 'none', extraText: '专用提示词' } });
  h.context.AIBWorkflowRunner.run = (addon, id, origin, external) => { external.source?.validate(); runs.push({ addon, id, origin, external }); };
  const request = (payload, window = d.addon.window) => h.call(d.addon, 'receiveExternalWorkflow', { object: window, userInfo: { payload: JSON.stringify({ version: 1, requestId: 'request-one', ...payload }) } });
  const list = (withCard = cards) => { request({ action: 'list', ...(withCard ? { noteId: 'note', notebookId: 'book' } : {}) }); return replies.at(-1).payload; };
  const run = ticket => request({ action: 'run', id: record.items[0].id, token: ticket.token });
  return { h, d, store, record, notebook, app, subscriptions, removed, replies, runs, request, list, run };
}

test('联动注册与解除观察；列表只返回名称和网页，不读取媒体或执行上传', () => {
  const p = setup(), before = Buffer.from(p.h.files.get('/documents/AI-Bridge/workflows.json'));
  assert.equal(p.subscriptions.length, 1); assert.equal(p.subscriptions[0].selector, 'receiveExternalWorkflow:');
  const result = p.list(); assert.equal(result.ok, true); assert.equal(p.runs.length, 0);
  assert.deepEqual(result.items, [{ id: p.record.items[0].id, name: '检查解题', site: 'gpt' }]);
  assert.equal(JSON.stringify(result).includes('专用提示词'), false);
  assert.deepEqual(p.h.files.get('/documents/AI-Bridge/workflows.json'), before);
  p.h.call(p.d.addon, 'sceneDidDisconnect'); assert.equal(p.removed.length, 1); assert.equal(p.d.addon.externalWorkflowTicket, null);
});

test('联动执行消费一次性列表，传递原卡片快照；选中项被菜单清空后仍使用原卡片', () => {
  const p = setup(), ticket = p.list(); p.notebook.mindmapView.selViewLst = [];
  p.run(ticket); assert.equal(p.replies.at(-1).payload.ok, true); assert.equal(p.runs.length, 1);
  assert.equal(p.runs[0].external.source.noteId, 'note'); assert.equal(p.runs[0].id, p.record.items[0].id);
  assert.equal(p.runs[0].origin, null); assert.equal(p.d.addon.externalWorkflowTicket, null);
  p.run(ticket); assert.equal(p.runs.length, 1); assert.match(p.replies.at(-1).payload.error, /已失效/);
});

test('工作流变化、卡片或窗口切换、过期令牌和后台状态均拒绝旧联动请求', () => {
  for (const change of ['workflow', 'card', 'window', 'expired', 'token', 'background']) {
    const p = setup(), ticket = p.list();
    if (change === 'workflow') p.store.save({ expectedRevision: p.record.revision, workflow: { ...plain(p.record.items[0]), name: '已改名' } });
    if (change === 'card') p.notebook.mindmapView.selViewLst = [{ noteId: 'another' }];
    if (change === 'window') p.app.focusWindow = {};
    if (change === 'expired') p.d.addon.externalWorkflowTicket.at -= 61000;
    if (change === 'token') ticket.token = 'wrong';
    if (change === 'background') p.h.call(p.d.addon, 'sceneWillResignActive');
    p.run(ticket); assert.equal(p.runs.length, 0, change); assert.equal(p.replies.at(-1).payload.ok, false, change);
  }
});

test('跨窗口和非法协议请求被忽略；纯提示词无需选卡，有卡片范围时拒绝缺少上下文', () => {
  const p = setup(); p.request({ action: 'list' }, {}); p.request({ action: 'list', version: 2 }); p.request({ action: 'list', requestId: '' });
  assert.equal(p.replies.length, 0); p.run(p.list(false)); assert.equal(p.runs.length, 0); assert.match(p.replies.at(-1).payload.error, /选中一张卡片/);
  const prompt = setup(false); prompt.notebook.mindmapView.selViewLst = []; prompt.run(prompt.list(false));
  assert.equal(prompt.runs.length, 1); assert.equal(prompt.runs[0].external.source, null);
});
