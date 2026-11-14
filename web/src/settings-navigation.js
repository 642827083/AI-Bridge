export function setupSettingsNavigation() {
  const tabs = Array.from(document.querySelectorAll('.settings-navigation [role="tab"]'));
  const slider = document.querySelector('.settings-navigation-slider');
  let selected = tabs.find(tab => tab.getAttribute('aria-selected') === 'true'), contentAnimation = null;
  function select(tab, focus = false) {
    if (tab === selected) { if (focus) tab.focus(); return; }
    if (contentAnimation) { contentAnimation.cancel(); contentAnimation = null; }
    // 只切换显示，不重新创建表单，保留工作流草稿及桌宠图片编辑状态。
    for (const item of tabs) {
      const active = item === tab;
      item.setAttribute('aria-selected', String(active));
      item.tabIndex = active ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !active;
    }
    slider.style.transform = 'translate3d(' + tabs.indexOf(tab) * 100 + '%,0,0)';
    selected = tab;
    const panel = document.getElementById(tab.getAttribute('aria-controls'));
    // 参考原生设置页：胶囊保持显示，只让新内容从四成透明度淡入，不对整页做动画。
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches && typeof panel.animate === 'function') {
      contentAnimation = panel.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)' });
    }
    if (focus) tab.focus();
  }
  for (const tab of tabs) {
    tab.addEventListener('click', () => select(tab));
    tab.addEventListener('keydown', event => {
      const index = tabs.indexOf(tab);
      const target = { ArrowRight: (index + 1) % tabs.length, ArrowLeft: (index + tabs.length - 1) % tabs.length, Home: 0, End: tabs.length - 1 }[event.key];
      if (target === undefined) return;
      event.preventDefault(); select(tabs[target], true);
    });
  }
}
