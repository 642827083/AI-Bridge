import { MNBridge } from './lib/mnBridge.js';
import { readPetPack } from './pet-pack-file.js';
import { ImagePetEditor, loadPetFile } from './pet-image-editor.js';
const $ = id => document.getElementById(id);
export class PetSettings {
  constructor() {
    this.busy = false; this.ready = false; this.disposed = false; this.previewToken = 0;
    $('pet-pack-button').addEventListener('click', () => $('pet-pack-file').click());
    $('pet-image-button').addEventListener('click', () => $('pet-image-file').click());
    $('pet-pack-file').addEventListener('change', () => this.importPack($('pet-pack-file').files[0]));
    $('pet-image-file').addEventListener('change', () => this.openImage($('pet-image-file').files[0]));
    $('pet-visible').addEventListener('change', () => this.options({ visible: $('pet-visible').checked }));
    for (const id of ['size', 'opacity']) {
      $('pet-' + id).addEventListener('input', () => this.values());
      $('pet-' + id).addEventListener('change', () => this.options({ [id]: Number($('pet-' + id).value) / (id === 'opacity' ? 100 : 1) }));
    }
    for (const source of ['builtin', 'pack', 'image']) $('pet-use-' + source).addEventListener('click', () => this.options({ source }));
    $('pet-delete').addEventListener('click', () => this.remove());
    $('pet-delete-cancel').addEventListener('click', () => { this.deleting = null; this.controls(); this.status(''); });
    $('pet-zoom').addEventListener('input', () => { this.editor.zoom = Number($('pet-zoom').value) / 100; this.editor.draw(); $('pet-zoom-value').textContent = $('pet-zoom').value + '%'; });
    $('pet-reset').addEventListener('click', () => { this.editor.reset(); $('pet-zoom').value = 100; $('pet-zoom-value').textContent = '100%'; });
    $('pet-cancel').addEventListener('click', () => this.closeEditor());
    $('pet-confirm').addEventListener('click', () => this.importImage());
    window.__AIB_PET_STATE__ = result => this.render(result);
    window.__AIB_PET_REFRESH__ = () => this.refresh();
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
    this.refresh();
  }
  status(text, error = false) { if (this.disposed) return; $('pet-status').textContent = text; $('pet-status').dataset.error = String(error); }
  values() { $('pet-size-value').textContent = $('pet-size').value; $('pet-opacity-value').textContent = $('pet-opacity').value + '%'; }
  controls() {
    const editing = !$('pet-editor').hidden;
    for (const id of ['pet-visible', 'pet-size', 'pet-opacity', 'pet-use-pack', 'pet-use-image']) $(id).disabled = !this.ready || this.busy || editing || !this.state?.available;
    // 即使当前类型尚不存在，已保存的另一种角色仍可切换使用。
    $('pet-use-pack').disabled = !this.ready || this.busy || editing || !this.state?.pack;
    $('pet-use-builtin').disabled = !this.ready || this.busy || editing || !this.state?.builtin;
    $('pet-use-image').disabled = !this.ready || this.busy || editing || !this.state?.image?.hasImage;
    for (const id of ['pet-pack-button', 'pet-image-button', 'pet-pack-file', 'pet-image-file']) $(id).disabled = !this.ready || this.busy || editing;
    for (const id of ['pet-name', 'pet-zoom', 'pet-reset', 'pet-cancel', 'pet-confirm']) $(id).disabled = this.busy;
    if (this.editor) this.editor.disabled = this.busy;
    $('pet-settings').setAttribute('aria-busy', String(this.busy));
    const source = this.state?.settings.source, meta = source === 'pack' ? this.state.pack : this.state?.image;
    $('pet-delete-row').hidden = !this.state?.available || !['pack', 'image'].includes(source);
    $('pet-delete').disabled = !this.ready || this.busy || editing;
    $('pet-delete-cancel').disabled = this.busy;
    $('pet-delete').textContent = this.deleting ? '确认删除' : '删除当前桌宠';
    $('pet-delete').setAttribute('aria-label', (this.deleting ? '确认删除 ' : '删除 ') + (source === 'pack' ? meta?.manifest.name || '动作桌宠' : meta?.name || '图片桌宠'));
    $('pet-delete-cancel').hidden = !this.deleting;
  }
  render(result) {
    if (this.disposed || !result?.settings) return;
    this.state = result; this.ready = true;
    $('pet-visible').checked = result.settings.visible; $('pet-size').value = result.settings.size; $('pet-opacity').value = Math.round(result.settings.opacity * 100); this.values();
    const source = result.settings.source, meta = source === 'builtin' ? result.builtin : source === 'pack' ? result.pack : result.image;
    if (this.deleting && (this.deleting.source !== source || this.deleting.expectedRevision !== meta?.revision)) this.deleting = null;
    $('pet-current').textContent = result.available ? source === 'pack' ? meta.manifest.name : meta.name : '选择你的桌宠';
    $('pet-detail').textContent = result.available ? source === 'builtin' ? '自带桌宠 · 右上角菜单展开工作流' : source === 'pack' ? `${meta.manifest.author} · ${meta.manifest.actions.length} 组动作 · 播放待机动画` : '图片桌宠 · 静态显示' : '导入动作包或图片，显示在 MN 学习界面。';
    $('pet-sources').hidden = !result.builtin && !result.pack && !result.image?.hasImage;
    $('pet-use-pack').textContent = result.pack?.manifest.name || '动作桌宠'; $('pet-use-image').textContent = result.image?.hasImage ? result.image.name : '图片桌宠';
    for (const type of ['builtin', 'pack', 'image']) $('pet-use-' + type).setAttribute('aria-pressed', String(type === source && result.available));
    this.controls(); this.preview(source, result.available ? meta.revision : '');
    if (result.warning) this.status(result.warning, true);
  }
  async refresh() {
    if (this.busy || this.disposed || !$('pet-editor').hidden) return;
    try { const result = await MNBridge.send('getPetState'); this.render(result); this.status(result.warning || '', !!result.warning); }
    catch (error) { this.status(error.message, true); }
  }
  async preview(source, revision) {
    const key = source + ':' + revision; if (this.previewKey === key) return;
    this.previewKey = key; const token = ++this.previewToken;
    $('pet-preview-image').hidden = true; $('pet-preview-image').removeAttribute('src'); $('pet-empty').hidden = false; $('pet-empty').textContent = revision ? '读取预览…' : '尚未导入';
    if (!revision) return;
    try {
      let text = '', total;
      do {
        const reply = await MNBridge.send('getPetAsset', { source, revision, offset: text.length });
        if (this.disposed || token !== this.previewToken) return;
        if (reply.revision !== revision || reply.offset !== text.length || !Number.isSafeInteger(reply.total) || reply.total > 2796204 || reply.total < 1 || typeof reply.chunk !== 'string' || !reply.chunk.length || reply.chunk.length > 32768 || text.length + reply.chunk.length > reply.total || total && total !== reply.total) throw new Error('桌宠预览数据不完整');
        total = reply.total; text += reply.chunk;
      } while (text.length < total);
      if (!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('桌宠预览图片格式无效');
      $('pet-preview-image').src = 'data:image/png;base64,' + text; $('pet-preview-image').hidden = false; $('pet-empty').hidden = true;
    } catch (error) { if (token === this.previewToken && !this.disposed) { this.previewKey = ''; $('pet-empty').textContent = '预览暂不可用'; this.status(error.message, true); } }
  }
  async options(patch) {
    if (this.busy || !this.ready) return; this.deleting = null; this.busy = true; this.controls();
    try { this.render(await MNBridge.send('setPetOptions', patch)); this.status(this.state.warning || '桌宠设置已生效', !!this.state.warning); }
    catch (error) { this.render(this.state); this.status(error.message, true); }
    finally { this.busy = false; this.controls(); }
  }
  async remove() {
    if (this.busy || !this.ready || !$('pet-editor').hidden) return;
    const source = this.state.settings.source, meta = source === 'pack' ? this.state.pack : this.state.image;
    if (!this.state.available || !['pack', 'image'].includes(source)) return;
    if (!this.deleting) {
      this.deleting = { source, expectedRevision: meta.revision };
      this.controls(); this.status('确认删除“' + (source === 'pack' ? meta.manifest.name : meta.name) + '”？删除后需要重新导入。'); return;
    }
    const request = this.deleting; this.busy = true; this.controls();
    try {
      this.render(await MNBridge.send('deletePet', request)); this.deleting = null; this.status('桌宠已删除，已切回自带角色“哦鲸鲸”');
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; this.controls(); }
  }
  async transfer(command, text, metadata) {
    const id = 'pet-' + Date.now() + '-' + Math.random().toString(36).slice(2); this.importId = id;
    try {
      await MNBridge.send(command, { phase: 'begin', id, length: text.length, ...metadata });
      for (let offset = 0; offset < text.length; offset += 32768) {
        if (this.disposed) throw new Error('导入已取消');
        this.status(`正在导入 ${Math.round(offset / text.length * 100)}%…`);
        await MNBridge.send(command, { phase: 'chunk', id, offset, text: text.slice(offset, offset + 32768) });
      }
      if (this.disposed) throw new Error('导入已取消');
      return await MNBridge.send(command, { phase: 'finish', id });
    } catch (error) { await MNBridge.send('cancelPetImport', { id }).catch(() => {}); throw error; }
    finally { this.importId = ''; }
  }
  async importPack(file) {
    if (!file || this.busy || !this.ready) return;
    this.deleting = null; this.busy = true; this.controls(); this.status('正在检查桌宠包…');
    const expectedRevision = this.state.pack?.revision || this.state.packRevision || '';
    try {
      const record = await readPetPack(file); if (this.disposed) return;
      this.render(await this.transfer('importPetPack', JSON.stringify(record), { expectedRevision }));
      this.status(this.state.warning || '动作包已导入并显示', !!this.state.warning);
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) { $('pet-pack-file').value = ''; this.controls(); } }
  }
  async openImage(file) {
    if (!file || this.busy || !this.ready) return;
    this.deleting = null; this.busy = true; this.controls(); this.status('正在打开图片…');
    const revision = this.state.image?.revision || '';
    try {
      const image = await loadPetFile(file); if (this.disposed) return;
      if (!this.editor) this.editor = new ImagePetEditor($('pet-crop'), () => {});
      this.draftRevision = revision; this.editor.setImage(image); $('pet-name').value = (file.name.replace(/\.[^.]+$/, '').slice(0, 24) || '我的桌宠').replace(/[\x00-\x1f\x7f]/g, '');
      $('pet-zoom').value = 100; $('pet-zoom-value').textContent = '100%'; $('pet-editor').hidden = false; this.status('调整完成后点击“导入并显示”');
      $('pet-crop').focus({ preventScroll: true });
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) { $('pet-image-file').value = ''; this.controls(); } }
  }
  closeEditor() { if (this.busy) return; if (this.editor) this.editor.clear(); $('pet-editor').hidden = true; this.controls(); this.status(''); }
  async importImage() {
    if (this.busy || !this.editor?.image) return;
    const name = $('pet-name').value.trim();
    if (!name || name.length > 24 || /[\x00-\x1f\x7f]/.test(name)) { this.status('请输入 1–24 字的桌宠名称', true); return; }
    let picture; try { picture = this.editor.export(); } catch (error) { this.status(error.message, true); return; }
    this.busy = true; this.controls();
    try {
      const result = await this.transfer('importPetImage', picture.base64, { expectedRevision: this.draftRevision, name, style: 'still', anchorX: picture.anchorX });
      if (this.disposed) return;
      this.editor.clear(); $('pet-editor').hidden = true; this.render(result); this.status(this.state.warning || '图片已导入并显示', !!this.state.warning);
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) this.controls(); }
  }
  dispose() {
    this.disposed = true; ++this.previewToken; if (this.editor) this.editor.clear();
    if (this.importId) MNBridge.send('cancelPetImport', { id: this.importId }).catch(() => {});
  }
}
