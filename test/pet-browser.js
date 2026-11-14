window.mn = { call: async (command, payload = {}) => {
  const response = await fetch('/pet-command', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ command, payload }) });
  const value = await response.json(); if (value.error) throw new Error(value.error); return value;
} };
document.addEventListener('DOMContentLoaded', () => {
  const tools = document.createElement('div'); tools.style.cssText = 'padding:12px 20px;background:#edf1ff;display:flex;flex-wrap:wrap;gap:12px;align-items:center;font:12px system-ui';
  const label = document.createElement('span'); label.textContent = '本地验证：使用测试素材和模拟 MN 文件存储'; tools.append(label);
  for (const [text, endpoint, filename, type, inputId] of [
    ['导入测试动作包', '/fixture.mnpet', '小鲸.mnpet', 'application/zip', 'pet-pack-file'],
    ['选择测试图片', '/fixture.png', '蓝色桌宠.png', 'image/png', 'pet-image-file']
  ]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = text;
    button.addEventListener('click', async () => {
      const data = await (await fetch(endpoint)).arrayBuffer(), transfer = new DataTransfer();
      transfer.items.add(new File([data], filename, { type }));
      const input = document.getElementById(inputId); input.files = transfer.files; input.dispatchEvent(new Event('change', { bubbles: true }));
    }); tools.append(button);
  }
  const failure = document.createElement('button'); failure.type = 'button'; failure.textContent = '模拟下次保存失败';
  failure.addEventListener('click', async () => { await fetch('/pet-fail', { method: 'POST' }); failure.textContent = '保存故障已开启'; }); tools.append(failure);
  document.body.prepend(tools);
});
