import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { createDeepSeekBridge } from '../web/src/deepseek.js';
import { createDoubaoBridge } from '../web/src/doubao.js';
import { createGPTBridge } from '../web/src/gpt.js';
import { createGeminiBridge } from '../web/src/gemini.js';
const probe = readFileSync('web/src/refresh-probe.js', 'utf8');
const scenarios = [
  ['DeepSeek', createDeepSeekBridge, 'https://chat.deepseek.com/', '<form><textarea id="chat-input"></textarea><button>智能搜索</button></form>'],
  ['豆包', createDoubaoBridge, 'https://www.doubao.com/chat/', '<div id="input-engine-container"><div contenteditable="true"></div></div>'],
  ['GPT', createGPTBridge, 'https://chatgpt.com/', '<form><textarea id="prompt-textarea"></textarea><button id="composer-plus-btn">＋</button></form>'],
  ['Gemini', createGeminiBridge, 'https://gemini.google.com/app', '<main><input-container><rich-textarea><div class="ql-editor" contenteditable="true" role="textbox"></div></rich-textarea><simplified-input-menu><button>＋</button></simplified-input-menu></input-container></main>']
];
for (const [name, make, url, html] of scenarios) {
  test(name + ' 顶栏模式下打字、清空、重建工具栏不注入网页按钮，工作流内容仍能上传', async t => {
    const dom = new JSDOM(html, { url, pretendToBeVisual: true, runScripts: 'outside-only' }), host = dom.window;
    host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{ width: 100, height: 40 }]; };
    const bridge = make(host); t.after(() => { bridge.disconnect(); host.close(); });
    bridge.connect('current', { inlineButton: false });
    const editor = host.document.querySelector('textarea,[contenteditable="true"]');
    const set = text => { if (editor.tagName === 'TEXTAREA') editor.value = text; else editor.textContent = text; editor.dispatchEvent(new host.Event('input', { bubbles: true })); };
    set('测试草稿'); assert.equal(JSON.parse(host.eval(probe)).pending, true);
    host.document.querySelector('button')?.remove(); await new Promise(resolve => host.setTimeout(resolve, 150));
    assert.equal(host.document.querySelector('#aib-upload-button'), null); set('');
    assert.equal(JSON.parse(host.eval(probe)).pending, false);
    const target = bridge.context(), payload = JSON.stringify({ text: '工作流提示词', files: [] });
    bridge.prepare(target, 'job', payload.length); bridge.append('job', 0, payload); assert.equal(bridge.commit('job'), true);
    assert.equal(editor.value || editor.textContent, '工作流提示词'); assert.equal(JSON.parse(host.eval(probe)).pending, true);
    bridge.connect('next', { inlineButton: false }); assert.equal(host.document.querySelector('#aib-upload-button'), null);
  });
}
test('刷新检查忽略历史消息与隐藏编辑器，并识别只有待发送附件的输入区', () => {
  const dom = new JSDOM('<main><p>历史回答</p><textarea hidden>隐藏草稿</textarea><form><textarea></textarea><button aria-label="Remove attachment">×</button></form></main>', { runScripts: 'outside-only' }), host = dom.window;
  host.HTMLElement.prototype.getClientRects = function () { return this.hidden ? [] : [{}]; };
  assert.equal(JSON.parse(host.eval(probe)).pending, true);
  host.document.querySelector('button').remove(); assert.equal(JSON.parse(host.eval(probe)).pending, false);
  const input = host.document.createElement('input'); input.type = 'file'; host.document.querySelector('form').append(input);
  Object.defineProperty(input, 'files', { value: [{}] }); assert.equal(JSON.parse(host.eval(probe)).pending, true); host.close();
});
