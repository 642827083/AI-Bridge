import { MNBridge } from './lib/mnBridge.js';

const sites = { deepseek: 'DeepSeek', gpt: 'GPT', gemini: 'Gemini' };
const handwriting = { last: '卡片最后一条手写', mindmap: '脑图手写', none: '无手写' };
export class Workflows {
  constructor() {
    this.record = null; this.draft = null; this.busy = false; this.shown = 6; this.deleting = '';
    this.list = document.getElementById('workflow-list'); this.form = document.getElementById('workflow-editor');
    this.fields = document.getElementById('workflow-fields'); this.status = document.getElementById('workflow-status');
    this.name = document.getElementById('workflow-name'); this.site = document.getElementById('workflow-site');
    this.handwriting = document.getElementById('workflow-handwriting'); this.prompt = document.getElementById('workflow-prompt');
    document.getElementById('workflow-new').addEventListener('click', () => this.edit());
    document.getElementById('workflow-refresh').addEventListener('click', () => this.load());
    document.getElementById('workflow-cancel').addEventListener('click', () => { this.draft = null; this.message(''); this.render(); });
    document.getElementById('workflow-more').addEventListener('click', () => { this.shown = Math.min(10000, this.shown + 6); this.choices(); });
    document.getElementById('workflow-less').addEventListener('click', () => this.collapse());
    document.getElementById('workflow-card-picker').addEventListener('toggle', event => { if (!event.target.open) this.collapse(); });
    document.getElementById('workflow-clear').addEventListener('click', () => { this.selected.clear(); this.choices(); });
    this.form.addEventListener('submit', event => { event.preventDefault(); this.save(); });
    window.__AIB_OPEN_WORKFLOWS__ = () => {
      document.getElementById('workflows-tab').click(); document.getElementById('workflows').scrollIntoView?.({ block: 'start' });
      if (!this.draft) this.load(); return true;
    };
    this.load();
  }
  message(text, error = false) { this.status.textContent = text; this.status.dataset.error = String(error); }
  async load() {
    if (this.busy) return;
    this.busy = true; this.render();
    try { this.record = await MNBridge.send('getWorkflows'); this.message(this.draft ? '列表已刷新；如有冲突，请取消后重新编辑。当前草稿已保留。' : ''); }
    catch (error) { this.message(error.message, true); }
    finally { this.busy = false; this.render(); }
  }
  summary(item) {
    const cards = item.cardItems.length ? item.cardItems.slice(0, 3).map(n => '第 ' + n + ' 条').join('、') + (item.cardItems.length > 3 ? ' 等 ' + item.cardItems.length + ' 条' : '') : '无卡片内容';
    return '桌宠：' + sites[item.site] + ' · ' + cards + ' · ' + handwriting[item.handwriting] + (item.extraText.trim() ? ' · 含提示词' : '');
  }
  render() {
    this.form.hidden = !this.draft; this.fields.disabled = this.busy;
    document.getElementById('workflow-new').disabled = this.busy || !this.record || !!this.draft || this.record.items.length >= 20;
    document.getElementById('workflow-refresh').disabled = this.busy;
    this.list.replaceChildren();
    const items = (this.record?.items || []).filter(item => sites[item.site]);
    if (!items.length) {
      const empty = document.createElement('p'); empty.className = 'workflow-empty'; empty.textContent = this.record ? '还没有工作流，先添加一个吧。' : '工作流列表尚未就绪'; this.list.append(empty);
    }
    for (const [index, item] of items.entries()) {
      const row = document.createElement('div'); row.className = 'workflow-row'; row.dataset.id = item.id;
      const description = document.createElement('div'); description.className = 'workflow-description';
      const name = document.createElement('strong'); name.textContent = item.name;
      const detail = document.createElement('small'); detail.textContent = this.summary(item); description.append(name, detail);
      const actions = document.createElement('div'); actions.className = 'workflow-actions';
      const action = (title, callback) => { const button = document.createElement('button'); button.type = 'button'; button.className = 'quiet'; button.textContent = title; button.disabled = this.busy || !!this.draft; button.addEventListener('click', callback); actions.append(button); return button; };
      for (const [direction, title, symbol, edge] of [[-1, '上移', '↑', index === 0], [1, '下移', '↓', index === items.length - 1]]) {
        const button = action(symbol, () => this.move(item, direction));
        button.classList.add('workflow-move'); button.dataset.direction = String(direction);
        button.title = title; button.setAttribute('aria-label', title + '：' + item.name);
        button.disabled ||= edge;
      }
      action('编辑', () => this.edit(item)).dataset.action = 'edit';
      action(this.deleting === item.id ? '确认删除' : '删除', () => { if (this.deleting === item.id) this.remove(item); else { this.deleting = item.id; this.render(); } }).dataset.action = 'delete';
      if (this.deleting === item.id) action('取消', () => { this.deleting = ''; this.render(); });
      row.append(description, actions); this.list.append(row);
    }
  }
  edit(item) {
    if (this.busy || !this.record || this.draft) return;
    this.draft = { id: item?.id || '', expectedRevision: this.record.revision };
    this.name.value = item?.name || ''; this.site.value = item?.site || 'deepseek'; this.handwriting.value = item?.handwriting || 'none'; this.prompt.value = item?.extraText || '';
    this.selected = new Set(item?.cardItems || [1]); this.shown = 6; this.deleting = '';
    document.getElementById('workflow-editor-title').textContent = item ? '编辑工作流' : '新增工作流';
    document.getElementById('workflow-card-picker').open = false;
    this.message(''); this.choices(); this.render(); this.name.focus();
  }
  collapse() { this.shown = 6; if (this.selected) this.choices(); }
  choices() {
    const grid = document.getElementById('workflow-card-choices'); grid.replaceChildren();
    for (let n = 1; n <= this.shown; n++) {
      const label = document.createElement('label'); label.className = 'card-choice';
      const input = document.createElement('input'); input.type = 'checkbox'; input.value = String(n); input.checked = this.selected.has(n);
      input.addEventListener('change', () => { if (input.checked) this.selected.add(n); else this.selected.delete(n); this.choiceSummary(); });
      label.append(input, document.createTextNode('第 ' + n + ' 条')); grid.append(label);
    }
    document.getElementById('workflow-less').hidden = this.shown <= 6;
    document.getElementById('workflow-more').disabled = this.shown >= 10000; this.choiceSummary();
  }
  choiceSummary() {
    const values = Array.from(this.selected).sort((a, b) => a - b);
    document.getElementById('workflow-card-summary').textContent = values.length ? values.slice(0, 3).map(n => '第 ' + n + ' 条').join('、') + (values.length > 3 ? ' 等 ' + values.length + ' 条' : '') : '无';
  }
  async save() {
    if (this.busy || !this.draft) return;
    const workflow = { id: this.draft.id, name: this.name.value, site: this.site.value, cardItems: Array.from(this.selected).sort((a, b) => a - b), handwriting: this.handwriting.value, extraText: this.prompt.value };
    this.busy = true; this.render(); this.message('正在保存工作流…');
    try {
      this.record = await MNBridge.send('saveWorkflow', { expectedRevision: this.draft.expectedRevision, workflow });
      this.draft = null; this.message('工作流已保存，可从网页或桌宠的三横线菜单执行。');
    } catch (error) { this.message(error.message, true); }
    finally { this.busy = false; this.render(); }
  }
  async remove(item) {
    if (this.busy || this.draft) return;
    this.busy = true; this.render();
    try { this.record = await MNBridge.send('deleteWorkflow', { expectedRevision: this.record.revision, id: item.id }); this.deleting = ''; this.message('工作流已删除'); }
    catch (error) { this.message(error.message, true); }
    finally { this.busy = false; this.render(); }
  }
  async move(item, direction) {
    if (this.busy || this.draft || !this.record) return;
    this.busy = true; this.deleting = ''; this.render(); this.message('正在保存顺序…');
    try {
      this.record = await MNBridge.send('moveWorkflow', { expectedRevision: this.record.revision, id: item.id, direction });
      this.message('工作流顺序已保存');
    } catch (error) { this.message(error.message, true); }
    finally {
      this.busy = false; this.render();
      const row = this.list.querySelector('[data-id="' + item.id + '"]');
      const button = row?.querySelector('[data-direction="' + direction + '"]');
      (button && !button.disabled ? button : row?.querySelector('[data-action="edit"]'))?.focus();
    }
  }
}
