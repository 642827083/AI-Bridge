var AIBUpload = (function () {
  var N = AIBNative;
  async function call(controller, method, args, site) {
    site = site || AIBSites.get(controller);
    if (!site) throw new Error('请先切换到 AI 网页');
    var PREFIX = site.prefix;
    var code = '(function(){try{if(!' + PREFIX + ')throw new Error("网页连接尚未就绪，请等待加载或重新打开面板");return JSON.stringify({value:' + PREFIX + '.' + method + '(' + args.map(N.script).join(',') + ')});}catch(e){return JSON.stringify({error:e.message||String(e)});}})()';
    var reply;
    try { reply = JSON.parse(String(await N.evaluate(controller[site.viewKey], code))); }
    catch (error) { throw new Error('网页未返回有效结果，请检查 ' + site.title + ' 页面后重试'); }
    if (!reply || reply.error) throw new Error(reply && reply.error || '网页连接失败');
    return reply.value;
  }
  function cancel(controller) {
    var operation = controller.uploadOperation; controller.uploadOperation = null;
    AIBMedia.cancel(controller);
    if (operation) call(controller, 'cancel', [operation.token], operation.site).catch(function () {});
  }
  async function start(controller, request) {
    if (!request && controller.workflowRun) { N.hud(controller, '工作流正在准备上传，请稍候'); return; }
    if (controller.uploadOperation) { N.hud(controller, '上一次上传仍在处理中，请稍候'); return; }
    var operation;
    try {
      var site = AIBSites.get(controller);
      if (!controller.visible || !site) throw new Error('请先切换到 AI 网页');
      var settings = request ? AIBSettings.validate(request.settings) : AIBSettings.read();
      var hasSource = settings.cardItems.length || settings.handwriting !== 'none';
      if (!hasSource && (!request || !settings.extraText.trim())) throw new Error('请先在设置中选择要上传的卡片内容或手写内容');
      var source = hasSource ? request && request.source || AIBNotes.capture(controller) : null;
      operation = { token: N.token(), customSettings: Boolean(request), settings: settings, source: source, site: site, view: controller[site.viewKey], epoch: site.epoch };
      operation.guard = function () {
        if (controller.uploadOperation !== operation || !controller.visible || AIBSites.get(controller) !== site || site.epoch !== operation.epoch || controller[site.viewKey] !== operation.view) throw new Error('面板或网页已切换，本次上传已停止');
        if (!request && JSON.stringify(AIBSettings.read()) !== JSON.stringify(settings)) throw new Error('上传设置已变化，请重新上传');
        if (request && request.validate) request.validate();
        if (source) source.validate();
      };
      controller.uploadOperation = operation;
      var target = request && request.target || await call(controller, 'context', [], site); operation.guard();
      var bundle = hasSource ? await AIBMedia.read(controller, operation) : { text: settings.extraText, files: [] }; operation.guard();
      var data = JSON.stringify(bundle);
      await call(controller, 'prepare', [target, operation.token, data.length], site); operation.guard();
      for (var offset = 0; offset < data.length; offset += 65536) {
        await call(controller, 'append', [operation.token, offset, data.slice(offset, offset + 65536)], site); operation.guard();
      }
      // 提交前已完成来源检查；提交后不重复写入，网页结果不明时交给用户检查。
      operation.committing = true;
      await call(controller, 'commit', [operation.token], site); operation.guard();
      await N.delay(0.15); operation.guard();
      var result = await call(controller, 'read', [operation.token], site); operation.guard();
      // 网页确认尚未写入或交付时，不再显示可能成功的提示。
      if (result.delivery === 'none') operation.committing = false;
      if (result.status !== 'pasted' && result.status !== 'handed-off') throw new Error(result.message || '内容尚未确认，请检查网页后再操作');
      N.hud(controller, result.message);
    } catch (error) {
      if (!operation || controller.uploadOperation === operation) N.hud(controller, (operation && operation.committing ? '内容可能已加入网页，请先检查。' : '') + String(error.message || error));
    } finally {
      if (controller.uploadOperation === operation) cancel(controller);
    }
  }
  return { start: start, cancel: cancel, call: call };
})();
