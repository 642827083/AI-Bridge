export function readBlockDraft(element) {
  const blocks = 'p,div,li,ul,ol,blockquote,pre,h1,h2,h3,h4,h5,h6';
  function text(node) {
    if (node.nodeType === 3) return node.data;
    if (node.nodeType !== 1) return '';
    if (node.tagName === 'BR') return node.classList.contains('ProseMirror-trailingBreak') ? '' : '\n';
    if (node.childNodes.length === 1 && node.firstChild.nodeName === 'BR') return '';
    let result = '', previousBlock = false, any = false;
    for (const child of node.childNodes) {
      const block = child.nodeType === 1 && child.matches(blocks), value = text(child);
      // 富文本段落按一个换行读取；空段落保留，避免 innerText 因段落布局额外补空行。
      if (any && (block || previousBlock) && !(previousBlock && !block && value.startsWith('\n'))) result += '\n';
      result += value; previousBlock = block; any = true;
    }
    return result;
  }
  return text(element);
}
