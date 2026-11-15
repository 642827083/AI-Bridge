import { MNBridge } from './lib/mnBridge.js';
const $ = id => document.getElementById(id);
const LIMIT = 1024 * 1024;
export class WorkflowFiles {
  constructor(owner) {
    this.owner = owner; this.opened = false;
    $('workflow-import').addEventListener('click', () => { if (this.available()) { $('workflow-file').value = ''; $('workflow-file').click(); } });
    $('workflow-file').addEventListener('change', () => this.read($('workflow-file').files[0]));
    $('workflow-export').addEventListener('click', () => this.export());
    $('workflow-transfer-cancel').addEventListener('click', () => this.cancel());
    $('workflow-transfer-confirm').addEventListener('click', () => this.confirm());
    $('workflow-select-all').addEventListener('click', () => this.select(true));
    $('workflow-select-none').addEventListener('click', () => this.select(false));
  }
  available() { return !!this.owner.record && !this.owner.busy && !this.owner.draft && !this.opened; }
  render() {
    const owner = this.owner;
    $('workflow-import').disabled = !this.available();
    $('workflow-export').disabled = !this.available() || !owner.record.items.length;
    $('workflow-transfer').hidden = !this.opened;
    $('workflow-management').hidden = this.opened; owner.status.hidden = this.opened;
    if (!this.opened) return;
    for (const id of ['workflow-transfer-cancel', 'workflow-select-all', 'workflow-select-none']) $(id).disabled = owner.busy;
    $('workflow-transfer-confirm').disabled = owner.busy || !this.selected.size;
    $('workflow-transfer-count').textContent = '已选 ' + this.selected.size + ' / ' + this.items.length;
    $('workflow-transfer-confirm').textContent = this.mode === 'import' ? '确认导入' : '导出所选';
    $('workflow-transfer-list').replaceChildren();
    this.items.forEach((item, index) => {
      const label = document.createElement('label'); label.className = 'workflow-transfer-choice';
      const input = document.createElement('input'); input.type = 'checkbox'; input.checked = this.selected.has(index); input.disabled = owner.busy; input.value = String(index);
      input.addEventListener('change', () => { if (input.checked) this.selected.add(index); else this.selected.delete(index); this.render(); $('workflow-transfer-list input[value="' + index + '"]')?.focus(); });
      const content = document.createElement('span'), name = document.createElement('strong'), detail = document.createElement('small');
      name.textContent = item.name; detail.textContent = owner.summary(item); content.append(name, detail);
      if (item.extraText.trim()) { const prompt = document.createElement('small'); prompt.className = 'workflow-prompt-preview'; prompt.textContent = item.extraText.slice(0, 100); content.append(prompt); }
      label.append(input, content); $('workflow-transfer-list').append(label);
    });
  }
  show(mode, items) {
    this.mode = mode; this.items = items; this.opened = true; this.selected = new Set(items.map((_, index) => index));
    $('workflow-transfer-title').textContent = mode === 'import' ? '选择导入的工作流' : '选择导出的工作流';
    $('workflow-transfer-help').textContent = mode === 'import' ? '追加到列表末尾，重名已自动调整。还可保存 ' + this.remaining + ' 个工作流。' : '导出名称、目标网页、上传范围和提示词，可备份、分享或在其他设备导入。';
    this.owner.render(); $('workflow-transfer').scrollIntoView?.({ block: 'start' }); $('workflow-transfer-title').focus();
  }
  select(all) { if (this.owner.busy) return; this.selected = new Set(all ? this.items.map((_, index) => index) : []); this.render(); }
  async read(file) {
    if (!file || !this.available()) return;
    const owner = this.owner, id = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2), revision = owner.record.revision;
    owner.busy = true; owner.render(); owner.message('正在读取工作流文件…');
    try {
      if (!Number.isFinite(file.size) || file.size < 1 || file.size > LIMIT) throw new Error('请选择不超过 1 MB 的工作流 JSON 文件');
      const text = typeof file.text === 'function' ? await file.text() : await new Promise((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(new Error('无法读取工作流文件')); reader.readAsText(file);
      });
      await MNBridge.send('prepareWorkflowImport', { phase: 'begin', id, expectedRevision: revision, length: text.length });
      for (let offset = 0; offset < text.length;) {
        let end = Math.min(text.length, offset + 6000);
        if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
        await MNBridge.send('prepareWorkflowImport', { phase: 'chunk', id, offset, text: text.slice(offset, end) }); offset = end;
      }
      const preview = await MNBridge.send('prepareWorkflowImport', { phase: 'finish', id });
      this.id = preview.id; this.remaining = preview.remaining; this.show('import', preview.items);
      owner.message('确认前不会保存，请勾选要导入的工作流。');
    } catch (error) { await MNBridge.send('cancelWorkflowImport', { id }).catch(() => {}); owner.message(error.message, true); }
    finally { $('workflow-file').value = ''; owner.busy = false; owner.render(); }
  }
  export() {
    if (!this.available() || !this.owner.record.items.length) return;
    this.revision = this.owner.record.revision; this.show('export', this.owner.record.items); this.owner.message('');
  }
  async cancel() {
    if (this.owner.busy || !this.opened) return;
    this.owner.busy = true; this.owner.render();
    if (this.mode === 'import') await MNBridge.send('cancelWorkflowImport', { id: this.id }).catch(() => {});
    this.opened = false; this.owner.busy = false; this.owner.message('已取消'); this.owner.render(); this.restore();
  }
  restore() { $('workflows').scrollIntoView?.({ block: 'start' }); $('workflow-' + this.mode)?.focus({ preventScroll: true }); }
  async confirm() {
    const owner = this.owner;
    if (owner.busy || !this.opened || !this.selected.size) return;
    if (this.mode === 'import' && this.selected.size > this.remaining) { owner.message('最多保存 20 个工作流，请减少导入数量。', true); return; }
    owner.busy = true; owner.render(); owner.message(this.mode === 'import' ? '正在保存导入的工作流…' : '正在生成导出文件…');
    try {
      const indices = Array.from(this.selected).sort((a, b) => a - b);
      if (this.mode === 'import') {
        owner.record = await MNBridge.send('commitWorkflowImport', { id: this.id, indices });
        owner.message('已导入 ' + indices.length + ' 个工作流，原有工作流已保留。');
      } else {
        await MNBridge.send('exportWorkflows', { expectedRevision: this.revision, ids: indices.map(index => this.items[index].id) });
        owner.message('已打开文件保存窗口，请选择保存位置。');
      }
      this.opened = false;
    } catch (error) { owner.message(error.message, true); }
    finally { owner.busy = false; owner.render(); if (!this.opened) this.restore(); }
  }
}
