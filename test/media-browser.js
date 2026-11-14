(function () {
  const canvas = document.createElement('canvas'); canvas.width = 20; canvas.height = 20;
  const painter = canvas.getContext('2d'); painter.fillStyle = '#000'; painter.fillRect(6, 6, 8, 8);
  const original = fetch(canvas.toDataURL('image/png')).then(response => response.blob());
  const parts = [{ index: 0, kind: 'text', text: '首条正文' }, { index: 1, kind: 'text', text: '后续评论不应上传' }, { kind: 'ink', source: 'mindmap', contentId: 'mindmap-ink', noteid: 'note-1', renderable: true, mimeType: 'image/png' }];
  const input = { token: 'media-test', noteId: 'note-1', notebookId: 'book-1', settings: { cardItems: [1], handwriting: 'mindmap', extraText: '检查手写' } };
  let chunks = [], offset = 0, length = 0, reads = 0;
  async function finish() {
    const bundle = JSON.parse(chunks.join('')), file = bundle.files[0];
    const picture = new Image(); picture.src = 'data:image/png;base64,' + file.base64; await picture.decode();
    const output = document.createElement('canvas'); output.width = picture.width; output.height = picture.height;
    const context = output.getContext('2d'); context.drawImage(picture, 0, 0);
    const background = Array.from(context.getImageData(0, 0, 1, 1).data), ink = Array.from(context.getImageData(8, 8, 1, 1).data);
    const checks = [bundle.text === '首条正文\n\n检查手写', file.name === '脑图手写.png', file.bytes === atob(file.base64).length,
      background.join(',') === '255,255,255,255', ink.join(',') === '0,0,0,255', reads === 2, offset === length];
    document.getElementById('status').textContent = '媒体读取验证：' + checks.filter(Boolean).length + '/' + checks.length + ' 通过（文字、文件名、图片长度、白色背景、原始笔迹、二次核对、分块完整性）';
    document.title = 'Ai Bridge 媒体验证：' + checks.filter(Boolean).length + '/' + checks.length + ' 通过';
  }
  window.fetch = async function (path) {
    if (!String(path).startsWith('/bridge/v1/notes/note-1/content/mindmap-ink?')) throw new Error('测试中出现意外请求');
    reads++; return new Response(await original, { status: 200, headers: { 'Content-Type': 'image/png' } });
  };
  window.mn = {
    api: async function (path) {
      if (path === '/capabilities') return { routes: [{ method: 'POST', path: '/notes/batch-get' }, { method: 'GET', path: '/notes/{noteid}/content/{contentId}' }] };
      if (path === '/notes/batch-get') return { items: [{ noteid: 'note-1', topicid: 'book-1', found: true, title: '测试题目', parts }] };
      throw new Error('未知测试 API');
    },
    call: async function (command, payload) {
      if (command !== 'receiveMedia') throw new Error('未知测试命令');
      if (payload.phase === 'ready') return input;
      if (payload.phase === 'begin') length = payload.length;
      if (payload.phase === 'chunk') { if (payload.offset !== offset) throw new Error('分块乱序'); chunks.push(payload.text); offset += payload.text.length; }
      if (payload.phase === 'finish') await finish();
      if (payload.phase === 'error') { document.title = '媒体验证失败'; throw new Error(payload.message); }
      return { ok: true };
    }
  };
})();
