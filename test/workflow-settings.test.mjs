import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
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
      if (command === 'saveSettings') return payload;
      return plain(scene.command(command, payload));
    } };
  } });
  t.after(() => dom.window.close()); await flush();
  const doc = dom.window.document;
  return { h, calls, window: dom.window, doc, click: id => doc.getElementById(id).click(), async submit() { doc.getElementById('workflow-editor').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await flush(); } };
}

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
  const first = p.doc.querySelector('.workflow-row'); first.querySelector('button').click();
  p.doc.querySelector('#workflow-site').value = 'gpt'; p.click('workflow-clear'); p.doc.querySelector('#workflow-handwriting').value = 'last'; await p.submit();
  let items = plain(p.h.context.AIBWorkflows.read().items); assert.equal(items[0].site, 'gpt'); assert.deepEqual(items[0].cardItems, []); assert.equal(items[1].name, '检查答案');
  let remove = p.doc.querySelectorAll('.workflow-row')[0].querySelectorAll('button')[1]; remove.click();
  assert.equal(p.h.context.AIBWorkflows.read().items.length, 2);
  p.doc.querySelectorAll('.workflow-row')[0].querySelectorAll('button')[1].click(); await flush();
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
  p.doc.querySelector('.workflow-row button').click(); assert.equal(p.doc.querySelector('#workflow-site').value, 'gemini');
  assert.equal(p.h.context.AIBWorkflows.read().items[0].site, 'gemini');
});
