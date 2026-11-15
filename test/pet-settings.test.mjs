import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, pack, picture } from './pet-support.mjs';
import { zipSync, strToU8 } from 'fflate';
import { readPetPack } from '../web/src/pet-pack-file.js';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function page(t, loaded = true, imageTools = false) {
  const h = pets(), d = h.open(), calls = [];
  if (loaded) { h.upload(d); h.upload(d, 'image', picture); }
  const dom = new JSDOM(settingsHTML, { url: 'https://settings.invalid/', runScripts: 'dangerously', beforeParse(window) {
    window.scrollTo = (_x, y) => { window.scrollY = y; };
    if (imageTools) {
      window.petDraws = [];
      window.URL.createObjectURL = () => 'blob:pet-test'; window.URL.revokeObjectURL = () => {};
      window.Image = class {
        naturalWidth = 256; naturalHeight = 256;
        set src(value) { if (value) queueMicrotask(() => this.onload?.()); }
      };
      window.HTMLCanvasElement.prototype.getContext = () => ({
        clearRect() {}, drawImage(...args) { window.petDraws.push(args.slice(1)); }, getImageData: () => ({ data: new Uint8ClampedArray(256 * 256 * 4).fill(255) })
      });
      window.HTMLCanvasElement.prototype.toDataURL = () => 'data:image/png;base64,' + picture;
      window.visualViewport = new window.EventTarget();
      window.visualViewport.height = 600; window.visualViewport.offsetTop = 0;
    }
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

async function chooseImage(doc, window, filename = '新桌宠.png') {
  const bytes = Buffer.from(picture, 'base64');
  const file = { name: filename, size: bytes.length, slice: () => ({ arrayBuffer: async () => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) };
  Object.defineProperty(doc.querySelector('#pet-image-file'), 'files', { value: [file], configurable: true });
  doc.querySelector('#pet-image-file').dispatchEvent(new window.Event('change'));
  await flush(); await flush();
}

test('选图直接进入独立预览，取消恢复原页面位置与桌宠，重新选图从顶部开始', async t => {
  const { doc, window, d, calls } = await page(t, true, true);
  const revision = d.s.customPet.revision;
  window.scrollY = 180;
  await chooseImage(doc, window);
  assert.equal(doc.querySelector('#pet-editor').hidden, false);
  assert.equal(doc.querySelector('#settings-main').hidden, true);
  assert.equal(doc.querySelector('#pet-editor').closest('main'), null);
  assert.equal(doc.activeElement.id, 'pet-editor-title');
  assert.equal(doc.querySelector('#pet-confirm').textContent, '确认导入');
  assert.equal(doc.querySelector('#pet-name').value, '新桌宠');
  assert.equal(calls.some(c => c.command === 'importPetImage'), false);
  doc.querySelector('#pet-editor-content').scrollTop = 200;
  doc.querySelector('#pet-cancel').click();
  assert.equal(doc.querySelector('#pet-editor').hidden, true);
  assert.equal(doc.querySelector('#settings-main').hidden, false);
  assert.equal(doc.activeElement.id, 'pet-image-button');
  assert.equal(window.scrollY, 180);
  assert.equal(d.s.customPet.revision, revision);
  await chooseImage(doc, window, '第二张.png');
  assert.equal(doc.querySelector('#pet-editor-content').scrollTop, 0);
  assert.equal(doc.querySelector('#pet-name').value, '第二张');
  assert.equal(doc.querySelector('#pet-zoom').value, '100');
  doc.querySelector('#pet-editor-title').dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(doc.querySelector('#pet-editor').hidden, true);
});

test('导入错误在预览页可见且保留调整，修正后确认返回设置并显示新桌宠', async t => {
  const { doc, window, d, h } = await page(t, true, true);
  await chooseImage(doc, window);
  doc.querySelector('#pet-name').value = ' ';
  doc.querySelector('#pet-confirm').click();
  assert.match(doc.querySelector('#pet-editor-status').textContent, /请输入/);
  assert.equal(doc.querySelector('#pet-editor-status').dataset.error, 'true');
  assert.equal(doc.querySelector('#pet-editor').hidden, false);
  doc.querySelector('#pet-name').value = '我的新角色';
  h.failWrite('/documents/AI-Bridge/custom-pet.json');
  doc.querySelector('#pet-confirm').click(); await flush(); await flush();
  assert.equal(doc.querySelector('#pet-editor').hidden, false);
  assert.equal(doc.querySelector('#pet-name').value, '我的新角色');
  assert.equal(doc.querySelector('#pet-editor-status').dataset.error, 'true');
  assert.equal(doc.querySelector('#pet-confirm').disabled, false);
  h.failWrite('');
  doc.querySelector('#pet-confirm').click(); await flush(); await flush();
  assert.equal(doc.querySelector('#pet-editor').hidden, true);
  assert.equal(doc.querySelector('#settings-main').hidden, false);
  assert.equal(d.s.customPet.name, '我的新角色');
  assert.equal(doc.querySelector('#pet-current').textContent, '我的新角色');
  assert.equal(doc.querySelector('#pet-status').textContent, '图片已导入并显示');
  assert.equal(doc.activeElement.id, 'pet-image-button');
  assert.equal(window.scrollY, 0);
});

test('预览页限制键盘焦点范围，键盘改变可视高度时底部操作仍使用可视区域', async t => {
  const { doc, window } = await page(t, true, true);
  await chooseImage(doc, window);
  const dialog = doc.querySelector('#pet-editor');
  doc.querySelector('#pet-confirm').focus();
  doc.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }));
  assert.equal(doc.activeElement.id, 'pet-crop');
  doc.activeElement.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true }));
  assert.equal(doc.activeElement.id, 'pet-confirm');
  window.visualViewport.height = 320; window.visualViewport.offsetTop = 30;
  window.visualViewport.dispatchEvent(new window.Event('resize'));
  assert.equal(dialog.style.height, '320px'); assert.equal(dialog.style.top, '30px');
});

test('按钮显示模式即时保存，不提交工作流草稿，保存失败恢复已存值', async t => {
  const { doc, window, d } = await page(t);
  const mode = doc.querySelector('#pet-menu-mode'); assert.equal(mode.value, 'always');
  mode.value = 'tap'; mode.dispatchEvent(new window.Event('change')); await flush();
  assert.equal(d.s.settings.menuButtonMode, 'tap'); assert.equal(d.s.workflowButton.hidden, true);
  const call = window.mn.call;
  window.mn.call = async (command, payload) => { if (command === 'setPetOptions') throw Error('保存失败'); return call(command, payload); };
  mode.value = 'always'; mode.dispatchEvent(new window.Event('change')); await flush();
  assert.equal(mode.value, 'tap'); assert.equal(d.s.settings.menuButtonMode, 'tap');
  assert.equal(doc.querySelector('#pet-status').textContent, '保存失败');
});

test('已保存图片直接进入编辑，初始预览不重复缩小，取消不保存也不打开选图器', async t => {
  const { doc, window, d, calls } = await page(t, true, true), saved = JSON.stringify(d.s.customPet);
  assert.equal(doc.querySelector('#pet-edit').hidden, false);
  doc.querySelector('#pet-edit').click(); await flush(); await flush();
  assert.equal(doc.querySelector('#pet-editor').hidden, false);
  assert.equal(doc.querySelector('#pet-editor-title').textContent, '编辑桌宠');
  assert.equal(doc.querySelector('#pet-confirm').textContent, '保存修改');
  assert.equal(doc.querySelector('#pet-name').value, '图片角色');
  assert.deepEqual(window.petDraws.at(-1), [0, 0, 256, 256]);
  doc.querySelector('#pet-name').value = '取消的名字';
  const zoom = doc.querySelector('#pet-zoom'); zoom.value = '160'; zoom.dispatchEvent(new window.Event('input'));
  doc.querySelector('#pet-cancel').click();
  assert.equal(JSON.stringify(d.s.customPet), saved); assert.equal(calls.some(c => c.command === 'importPetImage'), false);
  assert.equal(doc.activeElement.id, 'pet-edit');
  doc.querySelector('#pet-use-builtin').click(); await flush(); assert.equal(doc.querySelector('#pet-edit').hidden, true);
  doc.querySelector('#pet-use-pack').click(); await flush(); assert.equal(doc.querySelector('#pet-edit').hidden, true);
});

test('编辑图片保存失败保留调整，重试后直接替换并持久化，不删除角色', async t => {
  const { doc, window, d, h, calls } = await page(t, true, true), before = d.s.customPet.revision;
  doc.querySelector('#pet-edit').click(); await flush(); await flush();
  doc.querySelector('#pet-name').value = '编辑后的桌宠';
  h.failWrite('/documents/AI-Bridge/custom-pet.json');
  doc.querySelector('#pet-confirm').click(); await flush(); await flush();
  assert.equal(doc.querySelector('#pet-editor').hidden, false); assert.equal(d.s.customPet.revision, before);
  assert.equal(doc.querySelector('#pet-name').value, '编辑后的桌宠'); assert.equal(doc.querySelector('#pet-confirm').disabled, false);
  h.failWrite(''); doc.querySelector('#pet-confirm').click(); await flush(); await flush();
  assert.equal(doc.querySelector('#pet-editor').hidden, true); assert.equal(doc.querySelector('#pet-current').textContent, '编辑后的桌宠');
  assert.equal(doc.querySelector('#pet-status').textContent, '桌宠修改已保存'); assert.equal(doc.activeElement.id, 'pet-edit');
  assert.equal(pets({ files: h.files, values: h.values }).open().s.customPet.name, '编辑后的桌宠');
  assert.equal(calls.some(c => c.command === 'deletePet'), false);
});

test('编辑期间其他窗口换图时拒绝覆盖新图片，保留草稿供用户检查', async t => {
  const { doc, d, h } = await page(t, true, true);
  doc.querySelector('#pet-edit').click(); await flush(); await flush();
  h.upload(d, 'image', picture); const latest = d.s.customPet.revision;
  doc.querySelector('#pet-name').value = '过期修改'; doc.querySelector('#pet-confirm').click(); await flush(); await flush();
  assert.equal(d.s.customPet.revision, latest); assert.equal(d.s.customPet.name, '图片角色');
  assert.equal(doc.querySelector('#pet-editor').hidden, false); assert.match(doc.querySelector('#pet-editor-status').textContent, /其他面板更新/);
  assert.equal(doc.querySelector('#pet-name').value, '过期修改');
});

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
