var AIBPanelActions = (function () {
  var N = AIBNative;
  function rect(x, y, width, height) { return { x: x, y: y, width: width, height: height }; }
  function close(controller) {
    var state = controller.panelActions; controller.panelActions = null;
    if (state && state.overlay) state.overlay.removeFromSuperview();
    if (controller.workflowButton) controller.workflowButton.accessibilityLabel = '展开工作流';
  }
  function current(controller, state) {
    return controller.panelActions === state && controller.visible && !controller.disposed &&
      AIBSites.get(controller) === state.site && state.site.epoch === state.epoch;
  }
  function text(parent, value, size, bold) {
    var view = new UILabel(rect(0, 0, 1, 1)); view.text = value;
    view.font = bold ? UIFont.boldSystemFontOfSize(size) : UIFont.systemFontOfSize(size);
    view.textColor = UIColor.darkGrayColor(); view.userInteractionEnabled = false;
    parent.addSubview(view); return view;
  }
  function button(controller, title, action) {
    var view = new UIButton(rect(0, 0, 1, 1)); view.setTitleForState(title, 0);
    view.setTitleColorForState(UIColor.darkGrayColor(), 0); view.titleLabel.font = UIFont.systemFontOfSize(13);
    view.backgroundColor = UIColor.colorWithWhiteAlpha(.97, 1); view.layer.cornerRadius = 7;
    view.addTargetActionForControlEvents(controller, action, 1 << 6); return view;
  }
  function surface(controller, kind) {
    close(controller);
    var site = AIBSites.get(controller);
    if (!site || !controller.visible || controller.disposed) return null;
    var state = { site: site, epoch: site.epoch, kind: kind, rows: [], labels: [] };
    controller.panelActions = state;
    state.overlay = new UIView(rect(0, 44, 1, 1));
    var dismiss = button(controller, '', 'dismissPanelActions:'); dismiss.backgroundColor = UIColor.colorWithWhiteAlpha(0, 0);
    state.dismiss = dismiss; state.overlay.addSubview(dismiss);
    state.menu = new UIView(rect(0, 0, 1, 1)); state.menu.backgroundColor = UIColor.whiteColor();
    state.menu.layer.cornerRadius = 12; state.menu.layer.borderWidth = .5; state.menu.layer.borderColor = UIColor.colorWithWhiteAlpha(.87, 1);
    state.overlay.addSubview(state.menu);
    controller.view.addSubview(state.overlay);
    state.title = text(state.menu, kind === 'workflow' ? '工作流 · 当前网页' : '刷新网页', 12, true);
    return state;
  }
  function layout(controller) {
    var s = controller.panelActions; if (!s || !s.overlay) return;
    var bounds = controller.view.bounds, width = Math.min(248, bounds.width - 16), available = Math.max(0, bounds.height - 60);
    var height = Math.min(s.kind === 'workflow' ? Math.min(320, 78 + Math.max(1, s.rows.length) * 44) : 150, available);
    s.overlay.frame = rect(0, 44, bounds.width, Math.max(0, bounds.height - 44));
    s.dismiss.frame = s.overlay.bounds;
    var right = controller.workflowButton.frame.x + controller.workflowButton.frame.width;
    s.menu.frame = rect(Math.max(8, Math.min(right - width, bounds.width - width - 8)), 6, width, height);
    s.title.frame = rect(14, 8, width - 28, 22);
    if (s.kind === 'workflow') {
      s.scroll.frame = rect(0, 34, width, Math.max(0, height - 78));
      s.scroll.contentSize = { width: width, height: Math.max(1, s.rows.length) * 44 };
      s.rows.forEach(function (row, index) { row.frame = rect(8, index * 44, width - 16, 38); s.labels[index].frame = rect(12, 0, width - 40, 38); });
      if (s.empty) s.empty.frame = rect(14, 0, width - 28, 44);
      s.manage.frame = rect(8, height - 40, width - 16, 32);
    } else {
      s.message.frame = rect(14, 34, width - 28, 64);
      s.cancel.frame = rect(10, height - 42, (width - 30) / 2, 32);
      s.confirm.frame = rect(20 + (width - 30) / 2, height - 42, (width - 30) / 2, 32);
    }
  }
  function toggle(controller) {
    if (controller.panelActions) { close(controller); return; }
    try {
      var items = AIBWorkflows.visible().items, s = surface(controller, 'workflow'); if (!s) return;
      s.ids = items.map(function (item) { return item.id; });
      s.scroll = new UIScrollView(rect(0, 0, 1, 1)); s.scroll.showsHorizontalScrollIndicator = false; s.menu.addSubview(s.scroll);
      s.rows = items.map(function (item, index) {
        var row = button(controller, '', 'runPanelWorkflow:'); row.tag = index; row.accessibilityLabel = item.name;
        var name = text(row, item.name, 13, false); name.numberOfLines = 2; s.labels.push(name); s.scroll.addSubview(row); return row;
      });
      if (!items.length) s.empty = text(s.scroll, '还没有工作流', 13, false);
      s.manage = button(controller, '工作流库  ›', 'managePanelWorkflows:'); s.menu.addSubview(s.manage);
      controller.workflowButton.accessibilityLabel = '收起工作流'; layout(controller);
    } catch (error) { close(controller); N.hud(controller, String(error.message || error)); }
  }
  function select(controller, sender) {
    var s = controller.panelActions, index = Number(N.value(sender, 'tag'));
    if (!s || s.kind !== 'workflow' || !current(controller, s) || s.rows[index] !== sender) return;
    var id = s.ids[index], name = s.site.name; close(controller);
    AIBWorkflowRunner.run(controller.addon, id, name);
  }
  function manage(controller) {
    var s = controller.panelActions; if (!s || !current(controller, s)) return;
    close(controller); AIBWorkflowPet.manage(controller.addon);
  }
  function reload(controller, state) {
    if (!current(controller, state)) return;
    var site = state.site, view = controller[site.viewKey];
    if (controller.uploadOperation || controller.workflowRun) { close(controller); N.hud(controller, '工作流或上传正在处理中，请稍候再刷新'); return; }
    close(controller); AIBUpload.cancel(controller); AIBWorkflowRunner.cancel(controller);
    site.token = ''; site.epoch++; site.injectionId++;
    try { view.reload(); } catch (error) { N.hud(controller, '刷新失败：' + String(error.message || error)); }
  }
  function confirm(controller) {
    var s = controller.panelActions; if (s && s.kind === 'refresh') reload(controller, s);
  }
  async function refresh(controller) {
    if (!AIBSites.get(controller) || !controller.visible || controller.disposed) return;
    if (controller.uploadOperation || controller.workflowRun) { N.hud(controller, '工作流或上传正在处理中，请稍候再刷新'); return; }
    if (controller.panelActions && controller.panelActions.kind === 'checking') return;
    close(controller);
    var site = AIBSites.get(controller), s = { site: site, epoch: site.epoch, kind: 'checking' };
    controller.panelActions = s;
    var pending = true, inspected = false;
    try {
      var result = JSON.parse(String(await N.evaluate(controller[site.viewKey], AIBResources.refreshProbe, 3)));
      if (result && typeof result.pending === 'boolean') { pending = result.pending; inspected = true; }
    } catch (_) {}
    if (!current(controller, s)) return;
    if (!pending) { reload(controller, s); return; }
    s = surface(controller, 'refresh'); if (!s) return;
    s.message = text(s.menu, inspected ? '当前网页有未发送内容。刷新可能丢失草稿和待发送附件。' : '无法确认网页草稿状态，刷新可能丢失未发送内容。', 13, false);
    s.message.numberOfLines = 3;
    s.cancel = button(controller, '取消', 'dismissPanelActions:'); s.menu.addSubview(s.cancel);
    s.confirm = button(controller, '刷新', 'confirmPanelRefresh:'); s.menu.addSubview(s.confirm); layout(controller);
  }
  return { layout: layout, close: close, toggle: toggle, select: select, manage: manage, refresh: refresh, confirm: confirm };
})();
