import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
const importedText = items => JSON.stringify({ format: 'ai-bridge-workflows', version: 1, workflows: items });
async function chooseFile(p, text, size = Buffer.byteLength(text)) {
  const input = p.doc.querySelector('#workflow-file');
  Object.defineProperty(input, 'files', { configurable: true, value: [{ size, text: async () => text }] });
  input.dispatchEvent(new p.window.Event('change'));
  for (let n = 0; n < 12; n++) await flush();
}
async function page(t, h = pets()) {
  const scene = h.open(), calls = [];
  const dom = new JSDOM(settingsHTML, { url: 'https://settings.invalid/', runScripts: 'dangerously', beforeParse(window) {
    window.mn = { call: async (command, payload) => {
      calls.push({ command, payload });
      if (command === 'getSettings') return { cardItems: [1], handwriting: 'none', extraText: '通用提示词' };
      if (command === 'getNavigation') return { sites: ['deepseek'] };
      if (command === 'getWorkflows') return plain(h.context.AIBWorkflows.visible());
      if (command === 'saveWorkflow') return plain(h.context.AIBWorkflows.save(payload));
      if (command === 'deleteWorkflow') return plain(h.context.AIBWorkflows.remove(payload));
      if (command === 'moveWorkflow') return plain(h.context.AIBWorkflows.visible(h.context.AIBWorkflows.move(payload)));
      if (['prepareWorkflowImport', 'commitWorkflowImport', 'cancelWorkflowImport', 'exportWorkflows'].includes(command)) return plain(h.context.AIBWorkflowFiles.command(scene.controller, command, payload));
      if (command === 'saveSettings') return payload;
      return plain(scene.command(command, payload));
    } };
  } });
  t.after(() => dom.window.close()); await flush();
  const doc = dom.window.document;
  return { h, calls, window: dom.window, doc, click: id => doc.getElementById(id).click(), async submit() { doc.getElementById('workflow-editor').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await flush(); } };
}

test('复制完整设置到新草稿，取消不写入，保存保留原项且自动避免副本重名', async t => {
  const h = pets(), store = h.context.AIBWorkflows;
  const original = store.save({ expectedRevision: '', workflow: { name: '纯提示词', site: 'gemini', cardItems: [], handwriting: 'none', extraText: '只给我提示\n不要答案' } }).items[0];
  const p = await page(t, h), before = h.writes.length;
  p.doc.querySelector('[data-action="copy"]').click();
  assert.equal(p.doc.querySelector('#workflow-name').value, '纯提示词（副本）'); assert.equal(p.doc.querySelector('#workflow-site').value, 'gemini');
  assert.equal(p.doc.querySelector('#workflow-handwriting').value, 'none'); assert.equal(p.doc.querySelector('#workflow-prompt').value, original.extraText);
  assert.equal(p.doc.querySelector('#workflow-card-choices input:checked'), null);
  assert.equal(p.doc.querySelector('#workflow-import').disabled, true); assert.equal(p.doc.querySelector('#workflow-export').disabled, true);
  p.click('workflow-cancel'); assert.equal(h.writes.length, before);
  p.doc.querySelector('[data-action="copy"]').click(); await p.submit();
  const record = plain(store.read()); assert.equal(record.items.length, 2); assert.deepEqual(record.items[0], plain(original));
  assert.deepEqual({ ...record.items[1], id: '', name: original.name }, { ...plain(original), id: '' });
  p.doc.querySelector('[data-action="copy"]').click(); assert.equal(p.doc.querySelector('#workflow-name').value, '纯提示词（副本2）');
});

test('导入先预览和勾选，自动重命名，取消保留原列表并允许重选同一文件', async t => {
  const p = await page(t), store = p.h.context.AIBWorkflows;
  const item = { name: '讲解', site: 'gpt', cardItems: [2, 7], handwriting: 'last', extraText: '<img src=x onerror=alert(1)>\n检查手写' };
  await chooseFile(p, importedText([item, { ...item, name: '批改' }]));
  assert.equal(p.doc.querySelector('#workflow-transfer').hidden, false); assert.equal(store.read().items.length, 0);
  assert.equal(p.doc.querySelector('#workflow-transfer-list img'), null); assert.equal(p.doc.querySelector('#workflow-new').disabled, true);
  p.doc.querySelector('#workflow-transfer-list input[value="1"]').click();
  assert.equal(p.doc.querySelector('#workflow-transfer-count').textContent, '已选 1 / 2');
  p.click('workflow-transfer-confirm'); await flush(); assert.equal(store.read().items.length, 1);
  assert.deepEqual({ ...plain(store.read().items[0]), id: undefined }, { ...item, id: undefined });
  await chooseFile(p, importedText([item])); assert.equal(p.doc.querySelector('#workflow-transfer-list strong').textContent, '讲解（导入）');
  p.click('workflow-transfer-cancel'); await flush(); assert.equal(store.read().items.length, 1);
  assert.equal(p.doc.querySelector('#workflow-transfer').hidden, true);
  await chooseFile(p, importedText([item])); p.click('workflow-transfer-confirm'); await flush();
  assert.deepEqual(plain(store.read().items.map(value => value.name)), ['讲解', '讲解（导入）']);
});

test('导出支持勾选并调用系统保存，空选择无法导出，取消不会生成文件', async t => {
  const h = pets(), store = h.context.AIBWorkflows;
  for (const name of ['讲解', '批改']) store.save({ expectedRevision: store.read().revision, workflow: { name, site: 'deepseek', cardItems: [1], handwriting: 'none', extraText: '' } });
  const p = await page(t, h); p.click('workflow-export'); p.click('workflow-select-none');
  assert.equal(p.doc.querySelector('#workflow-transfer-confirm').disabled, true); assert.equal(h.savedFiles.length, 0);
  p.click('workflow-transfer-cancel'); await flush(); assert.equal(h.savedFiles.length, 0);
  p.click('workflow-export'); p.doc.querySelector('#workflow-transfer-list input[value="0"]').click();
  p.click('workflow-transfer-confirm'); await flush();
  assert.equal(h.savedFiles.length, 1); assert.equal(p.doc.querySelector('#workflow-transfer').hidden, true);
  assert.match(p.doc.querySelector('#workflow-status').textContent, /保存窗口/);
  const exported = JSON.parse(h.files.get(h.savedFiles[0].path)); assert.deepEqual(exported.workflows.map(item => item.name), ['批改']);
});

test('损坏或过大的导入文件可重试，保存失败保留勾选和原列表', async t => {
  const p = await page(t), item = { name: '讲解', site: 'deepseek', cardItems: [1], handwriting: 'none', extraText: '检查' };
  await chooseFile(p, 'bad json'); assert.match(p.doc.querySelector('#workflow-status').textContent, /JSON/);
  assert.equal(p.doc.querySelector('#workflow-import').disabled, false);
  await chooseFile(p, importedText([item]), 1024 * 1024 + 1); assert.match(p.doc.querySelector('#workflow-status').textContent, /1 MB/);
  await chooseFile(p, importedText([item])); p.h.failWrite('/documents/AI-Bridge/workflows.json');
  p.click('workflow-transfer-confirm'); await flush(); assert.match(p.doc.querySelector('#workflow-status').textContent, /保存失败/);
  assert.equal(p.doc.querySelector('#workflow-transfer').hidden, false); assert.equal(p.doc.querySelector('#workflow-transfer-list input').checked, true);
  assert.equal(p.h.context.AIBWorkflows.read().items.length, 0);
  p.h.failWrite(''); p.click('workflow-transfer-confirm'); await flush(); assert.equal(p.h.context.AIBWorkflows.read().items.length, 1);
});

test('接近容量上限时可减少导入选择，达到上限禁止复制，长名称副本限制 24 字符', async t => {
  const h = pets(), store = h.context.AIBWorkflows, name = '长名称'.repeat(8), item = { name, site: 'gpt', cardItems: [1], handwriting: 'none', extraText: '' };
  store.save({ expectedRevision: '', workflow: item });
  const p = await page(t, h); p.doc.querySelector('[data-action="copy"]').click();
  assert.equal(p.doc.querySelector('#workflow-name').value.length, 24); p.click('workflow-cancel');
  for (let n = 0; n < 18; n++) store.save({ expectedRevision: store.read().revision, workflow: { ...item, name: '工作流' + n } });
  p.click('workflow-refresh'); await flush(); await chooseFile(p, importedText([{ ...item, name: '新一' }, { ...item, name: '新二' }]));
  p.click('workflow-transfer-confirm'); await flush(); assert.match(p.doc.querySelector('#workflow-status').textContent, /减少导入数量/);
  p.doc.querySelector('#workflow-transfer-list input[value="1"]').click(); p.click('workflow-transfer-confirm'); await flush();
  assert.equal(store.read().items.length, 20); assert.equal(p.doc.querySelector('#workflow-new').disabled, true);
  assert.ok(Array.from(p.doc.querySelectorAll('[data-action="copy"]')).every(button => button.disabled));
});

test('工作流库新增工作流统一保存名称、网站、卡片范围、手写和提示词，重开仍然保留', async t => {
  const p = await page(t); p.click('workflows-tab'); p.click('workflow-new');
  const d = p.doc; assert.equal(d.querySelector('#workflow-editor').closest('#workflows-panel').hidden, false);
  d.querySelector('#workflow-name').value = '检查手写'; d.querySelector('#workflow-site').value = 'gpt';
  d.querySelector('#workflow-card-choices input[value="2"]').click(); d.querySelector('#workflow-handwriting').value = 'mindmap';
  d.querySelector('#workflow-prompt').value = '先检查手写步骤\n再给出改进建议';
  assert.equal(p.calls.filter(call => call.command === 'saveWorkflow').length, 0);
  await p.submit();
  const item = plain(p.h.context.AIBWorkflows.read().items[0]);
  assert.deepEqual({ ...item, id: '' }, { id: '', name: '检查手写', site: 'gpt', cardItems: [1, 2], handwriting: 'mindmap', extraText: '先检查手写步骤\n再给出改进建议' });
  assert.match(d.querySelector('#workflow-list').textContent, /检查手写.*GPT.*第 1 条、第 2 条.*脑图手写.*含提示词/s);
  assert.equal(d.querySelector('#workflow-editor').hidden, true); assert.match(d.querySelector('#workflow-status').textContent, /已保存/);
  assert.equal(p.calls.some(call => call.command === 'saveSettings'), false);
  const reopened = await page(t, p.h); assert.match(reopened.doc.querySelector('#workflow-list').textContent, /检查手写/);
});

test('工作流条目展开可收起并保留隐藏勾选，取消不会保存，提示词 Enter 换行不另存', async t => {
  const p = await page(t); p.click('workflow-new'); p.click('workflow-more');
  const grid = p.doc.querySelector('#workflow-card-choices'); grid.querySelector('input[value="10"]').click();
  p.click('workflow-less'); assert.equal(grid.children.length, 6); assert.match(p.doc.querySelector('#workflow-card-summary').textContent, /第 10 条/);
  p.click('workflow-more'); assert.equal(grid.querySelector('input[value="10"]').checked, true);
  const enter = new p.window.KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
  p.doc.querySelector('#workflow-prompt').dispatchEvent(enter); assert.equal(enter.defaultPrevented, false);
  p.click('pet-tab'); p.click('workflows-tab'); assert.equal(grid.querySelector('input[value="10"]').checked, true);
  p.click('workflow-cancel'); await flush(); assert.equal(p.h.context.AIBWorkflows.read().items.length, 0);
  assert.equal(p.calls.some(call => call.command === 'saveSettings' || call.command === 'saveWorkflow'), false);
});

test('编辑、删除工作流不改动其他工作流，名称作为文本展示', async t => {
  const p = await page(t);
  for (const name of ['<b>讲解</b>', '检查答案']) {
    p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = name; await p.submit();
  }
  assert.equal(p.doc.querySelector('#workflow-list b'), null);
  const first = p.doc.querySelector('.workflow-row'); first.querySelector('[data-action="edit"]').click();
  p.doc.querySelector('#workflow-site').value = 'gpt'; p.click('workflow-clear'); p.doc.querySelector('#workflow-handwriting').value = 'last'; await p.submit();
  let items = plain(p.h.context.AIBWorkflows.read().items); assert.equal(items[0].site, 'gpt'); assert.deepEqual(items[0].cardItems, []); assert.equal(items[1].name, '检查答案');
  let remove = p.doc.querySelectorAll('.workflow-row')[0].querySelector('[data-action="delete"]'); remove.click();
  assert.equal(p.h.context.AIBWorkflows.read().items.length, 2);
  p.doc.querySelectorAll('.workflow-row')[0].querySelector('[data-action="delete"]').click(); await flush();
  items = plain(p.h.context.AIBWorkflows.read().items); assert.equal(items.length, 1); assert.equal(items[0].name, '检查答案');
});

test('保存失败保留整个工作流草稿，刷新不会丢失草稿或允许旧编辑覆盖新版本', async t => {
  const p = await page(t); p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = '未保存的流程'; p.doc.querySelector('#workflow-prompt').value = '未保存的提示词';
  p.h.failWrite('/documents/AI-Bridge/workflows.json'); await p.submit();
  assert.equal(p.doc.querySelector('#workflow-name').value, '未保存的流程'); assert.equal(p.doc.querySelector('#workflow-prompt').value, '未保存的提示词');
  assert.match(p.doc.querySelector('#workflow-status').textContent, /保存失败/); assert.equal(p.doc.querySelector('#workflow-fields').disabled, false);
  p.h.failWrite(''); const other = pets({ files: p.h.files }); other.context.AIBWorkflows.save({ expectedRevision: '', workflow: { name: '另一窗口', site: 'gpt', cardItems: [3], handwriting: 'none', extraText: '' } });
  await p.submit(); assert.match(p.doc.querySelector('#workflow-status').textContent, /其他窗口更新/);
  p.click('workflow-refresh'); await flush(); assert.equal(p.doc.querySelector('#workflow-prompt').value, '未保存的提示词');
  await p.submit(); assert.match(p.doc.querySelector('#workflow-status').textContent, /其他窗口更新/);
  assert.equal(p.h.context.AIBWorkflows.read().items[0].name, '另一窗口');
});

test('无效空工作流被拒绝，纯提示词工作流可保存，管理入口选中工作流分类', async t => {
  const p = await page(t); p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = '提示词'; p.click('workflow-clear');
  await p.submit(); assert.match(p.doc.querySelector('#workflow-status').textContent, /请选择上传内容或填写提示词/);
  p.doc.querySelector('#workflow-prompt').value = '解释所选概念'; await p.submit();
  assert.equal(p.h.context.AIBWorkflows.read().items[0].cardItems.length, 0);
  p.click('pet-tab'); assert.equal(p.window.__AIB_OPEN_WORKFLOWS__(), true);
  assert.equal(p.doc.querySelector('#workflows-tab').getAttribute('aria-selected'), 'true'); assert.equal(p.doc.querySelector('#workflows-panel').hidden, false);
});

test('工作流可选择 Gemini，保存后摘要和重开编辑均保留目标网站', async t => {
  const p = await page(t); p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = 'Gemini 讲解'; p.doc.querySelector('#workflow-site').value = 'gemini';
  await p.submit(); assert.match(p.doc.querySelector('#workflow-list').textContent, /Gemini/);
  p.doc.querySelector('.workflow-row [data-action="edit"]').click(); assert.equal(p.doc.querySelector('#workflow-site').value, 'gemini');
  assert.equal(p.h.context.AIBWorkflows.read().items[0].site, 'gemini');
});

test('上移下移即时保存顺序，首尾禁用，编辑草稿时不能排序，重开列表保留', async t => {
  const p = await page(t);
  for (const name of ['讲解', '批改', '总结']) { p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = name; await p.submit(); }
  const names = () => Array.from(p.doc.querySelectorAll('.workflow-description strong'), node => node.textContent);
  const move = (index, direction) => p.doc.querySelectorAll('.workflow-row')[index].querySelector('[data-direction="' + direction + '"]');
  assert.equal(move(0, -1).disabled, true); assert.equal(move(2, 1).disabled, true);
  move(1, -1).click(); await flush();
  assert.deepEqual(names(), ['批改', '讲解', '总结']); assert.match(p.doc.querySelector('#workflow-status').textContent, /顺序已保存/);
  assert.ok(p.doc.activeElement.closest('.workflow-row').textContent.includes('批改'));
  move(1, 1).click(); await flush(); assert.deepEqual(names(), ['批改', '总结', '讲解']);
  p.doc.querySelector('.workflow-row [data-action="edit"]').click();
  assert.ok(Array.from(p.doc.querySelectorAll('.workflow-move')).every(button => button.disabled));
  p.click('workflow-cancel');
  const reopened = await page(t, p.h);
  assert.deepEqual(Array.from(reopened.doc.querySelectorAll('.workflow-description strong'), node => node.textContent), names());
});

test('排序失败不改变列表，显示可重试错误；过期列表不能覆盖另一窗口', async t => {
  const p = await page(t);
  for (const name of ['讲解', '批改']) { p.click('workflow-new'); p.doc.querySelector('#workflow-name').value = name; await p.submit(); }
  const down = () => p.doc.querySelector('.workflow-row [data-direction="1"]');
  const names = () => Array.from(p.doc.querySelectorAll('.workflow-description strong'), node => node.textContent);
  p.h.failWrite('/documents/AI-Bridge/workflows.json'); down().click(); await flush();
  assert.deepEqual(names(), ['讲解', '批改']); assert.match(p.doc.querySelector('#workflow-status').textContent, /保存失败/); assert.equal(down().disabled, false);
  p.h.failWrite(''); const store = p.h.context.AIBWorkflows, record = store.read();
  store.move({ expectedRevision: record.revision, id: record.items[0].id, direction: 1 });
  down().click(); await flush(); assert.deepEqual(names(), ['讲解', '批改']); assert.match(p.doc.querySelector('#workflow-status').textContent, /其他窗口更新/);
  p.click('workflow-refresh'); await flush(); assert.deepEqual(names(), ['批改', '讲解']);
});
