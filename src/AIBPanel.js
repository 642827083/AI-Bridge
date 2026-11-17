var AIBPanel = (function () {
  var N = AIBNative;
  function button(controller, title, action, size) {
    var control = new UIButton({ x: 0, y: 0, width: 70, height: 44 });
    control.setTitleForState(title, 0); control.setTitleColorForState(UIColor.darkGrayColor(), 0);
    control.titleLabel.font = size ? UIFont.systemFontOfSize(size) : UIFont.boldSystemFontOfSize(14);
    control.backgroundColor = UIColor.colorWithWhiteAlpha(1, 0);
    control.addTargetActionForControlEvents(controller, action, 1 << 6); return control;
  }
  function label(text, size) {
    var control = new UILabel({ x: 0, y: 0, width: 100, height: 44 });
    control.text = text; control.font = UIFont.systemFontOfSize(size); control.textColor = UIColor.darkGrayColor(); return control;
  }
  function layout(controller, animated) {
    if (!controller.panelReady || controller.panelLayingOut) return;
    controller.panelLayingOut = true;
    try {
      var width = controller.view.bounds.width, height = controller.view.bounds.height;
      controller.header.frame = { x: 0, y: 0, width: width, height: 44 };
      var actions = controller.activePage !== 'settings', available = Math.max(1, width - (actions ? 132 : 44));
      var tabs = controller.navigationSites.concat('settings'), tabWidth = Math.min(85, available / tabs.length);
      var left = Math.max(0, Math.min((width - tabWidth * tabs.length) / 2, available - tabWidth * tabs.length));
      ['deepseek', 'doubao', 'gpt', 'gemini', 'settings'].forEach(function (name) {
        var control = controller[name + 'Button'], index = tabs.indexOf(name);
        control.hidden = index < 0;
        if (index >= 0) control.frame = { x: left + index * tabWidth, y: 0, width: tabWidth, height: 44 };
      });
      controller.closeButton.frame = { x: width - 44, y: 0, width: 44, height: 44 };
      controller.workflowButton.frame = { x: width - 88, y: 0, width: 44, height: 44 };
      controller.refreshButton.frame = { x: width - 132, y: 0, width: 44, height: 44 };
      controller.workflowButton.hidden = !actions; controller.refreshButton.hidden = !actions;
      AIBNavigationMotion.move(controller.indicator, { x: left + tabs.indexOf(controller.activePage) * tabWidth + (tabWidth - 24) / 2, y: 38, width: 24, height: 3 }, Boolean(animated));
      var content = { x: 0, y: 44, width: width, height: Math.max(1, height - 44) };
      controller.webView.frame = content; controller.doubaoView.frame = content; controller.gptView.frame = content; controller.geminiView.frame = content; controller.settingsView.frame = content;
      controller.resizeHandle.frame = { x: width - 30, y: height - 30, width: 30, height: 30 };
      controller.resizeLabel.frame = { x: 0, y: 0, width: 30, height: 30 };
      AIBSettingsPage.layout(controller);
      AIBPanelActions.layout(controller);
    } finally { controller.panelLayingOut = false; }
  }
  function page(controller, name, temporary) {
    if (name !== 'settings' && !AIBSettings.siteAvailable(name)) return;
    if (name !== 'settings' && controller.navigationSites.indexOf(name) < 0) {
      if (!temporary) return;
      controller.navigationSites = ['deepseek', 'doubao', 'gpt', 'gemini'].filter(function (site) { return site === name || controller.navigationSites.indexOf(site) >= 0; });
    }
    var changed = name !== controller.activePage;
    if (changed) { AIBPanelActions.close(controller); AIBUpload.cancel(controller); AIBWorkflowRunner.cancel(controller); }
    controller.activePage = name;
    if (name !== 'settings') { AIBWorkflowFiles.cancel(controller); AIBSettingsPage.cancel(controller); }
    controller.webView.hidden = name !== 'deepseek'; controller.doubaoView.hidden = name !== 'doubao'; controller.gptView.hidden = name !== 'gpt'; controller.geminiView.hidden = name !== 'gemini'; controller.settingsView.hidden = name !== 'settings';
    var blue = UIColor.colorWithRedGreenBlueAlpha(0.30, 0.42, 0.87, 1);
    controller.deepseekButton.setTitleColorForState(name === 'deepseek' ? blue : UIColor.darkGrayColor(), 0);
    controller.doubaoButton.setTitleColorForState(name === 'doubao' ? blue : UIColor.darkGrayColor(), 0);
    controller.gptButton.setTitleColorForState(name === 'gpt' ? blue : UIColor.darkGrayColor(), 0);
    controller.geminiButton.setTitleColorForState(name === 'gemini' ? blue : UIColor.darkGrayColor(), 0);
    controller.settingsButton.setTitleColorForState(name === 'settings' ? blue : UIColor.darkGrayColor(), 0);
    layout(controller, changed);
    if (name === 'settings') AIBSettingsPage.enter(controller);
    var site = AIBSites.get(controller, name);
    if (site) {
      if (!site.loaded) load(controller, site);
      else inject(controller, site).catch(function () {});
    }
  }
  function load(controller, site) {
    site.loaded = true;
    controller[site.viewKey].loadRequest(NSURLRequest.requestWithURL(NSURL.URLWithString(site.home)));
  }
  async function inject(controller, site) {
    site = site || AIBSites.get(controller);
    if (!site || controller.uploadOperation && controller.uploadOperation.site === site) return;
    var epoch = site.epoch, injectionId = ++site.injectionId, view = controller[site.viewKey];
    function current() {
      return site.epoch === epoch && site.injectionId === injectionId && !controller.disposed && !(controller.uploadOperation && controller.uploadOperation.site === site);
    }
    try {
      var origin = String(await N.evaluate(view, 'location.origin'));
      if (origin !== site.origin || !current()) return;
      await N.evaluate(view, AIBResources[site.name]);
      if (!current()) return;
      var token = N.token(); site.token = token;
      await AIBUpload.call(controller, 'connect', [token, { inlineButton: false }], site);
    } catch (error) { console.log('[Ai Bridge] 网页连接：' + String(error.message || error)); }
  }
  function setup(controller) {
    if (controller.panelReady || controller.panelInitializing) return;
    controller.panelInitializing = true;
    try {
      controller.view.backgroundColor = UIColor.whiteColor(); controller.view.autoresizingMask = 0;
      controller.view.layer.cornerRadius = 10; controller.view.layer.masksToBounds = true;
      controller.view.layer.borderWidth = 0.5; controller.view.layer.borderColor = UIColor.lightGrayColor();
      controller.webView = new UIWebView({ x: 0, y: 44, width: 700, height: 500 });
      controller.webView.delegate = controller; controller.webView.scalesPageToFit = true; controller.view.addSubview(controller.webView);
      controller.doubaoView = new UIWebView({ x: 0, y: 44, width: 700, height: 500 });
      controller.doubaoView.delegate = controller; controller.doubaoView.scalesPageToFit = true; controller.doubaoView.hidden = true;
      controller.view.addSubview(controller.doubaoView);
      controller.gptView = new UIWebView({ x: 0, y: 44, width: 700, height: 500 });
      controller.gptView.delegate = controller; controller.gptView.scalesPageToFit = true; controller.gptView.hidden = true;
      controller.view.addSubview(controller.gptView);
      controller.geminiView = new UIWebView({ x: 0, y: 44, width: 700, height: 500 });
      controller.geminiView.delegate = controller; controller.geminiView.scalesPageToFit = true; controller.geminiView.hidden = true;
      controller.view.addSubview(controller.geminiView);
      controller.settingsView = new UIWebView({ x: 0, y: 44, width: 700, height: 500 });
      controller.settingsView.delegate = controller; controller.settingsView.scalesPageToFit = false; controller.settingsView.hidden = true;
      controller.view.addSubview(controller.settingsView);
      controller.header = new UIView({ x: 0, y: 0, width: 700, height: 44 });
      controller.header.backgroundColor = UIColor.colorWithWhiteAlpha(0.985, 1); controller.view.addSubview(controller.header);
      controller.deepseekButton = button(controller, 'DeepSeek', 'openDeepSeek:');
      controller.doubaoButton = button(controller, '豆包', 'openDoubao:');
      controller.gptButton = button(controller, 'GPT', 'openGPT:');
      controller.geminiButton = button(controller, 'Gemini', 'openGemini:');
      controller.settingsButton = button(controller, '设置', 'openSettings:');
      controller.refreshButton = button(controller, '', 'refreshPanelPage:');
      controller.refreshButton.accessibilityLabel = '刷新当前网页';
      controller.workflowButton = button(controller, '', 'togglePanelWorkflows:');
      controller.workflowButton.accessibilityLabel = '展开工作流';
      controller.closeButton = button(controller, '', 'closePanel:'); controller.closeButton.accessibilityLabel = '关闭面板';
      AIBToolbarIcons.add(controller.refreshButton, 'refresh', controller.addon.mainPath);
      AIBToolbarIcons.add(controller.workflowButton, 'menu', controller.addon.mainPath);
      AIBToolbarIcons.add(controller.closeButton, 'close', controller.addon.mainPath);
      [controller.deepseekButton, controller.doubaoButton, controller.gptButton, controller.geminiButton, controller.settingsButton, controller.refreshButton, controller.workflowButton, controller.closeButton].forEach(function (control) { controller.header.addSubview(control); });
      controller.indicator = new UIView({ x: 0, y: 38, width: 24, height: 3 });
      controller.indicator.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(0.30, 0.42, 0.87, 1); controller.indicator.layer.cornerRadius = 1.5; controller.header.addSubview(controller.indicator);
      controller.resizeHandle = new UIView({ x: 670, y: 558, width: 30, height: 30 });
      controller.resizeLabel = label('↘', 22); controller.resizeLabel.textAlignment = 1;
      controller.resizeHandle.addSubview(controller.resizeLabel); controller.view.addSubview(controller.resizeHandle);
      if (typeof UIPanGestureRecognizer !== 'undefined') {
        // 手势挂在整条顶栏：轻点仍切换页签，拖动识别后取消按钮点击。
        var drag = new UIPanGestureRecognizer(controller, 'movePanel:');
        drag.cancelsTouchesInView = true; drag.delaysTouchesBegan = false;
        controller.header.addGestureRecognizer(drag);
        controller.resizeHandle.addGestureRecognizer(new UIPanGestureRecognizer(controller, 'resizePanel:'));
      }
      controller.navigationSites = AIBSettings.readNavigation().sites;
      controller.activePage = controller.navigationSites[0] || 'settings'; controller.settingsToken = N.token();
      controller.settingsView.loadHTMLStringBaseURL(AIBResources.settingsHTML.replace('__AIB_TOKEN_VALUE__', controller.settingsToken), null);
      controller.panelReady = true;
      page(controller, controller.activePage);
    } finally { controller.panelInitializing = false; }
    layout(controller);
  }
  function show(controller) {
    var study = N.study(controller); if (!study || !study.view) throw new Error('请先打开一个 MN 学习窗口');
    if (!controller.panelReady) { var view = controller.view; setup(controller); }
    refreshNavigation(controller); controller.visible = true; study.view.addSubview(controller.view);
    AIBWindow.layout(controller); layout(controller);
    if (typeof study.refreshAddonCommands === 'function') study.refreshAddonCommands();
    if (AIBSites.get(controller)) inject(controller).catch(function () {});
    if (controller.activePage === 'settings') AIBSettingsPage.enter(controller);
  }
  function hide(controller) {
    AIBPanelActions.close(controller);
    AIBSettingsPage.cancel(controller);
    AIBWorkflowFiles.cancel(controller);
    AIBWorkflowRunner.cancel(controller);
    AIBNavigationMotion.stop(controller.indicator);
    AIBUpload.cancel(controller); controller.visible = false;
    AIBWindow.save(controller); controller.view.endEditing(true); controller.view.removeFromSuperview();
    var study = N.study(controller); if (study && typeof study.refreshAddonCommands === 'function') study.refreshAddonCommands();
  }
  function dispose(controller) {
    if (!controller) return;
    AIBPanelActions.close(controller);
    AIBSettingsPage.cancel(controller);
    AIBWorkflowFiles.cancel(controller);
    AIBWorkflowRunner.cancel(controller);
    AIBNavigationMotion.stop(controller.indicator);
    AIBUpload.cancel(controller); controller.disposed = true; controller.visible = false;
    AIBSites.all(controller).forEach(function (site) { site.token = ''; site.injectionId++; });
    [controller.webView, controller.doubaoView, controller.gptView, controller.geminiView, controller.settingsView].forEach(function (view) { if (view) { view.delegate = null; view.stopLoading(); } });
    if (controller.view) controller.view.removeFromSuperview();
  }
  var PanelClass = JSB.defineClass('AiBridgePanelController : UIViewController <UIWebViewDelegate>', {
    viewDidLoad: function () { setup(self); },
    viewDidLayoutSubviews: function () { if (self.panelReady) { AIBWindow.layout(self, true); layout(self); } },
    openDeepSeek: function () { page(self, 'deepseek'); },
    openDoubao: function () { page(self, 'doubao'); },
    openGPT: function () { page(self, 'gpt'); },
    openGemini: function () { page(self, 'gemini'); },
    openSettings: function () { page(self, 'settings'); },
    retrySettings: function () { AIBSettingsPage.retry(self); },
    togglePanelWorkflows: function () { AIBPanelActions.toggle(self); },
    runPanelWorkflow: function (sender) { AIBPanelActions.select(self, sender); },
    managePanelWorkflows: function () { AIBPanelActions.manage(self); },
    dismissPanelActions: function () { AIBPanelActions.close(self); },
    refreshPanelPage: function () { AIBPanelActions.refresh(self); },
    confirmPanelRefresh: function () { AIBPanelActions.confirm(self); },
    closePanel: function () { hide(self); },
    movePanel: function (recognizer) { AIBWindow.gesture(self, recognizer, false); layout(self); },
    resizePanel: function (recognizer) { AIBWindow.gesture(self, recognizer, true); layout(self); },
    webViewShouldStartLoadWithRequestNavigationType: function (view, request) {
      var address = N.address(request), controller = self;
      if (view === controller.settingsView) {
        if (/^mnaddon:/i.test(address)) { AIBWebCommands.local(controller, address, view); return false; }
        return address === 'about:blank';
      }
      var site = AIBSites.forView(controller, view);
      if (!site) return false;
      if (/^aibridge:/i.test(address)) { AIBWebCommands.remote(controller, address, view); return false; }
      var main = String(N.value(N.value(request, 'mainDocumentURL'), 'absoluteString') || '');
      if (main && main === address) {
        if (site === AIBSites.get(controller)) AIBPanelActions.close(controller);
        if (controller.uploadOperation && controller.uploadOperation.site === site) AIBUpload.cancel(controller);
        site.token = ''; site.epoch++;
      }
      return /^https:\/\//i.test(address) || address === 'about:blank';
    },
    webViewDidFinishLoad: function (view) {
      var controller = self, site = AIBSites.forView(controller, view);
      if (site) inject(controller, site).catch(function () {});
      if (view === controller.settingsView) AIBSettingsPage.finished(controller);
    },
    webViewDidFailLoadWithError: function (view, error) {
      if (Number(N.value(error, 'code')) === -999) return;
      if (view === self.settingsView) { AIBSettingsPage.failed(self); return; }
      var site = AIBSites.forView(self, view);
      if (site && site === AIBSites.get(self) && self.visible) N.hud(self, site.title + ' 网页加载失败，请重新打开插件：' + String(N.value(error, 'localizedDescription') || '网络不可用'));
    }
  });
  function create(addon) { var controller = PanelClass.new(); controller.addon = addon; return controller; }
  function refreshNavigation(controller) {
    controller.navigationSites = AIBSettings.readNavigation().sites;
    // 隐藏当前网站时切到可见页，已打开的网站实例与草稿继续保留。
    if (controller.activePage !== 'settings' && controller.navigationSites.indexOf(controller.activePage) < 0) page(controller, controller.navigationSites[0] || 'settings');
    else layout(controller);
  }
  return { create: create, show: show, hide: hide, dispose: dispose, layout: layout, page: page, inject: inject, refreshNavigation: refreshNavigation };
})();
