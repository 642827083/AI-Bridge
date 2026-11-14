var AIBSettings = (function () {
  function validItem(item) { return Number.isSafeInteger(item) && item > 0 && item <= 10000; }
  function normalize(input) {
    input = input || {};
    var modern = input.schema === 2 || input.cardItems !== undefined || input.handwriting !== undefined;
    // 旧设置按原有上传范围转换，附加提示词原样保留。
    var cardItems = modern ? (Array.isArray(input.cardItems) ? input.cardItems : [1]) : (input.source === 'mindmap' && input.attachText !== true ? [] : [1]);
    var handwriting = modern ? input.handwriting : (input.source === 'mindmap' ? 'mindmap' : 'none');
    return { schema: 2, cardItems: Array.from(new Set(cardItems.filter(validItem))).sort(function (a, b) { return a - b; }).slice(0, 200),
      handwriting: ['last', 'mindmap', 'none'].indexOf(handwriting) >= 0 ? handwriting : 'none',
      extraText: typeof input.extraText === 'string' ? input.extraText.slice(0, 10000) : '' };
  }
  function read() {
    try { return normalize(JSON.parse(String(AIBNative.preference('settings', '{}')))); }
    catch (error) { return normalize({}); }
  }
  function validate(input) {
    if (!input || !Array.isArray(input.cardItems) || input.cardItems.length > 200 || !input.cardItems.every(validItem)
      || ['last', 'mindmap', 'none'].indexOf(input.handwriting) < 0 || typeof input.extraText !== 'string' || input.extraText.length > 10000) throw new Error('设置内容无效，附加提示词最多 10000 字符');
    return normalize(input);
  }
  function write(input) {
    var settings = validate(input); AIBNative.save('settings', JSON.stringify(settings)); return settings;
  }
  var SITES = ['deepseek', 'gpt', 'gemini'];
  function siteAvailable(name) { return SITES.indexOf(name) >= 0; }
  function readNavigation() {
    try {
      var record = JSON.parse(String(AIBNative.preference('navigationSites', '{}')));
      if (record && record.schema === 3 && Array.isArray(record.sites) && record.sites.length && record.sites.every(siteAvailable)) {
        return { sites: SITES.filter(function (site) { return record.sites.indexOf(site) >= 0; }) };
      }
    } catch (error) {}
    return { sites: ['deepseek'] };
  }
  function writeNavigation(input) {
    if (input && Array.isArray(input.sites) && input.sites.length === 0) throw new Error('至少保留一个网页');
    if (!input || !Array.isArray(input.sites) || input.sites.length > 3 || !input.sites.every(siteAvailable)) throw new Error('导航栏设置无效');
    var sites = SITES.filter(function (site) { return input.sites.indexOf(site) >= 0; });
    AIBNative.save('navigationSites', JSON.stringify({ schema: 3, sites: sites })); return { sites: sites };
  }
  return { normalize: normalize, validate: validate, read: read, write: write, readNavigation: readNavigation, writeNavigation: writeNavigation, siteAvailable: siteAvailable };
})();
