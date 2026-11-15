var AIBWorkflowFiles = (function () {
  var N = AIBNative, LIMIT = 1024 * 1024, pending = [];
  function cancel(controller, id) {
    var transfer = controller && controller.workflowImport;
    if (!transfer || id && transfer.id !== id) return true;
    if (transfer.timer) transfer.timer.invalidate();
    controller.workflowImport = null;
    pending = pending.filter(function (item) { return item !== controller; }); return true;
  }
  function retain(controller, transfer, seconds) {
    cancel(controller); controller.workflowImport = transfer; pending.push(controller);
    transfer.timer = NSTimer.scheduledTimerWithTimeInterval(seconds, false, function () { if (controller.workflowImport === transfer) cancel(controller); });
  }
  function current(revision) {
    var record = AIBWorkflows.read();
    if (record.revision !== revision) throw new Error('工作流已在其他窗口更新，请刷新列表后重试');
    return record;
  }
  function portable(item) {
    return { name: item.name, site: item.site, cardItems: Array.isArray(item.cardItems) ? item.cardItems.slice() : item.cardItems, handwriting: item.handwriting, extraText: item.extraText };
  }
  function renamed(name, names) {
    var next = name, index = 1;
    while (names.indexOf(next.toLowerCase()) >= 0) {
      var suffix = index === 1 ? '（导入）' : '（导入' + index + '）';
      var base = name.slice(0, 24 - suffix.length).replace(/[\uD800-\uDBFF]$/, '');
      next = base + suffix; index++;
    }
    names.push(next.toLowerCase()); return next;
  }
  function receive(controller, p) {
    if (p.phase === 'begin') {
      current(p.expectedRevision);
      if (typeof p.id !== 'string' || !/^[a-z0-9-]{1,120}$/.test(p.id) || !Number.isInteger(p.length) || p.length < 1 || p.length > LIMIT) throw new Error('请选择不超过 1 MB 的工作流 JSON 文件');
      retain(controller, { id: p.id, revision: p.expectedRevision, length: p.length, text: '' }, 120); return true;
    }
    var transfer = controller.workflowImport;
    if (!transfer || transfer.id !== p.id || transfer.items) throw new Error('导入预览已失效，请重新选择文件');
    if (p.phase === 'chunk') {
      if (p.offset !== transfer.text.length || typeof p.text !== 'string' || !p.text.length || p.text.length > 6000 || p.offset + p.text.length > transfer.length) { cancel(controller); throw new Error('工作流文件传输不完整，请重新选择'); }
      transfer.text += p.text; return true;
    }
    if (p.phase !== 'finish') throw new Error('无效的导入步骤');
    try {
      if (transfer.text.length !== transfer.length) throw new Error('工作流文件传输不完整');
      var archive;
      try { archive = JSON.parse(transfer.text.replace(/^\uFEFF/, '')); } catch (_) { throw new Error('无法解析 JSON，请选择 Ai Bridge 导出的工作流文件'); }
      if (!archive || archive.format !== 'ai-bridge-workflows' || archive.version !== 1 || !Array.isArray(archive.workflows) || archive.workflows.length < 1 || archive.workflows.length > 20) throw new Error('工作流文件格式或版本不支持');
      var record = current(transfer.revision), names = record.items.map(function (item) { return item.name.toLowerCase(); });
      var items = archive.workflows.map(function (input) {
        if (!input || !AIBSettings.siteAvailable(input.site)) throw new Error('文件包含不支持的目标网页');
        var item = AIBWorkflows.validate(portable(input));
        item.name = renamed(item.name, names); return portable(item);
      });
      // 预览只保留已验证的设置；确认前不写入用户文件。
      retain(controller, { id: transfer.id, revision: transfer.revision, items: items }, 600);
      return { id: transfer.id, items: items, remaining: 20 - record.items.length };
    } catch (error) { cancel(controller); throw error; }
  }
  function commit(controller, p) {
    var transfer = controller.workflowImport;
    if (!transfer || transfer.id !== p.id || !transfer.items) throw new Error('导入预览已失效，请重新选择文件');
    if (!Array.isArray(p.indices) || !p.indices.length || p.indices.length > 20) throw new Error('请至少选择一个工作流');
    var indices = [];
    p.indices.forEach(function (index) {
      if (!Number.isInteger(index) || index < 0 || index >= transfer.items.length || indices.indexOf(index) >= 0) throw new Error('导入选择无效');
      indices.push(index);
    });
    indices.sort(function (a, b) { return a - b; });
    var record = AIBWorkflows.append({ expectedRevision: transfer.revision, items: indices.map(function (index) { return transfer.items[index]; }) });
    cancel(controller); return AIBWorkflows.visible(record);
  }
  function exportFile(p) {
    var record = current(p.expectedRevision);
    if (!Array.isArray(p.ids) || !p.ids.length || p.ids.length > 20 || new Set(p.ids).size !== p.ids.length) throw new Error('请至少选择一个工作流');
    var items = record.items.filter(function (item) { return p.ids.indexOf(item.id) >= 0 && AIBSettings.siteAvailable(item.site); });
    if (items.length !== p.ids.length) throw new Error('导出选择已失效，请刷新列表');
    var app = N.app();
    if (typeof app.tempPath !== 'string' || !app.tempPath || typeof app.saveFileWithUti !== 'function') throw new Error('当前 MN 缺少文件保存接口');
    var root = app.tempPath.replace(/\/$/, '') + '/AI-Bridge', manager = NSFileManager.defaultManager();
    if (!manager.fileExistsAtPath(root) && !manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(root, true, null)) throw new Error('无法创建导出目录');
    var path = root + '/Ai-Bridge-Workflows-' + N.token() + '.json';
    var data = NSJSONSerialization.dataWithJSONObjectOptions({ format: 'ai-bridge-workflows', version: 1, workflows: items.map(portable) }, 0);
    if (!data || Number(N.value(data, 'length')) > LIMIT || typeof data.writeToFileAtomically !== 'function' || !data.writeToFileAtomically(path, true)) throw new Error('导出文件生成失败，请重试');
    app.saveFileWithUti(path, 'public.json'); return true;
  }
  function command(controller, name, p) {
    p = p || {};
    if (name === 'cancelWorkflowImport') return cancel(controller, p.id);
    if (!controller.visible || controller.disposed || controller.activePage !== 'settings' || controller.addon && controller.addon.petSession && !controller.addon.petSession.active) throw new Error('请在设置页管理工作流文件');
    if (name === 'prepareWorkflowImport') return receive(controller, p);
    if (name === 'commitWorkflowImport') return commit(controller, p);
    if (name === 'exportWorkflows') return exportFile(p);
    throw new Error('不支持的工作流文件命令');
  }
  return { command: command, cancel: cancel, cancelAll: function () { pending.slice().forEach(function (controller) { cancel(controller); }); } };
})();
