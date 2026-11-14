import { MNBridge } from './lib/mnBridge.js';
import { describe, sameBytes, supports, MAX_BYTES } from './media-model.js';

async function api(path, options) {
  const result = await window.mn.api(path, options);
  if (!result || result.error) throw new Error(result?.error?.message || 'MN 未返回有效数据');
  return result;
}
async function readNote(noteId) {
  const reply = await api('/notes/batch-get', { method: 'POST', body: { noteIds: [noteId] } });
  return reply.items && reply.items[0];
}
async function image(path, signal) {
  const response = await fetch('/bridge/v1' + path, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('图片读取失败（' + response.status + '），请检查是否已保存');
  const blob = await response.blob();
  if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type.split(';')[0]) || !blob.size || blob.size > MAX_BYTES) throw new Error('MN 返回的图片格式或大小无效');
  return blob;
}
async function whitePNG(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const picture = await new Promise((resolve, reject) => {
      const element = new Image(); element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('图片解码失败')); element.src = url;
    });
    if (!picture.naturalWidth || !picture.naturalHeight || picture.naturalWidth > 4096 || picture.naturalHeight > 4096) throw new Error('图片尺寸超过处理上限');
    const canvas = document.createElement('canvas'); canvas.width = picture.naturalWidth; canvas.height = picture.naturalHeight;
    const context = canvas.getContext('2d'); if (!context) throw new Error('当前环境无法处理手写图片');
    context.fillStyle = '#ffffff'; context.fillRect(0, 0, canvas.width, canvas.height); context.drawImage(picture, 0, 0);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png || !png.size || png.size > MAX_BYTES) throw new Error('生成的 PNG 超过本插件 10 MiB 上限');
    return png;
  } finally { URL.revokeObjectURL(url); }
}
function base64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(); reader.onerror = () => reject(new Error('图片编码失败'));
    reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.readAsDataURL(blob);
  });
}
async function run() {
  let input;
  const abort = new AbortController();
  window.addEventListener('pagehide', () => abort.abort(), { once: true });
  const status = document.getElementById('status');
  const send = payload => MNBridge.send('receiveMedia', { ...payload, token: input.token });
  try {
    if (!window.mn || typeof window.mn.api !== 'function') throw new Error('当前 MN 缺少官方媒体接口，请更新 MN 并在场景中启用 Ai Bridge');
    input = await MNBridge.send('receiveMedia', { phase: 'ready' });
    const caps = await api('/capabilities');
    if (!supports(caps, /^\/notes\/batch-get$/, 'POST')) throw new Error('当前 MN 未开放卡片读取接口');
    const descriptor = describe(await readNote(input.noteId), input);
    if (descriptor.files.length && !supports(caps, /^\/notes\/\{[^}]+\}\/content\/\{[^}]+\}$/, 'GET')) throw new Error('当前 MN 未开放图片读取接口');
    const bundle = { text: descriptor.text, files: [] }, originals = [];
    let total = 0;
    for (const [index, part] of descriptor.files.entries()) {
      status.textContent = '正在读取图片 ' + (index + 1) + ' / ' + descriptor.files.length + '…';
      await send({ phase: 'validate' });
      const path = '/notes/' + encodeURIComponent(input.noteId) + '/content/' + encodeURIComponent(part.contentId) + '?maxEdge=2048&layers=composite';
      const original = await image(path, abort.signal), png = await whitePNG(original);
      total += png.size;
      if (total > MAX_BYTES) throw new Error('本次图片合计超过本插件 10 MiB 上限');
      const name = part.uploadLabel + (descriptor.files.filter(item => item.uploadLabel === part.uploadLabel).length > 1 ? '-' + (index + 1) : '') + '.png';
      bundle.files.push({ name, type: 'image/png', bytes: png.size, base64: await base64(png) });
      originals.push({ path, bytes: new Uint8Array(await original.arrayBuffer()) });
    }
    status.textContent = '正在核对来源…';
    // 媒体标识可能保持不变；重新比较图片字节，避免上传读取期间改写的笔迹。
    for (const original of originals) {
      await send({ phase: 'validate' });
      const next = new Uint8Array(await (await image(original.path, abort.signal)).arrayBuffer());
      if (!sameBytes(original.bytes, next)) throw new Error('图片或脑图笔迹已变化，请重新上传');
    }
    if (describe(await readNote(input.noteId), input).signature !== descriptor.signature) throw new Error('卡片内容已变化，请重新上传');
    if (input.settings.extraText.trim()) bundle.text += (bundle.text ? '\n\n' : '') + input.settings.extraText.trim();
    if (!bundle.text.trim() && !bundle.files.length) throw new Error('所选卡片没有可上传的文字或图片');
    const data = JSON.stringify(bundle);
    await send({ phase: 'begin', length: data.length });
    for (let offset = 0; offset < data.length; offset += 65536) await send({ phase: 'chunk', offset, text: data.slice(offset, offset + 65536) });
    await send({ phase: 'finish' });
  } catch (error) {
    status.textContent = error.message || String(error);
    if (input && input.token) try { await send({ phase: 'error', message: status.textContent }); } catch (ignored) {}
  }
}
run();
