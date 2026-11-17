document.addEventListener('DOMContentLoaded', () => {
  const bar = document.createElement('div');
  bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;z-index:10;display:flex;align-items:center;gap:12px;padding:10px 18px;background:#edf1ff;font:12px system-ui';
  const button = document.createElement('button'); button.textContent = '连续切换验证'; button.type = 'button';
  const output = document.createElement('span'); output.id = 'motion-result'; output.textContent = '本地动画验证，不连接 AI 服务'; bar.append(button, output); document.body.append(bar);
  button.addEventListener('click', () => {
    button.disabled = true;
    const nav = document.querySelector('.settings-navigation'), slider = document.querySelector('.settings-navigation-slider');
    const tabs = ['navigation-tab', 'workflows-tab', 'navigation-tab', 'workflows-tab'].map(id => document.getElementById(id));
    const initial = nav.getBoundingClientRect(); let index = 0, frames = 0, failed = '', started = performance.now();
    function sample(now) {
      if (index < tabs.length && now - started >= index * 70) tabs[index++].click();
      frames++;
      const rect = nav.getBoundingClientRect(), style = getComputedStyle(nav), chip = slider.getBoundingClientRect();
      if (Math.abs(rect.top - initial.top) > .5 || Math.abs(rect.width - initial.width) > .5 || rect.height < 47 || chip.width < 1
        || style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity) < .99
        || Number(getComputedStyle(slider).opacity) < .99 || document.querySelectorAll('.settings-navigation-slider').length !== 1) failed = '胶囊位置或可见性发生跳变';
      if (now - started < 700) { requestAnimationFrame(sample); return; }
      const target = tabs.at(-1).getBoundingClientRect(), end = slider.getBoundingClientRect();
      if (Math.abs(target.left - end.left) > 1 || Math.abs(target.width - end.width) > 1) failed = '滑块与选项未对齐';
      const tapColor = getComputedStyle(tabs[0]).getPropertyValue('-webkit-tap-highlight-color');
      if (tapColor && tapColor !== 'rgba(0, 0, 0, 0)' && tapColor !== 'transparent') failed = '仍存在浏览器触摸高亮';
      output.textContent = failed ? '失败：' + failed : '通过：4 次连续切换，' + frames + ' 帧胶囊可见且位置稳定，滑块对齐；触摸高亮已关闭';
      document.title = failed ? '导航动画验证失败' : '导航动画验证通过'; button.disabled = false;
    }
    requestAnimationFrame(sample);
  });
});
