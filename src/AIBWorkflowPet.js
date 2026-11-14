var AIBWorkflowPet = (function () {
  var N = AIBNative;
  function blue() { return UIColor.colorWithRedGreenBlueAlpha(.30, .42, .87, 1); }
  function navy() { return UIColor.colorWithRedGreenBlueAlpha(.13, .19, .42, 1); }
  function gray(value) { return UIColor.colorWithWhiteAlpha(value, 1); }
  function rect(x, y, width, height) { return { x: x, y: y, width: width, height: height }; }
  function clamp(value, low, high) { return Math.max(low, Math.min(value, Math.max(low, high))); }
  function text(parent, value, size, bold, color) {
    var label = new UILabel(rect(0, 0, 1, 1)); label.text = value; label.font = bold ? UIFont.boldSystemFontOfSize(size) : UIFont.systemFontOfSize(size);
    label.textColor = color; label.userInteractionEnabled = false; parent.addSubview(label); return label;
  }
  function surface(view, radius) {
    view.backgroundColor = UIColor.whiteColor(); view.layer.cornerRadius = radius;
    view.layer.borderWidth = .5; view.layer.borderColor = gray(.89);
    view.layer.shadowColor = gray(.12); view.layer.shadowOpacity = .09; view.layer.shadowRadius = 12; view.layer.shadowOffset = { width: 0, height: 4 };
  }
  function button(s, title, selector, frame) {
    var view = new UIButton(frame); view.setTitleForState(title, 0); view.setTitleColorForState(blue(), 0);
    view.titleLabel.font = UIFont.systemFontOfSize(14); view.backgroundColor = UIColor.whiteColor();
    view.addTargetActionForControlEvents(s.context, selector, 1 << 6); return view;
  }
  function stack(s) {
    var parent = s.view && s.view.superview;
    if (!parent || !s.active || !s.settings.visible) return;
    var base = Number(N.value(s.view.layer, 'zPosition')) || 0, sibling = s.view;
    // 同时固定图层和子视图顺序，保持可见顺序与触摸命中顺序一致。
    [s.workflowMenu, s.workflowButton].forEach(function (view, index) {
      if (!view || view.superview !== parent) return;
      if (view.layer && N.value(view.layer, 'zPosition') !== base + index + 1) view.layer.zPosition = base + index + 1;
      var children = N.items(N.value(parent, 'subviews'));
      if (children.indexOf(view) < children.indexOf(sibling)) {
        if (typeof parent.insertSubviewAboveSubview === 'function') parent.insertSubviewAboveSubview(view, sibling);
        else parent.addSubview(view);
      }
      sibling = view;
    });
  }
  function close(s) {
    if (s.workflowMenu) s.workflowMenu.removeFromSuperview();
    s.workflowMenu = null; s.workflowMenuButtons = []; s.workflowMenuItems = [];
    s.workflowScroll = null; s.workflowEmpty = null; s.workflowManageButton = null;
    s.workflowRowLabels = []; s.workflowTitle = null; s.workflowCount = null; s.workflowDivider = null;
    if (s.workflowButton) s.workflowButton.accessibilityLabel = '展开工作流';
    stack(s);
  }
  function geometry(bounds, pet, count) {
    var width = Math.min(228, bounds.width - 16), content = Math.max(count, 1) * 48;
    var height = Math.min(32 + Math.min(content, 240) + 44, bounds.height - 16);
    var toggle = rect(clamp(pet.x + pet.width - 22, 8, bounds.width - 40), clamp(pet.y, 8, bounds.height - 40), 32, 32);
    var x = clamp(toggle.x + toggle.width - width, 8, bounds.width - width - 8), y = toggle.y - height - 10;
    if (y < 8) {
      // 顶边放不下时移至侧边；始终避开开关，确保可以再次收起。
      if (pet.x >= width + 18) { x = pet.x - width - 10; y = clamp(toggle.y - 10, 8, bounds.height - height - 8); }
      else if (bounds.width - pet.x - pet.width >= width + 18) { x = pet.x + pet.width + 10; y = clamp(toggle.y - 10, 8, bounds.height - height - 8); }
      else {
        var above = toggle.y - 18, below = bounds.height - toggle.y - toggle.height - 18;
        height = Math.min(height, Math.max(above, below));
        y = above >= below ? toggle.y - height - 10 : toggle.y + toggle.height + 10;
      }
    }
    return { toggle: toggle, menu: rect(x, y, width, height), content: content };
  }
  function layout(s) {
    var parent = s.view && s.view.superview;
    if (!parent || !s.workflowButton) return;
    var plan = geometry(parent.bounds, s.view.frame, (s.workflowMenuItems || []).length);
    s.workflowButton.frame = plan.toggle;
    if (s.workflowMenu) {
      var width = plan.menu.width, height = plan.menu.height;
      s.workflowMenu.frame = plan.menu;
      s.workflowTitle.frame = rect(16, 7, width - 68, 20); s.workflowCount.frame = rect(width - 48, 7, 32, 20);
      s.workflowScroll.frame = rect(0, 32, width, Math.max(0, height - 76)); s.workflowScroll.contentSize = { width: width, height: plan.content };
      s.workflowMenuButtons.forEach(function (view, index) {
        view.frame = rect(8, index * 48, width - 16, 42);
        var labels = s.workflowRowLabels[index]; labels.name.frame = rect(12, 1, width - 98, 40); labels.site.frame = rect(width - 86, 1, 58, 40);
      });
      if (s.workflowEmpty) s.workflowEmpty.frame = rect(16, 0, width - 32, 46);
      s.workflowDivider.frame = rect(16, height - 43, width - 32, .5);
      s.workflowManageButton.frame = rect(8, height - 39, width - 16, 32);
    }
    stack(s);
  }
  function show(s) {
    if (!s.view || !s.view.superview || !s.active) return;
    if (typeof UIButton === 'undefined' || typeof UIFont === 'undefined') return;
    if (!s.workflowButton) {
      s.workflowButton = button(s, '', 'petWorkflowMenu:', rect(0, 0, 32, 32));
      s.workflowButton.backgroundColor = navy(); s.workflowButton.layer.cornerRadius = 7;
      [9, 15, 21].forEach(function (y) {
        var line = new UIView(rect(7, y, 18, 2)); line.backgroundColor = UIColor.whiteColor(); line.layer.cornerRadius = 1;
        line.userInteractionEnabled = false; s.workflowButton.addSubview(line);
      });
      s.workflowButton.accessibilityLabel = '展开工作流';
    }
    if (s.workflowButton.superview !== s.view.superview) s.view.superview.addSubview(s.workflowButton);
    layout(s);
  }
  function hide(s) { close(s); if (s.workflowButton) s.workflowButton.removeFromSuperview(); }
  function toggle(addon) {
    var s = addon.petSession;
    if (!s || !s.active || !s.view || !s.view.superview || !s.settings.visible) return;
    try {
      if (s.workflowMenu) { close(s); return; }
      var items = AIBWorkflows.visible().items;
      if (typeof UIScrollView === 'undefined') throw new Error('当前 MN 缺少工作流菜单滚动接口');
      var menu = s.workflowMenu = new UIView(rect(0, 0, 228, 124)); surface(menu, 14);
      s.workflowTitle = text(menu, '工作流', 11, true, navy()); s.workflowCount = text(menu, String(items.length), 11, false, gray(.63)); s.workflowCount.textAlignment = 2;
      s.workflowScroll = new UIScrollView(rect(0, 32, 240, 52)); s.workflowScroll.showsHorizontalScrollIndicator = false; menu.addSubview(s.workflowScroll);
      s.workflowMenuItems = items.map(function (item) { return item.id; });
      s.workflowRowLabels = [];
      s.workflowMenuButtons = items.map(function (item, index) {
        var row = button(s, '', 'petRunWorkflow:', rect(8, index * 48, 212, 42)); row.tag = index; row.layer.cornerRadius = 8;
        row.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(.96, .97, .985, 1); row.accessibilityLabel = item.name;
        var name = text(row, item.name, 13, true, navy()); name.numberOfLines = 2;
        var site = text(row, { deepseek: 'DeepSeek', doubao: '豆包', gpt: 'GPT', gemini: 'Gemini' }[item.site], 10, false, gray(.55)); site.textAlignment = 2;
        s.workflowRowLabels.push({ name: name, site: site });
        s.workflowScroll.addSubview(row); return row;
      });
      s.workflowEmpty = null;
      if (!items.length) {
        s.workflowEmpty = text(s.workflowScroll, '添加第一个工作流吧', 13, false, gray(.58));
      }
      s.workflowDivider = new UIView(rect(16, 0, 208, .5)); s.workflowDivider.backgroundColor = gray(.92); s.workflowDivider.userInteractionEnabled = false; menu.addSubview(s.workflowDivider);
      s.workflowManageButton = button(s, items.length ? '管理工作流  ›' : '添加工作流  ›', 'petManageWorkflows:', rect(10, 80, 220, 36));
      s.workflowManageButton.titleLabel.font = UIFont.systemFontOfSize(12); s.workflowManageButton.setTitleColorForState(gray(.50), 0); s.workflowManageButton.backgroundColor = UIColor.clearColor(); menu.addSubview(s.workflowManageButton);
      s.view.superview.addSubview(menu); s.view.superview.addSubview(s.workflowButton); s.workflowButton.accessibilityLabel = '收起工作流'; layout(s);
    } catch (error) { close(s); N.app().showHUD(String(error.message || error), addon.window, 3); }
  }
  function select(addon, sender) {
    var s = addon.petSession, index = Number(N.value(sender, 'tag'));
    if (!s || !s.active || !s.workflowMenu || !s.workflowMenuButtons || s.workflowMenuButtons[index] !== sender) return;
    var id = s.workflowMenuItems[index]; close(s); AIBWorkflowRunner.run(addon, id);
  }
  function manage(addon) {
    var s = addon.petSession; if (s) close(s);
    try {
      var controller = addon.panelController || (addon.panelController = AIBPanel.create(addon));
      AIBPanel.show(controller); AIBPanel.page(controller, 'settings');
      controller.openWorkflows = true; reveal(controller);
    } catch (error) { N.app().showHUD(String(error.message || error), addon.window, 3); }
  }
  function reveal(controller) {
    if (!controller.openWorkflows || controller.activePage !== 'settings') return;
    N.evaluate(controller.settingsView, 'Boolean(window.__AIB_OPEN_WORKFLOWS__&&window.__AIB_OPEN_WORKFLOWS__())').then(function (opened) { if (opened === true || opened === 'true') controller.openWorkflows = false; }).catch(function () {});
  }
  return { show: show, hide: hide, layout: layout, close: close, toggle: toggle, select: select, manage: manage, reveal: reveal, geometry: geometry, stack: stack };
})();
