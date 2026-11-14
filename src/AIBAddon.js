function createAiBridgeAddon(mainPath) {
  return JSB.defineClass('AiBridgeAddon : JSExtension <UIWebViewDelegate>', {
    sceneWillConnect: function () { self.petMainPath = mainPath; AIBPets.later(self, mainPath); },
    sceneWillResignActive: function () { if (self.panelController) { AIBWorkflowRunner.cancel(self.panelController); AIBUpload.cancel(self.panelController); } AIBPets.active(self, false); },
    sceneDidBecomeActive: function () { AIBPets.active(self, true); },
    notebookWillOpen: function () { if (self.panelController) { AIBWorkflowRunner.cancel(self.panelController); AIBUpload.cancel(self.panelController); } AIBPets.later(self, mainPath); },
    documentDidOpen: function () { AIBPets.later(self, mainPath); },
    documentWillClose: function () { AIBPets.close(self); },
    controllerWillLayoutSubviews: function () { AIBPets.layout(self); },
    notebookWillClose: function () {
      AIBPets.close(self);
      if (self.panelController) { AIBPanel.dispose(self.panelController); self.panelController = null; }
    },
    sceneDidDisconnect: function () {
      AIBPets.dispose(self);
      if (self.panelController) AIBPanel.dispose(self.panelController); self.panelController = null;
    },
    petPan: function (gesture) { AIBPets.pan(self, gesture); },
    petTap: function (gesture) { AIBPets.tap(self, gesture); },
    petPress: function (sender) { AIBPets.touch(self, sender, true); },
    petRelease: function (sender) { AIBPets.touch(self, sender, false); },
    petWorkflowMenu: function () { AIBWorkflowPet.toggle(self); },
    petRunWorkflow: function (sender) { AIBWorkflowPet.select(self, sender); },
    petManageWorkflows: function () { AIBWorkflowPet.manage(self); },
    webViewDidFinishLoad: function (view) { if (self.petSession) AIBPetAnimationPlayer.loaded(self.petSession, view); },
    webViewDidFailLoadWithError: function (view, error) { if (Number(AIBNative.value(error, 'code')) !== -999 && self.petSession) AIBPetAnimationPlayer.failed(self.petSession, view); },
    webViewShouldStartLoadWithRequestNavigationType: function (view, request) { return AIBPetAnimationPlayer.allow(self.petSession, view, request); },
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
  }, { addonDidConnect: function () { console.log('[Ai Bridge] 已加载'); }, addonWillDisconnect: function () { AIBPets.disposeAll(); },
    applicationDidEnterBackground: function () { AIBPets.background(true); }, applicationWillEnterForeground: function () { AIBPets.background(false); } });
}
