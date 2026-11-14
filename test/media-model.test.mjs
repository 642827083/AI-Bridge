import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, sameBytes, supports } from '../web/src/media-model.js';
const input = { noteId: 'N1', notebookId: 'B1', settings: { cardItems: [1], handwriting: 'none' } };
function note(overrides = {}) { return { noteid: 'N1', topicid: 'B1', found: true, title: '题目', parts: [], ...overrides }; }
test('只读取首条正文原文，忽略标题和后续评论', () => {
  const body = { index: 0, kind: 'text', text: '$x^2$\n正文' };
  const result = describe(note({ parts: [body, { index: 1, kind: 'rich_text', text: '评论' }], texts: [body] }), input);
  assert.equal(result.text, '$x^2$\n正文');
});
test('卡片图片去重，卡片模式不混入脑图手写', () => {
  const image = { index: 0, kind: 'excerpt_image', contentId: 'image', renderable: true };
  const result = describe(note({ parts: [image, image, { kind: 'ink', source: 'mindmap', contentId: 'ink' }] }), input);
  assert.equal(result.files.length, 1); assert.equal(result.files[0].contentId, 'image');
});
test('图片对应的 texts 识别文字不会作为卡片正文上传', () => {
  const result = describe(note({ title: '',
    parts: [{ index: 0, kind: 'excerpt_image', contentId: 'root-image', renderable: true, ocrText: '图片中的 OCR 文字' }],
    texts: [{ index: 0, kind: 'text', text: '图片中的 OCR 文字', excerpt: true }]
  }), input);
  assert.equal(result.text, ''); assert.equal(result.files.length, 1);
});
test('首条是图片时不附加后续真实文字评论', () => {
  const comment = { index: 1, kind: 'text', text: '我的评论' };
  const result = describe(note({ title: '',
    parts: [{ index: 0, kind: 'excerpt_image', contentId: 'root-image', renderable: true }, comment],
    texts: [{ index: 0, kind: 'text', text: '图片 OCR' }, comment]
  }), input);
  assert.equal(result.text, '');
});
test('脑图手写关闭附带文字后不传入标题、OCR 或文字评论', () => {
  const result = describe(note({ title: '标题',
    parts: [{ index: 0, kind: 'excerpt_image', contentId: 'root-image', renderable: true },
      { kind: 'ink', source: 'mindmap', noteid: 'N1', contentId: 'mindmap', renderable: true }, { index: 1, kind: 'text', text: '评论' }],
    texts: [{ index: 0, kind: 'text', text: '图片 OCR' }]
  }), { ...input, settings: { cardItems: [], handwriting: 'mindmap' } });
  assert.equal(result.text, ''); assert.deepEqual(result.files.map(part => part.contentId), ['mindmap']);
});
test('原生字典键顺序变化不误判卡片被改写', () => {
  const first = describe(note({ parts: [{ kind: 'text', index: 0, text: '正文' }] }), input);
  const second = describe(note({ parts: [{ text: '正文', index: 0, kind: 'text' }] }), input);
  assert.equal(first.signature, second.signature);
});
test('脑图手写模式只读取匹配卡片的已保存笔迹，可附带文字', () => {
  const ink = { kind: 'ink', source: 'mindmap', contentId: 'ink', renderable: true, noteid: 'N1' };
  const only = { ...input, settings: { cardItems: [], handwriting: 'mindmap' } };
  assert.equal(describe(note({ parts: [ink] }), only).text, '');
  assert.equal(describe(note({ parts: [ink, { index: 0, kind: 'text', text: '首条文字' }] }), { ...only, settings: { ...only.settings, cardItems: [1] } }).text, '首条文字');
  const firstImage = { index: 0, kind: 'excerpt_image', contentId: 'root-image', renderable: true };
  const combined = describe(note({ parts: [ink, firstImage], texts: [{ index: 0, kind: 'text', text: 'OCR' }] }), { ...only, settings: { ...only.settings, cardItems: [1] } });
  assert.equal(combined.text, ''); assert.deepEqual(combined.files.map(part => part.contentId), ['root-image', 'ink']);
  assert.throws(() => describe(note({ parts: [{ ...ink, noteid: 'other' }] }), only), /脑图手写/);
});
test('不允许缺失、截断、超量图片及不支持的附件被静默忽略', () => {
  assert.throws(() => describe(note({ found: false }), input), /删除/);
  assert.throws(() => describe(note({ parts: [{ index: 0, kind: 'text', truncated: true, text: '半段' }] }), input), /截断/);
  assert.throws(() => describe(note({ parts: [{ index: 0, kind: 'image', contentId: 'i', renderable: false }] }), input), /尚未保存/);
  assert.throws(() => describe(note({ parts: [{ index: 0, kind: 'audio', contentId: 'a' }] }), input), /附件类型/);
  assert.throws(() => describe(note({ parts: Array.from({ length: 6 }, (_, i) => ({ index: 0, kind: 'image', contentId: String(i), renderable: true })) }), input), /5 张/);
});
test('空正文后首条是文字时只传这条，后续图片不上传', () => {
  const result = describe(note({ parts: [{ index: 0, kind: 'text', text: '' }, { index: 1, kind: 'text', text: '首条实际内容' }, { index: 2, kind: 'image', contentId: 'later', renderable: true }] }), input);
  assert.equal(result.text, '首条实际内容'); assert.equal(result.files.length, 0);
});
test('多选卡片内容按实际顺序读取，图片不混入 OCR', () => {
  const result = describe(note({ parts: [
    { index: 0, kind: 'text', text: '第一条' }, { index: 2, kind: 'image', contentId: 'second', renderable: true },
    { index: 5, kind: 'text', text: '第三条' }, { index: 6, kind: 'text', text: '未选择' }
  ], texts: [{ index: 2, kind: 'text', text: '图片 OCR' }] }), { ...input, settings: { cardItems: [3, 1, 2], handwriting: 'none' } });
  assert.equal(result.text, '第一条\n\n第三条'); assert.deepEqual(result.files.map(part => part.contentId), ['second']);
});
test('只选择第二条时不上传首条与后续条目', () => {
  const result = describe(note({ parts: [{ index: 0, kind: 'text', text: '第一条' }, { index: 1, kind: 'text', text: '第二条' }, { index: 2, kind: 'text', text: '第三条' }] }),
    { ...input, settings: { cardItems: [2], handwriting: 'none' } });
  assert.equal(result.text, '第二条');
});
test('最后一条手写按批注序号选择，不混入脑图手写与其他图片', () => {
  const result = describe(note({ parts: [{ index: 1, kind: 'ink', contentId: 'older', renderable: true },
    { index: 3, kind: 'ink', contentId: 'latest', renderable: true }, { index: 4, kind: 'image', contentId: 'image', renderable: true },
    { kind: 'ink', source: 'mindmap', noteid: 'N1', contentId: 'mindmap', renderable: true }] }),
  { ...input, settings: { cardItems: [], handwriting: 'last' } });
  assert.equal(result.text, ''); assert.deepEqual(result.files.map(part => part.contentId), ['latest']);
});
test('卡片内容在前，所选手写在后，重复选择同一手写不重复上传', () => {
  const parts = [{ index: 0, kind: 'image', contentId: 'first', renderable: true }, { index: 1, kind: 'ink', contentId: 'last', renderable: true }];
  const result = describe(note({ parts }), { ...input, settings: { cardItems: [1, 2], handwriting: 'last' } });
  assert.deepEqual(result.files.map(part => part.contentId), ['first', 'last']);
});
test('不存在的条目、没有保存的最后手写与未选择来源都明确失败', () => {
  const card = note({ parts: [{ index: 0, kind: 'text', text: '第一条' }] });
  assert.throws(() => describe(card, { ...input, settings: { cardItems: [2], handwriting: 'none' } }), /第 2 条/);
  assert.throws(() => describe(card, { ...input, settings: { cardItems: [], handwriting: 'last' } }), /最后一条手写/);
  assert.throws(() => describe(card, { ...input, settings: { cardItems: [], handwriting: 'none' } }), /选择/);
  assert.throws(() => describe(note({ parts: [{ index: 1, kind: 'ink', contentId: 'old', renderable: true }, { index: 2, kind: 'ink', contentId: 'new', renderable: false }] }),
    { ...input, settings: { cardItems: [], handwriting: 'last' } }), /保存/);
});
test('能力查询只接受真实开放的接口；图片逐字节检查', () => {
  assert.equal(supports({ routes: [{ method: 'POST', path: '/notes/batch-get' }] }, /^\/notes\/batch-get$/, 'POST'), true);
  assert.equal(supports({}, /^\/notes\/batch-get$/, 'POST'), false);
  assert.equal(sameBytes(new Uint8Array([1, 2]), new Uint8Array([1, 3])), false);
  assert.equal(sameBytes(new Uint8Array([1]), new Uint8Array([1, 2])), false);
});

test('Markdown 图片作为附件上传时不把图片引用追加到网页文字', () => {
  const markdown = '![题目图片 1](marginnote4app://markdownimg/png/0ea546fce75823ed0a0ad4b343666930)';
  const card = note({ parts: [{ index: 0, kind: 'rich_text', text: markdown },
    { index: 0, kind: 'image', contentId: 'md-image', renderable: true }] });
  const result = describe(card, input);
  assert.equal(result.text, ''); assert.deepEqual(result.files.map(file => file.contentId), ['md-image']);
});

test('图文混合只去掉图片引用，保留正文、公式及普通链接', () => {
  const markdown = '题目：求 $x^2$。\n\n![题目图](marginnote4app://markdownimg/png/hash)\n\n保留 **说明** 和 [参考](https://example.com)。';
  const result = describe(note({ parts: [{ index: 1, kind: 'text', text: markdown },
    { index: 1, kind: 'image', contentId: 'md-image', renderable: true }] }), input);
  assert.equal(result.text, '题目：求 $x^2$。\n\n\n\n保留 **说明** 和 [参考](https://example.com)。');
  assert.equal(result.files.length, 1);
});

test('没有同条图片附件时保留引用，其他条目的图片不触发清理', () => {
  const markdown = '![待保存图片](marginnote4app://markdownimg/png/hash)';
  const result = describe(note({ parts: [{ index: 0, kind: 'text', text: markdown },
    { index: 1, kind: 'image', contentId: 'other-image', renderable: true }] }), { ...input, settings: { cardItems: [1, 2], handwriting: 'none' } });
  assert.equal(result.text, markdown); assert.equal(result.files.length, 1);
});

test('图片引用清理保留代码示例、转义文本、远程图片和普通链接', () => {
  const reference = '![图](marginnote4app://markdownimg/png/hash)';
  const examples = ['`' + reference + '`', '```md\n' + reference + '\n```', '~~~md\n' + reference + '\n~~~',
    '\\' + reference, '![远程图](https://example.com/image.png)', '[卡片](marginnote4app://note/N1)'];
  for (const text of examples) {
    const result = describe(note({ parts: [{ index: 0, kind: 'text', text }, { index: 0, kind: 'image', contentId: 'image', renderable: true }] }), input);
    assert.equal(result.text, text); assert.equal(result.files.length, 1);
  }
});

test('多张 Markdown 图片含说明或角括号地址时，只上传图片附件', () => {
  const text = '![第一张](marginnote4app://markdownimg/png/one "说明")\n![第二张](<marginnote4app://markdownimg/png/two>)';
  const result = describe(note({ parts: [{ index: 0, kind: 'rich_text', text },
    { index: 0, kind: 'image', contentId: 'one', renderable: true }, { index: 0, kind: 'image', contentId: 'two', renderable: true }] }), input);
  assert.equal(result.text, ''); assert.deepEqual(result.files.map(part => part.contentId), ['one', 'two']);
});
