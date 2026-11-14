import { pets, builtin } from './pet-support.mjs';

// 将真实原生代码生成的视图树转成开发预览，位置、颜色与文字均取自原生视图。
const h = pets(), d = h.open();
const parent = d.s.view.superview; parent.frame = { x: 0, y: 0, width: 900, height: 590 };
d.s.settings.position = { x: .70, y: .78 }; h.context.AIBPets.layout(d.addon);
for (const [name, site] of [['批改', 'gpt'], ['讲解题目', 'deepseek'], ['复盘手写', 'doubao']]) {
  const record = h.context.AIBWorkflows.read(); h.context.AIBWorkflows.save({ expectedRevision: record.revision, workflow: { name, site, cardItems: [1], handwriting: 'last', extraText: '测试提示词' } });
}
let status = '本地原生布局预览 · 点击右上角三横线查看工作流；MN 实际触控仍需真机验证';
h.context.AIBWorkflowRunner.run = (addon, id) => { status = '已模拟选中「' + h.context.AIBWorkflows.get(id).name + '」，没有读取或上传真实卡片。'; };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
function color(value, fallback = 'transparent') {
  if (value === 'white') return '#fff';
  if (Array.isArray(value)) return `rgba(${value.slice(0, 3).map(c => Math.round(c * 255))},${value[3]})`;
  if (value && value.white !== undefined) return `rgba(${[0, 0, 0].map(() => Math.round(value.white * 255))},${value.alpha})`;
  return fallback;
}
function render(view) {
  if (view.hidden) return '';
  const f = view.frame, layer = view.layer || {}, font = view.font || view.titleLabel?.font;
  const styles = [`position:absolute;left:${f.x}px;top:${f.y}px;width:${f.width}px;height:${f.height}px`, `background:${color(view.backgroundColor)}`, `border-radius:${layer.cornerRadius || 0}px`];
  if (layer.borderWidth) styles.push(`border:${layer.borderWidth}px solid ${color(layer.borderColor)}`);
  if (layer.shadowOpacity) styles.push(`box-shadow:0 ${layer.shadowOffset?.height || 0}px ${layer.shadowRadius}px rgba(30,30,30,${layer.shadowOpacity})`);
  if (font) styles.push(`font-size:${font.size}px;font-weight:${font.bold ? 600 : 400}`);
  styles.push(`color:${color(view.textColor || view.titleColor, '#333')}`);
  let tag = 'div', attributes = '';
  if (view.selector) {
    tag = 'button'; let action = view.selector === 'petWorkflowMenu:' ? 'menu' : view.selector === 'petRunWorkflow:' ? 'run-' + view.tag : 'manage';
    attributes = ` onclick="location.href='/workflow-bubble?action=${action}'" aria-label="${escape(view.accessibilityLabel || view.title)}"`;
  }
  if (view.text !== undefined) styles.push(`display:flex;align-items:center;justify-content:${view.textAlignment === 2 ? 'flex-end' : view.textAlignment === 1 ? 'center' : 'flex-start'};white-space:normal;overflow:hidden;line-height:1.3`);
  if (view === d.s.workflowScroll) styles.push('overflow:auto');
  return `<${tag}${attributes} style="${styles.join(';')}">${escape(view.text ?? view.title ?? '')}${view.subviews.map(render).join('')}</${tag}>`;
}
export function workflowBubblePreview(address) {
  const action = new URL(address, 'http://local').searchParams.get('action');
  if (action === 'menu') h.call(d.addon, 'petWorkflowMenu');
  if (/^run-\d+$/.test(action)) h.call(d.addon, 'petRunWorkflow', d.s.workflowMenuButtons[Number(action.slice(4))]);
  if (action === 'manage') { h.context.AIBWorkflowPet.close(d.s); status = '这里会打开「设置 → 桌宠 → 工作流」。'; }
  if (action === 'top' || action === 'bottom') { d.s.settings.position.y = action === 'top' ? 0 : .78; h.context.AIBPets.layout(d.addon); }
  const pet = d.s.view.frame;
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>哦鲸鲸工作流菜单 · 本地布局预览</title><style>*{box-sizing:border-box}body{margin:0;background:#f5f6f8;color:#535967;font:13px -apple-system,BlinkMacSystemFont,'Segoe UI','Microsoft YaHei',sans-serif}header{max-width:900px;margin:20px auto 14px;display:flex;justify-content:space-between;gap:16px;align-items:center}a{color:#4d6bdf;text-decoration:none;margin-left:14px}.canvas{position:relative;width:900px;height:590px;margin:auto;border:1px solid #e2e5ec;border-radius:16px;background-color:#fbfbfc;background-image:linear-gradient(#e9ebf0 1px,transparent 1px),linear-gradient(90deg,#e9ebf0 1px,transparent 1px);background-size:28px 28px}button{font-family:inherit;border:0;padding:0;cursor:pointer;display:flex;align-items:center;justify-content:center}button:active{filter:brightness(.97)}button:focus-visible{outline:2px solid #8399ed;outline-offset:2px}button>div{pointer-events:none}</style><header><span>${escape(status)}</span><div><a href="?action=top">靠近顶边</a><a href="?action=bottom">回到中部</a></div></header><main class="canvas"><img alt="自带哦鲸鲸" src="data:image/png;base64,${builtin.toString('base64')}" style="position:absolute;left:${pet.x}px;top:${pet.y}px;width:${pet.width}px;height:${pet.height}px">${parent.subviews.filter(view => view !== d.s.view).map(render).join('')}</main></html>`;
}
