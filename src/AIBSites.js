var AIBSites = (function () {
  var definitions = [
    { name: 'deepseek', title: 'DeepSeek', home: 'https://chat.deepseek.com/', origin: 'https://chat.deepseek.com', prefix: 'window.__AIB_DEEPSEEK__', viewKey: 'webView' },
    { name: 'doubao', title: '豆包', home: 'https://www.doubao.com/chat/', origin: 'https://www.doubao.com', prefix: 'window.__AIB_DOUBAO__', viewKey: 'doubaoView' },
    { name: 'gpt', title: 'ChatGPT', home: 'https://chatgpt.com/', origin: 'https://chatgpt.com', prefix: 'window.__AIB_GPT__', viewKey: 'gptView' },
    { name: 'gemini', title: 'Gemini', home: 'https://gemini.google.com/app', origin: 'https://gemini.google.com', prefix: 'window.__AIB_GEMINI__', viewKey: 'geminiView' }
  ];
  function all(controller) {
    if (!controller.webSites) controller.webSites = definitions.map(function (definition) {
      return Object.assign({}, definition, { epoch: 0, injectionId: 0, token: '', loaded: false });
    });
    return controller.webSites;
  }
  function get(controller, name) {
    var key = name || controller.activePage;
    return all(controller).filter(function (site) { return site.name === key; })[0] || null;
  }
  function forView(controller, view) {
    if (!view) return null;
    return all(controller).filter(function (site) { return controller[site.viewKey] === view; })[0] || null;
  }
  return { all: all, get: get, forView: forView };
})();
