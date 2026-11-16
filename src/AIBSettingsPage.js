var AIBSettingsPage = (function () {
  var N = AIBNative;
  var probe = '(function(){if(document.readyState==="loading")return "loading";if(!document.getElementById("settings-main"))return document.body&&document.body.children.length===0?"empty":"broken";return typeof window.__AIB_OPEN_WORKFLOWS__==="function"?"ready":"broken";})()';
  function cancel(controller) {
    var s = controller.settingsPage;
    if (s) { s.epoch++; s.checking = false; s.resume = null; if (s.timer) s.timer.invalidate(); s.timer = null; }
    controller.settingsPageReady = false;
    controller.workflowRevealPending = null;
    if (controller.settingsRecoveryButton) controller.settingsRecoveryButton.hidden = true;
  }
  function layout(controller) {
    var button = controller.settingsRecoveryButton;
    if (!button) return;
    var bounds = controller.view.bounds, width = Math.min(270, Math.max(1, bounds.width - 32));
    button.frame = { x: (bounds.width - width) / 2, y: 44 + Math.max(0, (bounds.height - 88) / 2), width: width, height: 44 };
  }
  function hint(controller, failed) {
    if (!controller.settingsRecoveryButton) {
      var button = new UIButton({ x: 0, y: 0, width: 1, height: 44 });
      button.titleLabel.font = UIFont.systemFontOfSize(13); button.backgroundColor = UIColor.whiteColor();
      button.setTitleColorForState(UIColor.darkGrayColor(), 0);
      button.addTargetActionForControlEvents(controller, 'retrySettings:', 1 << 6);
      controller.settingsRecoveryButton = button; controller.view.addSubview(button);
    }
    var control = controller.settingsRecoveryButton;
    control.setTitleForState(failed ? '设置暂未显示，点击重试' : '正在打开设置…', 0);
    control.enabled = Boolean(failed); control.hidden = !controller.visible || controller.activePage !== 'settings'; layout(controller);
  }
  function reload(controller) {
    // 空白文档已无可用草稿，只重建本地设置页，不刷新 AI 网页。
    AIBPets.cancel(controller.addon); AIBWorkflowFiles.cancel(controller);
    controller.settingsToken = N.token();
    controller.settingsView.loadHTMLStringBaseURL(AIBResources.settingsHTML.replace('__AIB_TOKEN_VALUE__', controller.settingsToken), null);
  }
  function enter(controller, force) {
    cancel(controller);
    if (!controller.visible || controller.disposed || controller.activePage !== 'settings') return;
    var s = controller.settingsPage || (controller.settingsPage = { epoch: 0 });
    var epoch = ++s.epoch, view = controller.settingsView, attempts = 0, reloaded = Boolean(force), inFlight = false;
    s.checking = true; s.failed = false;
    function current() { return s.epoch === epoch && controller.settingsView === view && controller.visible && !controller.disposed && controller.activePage === 'settings'; }
    function failed() { if (current()) { s.checking = false; s.failed = true; s.resume = null; hint(controller, true); } }
    function later() {
      if (!current()) return;
      if (++attempts >= 24) { failed(); return; }
      s.timer = NSTimer.scheduledTimerWithTimeInterval(.25, false, function () { s.timer = null; step(); });
    }
    function step() {
      if (!current() || !s.checking || inFlight) return;
      inFlight = true;
      N.evaluate(view, probe, 3).then(function (status) {
        inFlight = false; if (!current() || !s.checking) return;
        if (status === 'ready') {
          s.checking = false; s.resume = null; controller.settingsPageReady = true;
          if (controller.settingsRecoveryButton) controller.settingsRecoveryButton.hidden = true;
          N.evaluate(view, 'window.__AIB_PET_REFRESH__&&window.__AIB_PET_REFRESH__()').catch(function () {});
          AIBWorkflowPet.reveal(controller); return;
        }
        if (status === 'empty' && !reloaded && !N.value(view, 'loading')) {
          reloaded = true; hint(controller, false);
          try { reload(controller); } catch (_) { failed(); return; }
        }
        later();
      }).catch(function () { inFlight = false; failed(); });
    }
    s.resume = step;
    if (force) { hint(controller, false); try { reload(controller); } catch (_) { failed(); return; } }
    step();
  }
  function finished(controller) {
    var s = controller.settingsPage;
    if (s && s.failed && controller.visible && controller.activePage === 'settings') { enter(controller); return; }
    // 子框架也可能触发完成通知，不重启健康页面或反复刷新设置。
    if (s && s.checking && s.resume) {
      if (s.timer) s.timer.invalidate(); s.timer = null; s.resume();
    }
  }
  function failed(controller) { cancel(controller); if (controller.settingsPage) controller.settingsPage.failed = true; hint(controller, true); }
  return { enter: enter, cancel: cancel, layout: layout, finished: finished, failed: failed, retry: function (controller) { enter(controller, true); } };
})();
