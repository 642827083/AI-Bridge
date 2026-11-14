var AIBPetOverlay = (function () {
  function cancelTimer(s, name) { if (s[name]) { s[name].invalidate(); s[name] = null; } }
  function schedule(s, name, seconds, callback) {
    cancelTimer(s, name);
    s[name] = NSTimer.scheduledTimerWithTimeInterval(seconds, false, function () {
      s[name] = null; if (s.destroyed) return;
      try { callback(); } catch (error) { report(s, error); }
    });
  }
  function publish(s) { if (typeof AIBPets !== 'undefined') AIBPets.publish(s); }
  function report(s, error) { s.lastError = String(error.message || error); console.log('[Ai Bridge] 桌宠：' + s.lastError); publish(s); }
  function available(s) { return s.settings.source === 'builtin' || (s.settings.source === 'image' ? !!(s.customPet && s.customPet.base64) : !!s.petPack); }
  function host(s) {
    var study = Application.sharedInstance().studyController(s.context.window);
    if (!study || !study.view) return null;
    var candidates = [AIBNative.value(study.view, 'window'), s.context.window];
    for (var i = 0; i < candidates.length; i++) {
      var view = candidates[i], bounds = AIBNative.value(view, 'bounds');
      if (view && typeof view.addSubview === 'function' && bounds && Number(bounds.width) > 0 && Number(bounds.height) > 0) return view;
    }
    return study.view;
  }
  function attach(s, parent) {
    if (s.view.superview === parent) return;
    // 学习内容区可能避开底部安全区域；桌宠直接挂到本场景窗口，只有自身范围接收触摸。
    AIBWorkflowPet.close(s); AIBPetInteraction.stop(s); s.dragOrigin = null;
    parent.addSubview(s.view);
    if (s.workflowButton) parent.addSubview(s.workflowButton);
  }
  function layout(s) {
    if (!s.view || !s.view.superview) return;
    var parent = host(s); if (parent) attach(s, parent);
    var frame = AIBPetModel.frame(s.settings, s.view.superview.bounds); s.view.frame = frame;
    s.imageView.frame = { x: 0, y: 0, width: frame.width, height: frame.height }; s.view.alpha = s.settings.opacity;
    AIBPetAnimationPlayer.layout(s);
    AIBPetInteraction.layout(s);
    AIBWorkflowPet.layout(s);
  }
  function show(s) {
    if (s.destroyed || !s.active || !s.settings.visible || !available(s)) { hide(s); return; }
    var parent = host(s); if (!parent) return;
    if (!s.view) {
      if (typeof UIView === 'undefined' || typeof UIImageView === 'undefined' || typeof UIImage === 'undefined' || typeof UIColor === 'undefined') throw new Error('当前 MN 缺少桌宠显示接口');
      s.view = typeof UIButton !== 'undefined' ? new UIButton({ x: 0, y: 0, width: 112, height: 112 }) : new UIView({ x: 0, y: 0, width: 112, height: 112 });
      if (typeof s.view.addTargetActionForControlEvents === 'function') {
        s.view.addTargetActionForControlEvents(s.context, 'petPress:', 1 << 0);
        s.view.addTargetActionForControlEvents(s.context, 'petRelease:', (1 << 6) | (1 << 7) | (1 << 8));
      }
      s.imageView = new UIImageView({ x: 0, y: 0, width: 112, height: 112 });
      s.view.backgroundColor = UIColor.clearColor(); s.imageView.backgroundColor = UIColor.clearColor();
      s.view.userInteractionEnabled = true; s.imageView.userInteractionEnabled = false; s.view.addSubview(s.imageView);
      if (typeof UIPanGestureRecognizer !== 'undefined') {
        s.panGesture = new UIPanGestureRecognizer(s.context, 'petPan:'); s.panGesture.maximumNumberOfTouches = 1;
        s.view.addGestureRecognizer(s.panGesture);
      }
      if (typeof UITapGestureRecognizer !== 'undefined') {
        s.tapGesture = new UITapGestureRecognizer(s.context, 'petTap:');
        if (s.panGesture && typeof s.tapGesture.requireGestureRecognizerToFail === 'function') s.tapGesture.requireGestureRecognizerToFail(s.panGesture);
        s.view.addGestureRecognizer(s.tapGesture);
      }
    }
    attach(s, parent);
    layout(s);
    AIBWorkflowPet.show(s);
    var revision = s.settings.source + ':' + (s.settings.source === 'builtin' ? AIBBuiltinPet.snapshot().revision : s.settings.source === 'image' ? s.customPet.revision : s.petPack.revision);
    if (s.renderedRevision === revision) return;
    AIBPetInteraction.stop(s);
    AIBPetAnimationPlayer.dispose(s);
    s.animationWarning = '';
    s.imageView.image = s.settings.source === 'builtin' ? AIBBuiltinPet.image(s) : s.settings.source === 'image' ? AIBPetImageStore.image(s.customPet) : AIBPetPackStore.poster(s.petPack);
    s.renderedRevision = revision; s.lastError = '';
    if (s.settings.source === 'pack') AIBPetAnimationPlayer.play(s, s.petPack.manifest.actions.find(function (a) { return a.id === 'idle'; }), false);
  }
  function hide(s) {
    AIBWorkflowPet.hide(s);
    AIBPetInteraction.stop(s); s.dragOrigin = null;
    AIBPetAnimationPlayer.dispose(s); s.renderedRevision = '';
    if (s.view) s.view.removeFromSuperview();
    if (s.imageView) s.imageView.image = null;
  }
  function pan(s, gesture) {
    if (!s.view || !s.view.superview || !s.active) return;
    if (gesture.state === 1) {
      AIBWorkflowPet.close(s);
      AIBPetInteraction.stop(s);
      if (s.settings.source === 'pack' && s.petPack) AIBPetAnimationPlayer.play(s, s.petPack.manifest.actions.find(function (action) { return action.id === 'idle'; }), false);
      s.dragOrigin = { x: s.view.frame.x, y: s.view.frame.y };
    }
    if (s.dragOrigin && [1, 2, 3].indexOf(gesture.state) >= 0) {
      var delta = gesture.translationInView(s.view.superview);
      s.settings.position = AIBPetModel.position(s.settings, s.view.superview.bounds, s.dragOrigin.x + delta.x, s.dragOrigin.y + delta.y); layout(s);
    }
    if ([3, 4, 5].indexOf(gesture.state) >= 0) {
      s.dragOrigin = null;
      s.suppressTapUntil = Date.now() + 300;
      // 拖动只保存位置，避免覆盖其他窗口刚更新的显示选项。
      var latest = AIBPetModel.read(); latest.position = s.settings.position; AIBPetModel.write(latest);
    }
  }
  function dispose(s) {
    cancelTimer(s, 'mountTimer'); AIBPetPackStore.cancel(s); cancelTimer(s, 'customImportTimer'); s.customPetTransfer = null;
    hide(s); s.destroyed = true;
    if (s.view && s.panGesture) s.view.removeGestureRecognizer(s.panGesture);
    if (s.view && s.tapGesture) s.view.removeGestureRecognizer(s.tapGesture);
    s.view = null; s.imageView = null; s.petPack = null; s.customPet = null;
    s.workflowButton = null; s.workflowScroll = null; s.workflowManageButton = null; s.workflowEmpty = null;
  }
  return { schedule: schedule, cancelTimer: cancelTimer, report: report, publish: publish, available: available, show: show, hide: hide, layout: layout, pan: pan, dispose: dispose };
})();
