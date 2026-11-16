// 独立于网站连接检查草稿，登录或加载失败时仍可使用顶栏刷新。
(() => {
  const shown = element => element.getClientRects().length > 0 && !element.closest('[hidden],[aria-hidden="true"]');
  const editors = Array.from(document.querySelectorAll('textarea,[contenteditable="true"]')).filter(shown);
  const text = editors.some(element => (element.tagName === 'TEXTAREA' ? element.value : element.innerText || element.textContent || '').trim());
  const files = Array.from(document.querySelectorAll('input[type="file"]')).some(input => input.files?.length);
  const attachment = editors.some(element => {
    const scope = element.closest('form,input-container,input-area-v2,input-area-v3,#input-engine-container') || element.parentElement?.parentElement;
    return scope && Array.from(scope.querySelectorAll('[data-testid*="file-thumbnail"],[data-testid*="attachment"],.file-preview,.attachment-preview,button[aria-label*="Remove file"],button[aria-label*="Remove attachment"],button[aria-label*="移除"],button[aria-label*="删除附件"],button[aria-label*="移除文件"]')).some(shown);
  });
  return JSON.stringify({ pending: Boolean(text || files || attachment) });
})();
