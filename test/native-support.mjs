import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const picture = readFileSync('test/fixtures/upload-image.png').toString('base64');
export const plain = value => JSON.parse(JSON.stringify(value));
export function nativeScene({ files = new Map(), values = new Map() } = {}) {
  const bytesAt = path => files.get(path);
  const timers = [], views = new Map(), classes = new Map(), writes = [], hud = [], savedFiles = []; let failPath = '', decodeFails = false;
  class View {
    constructor(frame) { this.frame = frame; this.subviews = []; this.layer = {}; this.gestures = []; this.userInteractionEnabled = true; this.titleLabel = {}; }
    get bounds() { return { x: 0, y: 0, width: this.frame.width, height: this.frame.height }; }
    addSubview(view) { view.removeFromSuperview(); view.superview = this; this.subviews.push(view); }
    insertSubviewAboveSubview(view, sibling) {
      if (sibling.superview !== this) throw Error('参照视图不在当前父视图内');
      view.removeFromSuperview(); view.superview = this; this.subviews.splice(this.subviews.indexOf(sibling) + 1, 0, view);
    }
    removeFromSuperview() { if (this.superview) this.superview.subviews = this.superview.subviews.filter(v => v !== this); this.superview = null; }
    addGestureRecognizer(g) { this.gestures.push(g); }
    removeGestureRecognizer(g) { this.gestures = this.gestures.filter(x => x !== g); }
    setTitleForState(title) { this.title = title; }
    setTitleColorForState(color) { this.titleColor = color; }
    addTargetActionForControlEvents(target, selector, event) {
      this.target = target; this.selector = selector; this.event = event;
      (this.targets ||= []).push({ target, selector, event });
    }
  }
  class Web extends View {
    constructor(frame) { super(frame); this.scrollView = new View(frame); this.scripts = []; }
    loadFileURLAllowingReadAccessToURL(url, root) { this.loaded = { url, root }; call(this.delegate, 'webViewDidFinishLoad', this); }
    evaluateJavaScript(code, callback) {
      this.scripts.push(code);
      if (callback) callback(true);
    }
    stopLoading() { this.stopped = true; }
  }
  function data(bytes) {
    const buffer = Buffer.from(bytes);
    return { buffer, length: buffer.length, base64Encoding: buffer.toString('base64'), writeToFileAtomically(path, atomic) {
      writes.push({ path, atomic }); if (path === failPath) return false; files.set(path, buffer); return true;
    } };
  }
  function image(d) { return decodeFails || !d ? null : { size: { width: d.buffer.readUInt32BE(16), height: d.buffer.readUInt32BE(20) } }; }
  const context = vm.createContext({ console, UIView: View, UIImageView: View, UIWebView: Web, UIButton: View, UILabel: View, UIScrollView: View,
    UIImage: { imageWithData: image, imageWithContentsOfFile: path => image(bytesAt(path) ? data(bytesAt(path)) : null) },
    UIColor: { clearColor: () => 'transparent', whiteColor: () => 'white', darkGrayColor: () => 'gray', colorWithWhiteAlpha: (white, alpha) => ({ white, alpha }), colorWithRedGreenBlueAlpha: (...rgba) => rgba },
    UIFont: { systemFontOfSize: size => ({ size }), boldSystemFontOfSize: size => ({ size, bold: true }) }, NSURL: { fileURLWithPath: path => ({ scheme: 'file', path }) },
    UIPanGestureRecognizer: class { constructor(target, selector) { this.target = target; this.selector = selector; } },
    UITapGestureRecognizer: class { constructor(target, selector) { this.target = target; this.selector = selector; } requireGestureRecognizerToFail(gesture) { this.waitFor = gesture; } },
    NSData: { dataWithStringEncoding: (text, encoding) => { if (encoding !== 5) throw Error('需要 Latin1'); return data(Buffer.from(text, 'latin1')); } },
    NSJSONSerialization: { dataWithJSONObjectOptions: value => data(JSON.stringify(value)), JSONObjectWithDataOptions: d => JSON.parse(d.buffer.toString()) },
    NSFileManager: { defaultManager: () => ({ fileExistsAtPath: path => !!bytesAt(path), createDirectoryAtPathWithIntermediateDirectoriesAttributes: () => true, contentsAtPath: path => bytesAt(path) ? data(bytesAt(path)) : null }) },
    NSUserDefaults: { standardUserDefaults: () => ({ objectForKey: key => values.get(key), setObjectForKey: (value, key) => values.set(key, value) }) },
    NSTimer: { scheduledTimerWithTimeInterval: (seconds, repeat, callback) => { const timer = { seconds, valid: true, invalidate() { this.valid = false; }, fire() { if (this.valid) { this.valid = false; callback(); } } }; timers.push(timer); return timer; } },
    Application: { sharedInstance: () => ({ documentPath: '/documents', tempPath: '/temp', saveFileWithUti: (path, uti) => savedFiles.push({ path, uti }), studyController: window => { if (!views.has(window)) views.set(window, { view: new View({ x: 0, y: 0, width: 1024, height: 768 }) }); return views.get(window); }, showHUD: message => hud.push(message) }) },
    AIBUpload: { cancel() {} }, AIBPanel: { dispose(c) { c.disposed = true; } },
    JSB: { defineClass: (name, methods, statics) => { const value = { methods, statics }; classes.set(name.split(' ')[0], value); return value; } }
  });
  for (const name of ['AIBNative', 'AIBSettings', 'AIBWorkflows', 'AIBWorkflowFiles', 'AIBWorkflowLibrary', 'AIBWorkflowRunner', 'WebBridgeCommands', 'AIBExternalWorkflows', 'AIBAddon']) vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), context);
  const addonClass = context.createAiBridgeAddon('/addon');
  function call(instance, method, ...args) { const previous = context.self; context.self = instance; try { return addonClass.methods[method](...args); } finally { context.self = previous; } }
  function open() {
    const addon = { window: {} }; call(addon, 'sceneWillConnect');
    const controller = { addon, visible: true, activePage: 'settings', settingsToken: 'settings', settingsView: new Web({ x: 0, y: 0, width: 700, height: 500 }) };
    addon.panelController = controller;
    return { addon, controller, command: (name, payload) => {
      if (name === 'getSettings') return context.AIBSettings.read();
      if (name === 'saveSettings') return context.AIBSettings.write(payload);
      if (name === 'getNavigation') return context.AIBSettings.readNavigation();
      if (name === 'saveNavigation') return context.AIBSettings.writeNavigation(payload);
      throw new Error('不支持的设置命令');
    } };
  }
  return { context, addonClass, open, call, files, values, timers, views, writes, hud, savedFiles,
    failWrite(path) { failPath = path; }, failDecode(value) { decodeFails = value; } };
}
