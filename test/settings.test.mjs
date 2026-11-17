import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
const defaults = { schema: 2, cardItems: [1, 3], handwriting: 'last', extraText: '原有提示词 $x^2$' };
function native() {
  const values = new Map();
  const context = vm.createContext({ AIBNative: { preference: (key, fallback) => values.get(key) ?? fallback, save: (key, value) => values.set(key, value) } });
  vm.runInContext(readFileSync('src/AIBSettings.js', 'utf8'), context);
  return { settings: context.AIBSettings, values };
}
async function page(t, settings = defaults, handler, configure) {
  const calls = [];
  const dom = new JSDOM(settingsHTML, { url: 'https://settings.invalid/', runScripts: 'dangerously', beforeParse(window) {
    if (configure) configure(window);
    window.mn = { call: async (command, payload) => {
      if (command === 'getSettings') return structuredClone(settings);
      if (command === 'getWorkflows') return { schema: 1, revision: '', items: [] };
      if (command === 'getNavigation') return { sites: ['deepseek', 'doubao'] };
      calls.push(structuredClone(payload)); return handler ? handler(payload) : payload;
    } };
  } });
  t.after(() => dom.window.close()); await flush();
  return { host: dom.window, doc: dom.window.document, calls };
}
test('旧版两种上传来源迁移为独立设置，保留附加提示词', () => {
  const { settings } = native();
  assert.deepEqual(JSON.parse(JSON.stringify(settings.normalize({ source: 'card', extraText: '旧提示' }))), { schema: 2, cardItems: [1], handwriting: 'none', extraText: '旧提示' });
  assert.deepEqual(Array.from(settings.normalize({ source: 'mindmap', attachText: false }).cardItems), []);
  assert.deepEqual(Array.from(settings.normalize({ source: 'mindmap', attachText: true }).cardItems), [1]);
  assert.equal(settings.normalize({ source: 'mindmap' }).handwriting, 'mindmap');
});
test('多选条目去重排序并原生保存，空选择也能保存', () => {
  const { settings, values } = native();
  settings.write({ cardItems: [3, 1, 3], handwriting: 'last', extraText: '保持不变' });
  assert.deepEqual(Array.from(settings.read().cardItems), [1, 3]); assert.equal(JSON.parse(values.get('settings')).handwriting, 'last');
  settings.write({ cardItems: [], handwriting: 'none', extraText: '' }); assert.deepEqual(Array.from(settings.read().cardItems), []);
  for (const items of [[0], [-1], [1.5], ['2'], [10001]]) assert.throws(() => settings.write({ cardItems: items, handwriting: 'none', extraText: '' }), /无效/);
  assert.throws(() => settings.write({ cardItems: [1], handwriting: 'clipboard', extraText: '' }), /无效/);
});
test('切换仅淡入新内容，重复点击当前分类不重启动画，快速切换取消旧动画', async t => {
  const animations = [];
  const { doc } = await page(t, defaults, null, window => {
    window.matchMedia = () => ({ matches: false });
    window.HTMLElement.prototype.animate = function (frames, options) {
      const record = { id: this.id, frames, options, cancelled: false, cancel() { this.cancelled = true; } };
      animations.push(record); return record;
    };
  });
  const slider = doc.querySelector('.settings-navigation-slider');
  doc.querySelector('#navigation-tab').click(); doc.querySelector('#navigation-tab').click();
  assert.equal(animations.length, 1); assert.equal(animations[0].id, 'navigation-panel');
  assert.deepEqual(Array.from(animations[0].frames, frame => frame.opacity), [.4, 1]);
  assert.equal(animations[0].options.duration, 180); assert.equal(animations[0].cancelled, false);
  doc.querySelector('#workflows-tab').click();
  assert.equal(animations[0].cancelled, true); assert.equal(animations[1].id, 'workflows-panel');
  assert.equal(doc.querySelector('.settings-navigation-slider'), slider);
  assert.equal(doc.querySelectorAll('.settings-navigation-slider').length, 1);
});

test('减少动态效果时保留分类切换而不播放内容动画', async t => {
  let animations = 0;
  const { doc } = await page(t, defaults, null, window => {
    window.matchMedia = () => ({ matches: true });
    window.HTMLElement.prototype.animate = () => { animations++; };
  });
  doc.querySelector('#navigation-tab').click(); assert.equal(animations, 0);
  assert.equal(doc.querySelector('#navigation-panel').hidden, false);
});

test('设置分类支持方向键切换和首尾定位，焦点只进入当前分类', async t => {
  const { doc, host } = await page(t);
  const workflow = doc.querySelector('#workflows-tab'), navigation = doc.querySelector('#navigation-tab');
  workflow.focus(); workflow.dispatchEvent(new host.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(doc.activeElement, navigation); assert.equal(workflow.tabIndex, -1); assert.equal(navigation.tabIndex, 0);
  navigation.dispatchEvent(new host.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(doc.activeElement, workflow);
  workflow.dispatchEvent(new host.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(doc.activeElement, navigation);
  navigation.dispatchEvent(new host.KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
  assert.equal(doc.activeElement, workflow); assert.equal(doc.querySelector('#workflows-panel').hidden, false);
});

test('设置只保留工作流和关于插件，默认工作流且切换保留草稿', async t => {
  const { doc } = await page(t);
  assert.deepEqual(Array.from(doc.querySelectorAll('[role="tab"]'), el => el.textContent), ['工作流', '关于插件']);
  assert.equal(doc.querySelector('#workflows-panel').hidden, false);
  assert.equal(doc.querySelector('#pet-panel,#pet-editor,#pet-tab,#settings,#upload-tab,#extraText'), null);
  assert.equal(doc.querySelector('#workflow-editor').closest('[role="tabpanel"]').id, 'workflows-panel');
  assert.deepEqual(Array.from(doc.querySelector('#workflow-site').options, el => el.value), ['deepseek', 'doubao', 'gpt', 'gemini']);
  doc.querySelector('#workflow-new').click(); doc.querySelector('#workflow-prompt').value = '未保存的工作流草稿';
  doc.querySelector('#navigation-tab').click(); doc.querySelector('#workflows-tab').click();
  assert.equal(doc.querySelector('#workflow-prompt').value, '未保存的工作流草稿');
  assert.equal(doc.querySelector('.settings-navigation-slider').style.transform, 'translate3d(0%,0,0)');
  assert.equal(doc.body.textContent.includes('豆包'), true);
});

test('默认勾选 DeepSeek、豆包和设置，网页至少保留一个，GPT 和 Gemini 可自行开启', async t => {
  const { doc, calls } = await page(t);
  const box = name => doc.querySelector('#navigation-fields input[value="' + name + '"]');
  assert.equal(box('deepseek').checked, true); assert.equal(box('deepseek').disabled, false); assert.equal(box('doubao').checked, true);
  assert.equal(box('gpt').checked, false); assert.equal(box('gemini').checked, false);
  box('gpt').click(); await flush(); box('deepseek').click(); await flush();
  box('doubao').click(); await flush();
  assert.deepEqual(calls.map(value => value.sites), [['deepseek', 'doubao', 'gpt'], ['doubao', 'gpt'], ['gpt']]);
  assert.equal(box('gpt').disabled, true);
  const fixed = doc.querySelector('.navigation-required input'); assert.equal(fixed.checked, true); assert.equal(fixed.disabled, true);
});

test('导航保存失败恢复原选择，旧偏好使用新默认值，新偏好保留用户选择', async t => {
  const { doc } = await page(t, defaults, () => ({ error: { message: '写入失败' } }));
  doc.querySelector('#navigation-fields input[value="gpt"]').click(); await flush();
  assert.equal(doc.querySelector('#navigation-fields input[value="gpt"]').checked, false);
  assert.match(doc.querySelector('#navigation-status').textContent, /写入失败/);
  const { settings, values } = native(); settings.write(defaults);
  for (const value of [undefined, 'broken', '[]', JSON.stringify(['gpt']), JSON.stringify({ schema: 2, sites: ['doubao', 'gpt', 'gemini'] })]) {
    values.set('navigationSites', value); assert.deepEqual(Array.from(settings.readNavigation().sites), ['deepseek', 'doubao']);
  }
  settings.writeNavigation({ sites: ['gemini', 'gpt', 'gpt'] }); assert.deepEqual(Array.from(settings.readNavigation().sites), ['gpt', 'gemini']);
  assert.equal(settings.read().extraText, defaults.extraText);
  assert.throws(() => settings.writeNavigation({ sites: [] }), /至少保留一个/);
  assert.throws(() => settings.writeNavigation({ sites: ['unknown'] }), /无效/);
  assert.deepEqual(Array.from(settings.readNavigation().sites), ['gpt', 'gemini']);
  values.set('navigationSites', JSON.stringify({ schema: 3, sites: ['deepseek'] }));
  assert.deepEqual(Array.from(settings.readNavigation().sites), ['deepseek', 'doubao']);
  values.set('navigationSites', JSON.stringify({ schema: 3, sites: ['deepseek', 'gpt', 'gemini'] }));
  assert.deepEqual(Array.from(settings.readNavigation().sites), ['deepseek', 'gpt', 'gemini']);
  settings.writeNavigation({ sites: ['deepseek'] }); assert.deepEqual(Array.from(settings.readNavigation().sites), ['deepseek']);
  settings.writeNavigation({ sites: ['doubao'] }); assert.deepEqual(Array.from(settings.readNavigation().sites), ['doubao']);
  settings.writeNavigation({ sites: ['gemini', 'gpt', 'doubao', 'deepseek'] });
  assert.deepEqual(Array.from(settings.readNavigation().sites), ['deepseek', 'doubao', 'gpt', 'gemini']);
});
