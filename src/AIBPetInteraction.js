var AIBPetInteraction = (function () {
  function reset(s) {
    if (!s.view) return;
    var frame = { x: 0, y: 0, width: s.view.frame.width, height: s.view.frame.height };
    if (s.imageView) s.imageView.frame = frame;
    if (s.animationUI && s.animationUI.view) s.animationUI.view.frame = frame;
  }
  function stop(s) {
    AIBPetOverlay.cancelTimer(s, 'petActionTimer'); AIBPetOverlay.cancelTimer(s, 'petBounceTimer');
    s.petActionId = 'idle'; reset(s);
  }
  function mounted(s) { return !s.destroyed && s.active && s.settings.visible && s.view && s.view.superview; }
  function bounce(s) {
    var started = Date.now(); s.petActionId = 'bounce';
    function tick() {
      if (!mounted(s)) { stop(s); return; }
      var progress = Math.min(1, Math.max(0, Date.now() - started) / 600);
      if (progress >= 1) { stop(s); return; }
      // 只改变显示图片，不改变桌宠位置和手势范围；待机动画也可继续播放。
      var amount = Math.sin(progress * Math.PI), size = s.view.frame.width, side = size * (1 - .06 * amount);
      var frame = { x: (size - side) / 2, y: (size - side) / 2 - size * .07 * amount, width: side, height: side };
      s.imageView.frame = frame;
      if (s.animationUI && s.animationUI.view) s.animationUI.view.frame = frame;
      AIBPetOverlay.schedule(s, 'petBounceTimer', 1 / 30, tick);
    }
    tick();
  }
  function tap(s, gesture) {
    if (!gesture || gesture.state !== 3 || !mounted(s) || s.dragOrigin || Date.now() < (s.suppressTapUntil || 0)) return;
    stop(s);
    var actions = s.settings.source === 'pack' && s.petPack ? s.petPack.manifest.actions : [];
    var pool = actions.filter(function (action) { return ['happy', 'wave', 'shy', 'bow'].indexOf(action.id) >= 0; });
    if (!pool.length) pool = actions.filter(function (action) { return action.id !== 'idle' && action.id !== 'drag'; });
    if (!pool.length) { bounce(s); return; }
    var action = pool[Math.floor(Math.random() * pool.length)]; s.petActionId = action.id;
    AIBPetAnimationPlayer.play(s, action, false);
    AIBPetOverlay.schedule(s, 'petActionTimer', action.duration, function () {
      if (!mounted(s) || s.settings.source !== 'pack' || !s.petPack) return;
      s.petActionId = 'idle';
      AIBPetAnimationPlayer.play(s, s.petPack.manifest.actions.find(function (item) { return item.id === 'idle'; }), false);
    });
  }
  return { tap: tap, stop: stop };
})();
