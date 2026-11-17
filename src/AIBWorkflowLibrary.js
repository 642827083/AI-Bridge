var AIBWorkflowLibrary = (function () {
  var N = AIBNative;
  function manage(addon) {
    try {
      var controller = addon.panelController || (addon.panelController = AIBPanel.create(addon));
      controller.openWorkflows = true;
      AIBPanel.show(controller); AIBPanel.page(controller, 'settings'); reveal(controller);
    } catch (error) { N.app().showHUD(String(error.message || error), addon.window, 3); }
  }
  function reveal(controller) {
    if (!controller.openWorkflows || controller.workflowRevealPending || controller.disposed || controller.activePage !== 'settings' || controller.settingsPageReady === false) return;
    var request = { view: controller.settingsView, token: controller.settingsToken };
    controller.workflowRevealPending = request;
    N.evaluate(controller.settingsView, 'Boolean(window.__AIB_OPEN_WORKFLOWS__&&window.__AIB_OPEN_WORKFLOWS__())').then(function (opened) {
      if (controller.workflowRevealPending !== request) return;
      controller.workflowRevealPending = false;
      if (controller.settingsView === request.view && controller.settingsToken === request.token && controller.activePage === 'settings' && !controller.disposed && (opened === true || opened === 'true')) controller.openWorkflows = false;
    }).catch(function () { if (controller.workflowRevealPending === request) controller.workflowRevealPending = false; });
  }
  return { manage: manage, reveal: reveal };
})();
