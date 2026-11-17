import test from 'node:test';
import assert from 'node:assert/strict';
import { nativeScene, plain } from './native-support.mjs';

test('移除桌宠后的启动、工作流保存和场景关闭保留原桌宠文件及偏好，不再挂载视图或处理导入', () => {
  const oldFiles = new Map([
    ['/documents/AI-Bridge/custom-pet.json', Buffer.from('{"existing":"image"}')],
    ['/documents/AI-Bridge/pet-pack.json', Buffer.from('{"existing":"pack"}')],
    ['/documents/MN-Pet/custom-pet.json', Buffer.from('{"independent":true}')]
  ]);
  const oldValues = new Map([
    ['cn.marginnote.ai-bridge.pet.settings', '{"visible":true}'],
    ['cn.marginnote.ai-bridge.pet.countdown', '{"name":"考研","date":"2026-12-19"}']
  ]);
  const h = nativeScene({ files: new Map(oldFiles), values: new Map(oldValues) }), scene = h.open();
  assert.equal(h.views.size, 0); assert.equal(h.timers.length, 0);
  assert.equal(h.call(scene.addon, 'queryAddonCommandStatus').selector, 'togglePanel:');
  const record = h.context.AIBWorkflows.save({ expectedRevision: '', workflow: { name: '保留工作流', site: 'gpt', cardItems: [1, 2], handwriting: 'mindmap', extraText: '请检查' } });
  assert.deepEqual(plain(h.context.AIBWorkflows.read()), plain(record));
  const replies = [];
  scene.controller.settingsView.evaluateJavaScript = (code, callback) => { replies.push(code); callback(true); };
  for (const command of ['getPetState', 'setPetOptions', 'setPetCountdown', 'importPetPack', 'importPetImage', 'deletePet']) {
    const request = { token: 'settings', requestId: command, command, payload: {} };
    h.context.AIBWebCommands.local(scene.controller, 'mnaddon://bridge?payload=' + encodeURIComponent(JSON.stringify(request)), scene.controller.settingsView);
    assert.match(replies.at(-1), /不支持的设置命令/);
  }
  h.call(scene.addon, 'sceneWillResignActive');
  assert.equal(scene.addon.sceneActive, false);
  assert.throws(() => h.context.AIBWorkflowFiles.command(scene.controller, 'exportWorkflows', { expectedRevision: record.revision, ids: [record.items[0].id] }), /请在设置页管理/);
  h.call(scene.addon, 'sceneDidBecomeActive');
  h.call(scene.addon, 'notebookWillClose'); h.call(scene.addon, 'sceneDidDisconnect');
  for (const [path, bytes] of oldFiles) assert.deepEqual(h.files.get(path), bytes);
  assert.deepEqual(h.values, oldValues);
  assert.deepEqual(h.writes.map(item => item.path), ['/documents/AI-Bridge/workflows.json']);
  assert.equal(scene.controller.disposed, true);
});
