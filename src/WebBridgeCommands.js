var AIBWebCommands = (function () {
  // 只允许设置页打开这两个固定入口，避免网页侧传入任意地址。
  var LINKS = {
    'https://bbs.marginnote.com.cn/t/topic/68798': true,
    'https://qiaomu-joe-garden.pages.dev/': true
  };
  function open(payload) {
    var url = payload && payload.url;
    if (typeof url !== 'string' || !LINKS[url]) throw new Error('链接无效');
    if (typeof NSURL === 'undefined' || typeof NSURL.URLWithString !== 'function') throw new Error('当前无法打开网页，请稍后重试');
    var target = NSURL.URLWithString(url), app = AIBNative.app();
    if (!target || typeof app.openURL !== 'function') throw new Error('当前无法打开网页，请稍后重试');
    app.openURL(target);
    return { url: url };
  }
  function receiveMedia(controller, command, payload, panel) {
    if (command !== 'receiveMedia') throw new Error('不支持的媒体命令');
    return AIBMedia.receive(controller, payload, panel);
  }
  function local(controller, address, view) {
    if (view !== controller.settingsView || address.length > 100000) return false;
    var match = /^mnaddon:\/\/bridge\?payload=(.+)$/.exec(address), request;
    if (!match) return false;
    try {
      request = JSON.parse(decodeURIComponent(match[1]));
      if (!request || request.token !== controller.settingsToken || typeof request.requestId !== 'string' || request.requestId.length > 120) return false;
      var payload;
      if (request.command === 'getSettings') payload = AIBSettings.read();
      else if (request.command === 'getWorkflows') payload = AIBWorkflows.visible();
      else if (request.command === 'saveWorkflow') payload = AIBWorkflows.visible(AIBWorkflows.save(request.payload));
      else if (request.command === 'deleteWorkflow') payload = AIBWorkflows.visible(AIBWorkflows.remove(request.payload));
      else if (request.command === 'moveWorkflow') payload = AIBWorkflows.visible(AIBWorkflows.move(request.payload));
      else if (['prepareWorkflowImport', 'commitWorkflowImport', 'cancelWorkflowImport', 'exportWorkflows'].indexOf(request.command) >= 0) payload = AIBWorkflowFiles.command(controller, request.command, request.payload);
      else if (request.command === 'getNavigation') payload = AIBSettings.readNavigation();
      else if (request.command === 'saveNavigation') {
        payload = AIBSettings.writeNavigation(request.payload); AIBPanel.refreshNavigation(controller);
      }
      else if (request.command === 'openURL') payload = open(request.payload);
      else if (request.command === 'saveSettings') {
        if (!controller.uploadOperation || !controller.uploadOperation.customSettings) AIBUpload.cancel(controller);
        payload = AIBSettings.write(request.payload);
      } else throw new Error('不支持的设置命令');
      reply(view, request.requestId, payload, null);
    } catch (error) { if (request && request.token === controller.settingsToken) reply(view, request.requestId, null, String(error.message || error)); }
    return true;
  }
  function reply(view, id, payload, error) {
    AIBNative.evaluate(view, 'window.__AIB_BRIDGE_RECEIVE__(' + AIBNative.script({ requestId: id, payload: payload, error: error }) + ')').catch(function () {});
  }
  function remote(controller, address, view) {
    var site = AIBSites.forView(controller, view);
    var match = /^aibridge:\/\/(upload|workflows|workflow|workflow-library)\?token=([a-z0-9-]{1,150})(?:&(request|id)=([a-z0-9-]{1,150}))?$/.exec(address);
    if (!site || site !== AIBSites.get(controller) || !match || !site.token || match[2] !== site.token || !controller.visible || !AIBSettings.siteAvailable(site.name)) return false;
    if (match[1] === 'upload' && !match[3]) AIBUpload.start(controller);
    else if (match[1] === 'workflows' && match[3] === 'request') {
      var items = [], error = null;
      try { items = AIBWorkflows.visible().items.map(function (item) { return { id: item.id, name: item.name, site: site.name }; }); }
      catch (failure) { error = String(failure.message || failure); }
      AIBNative.evaluate(view, site.prefix + '.workflowMenu(' + AIBNative.script(match[4]) + ',' + AIBNative.script({ items: items, error: error }) + ')').catch(function () {});
    } else if (match[1] === 'workflow' && match[3] === 'id' && /^wf-/.test(match[4])) AIBWorkflowRunner.run(controller.addon, match[4], site.name);
    else if (match[1] === 'workflow-library' && !match[3]) AIBWorkflowLibrary.manage(controller.addon);
    else return false;
    return true;
  }
  return { local: local, remote: remote, receiveMedia: receiveMedia };
})();
