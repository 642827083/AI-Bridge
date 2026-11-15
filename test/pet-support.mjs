import vm from 'node:vm';
import { readFileSync } from 'node:fs';
export const picture = readFileSync('test/fixtures/pet-256.png').toString('base64');
export const builtin = readFileSync('assets/pet/DSniang1-256.png');
export const pack = { schema: 1, manifest: JSON.parse(readFileSync('test/fixtures/pet.json')), files: {
  'poster.png': readFileSync('test/fixtures/pet-poster.png').toString('base64'),
  'actions/idle.webp': readFileSync('test/fixtures/pet-idle.webp').toString('base64')
}, license: readFileSync('test/fixtures/pet-LICENSE.txt', 'utf8') };
export const plain = value => JSON.parse(JSON.stringify(value));
export function pets({ files = new Map(), values = new Map() } = {}) {
  const bytesAt = path => path === '/addon/web-dist/pet-builtin/DSniang1.png' ? builtin : files.get(path);
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
      const match = /^AIBPetAnimation.play\((.*),(\d+)\)$/.exec(code);
      if (match) { this.payload = JSON.parse(match[1]); this.token = Number(match[2]); }
      if (callback) callback(code.includes('AIBPetAnimation') ? 'ready:' + this.token : true);
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
  for (const name of ['AIBNative', 'AIBSettings', 'AIBWorkflows', 'AIBWorkflowFiles', 'AIBPetModel', 'AIBBuiltinPet', 'AIBPetPackModel', 'AIBPetStorage', 'AIBPetPackStore', 'AIBPetImageStore', 'AIBPetAnimationPlayer', 'AIBPetInteraction', 'AIBWorkflowPet', 'AIBPetOverlay', 'AIBPets', 'AIBWorkflowRunner', 'WebBridgeCommands', 'AIBAddon']) vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), context);
  const addonClass = context.createAiBridgeAddon('/addon');
  function call(instance, method, ...args) { const previous = context.self; context.self = instance; try { return addonClass.methods[method](...args); } finally { context.self = previous; } }
  function open() {
    const addon = { window: {} }; call(addon, 'sceneWillConnect'); addon.petSession.mountTimer.fire();
    const controller = { addon, visible: true, activePage: 'settings', settingsToken: 'settings', settingsView: new Web({ x: 0, y: 0, width: 700, height: 500 }) };
    addon.panelController = controller;
    return { addon, s: addon.petSession, controller, command: (name, payload) => context.AIBPets.command(controller, name, payload) };
  }
  function upload(d, source = 'pack', value = pack, expected) {
    const text = source === 'pack' ? JSON.stringify(value) : value;
    const name = source === 'pack' ? 'importPetPack' : 'importPetImage';
    const revision = source === 'pack' ? d.s.packRevision : d.s.customPet.revision;
    const id = 'fixture';
    d.command(name, { phase: 'begin', id, length: text.length, expectedRevision: expected ?? revision ?? '', name: '图片角色', style: 'still', anchorX: 0.5 });
    for (let offset = 0; offset < text.length; offset += 32768) d.command(name, { phase: 'chunk', id, offset, text: text.slice(offset, offset + 32768) });
    return d.command(name, { phase: 'finish', id });
  }
  return { context, addonClass, open, call, upload, files, values, timers, views, writes, hud, savedFiles,
    failWrite(path) { failPath = path; }, failDecode(value) { decodeFails = value; } };
}
