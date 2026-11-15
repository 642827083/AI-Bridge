var AIBWorkflows = (function () {
  var MAX = 20, N = AIBNative;
  function location() {
    var app = N.app();
    if (typeof app.documentPath !== 'string' || !app.documentPath || typeof NSFileManager === 'undefined' || typeof NSJSONSerialization === 'undefined') throw new Error('当前 MN 缺少工作流存储接口');
    return { root: app.documentPath.replace(/\/$/, '') + '/AI-Bridge', manager: NSFileManager.defaultManager() };
  }
  function validate(input) {
    if (!input || typeof input.name !== 'string' || !input.name.trim() || input.name.length > 24 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('请输入 1–24 字的工作流名称');
    if (['deepseek', 'doubao', 'gpt', 'gemini'].indexOf(input.site) < 0) throw new Error('请选择有效的目标网页');
    if (input.id !== undefined && (typeof input.id !== 'string' || input.id && !/^wf-[a-z0-9-]{1,120}$/.test(input.id))) throw new Error('工作流标识无效');
    var settings = AIBSettings.validate(input);
    if (!settings.cardItems.length && settings.handwriting === 'none' && !settings.extraText.trim()) throw new Error('请选择上传内容或填写提示词');
    return { id: input.id || '', name: input.name.trim(), site: input.site, cardItems: settings.cardItems, handwriting: settings.handwriting, extraText: settings.extraText };
  }
  function read() {
    var store = location(), path = store.root + '/workflows.json';
    if (!store.manager.fileExistsAtPath(path)) return { schema: 1, revision: '', items: [] };
    var data = store.manager.contentsAtPath(path);
    if (!data || Number(N.value(data, 'length')) < 1 || Number(N.value(data, 'length')) > 1024 * 1024) throw new Error('工作流文件无法读取或超过大小限制，已保留原文件');
    var record = NSJSONSerialization.JSONObjectWithDataOptions(data, 0), ids = [], names = [];
    if (!record || record.schema !== 1 || typeof record.revision !== 'string' || !record.revision || !Array.isArray(record.items) || record.items.length > MAX) throw new Error('工作流文件格式无效，已保留原文件');
    var items = record.items.map(function (input) {
      var value = validate(input), key = value.name.toLowerCase();
      if (!value.id || ids.indexOf(value.id) >= 0 || names.indexOf(key) >= 0) throw new Error('工作流文件存在重复或无效记录，已保留原文件');
      ids.push(value.id); names.push(key); return value;
    });
    return { schema: 1, revision: record.revision, items: items };
  }
  function write(record) {
    var store = location();
    if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error('无法创建工作流目录');
    var next = { schema: 1, revision: N.token(), items: record.items }, data = NSJSONSerialization.dataWithJSONObjectOptions(next, 0);
    if (data && Number(N.value(data, 'length')) > 1024 * 1024) throw new Error('工作流总内容超过 1 MB，请缩短提示词后重试');
    if (!data || typeof data.writeToFileAtomically !== 'function' || !data.writeToFileAtomically(store.root + '/workflows.json', true)) throw new Error('工作流保存失败，原工作流已保留');
    return next;
  }
  function current(payload) {
    var record = read();
    if (!payload || payload.expectedRevision !== record.revision) throw new Error('工作流已在其他窗口更新，请刷新列表后重试');
    return record;
  }
  function save(payload) {
    var record = current(payload), value = validate(payload.workflow), index = record.items.findIndex(function (item) { return item.id === value.id; });
    if (value.id && index < 0) throw new Error('工作流已被删除，请刷新列表');
    if (record.items.some(function (item) { return item.id !== value.id && item.name.toLowerCase() === value.name.toLowerCase(); })) throw new Error('工作流名称已存在，请换一个名称');
    if (index < 0) {
      if (record.items.length >= MAX) throw new Error('最多保存 20 个工作流');
      value.id = 'wf-' + N.token(); record.items.push(value);
    } else record.items[index] = value;
    return write(record);
  }
  function remove(payload) {
    var record = current(payload), index = record.items.findIndex(function (item) { return item.id === payload.id; });
    if (index < 0) throw new Error('工作流已被删除，请刷新列表');
    record.items.splice(index, 1); return write(record);
  }
  function append(payload) {
    var record = current(payload);
    if (!Array.isArray(payload.items) || !payload.items.length || record.items.length + payload.items.length > MAX) throw new Error('最多保存 20 个工作流，请减少导入数量');
    var names = record.items.map(function (item) { return item.name.toLowerCase(); });
    var additions = payload.items.map(function (input) {
      var item = validate(input), key = item.name.toLowerCase();
      if (!AIBSettings.siteAvailable(item.site) || names.indexOf(key) >= 0) throw new Error('导入条目无效或名称冲突，请重新选择文件');
      names.push(key); item.id = 'wf-' + N.token(); return item;
    });
    record.items = record.items.concat(additions); return write(record);
  }
  function move(payload) {
    var record = current(payload);
    if (payload.direction !== -1 && payload.direction !== 1) throw new Error('工作流排序方向无效');
    var slots = [];
    record.items.forEach(function (item, index) { if (AIBSettings.siteAvailable(item.site)) slots.push(index); });
    var index = slots.findIndex(function (slot) { return record.items[slot].id === payload.id; });
    if (index < 0) throw new Error('工作流已不存在，请刷新列表');
    var target = index + payload.direction;
    if (target < 0 || target >= slots.length) return record;
    // 仅交换两个可见条目，隐藏网站的存档和位置保持原样。
    var item = record.items[slots[index]];
    record.items[slots[index]] = record.items[slots[target]]; record.items[slots[target]] = item;
    return write(record);
  }
  function get(id) {
    var item = read().items.find(function (value) { return value.id === id; });
    if (!item) throw new Error('工作流已不存在，请重新选择');
    return item;
  }
  function visible(record) {
    record = record || read();
    return { schema: record.schema, revision: record.revision, items: record.items.filter(function (item) { return AIBSettings.siteAvailable(item.site); }) };
  }
  return { read: read, save: save, append: append, remove: remove, move: move, get: get, validate: validate, visible: visible };
})();
