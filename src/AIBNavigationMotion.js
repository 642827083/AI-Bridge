var AIBNavigationMotion = (function () {
  var KEY = 'aib.navigation.indicator';
  function stop(view) {
    if (view && view.layer && typeof view.layer.removeAnimationForKey === 'function') view.layer.removeAnimationForKey(KEY);
  }
  function move(view, target, animated) {
    var previous = view.frame, layer = view.layer;
    if (previous.x === target.x && previous.y === target.y && previous.width === target.width && previous.height === target.height) return;
    var from = previous.x + previous.width / 2;
    // 快速切换时从屏幕上的实际位置继续，重复布局不打断正在播放的横线动画。
    if (animated && layer && typeof layer.presentationLayer === 'function') {
      try {
        var presentation = layer.presentationLayer();
        if (presentation && presentation.position && Number.isFinite(Number(presentation.position.x))) from = Number(presentation.position.x);
      } catch (error) { /* 呈现层不可用时沿用上次布局位置。 */ }
    }
    stop(view); view.frame = target;
    if (!animated || !previous.width || !layer || typeof layer.addAnimationForKey !== 'function'
      || typeof CABasicAnimation === 'undefined' || typeof CABasicAnimation.animationWithKeyPath !== 'function'
      || typeof CAMediaTimingFunction === 'undefined' || typeof CAMediaTimingFunction.functionWithControlPoints !== 'function'
      || typeof CATransaction === 'undefined' || typeof CATransaction.begin !== 'function'
      || typeof CATransaction.commit !== 'function' || typeof CATransaction.setAnimationDuration !== 'function') return;
    try {
      var animation = CABasicAnimation.animationWithKeyPath('position.x');
      if (!animation) return;
      animation.fromValue = from; animation.toValue = target.x + target.width / 2;
      animation.timingFunction = CAMediaTimingFunction.functionWithControlPoints(.32, .72, 0, 1);
      CATransaction.begin();
      try { CATransaction.setAnimationDuration(.22); layer.addAnimationForKey(animation, KEY); }
      finally { CATransaction.commit(); }
    } catch (error) { console.log('[Ai Bridge] 导航动画未启用：' + String(error.message || error)); }
  }
  return { move: move, stop: stop };
})();
