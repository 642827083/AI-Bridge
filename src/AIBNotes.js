var AIBNotes = (function () {
  var N = AIBNative;
  function selection(controller) {
    var study = N.study(controller), notebook = study && study.notebookController;
    var notebookId = String(N.value(notebook, 'notebookId') || '');
    if (!notebookId) throw new Error('请先打开 MN 学习集');
    var list = N.value(N.value(notebook, 'mindmapView'), 'selViewLst'), note;
    if (list !== undefined && list !== null) {
      var nodes = N.items(list);
      if (nodes.length !== 1) throw new Error('请先在脑图中只选中一张卡片');
      note = nodes[0];
      for (var i = 0; note && !N.value(note, 'noteId') && i < 3; i++) note = N.value(note, 'note');
    } else note = N.value(notebook, 'focusNote');
    var noteId = String(N.value(note, 'noteId') || '');
    if (!noteId || typeof Database === 'undefined' || typeof Database.sharedInstance !== 'function') throw new Error('请先选中一张有效卡片');
    var db = Database.sharedInstance();
    if (typeof db.getNoteById !== 'function') throw new Error('当前 MN 缺少卡片读取接口');
    var live = db.getNoteById(noteId);
    if (!live || String(N.value(live, 'notebookId') || '') !== notebookId) throw new Error('所选卡片已删除或不在当前学习集中');
    return { noteId: noteId, notebookId: notebookId };
  }
  function capture(controller) {
    var snapshot = selection(controller);
    snapshot.validate = function () {
      var current = selection(controller);
      if (current.noteId !== snapshot.noteId || current.notebookId !== snapshot.notebookId) throw new Error('所选卡片或学习集已切换，本次上传已停止');
    };
    return snapshot;
  }
  function captureExternal(addon, input) {
    var expected = { noteId: input.noteId, notebookId: input.notebookId }, baselineFocus;
    if (typeof expected.noteId !== 'string' || !expected.noteId || expected.noteId.length > 256 || typeof expected.notebookId !== 'string' || !expected.notebookId || expected.notebookId.length > 256) throw new Error('卡片上下文无效，请重新选择');
    function validate() {
      var notebook = N.study({ addon: addon }).notebookController;
      if (String(N.value(notebook, 'notebookId') || '') !== expected.notebookId) throw new Error('学习集已切换，本次工作流已停止');
      var nodes = N.items(N.value(N.value(notebook, 'mindmapView'), 'selViewLst'));
      if (nodes.length > 1) throw new Error('请只选中一张卡片');
      var note = nodes[0];
      for (var i = 0; note && !N.value(note, 'noteId') && i < 3; i++) note = N.value(note, 'note');
      var selectedId = String(N.value(note, 'noteId') || '');
      var focusId = String(N.value(N.value(notebook, 'visibleFocusNote') || N.value(notebook, 'focusNote'), 'noteId') || '');
      if (baselineFocus === undefined) baselineFocus = focusId;
      if (nodes.length && selectedId !== expected.noteId || !nodes.length && focusId !== baselineFocus && focusId !== expected.noteId) throw new Error('所选卡片已切换，本次工作流已停止');
      var db = typeof Database !== 'undefined' && Database.sharedInstance(), live = db && db.getNoteById(expected.noteId);
      if (!live || String(N.value(live, 'notebookId') || '') !== expected.notebookId) throw new Error('卡片已删除或不在当前学习集中');
      var active = N.value(N.app(), 'focusWindow');
      if (active && active !== addon.window) throw new Error('学习窗口已切换，本次工作流已停止');
    }
    validate(); expected.validate = validate; return expected;
  }
  return { selection: selection, capture: capture, captureExternal: captureExternal };
})();
