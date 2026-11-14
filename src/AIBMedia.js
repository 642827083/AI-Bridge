var AIBMedia = (function () {
  var MAX_BYTES = 10 * 1024 * 1024, MAX_LENGTH = Math.ceil(MAX_BYTES / 3) * 4 + 250000, N = AIBNative;
  function read(controller, operation) {
    if (typeof AddonWebPanel === 'undefined' || typeof AddonWebPanel.panel !== 'function') return Promise.reject(new Error('图片读取需要 MN 4.5.0 或更新版本的官方面板接口，请更新 MN 并在当前场景启用 Ai Bridge'));
    return new Promise(function (resolve, reject) {
      var panel, timer, settled = false;
      var request = { token: N.token(), operation: operation, offset: 0, chunks: [], ready: false };
      function finish(result, error) {
        if (settled) return; settled = true;
        if (timer) timer.invalidate();
        if (controller.mediaRequest === request) controller.mediaRequest = null;
        try { if (panel) { panel.onMessage = null; if (typeof panel.hideFloating === 'function') panel.hideFloating(); else if (typeof panel.teardown === 'function') panel.teardown(); } } catch (ignored) {}
        request.chunks = [];
        if (error) reject(error); else resolve(result);
      }
      request.finish = finish; controller.mediaRequest = request;
      try {
        panel = AddonWebPanel.panel(); request.panel = panel;
        if (!panel || ['loadPanel', 'showFloatingIn', 'hideFloating'].some(function (key) { return typeof panel[key] !== 'function'; })) throw new Error('无法创建媒体面板，请在当前沉浸式场景模板中启用 Ai Bridge');
        panel.onMessage = function (command, payload) {
          if (command === '__closed__') { finish(null, new Error('内容读取已取消')); return { ok: true }; }
          return AIBWebCommands.receiveMedia(controller, command, payload, panel);
        };
        panel.maxContentHeight = 130;
        timer = NSTimer.scheduledTimerWithTimeInterval(60, false, function () { finish(null, new Error('卡片内容读取超时，请确认手写已保存后重试')); });
        if (panel.loadPanel() === false) throw new Error('媒体页面缺失，请重新安装测试包');
        panel.showFloatingIn(N.study(controller));
      } catch (error) { finish(null, error); }
    });
  }
  function validBundle(bundle) {
    if (!bundle || typeof bundle.text !== 'string' || bundle.text.length > 200000 || !Array.isArray(bundle.files) || bundle.files.length > 5 || !bundle.text.trim() && !bundle.files.length) throw new Error('没有可上传的内容，或内容超过本插件上限');
    var total = 0;
    bundle.files.forEach(function (file) {
      if (!file || typeof file.name !== 'string' || file.name.length > 160 || file.type !== 'image/png' || !Number.isSafeInteger(file.bytes) || file.bytes < 1 || file.bytes > MAX_BYTES || typeof file.base64 !== 'string'
        || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(file.base64) || file.base64.length !== Math.ceil(file.bytes / 3) * 4
        || file.base64.length / 4 * 3 - (file.base64.endsWith('==') ? 2 : file.base64.endsWith('=') ? 1 : 0) !== file.bytes) throw new Error('图片内容不完整或格式无效');
      total += file.bytes;
    });
    if (total > MAX_BYTES) throw new Error('本次图片合计超过本插件 10 MiB 上限');
    return bundle;
  }
  function receive(controller, payload, panel) {
    var request = controller.mediaRequest;
    if (!request || request.panel !== panel || !payload || typeof payload !== 'object') throw new Error('媒体读取已结束');
    try {
      request.operation.guard();
      if (payload.phase === 'ready') {
        if (request.ready) throw new Error('媒体页面重复初始化');
        request.ready = true;
        return { token: request.token, noteId: request.operation.source.noteId, notebookId: request.operation.source.notebookId, settings: request.operation.settings };
      }
      if (!request.ready || payload.token !== request.token) throw new Error('媒体来源不符');
      if (payload.phase === 'error') throw new Error(String(payload.message || '卡片内容读取失败').slice(0, 1000));
      if (payload.phase === 'begin') {
        if (request.length || !Number.isSafeInteger(payload.length) || payload.length < 4 || payload.length > MAX_LENGTH) throw new Error('卡片内容大小无效');
        request.length = payload.length;
      } else if (payload.phase === 'chunk') {
        if (!request.length || payload.offset !== request.offset || typeof payload.text !== 'string' || !payload.text.length || payload.text.length > 65536 || request.offset + payload.text.length > request.length) throw new Error('卡片内容分块不完整');
        request.chunks.push(payload.text); request.offset += payload.text.length;
      } else if (payload.phase === 'finish') {
        if (!request.length || request.offset !== request.length) throw new Error('卡片内容未读取完整');
        var bundle = validBundle(JSON.parse(request.chunks.join('')));
        request.finish(bundle);
      } else if (payload.phase !== 'validate') throw new Error('未知媒体读取命令');
      return { ok: true };
    } catch (error) { request.finish(null, error); throw error; }
  }
  function cancel(controller) { if (controller.mediaRequest) controller.mediaRequest.finish(null, new Error('内容读取已取消')); }
  return { read: read, receive: receive, cancel: cancel, validBundle: validBundle };
})();
