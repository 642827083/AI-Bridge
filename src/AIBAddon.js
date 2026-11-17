function createAiBridgeAddon(mainPath) {
  function cancel(addon) {
    AIBExternalWorkflows.cancel(addon);
    if (addon.panelController) {
      AIBWorkflowFiles.cancel(addon.panelController); AIBWorkflowRunner.cancel(addon.panelController); AIBUpload.cancel(addon.panelController);
    }
  }
  return JSB.defineClass('AiBridgeAddon : JSExtension', {
    sceneWillConnect: function () { self.mainPath = mainPath; self.sceneActive = true; AIBExternalWorkflows.connect(self); },
    sceneWillResignActive: function () { self.sceneActive = false; cancel(self); },
    sceneDidBecomeActive: function () { self.sceneActive = true; },
    notebookWillOpen: function () { cancel(self); },
    documentWillClose: function () { cancel(self); },
    receiveExternalWorkflow: function (notification) { AIBExternalWorkflows.receive(self, notification); },
    notebookWillClose: function () {
      cancel(self);
      if (self.panelController) { AIBPanel.dispose(self.panelController); self.panelController = null; }
    },
    sceneDidDisconnect: function () {
      self.sceneActive = false; AIBExternalWorkflows.disconnect(self);
      if (self.panelController) AIBPanel.dispose(self.panelController); self.panelController = null;
    },
    queryAddonCommandStatus: function () {
      return { image: 'icon.png', object: self, selector: 'togglePanel:', checked: Boolean(self.panelController && self.panelController.visible) };
    },
    togglePanel: function () {
      var addon = self;
      try {
        if (!addon.panelController) addon.panelController = AIBPanel.create(addon);
        if (addon.panelController.visible) AIBPanel.hide(addon.panelController); else AIBPanel.show(addon.panelController);
      } catch (error) {
        console.log('[Ai Bridge] ' + String(error.message || error));
        AIBNative.app().showHUD(String(error.message || error), addon.window, 3);
      }
    }
  }, { addonDidConnect: function () { console.log('[Ai Bridge] 已加载'); }, addonWillDisconnect: function () { AIBWorkflowFiles.cancelAll(); },
    applicationDidEnterBackground: function () { AIBWorkflowFiles.cancelAll(); } });
}
