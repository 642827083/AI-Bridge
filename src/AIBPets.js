var AIBPets = (function () {
  var sessions = [];
  function selection(settings, pack, image) {
    // 旧版尚未导入角色时使用自带桌宠，保留已经选择的有效导入角色与隐藏状态。
    if (settings.source === 'pack' && !pack || settings.source === 'image' && !(image && image.base64)) settings.source = 'builtin';
    return settings;
  }
  function ensure(addon, mainPath) {
    if (addon.petSession && !addon.petSession.destroyed) { if (mainPath) addon.petSession.mainPath = mainPath; return addon.petSession; }
    var pack = AIBPetPackStore.read(), image = AIBPetImageStore.read();
    var s = { context: addon, mainPath: mainPath || addon.petMainPath || '', active: true, sceneActive: true, destroyed: false,
      settings: selection(AIBPetModel.read(), pack.record, image.record), petPack: pack.record, packRevision: pack.record ? pack.record.revision : pack.revision || '', customPet: image.record, warning: [pack.warning, image.warning].filter(Boolean).join(' '), lastError: '' };
    addon.petSession = s; sessions.push(s); return s;
  }
  function snapshot(s) {
    return { settings: s.settings, available: AIBPetOverlay.available(s), mounted: !!(s.view && s.view.superview),
      builtin: AIBBuiltinPet.snapshot(), pack: AIBPetPackStore.snapshot(s.petPack), packRevision: s.packRevision, image: AIBPetImageStore.snapshot(s.customPet),
      warning: [s.warning, s.lastError, s.animationWarning].filter(Boolean).join(' ') };
  }
  function publish(s) {
    var panel = s.context.panelController;
    if (panel && panel.visible && panel.settingsView) AIBNative.evaluate(panel.settingsView,
      'window.__AIB_PET_STATE__&&window.__AIB_PET_STATE__(' + AIBNative.script(snapshot(s)) + ')').catch(function () {});
  }
  function mount(s) { try { AIBPetOverlay.show(s); } catch (error) { AIBPetOverlay.report(s, error); } }
  function later(addon, mainPath) {
    var s = ensure(addon, mainPath);
    AIBPetOverlay.schedule(s, 'mountTimer', 0.25, function () { mount(s); });
  }
  function sync(settings, type, record, revision) {
    sessions.forEach(function (s) {
      var position = s.settings.position; s.settings = AIBPetModel.normalize(settings); s.settings.position = position;
      if (type === 'pack') { s.petPack = record; s.packRevision = record ? record.revision : revision || ''; }
      if (type === 'image') s.customPet = record;
      s.warning = ''; mount(s); publish(s);
    });
  }
  function cancel(addon, id) {
    var s = addon.petSession; if (!s) return;
    if (!id || s.petPackTransfer && s.petPackTransfer.id === id) AIBPetPackStore.cancel(s);
    if (!id || s.customPetTransfer && s.customPetTransfer.id === id) { s.customPetTransfer = null; AIBPetOverlay.cancelTimer(s, 'customImportTimer'); }
  }
  function asset(s, p) {
    if (!p || ['builtin', 'pack', 'image'].indexOf(p.source) < 0 || !Number.isSafeInteger(p.offset) || p.offset < 0) throw new Error('桌宠预览读取位置无效');
    var record = p.source === 'builtin' ? AIBBuiltinPet.snapshot() : p.source === 'pack' ? s.petPack : s.customPet;
    if (!record || p.revision !== record.revision) throw new Error('桌宠已变化，请重新读取预览');
    var text = p.source === 'builtin' ? AIBBuiltinPet.base64(s) : p.source === 'pack' ? record.files[record.manifest.poster] : record.base64;
    if (!text || p.offset >= text.length) throw new Error('没有可读取的桌宠图片');
    return { revision: record.revision, offset: p.offset, total: text.length, chunk: text.slice(p.offset, p.offset + 32768) };
  }
  function command(controller, name, p) {
    var addon = controller.addon, s = ensure(addon); p = p || {};
    if (name === 'getPetState') return snapshot(s);
    if (name === 'getPetAsset') return asset(s, p);
    if (name === 'cancelPetImport') { cancel(addon, p.id); return true; }
    if (!controller.visible || controller.activePage !== 'settings' || !s.active) throw new Error('请在设置页操作桌宠');
    if (name === 'deletePet') {
      if (['pack', 'image'].indexOf(p.source) < 0) throw new Error('只能删除已导入的桌宠');
      var deleted = p.source === 'pack' ? AIBPetPackStore.remove(p.expectedRevision) : AIBPetImageStore.remove(p.expectedRevision);
      sessions.forEach(function (session) {
        if (p.source === 'pack') AIBPetPackStore.cancel(session);
        else { session.customPetTransfer = null; AIBPetOverlay.cancelTimer(session, 'customImportTimer'); }
      });
      var remaining = AIBPetModel.read(); if (remaining.source === p.source) remaining.source = 'builtin';
      sync(AIBPetModel.write(remaining), p.source, p.source === 'pack' ? null : deleted, deleted.revision); return snapshot(s);
    }
    if (name === 'setPetOptions') {
      var next = AIBPetModel.patch(selection(AIBPetModel.read(), s.petPack, s.customPet), p);
      if (next.source === 'pack' && !s.petPack || next.source === 'image' && !s.customPet.base64) throw new Error('请先导入相应的桌宠');
      sync(AIBPetModel.write(next)); return snapshot(s);
    }
    var record, source;
    try {
      if (name === 'importPetPack') {
        if (s.customPetTransfer) throw new Error('图片正在导入，请稍候');
        source = 'pack'; record = AIBPetPackStore.receive(s, p);
      } else if (name === 'importPetImage') {
        if (s.petPackTransfer) throw new Error('桌宠包正在导入，请稍候');
        source = 'image'; record = AIBPetImageStore.receive(s, p);
      } else throw new Error('不支持的桌宠命令');
    } catch (error) { if (p.id) cancel(addon, p.id); throw error; }
    if (!record) return true;
    var settings = AIBPetModel.read(); settings.source = source; settings.visible = true;
    sync(AIBPetModel.write(settings), source, record); return snapshot(s);
  }
  function active(addon, value) {
    var s = ensure(addon); s.sceneActive = value; s.active = value;
    if (value) later(addon); else { cancel(addon); AIBPetOverlay.cancelTimer(s, 'mountTimer'); AIBPetOverlay.hide(s); }
  }
  function close(addon) { var s = addon.petSession; if (s) { cancel(addon); AIBPetOverlay.cancelTimer(s, 'mountTimer'); AIBPetOverlay.hide(s); } }
  function dispose(addon) {
    var s = addon.petSession; if (!s) return;
    AIBPetOverlay.dispose(s); sessions = sessions.filter(function (item) { return item !== s; }); addon.petSession = null;
  }
  function front(addon) {
    var s = addon.petSession, parent = s && s.view && s.view.superview;
    if (!parent || !s.active || !s.settings.visible) return;
    // 打开主面板后仍保留桌宠和工作流入口的点击能力。
    parent.addSubview(s.view);
    if (s.workflowMenu) parent.addSubview(s.workflowMenu);
    if (s.workflowButton) parent.addSubview(s.workflowButton);
    AIBWorkflowPet.stack(s);
  }
  function background(value) {
    sessions.slice().forEach(function (s) {
      if (value) {
        if (s.context.panelController) { AIBWorkflowRunner.cancel(s.context.panelController); AIBUpload.cancel(s.context.panelController); }
        s.active = false; cancel(s.context); AIBPetOverlay.cancelTimer(s, 'mountTimer'); AIBPetOverlay.hide(s);
      }
      else { s.active = s.sceneActive; if (s.active) later(s.context); }
    });
  }
  return { ensure: ensure, snapshot: snapshot, publish: publish, later: later, cancel: cancel, command: command, active: active, close: close, dispose: dispose,
    layout: function (addon) { if (addon.petSession) AIBPetOverlay.layout(addon.petSession); },
    pan: function (addon, gesture) { if (addon.petSession) { try { AIBPetOverlay.pan(addon.petSession, gesture); } catch (error) { AIBPetOverlay.report(addon.petSession, error); } } },
    tap: function (addon, gesture) { if (addon.petSession) { try { AIBPetInteraction.tap(addon.petSession, gesture); } catch (error) { AIBPetOverlay.report(addon.petSession, error); } } },
    touch: function (addon, sender, pressed) { if (addon.petSession) { try { AIBPetInteraction[pressed ? 'press' : 'release'](addon.petSession, sender); } catch (error) { AIBPetOverlay.report(addon.petSession, error); } } },
    background: background, front: front, disposeAll: function () { sessions.slice().forEach(function (s) { dispose(s.context); }); } };
})();
