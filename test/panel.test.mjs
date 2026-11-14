import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
function panel(sites = ['deepseek', 'gpt', 'gemini'], nativeWindow = false) {
  let methods;
  class View {
    constructor(frame = { x: 0, y: 0, width: 700, height: 600 }) {
      this.frame = frame; this.children = []; this.gestures = []; this.titleLabel = {};
      this.layer = { animations: new Map(), presentationLayer() { return this.presentedX === undefined ? null : { position: { x: this.presentedX } }; },
        addAnimationForKey(animation, key) { this.animations.set(key, animation); }, removeAnimationForKey(key) { this.animations.delete(key); } };
    }
    get bounds() { return { x: 0, y: 0, width: this.frame.width, height: this.frame.height }; }
    addSubview(child) { this.children.push(child); child.superview = this; }
    removeFromSuperview() { if (this.superview) this.superview.children = this.superview.children.filter(child => child !== this); this.superview = null; }
    endEditing() {}
    addGestureRecognizer(gesture) { this.gestures.push(gesture); }
    setTitleForState(title) { this.title = title; }
    setTitleColorForState() {} addTargetActionForControlEvents() {} loadHTMLStringBaseURL() {}
    loadRequest(url) { (this.requests ||= []).push(url); }
    evaluateJavaScript(code, callback) { callback('about:blank'); }
  }
  const color = new Proxy({}, { get: () => () => ({}) });
  const fonts = { systemFontOfSize: size => ({ size, bold: false }), boldSystemFontOfSize: size => ({ size, bold: true }) };
  const values = new Map(), study = { view: new View({ x: 0, y: 0, width: 1024, height: 768 }) };
  const context = vm.createContext({ console, UIView: View, UILabel: View, UIButton: View, UIWebView: View, UIColor: color, UIFont: fonts,
    CABasicAnimation: { animationWithKeyPath: keyPath => ({ keyPath }) }, CAMediaTimingFunction: { functionWithControlPoints: (...points) => points },
    CATransaction: { begin() {}, commit() {}, setAnimationDuration() {} },
    UIPanGestureRecognizer: class { constructor(target, action) { this.target = target; this.action = action; } },
    NSURL: { URLWithString: url => url }, NSURLRequest: { requestWithURL: url => url },
    AIBNative: { preference: (key, fallback) => key === 'navigationSites' && sites !== null ? JSON.stringify({ schema: 3, sites }) : fallback, save: () => {}, token: () => 'test', evaluate: async () => 'about:blank', address: request => request.url, value: (object, key) => object?.[key] }, AIBResources: { settingsHTML: '', deepseek: 'deepseek-script', doubao: 'doubao-script', gpt: 'gpt-script', gemini: 'gemini-script' },
    AIBUpload: { cancel(controller) { controller.uploadOperation = null; }, async call() {} }, AIBWindow: { layout() {} }, AIBPets: { cancel() {}, front() {} },
    AIBWorkflowRunner: { cancel(controller) { controller.workflowRun = null; } }, AIBWorkflowPet: { reveal() {} },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: key => values.get(key), setObjectForKey: (value, key) => values.set(key, value) }) },
    JSB: { defineClass: (name, definition) => { methods = definition; return { new: () => ({ view: new View() }) }; } }
  });
  context.AIBNative.study = () => study;
  if (nativeWindow) vm.runInContext(readFileSync('src/AIBWindow.js', 'utf8'), context);
  for (const file of ['AIBSettings', 'AIBSites', 'AIBNavigationMotion', 'AIBPanel']) vm.runInContext(readFileSync('src/' + file + '.js', 'utf8'), context);
  const controller = context.AIBPanel.create({ window: {} }); context.self = controller; methods.viewDidLoad();
  return { controller, context, methods, values, study };
}

test('面板可拖出四边，自动布局不拉回，屏幕外缩放保持左上角，重新打开恢复可见', () => {
  const { controller: c, context, methods, values, study } = panel(['deepseek'], true);
  context.AIBPanel.show(c);
  const gesture = (dx, dy) => ({ state: 3, translationInView: () => ({ x: dx, y: dy }), setTranslationInView() {} });
  for (const [x, y] of [[-200, 100], [1100, 100], [100, -200], [100, 900]]) {
    methods.movePanel(gesture(x - c.view.frame.x, y - c.view.frame.y));
    methods.viewDidLayoutSubviews();
    assert.equal(c.view.frame.x, x); assert.equal(c.view.frame.y, y);
    const saved = JSON.parse(values.get('cn.marginnote.ai-bridge.windowFrame'));
    assert.equal(saved.x, x); assert.equal(saved.y, y);
  }
  const before = { ...c.view.frame };
  methods.resizePanel(gesture(80, 40)); methods.viewDidLayoutSubviews();
  assert.equal(c.view.frame.x, before.x); assert.equal(c.view.frame.y, before.y);
  assert.equal(c.view.frame.width, before.width + 80); assert.equal(c.view.frame.height, before.height + 40);
  assert.equal(c.webView.frame.width, c.view.frame.width);
  context.AIBPanel.hide(c); context.AIBPanel.show(c);
  const f = c.view.frame;
  assert.ok(f.x >= 8 && f.y >= 8 && f.x + f.width <= 1016 && f.y + f.height <= 760);
  methods.movePanel(gesture(-2000, -2000)); study.view.frame = { x: 0, y: 0, width: 320, height: 240 };
  methods.viewDidLayoutSubviews(); assert.ok(c.view.frame.x < 0 && c.view.frame.y < 0);
  context.AIBPanel.hide(c); context.AIBPanel.show(c);
  assert.ok(c.view.frame.x >= 0 && c.view.frame.y >= 0 && c.view.frame.x + c.view.frame.width <= 320 && c.view.frame.y + c.view.frame.height <= 240);
});
test('顶栏整条绑定拖动，按钮仍保留各自点击入口', () => {
  const { controller } = panel();
  assert.equal(controller.dragLabel, undefined); assert.equal(controller.dragHandle, undefined);
  assert.equal(controller.header.gestures.length, 1); const gesture = controller.header.gestures[0];
  assert.equal(gesture.action, 'movePanel:'); assert.equal(gesture.cancelsTouchesInView, true);
  assert.equal(controller.deepseekButton.title, 'DeepSeek'); assert.equal(controller.settingsButton.title, '设置');
  assert.equal(controller.gptButton.title, 'GPT'); assert.equal(controller.gptButton.superview, controller.header);
  assert.equal(controller.deepseekButton.superview, controller.header);
  for (const tab of [controller.deepseekButton, controller.doubaoButton, controller.gptButton, controller.settingsButton]) {
    assert.deepEqual(tab.titleLabel.font, { size: 14, bold: true });
  }
  assert.deepEqual(controller.closeButton.titleLabel.font, { size: 24, bold: false });
});

test('Gemini 在 GPT 右侧、设置左侧，首次打开才加载，切换后保留网页和草稿', () => {
  const { controller, context, methods } = panel();
  assert.ok(controller.gptButton.frame.x < controller.geminiButton.frame.x && controller.geminiButton.frame.x < controller.settingsButton.frame.x);
  assert.equal(controller.geminiView.requests, undefined); methods.openGemini();
  assert.equal(controller.activePage, 'gemini'); assert.equal(controller.geminiView.hidden, false); assert.equal(controller.gptView.hidden, true);
  assert.deepEqual(controller.geminiView.requests, ['https://gemini.google.com/app']); controller.geminiView.draft = 'Gemini 草稿';
  methods.openGPT(); methods.openGemini(); assert.equal(controller.geminiView.requests.length, 1); assert.equal(controller.geminiView.draft, 'Gemini 草稿');
  for (const width of [304, 340, 700]) { controller.view.frame.width = width; context.AIBPanel.layout(controller); assert.ok(controller.settingsButton.frame.x + controller.settingsButton.frame.width <= controller.closeButton.frame.x); }
});

test('工作流可临时打开隐藏网站，不改变用户导航显示偏好，切换页面取消待执行工作流', () => {
  const { controller, context } = panel(['deepseek']);
  context.AIBPanel.page(controller, 'gpt'); assert.equal(controller.activePage, 'deepseek');
  context.AIBPanel.page(controller, 'gpt', true); assert.equal(controller.activePage, 'gpt');
  assert.equal(controller.gptButton.hidden, false); assert.deepEqual(Array.from(context.AIBSettings.readNavigation().sites), ['deepseek']);
  controller.workflowRun = { site: 'gpt' }; context.AIBPanel.page(controller, 'settings'); assert.equal(controller.workflowRun, null);
});

test('GPT 位于 DeepSeek 和设置之间，切换后保留各自页面', () => {
  const { controller, context, methods } = panel();
  assert.ok(controller.deepseekButton.frame.x < controller.gptButton.frame.x && controller.gptButton.frame.x < controller.settingsButton.frame.x);
  assert.deepEqual(controller.webView.requests, ['https://chat.deepseek.com/']); assert.equal(controller.gptView.requests, undefined);
  controller.webView.draft = 'DeepSeek 草稿'; controller.gptView.draft = 'GPT 草稿';
  methods.openGPT(); assert.equal(controller.activePage, 'gpt');
  assert.deepEqual(controller.gptView.requests, ['https://chatgpt.com/']);
  assert.equal(controller.gptView.hidden, false); assert.equal(controller.webView.hidden, true); assert.equal(controller.settingsView.hidden, true);
  context.AIBPanel.page(controller, 'deepseek'); methods.openGPT();
  assert.equal(controller.webView.requests.length, 1); assert.equal(controller.gptView.requests.length, 1);
  assert.equal(controller.webView.draft, 'DeepSeek 草稿'); assert.equal(controller.gptView.draft, 'GPT 草稿');
  assert.equal(controller.gptView.frame.height, controller.webView.frame.height);
});

test('后台网页跳转只使自身 token 失效，不取消当前网站上传', () => {
  const { controller, context, methods } = panel(); methods.openGPT();
  const active = context.AIBSites.get(controller), background = context.AIBSites.get(controller, 'deepseek');
  controller.uploadOperation = { site: active }; background.token = 'old';
  const request = { url: 'https://chat.deepseek.com/a/other', mainDocumentURL: { absoluteString: 'https://chat.deepseek.com/a/other' } };
  assert.equal(methods.webViewShouldStartLoadWithRequestNavigationType(controller.webView, request), true);
  assert.ok(controller.uploadOperation); assert.equal(background.token, ''); assert.equal(background.epoch, 1); assert.equal(active.epoch, 0);
  methods.webViewShouldStartLoadWithRequestNavigationType(controller.gptView, { url: 'https://chatgpt.com/c/other', mainDocumentURL: { absoluteString: 'https://chatgpt.com/c/other' } });
  assert.equal(controller.uploadOperation, null); assert.equal(active.epoch, 1);
});

test('网页脚本及连接 token 分别注入各自网站，登录域名不注入', async () => {
  const { controller, context } = panel(); const scripts = [], connected = [];
  context.AIBNative.evaluate = async (view, code) => {
    if (code === 'location.origin') return context.AIBSites.forView(controller, view).origin;
    scripts.push([view, code]);
  };
  context.AIBUpload.call = async (c, method, args, site) => connected.push(site.name);
  for (const site of context.AIBSites.all(controller)) await context.AIBPanel.inject(controller, site);
  assert.deepEqual(scripts, [[controller.webView, 'deepseek-script'], [controller.doubaoView, 'doubao-script'], [controller.gptView, 'gpt-script'], [controller.geminiView, 'gemini-script']]);
  assert.deepEqual(connected, ['deepseek', 'doubao', 'gpt', 'gemini']);
  context.AIBNative.evaluate = async () => 'https://auth.openai.com';
  await context.AIBPanel.inject(controller, context.AIBSites.get(controller, 'gpt')); assert.equal(scripts.length, 4);
});
test('网页延伸至窗口底部，只有右下角缩放手柄覆盖其上', () => {
  const { controller, context } = panel();
  assert.equal(controller.footer, undefined); assert.equal(controller.uploadButton, undefined); assert.equal(controller.refreshButton, undefined); assert.equal(controller.statusLabel, undefined);
  assert.equal(controller.webView.frame.height, 556); assert.equal(controller.resizeHandle.superview, controller.view);
  assert.deepEqual({ ...controller.resizeHandle.frame }, { x: 670, y: 570, width: 30, height: 30 });
  context.AIBPanel.page(controller, 'settings'); assert.equal(controller.webView.hidden, true); assert.equal(controller.settingsView.hidden, false);
});

test('GPT 页面跳转上传命令交给原生处理并阻止实际离开聊天页', () => {
  const { controller, context, methods } = panel(); methods.openGPT(); const calls = [];
  context.AIBWebCommands = { remote: (...args) => { calls.push(args); return true; } };
  const site = context.AIBSites.get(controller); const epoch = site.epoch;
  const address = 'aibridge://upload?token=current';
  const allowed = methods.webViewShouldStartLoadWithRequestNavigationType(controller.gptView, { url: address, mainDocumentURL: { absoluteString: address } });
  assert.equal(allowed, false); assert.deepEqual(calls, [[controller, address, controller.gptView]]); assert.equal(site.epoch, epoch);
});

test('默认仅显示 DeepSeek 和设置，豆包保留代码但不能打开', () => {
  const { controller, context, methods } = panel(null);
  assert.deepEqual(Array.from(controller.navigationSites), ['deepseek']);
  for (const name of ['doubao', 'gpt', 'gemini']) assert.equal(controller[name + 'Button'].hidden, true);
  assert.equal(controller.settingsButton.hidden, false);
  methods.openDoubao(); context.AIBPanel.page(controller, 'doubao', true);
  assert.equal(controller.activePage, 'deepseek'); assert.equal(controller.doubaoView.requests, undefined);
  assert.ok(context.AIBResources.doubao); assert.ok(controller.doubaoView);
});

test('豆包上传命令由原生拦截，后台豆包跳转不会取消 GPT 上传', () => {
  const { controller, context, methods } = panel();
  const site = context.AIBSites.get(controller, 'doubao'); site.token = 'doubao-current';
  let remote = 0; context.AIBWebCommands = { remote(c, url, view) { assert.equal(view, controller.doubaoView); remote++; } };
  assert.equal(methods.webViewShouldStartLoadWithRequestNavigationType(controller.doubaoView, { url: 'aibridge://upload?token=doubao-current' }), false);
  assert.equal(remote, 1);
  methods.openGPT(); controller.uploadOperation = { site: context.AIBSites.get(controller) };
  const url = 'https://www.doubao.com/chat/another';
  methods.webViewShouldStartLoadWithRequestNavigationType(controller.doubaoView, { url, mainDocumentURL: { absoluteString: url } });
  assert.ok(controller.uploadOperation); assert.equal(site.token, ''); assert.equal(site.epoch, 1);
});

test('七种导航组合均保留设置和原有按钮宽度，启动时不加载隐藏网站', () => {
  const all = ['deepseek', 'gpt', 'gemini'];
  for (let mask = 1; mask < 8; mask++) {
    const sites = all.filter((_, index) => mask & (1 << index));
    const { controller, context } = panel(sites);
    assert.equal(controller.activePage, sites[0] || 'settings');
    const visible = sites.concat('settings').map(name => controller[name + 'Button']);
    for (const name of all) assert.equal(controller[name + 'Button'].hidden, !sites.includes(name));
    assert.equal(controller.settingsButton.hidden, false);
    for (const tab of visible) assert.equal(tab.frame.width, 85);
    assert.ok(visible.every((tab, index) => !index || tab.frame.x === visible[index - 1].frame.x + 85));
    for (const site of context.AIBSites.all(controller)) assert.equal((controller[site.viewKey].requests || []).length, site.name === sites[0] ? 1 : 0);
  }
});

test('隐藏当前网站切换到可见页，重新显示后复用网页和草稿', () => {
  const sites = ['deepseek', 'gemini', 'gpt'];
  const { controller, context, methods } = panel(sites);
  methods.openGPT(); controller.gptView.draft = '保留的 GPT 草稿';
  sites.splice(0, 3, 'gemini'); context.AIBPanel.refreshNavigation(controller);
  assert.equal(controller.activePage, 'gemini'); assert.equal(controller.gptView.hidden, true);
  methods.openGPT(); assert.equal(controller.activePage, 'gemini');
  sites.push('gpt'); context.AIBPanel.refreshNavigation(controller); methods.openGPT();
  assert.equal(controller.gptView.draft, '保留的 GPT 草稿'); assert.equal(controller.gptView.requests.length, 1);
  sites.splice(0, sites.length, 'deepseek'); context.AIBPanel.refreshNavigation(controller);
  assert.equal(controller.activePage, 'deepseek'); assert.equal(controller.settingsButton.hidden, false);
});

test('导航横线快速切换从呈现位置继续，重复布局不打断，缺少动画接口时正常切换', () => {
  const { controller, context, methods } = panel(), indicator = controller.indicator, key = 'aib.navigation.indicator';
  indicator.layer.presentedX = 240; methods.openGPT();
  const animation = indicator.layer.animations.get(key);
  assert.equal(animation.keyPath, 'position.x'); assert.equal(animation.fromValue, 240);
  assert.equal(animation.toValue, indicator.frame.x + indicator.frame.width / 2);
  context.AIBPanel.layout(controller); assert.equal(indicator.layer.animations.get(key), animation);
  indicator.layer.presentedX = 310; methods.openDeepSeek();
  assert.equal(indicator.layer.animations.get(key).fromValue, 310);
  controller.view.frame.width = 850; context.AIBPanel.layout(controller); assert.equal(indicator.layer.animations.size, 0);
  delete context.CABasicAnimation; methods.openSettings();
  assert.equal(controller.activePage, 'settings'); assert.equal(controller.settingsView.hidden, false);
  assert.equal(indicator.frame.x + 12, controller.settingsButton.frame.x + controller.settingsButton.frame.width / 2);
});
