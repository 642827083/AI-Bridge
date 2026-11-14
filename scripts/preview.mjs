import { createServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { resources } from './bundle.mjs';
import { zipSync, strToU8 } from 'fflate';
import { pets, pack } from '../test/pet-support.mjs';
import { workflowBubblePreview } from '../test/workflow-bubble-preview.mjs';
const { settingsHTML, deepseek, doubao, gpt, gemini, mediaHTML } = await resources();
const demo = { cardItems: [1, 3], handwriting: 'last', extraText: '请分析这道题，并检查我的解题过程。' };
let navigation = { sites: ['deepseek'] };
const mock = '<script>let navigation={sites:["deepseek"]};window.mn={call:async function(command,payload){if(/Workflow/.test(command)){const value=await(await fetch("/pet-command",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({command,payload})})).json();if(value.error)throw Error(value.error);return value;}if(command==="getNavigation")return navigation;if(command==="saveNavigation")return navigation=payload;if(command==="getPetState")return {settings:{source:"pack",visible:false,size:112,opacity:1},available:false,pack:null,image:{hasImage:false},warning:""};if(command==="saveSettings"){window.previewSettings=payload;return payload;}return ' + JSON.stringify(demo) + ';}};</script>';
const html = settingsHTML.replace('<head>', '<head>' + mock);
const navigationPage = html.replace('</body>', () => '<script>' + readFileSync('test/navigation-browser.js', 'utf8') + '</script></body>');
const petNative = pets(), petScene = petNative.open();
const petPage = settingsHTML.replace('<head>', () => '<head><script>' + readFileSync('test/pet-browser.js', 'utf8') + '</script>');
const petZip = zipSync({ 'pet.json': strToU8(JSON.stringify(pack.manifest)), 'poster.png': Buffer.from(pack.files['poster.png'], 'base64'), 'actions/idle.webp': Buffer.from(pack.files['actions/idle.webp'], 'base64'), 'LICENSE.txt': strToU8(pack.license) });
const tests = readFileSync('test/browser.html', 'utf8').replace('/* AIB_ADAPTER */', () => deepseek.replace(/<\/script/gi, '<\\/script'));
const gptTests = readFileSync('test/gpt-browser.html', 'utf8').replace('/* AIB_GPT_ADAPTER */', () => gpt.replace(/<\/script/gi, '<\\/script'));
const geminiPNG = readFileSync('test/fixtures/pet-256.png');
const geminiTests = readFileSync('test/gemini-browser.html', 'utf8').replace('/* AIB_GEMINI_ADAPTER */', () => gemini.replace(/<\/script/gi, '<\\/script')).replace('/* AIB_TEST_PNG */', () => JSON.stringify(geminiPNG.toString('base64'))).replace('/* AIB_TEST_BYTES */', String(geminiPNG.length));
const doubaoTests = readFileSync('test/doubao-browser.html', 'utf8').replace('/* AIB_DOUBAO_ADAPTER */', () => doubao.replace(/<\/script/gi, '<\\/script')).replace('/* AIB_TEST_PNG */', () => JSON.stringify(readFileSync('test/fixtures/pet-256.png').toString('base64')));
const mediaMock = readFileSync('test/media-browser.js', 'utf8');
const mediaTest = mediaHTML.replace('<head>', '<head><script>' + mediaMock + '</script>');
const server = createServer((request, response) => {
  if (request.url.startsWith('/workflow-bubble')) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }); response.end(workflowBubblePreview(request.url)); return;
  }
  if (request.url === '/pet-command' && request.method === 'POST') {
    let body = ''; request.on('data', chunk => { body += chunk; if (body.length > 100000) request.destroy(); });
    request.on('end', () => {
      let value;
      try {
        const { command, payload } = JSON.parse(body);
        value = command === 'getWorkflows' ? petNative.context.AIBWorkflows.visible() : command === 'saveWorkflow' ? petNative.context.AIBWorkflows.visible(petNative.context.AIBWorkflows.save(payload)) : command === 'deleteWorkflow' ? petNative.context.AIBWorkflows.visible(petNative.context.AIBWorkflows.remove(payload)) : command === 'getNavigation' ? navigation : command === 'saveNavigation' ? (navigation = payload) : command === 'getSettings' ? demo : command === 'saveSettings' ? payload : petScene.command(command, payload);
      } catch (error) { value = { error: error.message }; }
      response.writeHead(200, { 'Content-Type': 'application/json' }); response.end(JSON.stringify(value));
    }); return;
  }
  if (request.url === '/pet-fail') { petNative.failWrite('/documents/AI-Bridge/custom-pet.json'); response.end('ok'); return; }
  if (request.url === '/fixture.mnpet' || request.url === '/fixture.png') {
    response.writeHead(200, { 'Content-Type': request.url.endsWith('png') ? 'image/png' : 'application/zip' });
    response.end(request.url.endsWith('png') ? readFileSync('test/fixtures/pet-256.png') : petZip); return;
  }
  const headers = { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' };
  if (request.url === '/gpt-tests' || request.url === '/doubao-tests' || request.url === '/gemini-tests') headers['Content-Security-Policy'] = "frame-src 'none'; object-src 'none'";
  response.writeHead(200, headers);
  response.end(request.url === '/gemini-tests' ? geminiTests : request.url === '/navigation-tests' ? navigationPage : request.url === '/doubao-tests' ? doubaoTests : request.url === '/pet-tests' ? petPage : request.url === '/tests' ? tests : request.url === '/gpt-tests' ? gptTests : request.url === '/media-tests' ? mediaTest : html);
});
server.listen(48631, '127.0.0.1', () => console.log('设置页预览：http://127.0.0.1:48631'));
