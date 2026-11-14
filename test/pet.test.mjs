import test from 'node:test';
import assert from 'node:assert/strict';
import { pets, pack, picture, plain, builtin } from './pet-support.mjs';

test('首次打开直接显示自带哦鲸鲸，不创建网页或写入用户图片文件', () => {
  const h = pets(), d = h.open(), state = d.command('getPetState');
  assert.equal(state.available, true); assert.equal(state.settings.source, 'builtin'); assert.equal(state.builtin.name, '哦鲸鲸');
  assert.ok(d.s.view.superview); assert.deepEqual(plain(d.s.imageView.image.size), { width: 256, height: 256 });
  assert.equal(d.s.animationUI, null); assert.equal(h.files.size, 0);
  assert.equal(h.addonClass.methods.petExplain, undefined); assert.equal(h.addonClass.methods.petGrade, undefined);
  assert.throws(() => d.command('beginTutor'), /不支持/);
});

test('自带图片预览逐块读取同一原图，隐藏偏好保留，导入角色与自带角色可以往返切换', () => {
  const h = pets(), d = h.open(); const revision = d.command('getPetState').builtin.revision;
  let text = '';
  while (text.length < builtin.toString('base64').length) text += d.command('getPetAsset', { source: 'builtin', revision, offset: text.length }).chunk;
  assert.deepEqual(Buffer.from(text, 'base64'), builtin);
  assert.throws(() => d.command('getPetAsset', { source: 'builtin', revision: 'stale', offset: 0 }), /已变化/);
  h.upload(d); const saved = Buffer.from(h.files.get('/documents/AI-Bridge/pet-pack.json'));
  d.command('setPetOptions', { source: 'builtin' }); assert.equal(d.s.animationUI, null); assert.ok(d.s.imageView.image);
  assert.deepEqual(h.files.get('/documents/AI-Bridge/pet-pack.json'), saved);
  d.command('setPetOptions', { visible: false });
  const restored = pets({ files: h.files, values: h.values }).open();
  assert.equal(restored.s.settings.source, 'builtin'); assert.equal(restored.s.settings.visible, false); assert.ok(!restored.s.view);
  d.command('setPetOptions', { source: 'pack', visible: true }); assert.ok(d.s.animationUI);
});

test('旧版空角色设置回退自带桌宠，保持隐藏和外观选项，仍可即时修改', () => {
  const h = pets({ values: new Map([['cn.marginnote.ai-bridge.pet.settings', JSON.stringify({ source: 'pack', visible: false, size: 90 })]]) });
  const d = h.open(); assert.equal(d.s.settings.source, 'builtin'); assert.equal(d.s.settings.visible, false);
  d.command('setPetOptions', { visible: true }); assert.ok(d.s.view.superview); assert.equal(d.s.view.frame.width, 90);
});

test('桌宠轻点从原生手势触发包内动作，结束后回到待机', () => {
  const h = pets(), d = h.open(), value = plain(pack);
  value.manifest.actions.push({ ...value.manifest.actions[0], id: 'wave', label: '招手', file: 'actions/wave.webp' });
  value.files['actions/wave.webp'] = value.files['actions/idle.webp'];
  h.upload(d, 'pack', value);
  const tap = d.s.view.gestures.find(gesture => gesture.selector === 'petTap:');
  assert.ok(tap, '桌宠必须绑定轻点手势'); assert.equal(tap.waitFor, d.s.panGesture);
  h.call(d.addon, 'petTap', { state: 3 });
  assert.equal(d.s.animationUI.view.payload.id, 'wave');
  d.s.petActionTimer.fire(); assert.equal(d.s.animationUI.view.payload.id, 'idle');
});

for (const source of ['image', 'pack']) test(source + ' 桌宠没有互动素材时点击轻跳，结束复位且不移动桌宠位置', () => {
  const h = pets(), d = h.open(); if (source !== 'builtin') h.upload(d, source, source === 'pack' ? pack : picture);
  let now = 1000; h.context.Date = { now: () => now };
  const position = plain(d.s.view.frame), before = plain(d.s.imageView.frame);
  h.call(d.addon, 'petTap', { state: 3 }); assert.equal(d.s.petActionId, 'bounce');
  now += 200; d.s.petBounceTimer.fire();
  assert.notDeepEqual(plain(d.s.imageView.frame), before); assert.deepEqual(plain(d.s.view.frame), position);
  if (source === 'pack') assert.deepEqual(plain(d.s.animationUI.view.frame), plain(d.s.imageView.frame));
  now += 500; d.s.petBounceTimer.fire();
  assert.deepEqual(plain(d.s.imageView.frame), before); assert.equal(d.s.petBounceTimer, null);
  assert.equal(d.s.petActionId, 'idle');
});

test('拖动、隐藏和更换桌宠会取消点击动作，拖动结束不会误触发点击', () => {
  const h = pets(), d = h.open(); h.upload(d, 'image', picture);
  let now = 1000; h.context.Date = { now: () => now };
  const tap = () => h.call(d.addon, 'petTap', { state: 3 }); tap();
  const bounceTimer = d.s.petBounceTimer;
  const gesture = { state: 1, translationInView: () => ({ x: 20, y: 10 }) };
  h.call(d.addon, 'petPan', gesture); assert.equal(bounceTimer.valid, false); assert.equal(d.s.petBounceTimer, null);
  tap(); assert.equal(d.s.petActionId, 'idle'); gesture.state = 3; h.call(d.addon, 'petPan', gesture);
  tap(); assert.equal(d.s.petActionId, 'idle'); now += 301; tap(); assert.equal(d.s.petActionId, 'bounce');
  h.upload(d); assert.equal(d.s.petBounceTimer, null); assert.equal(d.s.petActionId, 'idle');
  tap(); h.call(d.addon, 'sceneWillResignActive');
  assert.equal(d.s.petBounceTimer, null); assert.ok(!d.s.petActionTimer);
  tap(); assert.equal(d.s.petActionId, 'idle');
  h.call(d.addon, 'sceneDidDisconnect'); assert.equal(h.timers.some(timer => timer.valid), false);
});

test('动作包导入、透明播放、关闭主面板、场景重启和持久化恢复', () => {
  const h = pets(), d = h.open(), state = h.upload(d);
  assert.equal(state.available, true); assert.equal(state.pack.manifest.name, '小鲸');
  assert.equal(d.s.animationUI.view.opaque, false); assert.equal(d.s.animationUI.view.scrollView.opaque, false);
  assert.equal(d.s.animationUI.view.payload.base64, pack.files['actions/idle.webp']);
  assert.equal(d.s.animationUI.view.loaded.url.path, '/addon/web-dist/pet-motion/index.html');
  assert.equal(state.pack.files, undefined); assert.ok(!JSON.stringify(state).includes('/documents'));
  d.controller.visible = false; assert.ok(d.s.view.superview);
  const path = '/documents/AI-Bridge/pet-pack.json';
  assert.ok(h.files.has(path)); assert.ok(h.writes.every(w => w.atomic));
  h.call(d.addon, 'sceneDidDisconnect'); assert.equal(d.s.view, null);
  const restored = pets({ files: h.files, values: h.values }).open();
  assert.equal(restored.s.petPack.revision, state.pack.revision); assert.ok(restored.s.view.superview);
});

test('图片与动作包分别保存，可切换并恢复显示来源，失败不换掉原角色', () => {
  const h = pets(), d = h.open(); h.upload(d); const state = h.upload(d, 'image', picture);
  assert.equal(state.settings.source, 'image'); assert.equal(d.s.animationUI, null);
  assert.equal(state.image.name, '图片角色'); assert.ok(d.s.imageView.image);
  const base64 = d.s.customPet.base64, revision = d.s.customPet.revision;
  d.command('setPetOptions', { source: 'pack' }); assert.ok(d.s.animationUI);
  d.command('setPetOptions', { source: 'image' }); assert.equal(d.s.customPet.base64, base64);
  const path = '/documents/AI-Bridge/custom-pet.json'; h.failWrite(path);
  assert.throws(() => h.upload(d, 'image', picture), /保存失败/); assert.equal(d.s.customPet.revision, revision);
  const restored = pets({ files: h.files, values: h.values }).open(); assert.equal(restored.s.settings.source, 'image'); assert.ok(restored.s.imageView.image);
});

test('保存、图片解码和并发版本失败保留旧桌宠；缺少内存图片接口时使用文件解码', () => {
  const h = pets(), d = h.open(); h.upload(d); const old = d.s.petPack;
  h.failWrite('/documents/AI-Bridge/pet-pack.json'); assert.throws(() => h.upload(d), /保存失败/);
  h.failWrite(''); h.failDecode(true); assert.throws(() => h.upload(d), /解码/);
  h.failDecode(false); assert.throws(() => h.upload(d, 'pack', pack, 'stale'), /其他面板/);
  assert.equal(d.s.petPack, old);
  delete h.context.UIImage.imageWithData; assert.equal(h.upload(d).available, true);
  assert.ok(h.files.has('/documents/AI-Bridge/pet-pack-poster.png'));
});

test('损坏包、路径、帧数、超限及未知文件不能替换角色', () => {
  const h = pets(), d = h.open(); h.upload(d); const revision = d.s.petPack.revision;
  for (const mutate of [p => p.manifest.poster = '../x.png', p => p.manifest.actions[0].count++, p => delete p.files['poster.png'], p => p.files['main.js'] = 'abc', p => p.manifest.frameSize = 999]) {
    const candidate = plain(pack); mutate(candidate); assert.throws(() => h.upload(d, 'pack', candidate)); assert.equal(d.s.petPack.revision, revision);
  }
});

test('预览只能按版本分块读取图片，不支持任意路径或其他插件数据', () => {
  const h = pets(), d = h.open(); h.upload(d, 'image', picture); const revision = d.s.customPet.revision;
  let text = '';
  do { const part = d.command('getPetAsset', { source: 'image', revision, offset: text.length }); assert.ok(part.chunk.length <= 32768); text += part.chunk; } while (text.length < picture.length);
  assert.equal(text, picture);
  for (const change of [{ source: '../settings' }, { revision: 'stale' }, { offset: -1 }, { offset: picture.length }]) assert.throws(() => d.command('getPetAsset', { source: 'image', revision, offset: 0, ...change }));
});

test('桌宠开关、大小、透明度即时持久化，两个窗口同步且位置留在边界内', () => {
  const h = pets(), first = h.open(), second = h.open(); h.upload(first, 'image', picture);
  first.command('setPetOptions', { size: 90, opacity: 0.5, visible: false }); assert.equal(second.s.view.superview, null);
  first.command('setPetOptions', { visible: true }); assert.equal(second.s.view.alpha, 0.5); assert.equal(second.s.view.frame.width, 90);
  const gesture = { state: 1, translationInView: () => ({ x: -9999, y: 9999 }) };
  h.call(first.addon, 'petPan', gesture); gesture.state = 3; h.call(first.addon, 'petPan', gesture);
  const f = first.s.view.frame; assert.ok(f.x >= 0 && f.y >= 0 && f.x + f.width <= 1024 && f.y + f.height <= 768);
  const stored = JSON.parse(h.values.get('cn.marginnote.ai-bridge.pet.settings'));
  assert.equal(stored.size, 90); assert.equal(stored.opacity, 0.5); assert.equal(stored.visible, true);
  assert.equal(h.values.has('local.mn5.whale-pet.settings.v1'), false);
});

test('桌宠拖动可贴住学习区域四边，缩小窗口或重启后仍保持边缘位置', () => {
  const h = pets(), d = h.open(), parent = d.s.view.superview;
  for (const bounds of [{ width: 1024, height: 768 }, { width: 320, height: 240 }, { width: 96, height: 80 }]) {
    parent.frame = { x: 0, y: 0, ...bounds }; h.context.AIBPets.layout(d.addon);
    for (const [right, bottom] of [[false, false], [true, false], [false, true], [true, true]]) {
      const gesture = { state: 1, translationInView: () => ({ x: right ? 10000 : -10000, y: bottom ? 10000 : -10000 }) };
      h.call(d.addon, 'petPan', gesture); gesture.state = 3; h.call(d.addon, 'petPan', gesture);
      const f = d.s.view.frame;
      assert.equal(f.x, right ? bounds.width - f.width : 0);
      assert.equal(f.y, bottom ? bounds.height - f.height : 0);
      assert.ok(f.width > 0 && f.height > 0 && f.width <= bounds.width && f.height <= bounds.height);
    }
  }
  const restored = pets({ files: h.files, values: h.values }).open(), f = restored.s.view.frame;
  assert.equal(f.x + f.width, 1024); assert.equal(f.y + f.height, 768);
});

test('隐藏、切到后台与卸载释放播放器和计时器，恢复时自动显示', () => {
  const h = pets(), d = h.open(); h.upload(d); const web = d.s.animationUI.view;
  h.call(d.addon, 'sceneWillResignActive'); assert.equal(d.s.animationUI, null); assert.equal(web.delegate, null); assert.equal(d.s.view.superview, null);
  h.call(d.addon, 'sceneDidBecomeActive'); d.s.mountTimer.fire(); assert.ok(d.s.animationUI);
  h.addonClass.statics.applicationDidEnterBackground(); assert.equal(d.s.animationUI, null);
  h.addonClass.statics.applicationWillEnterForeground(); d.s.mountTimer.fire(); assert.ok(d.s.animationUI);
  h.addonClass.statics.addonWillDisconnect(); assert.equal(d.s.destroyed, true); assert.equal(d.s.animationUI, null);
  assert.equal(h.timers.some(t => t.valid), false);
});

test('导入只能来自当前设置页，取消、错序、关闭与超时都不保存半份数据', () => {
  const h = pets(), d = h.open(); const begin = () => d.command('importPetPack', { phase: 'begin', id: 'job', length: 200, expectedRevision: '' });
  d.controller.activePage = 'gpt'; assert.throws(begin, /设置页/); d.controller.activePage = 'settings';
  begin(); assert.throws(() => d.command('importPetPack', { phase: 'chunk', id: 'job', offset: 1, text: '{}' }), /顺序/);
  assert.equal(d.s.petPackTransfer, null); assert.equal(d.s.packImportTimer, null);
  h.context.AIBPets.cancel(d.addon); assert.equal(d.s.petPackTransfer, null);
  begin(); d.command('cancelPetImport', { id: 'wrong' }); assert.ok(d.s.petPackTransfer); d.command('cancelPetImport', { id: 'job' }); assert.equal(d.s.petPackTransfer, null);
  begin(); d.s.packImportTimer.fire(); assert.equal(d.s.petPackTransfer, null);
  begin(); h.call(d.addon, 'notebookWillClose'); assert.equal(d.s.petPackTransfer, null); assert.equal(h.files.size, 0);
});

test('本地动画页只允许随包的本地文件，不连接网络也不接收网站上传命令', () => {
  const h = pets(), d = h.open(); h.upload(d); const web = d.s.animationUI.view;
  assert.equal(h.call(d.addon, 'webViewShouldStartLoadWithRequestNavigationType', web, { URL: { scheme: 'https', path: '/bad' } }), false);
  assert.equal(h.call(d.addon, 'webViewShouldStartLoadWithRequestNavigationType', web, { URL: { scheme: 'file', path: '/addon/web-dist/pet-motion/index.html' } }), true);
  assert.equal(h.context.AIBWebCommands.local(d.controller, 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'forged', token: 'wrong', command: 'setPetOptions', payload: { visible: false } })), d.controller.settingsView), false);
  assert.equal(d.s.settings.visible, true);
});

test('桌宠设置 bridge 使用独立视图与 token 验证，通过验证才允许写入', () => {
  const h = pets(), d = h.open(); h.upload(d, 'image', picture);
  const send = (token, view) => h.context.AIBWebCommands.local(d.controller, 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify({ token, requestId: '1', command: 'setPetOptions', payload: { size: 80 } })), view);
  assert.equal(send('wrong', d.controller.settingsView), false); assert.equal(d.s.settings.size, 112);
  assert.equal(send('settings', {}), false); assert.equal(d.s.settings.size, 112);
  assert.equal(send('settings', d.controller.settingsView), true); assert.equal(d.s.settings.size, 80);
});
