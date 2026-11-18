import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
const read = file => readFileSync(file, 'utf8');
async function bundle(entry, globalName) {
  const result = await build({ entryPoints: [entry], bundle: true, write: false, format: 'iife', globalName, target: 'safari15', charset: 'utf8', legalComments: 'none' });
  return result.outputFiles[0].text;
}
const safe = script => script.replace(/<\/script/gi, '<\\/script');
const manifest = JSON.parse(read('src/mnaddon.json'));
export async function resources() {
  const [deepseek, doubao, gpt, gemini, settings, media] = await Promise.all([
    bundle('web/src/deepseek.js', 'AIBDeepSeekModule'), bundle('web/src/doubao.js', 'AIBDoubaoModule'), bundle('web/src/gpt.js', 'AIBGPTModule'), bundle('web/src/gemini.js', 'AIBGeminiModule'), bundle('web/src/settings.js'), bundle('web/src/media-reader.js')
  ]);
  const settingsHTML = read('web/src/settings.html').replace('/* AIB_STYLE */', () => read('web/src/settings.css')).replace('/* AIB_APP */', () => safe(settings))
    .replaceAll('__AIB_VERSION__', manifest.version).replaceAll('__AIB_AUTHOR__', manifest.author);
  const mediaHTML = '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ai Bridge 内容读取</title></head><body><p id="status" role="status" style="font:14px -apple-system,sans-serif;padding:12px;color:#5c6270">正在读取所选卡片…</p><script>' + safe(media) + '</script></body></html>';
  return { deepseek, doubao, gpt, gemini, refreshProbe: read('web/src/refresh-probe.js'), settingsHTML, mediaHTML };
}
