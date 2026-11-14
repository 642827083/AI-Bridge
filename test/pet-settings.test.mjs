import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, pack, picture } from './pet-support.mjs';
import { zipSync, strToU8 } from 'fflate';
import { readPetPack } from '../web/src/pet-pack-file.js';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function page(t, loaded = true) {
  const h = pets(), d = h.open(), calls = [];
  if (loaded) { h.upload(d); h.upload(d, 'image', picture); }
  const dom = new JSDOM(settingsHTML, { url: 'https://settings.invalid/', runScripts: 'dangerously', beforeParse(window) {
    window.mn = { call: async (command, payload) => {
      calls.push({ command, payload });
      if (command === 'getSettings') return { cardItems: [1], handwriting: 'none', extraText: '原提示词' };
      if (command === 'getNavigation') return { sites: ['deepseek'] };
      if (command === 'saveSettings') return payload;
      if (command === 'getWorkflows') return h.context.AIBWorkflows.read();
      return d.command(command, payload);
    } };
  } });
  t.after(() => dom.window.close()); await flush();
  return { h, d, calls, window: dom.window, doc: dom.window.document };
}

test('桌宠设置独立于上传保存区域，仅有显示与导入相关功能', async t => {
  const { doc } = await page(t, false);
  assert.equal(doc.querySelector('#pet-settings').closest('form'), null);
  assert.match(doc.querySelector('#pet-panel .group-heading').textContent, /即时生效/);
  assert.equal(doc.querySelector('#save'), null);
  assert.equal(doc.querySelector('#pet-image-button').disabled, false); assert.equal(doc.querySelector('#pet-pack-button').disabled, false);
  assert.equal(doc.querySelector('#pet-visible').disabled, false);
  assert.equal(doc.querySelector('#pet-current').textContent, '哦鲸鲸');
  assert.equal(doc.querySelector('#pet-use-builtin').getAttribute('aria-pressed'), 'true');
  assert.doesNotMatch(doc.querySelector('#pet-settings').textContent, /AI|讲解|批改|API|动作风格|随机互动/);
});

test('桌宠显示开关与外观直接保存，不提交或覆盖工作流草稿', async t => {
  const { doc, window, d, calls } = await page(t);
  doc.querySelector('#workflow-new').click(); doc.querySelector('#workflow-prompt').value = '还没保存的提示词'; doc.querySelector('#workflow-prompt').dispatchEvent(new window.Event('input', { bubbles: true }));
  doc.querySelector('#pet-visible').click(); await flush(); assert.equal(d.s.settings.visible, false);
  const size = doc.querySelector('#pet-size'); size.value = 88; size.dispatchEvent(new window.Event('change')); await flush(); assert.equal(d.s.settings.size, 88);
  assert.equal(doc.querySelector('#pet-size-value').textContent, '88');
  assert.equal(doc.querySelector('#workflow-prompt').value, '还没保存的提示词');
  assert.equal(calls.filter(c => c.command === 'saveSettings' || c.command === 'saveWorkflow').length, 0);
});

test('切换两种桌宠后预览和当前名称更新，但不会重复导入或改动卡片选择', async t => {
  const { doc, d, calls } = await page(t);
  assert.equal(doc.querySelector('#pet-current').textContent, '图片角色');
  doc.querySelector('#pet-use-pack').click(); await flush();
  assert.equal(d.s.settings.source, 'pack'); assert.equal(doc.querySelector('#pet-current').textContent, '小鲸');
  assert.equal(doc.querySelector('#pet-preview-image').hidden, false); assert.match(doc.querySelector('#pet-preview-image').src, /^data:image\/png;base64,/);
  assert.equal(doc.querySelector('#cardChoices'), null);
  assert.equal(calls.some(c => /importPet/.test(c.command)), false);
  doc.querySelector('#pet-use-builtin').click(); await flush(); await flush();
  assert.equal(d.s.settings.source, 'builtin'); assert.equal(doc.querySelector('#pet-current').textContent, '哦鲸鲸');
  assert.equal(doc.querySelector('#pet-use-builtin').getAttribute('aria-pressed'), 'true');
});

test('外观保存失败恢复已保存状态，并明确提示错误', async t => {
  const { doc, window } = await page(t);
  const call = window.mn.call; window.mn.call = async (command, payload) => { if (command === 'setPetOptions') throw Error('保存故障'); return call(command, payload); };
  const opacity = doc.querySelector('#pet-opacity'); opacity.value = 40; opacity.dispatchEvent(new window.Event('change')); await flush();
  assert.equal(opacity.value, '100'); assert.equal(doc.querySelector('#pet-status').textContent, '保存故障'); assert.equal(opacity.disabled, false);
});

test('已导入图片和动作包均可确认删除，自带哦鲸鲸没有删除入口，提示词草稿保留', async t => {
  const { doc, window, d, calls } = await page(t);
  doc.querySelector('#workflow-new').click(); doc.querySelector('#workflow-prompt').value = '未保存的草稿'; doc.querySelector('#workflow-prompt').dispatchEvent(new window.Event('input', { bubbles: true }));
  const remove = doc.querySelector('#pet-delete'), cancel = doc.querySelector('#pet-delete-cancel');
  remove.click(); assert.equal(remove.textContent, '确认删除'); assert.equal(d.s.settings.source, 'image');
  cancel.click(); assert.equal(remove.textContent, '删除当前桌宠'); assert.equal(d.s.settings.source, 'image');
  remove.click(); remove.click(); await flush(); await flush();
  assert.equal(d.s.settings.source, 'builtin'); assert.equal(d.s.customPet.base64, '');
  assert.equal(doc.querySelector('#pet-current').textContent, '哦鲸鲸'); assert.equal(doc.querySelector('#pet-delete-row').hidden, true);
  assert.equal(doc.querySelector('#pet-use-image').disabled, true);
  doc.querySelector('#pet-use-pack').click(); await flush();
  assert.equal(doc.querySelector('#pet-delete-row').hidden, false); remove.click(); remove.click(); await flush();
  assert.equal(d.s.petPack, null); assert.equal(d.s.settings.source, 'builtin'); assert.equal(doc.querySelector('#pet-use-pack').disabled, true);
  assert.equal(doc.querySelector('#workflow-prompt').value, '未保存的草稿'); assert.equal(calls.some(c => c.command === 'saveSettings'), false);
});

test('删除保存失败保留预览和选择，错误可重试，切换角色会取消待确认删除', async t => {
  const { doc, d, h } = await page(t), remove = doc.querySelector('#pet-delete');
  h.failWrite('/documents/AI-Bridge/custom-pet.json'); remove.click(); remove.click(); await flush();
  assert.equal(d.s.settings.source, 'image'); assert.equal(doc.querySelector('#pet-current').textContent, '图片角色');
  assert.match(doc.querySelector('#pet-status').textContent, /删除失败/); assert.equal(remove.disabled, false);
  doc.querySelector('#pet-use-pack').click(); await flush();
  assert.equal(remove.textContent, '删除当前桌宠'); assert.equal(doc.querySelector('#pet-delete-cancel').hidden, true);
  doc.querySelector('#pet-use-image').click(); await flush(); h.failWrite(''); remove.click(); remove.click(); await flush();
  assert.equal(d.s.settings.source, 'builtin'); assert.equal(doc.querySelector('#pet-delete-row').hidden, true);
});

test('桌宠包导入器在解码图片前拒绝路径穿越、额外脚本、损坏 ZIP 和超限文件', async () => {
  const h = pets(); globalThis.AIBPetPackModel = h.context.AIBPetPackModel;
  try {
    const file = (name, bytes) => ({ name, size: bytes.length, arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
    for (const name of ['../pet.json', 'main.js', 'actions/bad.webp']) {
      const bytes = zipSync({ [name]: strToU8('{}') }); await assert.rejects(readPetPack(file('test.mnpet', bytes)), /不支持|桌宠包/);
    }
    await assert.rejects(readPetPack(file('test.mnpet', new Uint8Array(30))), /有效/);
    await assert.rejects(readPetPack({ name: 'big.mnpet', size: 11 * 1024 * 1024 }), /10 MiB/);
    await assert.rejects(readPetPack({ name: 'photo.png', size: 50 }), /mnpet/);
    const missing = zipSync({ 'pet.json': strToU8(JSON.stringify(pack.manifest)) });
    await assert.rejects(readPetPack(file('test.mnpet', missing)), /缺少 poster.png/);
  } finally { delete globalThis.AIBPetPackModel; }
});
