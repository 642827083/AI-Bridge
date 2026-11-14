export const MAX_BYTES = 10 * 1024 * 1024;
function withoutImageReferences(text) {
  // 只清理 MN 内部图片引用；代码示例、普通链接与远程图片保持原文。
  const tokens = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[ \t]*(?=\r?$)|(`+)[\s\S]*?\2|!\[(?:\\.|[^\]\\])*\]\(\s*(?:<marginnote[34]?app:\/\/markdownimg\/[^>\r\n]+>|marginnote[34]?app:\/\/markdownimg\/[^\s)]+)(?:\s+(?:"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'))?\s*\)/gim;
  return text.replace(tokens, (token, fence, code, offset) => {
    if (fence || code) return token;
    let slashes = 0;
    for (let index = offset - 1; index >= 0 && text[index] === '\\'; index--) slashes++;
    return slashes % 2 ? token : '';
  }).trim();
}
function contentGroups(note) {
  const parts = (note.parts || []).filter(part => part.kind !== 'title' && part.source !== 'mindmap'
    && Number.isSafeInteger(part.index) && part.index >= 0);
  const candidates = parts.filter(part => !/^(text|rich_text|blank)$/.test(part.kind) || part.truncated || typeof part.text === 'string' && part.text.trim());
  // 图片在 texts 中也可能带有 OCR；有实际媒体项的位置不使用文本回退。
  for (const part of note.texts || []) {
    if (Number.isSafeInteger(part.index) && part.index >= 0 && /^(text|rich_text)$/.test(part.kind)
      && !parts.some(actual => actual.index === part.index) && (part.truncated || typeof part.text === 'string' && part.text.trim())) candidates.push(part);
  }
  const indices = Array.from(new Set(candidates.map(part => part.index))).sort((a, b) => a - b);
  return indices.map(index => candidates.filter(part => part.index === index));
}
function readGroup(group, ordinal) {
  if (!group) throw new Error('所选卡片没有第 ' + ordinal + ' 条内容，请调整上传设置');
  const texts = [], files = [], seen = new Set();
  for (const part of group) {
    if (part.truncated) throw new Error('卡片第 ' + ordinal + ' 条文字被 MN 截断，请缩减后重试');
    if (/^(text|rich_text)$/.test(part.kind)) {
      if (typeof part.text === 'string' && part.text.trim() && !texts.includes(part.text.trim())) texts.push(part.text.trim());
    } else if (/^(image|excerpt_image|ink|blank_image)$/.test(part.kind)) {
      if (!part.contentId || !part.renderable) throw new Error('卡片第 ' + ordinal + ' 条图片尚未保存或无法读取');
      if (!seen.has(part.contentId)) { files.push({ ...part, uploadLabel: '卡片第' + ordinal + '条' }); seen.add(part.contentId); }
    } else throw new Error('卡片第 ' + ordinal + ' 条包含暂不支持的附件类型：' + String(part.kind));
  }
  // 先收集同一条目的全部媒体，再去掉已经作为附件上传的 Markdown 图片文字。
  const cleaned = files.length ? texts.map(withoutImageReferences).filter(Boolean) : texts;
  return { text: cleaned.join('\n\n'), files };
}
export function describe(note, input) {
  if (!note || note.noteid !== input.noteId || note.found === false || note.topicid && note.topicid !== input.notebookId) throw new Error('来源卡片已删除或学习集已变化');
  const parts = note.parts || [], settings = input.settings;
  if (!Array.isArray(settings.cardItems) || !settings.cardItems.every(item => Number.isSafeInteger(item) && item > 0 && item <= 10000)
    || !['last', 'mindmap', 'none'].includes(settings.handwriting)) throw new Error('上传设置无效，请重新保存设置');
  const selected = Array.from(new Set(settings.cardItems)).sort((a, b) => a - b);
  if (!selected.length && settings.handwriting === 'none') throw new Error('请先选择要上传的卡片内容或手写内容');
  const groups = selected.length ? contentGroups(note) : [];
  const files = [], texts = [], seen = new Set();
  function append(part) { if (!seen.has(part.contentId)) { files.push(part); seen.add(part.contentId); } }
  for (const ordinal of selected) {
    const group = readGroup(groups[ordinal - 1], ordinal);
    if (group.text) texts.push(group.text);
    group.files.forEach(append);
  }
  if (settings.handwriting === 'mindmap') {
    const ink = parts.filter(part => part.kind === 'ink' && part.source === 'mindmap');
    if (ink.length !== 1 || ink[0].noteid !== input.noteId || !ink[0].contentId || !ink[0].renderable) throw new Error('所选卡片没有可读取的脑图手写，请先保存脑图笔迹');
    append({ ...ink[0], uploadLabel: '脑图手写' });
  } else if (settings.handwriting === 'last') {
    const ink = parts.filter(part => part.kind === 'ink' && !part.source && Number.isSafeInteger(part.index) && part.index > 0);
    const lastIndex = ink.length ? Math.max(...ink.map(part => part.index)) : -1;
    const latest = ink.filter(part => part.index === lastIndex);
    if (latest.length !== 1 || !latest[0].contentId || !latest[0].renderable) throw new Error('所选卡片没有可读取的最后一条手写，请先保存手写批注');
    append({ ...latest[0], uploadLabel: '卡片最后一条手写' });
  }
  if (files.length > 5) throw new Error('卡片图片超过本插件单次 5 张上限，请分批处理');
  const text = texts.join('\n\n');
  if (text.length > 180000) throw new Error('卡片文字超过本插件上限，请分段处理');
  // 原生字典的键顺序可能变化，只比较影响本次读取的字段。
  const identity = part => [part.index, part.kind, part.contentId, part.text, part.renderable, part.truncated, part.source, part.noteid, part.mimeType];
  const signature = JSON.stringify([note.title, (note.texts || []).map(identity), parts.map(identity)]);
  return { text, files, signature };
}
export function sameBytes(a, b) {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}
export function supports(caps, path, method) {
  return Array.isArray(caps.routes) && caps.routes.some(route => route.method === method && path.test(route.path));
}
