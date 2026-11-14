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
  return { selection: selection, capture: capture };
})();
