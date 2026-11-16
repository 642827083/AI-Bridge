var AIBToolbarIcons = (function () {
  function add(button, name, mainPath) {
    if (['refresh', 'menu', 'close'].indexOf(name) < 0 || typeof mainPath !== 'string' || !mainPath) throw new Error('无法定位顶栏图标资源');
    if (typeof UIImage === 'undefined' || typeof UIImage.imageWithContentsOfFile !== 'function' || typeof UIImageView === 'undefined') throw new Error('当前 MN 缺少图片加载接口');
    var image = UIImage.imageWithContentsOfFile(mainPath.replace(/\/$/, '') + '/web-dist/toolbar/' + name + '@3x.png');
    if (!image) throw new Error('顶栏图标读取失败，请重新安装测试包');
    var view = new UIImageView({ x: 12, y: 12, width: 20, height: 20 });
    view.image = image; view.userInteractionEnabled = false;
    button.addSubview(view); return view;
  }
  return { add: add };
})();
