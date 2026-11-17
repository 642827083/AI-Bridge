import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resources } from './bundle.mjs';
import { nativeScene } from '../test/native-support.mjs';
const { settingsHTML, deepseek, doubao, gpt, gemini, mediaHTML } = await resources();
const demo = { cardItems: [1, 3], handwriting: 'last', extraText: '请分析这道题，并检查我的解题过程。' };
let navigation = { sites: ['deepseek', 'doubao'] };
const mock = '<script>let navigation={sites:["deepseek","doubao"]};window.mn={call:async function(command,payload){if(/Workflow/.test(command)){const value=await(await fetch("/settings-command",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command,payload})})).json();if(value.error)throw Error(value.error);return value;}if(command==="getNavigation")return navigation;if(command==="saveNavigation")return navigation=payload;if(command==="saveSettings"){window.previewSettings=payload;return payload;}return ' + JSON.stringify(demo) + ';}};</script>';
const html = settingsHTML.replace('<head>', '<head>' + mock);
const navigationPage = html.replace('</body>', () => '<script>' + readFileSync('test/navigation-browser.js', 'utf8') + '</script></body>');
const native = nativeScene(), scene = native.open();
const tests = readFileSync('test/browser.html', 'utf8').replace('/* AIB_ADAPTER */', () => deepseek.replace(/<\/script/gi, '<\\/script'));
const gptTests = readFileSync('test/gpt-browser.html', 'utf8').replace('/* AIB_GPT_ADAPTER */', () => gpt.replace(/<\/script/gi, '<\\/script'));
const geminiPNG = readFileSync('test/fixtures/upload-image.png');
const geminiTests = readFileSync('test/gemini-browser.html', 'utf8').replace('/* AIB_GEMINI_ADAPTER */', () => gemini.replace(/<\/script/gi, '<\\/script')).replace('/* AIB_TEST_PNG */', () => JSON.stringify(geminiPNG.toString('base64'))).replace('/* AIB_TEST_BYTES */', String(geminiPNG.length));
const doubaoTests = readFileSync('test/doubao-browser.html', 'utf8').replace('/* AIB_DOUBAO_ADAPTER */', () => doubao.replace(/<\/script/gi, '<\\/script')).replace('/* AIB_TEST_PNG */', () => JSON.stringify(readFileSync('test/fixtures/upload-image.png').toString('base64')));
const mediaMock = readFileSync('test/media-browser.js', 'utf8');
const mediaTest = mediaHTML.replace('<head>', '<head><script>' + mediaMock + '</script>');
const server = createServer((request, response) => {
  if (request.url === '/workflow-layout') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>工作流宽窄屏预览</title><style>body{margin:20px;background:#eef0f5;font:14px system-ui;color:#555;display:flex;gap:24px}h2{font-size:14px;font-weight:500}iframe{border:1px solid #dfe2e9;border-radius:12px;background:#f6f6f8;height:640px}</style><div><h2>窄屏 · 360px</h2><iframe title="窄屏设置" src="/" width="360"></iframe></div><div><h2>宽屏 · 720px</h2><iframe title="宽屏设置" src="/" width="720"></iframe></div></html>'); return;
  }
  if (request.url === '/settings-command' && request.method === 'POST') {
    let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', () => {
      let value;
      try {
        const { command, payload } = JSON.parse(body);
        if (['prepareWorkflowImport', 'commitWorkflowImport', 'cancelWorkflowImport', 'exportWorkflows'].includes(command)) {
          value = native.context.AIBWorkflowFiles.command(scene.controller, command, payload);
        } else
        value = command === 'getWorkflows' ? native.context.AIBWorkflows.visible() : command === 'saveWorkflow' ? native.context.AIBWorkflows.visible(native.context.AIBWorkflows.save(payload)) : command === 'deleteWorkflow' ? native.context.AIBWorkflows.visible(native.context.AIBWorkflows.remove(payload)) : command === 'moveWorkflow' ? native.context.AIBWorkflows.visible(native.context.AIBWorkflows.move(payload)) : command === 'getNavigation' ? navigation : command === 'saveNavigation' ? (navigation = payload) : command === 'getSettings' ? demo : command === 'saveSettings' ? payload : scene.command(command, payload);
      } catch (error) { value = { error: error.message }; }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value));
    }); return;
  }
  if (request.url === '/fixture.png') { response.writeHead(200, { 'Content-Type': 'image/png' }); response.end(readFileSync('test/fixtures/upload-image.png')); return; }
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  if (request.url === '/gpt-tests' || request.url === '/doubao-tests' || request.url === '/gemini-tests') headers['Content-Security-Policy'] = "frame-src 'none'; object-src 'none'";
  response.writeHead(200, headers);
  response.end(request.url === '/gemini-tests' ? geminiTests : request.url === '/navigation-tests' ? navigationPage : request.url === '/doubao-tests' ? doubaoTests : request.url === '/tests' ? tests : request.url === '/gpt-tests' ? gptTests : request.url === '/media-tests' ? mediaTest : html);
});
server.listen(48631, '127.0.0.1', () => console.log('设置页预览：http://127.0.0.1:48631'));
