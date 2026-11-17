var AIBWorkflowRunner = (function () {
  var N = AIBNative;
  function cancel(controller) { if (controller) controller.workflowRun = null; }
  async function run(addon, id, originSite, external) {
    var controller, run;
    try {
      controller = addon.panelController;
      if (controller && (controller.workflowRun || controller.uploadOperation)) throw new Error('上一次上传仍在处理中，请稍候');
      var workflow = AIBWorkflows.get(id);
      if (!AIBSettings.siteAvailable(workflow.site)) throw new Error('这个工作流的目标网页暂不可用');
      var destination = originSite || workflow.site;
      if (originSite && (!AIBSettings.siteAvailable(originSite) || !controller || !controller.visible || controller.activePage !== originSite)) throw new Error('当前网页已切换，请重新选择工作流');
      var settings = AIBSettings.validate(workflow);
      var source = settings.cardItems.length || settings.handwriting !== 'none' ? (external ? external.source : AIBNotes.capture({ addon: addon })) : null;
      if (external && (settings.cardItems.length || settings.handwriting !== 'none')) {
        if (!source) throw new Error('请先选中一张卡片或进入卡片焦点');
        source.validate();
      }
      if (!controller) controller = addon.panelController = AIBPanel.create(addon);
      // 网页入口只取工作流的上传范围；外部入口才打开工作流指定的网站。
      if (!originSite) { AIBPanel.show(controller); AIBPanel.page(controller, destination, true); }
      run = { id: N.token(), site: destination }; controller.workflowRun = run;
      var site = AIBSites.get(controller, destination), epoch = site.epoch, lastError = '', deadline = Date.now() + 45000;
      function validate() {
        if (controller.workflowRun !== run || controller.disposed || !controller.visible || controller.activePage !== destination || originSite && site.epoch !== epoch) throw new Error('面板或网页已切换，工作流已停止');
        if (source) source.validate();
      }
      N.hud(controller, (originSite ? '正在 ' : '正在打开 ') + site.title + '，准备执行「' + workflow.name + '」');
      if (originSite) {
        validate(); var currentTarget = await AIBUpload.call(controller, 'context', [], site); validate();
        await AIBUpload.start(controller, { settings: settings, source: source, target: currentTarget, validate: validate }); return;
      }
      for (var attempt = 0; attempt < 90 && Date.now() <= deadline; attempt++) {
        validate(); await AIBPanel.inject(controller, site); validate();
        if (site.token) {
          var target;
          try { target = await AIBUpload.call(controller, 'context', [], site); }
          catch (error) {
            lastError = String(error.message || error);
            if (/登录/.test(lastError)) throw new Error('请先在 ' + site.title + ' 页面登录，再点击工作流');
          }
          validate();
          if (target) {
            // 使用点击时的工作流快照；整个过程不改写通用上传设置。
            await AIBUpload.start(controller, { settings: settings, source: source, target: target, validate: validate }); return;
          }
        }
        await N.delay(.5);
      }
      throw new Error('网页尚未就绪，请检查网络或登录状态后再点工作流。' + (lastError ? ' ' + lastError : ''));
    } catch (error) {
      if (!run || controller && controller.workflowRun === run) N.app().showHUD(String(error.message || error), addon.window, 3);
    } finally { if (controller && controller.workflowRun === run) controller.workflowRun = null; }
  }
  return { run: run, cancel: cancel };
})();
