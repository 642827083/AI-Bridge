var AIBExternalWorkflows = (function () {
  var N = AIBNative, REQUEST = 'cn.marginnote.ai-bridge.workflow.request.v1', RESPONSE = 'cn.marginnote.ai-bridge.workflow.response.v1';
  function center() {
    if (typeof NSNotificationCenter === 'undefined') return null;
    return NSNotificationCenter.defaultCenter();
  }
  function connect(addon) {
    var c = center();
    if (!c || typeof c.addObserverSelectorName !== 'function') return;
    disconnect(addon); c.addObserverSelectorName(addon, 'receiveExternalWorkflow:', REQUEST); addon.externalWorkflowObserver = true;
  }
  function disconnect(addon) {
    if (addon.externalWorkflowObserver) center().removeObserverName(addon, REQUEST);
    addon.externalWorkflowObserver = false; addon.externalWorkflowTicket = null;
  }
  function cancel(addon) { addon.externalWorkflowTicket = null; }
  function respond(addon, request, payload) {
    center().postNotificationNameObjectUserInfo(RESPONSE, addon.window, { payload: JSON.stringify(Object.assign({ version: 1, requestId: request.requestId }, payload)) });
  }
  function receive(addon, notification) {
    if (N.value(notification, 'object') !== addon.window) return;
    var request;
    try {
      var text = N.value(N.value(notification, 'userInfo'), 'payload');
      if (typeof text !== 'string' || text.length > 4096) return;
      request = JSON.parse(text);
      if (request.version !== 1 || typeof request.requestId !== 'string' || !/^[a-z0-9-]{1,150}$/.test(request.requestId)) return;
      if (addon.sceneActive === false) throw new Error('请返回当前学习窗口后重新选择工作流');
      if (N.value(N.app(), 'focusWindow') && N.value(N.app(), 'focusWindow') !== addon.window) throw new Error('请在当前学习窗口中选择工作流');
      if (request.action === 'list') {
        var record = AIBWorkflows.visible(), source = request.noteId ? AIBNotes.captureExternal(addon, request) : null;
        var ticket = { token: N.token(), revision: record.revision, source: source, at: Date.now(), ids: record.items.map(function (item) { return item.id; }) };
        addon.externalWorkflowTicket = ticket;
        respond(addon, request, { ok: true, token: ticket.token, items: record.items.map(function (item) { return { id: item.id, name: item.name, site: item.site }; }) });
      } else if (request.action === 'run') {
        var current = addon.externalWorkflowTicket;
        addon.externalWorkflowTicket = null;
        if (!current || request.token !== current.token || Date.now() < current.at || Date.now() - current.at > 60000 || current.ids.indexOf(request.id) < 0) throw new Error('工作流列表已失效，请重新打开');
        if (AIBWorkflows.read().revision !== current.revision) throw new Error('工作流已更新，请重新打开列表');
        var workflow = AIBWorkflows.get(request.id);
        if (!AIBSettings.siteAvailable(workflow.site)) throw new Error('工作流的目标网页暂不可用');
        if (workflow.cardItems.length || workflow.handwriting !== 'none') {
          if (!current.source) throw new Error('请先选中一张卡片或进入卡片焦点');
          current.source.validate();
        }
        respond(addon, request, { ok: true });
        AIBWorkflowRunner.run(addon, request.id, null, { source: current.source });
      }
    } catch (error) {
      if (request && request.requestId) respond(addon, request, { ok: false, error: String(error.message || error) });
    }
  }
  return { connect: connect, disconnect: disconnect, cancel: cancel, receive: receive };
})();
