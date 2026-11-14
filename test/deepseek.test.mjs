import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createDeepSeekBridge } from '../web/src/deepseek.js';
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
function setup(t, { html = '<form><textarea id="chat-input"></textarea><div class="tools"><button type="button">深度思考</button><button id="search" type="button">智能搜索</button><button type="button">发送</button></div><input type="file" accept=".png,image/*" multiple></form>', url = 'https://chat.deepseek.com/' } = {}) {
  const dom = new JSDOM(html, { url, pretendToBeVisual: true });
  const host = dom.window;
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
  host.DataTransfer = class { constructor() { this.files = []; this.items = { add: file => this.files.push(file) }; } };
  for (const input of host.document.querySelectorAll('input[type="file"]')) {
    let files = []; Object.defineProperty(input, 'files', { get: () => files, set: value => { files = value; } });
  }
  const bridge = createDeepSeekBridge(host);
  t.after(() => { bridge.disconnect(); dom.window.close(); });
  return { host, bridge, editor: host.document.querySelector('textarea,[contenteditable]'), input: host.document.querySelector('input[type=file]') };
}
function stage(bridge, bundle, token = 'operation-1') {
  const snapshot = bridge.context(), text = JSON.stringify(bundle);
  bridge.prepare(snapshot, token, text.length);
  for (let offset = 0; offset < text.length; offset += 65536) bridge.append(token, offset, text.slice(offset, offset + 65536));
  return token;
}
function file() { return { name: '脑图手写.png', type: 'image/png', base64: PNG, bytes: Buffer.from(PNG, 'base64').length }; }

test('DeepSeek 原上传位置使用透明底深色三横线工作流入口', t => {
  const { bridge, host } = setup(t); bridge.connect('token');
  const button = host.document.querySelector('#aib-upload-button');
  assert.equal(button.style.color, 'rgb(68, 71, 70)'); assert.equal(button.children.length, 3);
  assert.equal(button.style.backgroundColor, 'transparent');
});
test('文字追加到草稿后，触发网页输入事件且不发送', t => {
  const { bridge, editor } = setup(t); let events = 0, submitted = 0;
  editor.value = '已有草稿'; editor.addEventListener('input', () => events++);
  editor.closest('form').addEventListener('submit', () => submitted++);
  const token = stage(bridge, { text: '卡片内容 $x^2$\n第二行', files: [] });
  assert.equal(bridge.commit(token), true);
  assert.equal(editor.value, '已有草稿\n\n卡片内容 $x^2$\n第二行');
  assert.equal(events, 1); assert.equal(submitted, 0); assert.equal(bridge.read(token).status, 'pasted');
});
test('已提交任务不能再次提交', t => {
  const { bridge, editor } = setup(t); const token = stage(bridge, { text: '内容', files: [] });
  bridge.commit(token); assert.throws(() => bridge.commit(token), /已结束/); assert.equal(editor.value, '内容');
});
test('图片交给原有附件控件，不宣称服务端上传完成', t => {
  const { bridge, input, editor } = setup(t); let changes = 0;
  input.addEventListener('change', () => changes++);
  const token = stage(bridge, { text: '请检查', files: [file()] });
  assert.equal(bridge.commit(token), true); assert.equal(changes, 1);
  assert.equal(input.files[0].name, '脑图手写.png'); assert.equal(input.files[0].type, 'image/png');
  assert.equal(editor.value, '请检查'); assert.equal(bridge.read(token).status, 'handed-off');
});
test('文件控件不支持多选时不修改草稿', t => {
  const { bridge, input, editor } = setup(t); input.multiple = false; editor.value = '保留';
  const token = stage(bridge, { text: '新文字', files: [file(), file()] });
  assert.equal(bridge.commit(token), false); assert.equal(editor.value, '保留'); assert.match(bridge.read(token).message, /一张/);
});
test('附件控件缺失时不部分追加文字', t => {
  const { bridge, input, editor } = setup(t); input.remove(); editor.value = '保留';
  const token = stage(bridge, { text: '新文字', files: [file()] });
  assert.equal(bridge.commit(token), false); assert.equal(editor.value, '保留'); assert.match(bridge.read(token).message, /附件按钮/);
});
test('网页已有待处理文件时不覆盖', t => {
  const { bridge, input } = setup(t); input.files = ['原有文件'];
  const token = stage(bridge, { text: '', files: [file()] });
  assert.equal(bridge.commit(token), false); assert.deepEqual(input.files, ['原有文件']);
});
test('附件交付后网页切换，提示可能已有附件且不写入新对话', t => {
  const { bridge, input, editor, host } = setup(t);
  input.addEventListener('change', () => host.history.pushState(null, '', '/a/new-chat'));
  const token = stage(bridge, { text: '不能进入新对话', files: [file()] });
  assert.equal(bridge.commit(token), false); assert.equal(editor.value, ''); assert.match(bridge.read(token).message, /部分图片可能/);
});
test('读取期间修改草稿，停止上传并保留新草稿', t => {
  const { bridge, editor } = setup(t); const token = stage(bridge, { text: '旧卡片', files: [] });
  editor.value = '用户继续输入'; assert.equal(bridge.commit(token), false); assert.equal(editor.value, '用户继续输入');
});
test('网页异步重置文字后，不报告填入成功', t => {
  const { bridge, editor } = setup(t); const token = stage(bridge, { text: '内容', files: [] });
  assert.equal(bridge.commit(token), true); editor.value = '';
  assert.equal(bridge.read(token).status, 'error'); assert.match(bridge.read(token).message, /文字已变化/);
});
test('SPA 切换对话后阻止分块与提交', t => {
  const { bridge, host } = setup(t); const snapshot = bridge.context(); bridge.prepare(snapshot, 'job', 10);
  host.history.pushState(null, '', '/a/another'); assert.throws(() => bridge.append('job', 0, 'abc'), /切换/);
  assert.equal(bridge.commit('job'), false);
});
test('输入框被替换后停止，避免发给新的编辑器', t => {
  const { bridge, editor, host } = setup(t); const token = stage(bridge, { text: '内容', files: [] });
  const replacement = host.document.createElement('textarea'); replacement.id = 'chat-input'; editor.replaceWith(replacement);
  assert.equal(bridge.commit(token), false); assert.equal(replacement.value, '');
});
test('错误网站不能获取上传目标', t => {
  const { bridge } = setup(t, { url: 'https://example.com/' }); assert.throws(() => bridge.context(), /官网/);
});
test('登录页不识别普通文本输入框为聊天输入框', t => {
  const { bridge } = setup(t, { url: 'https://chat.deepseek.com/sign_in' }); assert.throws(() => bridge.context(), /登录/);
});
test('多个可见输入框不能猜测目标', t => {
  const { bridge } = setup(t, { html: '<main><textarea></textarea><textarea></textarea></main>' }); assert.throws(() => bridge.context(), /多个/);
});
test('分块顺序不符、数据未完整时拒绝提交', t => {
  const { bridge, editor } = setup(t); const snapshot = bridge.context(); bridge.prepare(snapshot, 'job', 30);
  assert.throws(() => bridge.append('job', 1, 'abc'), /分块/); assert.equal(bridge.commit('job'), false); assert.equal(editor.value, '');
});
test('坏图片或空内容不改动输入框', t => {
  const { bridge, editor } = setup(t); const token = stage(bridge, { text: '内容', files: [{ ...file(), bytes: 1 }] });
  assert.equal(bridge.commit(token), false); assert.equal(editor.value, '');
});
test('取消后释放任务，下一次上传可重新开始', t => {
  const { bridge, editor } = setup(t); const token = stage(bridge, { text: '应取消', files: [] }); bridge.cancel(token);
  assert.throws(() => bridge.commit(token), /已结束/);
  const next = stage(bridge, { text: '新内容', files: [] }, 'next'); assert.equal(bridge.commit(next), true); assert.equal(editor.value, '新内容');
});
test('重复连接只出现一个上传按钮，脚本点击不触发原生读取', t => {
  const { bridge, host } = setup(t); bridge.connect('token'); bridge.connect('new-token');
  assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
  const action = host.document.querySelector('#aib-upload-button'), search = host.document.getElementById('search');
  assert.equal(search.nextElementSibling, action); assert.equal(action.parentElement, search.parentElement);
  assert.equal(action.getAttribute('aria-label'), '选择工作流');
  action.click(); assert.equal(host.document.querySelectorAll('iframe').length, 0);
});
test('网页重建搜索工具栏后，上传按钮回到智能搜索右边且不增加新行', async t => {
  const { bridge, host } = setup(t); bridge.connect('token');
  host.document.querySelector('.tools').outerHTML = '<div class="tools"><div class="ds-button" role="button">智能搜索</div><button>发送</button></div>';
  await new Promise(resolve => setTimeout(resolve, 180));
  const action = host.document.querySelector('#aib-upload-button');
  assert.ok(action); assert.equal(action.previousElementSibling.textContent, '智能搜索');
  assert.equal(action.tagName, 'BUTTON'); assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
});
test('缺少智能搜索工具时不另起一行放置上传', t => {
  const { bridge, host } = setup(t, { html: '<form><textarea id="chat-input"></textarea></form>' });
  bridge.connect('token'); assert.equal(host.document.querySelector('#aib-upload-button'), null);
});
test('搜索控件是普通 div/span 时上传仍显示在右侧', t => {
  const { bridge, host } = setup(t, { html: '<main><section><textarea id="chat-input"></textarea><div class="tools"><div class="hashed-chip"><svg></svg><span>智能搜索</span></div><button>发送</button></div></section></main>' });
  bridge.connect('token');
  const action = host.document.querySelector('#aib-upload-button');
  assert.ok(action, '普通容器控件不应导致上传消失'); assert.equal(action.previousElementSibling.className, 'hashed-chip');
});
test('DeepSeek 开关控件没有 button 角色时仍能定位智能搜索', t => {
  const { bridge, host } = setup(t, { html: '<main><section><textarea id="chat-input"></textarea><div class="tools"><div class="ds-toggle-button" tabindex="0" aria-pressed="true"><div class="ds-toggle-button__icon"><svg></svg></div><span>智能搜索</span><div aria-hidden="true"></div></div><button>发送</button></div></section></main>' });
  bridge.connect('token'); const action = host.document.querySelector('#aib-upload-button');
  assert.ok(action); assert.ok(action.previousElementSibling.classList.contains('ds-toggle-button'));
});
test('搜索文字收起或开关被网页禁用时上传仍在工具行', async t => {
  const { bridge, host } = setup(t, { html: '<form><textarea id="chat-input"></textarea><div class="tools"><div id="search" class="ds-toggle-button" aria-pressed="true" aria-disabled="true"><span hidden>智能搜索</span></div><button>发送</button></div></form>' });
  bridge.connect('token'); assert.equal(host.document.getElementById('search').nextElementSibling?.id, 'aib-upload-button');
  host.document.getElementById('search').setAttribute('class', 'ds-toggle-button ds-toggle-button--disabled');
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(host.document.getElementById('search').nextElementSibling?.id, 'aib-upload-button');
});
test('搜索标签短暂清空时保留原位置，控件替换后只恢复一个上传按钮', async t => {
  const { bridge, host } = setup(t); bridge.connect('token');
  const search = host.document.getElementById('search'); search.textContent = '';
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(search.nextElementSibling?.id, 'aib-upload-button');
  host.document.querySelector('.tools').innerHTML = '<div class="ds-toggle-button" aria-pressed="false"><span>智能搜索</span></div><button>发送</button>';
  await new Promise(resolve => setTimeout(resolve, 180));
  assert.equal(host.document.querySelectorAll('#aib-upload-button').length, 1);
  assert.ok(host.document.querySelector('#aib-upload-button').previousElementSibling.classList.contains('ds-toggle-button'));
});
test('搜索按钮辅助标签不等于可见文字时仍按可见名称识别', t => {
  const { bridge, host } = setup(t, { html: '<form><textarea id="chat-input"></textarea><div class="tools"><button id="search" aria-label="在互联网中搜索资料"><svg><title>网页检索</title></svg><span>智能搜索</span></button><button>发送</button></div></form>' });
  bridge.connect('token');
  assert.equal(host.document.getElementById('search').nextElementSibling?.id, 'aib-upload-button');
});
test('输入框嵌套较深时仍能找到同一编辑区的搜索工具', t => {
  const { bridge, host } = setup(t, { html: '<main><section>' + '<div>'.repeat(8) + '<textarea id="chat-input"></textarea>' + '</div>'.repeat(8) + '<div class="tools"><button id="search">智能搜索</button><button>发送</button></div></section></main>' });
  bridge.connect('token'); assert.equal(host.document.getElementById('search').nextElementSibling?.id, 'aib-upload-button');
});
test('contenteditable 模式保留草稿并追加换行文字', t => {
  const { bridge, editor } = setup(t, { html: '<form><div role="textbox" contenteditable="true">原文</div></form>' });
  const token = stage(bridge, { text: '追加', files: [] }); assert.equal(bridge.commit(token), true); assert.equal(editor.textContent, '原文\n\n追加');
});
