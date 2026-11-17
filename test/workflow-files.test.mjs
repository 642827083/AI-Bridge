import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeScene, plain } from './native-support.mjs';
const workflow = (name = '讲解', patch = {}) => ({ name, site: 'deepseek', cardItems: [1, 3], handwriting: 'mindmap', extraText: '检查步骤\n然后讲解', ...patch });
const archive = items => JSON.stringify({ format: 'ai-bridge-workflows', version: 1, workflows: items });
function setup() {
  const h = nativeScene(), scene = h.open(), store = h.context.AIBWorkflows;
  const command = (name, payload) => plain(h.context.AIBWorkflowFiles.command(scene.controller, name, payload));
  const save = item => store.save({ expectedRevision: store.read().revision, workflow: item });
  const prepare = (text, revision = store.read().revision, id = 'test-import') => {
    command('prepareWorkflowImport', { phase: 'begin', id, length: text.length, expectedRevision: revision });
    for (let offset = 0; offset < text.length; offset += 6000) command('prepareWorkflowImport', { phase: 'chunk', id, offset, text: text.slice(offset, offset + 6000) });
    return command('prepareWorkflowImport', { phase: 'finish', id });
  };
  return { h, scene, store, command, save, prepare };
}
test('工作流选择导出使用系统 JSON 保存，去除本地标识并按原顺序保持完整设置', () => {
  const p = setup(); p.save(workflow()); p.save(workflow('批改', { site: 'gpt', cardItems: [], handwriting: 'none' }));
  const record = p.store.read(); p.command('exportWorkflows', { expectedRevision: record.revision, ids: record.items.map(item => item.id).reverse() });
  const exported = p.h.savedFiles[0]; assert.equal(exported.uti, 'public.json'); assert.match(exported.path, /^\/temp\/AI-Bridge\/Ai-Bridge-Workflows-[a-z0-9-]+\.json$/);
  const data = JSON.parse(p.h.files.get(exported.path));
  assert.deepEqual(data, { format: 'ai-bridge-workflows', version: 1, workflows: [workflow(), workflow('批改', { site: 'gpt', cardItems: [], handwriting: 'none' })] });
  assert.equal(p.store.read().revision, record.revision);
  const imported = setup(), preview = imported.prepare(JSON.stringify(data));
  const result = imported.command('commitWorkflowImport', { id: preview.id, indices: [0, 1] });
  assert.deepEqual(result.items.map(({ id, ...item }) => item), data.workflows);
  assert.ok(result.items.every(item => !record.items.some(old => old.id === item.id)));
});
test('导入只预览不写入，重名自动调整，勾选内容一次原子追加且生成新标识', () => {
  const p = setup(); p.save(workflow()); const before = plain(p.store.read()), writes = p.h.writes.length;
  const preview = p.prepare(archive([workflow(), workflow('讲解'), workflow('数学', { site: 'gemini' })]));
  assert.deepEqual(preview.items.map(item => item.name), ['讲解（导入）', '讲解（导入2）', '数学']);
  assert.deepEqual(plain(p.store.read()), before); assert.equal(p.h.writes.length, writes);
  const result = p.command('commitWorkflowImport', { id: preview.id, indices: [2, 0] });
  assert.deepEqual(result.items.map(item => item.name), ['讲解', '讲解（导入）', '数学']);
  assert.deepEqual(result.items[0], before.items[0]); assert.equal(new Set(result.items.map(item => item.id)).size, 3);
  assert.equal(p.h.writes.length, writes + 1); assert.equal(p.h.writes.at(-1).atomic, true);
  assert.equal(p.scene.controller.workflowImport, null);
});
test('无效格式、版本、不支持的网站、内容、名称、数量和未完成文件均不改原文件', () => {
  const p = setup(); p.save(workflow()); const before = p.h.files.get('/documents/AI-Bridge/workflows.json');
  const invalid = ['{}', '[1]', 'bad json', JSON.stringify({ format: 'ai-bridge-workflows', version: 2, workflows: [workflow()] }), archive([]), archive(Array.from({ length: 21 }, () => workflow())),
    archive([workflow('有效'), workflow('损坏', { cardItems: null })]), archive([workflow('坏名称\n')]), archive([workflow('未知网站', { site: 'unknown' })]), archive([workflow('空', { cardItems: [], handwriting: 'none', extraText: '' })])];
  for (const text of invalid) { assert.throws(() => p.prepare(text)); assert.deepEqual(p.h.files.get('/documents/AI-Bridge/workflows.json'), before); assert.equal(p.scene.controller.workflowImport, null); }
  p.command('prepareWorkflowImport', { phase: 'begin', id: 'incomplete', length: 20, expectedRevision: p.store.read().revision });
  assert.throws(() => p.command('prepareWorkflowImport', { phase: 'finish', id: 'incomplete' }), /不完整/);
  assert.throws(() => p.command('prepareWorkflowImport', { phase: 'begin', id: 'large', length: 1024 * 1024 + 1, expectedRevision: p.store.read().revision }), /1 MB/);
});
test('容量和选择校验包括豆包工作流，失败可减少选择重试，豆包可正常导入导出', () => {
  const p = setup(); for (let n = 0; n < 18; n++) p.save(workflow('原有' + n)); p.save(workflow('豆包工作流', { site: 'doubao' }));
  const preview = p.prepare(archive([workflow('新一'), workflow('新二')])); assert.equal(preview.remaining, 1);
  const revision = p.store.read().revision;
  for (const indices of [[], [0, 0], [-1], [2], ['0'], [0, 1]]) assert.throws(() => p.command('commitWorkflowImport', { id: preview.id, indices }));
  assert.equal(p.store.read().revision, revision); assert.ok(p.scene.controller.workflowImport);
  const visible = p.command('commitWorkflowImport', { id: preview.id, indices: [1] });
  assert.equal(p.store.read().items.length, 20); assert.equal(visible.items.length, 20); assert.equal(visible.items.at(-1).name, '新二');
  const record = p.store.read();
  p.command('exportWorkflows', { expectedRevision: record.revision, ids: visible.items.map(item => item.id) });
  const data = p.h.files.get(p.h.savedFiles[0].path).toString(); assert.equal(data.includes('doubao'), true);
  const imported = setup(), importedPreview = imported.prepare(data);
  const result = imported.command('commitWorkflowImport', { id: importedPreview.id, indices: [18] });
  assert.deepEqual(result.items.map(({ id, ...item }) => item), [workflow('豆包工作流', { site: 'doubao' })]);
});
test('原子保存失败保留原文件和预览，重试只写入一次；并发变更拒绝旧预览', () => {
  const p = setup(); p.save(workflow()); let preview = p.prepare(archive([workflow('追加')]));
  const before = p.h.files.get('/documents/AI-Bridge/workflows.json'); p.h.failWrite('/documents/AI-Bridge/workflows.json');
  assert.throws(() => p.command('commitWorkflowImport', { id: preview.id, indices: [0] }), /保存失败/); assert.deepEqual(p.h.files.get('/documents/AI-Bridge/workflows.json'), before);
  p.h.failWrite(''); p.command('commitWorkflowImport', { id: preview.id, indices: [0] }); assert.equal(p.store.read().items.length, 2);
  preview = p.prepare(archive([workflow('并发')])); p.save(workflow('其他窗口'));
  assert.throws(() => p.command('commitWorkflowImport', { id: preview.id, indices: [0] }), /其他窗口更新/); assert.equal(p.store.read().items.length, 3);
});
test('导入后总文件大小越界时拒绝写入，已有工作流仍可读取', () => {
  const p = setup(), extraText = '\x00'.repeat(10000);
  for (let n = 0; n < 13; n++) p.save(workflow('原有' + n, { extraText }));
  const before = p.h.files.get('/documents/AI-Bridge/workflows.json');
  const preview = p.prepare(archive(Array.from({ length: 7 }, (_, n) => workflow('新增' + n, { extraText }))));
  assert.throws(() => p.command('commitWorkflowImport', { id: preview.id, indices: [0, 1, 2, 3, 4, 5, 6] }), /总内容超过/);
  assert.deepEqual(p.h.files.get('/documents/AI-Bridge/workflows.json'), before); assert.equal(p.store.read().items.length, 13);
});
test('取消、超时和后台释放导入，过期取消不会清除新传输，非设置页面不能导入导出', () => {
  const p = setup(), text = archive([workflow()]);
  p.prepare(text, '', 'old'); p.prepare(text, '', 'new');
  p.command('cancelWorkflowImport', { id: 'old' }); assert.equal(p.scene.controller.workflowImport.id, 'new');
  p.command('cancelWorkflowImport', { id: 'new' }); assert.equal(p.scene.controller.workflowImport, null);
  p.prepare(text); p.h.timers.findLast(timer => timer.seconds === 600).fire();
  assert.throws(() => p.command('commitWorkflowImport', { id: 'test-import', indices: [0] }), /失效/);
  p.prepare(text); p.h.call(p.scene.addon, 'sceneWillResignActive'); assert.equal(p.scene.controller.workflowImport, null);
  assert.throws(() => p.prepare(text), /设置页/); p.h.call(p.scene.addon, 'sceneDidBecomeActive');
  p.prepare(text); p.h.addonClass.statics.applicationDidEnterBackground(); assert.equal(p.scene.controller.workflowImport, null);
  p.scene.controller.activePage = 'gpt'; assert.throws(() => p.command('exportWorkflows', { ids: [] }), /设置页/);
  assert.equal(p.store.read().items.length, 0);
});
test('长中文和表情通过真实桥接分块导入，越界和错误令牌无法写入', async () => {
  const p = setup(), c = p.scene.controller, text = archive([workflow('中文😀', { extraText: '题😀'.repeat(3000) })]);
  let requestIndex = 0;
  async function send(command, payload, token = c.settingsToken) {
    const address = 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ token, requestId: String(++requestIndex), command, payload }));
    assert.ok(address.length < 100000);
    const count = c.settingsView.scripts.length;
    p.h.context.AIBWebCommands.local(c, address, c.settingsView); await Promise.resolve();
    if (c.settingsView.scripts.length === count) return null;
    const reply = JSON.parse(c.settingsView.scripts.at(-1).slice('window.__AIB_BRIDGE_RECEIVE__('.length, -1));
    assert.equal(reply.error, null); return reply.payload;
  }
  assert.equal(await send('prepareWorkflowImport', { phase: 'begin', id: 'bridge', expectedRevision: '', length: text.length }, 'wrong'), null);
  assert.equal(c.workflowImport, undefined);
  await send('prepareWorkflowImport', { phase: 'begin', id: 'bridge', expectedRevision: '', length: text.length });
  for (let offset = 0; offset < text.length;) { let end = Math.min(text.length, offset + 6000); if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--; await send('prepareWorkflowImport', { phase: 'chunk', id: 'bridge', offset, text: text.slice(offset, end) }); offset = end; }
  await send('prepareWorkflowImport', { phase: 'finish', id: 'bridge' });
  const record = await send('commitWorkflowImport', { id: 'bridge', indices: [0] }); assert.equal(record.items[0].extraText, '题😀'.repeat(3000));
});
