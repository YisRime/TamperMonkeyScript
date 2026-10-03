import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import * as build from './build.ts';

const P = build.project('R6Player');
const A = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const withBrowser = argv.includes('--browser');

function ElementStub (): any {}
function makeEventClass (defaultType?): any {
  return function Ev (type, init) {
    this.type = type || defaultType;
    Object.assign(this, init || {});
    this.target = null;
    this.currentTarget = null;
    this.__path = [];
  };
}
function enhanceEventProto (Ctor): any {
  Ctor.prototype.preventDefault = function () { this.defaultPrevented = true };
  Ctor.prototype.stopPropagation = function () { this.__stopped = true };
  Ctor.prototype.stopImmediatePropagation = function () { this.__stopped = true };
  Ctor.prototype.composedPath = function () { return this.__path.length ? this.__path : (this.target ? [this.target] : []) };
  return Ctor;
}
function makeNode (tag, env): any {
  const node: any = {
    tagName: String(tag).toUpperCase(),
    nodeName: String(tag).toUpperCase(),
    nodeType: 1,
    style: {},
    children: [],
    parentNode: null,
    isConnected: true,
    textContent: '',
    attrs: {},
    _listeners: {},
    appendChild (c) { c.parentNode = this; this.children.push(c); return c },
    insertBefore (c) { return this.appendChild(c) },
    removeChild (c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; c.isConnected = false; return c },
    remove () { if (this.parentNode) this.parentNode.removeChild(this) },
    setAttribute (k, v) { this.attrs[k] = String(v) },
    getAttribute (k) { return k in this.attrs ? this.attrs[k] : null },
    hasAttribute (k) { return k in this.attrs },
    removeAttribute (k) { delete this.attrs[k] },
    addEventListener (n, f) { (this._listeners[n] = this._listeners[n] || []).push(f) },
    removeEventListener (n, f) { this._listeners[n] = (this._listeners[n] || []).filter(x => x !== f) },
    contains (other) { let n = other; while (n) { if (n === this) return true; n = n.parentNode } return false },
    getBoundingClientRect () {
      return this.__rect || { width: 800, height: 450, top: 40, left: 60, bottom: 490, right: 860, x: 60, y: 40 };
    },
    querySelector (sel) { return env.query(this, sel, true)[0] || null },
    querySelectorAll (sel) { return env.query(this, sel, false) },
    attachShadow (opts) {
      const root = makeNode('#shadow-root', env);
      root.host = this;
      this.shadowRoot = root;
      return root;
    },
    click () { this.dispatchEvent(new env.sandbox.MouseEvent('click', { bubbles: true })) },
    focus () {},
    dispatchEvent (ev) {
      ev.target = ev.target || this;
      const path = [];
      let n = this;
      while (n) { path.push(n); n = n.parentNode }
      [env.document, env.sandbox].forEach(node => { if (node && !path.includes(node)) path.push(node) });
      ev.__path = path;
      path.forEach(node => {
        if (ev.__stopped) return;
        ev.currentTarget = node;
        (node._listeners && node._listeners[ev.type] || []).slice().forEach(f => {
          try { (typeof f === 'function' ? f : f.handleEvent).call(node, ev) } catch (e) { env.errors.push(`listener[${ev.type}] ${e.message}`) }
        });
      });
      return !ev.defaultPrevented;
    },
    fireAll (type, props) {
      const ev = new env.sandbox.MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, props || {}));
      return this.dispatchEvent(ev);
    }
  };
  Object.defineProperty(node, 'innerText', { get () { return this.textContent }, set (v) { this.textContent = v } });
  Object.defineProperty(node, 'className', { get () { return this.getAttribute('class') || '' }, set (v) { this.setAttribute('class', v) } });
  Object.defineProperty(node, 'textContent', {
    get () { return (this.__text || '') + this.children.map(c => c.textContent).join('') },
    set (v) { this.__text = String(v); this.children.forEach(c => { c.parentNode = null }); this.children = [] }
  });
  node.classList = {
    add: c => { const s = new Set((node.getAttribute('class') || '').split(/\s+/).filter(Boolean)); s.add(c); node.setAttribute('class', [...s].join(' ')) },
    remove: c => { const s = new Set((node.getAttribute('class') || '').split(/\s+/).filter(Boolean)); s.delete(c); node.setAttribute('class', [...s].join(' ')) },
    contains: c => (node.getAttribute('class') || '').split(/\s+/).includes(c),
    toggle: c => { node.classList.contains(c) ? node.classList.remove(c) : node.classList.add(c) }
  };
  Object.setPrototypeOf(node, ElementStub.prototype);
  return node;
}
function walk (node, fn) { (node.children || []).forEach(c => { fn(c); if (c.children) walk(c, fn) }) }
export function buildSandbox ({ source, targetPath, opts }): any {
  const errors = [];
  const consoleErrors = [];
  const config = Object.assign({ enable: true }, (opts && opts.config) || {});
  const env: any = { errors, query, sandbox: null, document: null };
  function query (root, sel, firstOnly) {
    const want = String(sel).trim();
    const out = [];
    walk(root, n => {
      let hit = false;
      if (want.startsWith('.')) hit = (n.getAttribute('class') || '').split(/\s+/).includes(want.slice(1));
      else if (want.startsWith('#')) hit = n.getAttribute('id') === want.slice(1);
      else hit = n.tagName === want.toUpperCase();
      if (hit) out.push(n);
    });
    return firstOnly ? out.slice(0, 1) : out;
  }
  function HTMLMediaElement () {}
  HTMLMediaElement.prototype = Object.create(ElementStub.prototype);
  env.HTMLMediaElement = HTMLMediaElement;
  ['currentTime', 'playbackRate', 'volume'].forEach(prop => {
    const slot = '__' + prop;
    Object.defineProperty(HTMLMediaElement.prototype, prop, {
      configurable: true, enumerable: true,
      get () { return this[slot] === undefined ? (prop === 'volume' || prop === 'playbackRate' ? 1 : 0) : this[slot] },
      set (v) { this[slot] = v }
    });
  });
  HTMLMediaElement.prototype.addEventListener = function (n, f) { (this._listeners[n] = this._listeners[n] || []).push(f) };
  HTMLMediaElement.prototype.removeEventListener = function (n, f) { this._listeners[n] = (this._listeners[n] || []).filter(x => x !== f) };
  HTMLMediaElement.prototype.play = function () { this.paused = false; return Promise.resolve() };
  HTMLMediaElement.prototype.pause = function () { this.paused = true };
  HTMLMediaElement.prototype.load = function () {};
  function HTMLVideoElement () {}
  HTMLVideoElement.prototype = Object.create(HTMLMediaElement.prototype);
  function HTMLAudioElement () {}
  HTMLAudioElement.prototype = Object.create(HTMLMediaElement.prototype);

  const media = makeNode('video', env);
  Object.setPrototypeOf(media, HTMLVideoElement.prototype);
  media.setAttribute('id', 'v');
  media.paused = true; media.muted = false; media.ended = false; media.loop = false; media.mimeType = '';
  media.currentTime = 10; media.duration = 600; media.playbackRate = 1; media.volume = 1;
  media.readyState = 4; media.networkState = 2; media.videoWidth = 800; media.videoHeight = 450;
  media.videoTracks = { length: 0 }; media.audioTracks = { length: 0 }; media.textTracks = { length: 0 };
  media.buffered = { length: 1, end: () => 600, start: () => 0, constructor: { name: 'TimeRanges' } };
  media.seekable = media.buffered;
  media.src = media.currentSrc = 'https://cdn.example.com/a.mp4';
  media.HTMLVideoElement = true;
  media.getVideoPlaybackQuality = () => ({ droppedVideoFrames: 0 });
  media.requestPictureInPicture = () => Promise.resolve({});
  media.removeAttribute('id');
  media.id = 'v';

  const document = makeNode('html', env);
  env.document = document;
  document.head = document.appendChild(makeNode('head', env));
  document.body = document.appendChild(makeNode('body', env));
  const wrap = document.body.appendChild(makeNode('div', env));
  wrap.setAttribute('id', 'wrap');
  wrap.appendChild(media);
  media.parentNode = wrap;
  document.documentElement = document;
  document.title = '测试页面 - r6player smoke';
  document.hidden = false;
  document.visibilityState = 'visible';
  document.fullscreenElement = null;
  document.pictureInPictureElement = null;
  document.pictureInPictureEnabled = true;
  document.readyState = 'complete';
  document.forms = [];
  document.getElementsByTagName = t => query(document, t, false);
  document.getElementsByClassName = c => query(document, '.' + c, false);
  document.getElementById = id => (id === 'v' ? media : query(document, '#' + id, true)[0] || null);
  document.createElement = tag => {
    const el = makeNode(tag, env);
    if (String(tag).toLowerCase() === 'video' || String(tag).toLowerCase() === 'audio') {
      Object.setPrototypeOf(el, String(tag).toLowerCase() === 'video' ? HTMLVideoElement.prototype : HTMLAudioElement.prototype);
      el.paused = true; el.muted = false; el.currentTime = 0; el.duration = 600;
      el.readyState = 4; el.videoWidth = 800; el.videoHeight = 450;
      el.buffered = { length: 1, end: () => 600, start: () => 0 };
      el.src = el.currentSrc = 'https://cdn.example.com/b.mp4';
      el.HTMLVideoElement = true;
      el.requestPictureInPicture = () => Promise.resolve({});
    }
    if (String(tag).toLowerCase() === 'canvas') {
      el.width = media.videoWidth; el.height = media.videoHeight;
      el.getContext = () => ({ drawImage () {}, fillRect () {}, getImageData: () => ({ data: [] }) });
      el.toBlob = cb => cb(el.width && el.height ? { size: 1024, type: 'image/png' } : null);
      el.toDataURL = () => 'data:image/png;base64,AAAA';
    }
    if (String(tag).toLowerCase() === 'a') { el.click = () => {}; el.href = ''; el.download = ''; el.target = '' }
    return el;
  };
  document.createTextNode = t => ({ nodeType: 3, textContent: String(t) });
  document.createEvent = t => EventImpl(t);
  document.exitPictureInPicture = () => Promise.resolve();
  document.addEventListener('DOMContentLoaded', () => {});

  const textOf = a => a.map(x => (x && (x.message || x.type)) || String(x)).join(' ');
  const consoleStub = {
    log () {}, debug () {}, info () {}, warn () {}, table () {},
    error (...a) { consoleErrors.push('console.error: ' + textOf(a)) }
  };
  const FAILURE_TEXT = /失败|异常|无法|不可用|不支持|出错|error/i;
  consoleStub.log = function (...a) {
    const s = textOf(a);
    if (FAILURE_TEXT.test(s)) { consoleErrors.push(s) }
  };
  const guardTimer = (raw, kind) => function (fn, ms, ...args) {
    if (typeof fn !== 'function') { return raw(fn, ms, ...args) }
    return raw(function () { try { fn.apply(this, args) } catch (e) { errors.push(kind + ' 回调异常: ' + e.message) } }, ms);
  };
  const sandboxSetTimeout = guardTimer(setTimeout, 'setTimeout');
  const sandboxSetInterval = guardTimer(setInterval, 'setInterval');
  const sandbox: any = {
    console: consoleStub,
    setTimeout: sandboxSetTimeout, clearTimeout, setInterval: sandboxSetInterval, clearInterval,
    setImmediate: (f) => sandboxSetTimeout(f, 0),
    queueMicrotask: f => Promise.resolve().then(f),
    requestAnimationFrame: (f) => sandboxSetTimeout(() => f(Date.now()), 16), cancelAnimationFrame: clearTimeout,
    URLSearchParams, TextEncoder,
    navigator: { platform: 'Win32', userAgent: 'Mozilla/5.0 (test)', language: 'zh-CN', languages: ['zh-CN'], clipboard: { write: () => Promise.resolve(), writeText: () => Promise.resolve() } },
    location: { href: 'https://example.com/watch?v=1', host: 'example.com', hostname: 'example.com', protocol: 'https:', pathname: '/watch', search: '?v=1', hash: '', origin: 'https://example.com', reload () { errors.push('location.reload()') }, replace () {}, assign () {} },
    history: { pushState () {}, replaceState () {}, back () {} },
    screen: { width: 1920, height: 1080 },
    innerWidth: 1280, innerHeight: 800, outerWidth: 1280, outerHeight: 900, devicePixelRatio: 1,
    document,
    Element: ElementStub, HTMLElement: function () {}, HTMLDivElement: function () {}, Node: function () {},
    DocumentFragment: function () {}, Event: enhanceEventProto(makeEventClass()), CustomEvent: enhanceEventProto(makeEventClass()),
    KeyboardEvent: null, MouseEvent: null, InputEvent: enhanceEventProto(makeEventClass()), ProgressEvent: enhanceEventProto(makeEventClass()),
    HTMLMediaElement, HTMLVideoElement, HTMLAudioElement, HTMLAnchorElement: function () {},
    MediaSource: class { static isTypeSupported () { return false } addEventListener () {} },
    SourceBuffer: class {}, Audio: function () {}, Image: function () {},
    ShadowRoot: function () {}, Document: function () {}, Text: function () {}, Comment: function () {},
    EventTarget: function () {}, HTMLDocument: function () {}, HTMLCanvasElement: function () {},
    HTMLImageElement: function () {}, HTMLInputElement: function () {}, HTMLAudioElementCtor: function () {},
    DOMRect: function () {}, DOMParserCtor: function () {}, NodeFilter: { FILTER_ACCEPT: 1 }, Range: function () {},
    TextDecoder: class { decode () { return '' } }, AbortController: class { signal: any = null; abort () {} },
    MessageChannel: class { port1: any = { onmessage: null, postMessage () {}, close () {} }; port2: any = this.port1 },
    Storage: function () {}, ImageData: function () {}, Path2D: function () {},
    Blob: class { size = 1; type = ''; constructor (parts, o) { this.type = (o && o.type) || '' } },
    File: class { name = ''; type = ''; constructor (p, n, o) { this.name = n; this.type = (o && o.type) || '' } },
    ClipboardItem: class { d: any; constructor (d) { this.d = d } },
    URL: { createObjectURL: b => (b ? 'blob:fake' : (() => { throw new TypeError('Overload resolution failed') })()), revokeObjectURL () {} },
    getComputedStyle: () => ({ position: 'relative', width: '800px', height: '450px', opacity: '1', visibility: 'visible' }),
    MutationObserver: class { fn: any; constructor (fn) { this.fn = fn } observe () {} disconnect () {} takeRecords () { return [] } },
    IntersectionObserver: class { fn: any; o: any; constructor (fn, o) { this.fn = fn; this.o = o } observe () {} unobserve () {} disconnect () {} },
    ResizeObserver: class { observe () {} disconnect () {} },
    customElements: { define () {}, get () { return null }, whenDefined: () => Promise.resolve() },
    DOMParser: class { parseFromString () { return document } },
    XMLHttpRequest: function () { this.open = () => {}; this.send = () => {}; this.addEventListener = () => {} },
    fetch: () => Promise.reject(new Error('沙箱内不允许真实网络请求')),
    FormData: class { append () {} },
    alert () {}, prompt: () => null, blur () {}, scrollTo () {}, getSelection: () => null, matchMedia: () => ({ matches: false, addListener () {}, addEventListener () {} }),
    open: () => ({ document: Object.assign(makeNode('html', env), { title: '', body: makeNode('body', env), createElement: document.createElement }), close () {}, focus () {} }),
    confirm: () => false,
    print () {}, stop () {},
    AudioContext: undefined, webkitAudioContext: undefined,
    name: '',
    __errs: errors
  };
  sandbox.KeyboardEvent = enhanceEventProto(makeEventClass());
  sandbox.MouseEvent = enhanceEventProto(makeEventClass());
  function EventImpl (t): any { return new sandbox.Event(t, { bubbles: true }) }
  sandbox.Event.prototype.initEvent = function (t) { this.type = t };
  Object.assign(sandbox, {
    addEventListener (n, f) { (sandbox._listeners[n] = sandbox._listeners[n] || []).push(f) },
    removeEventListener (n, f) { sandbox._listeners[n] = (sandbox._listeners[n] || []).filter(x => x !== f) },
    dispatchEvent (ev) {
      ev.target = ev.target || sandbox;
      ev.__path = [sandbox];
      (sandbox._listeners && sandbox._listeners[ev.type] || []).slice().forEach(f => { try { f.call(sandbox, ev) } catch (e) { errors.push('window listener: ' + e.message) } });
      return true;
    },
    _listeners: {}
  });
  sandbox.window = sandbox;
  sandbox.self = sandbox;
  sandbox.top = sandbox;
  sandbox.parent = sandbox;
  sandbox.frames = [sandbox];
  sandbox.globalThis = sandbox;
  const storageSeed = {};
  Object.keys(config).forEach(k => { storageSeed['_r6player_' + k.replace(/\./g, '_')] = String(config[k]) });
  sandbox.__storageSeed = storageSeed;
  sandbox.__media = media;
  sandbox.__r6playerTestErrors = errors;
  sandbox.__consoleErrors = consoleErrors;
  env.sandbox = sandbox;

  const gm = {};
  sandbox.GM_getValue = (k, d) => (k in gm ? gm[k] : d);
  sandbox.GM_setValue = (k, v) => { gm[k] = v };
  sandbox.GM_deleteValue = k => { delete gm[k] };
  sandbox.GM_listValues = () => Object.keys(gm);
  sandbox.GM_addValueChangeListener = () => 1;
  sandbox.GM_removeValueChangeListener = () => {};
  sandbox.GM_addStyle = css => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); return s };
  sandbox.GM_openInTab = () => ({ close () {}, onremove: () => {} });
  sandbox.GM_getTab = cb => cb && cb({ id: 1 });
  sandbox.GM_saveTab = () => {};
  sandbox.GM_getTabs = cb => cb && cb({ 1: {} });
  sandbox.GM_setClipboard = () => {};
  sandbox.GM_registerMenuCommand = () => {};
  sandbox.__gm = gm;
  return { sandbox, media, document, errors, consoleErrors, env };
}
export function makeStorageBootstrap (): string {
  return `(function (seed) {
    const data = {};
    Object.keys(seed).forEach(k => { data[k] = seed[k] });
    const api = {
      getItem: function (k) { return k in data ? data[k] : null },
      setItem: function (k, v) { data[k] = String(v) },
      removeItem: function (k) { delete data[k] },
      clear: function () { Object.keys(data).forEach(k => delete data[k]) },
      key: function (i) { return Object.keys(data)[i] }
    };
    Object.defineProperty(api, 'length', { get: function () { return Object.keys(data).length } });
    globalThis.localStorage = new Proxy(data, {
      get: function (target, prop) { return prop in target ? target[prop] : api[prop] },
      ownKeys: function (target) { return Object.keys(target) },
      getOwnPropertyDescriptor: function (target, prop) { return { value: target[prop], enumerable: true, configurable: true } },
      set: function (target, prop, v) { target[prop] = String(v); return true },
      deleteProperty: function (target, prop) { delete target[prop]; return true }
    });
    globalThis.sessionStorage = {
      _d: {},
      getItem: function (k) { return k in this._d ? this._d[k] : null },
      setItem: function (k, v) { this._d[k] = String(v) },
      removeItem: function (k) { delete this._d[k] },
      clear: function () { this._d = {} },
      key: function (i) { return Object.keys(this._d)[i] },
      get length () { return Object.keys(this._d).length }
    };
    globalThis.__storageDump = function () { return data };
  })`;
}


const TIP = `const tips = () => { const t = document.querySelector('.html_player_enhance_tips'); return t ? (t.innerText || t.textContent) : null }`;
const SLEEP = `const sleep = (ms) => new Promise(r => setTimeout(r, ms));`;

const cases = [
  {
    group: '建实例', name: '持有视频实例', body: `() => {
    const v = document.getElementById('v');
    const p = activePlayer.player();
    if (!p) { throw new Error('未检出到播放器实例') }
    if (p !== v) { throw new Error('当前实例不是页面上的 video') }
    return '实例列表 ' + activePlayer.listPlayers().length + ' 个，增强API ' + (activePlayer.enhancer ? '已建立' : '未建立')
  }`
  },
  {
    group: '建实例', name: '重接实例接线', body: `async () => {
    ${SLEEP}
    const v = activePlayer.player();
    const errsAt = window.__errs.length;
    delete v.__wired__; delete v.srcList;
    activePlayer.initInstance();
    if (!v.__wired__) { throw new Error('接线标记没登记：加载/缓冲/画中画/playing/canplay 该由同一面旗管住') }
    if (!v._fullScreen_ || !v._fullPageScreen_) { throw new Error('全屏/网页全屏能力未挂载') }
    const fullScreen = v._fullScreen_;
    const registered = fullScreenInstances.length;
    activePlayer.takeInstance(v);
    if (v._fullScreen_ !== fullScreen) { throw new Error('重复认领把全屏对象重建了') }
    if (fullScreenInstances.length !== registered) { throw new Error('重复认领让 Esc 登记表又涨了：' + registered + ' → ' + fullScreenInstances.length) }
    if (activePlayer.onceOn(v, '_probeOnceFlag_', 'canplay', () => {}) !== true || !v._probeOnceFlag_) { throw new Error('新标记位没能登记') }
    if (activePlayer.onceOn(v, '_probeOnceFlag_', 'canplay', () => {}) !== false) { throw new Error('新标记位第二次没跳过') }
    let did = 0;
    if (activePlayer.once(v, '_probeOnceFlag_', () => { did++ }) !== false || did) { throw new Error('once 第二次竟然又做了一遍') }
    delete v._probeOnceFlag_;
    const keep = activePlayer.player();
    const temp = document.createElement('video');
    Object.defineProperty(temp, 'getBoundingClientRect', { value: () => ({ width: 800, height: 450, top: 0, left: 0, right: 800, bottom: 450 }), configurable: true });
    document.body.appendChild(temp);
    let hits = 0;
    const keepAuto = activePlayer.autoPlay;
    activePlayer.autoPlay = () => { hits++; return true };
    try {
      activePlayer.takeInstance(temp);
      temp.dispatchEvent(new Event('canplay', { bubbles: true }));
      if (hits !== 1) { throw new Error('新元素第一次认领没接上 canplay：命中 ' + hits + ' 次') }
      activePlayer.takeInstance(temp);
      temp.dispatchEvent(new Event('canplay', { bubbles: true }));
      if (hits !== 2) { throw new Error('重复认领让 canplay 监听叠加了：两次派发命中 ' + hits + ' 次') }
    } finally {
      delete activePlayer.autoPlay;
      activePlayer.takeInstance(keep);
      const cached = mediaCore.mediaElementList.indexOf(temp);
      if (cached >= 0) { mediaCore.mediaElementList.splice(cached, 1) }
      temp.remove();
    }
    if (!activePlayer.enhancer) { throw new Error('增强API没有随实例重建') }
    tuner.unlockPlaybackRate();
    tuner.setSpeed(1.5);
    tuner.unlockPlaybackRate();
    v.dispatchEvent(new Event('playing', { bubbles: true }));
    v.dispatchEvent(new Event('progress', { bubbles: true }));
    v.dispatchEvent(new Event('loadeddata', { bubbles: true }));
    v.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    v.dispatchEvent(new Event('leavepictureinpicture', { bubbles: true }));
    if (!activePlayer.exitTime || Date.now() - activePlayer.exitTime > 500) { throw new Error('离开画中画的监听没有记录时间戳') }
    v.dispatchEvent(new Event('enterpictureinpicture', { bubbles: true }));
    await sleep(80);
    if (tuner.getSpeed() !== 1.5) { throw new Error('playing 同步把倍速改回了 ' + tuner.getSpeed()) }
    if ((v.currentSrc || v.src) && (!Array.isArray(v.srcList) || !v.srcList.length)) { throw new Error('没有记录播放器使用过的 src') }
    const setSrc = url => Object.defineProperty(v, 'currentSrc', { value: url, configurable: true });
    const recorded = [];
    const logs = [];
    const keepLog = console.log;
    const keepDebug = window._debugMode_;
    window._debugMode_ = true;
    console.log = (...a) => logs.push(a.map(x => (x && x.nodeType) ? '<dom>' : String(x)).join(' '));
    try {
      ['loadstart', 'loadeddata', 'durationchange'].forEach((name, i) => {
        delete v.srcList;
        setSrc('src-' + i + '.mp4');
        v.dispatchEvent(new Event(name, { bubbles: true }));
        recorded.push(name + '=' + ((v.srcList || []).join() || '未记录'));
      });
    } finally { console.log = keepLog; window._debugMode_ = keepDebug }
    if (!logs.some(t => t.includes('[Player] 媒体事件 loadeddata') && t.includes('video duration:') && t.includes('video dom:'))) { throw new Error('loadeddata 的日志文案变了：' + JSON.stringify(logs)) }
    if (!logs.some(t => t.includes('[Player] 媒体事件 durationchange'))) { throw new Error('durationchange 的日志文案变了：' + JSON.stringify(logs)) }
    if (!logs.some(t => t.includes('[Player] 媒体事件 loadstart') && t.includes('src-0.mp4'))) { throw new Error('loadstart 的日志没带上 currentSrc：' + JSON.stringify(logs)) }
    delete v.srcList;
    setSrc('three.mp4');
    v.dispatchEvent(new Event('timeupdate', { bubbles: true }));
    recorded.push('timeupdate=' + ((v.srcList || []).join() || '未记录'));
    if (recorded.some(x => x.includes('未记录'))) { throw new Error('换源监听漏接线：' + recorded.join(' | ')) }
    v.dispatchEvent(new Event('loadstart', { bubbles: true }));
    if ((v.srcList || []).join() !== 'three.mp4') { throw new Error('同一个 src 被重复记录：' + JSON.stringify(v.srcList)) }
    delete v.currentSrc; delete v.srcList;
    const added = window.__errs.slice(errsAt);
    if (added.length) { throw new Error('逐实例接线产生异常：' + added.join(' | ')) }
    return '接线可重建，倍速=' + tuner.getSpeed()
  }`
  },
  {
    group: '建实例', name: '共用媒体标签名单', body: `() => {
    const keepReady = Utils.ready;
    const keepDetect = activePlayer.detectPlayer;
    let detected = 0;
    activePlayer.detectPlayer = function () { detected++; return true };
    const calls = [];
    Utils.ready = (selector, fn, root) => { calls.push([selector, root, fn]); return true };
    const shadowRoot = { __shadowProbe__: true };
    try {
      const scan = supportMediaTags.length;
      if (!scan) { throw new Error('媒体标签名单是空的') }
      watchTags(shadowRoot);
      if (calls.length !== scan) { throw new Error('指定范围的扫描项数不对：' + calls.length) }
      if (calls.some(c => c[1] !== shadowRoot)) { throw new Error('范围没传下去：' + calls.map(c => String(c[1])).join(',')) }
      calls[0][2]({});
      if (detected !== 1) { throw new Error('名单里的检出回调没接到 detectPlayer：' + detected) }
      calls.length = 0;
      document.dispatchEvent(new window.CustomEvent('addShadowRoot', { detail: { shadowRoot } }));
      if (calls.length !== scan || calls.some(c => c[1] !== shadowRoot)) { throw new Error('shadowRoot 事件没按名单扫描：' + calls.length + ' 项，应为 ' + scan) }
      calls.length = 0;
      watchTags();
      if (calls.length !== scan || calls.some(c => c[1] !== undefined)) { throw new Error('整页扫描不该带范围：' + calls.map(c => String(c[1])).join(',')) }
      return '名单 ' + scan + ' 项：指定范围与整页各一轮，回调落到 detectPlayer ' + detected + ' 次'
    } finally {
      Utils.ready = keepReady;
      activePlayer.detectPlayer = keepDetect;
    }
  }`
  },
  {
    group: '建实例', name: '认过线元素', body: `() => {
    const keep = activePlayer.player();
    const errsAt = window.__errs.length;
    const temp = document.createElement('video');
    temp.setAttribute('width', '800');
    document.body.appendChild(temp);
    keep._intersectionInfo_ = { target: keep, intersectionRatio: 0.5 };
    try {
      activePlayer.onIntersect([{ target: temp, intersectionRatio: 0.3 }]);
      if (activePlayer.player() !== keep) { throw new Error('可见比例 0.3 就切换了实例') }
      if (!temp._intersectionInfo_ || temp._intersectionInfo_.intersectionRatio !== 0.3) { throw new Error('没有把 entry 记到元素上') }
      activePlayer.onIntersect([{ target: temp, intersectionRatio: 0.9 }]);
      if (activePlayer.player() !== temp) { throw new Error('可见比例 0.9 没有切换实例') }
      activePlayer.onIntersect([{ target: keep, intersectionRatio: 0.5 }]);
      if (activePlayer.player() !== temp) { throw new Error('新实例比旧实例可见范围小，不该切换') }
      activePlayer.onIntersect([{ target: keep, intersectionRatio: 0.9 }, { target: temp, intersectionRatio: 0.6 }]);
      if (activePlayer.player() !== keep) { throw new Error('一轮回调里没有认比例最大的实例') }
      return '过线才切、小的不抢、一轮取最大'
    } finally {
      activePlayer.takeInstance(keep);
      delete temp._intersectionInfo_;
      delete keep._intersectionInfo_;
      const cached = mediaCore.mediaElementList.indexOf(temp);
      if (cached >= 0) { mediaCore.mediaElementList.splice(cached, 1) }
      temp.remove();
      const added = window.__errs.slice(errsAt);
      if (added.length) { throw new Error('视口切换产生异常：' + added.join(' | ')) }
    }
  }`
  },
  {
    group: '调倍速', name: '解锁后设倍速', body: `() => {
    ${TIP}
    tuner.unlockPlaybackRate();
    const suc = tuner.setSpeed(2.5);
    if (!suc) { throw new Error('setSpeed 未生效') }
    if (tuner.getSpeed() !== 2.5) { throw new Error('getSpeed=' + tuner.getSpeed()) }
    if (tuner.playbackRate !== 2.5) { throw new Error('类内状态=' + tuner.playbackRate) }
    if (activePlayer.player().playbackRate !== 2.5) { throw new Error('元素倍速=' + activePlayer.player().playbackRate) }
    if (tips() !== '播放速度：2.5') { throw new Error('提示为 ' + tips()) }
    return tips()
  }`
  },
  {
    group: '调倍速', name: '拒调速', body: `() => {
    tuner.lockPlaybackRate(1000);
    if (!tuner.lockedPlaybackRate()) { throw new Error('锁定状态未生效') }
    const before = tuner.getSpeed();
    const suc = tuner.setSpeed(8);
    if (suc !== false) { throw new Error('锁定期内竟然调速成功') }
    if (tuner.getSpeed() !== before) { throw new Error('倍速被改动：' + before + ' -> ' + tuner.getSpeed()) }
    tuner.unlockPlaybackRate();
    if (tuner.lockedPlaybackRate()) { throw new Error('解锁未生效') }
    return 'ok'
  }`
  },
  {
    group: '调倍速', name: '点菜单定速生效', body: `() => {
    const keep = tuner.getSpeed();
    tuner.unlockPlaybackRate();
    tuner.setSpeed(1.5, true);
    tuner.lockPlaybackRate(1000);
    if (!tuner.lockedPlaybackRate()) { throw new Error('样本状态没构造出来：应处于锁定期') }
    const presets = [];
    (function walk (nodes) {
      nodes.forEach(n => { if (Array.isArray(n.children)) { walk(n.children) } else if (/^(applyRate|setSpeed)$/.test(String(n.command)) && typeof n.args[0] === 'number') { presets.push(n) } });
    })(MenuControl.buildTree());
    if (presets.length !== 10) { throw new Error('菜单定值倍速不是 10 项：' + presets.length) }
    if (presets.some(n => n.command !== 'applyRate')) { throw new Error('定值倍速没有走统一调速走法：' + presets.map(n => n.command).filter((v, i, a) => a.indexOf(v) === i).join(',')) }
    presets.find(n => n.args[0] === 2).fn();
    if (Math.abs(tuner.getSpeed() - 2) > 0.001) { throw new Error('锁定期内菜单预设没生效：' + tuner.getSpeed()) }
    tuner.unlockPlaybackRate();
    tuner.setSpeed(keep, true);
    return '锁定期内预设 2x 生效，还原到 ' + tuner.getSpeed()
  }`
  },
  {
    group: '调倍速', name: '恢复默认速', body: `() => {
    tuner.unlockPlaybackRate();
    tuner.setSpeed(3);
    tuner.unlockPlaybackRate();
    tuner.resetSpeed();
    if (tuner.getSpeed() !== 1) { throw new Error('未回到 1 倍速：' + tuner.getSpeed()) }
    if (tuner.lastPlaybackRate !== 3) { throw new Error('上次倍速未记录：' + tuner.lastPlaybackRate) }
    return 'last=' + tuner.lastPlaybackRate
  }`
  },
  {
    group: '调倍速', name: '共用提示与收尾', body: `() => {
    ${TIP}
    const player = activePlayer.player();
    const keepPlus = mediaCore.mediaPlus;
    const keepFix = tuner.fixSpeed;
    const keepRate = tuner.getSpeed();
    const fixes = [];
    tuner.fixSpeed = old => { fixes.push(old) };
    const setDirect = on => {
      if (on) { mediaCore.mediaPlus = function () { return false }; activePlayer.enhancer = null } else { mediaCore.mediaPlus = keepPlus; delete player.playbackRate; activePlayer.enhancer = mediaCore.mediaPlus(player) }
    };
    const run = (...args) => { menu.tips('哨兵'); fixes.length = 0; tuner.unlockPlaybackRate(); return [tuner.setSpeed(...args), tips(), fixes.length] };
    const clearDup = () => { clearTimeout(tuner._setPlaybackRateDuplicate_); clearTimeout(tuner._setPlaybackRateDuplicate2_); tuner._setPlaybackRateDuplicate_ = tuner._setPlaybackRateDuplicate2_ = null };
    try {
      [[false, '增强API'], [true, '直写实例']].forEach(([direct, label]) => {
        setDirect(direct);
        clearDup();
        const [suc, tip, times] = run(2);
        if (suc !== true) { throw new Error(label + ' 这一路返回值不是 true：' + suc) }
        if (tip !== '播放速度：2') { throw new Error(label + ' 这一路提示为 ' + tip) }
        if (times !== 1) { throw new Error(label + ' 这一路音画修正跑了 ' + times + ' 次') }
        if (Boolean(tuner._setPlaybackRateDuplicate_) !== direct) { throw new Error(label + ' 这一路的重复触发设定与接管方式不符') }
        clearDup();
        tuner.setSpeed(1, true, true);
        const [suc1, tip1, times1] = run(null);
        if (suc1 !== true || times1 !== 1) { throw new Error(label + ' 重设当前值没走同一条收尾：' + suc1 + '/' + times1) }
        if (tip1 !== '哨兵') { throw new Error(label + ' 1倍速重设不该提示，实际：' + tip1) }
        if (tuner._setPlaybackRateDuplicate_) { throw new Error(label + ' 1倍速重设不该再挂重复触发的定时器') }
      });
      return '两条路径各一轮：返回值与提示一致、1倍速不提示、收尾与重复触发各归各'
    } finally {
      clearDup();
      tuner.fixSpeed = keepFix;
      setDirect(false);
      tuner.setSpeed(keepRate, true);
    }
  }`
  },
  {
    group: '调音量', name: '设音量', body: `() => {
    ${TIP}
    tuner.unlockVolume();
    tuner.setVolume(0.8);
    if (typeof tuner.volume !== 'number' || tuner.volume !== 0.8) { throw new Error('类内音量=' + tuner.volume + '（' + typeof tuner.volume + '，该是数字而不是 toFixed 的字符串）') }
    if (Number(activePlayer.player().volume) !== 0.8) { throw new Error('元素音量=' + activePlayer.player().volume) }
    if (tuner.getVolume() !== 0.8) { throw new Error('getVolume=' + tuner.getVolume()) }
    if (tips() !== '音量：80%') { throw new Error('提示为 ' + tips()) }
    tuner.unlockVolume();
    tuner.volumeUp(0.1);
    if (!tuner.lockedVolume()) { throw new Error('调音之后应短暂锁定，避免外部逻辑改回音量') }
    return 'volumeUp 后已锁定'
  }`
  },
  {
    group: '跳进度', name: '定位快进步进', body: `() => {
    ${TIP}
    const v = activePlayer.player();
    tuner.unlockCurrentTime();
    tuner.setCurrentTime(42);
    if (Math.abs(v.currentTime - 42) > 0.01) { throw new Error('currentTime=' + v.currentTime) }
    tuner.unlockCurrentTime();
    tuner.seekForward();
    if (Math.abs(v.currentTime - (42 + tuner.skipStep)) > 0.01) { throw new Error('快进后=' + v.currentTime) }
    if (!/前进：\\d+秒/.test(tips())) { throw new Error('提示为 ' + tips()) }
    tuner.unlockCurrentTime();
    const before = v.currentTime;
    tuner.freezeFrame(1);
    if (!(v.currentTime > before)) { throw new Error('逐帧未推进：' + before + ' -> ' + v.currentTime) }
    return tips()
  }`
  },
  {
    group: '调画面', name: '改 transform', body: `() => {
    ${TIP}
    const v = activePlayer.player();
    picture.scale = 1; picture.rotate = 0; picture.rotateX = 0; picture.rotateY = 0;
    picture.translate.x = 0; picture.translate.y = 0;
    picture.zoomIn(0.1);
    const scaleOf = t => { const m = /scale\\(([\\d.]+)\\)/.exec(t); return m ? Number(m[2]) : NaN };
    if (Math.abs(scaleOf(v.style.transform) - 1.1) > 1e-9) { throw new Error('transform=' + v.style.transform) }
    if (typeof picture.scale !== 'number') { throw new Error('缩放状态成了字符串：' + typeof picture.scale) }
    picture.setScale('1.5');
    if (picture.scale !== 1.5 || Math.abs(scaleOf(v.style.transform) - 1.5) > 1e-9) { throw new Error('字符串缩放值没被收成数字：' + picture.scale + ' / ' + v.style.transform) }
    picture.setScale('abc');
    if (picture.scale !== 1) { throw new Error('换算不出来的缩放值该退回 1，实际 ' + picture.scale) }
    picture.setScale(1);
    picture.setRotate();
    if (!/rotate\\(90deg\\)/.test(v.style.transform)) { throw new Error('transform=' + v.style.transform) }
    picture.setMirror(true);
    if (!/rotateX\\(180deg\\)/.test(v.style.transform)) { throw new Error('transform=' + v.style.transform) }
    picture.moveRight(20);
    if (!/translate\\(20px/.test(v.style.transform)) { throw new Error('transform=' + v.style.transform) }
    picture.resetTransform();
    if (!/scale\\(1\\.00\\)|scale\\(1\\)/.test(v.style.transform) || !/rotate\\(0deg\\)/.test(v.style.transform)) { throw new Error('复位失败：' + v.style.transform) }
    return v.style.transform
  }`
  },
  {
    group: '套滤镜', name: '按单位提示', body: `() => {
    ${TIP}
    const v = activePlayer.player();
    picture.resetPicture();
    picture.brightnessUp(0.1);
    if (!/brightness\\(1\\.1/.test(v.style.filter)) { throw new Error('filter=' + v.style.filter) }
    if (tips() !== '图像亮度：110%') { throw new Error('亮度提示为 ' + tips()) }
    picture.hueUp(10);
    if (!/hue-rotate\\(10deg\\)|hue-rotate\\(10\\./.test(v.style.filter)) { throw new Error('filter=' + v.style.filter) }
    if (tips() !== '图像色相：10°') { throw new Error('色相提示应为角度而不是百分比，实际为 ' + tips()) }
    picture.blurUp(2);
    if (!/blur\\(2/.test(v.style.filter)) { throw new Error('filter=' + v.style.filter) }
    if (tips() !== '图像模糊度：2px') { throw new Error('模糊提示应为像素，实际为 ' + tips()) }
    return [tips(), v.style.filter].join(' | ')
  }`
  },
  {
    group: '套滤镜', name: '复位图像', body: `() => {
    const v = activePlayer.player();
    picture.resetPicture();
    if (!/^brightness\\(1\\) contrast\\(1\\) saturate\\(1\\) hue-rotate\\(0deg\\) blur\\(0px\\)$/.test(v.style.filter)) { throw new Error('滤镜未复位：' + v.style.filter) }
    return v.style.filter
  }`
  },
  {
    group: '记进度', name: '记恢复进度', body: `async () => {
    ${SLEEP}
    const v = activePlayer.player();
    const keepMap = configManager.get('media.progress');
    const probeMap = {};
    probeMap[location.href + 123] = { progress: 66, duration: 123, t: 1 };
    configManager.setLocal('media.progress', probeMap);
    const 取回 = tuner.getProgress({ duration: 123, currentTime: 7 });
    configManager.setLocal('media.progress', keepMap === null ? {} : keepMap);
    if (取回 !== 66) { throw new Error('进度键不是 href+时长，按地址+时长查不到：取回 ' + 取回) }
    clearTimeout(activePlayer.player()._playProgressTimer_);
    configManager.setLocal('media.progress', {});
    const fake = { duration: 300, currentTime: 42.5, paused: false };
    tuner.recordProgress(fake);
    let written = null;
    for (let i = 0; i < 24 && !written; i++) {
      await sleep(250);
      const m = configManager.get('media.progress') || {};
      written = Object.keys(m).length ? m[Object.keys(m)[0]] : null;
    }
    clearTimeout(fake._playProgressTimer_);
    if (!written) { throw new Error('记录器 6 秒内没写出任何进度') }
    if (Object.keys(configManager.get('media.progress'))[0] !== progressKey(300)) { throw new Error('写入侧的进度键不是 href+时长：' + Object.keys(configManager.get('media.progress'))[0]) }
    if (written.progress !== 42.5 || written.duration !== 300) { throw new Error('记录的内容不对：' + JSON.stringify(written)) }
    if (tuner.getProgress({ duration: 300, currentTime: 7 }) !== 42.5) { throw new Error('按写入的键读不回写入的时间') }
    configManager.setLocal('media.progress', keepMap === null ? {} : keepMap);
    tuner.recordProgress(v);
    const allow = tuner.allowRestore();
    tuner.toggleRestore();
    if (tuner.allowRestore() === allow) { throw new Error('恢复进度开关未翻转') }
    tuner.toggleRestore();
    if (tuner.allowRestore() !== allow) { throw new Error('开关未能还原') }
    return '读写两侧的进度键一致 / allow=' + allow
  }`
  },
  {
    group: '按快捷键', name: '走响应器链路', body: `() => {
    const v = activePlayer.player();
    const mk = (keyCode, key, extra) => Object.assign({ keyCode, key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: v, composedPath: () => [v], preventDefault () {}, stopPropagation () {} }, extra || {});
    tuner.unlockPlaybackRate();
    tuner.setSpeed(1);
    tuner.unlockPlaybackRate();
    input.playerTrigger(v, mk(67, 'c'));
    if (Math.abs(tuner.getSpeed() - 1.1) > 0.001) { throw new Error('加速键未生效：' + tuner.getSpeed()) }
    tuner.unlockPlaybackRate();
    input.playerTrigger(v, mk(88, 'x'));
    if (Math.abs(tuner.getSpeed() - 1) > 0.001) { throw new Error('减速键未生效：' + tuner.getSpeed()) }
    input.playerTrigger(v, mk(13, 'Enter'));
    input.playerTrigger(v, mk(77, 'm'));
    if (picture.rotateY !== 180) { throw new Error('镜像键未生效：' + picture.rotateY) }
    picture.rotateY = 0;
    input.playerTrigger(v, mk(81, 'q'));
    picture.scale = 1;
    input.playerTrigger(v, mk(88, 'X', { shiftKey: true }));
    if (Number(picture.scale) >= 1) { throw new Error('shift+X 未缩小画面：' + picture.scale) }
    let defaulted = { stop: false, prevent: false };
    const wrap = e => Object.assign(e, { stopPropagation () { defaulted.stop = true }, preventDefault () { defaulted.prevent = true } });
    input.playerTrigger(v, wrap(mk(67, 'C', { shiftKey: true })));
    if (!defaulted.stop || !defaulted.prevent) { throw new Error('命中配置的按键应该吞掉默认事件') }
    defaulted = { stop: false, prevent: false };
    if (input.playerTrigger(v, wrap(mk(112, 'F1')))) { throw new Error('F1 没绑定动作却被打发') }
    if (defaulted.stop || defaulted.prevent) { throw new Error('没绑定动作的按键不该被吞掉默认事件') }
    picture.scale = 1;
    picture.setTransform(true);
    const seen = [];
    const spies = [['seekForward', tuner], ['seekBack', tuner], ['volumeUp', tuner], ['volumeDown', tuner]];
    const orig = spies.map(([k, ctl]) => [ctl, k, ctl[k]]);
    tuner.seekForward = a => { seen.push('seek+' + a) };
    tuner.seekBack = a => { seen.push('seek' + a) };
    tuner.volumeUp = a => { seen.push('vol+' + a) };
    tuner.volumeDown = a => { seen.push('vol' + a) };
    try {
      input.playerTrigger(v, mk(39, 'ArrowRight', { ctrlKey: true }));
      input.playerTrigger(v, mk(37, 'ArrowLeft', { ctrlKey: true }));
      input.playerTrigger(v, mk(38, 'ArrowUp', { ctrlKey: true }));
      input.playerTrigger(v, mk(40, 'ArrowDown', { ctrlKey: true }));
    } finally {
      orig.forEach(([ctl, k, fn]) => { ctl[k] = fn });
    }
    const step = tuner.skipStep * 6;
    const want = ['seek+' + step, 'seek-' + step, 'vol+0.2', 'vol-0.2'].join(',');
    if (seen.join(',') !== want) { throw new Error('ctrl+方向键步进不对：' + seen.join(',') + ' != ' + want) }
    const keepHotkeys = configManager.get('hotkeys');
    const rebound = keepHotkeys.map(h => h.command === 'speedUp'
      ? Object.assign({}, h, { command: 'volumeUp', args: 0.03 }) : h);
    const hits = [];
    const keepUp = [tuner.speedUp, tuner.volumeUp];
    tuner.speedUp = () => { hits.push('rate') };
    tuner.volumeUp = a => { hits.push('vol' + a) };
    configManager.setLocal('hotkeys', rebound);
    try {
      input.playerTrigger(v, mk(67, 'c'));
      configManager.setLocal('hotkeys', keepHotkeys);
      input.playerTrigger(v, mk(67, 'c'));
    } finally {
      tuner.speedUp = keepUp[0];
      tuner.volumeUp = keepUp[1];
      configManager.setLocal('hotkeys', keepHotkeys);
    }
    if (hits.join(',') !== 'vol0.03,rate') { throw new Error('改绑定后兜底派发没跟着变：' + hits.join(',')) }
    if (!InputControl.isRegistered({ keyCode: 39, key: 'ArrowRight' })) { throw new Error('方向键不在按键索引里') }
    if (InputControl.isRegistered({ keyCode: 112, key: 'F1' })) { throw new Error('F1 不该命中按键索引') }
    const firstIndex = input.keyIndex();
    if (input.keyIndex() !== firstIndex) { throw new Error('按键索引每次都重建，热路径白算') }
    configManager.setLocal('hotkeys', keepHotkeys);
    if (input.keyIndex() === firstIndex) { throw new Error('改了配置，按键索引仍是旧的') }
    return 'ok'
  }`
  },
  {
    group: '按快捷键', name: '先就绪再监听', body: `() => {
    const runner = input.hotkeysRunner;
    if (!runner) { throw new Error('按键引擎还没创建') }
    if (!(runner.modState instanceof original.Map)) { throw new Error('组合键状态字段类型不对') }
    const down = new Event('keydown', { bubbles: true });
    down.code = 'ShiftLeft'; down.key = 'Shift';
    window.dispatchEvent(down);
    const armed = runner.heldMods().size;
    window.dispatchEvent(new Event('blur'));
    const cleared = runner.heldMods().size;
    if (!armed) { throw new Error('修饰键按下没被记到：状态多半在监听绑定之后才初始化') }
    if (cleared) { throw new Error('窗口失焦后组合键状态未清空') }
    return '修饰键监视与引擎同生命周期'
  }`
  },
  {
    group: '按快捷键', name: '经 runCommand 派发', body: `() => {
    const runner = input.hotkeysRunner;
    if (!runner) { throw new Error('按键引擎还没创建') }
    const conf = configManager.get('hotkeys').find(c => c.command && !c.key.includes('+') && !c.sequence);
    if (!conf) { throw new Error('配置里找不到一个不带修饰键的单项绑定') }
    const errs = window.__errs.length;
    const event = new KeyboardEvent('keydown', { key: conf.key, code: conf.key, bubbles: true, cancelable: true });
    const matched = runner.run({ event, stopPropagation: true, preventDefault: true });
    if (!matched) { throw new Error('按键 ' + conf.key + ' 没有匹配到配置') }
    const added = window.__errs.slice(errs);
    if (added.length) { throw new Error('匹配成功却抛了：' + added.join(' | ')) }
    return conf.key + ' → ' + conf.command
  }`
  },
  {
    group: '按快捷键', name: '脱接收者调用', body: `() => {
    const v = activePlayer.player();
    const ev = { type: 'keydown', keyCode: 67, key: 'c', ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: v, composedPath: () => [v], preventDefault () {}, stopPropagation () {} };
    const before = tuner.getSpeed();
    input.keydownEvent.call(document, ev);
    input.keydownEvent.call(undefined, ev);
    if (typeof tuner.getSpeed() !== 'number') { throw new Error('倍速状态异常') }
    return 'before=' + before + ' after=' + tuner.getSpeed()
  }`
  },
  {
    group: '控播放', name: '双向切播放', body: `async () => {
    ${SLEEP}
    ${TIP}
    const v = activePlayer.player();
    const api = activePlayer.enhancer;
    const hasApply = !!(api && api.applyPlay && api.applyPause);
    const errsAt = window.__errs.length;
    let playCalls = 0, pauseCalls = 0;
    const keepOrigin = { play: mediaCore.originMethods.play, pause: mediaCore.originMethods.pause };
    const keepInst = { play: v.play, pause: v.pause };
    mediaCore.originMethods.play = function () { playCalls++; return keepOrigin.play.apply(this, arguments) };
    mediaCore.originMethods.pause = function () { pauseCalls++; return keepOrigin.pause.apply(this, arguments) };
    v.play = function () { playCalls++; return keepInst.play.apply(this, arguments) };
    v.pause = function () { pauseCalls++; return keepInst.pause.apply(this, arguments) };
    const clean = () => { api && (api.unlockPlay(), api.unlockPause(), api.unlockCurrentTime()) };
    const keepPaused = Object.getOwnPropertyDescriptor(v, 'paused');
    const setPaused = val => Object.defineProperty(v, 'paused', { configurable: true, value: val });
    const step = async (fromPause) => {
      clean();
      setPaused(fromPause);
      const before = { play: playCalls, pause: pauseCalls };
      activePlayer.switchPlay();
      await sleep(80);
      clean();
      return { tip: tips() || '', played: playCalls > before.play, paused: pauseCalls > before.pause }
    };
    try {
      const play = await step(true);
      if (!/播放/.test(play.tip)) { throw new Error('切到播放时的提示是：' + play.tip) }
      if (!play.played) { throw new Error('switchPlay 没有把播放动作发到实例上') }
      const pause = await step(false);
      if (!/暂停/.test(pause.tip)) { throw new Error('切到暂停时的提示是：' + pause.tip) }
      if (!pause.paused) { throw new Error('switchPlay 没有把暂停动作发到实例上') }
      let extra = '无增强API，只走直连实例';
      if (api) {
        const keep = { applyPlay: api.applyPlay, applyPause: api.applyPause };
        api.applyPlay = api.applyPause = undefined;
        try {
          const back = await step(true);
          if (!/播放/.test(back.tip) || !back.played) { throw new Error('退回直接操作实例后没能把播放动作发到实例上，提示=' + back.tip) }
        } finally {
          Object.assign(api, keep);
        }
        extra = '回退分支同样可用';
      }
      const added = window.__errs.slice(errsAt);
      if (added.length) { throw new Error('播放状态切换产生异常：' + added.join(' | ')) }
      return '提示「' + play.tip + '」/「' + pause.tip + '」，默认走 ' + (hasApply ? 'apply 系列' : '直连实例') + '，' + extra
    } finally {
      Object.assign(mediaCore.originMethods, keepOrigin);
      Object.assign(v, keepInst);
      if (keepPaused) { Object.defineProperty(v, 'paused', keepPaused) } else { delete v.paused }
    }
  }`
  },
  {
    group: '控播放', name: '只认方法名键', body: `async () => {
    ${SLEEP}
    const v = activePlayer.player();
    const errsAt = window.__errs.length;
    let calls = 0;
    v.play = function () { calls++; return Promise.resolve() };
    delete v.origin_play; delete v._hangUp_; delete v._unHangUp_; delete v._hangUpInfo_;
    activePlayer.proxyPlay(v);
    try {
      v._hangUp_('play', 500);
      if (v.play() !== false || calls !== 0) { throw new Error('挂起期间本次 play 本该被忽略，实际调了 ' + calls + ' 次') }
      v._unHangUp_('play');
      await v.play();
      if (calls !== 1) { throw new Error('放开后 play 没走到实现：' + calls) }
      delete v._hangUpInfo_.play;
      v._hangUpInfo_.hangUp_play = { timeout: Date.now() + 500 };
      await v.play();
      if (calls !== 2) { throw new Error('旧键位拼法仍在生效：' + calls) }
      delete v._hangUpInfo_.hangUp_play;
      const keepPlus = mediaCore.mediaPlus;
      mediaCore.mediaPlus = function () { return false };
      activePlayer.enhancer = null;
      try {
        v.pause();
        activePlayer.switchPlay();
        const info = v._hangUpInfo_;
        if (!(info.pause && info.pause.timeout >= Date.now())) { throw new Error('切到播放时本该挂起 pause') }
        if (info.play && info.play.timeout >= Date.now()) { throw new Error('本次要执行的 play 不该被挂起') }
      } finally { mediaCore.mediaPlus = keepPlus; activePlayer.enhancer = keepPlus(v) }
      const added = window.__errs.slice(errsAt);
      if (added.length) { throw new Error('挂起链路产生异常：' + added.join(' | ')) }
      return '挂起生效 / 放开即恢复 / 旧拼法无效 / 切换只挂相反方向'
    } finally { delete v.play; delete v.origin_play; delete v._hangUp_; delete v._unHangUp_; delete v._hangUpInfo_ }
  }`
  },
  {
    group: '出日志', name: '走统一日志出口', body: `() => {
    ${SLEEP}
    const logs = [];
    const keepLog = console.log;
    console.log = (...a) => { logs.push(a.map(x => (x && x.message) || String(x)).join(' ')) };
    try {
      console.log('[Boot] 直出验证', 1);
      if (!logs.some(s => s.includes('[Boot] 直出验证'))) { throw new Error('console.log 直出没生效：' + JSON.stringify(logs)) }
    } finally {
      console.log = keepLog;
    }
    return '日志不经包装直出 console.log，命中 1 条'
  }`
  },
  {
    group: '解属性', name: '锁死属性仍可控', body: `() => {
    const v = activePlayer.player();
    Object.defineProperty(v, 'playbackRate', { value: 1, configurable: false, writable: false });
    if (Object.getOwnPropertyDescriptor(v, 'playbackRate')) { throw new Error('属性锁没有被挪开，站点仍可控住倍速') }
    if (!Object.getOwnPropertyDescriptor(v, 'playbackRate_hack')) { throw new Error('未落到 playbackRate_hack，改动丢失') }
    tuner.unlockPlaybackRate();
    tuner.setSpeed(2);
    if (Number(v.playbackRate) !== 2) { throw new Error('倍速改不动：' + v.playbackRate) }
    Object.defineProperty(v, 'onplay', { value: function () {}, configurable: false });
    const onplay = Object.getOwnPropertyDescriptor(v, 'onplay');
    if (onplay && onplay.configurable !== true) { throw new Error('on* 属性未改为可配置') }
    return '属性锁已解除'
  }`
  },
  {
    group: '解属性', name: '代理不抛错', body: `() => {
    const v = activePlayer.player();
    const errsAt = window.__errs.length;
    Object.defineProperty(v, '__probe', { value: 7, configurable: true, writable: true });
    if (v.__probe !== 7) { throw new Error('defineProperty 代理后没能把属性写上') }
    Object.defineProperties(v, { __probe2: { value: 8, configurable: true, writable: true } });
    if (v.__probe2 !== 8) { throw new Error('defineProperties 代理后没能把属性写上') }
    const added = window.__errs.slice(errsAt);
    if (added.length) { throw new Error('defineProperty 代理链路产生异常：' + added.join(' | ')) }
    return '__probe=' + v.__probe + ', __probe2=' + v.__probe2
  }`
  },
  {
    group: '解属性', name: '出错不打断', body: `() => {
    const frozen = Object.freeze({ a: 1 });
    let threw = false;
    try {
      Object.defineProperty(frozen, 'b', { value: 2 });
    } catch (e) { threw = true }
    if (threw) { throw new Error('被冻结对象上定义属性仍然抛出，会打断宿主页面') }
    return '异常已吞掉并记录'
  }`
  },
  {
    group: '开菜单', name: '唤出多级菜单', body: `async () => {
    ${SLEEP}
    ${TIP}
    const v = document.getElementById('v');
    const r = v.getBoundingClientRect();
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: r.left + 40 });
    Object.defineProperty(ev, 'clientY', { value: r.top + 40 });
    Object.defineProperty(ev, 'button', { value: 2 });
    v.dispatchEvent(ev);
    if (!menu.isOpen) { throw new Error('右键菜单未弹出') }
    const sh = menu.shadow;
    const txt = n => (n.textContent || '').replace(/\\s+/g, ' ').trim();
    const items = () => Array.from(sh.querySelectorAll('.r6pcm-item'));
    const top = items().map(txt);
    ['播放控制', '倍速', '音量', '画面', '滤镜', '下载与进度', '快捷键', '设置', '关于'].forEach(k => {
      if (!top.some(t => t.includes(k))) { throw new Error('缺少一级分类：' + k + '，实际 ' + JSON.stringify(top)) }
    });
    const hover = el => el.dispatchEvent(new Event('mouseenter', { bubbles: true }));
    hover(items().find(n => txt(n).includes('滤镜')));
    const sub = items().map(txt);
    if (!sub.some(t => t.includes('增加亮度'))) { throw new Error('子菜单未展开：' + JSON.stringify(sub.slice(-6))) }
    picture.resetPicture();
    const before = Number(picture.filter.key[0]);
    items().find(n => txt(n).includes('增加亮度')).dispatchEvent(new Event('click', { bubbles: true }));
    await sleep(150);
    if (Number(picture.filter.key[0]) <= before) { throw new Error('菜单点击未触发滤镜调整：' + before + ' -> ' + picture.filter.key[0]) }
    if (menu.isOpen) { throw new Error('执行动作后菜单未收起') }
    return '一级 ' + top.length + ' 项，点击后 key[0]=' + picture.filter.key[0]
  }`
  },
  {
    group: '用工具', name: '共用标题清洗', body: `() => {
    const v = activePlayer.player();
    const wrap = document.createElement('div');
    const safe = Utils.setTitle(v, wrap, 'a/b:c*d?e"f<g|h');
    if (safe !== 'a-b-c-d-e-f-g-h') { throw new Error('非法字符没清干净：' + safe) }
    if (wrap.getAttribute('data-title') !== safe || v.getAttribute('data-title') !== safe) { throw new Error('标题没同时写到容器与播放器') }
    const list = activePlayer.listPlayers();
    let touched = 0;
    mediaCore.eachOther(v, () => { touched++ });
    if (touched) { throw new Error('eachOther 把当前实例也算进去了') }
    mediaCore.eachOther(null, () => { touched++ });
    if (touched !== list.length) { throw new Error('跨实例同步漏了实例：' + touched + '/' + list.length) }
    return '清洗 ' + safe + ' / 同步 ' + touched + ' 个实例'
  }`
  },
  {
    group: '用工具', name: '只做一处前置', body: `() => {
    const rev = configManager.revision;
    if (configManager.setLocal('media.volume', 0.5) !== true) { throw new Error('本站层写入失败') }
    if (configManager.revision <= rev) { throw new Error('写入没有推进配置版本号') }
    if (configManager.setLocal('media.volume', null) !== false) { throw new Error('非法值本该拒绝写入') }
    if (configManager.revision !== configManager.revision) { throw new Error('版本号不该倒退') }
    const rev2 = configManager.revision;
    if (configManager.set('media.volume', 0.7) !== true) { throw new Error('set 转发到存储层失败') }
    if (configManager.revision === rev2) { throw new Error('set 没有推进版本号，派生缓存会读到旧值') }
    if (Number(configManager.get('media.volume')) !== 0.7) { throw new Error('合并读取没拿到最新值') }
    return '写入 ' + configManager.revision + ' 版'
  }`
  },
  {
    group: '用工具', name: '共用层描述', body: `() => {
    if (configManager.setLocal('media.volume', 0.31) !== true) { throw new Error('本站层写入失败') }
    if (Number(configManager.listLocal()['media.volume']) !== 0.31) { throw new Error('本站层列出的是 ' + configManager.listLocal()['media.volume']) }
    if (configManager.setGlobal('media.volume', 0.66) !== true) { throw new Error('全局层写入失败') }
    if (Number(configManager.listGlobal()['media.volume']) !== 0.66) { throw new Error('全局层列出的是 ' + configManager.listGlobal()['media.volume']) }
    configManager.setLocal('blacklist.domains', ['a.test']);
    const domains = configManager.getLocal('blacklist.domains');
    if (!Array.isArray(domains) || domains[0] !== 'a.test') { throw new Error('本地层序列化没还原：' + JSON.stringify(domains)) }
    const keepListValues = window.GM_listValues;
    const keepDelete = window.GM_deleteValue;
    window.GM_listValues = undefined;
    try {
      if (configManager.setGlobal('media.volume', 0.42) !== true) { throw new Error('全局层不可用时没退到本站层') }
      if (Number(configManager.getLocal('media.volume')) !== 0.42) { throw new Error('回落写的不是本站层') }
      if (Object.keys(configManager.listGlobal()).length) { throw new Error('全局层不可用时该列空') }
    } finally { window.GM_listValues = keepListValues }
    const localRemoved = [];
    const keepRemove = rawLocalStorage.removeItem;
    rawLocalStorage.removeItem = key => { localRemoved.push(key) };
    try { configManager.clearLocal() } finally { rawLocalStorage.removeItem = keepRemove }
    const prefix = configManager.opts.prefix;
    if (!localRemoved.length) { throw new Error('本站层什么都没清') }
    if (localRemoved.some(key => !key.startsWith(prefix))) { throw new Error('清掉了别人的键：' + localRemoved) }
    const globalRemoved = [];
    window.GM_deleteValue = key => { globalRemoved.push(key) };
    try { configManager.clearGlobal() } finally { window.GM_deleteValue = keepDelete }
    if (globalRemoved.some(key => !key.startsWith(prefix))) { throw new Error('全局层清掉了别人的键：' + globalRemoved) }
    return '本地清 ' + localRemoved.length + ' 键 / 全局清 ' + globalRemoved.length + ' 键'
  }`
  },
  {
    group: '用工具', name: '叠外部配置', body: `() => {
    const gate = 'enhance.allowExternalCustomConfiguration';
    const keep = configManager.get('enhance.allowExperimentFeatures');
    const rev = configManager.revision;
    configManager.setGlobal(gate, false);
    if (configManager.mergeExternal({ customConfiguration: { enhance: { allowExperimentFeatures: true } } }) !== false) { throw new Error('开关关闭时外部配置本该被忽略') }
    configManager.setGlobal(gate, true);
    if (configManager.mergeExternal({ customConfiguration: { enhance: { allowExperimentFeatures: !keep } }, customTaskControlCenter: { 'inject.probe': { fullScreen: '.probe-fs' } } }) !== true) { throw new Error('开关打开时外部配置没生效') }
    if (configManager.get('enhance.allowExperimentFeatures') !== !keep) { throw new Error('注入的配置没叠到默认值之上') }
    if (!configManager.hasExternal) { throw new Error('生效标记没写上') }
    if (configManager.revision <= rev) { throw new Error('注入配置没推进版本号') }
    if (!taskCenter.conf['inject.probe'] || taskCenter.conf['inject.probe'].fullScreen !== '.probe-fs') { throw new Error('注入的站点任务没同步进任务中心') }
    Utils.setPath(configManager.opts.config, 'enhance.allowExperimentFeatures', keep);
    configManager.setGlobal(gate, false);
    return '外部注入：配置与任务表各叠一层'
  }`
  },
  {
    group: '按快捷键', name: '只认画中画状态', body: `() => {
    const keepTabId = tabIdentity.id;
    let pipInfo = null;
    let reads = 0;
    pageBridge.get = name => { reads++; return name === 'globalPictureInPictureInfo' ? pipInfo : undefined };
    const keyEvent = key => {
      const e = { key, code: String(key).toUpperCase(), keyCode: String(key).toUpperCase().charCodeAt(0), target: { nodeName: 'BODY', getAttribute: () => null }, stopPropagation () { e.stopped = true }, preventDefault () { e.prevented = true } };
      return e
    };
    const 让出 = event => pageBridge.yieldKeys(event) === true;
    try {
      tabIdentity.id = 'this-tab';
      pipInfo = { tabId: 'other-tab', updateTime: Date.now(), data: { usePictureInPicture: true } };
      const hit = keyEvent('m');
      if (!让出(hit) || !hit.stopped || !hit.prevented) { throw new Error('他标签正在用画中画，注册键本该让出并拦住本窗口') }
      if (让出(keyEvent('/'))) { throw new Error('未注册的键不该被让出') }
      const reserved = keyEvent('d');
      reserved.ctrlKey = reserved.shiftKey = reserved.altKey = true;
      if (让出(reserved)) { throw new Error('保留键不该被让出') }
      pipInfo.tabId = 'this-tab';
      if (让出(keyEvent('m'))) { throw new Error('本标签自己的画中画不该让出按键') }
      pipInfo = { tabId: 'other-tab', updateTime: Date.now() - 1000 * 60, data: { usePictureInPicture: true } };
      if (让出(keyEvent('m'))) { throw new Error('画中画信息早过期了，不该让出按键') }
      pipInfo = null;
      if (让出(keyEvent('m'))) { throw new Error('没有画中画信息时既不该让出，也不该踩空') }
      reads = 0;
      让出(keyEvent('m'));
      if (reads !== 1) { throw new Error('画中画未开启时多读了跨Tab存储：' + reads + ' 次') }
      return '让出 1 例 / 不让出 5 例一致，未开画中画时每个按键只读一次存储'
    } finally { delete pageBridge.get; tabIdentity.id = keepTabId }
  }`
  },
  {
    group: '按快捷键', name: '共用按键解析', body: `() => {
    const mod = HotkeysRunner.platformMod();
    const runner = new HotkeysRunner([]);
    const index = input.keyIndex();
    const taken = {};
    let single = 0;
    let sequence = 0;
    configManager.get('hotkeys').forEach(conf => {
      if (!conf.key || conf.disabled) { return }
      const bindings = HotkeysRunner.parseKeys(conf.key, mod);
      if (bindings.length > 1) { sequence++; return }
      single++;
      const sig = InputControl.signature(bindings[0][0], bindings[0][1]);
      const hit = index.get(sig);
      if (!hit) { throw new Error('配置项没进兜底索引：' + conf.key + ' → ' + sig) }
      if (!taken[sig]) { taken[sig] = hit.command }
      if (hit.command !== taken[sig]) { throw new Error('索引里同一条签名对应了两条配置：' + sig) }
      const press = bindings[0];
      const event = { key: press[1], code: press[1].toUpperCase(), modsMap: new original.Map(press[0].map(name => [name, true])) };
      if (!runner.isMatch(event, press)) { throw new Error('引擎不认自己解析出来的按键：' + conf.key) }
      const probe = { key: press[1], code: press[1].toUpperCase(), ctrlKey: press[0].includes('ctrl'), altKey: press[0].includes('alt'), metaKey: press[0].includes('meta'), shiftKey: press[0].includes('shift') };
      if (!input.findBinding(probe)) { throw new Error('事件侧签名没命中索引：' + conf.key) }
    });
    if (!single) { throw new Error('没有可比对的配置项') }
    const synthetic = (() => {
      const keepGet = configManager.get;
      const keepRevision = configManager.revision;
      const keepIdx = input._keyIndex_;
      const keepVer = input._indexRevision_;
      try {
        configManager.get = () => [{ key: 'space c', command: 'togglePlay' }, { key: '$mod+K', command: 'noop' }];
        configManager.revision = keepRevision + 1;
        input._indexRevision_ = -1;
        return input.keyIndex();
      } finally { configManager.get = keepGet; configManager.revision = keepRevision; input._keyIndex_ = keepIdx; input._indexRevision_ = keepVer }
    })();
    if (synthetic.has('space')) { throw new Error('多段序列的第一段漏进了兜底索引') }
    if (!synthetic.has('ctrl+k') && !synthetic.has('meta+k')) { throw new Error('$mod 没展开进索引：' + [...synthetic.keys()]) }
    const expanded = HotkeysRunner.parseKeys('$mod+Shift+C', mod)[0];
    if (expanded[1] !== 'c' || expanded[0].indexOf(mod) < 0 || expanded[0].indexOf('shift') < 0) { throw new Error('$mod 没展开：' + JSON.stringify(expanded)) }
    return '单段 ' + single + ' 条 / 多段 ' + sequence + ' 条解析一致'
  }`
  },
  {
    group: '控播放', name: '无实例不抛错', body: `() => {
    const keepPlayer = activePlayer.player;
    const keepPip = window._isPictureInPicture_;
    activePlayer.player = () => null;
    window._isPictureInPicture_ = null;
    let threw = null;
    try { activePlayer.togglePicture() } catch (e) { threw = e } finally {
      activePlayer.player = keepPlayer;
      window._isPictureInPicture_ = keepPip;
    }
    if (threw) { throw new Error('没有实例时切换画中画抛了：' + threw.message) }
    return '无实例时静默返回'
  }`
  },
  {
    group: '套滤镜', name: '回缺省表', body: `() => {
    picture.brightnessUp();
    picture.contrastDown();
    picture.hueDown();
    picture.filter.key.forEach((val, i) => { if (typeof val !== 'number' || Number.isNaN(val)) { throw new Error('第' + i + '组取值成了 ' + typeof val) } });
    if (picture.filter.key[0] <= filterDefs[0].base) { throw new Error('亮度没升上去：' + picture.filter.key[0]) }
    if (picture.filter.key[1] >= filterDefs[1].base) { throw new Error('对比度没降下来：' + picture.filter.key[1]) }
    if (picture.filter.key[3] >= 0) { throw new Error('色相本该允许取负：' + picture.filter.key[3]) }
    picture.filter.reset();
    const want = filterDefs.map(def => def.base).join(',');
    if (picture.filter.key.join(',') !== want) { throw new Error('复位没回到缺省表：' + picture.filter.key.join(',')) }
    return '复位回到 ' + want
  }`
  },
  {
    group: '套滤镜', name: '按表派发步进', body: `() => {
    const names = ['brightness', 'contrast', 'saturation', 'hue', 'blur'].flatMap(name => [name, name + 'Up', name + 'Down']);
    const missing = names.filter(name => typeof hotkeyCommands[name] !== 'function');
    if (missing.length) { throw new Error('派发表里少了滤镜动作：' + missing.join(',')) }
    picture.filter.reset();
    if (!runCommand('hueDown')) { throw new Error('hueDown 派发失败') }
    if (picture.filter.key[3] !== -1) { throw new Error('色相缺省步进不是 -1：' + picture.filter.key[3]) }
    runCommand('blurUp', [3]);
    if (picture.filter.key[4] !== 3) { throw new Error('按给定步进入上没生效：' + picture.filter.key[4]) }
    runCommand('brightness', [0.8]);
    if (picture.filter.key[0] !== 1.8) { throw new Error('定值步进没落位（应为 1 + 0.8）：' + picture.filter.key[0]) }
    runCommand('contrastDown');
    if (picture.filter.key[1] !== 0.9) { throw new Error('对比度缺省步进不是 -0.1：' + picture.filter.key[1]) }
    picture.filter.reset();
    return names.length + ' 个动作可派发'
  }`
  },
  {
    group: '开菜单', name: '按分组表渲染', body: `() => {
    const keys = menuGroups.reduce((all, g) => all.concat(g), []);
    const missing = keys.filter(key => !globalFunctional[key]);
    if (missing.length) { throw new Error('分组表里有不存在的项：' + missing.join(',')) }
    const items = menuItems();
    const dividers = items.filter(n => n.divider).length;
    if (dividers !== menuGroups.length - 1) { throw new Error('分隔线该有 ' + (menuGroups.length - 1) + ' 条，实际 ' + dividers) }
    const rows = items.filter(n => !n.divider);
    if (rows.length !== keys.length) { throw new Error('有分组项没进菜单：' + rows.length + ' vs ' + keys.length) }
    const bad = [];
    rows.forEach((node, i) => {
      const title = node.title instanceof Function ? node.title() : node.title;
      if (node !== globalFunctional[keys[i]]) { bad.push('第' + (i + 1) + '项不是 ' + keys[i]) }
      if (!(node.fn instanceof Function)) { bad.push(keys[i] + ' 没有动作') }
      if (typeof title !== 'string' || !title) { bad.push(keys[i] + ' 标题渲染不出来') }
    });
    if (bad.length) { throw new Error(bad.join(' | ')) }
    return rows.length + ' 项 / ' + menuGroups.length + ' 组'
  }`
  },
  {
    group: '下资源', name: '无确认直行与状态回收', body: `async () => {
    ${SLEEP}
    const el = { src: 'https://download.test/clip.mp4', duration: 60, getAttribute: () => '测试片段', paused: true };
    const keep = { confirm: original.confirm, prompt: original.prompt };
    const asked = [];
    original.confirm = t => { asked.push('confirm:' + t); return true };
    original.prompt = t => { asked.push('prompt:' + t); return null };
    const keepDl = { fetch: window.fetch, saveFile: activePlayer.saveFile, create: window.URL.createObjectURL, revoke: window.URL.revokeObjectURL };
    const saved = [];
    let objectUrlOk = true;
    activePlayer.saveFile = (u, t) => saved.push(u + '|' + t);
    window.URL.createObjectURL = b => { if (!objectUrlOk) { throw new TypeError('Overload resolution failed') } return 'blob:fake' };
    window.URL.revokeObjectURL = () => {};
    window.fetch = () => new Promise(() => {});
    try {
      downloadState.delete(el.src);
      if (PlayerControl.downloadMedia(el, '甲') === false) { throw new Error('首次下载不该被拦') }
      if (asked.length) { throw new Error('下载不再弹任何确认/命名框：' + asked.join(',')) }
      if (!(downloadState.get(el.src) || {}).downloading) { throw new Error('下载中的状态没登记') }
      downloadState.set(el.src, { downloading: Date.now() });
      asked.length = 0;
      if (PlayerControl.downloadMedia(el, '甲') !== false) { throw new Error('1 秒内的重复触发本该直接忽略') }
      if (asked.length) { throw new Error('刚点过不该再弹框：' + asked.join(',')) }
      downloadState.set(el.src, { downloading: Date.now() - 1500, hasDownload: true });
      asked.length = 0; saved.length = 0;
      if (PlayerControl.downloadMedia(el, '甲') === false) { throw new Error('重复下载不再拦截，本该直行') }
      if (asked.length) { throw new Error('重复下载不该弹确认：' + asked.join(',')) }
      const mkMedia = (kind, url) => {
        const el = document.createElement(kind);
        Object.defineProperty(el, 'src', { value: '', configurable: true });
        Object.defineProperty(el, 'currentSrc', { value: url, configurable: true });
        Object.defineProperty(el, 'duration', { value: 30, configurable: true });
        el.setAttribute('data-title', '短片');
        return el
      };
      const url2 = 'https://download.test/short.mp4';
      const url3 = 'https://download.test/short.aac';
      downloadState.delete(url2); downloadState.delete(url3);
      const errsAt = window.__errs.length;
      try {
        let done;
        const gate = new Promise(r => { done = r });
        window.fetch = () => Promise.resolve({ blob: () => gate });
        if (PlayerControl.downloadMedia(mkMedia('video', url2)) === false) { throw new Error('短视频本该进入 fetch 下载') }
        const during = downloadState.get(url2) || {};
        if (!(during.downloading > 0) || during.hasDownload) { throw new Error('下载中的状态没登记：' + JSON.stringify(during)) }
        done({ type: 'video/mp4' });
        await sleep(20);
        const after = downloadState.get(url2) || {};
        if (after.hasDownload !== true || after.downloading) { throw new Error('fetch 成功后状态没落回：' + JSON.stringify(after)) }
        if (saved.join() !== 'blob:fake|短片_video.mp4') { throw new Error('成功分支没走 saveFile 或文件名不对：' + saved.join()) }
        downloadState.delete(url2); saved.length = 0;
        window.fetch = () => Promise.reject(new Error('沙箱内不允许真实网络请求'));
        PlayerControl.downloadMedia(mkMedia('audio', url3));
        await sleep(20);
        const fell = downloadState.get(url3) || {};
        if (fell.hasDownload !== true || fell.downloading) { throw new Error('兜底分支状态没收干净：' + JSON.stringify(fell)) }
        if (saved.join() !== url3 + '|短片_audio.mp3') { throw new Error('兜底分支该直接下原地址、按音频命名：' + saved.join()) }
        downloadState.delete(url3); saved.length = 0;
        objectUrlOk = false;
        window.fetch = () => Promise.resolve({ blob: () => Promise.resolve({ type: 'video/mp4' }) });
        PlayerControl.downloadMedia(mkMedia('video', url2));
        await sleep(30);
        const broke = downloadState.get(url2) || {};
        if (broke.hasDownload !== true || broke.downloading) { throw new Error('blob 处理失败后状态没收干净：' + JSON.stringify(broke)) }
        if (saved.join() !== url2 + '|短片_video.mp4') { throw new Error('blob 处理失败该退回原地址：' + saved.join()) }
        const added = window.__errs.slice(errsAt);
        if (added.length) { throw new Error('blob 处理失败成了未捕获拒绝：' + added.join(' | ')) }
      } finally {
        window.fetch = keepDl.fetch; activePlayer.saveFile = keepDl.saveFile;
        window.URL.createObjectURL = keepDl.create; window.URL.revokeObjectURL = keepDl.revoke;
        downloadState.delete(url2); downloadState.delete(url3);
      }
      downloadState.delete(el.src);
    } finally {
      original.confirm = keep.confirm; original.prompt = keep.prompt;
      window.fetch = keepDl.fetch; activePlayer.saveFile = keepDl.saveFile;
      window.URL.createObjectURL = keepDl.create; window.URL.revokeObjectURL = keepDl.revoke;
    }
    return '无确认直行 + fetch 成功/失败/blob 处理失败三条状态回收'
  }`
  },
  {
    group: '开菜单', name: '共用派发出口', body: `() => {
    const leaves = [];
    (function walk (nodes) {
      nodes.forEach(n => { if (Array.isArray(n.children)) { walk(n.children) } else if (n.command) { leaves.push(n) } });
    })(MenuControl.buildTree());
    if (leaves.length < 40) { throw new Error('只收集到 ' + leaves.length + ' 个菜单动作，树解析得不对') }
    const configured = {};
    (configManager.get('hotkeys') || []).forEach(h => { if (typeof h.command === 'string') { configured[h.command] = true } });
    const bad = [];
    let shared = 0;
    leaves.forEach(n => {
      const fn = hotkeyCommands[n.command];
      if (!(fn instanceof Function)) { bad.push(n.command) }
      if (configured[n.command]) { shared++ }
    });
    if (bad.length) { throw new Error('菜单里有无法派发的命令：' + bad.join(',')) }
    if (runCommand('constructor') !== false || runCommand('toString') !== false) { throw new Error('原型链上的名字被当成可派发动作') }
    const seen = [];
    const keep = tuner.seekForward;
    tuner.seekForward = a => { seen.push(a) };
    try {
      leaves.filter(n => n.command === 'seekForward').forEach(n => n.fn());
    } finally { tuner.seekForward = keep }
    if (seen.length !== 2 || seen[0] !== undefined || seen[1] !== 30) { throw new Error('菜单声明的参数没原样传到派发出口：' + JSON.stringify(seen)) }
    return leaves.length + ' 个菜单动作经 runCommand 派发，其中 ' + shared + ' 个与快捷键共用同一命令'
  }`
  },
  {
    group: '开菜单', name: '只接管画面区', body: `async () => {
    ${SLEEP}
    const v = document.getElementById('v');
    const r = v.getBoundingClientRect();
    const fire = (x, y) => {
      const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
      Object.defineProperty(ev, 'clientX', { value: x });
      Object.defineProperty(ev, 'clientY', { value: y });
      Object.defineProperty(ev, 'button', { value: 2 });
      v.dispatchEvent(ev);
      return ev
    };
    const inside = fire(r.left + 40, r.top + 40);
    if (!menu.isOpen) { throw new Error('画面区域内的右键没有唤出菜单') }
    if (!inside.defaultPrevented) { throw new Error('接管右键时未阻止浏览器原生菜单') }
    menu.close();
    [[r.left - 4, r.top + 40], [r.left + 40, r.bottom + 4], [0, 0]].forEach(p => {
      const ev = fire(p[0], p[1]);
      if (menu.isOpen) { throw new Error('画面区域外的右键被误接管：' + p.join(',')) }
      if (ev.defaultPrevented) { throw new Error('不接管时不应阻止原生菜单：' + p.join(',')) }
    });
    const keepControls = v.controls;
    v.controls = true;
    try {
      if (fire(r.left + 40, r.bottom - 10).defaultPrevented) { throw new Error('原生控制条区域被右键菜单抢占') }
      if (!fire(r.left + 40, r.top + 40).defaultPrevented) { throw new Error('下沿预留把画面上半区也一起禁了') }
      menu.close();
    } finally { v.controls = keepControls }
    const keepGetSelection = window.getSelection;
    window.getSelection = () => ({ isCollapsed: false });
    try {
      const ev = fire(r.left + 40, r.top + 40);
      if (menu.isOpen) { throw new Error('选中文本时右键菜单抢占了复制菜单') }
      if (ev.defaultPrevented) { throw new Error('选中文本时不应阻止原生菜单') }
    } finally { window.getSelection = keepGetSelection }
    return '区域内接管，外沿/控制条/选中文本交还原生菜单'
  }`
  },
  {
    group: '截画面', name: '空画布走兜底', body: `async () => {
    ${SLEEP}
    ${TIP}
    const v = activePlayer.player();
    const errs = window.__errs.length;
    const calls = [];
    const orig = { previe: activePlayer.previe, download: activePlayer.download };
    activePlayer.previe = (canvas, title) => { calls.push('previe:' + canvas.width + 'x' + canvas.height + ':' + title) };
    try {
      const mk = (w, h) => ({ currentTime: 1, videoWidth: w, videoHeight: h, paused: true, setAttribute () {}, tagName: 'VIDEO' });
      if (activePlayer.grabCanvas(mk(0, 0), true, '空画面') !== false) { throw new Error('没有画面时 capture 应返回 false') }
      const canvas = document.createElement('canvas');
      canvas.width = 0; canvas.height = 0;
      activePlayer.saveCanvas(canvas, '空画布', v);
      await sleep(150);
      if (!calls.length) { throw new Error('toBlob 拿到 null 时没有走预览兜底分支') }
      const keepW = v.videoWidth, keepH = v.videoHeight;
      v.videoWidth = 0; v.videoHeight = 0;
      activePlayer.capture();
      v.videoWidth = keepW; v.videoHeight = keepH;
      if (!/没有可截取的画面/.test(tips() || '')) { throw new Error('界面上没有给出截图失败提示，实际：' + tips()) }
    } finally {
      Object.assign(activePlayer, orig);
    }
    const added = window.__errs.slice(errs);
    if (added.length) { throw new Error('截图兜底过程产生异常：' + added.join(' | ')) }
    return calls.join(', ') + ' | ' + tips()
  }`
  },
  {
    group: '截画面', name: '接 saveCanvas', body: `() => {
    const errs = window.__errs.length;
    const seen = [];
    const orig = { saveCanvas: activePlayer.saveCanvas, previe: activePlayer.previe, create: document.createElement };
    const fakeCanvas = { width: 0, height: 0, style: {}, getContext: () => ({ drawImage () {} }) };
    document.createElement = tag => (tag === 'canvas' ? fakeCanvas : orig.create.call(document, tag));
    activePlayer.saveCanvas = (canvas, title) => { seen.push('saveCanvas:' + canvas.width + 'x' + canvas.height + ':' + title) };
    activePlayer.previe = canvas => { seen.push('previe:' + canvas.width) };
    try {
      const src = { currentTime: 1, videoWidth: 320, videoHeight: 180, paused: true, setAttribute () {}, tagName: 'VIDEO' };
      if (!activePlayer.grabCanvas(src, true, '有画面')) { throw new Error('有画面时 grabCanvas 不该返回 false') }
      activePlayer.grabCanvas(src, false, '预览');
    } finally { Object.assign(activePlayer, { saveCanvas: orig.saveCanvas, previe: orig.previe }); document.createElement = orig.create }
    if (!seen.some(s => s.startsWith('saveCanvas:320x180'))) { throw new Error('下载分支没接到 saveCanvas，实际：' + seen.join(',')) }
    if (!seen.some(s => s === 'previe:320')) { throw new Error('预览分支没接到 previe，实际：' + seen.join(',')) }
    const added = window.__errs.slice(errs);
    if (added.length) { throw new Error('截图下载分支产生异常：' + added.join(' | ')) }
    return seen.join(' | ')
  }`
  },
  {
    group: '长按画面', name: '长按三倍速', body: `async () => {
    ${SLEEP}
    const v = activePlayer.player();
    const r = v.getBoundingClientRect();
    const point = { bubbles: true, cancelable: true, button: 0, clientX: r.left + 40, clientY: r.top + 40 };
    tuner.unlockPlaybackRate();
    tuner.setSpeed(1);
    tuner.unlockPlaybackRate();
    InputControl.register();
    const spy = ev => { const hit = { stop: 0, prevent: 0 }; ev.stopPropagation = () => { hit.stop++ }; ev.preventDefault = () => { hit.prevent++ }; return hit };
    const down = new MouseEvent('mousedown', point);
    const downHit = spy(down);
    v.dispatchEvent(down);
    await sleep(700);
    if (tuner.getSpeed() !== 3) { throw new Error('长按未触发三倍速：' + tuner.getSpeed()) }
    if (!tuner.lockedPlaybackRate()) { throw new Error('长按期间应锁住倍速设置') }
    if (!downHit.stop || !downHit.prevent) { throw new Error('长按接管后没吞掉 mousedown：stop=' + downHit.stop + ' prevent=' + downHit.prevent) }
    const up = new MouseEvent('mouseup', point);
    const upHit = spy(up);
    v.dispatchEvent(up);
    if (!upHit.stop || !upHit.prevent) { throw new Error('松开后没吞掉 mouseup：stop=' + upHit.stop + ' prevent=' + upHit.prevent) }
    let triggered = false;
    tuner.unlockPlaybackRate();
    tuner.setSpeed(1);
    tuner.unlockPlaybackRate();
    const near = new MouseEvent('mousedown', Object.assign({}, point, { clientX: r.left + 40, clientY: r.bottom - 10 }));
    const nearHit = spy(near);
    v.dispatchEvent(near);
    await sleep(700);
    triggered = tuner.getSpeed() === 3;
    v.dispatchEvent(new MouseEvent('mouseup', Object.assign({}, point, { clientX: r.left + 40, clientY: r.bottom - 10 })));
    if (triggered) { throw new Error('工具栏预留区内的长按被误接管') }
    if (nearHit.stop || nearHit.prevent) { throw new Error('没接管的长按吞掉了页面自己的 mousedown') }
    if (tuner.getSpeed() !== 1) { throw new Error('松开后没有还原倍速：' + tuner.getSpeed()) }
    return '长按生效、预留区不接管、松开还原；接管与放行的吞事件各一次'
  }`
  },
  {
    group: '做收尾', name: '无未捕获异常', body: `() => {
    const errs = (window.__errs || []).filter(e => !/favicon/i.test(e));
    if (errs.length) { throw new Error(errs.slice(0, 3).join(' | ')) }
    return 'ok'
  }`
  },
  {
    disabledSite: true, group: '配站点任务', name: '禁用时 taskCenter 就位', body: `() => {
    if (typeof taskCenter !== 'object' || taskCenter === null) { throw new Error('taskCenter 仍为 null，菜单动作会抛 TypeError') }
    if (Object.keys(taskCenter.conf).length) { throw new Error('禁用状态下不应加载站点任务配置') }
    if (taskCenter.doTask('playbackRate') !== false) { throw new Error('禁用的任务中心不应执行站点任务') }
    return '空配置任务中心'
  }`
  },
  {
    disabledSite: true, group: '开菜单', name: '禁用时菜单可弹', body: `() => {
    if (configManager.get('enable') !== false) { throw new Error('测试前置条件不成立：脚本并未被禁用') }
    const v = document.getElementById('v');
    const r = v.getBoundingClientRect();
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'clientX', { value: r.left + 40 });
    Object.defineProperty(ev, 'clientY', { value: r.top + 40 });
    Object.defineProperty(ev, 'button', { value: 2 });
    v.dispatchEvent(ev);
    if (!menu.isOpen) { throw new Error('禁用站点时右键菜单弹不出来') }
    const txt = n => (n.textContent || '').replace(/\\s+/g, ' ').trim();
    const items = Array.from(menu.shadow.querySelectorAll('.r6pcm-item')).map(txt);
    if (!items.some(t => t.includes('设置'))) { throw new Error('菜单缺少设置入口：' + JSON.stringify(items)) }
    menu.close();
    if (input._bound_) { throw new Error('禁用站点不应绑定快捷键监听') }
    return '禁用站点菜单可用，且键盘增强未启用'
  }`
  },
  {
    group: '配站点任务', name: '共用 Esc 外壳', body: `() => {
    const seen = [];
    const shell = escapeTask(() => { seen.push('hit') });
    if (shell.register.join() !== 'escape') { throw new Error('Esc 外壳注册的键不对：' + shell.register.join()) }
    shell.callback({}, { event: { keyCode: 22 } });
    if (seen.length) { throw new Error('非 Esc 键不该触发站点动作') }
    shell.callback({}, { event: { keyCode: 27 } });
    if (seen.join() !== 'hit') { throw new Error('Esc 没把动作传给站点') }
    ['douyin.com', 'live.douyin.com'].forEach(host => {
      const conf = taskConf[host];
      if (!conf || conf.fullScreen !== xgplayerTask.fullScreen || conf.webFullScreen !== xgplayerTask.webFullScreen) { throw new Error(host + ' 没接上 xgplayer 预设') }
    });
    ['youtube.com', 'bilibili.com'].forEach(host => {
      const sc = taskConf[host].shortcuts;
      if (sc.register.join() !== 'escape' || !(sc.callback instanceof Function)) { throw new Error(host + ' 的 Esc 任务结构不对') }
    });
    const v = activePlayer.player();
    v.removeAttribute('crossOrigin');
    allowCross();
    if (v.getAttribute('crossOrigin') !== 'anonymous') { throw new Error('跨域截图标记没写到当前实例上') }
    v.removeAttribute('crossOrigin');
    if (Object.keys(taskConf).length < 20) { throw new Error('站点表缩水：' + Object.keys(taskConf).length + ' 项') }
    return 'Esc 外壳判定 2 例 + 站点预设复用 4 处'
  }`
  },
  {
    group: '配站点任务', name: '共用全屏实现', body: `() => {
    const queried = [];
    const keepQuery = document.querySelector;
    const keepTimer = setTimeout;
    setTimeout = fn => { fn(); return 0 };
    document.querySelector = sel => { queried.push(sel); return null };
    try {
      [['youku.com', ['.youku-layer-logo']], ['qq.com', ['.txp-watermark', '.txp-watermark-action']], ['iqiyi.com', ['.iqp-logo-box']]].forEach(one => {
        queried.length = 0;
        const conf = taskConf[one[0]];
        if (!(conf.init instanceof Function)) { throw new Error(one[0] + ' 的 init 不在了') }
        conf.init(conf, {});
        if (queried.join() !== one[1].join()) { throw new Error(one[0] + ' 藏的水印不对：' + JSON.stringify(queried) + ' ≠ ' + JSON.stringify(one[1])) }
      });
    } finally { document.querySelector = keepQuery; setTimeout = keepTimer }
    const fb = taskConf['facebook.com'];
    if (fb.fullScreen !== fb.webFullScreen) { throw new Error('facebook 的两个全屏又各写了一份实现') }
    let buttons = [];
    const clicked = [];
    activePlayer.player = () => ({ parentNode: { querySelectorAll: () => buttons } });
    try {
      buttons = [0, 1, 2, 3].map(i => ({ click () { clicked.push(i) } }));
      if (fb.fullScreen(fb, {}) !== true || clicked.join() !== '2') { throw new Error('该点倒数第二个按钮，实际点了：' + JSON.stringify(clicked)) }
      clicked.length = 0;
      buttons = [0, 1];
      if (fb.webFullScreen(fb, {}) !== undefined || clicked.length) { throw new Error('按钮不足三个时不该乱点：' + JSON.stringify(clicked)) }
    } finally { delete activePlayer.player }
    return '三家水印各归一处 + facebook 两键同源'
  }`
  },
  {
    group: '配站点任务', name: '只留一份实现', body: `() => {
    const keepTitle = document.title;
    const node = extra => {
      const n = Object.assign({ attrs: {}, clicked: 0, on: {}, off: 0 }, extra || {});
      n.getAttribute = k => (k in n.attrs ? n.attrs[k] : null);
      n.setAttribute = (k, v) => { n.attrs[k] = String(v) };
      n.removeAttribute = k => { delete n.attrs[k] };
      n.addEventListener = (name, fn) => { n.on[name] = fn };
      n.removeEventListener = name => { n.off++; delete n.on[name] };
      n.click = () => { n.clicked++ };
      return n
    };
    try {
      const tweet = node({ innerText: '  hello world  ' });
      const wrap = node({ querySelector: sel => (sel === 'div[data-testid="tweetText"]' ? tweet : null) });
      activePlayer.player = () => node({ closest: sel => (sel === 'article[data-testid="tweet"]' ? wrap : null) });
      taskConf['twitter.com'].init(taskConf['twitter.com']);
      if (!wrap.on.mouseover) { throw new Error('twitter 没挂上 mouseover 兜底') }
      wrap.on.mouseover();
      if (wrap.attrs['data-title'] !== 'hello world') { throw new Error('标题没写进 data-title：' + wrap.attrs['data-title']) }
      if (wrap.off !== 1 || wrap.on.mouseover) { throw new Error('取到标题后没放开监听：off=' + wrap.off) }
      const empty = node({ querySelector: () => null });
      activePlayer.player = () => node({ closest: () => empty });
      taskConf['twitter.com'].init(taskConf['twitter.com']);
      empty.on.mouseover();
      if ('data-title' in empty.attrs || empty.off) { throw new Error('标题节点缺失时不该写入，也不该放开监听') }
      const info = node({ querySelector: sel => (sel === '.account-name' ? node({ innerText: '@账号' }) : node({ innerText: ' 标题 ' })) });
      const dyWrap = node({ querySelector: sel => (sel === '.video-info-detail' ? info : null) });
      const dyPlayer = node({ closest: sel => (sel === 'div[data-e2e="feed-item"]' ? dyWrap : null) });
      activePlayer.player = () => dyPlayer;
      taskConf['douyin.com'].init(taskConf['douyin.com']);
      dyWrap.on.mouseover();
      if (dyWrap.attrs['data-title'] !== '标题 - 账号') { throw new Error('抖音标题拼错了：' + dyWrap.attrs['data-title']) }
      if (document.title !== '标题 - 账号') { throw new Error('抖音没把标题同步到 document.title') }
      if (dyPlayer.attrs.crossOrigin !== 'anonymous') { throw new Error('抖音的跨域截图标记没打上') }
      const btns = {};
      const clicks = sel => (btns[sel] ? btns[sel].clicked : 0);
      const container = node({ querySelector: sel => (btns[sel] || (btns[sel] = node())) });
      const dy = node({ _fullScreen_: { getContainer: () => container } });
      activePlayer.player = () => dy;
      const conf = taskConf['douyu.com'];
      if (conf.fullScreen === conf.webFullScreen) { throw new Error('斗鱼的两个方向本该各自带状态位') }
      conf.fullScreen(conf);
      if (clicks('div[title="窗口全屏"]') !== 1 || dy._isFullScreen_ !== true) { throw new Error('第一次全屏没点进入按钮：' + JSON.stringify({ 进入: clicks('div[title="窗口全屏"]'), 退出: clicks('div[title="退出窗口全屏"]'), 状态: dy._isFullScreen_ })) }
      conf.fullScreen(conf);
      if (clicks('div[title="退出窗口全屏"]') !== 1 || dy._isFullScreen_ !== false) { throw new Error('第二次全屏没点退出按钮：' + JSON.stringify({ 进入: clicks('div[title="窗口全屏"]'), 退出: clicks('div[title="退出窗口全屏"]'), 状态: dy._isFullScreen_ })) }
      conf.webFullScreen(conf);
      if (clicks('div[title="网页全屏"]') !== 1 || dy._isWebFullScreen_ !== true || dy._isFullScreen_ !== false) { throw new Error('网页全屏串到了窗口全屏的状态上：' + JSON.stringify({ 网页进入: clicks('div[title="网页全屏"]'), 网页状态: dy._isWebFullScreen_, 窗口状态: dy._isFullScreen_ })) }
      return '标题只写一次 / 缺失时不动 / 斗鱼两向独立'
    } finally { delete activePlayer.player; document.title = keepTitle }
  }`
  },
  {
    group: '配站点任务', name: '到点才补切换', body: `async () => {
    ${SLEEP}
    const v = activePlayer.player();
    const errsAt = window.__errs.length;
    const keepPaused = Object.getOwnPropertyDescriptor(v, 'paused');
    const keepInst = { play: v.play, pause: v.pause };
    let plays = 0, pauses = 0;
    v.play = function () { plays++; return Promise.resolve() };
    v.pause = function () { pauses++; return Promise.resolve() };
    const pin = val => Object.defineProperty(v, 'paused', { configurable: true, value: val });
    const conf = taskConf['acfun.cn'];
    try {
      pin(true);
      conf.switchPlay(conf, {});
      await sleep(300);
      if (plays !== 1 || pauses) { throw new Error('暂停态下没补上播放：play=' + plays + ' pause=' + pauses) }
      plays = 0;
      pin(false);
      conf.switchPlay(conf, {});
      await sleep(60);
      pin(true);
      await sleep(300);
      if (plays || pauses) { throw new Error('期间状态已被改动，任务不该再插手：play=' + plays + ' pause=' + pauses) }
      const added = window.__errs.slice(errsAt);
      if (added.length) { throw new Error('acfun 任务执行产生异常：' + added.join(' | ')) }
      return '暂停补播放一次 / 状态变了不插手'
    } finally {
      Object.assign(v, keepInst);
      if (keepPaused) { Object.defineProperty(v, 'paused', keepPaused) } else { delete v.paused }
    }
  }`
  },
  {
    group: '进全屏', name: '沿父链铺全屏', body: `() => {
    const errsAt = window.__errs.length;
    const rect = (w, h) => () => ({ width: w, height: h, top: 0, left: 0, right: w, bottom: h });
    const big = document.createElement('div');
    const box = document.createElement('div');
    const vid = document.createElement('video');
    Object.defineProperty(big, 'getBoundingClientRect', { value: rect(1200, 800), configurable: true });
    Object.defineProperty(box, 'getBoundingClientRect', { value: rect(800, 450), configurable: true });
    Object.defineProperty(vid, 'getBoundingClientRect', { value: rect(800, 450), configurable: true });
    box.appendChild(vid);
    big.appendChild(box);
    let requested = 0;
    Object.defineProperty(box, 'requestFullscreen', { value: () => { requested++; return Promise.resolve() }, configurable: true });
    const page = new FullScreen(vid, true);
    const native = new FullScreen(vid);
    try {
      if (page.getContainer() !== box) { throw new Error('容器认成了别的节点：' + page.getContainer().tagName) }
      page.toggle();
      if (!page.isFull()) { throw new Error('toggle 之后仍不是全屏态') }
      if (requested) { throw new Error('页面全屏竟然调了原生全屏') }
      if (!vid.classList.contains('_webfullscreen_') && !box.classList.contains('_webfullscreen_')) { throw new Error('父链上没铺到全屏样式') }
      if (!box.classList.contains('_webfullscreen_zindex_')) { throw new Error('到了容器却没提层级') }
      if (!big.classList.contains('_webfullscreen_')) { throw new Error('容器之上的祖先节点该一起铺上') }
      page.toggle();
      if (page.isFull() || box.classList.contains('_webfullscreen_') || box.classList.contains('_webfullscreen_zindex_')) { throw new Error('exit 之后样式或状态没收回') }
      native.enter();
      if (requested !== 1) { throw new Error('真全屏没有发起 requestFullscreen：' + requested) }
      native.exit();
      if (native.isFull()) { throw new Error('exit 后仍是全屏态') }
      const called = [];
      [page, native].forEach(inst => Object.defineProperty(inst, 'exitFullScreen', { value: () => called.push(inst === page ? 'page' : 'native'), configurable: true }));
      page.exit();
      if (called.length) { throw new Error('页面全屏退出时不该发起原生全屏退出：' + called.join()) }
      native.exit();
      if (called.join() !== 'native') { throw new Error('全屏模式退出时没发起原生全屏退出：' + (called.join() || '一次都没有')) }
      return '容器判定 / 两向样式与层级 / 页面模式不碰原生全屏，退出方向各自命中'
    } finally {
      page.exit(); native.exit();
      vid.remove(); box.remove(); big.remove();
      const added = window.__errs.slice(errsAt);
      if (added.length) { throw new Error('全屏流程产生异常：' + added.join(' | ')) }
    }
  }`
  },
  {
    group: '配站点任务', name: '接管才吞事件', body: `() => {
    const host = location.host;
    const keep = taskCenter.conf[host];
    const seen = [];
    let takeOver = true;
    const mk = key => {
      const hit = { prevent: 0, stop: 0 };
      const event = { key, code: String(key).toUpperCase(), keyCode: String(key).toUpperCase().charCodeAt(0), ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, target: activePlayer.player(), composedPath: () => [activePlayer.player()], preventDefault () { hit.prevent++ }, stopPropagation () { hit.stop++ } };
      return { event, hit }
    };
    taskCenter.conf[host] = {
      shortcuts: {
        register: ['q', 'shift+c'],
        callback: (taskConf, data) => {
          const { event, player } = data || {};
          seen.push((event || {}).key + '/' + (player ? '有实例' : '无实例'));
          return takeOver
        }
      }
    };
    try {
      const q = mk('q');
      if (input.siteShortcut(activePlayer.player(), q.event) !== true) { throw new Error('注册过的 q 没被接管') }
      if (seen.join() !== 'q/有实例') { throw new Error('站点回调没拿到 event 与播放器实例：' + (seen.join() || '一次都没进回调')) }
      if (q.hit.prevent !== 1 || q.hit.stop !== 1) { throw new Error('接管后没吞掉事件：prevent=' + q.hit.prevent + ' stop=' + q.hit.stop) }
      seen.length = 0;
      takeOver = false;
      const q2 = mk('q');
      if (input.siteShortcut(activePlayer.player(), q2.event) !== false) { throw new Error('站点返回不管，siteShortcut 却说接管了') }
      if (q2.hit.prevent || q2.hit.stop) { throw new Error('站点没接管却吞掉了事件：prevent=' + q2.hit.prevent + ' stop=' + q2.hit.stop) }
      seen.length = 0;
      takeOver = true;
      const z = mk('z');
      if (input.siteShortcut(activePlayer.player(), z.event) !== false) { throw new Error('未注册的 z 不该被接管') }
      if (seen.length || z.hit.prevent || z.hit.stop) { throw new Error('未注册按键仍然惊动了站点回调或事件') }
      seen.length = 0;
      const sc = mk('C');
      sc.event.shiftKey = true;
      input.siteShortcut(activePlayer.player(), sc.event);
      if (seen.join() !== 'C/有实例') { throw new Error('shift+c 没匹配上注册表：' + (seen.join() || '没进回调')) }
      return '接管/放行/未注册 三条各走一遍，组合键整串匹配'
    } finally {
      if (keep === undefined) { delete taskCenter.conf[host] } else { taskCenter.conf[host] = keep }
    }
  }`
  },
  {
    group: '配站点任务', name: '只查一次选择器', body: `() => {
    const host = location.host;
    const keep = taskCenter.conf[host];
    const clicks = [];
    const wrapHits = [];
    const wrap = { querySelector (sel) { wrapHits.push(sel); return sel === '.in-wrap' ? { click () { clicks.push('包裹') } } : null } };
    const inDoc = document.createElement('div');
    inDoc.className = 'in-doc';
    inDoc.click = () => { clicks.push('文档') };
    document.body.appendChild(inDoc);
    const bothIn = document.createElement('div');
    bothIn.className = 'in-wrap';
    bothIn.click = () => { clicks.push('文档里的同名') };
    document.body.appendChild(bothIn);
    let wrapLookups = 0;
    activePlayer.getWrap = () => { wrapLookups++; return wrap };
    try {
      taskCenter.conf[host] = { a: '.in-wrap', b: '.in-doc', c: ['.miss-1', '.in-doc', '.in-wrap'], d: '.miss-2', e: true, f: () => '函数任务' };
      if (taskCenter.doTask('a') !== true || clicks.join() !== '包裹') { throw new Error('包裹节点里的按钮没被点：' + clicks.join()) }
      if (wrapHits.join() !== '.in-wrap') { throw new Error('一个选择器被查了不止一次：' + wrapHits.join()) }
      clicks.length = 0;
      if (taskCenter.doTask('b') !== true || clicks.join() !== '文档') { throw new Error('包裹节点里没有时没退到全文档') }
      clicks.length = 0; wrapHits.length = 0;
      if (taskCenter.doTask('c') !== true || clicks.join() !== '文档' || wrapHits.join() !== '.miss-1,.in-doc') { throw new Error('多选择器顺序不对：' + clicks.join() + ' / ' + wrapHits.join()) }
      clicks.length = 0;
      if (taskCenter.doTask('d')) { throw new Error('选择器都不存在时竟然说任务执行了') }
      if (clicks.length) { throw new Error('没找到目标却点了东西') }
      wrapHits.length = 0; wrapLookups = 0;
      if (taskCenter.doTask('e') !== true || wrapLookups) { throw new Error('布尔任务竟然去摸包裹节点：' + wrapLookups + ' 次') }
      if (taskCenter.doTask('f') !== '函数任务' || wrapLookups) { throw new Error('函数任务竟然去摸包裹节点：' + wrapLookups + ' 次') }
      if (taskCenter.doTask('a') !== true || wrapLookups !== 1) { throw new Error('一次选择器任务查包裹节点不是恰好一遍：' + wrapLookups) }
      return '包裹优先 / 退全文档 / 多选择器取首个命中 / 未命中不动作 / 函数与布尔不碰 DOM'
    } finally {
      delete activePlayer.getWrap;
      if (keep === undefined) { delete taskCenter.conf[host] } else { taskCenter.conf[host] = keep }
      inDoc.remove();
      bothIn.remove();
    }
  }`
  },
  {
    group: '记进度', name: '淘汰最早记录', body: `() => {
    const big = {};
    for (let i = 0; i < 11; i++) { big['k' + i] = { progress: i, duration: 200, t: 1000 + i }; }
    const keys = Object.keys(tuner.trimProgress(big));
    if (keys.length !== 10 || big.k0) { throw new Error('十一条该留十条并删掉最早那条，实际剩 ' + keys.length + ' 条，k0=' + !!big.k0) }
    if (!big.k10) { throw new Error('删错了对象：最新的记录不该被清掉') }
    const small = { a: { progress: 1, t: 5 }, b: { progress: 2, t: 1 } };
    if (Object.keys(tuner.trimProgress(small)).length !== 2) { throw new Error('没超限也删了记录') }
    const tie = { a: { t: 1 }, b: { t: 1 } };
    for (let i = 0; i < 10; i++) { tie['x' + i] = { t: 5 + i }; }
    tuner.trimProgress(tie);
    if (tie.a || tie.b) { throw new Error('并列最早的记录没被一并清掉') }
    return '超限淘汰最早 / 未超限不动 / 并列一起清'
  }`
  },
  {
    group: '调属性', name: '走同一套动作', body: `() => {
    const names = ['setSpeed', 'setVolume', 'setCurrentTime', 'lockPlaybackRate', 'unlockPlaybackRate', 'lockVolume', 'unlockVolume', 'lockCurrentTime', 'unlockCurrentTime'];
    const orig = names.map(n => [n, tuner[n]]);
    const seen = [];
    names.forEach(n => { tuner[n] = (...a) => { seen.push(n + '(' + a.map(x => x === undefined ? '缺省' : String(x)).join(',') + ')'); return true } });
    try {
      if (tuner.applyRate(2, true, 700) !== true) { throw new Error('applyRate 没把设值结果原样返回') }
      const rate = seen.join(' ');
      if (rate !== 'unlockPlaybackRate() setSpeed(2,true) lockPlaybackRate(700)') { throw new Error('倍速这一轮动作不对：' + rate) }
      seen.length = 0;
      tuner.stepVolume(0.2);
      const vol = seen.join(' ');
      if (!/^unlockVolume\\(\\) setVolume\\(/.test(vol) || !/lockVolume\\(500\\)$/.test(vol)) { throw new Error('音量这一轮动作不对：' + vol) }
      seen.length = 0;
      tuner.seekBy(5, true);
      const seek = seen.join(' ');
      if (!/^unlockCurrentTime\\(\\) setCurrentTime\\(/.test(seek) || !/lockCurrentTime\\(500\\)$/.test(seek)) { throw new Error('进度这一轮动作不对：' + seek) }
      seen.length = 0;
      tuner.applyRate(1.5);
      if (!/lockPlaybackRate\\(1000\\)$/.test(seen.join(' '))) { throw new Error('applyRate 缺省锁定时长变了：' + seen.join(' ')) }
      const keepHostConf = taskCenter.conf[location.host];
      taskCenter.conf[location.host] = { blockSetVolume: true };
      const 由任务 = takenOver('Volume');
      taskCenter.conf[location.host] = keepHostConf;
      if (!由任务) { throw new Error('站点任务 blockSetVolume 没算进接管判定') }
      const keepBlock = configManager.get('enhance.blockSetVolume');
      configManager.setLocal('enhance.blockSetVolume', true);
      const 由开关 = takenOver('Volume');
      configManager.setLocal('enhance.blockSetVolume', false);
      const 谁都没接管 = takenOver('Volume');
      configManager.setLocal('enhance.blockSetVolume', keepBlock);
      if (!由开关 || 谁都没接管) { throw new Error('接管开关这一路没参与判定：' + 由开关 + ' / ' + 谁都没接管) }
      const plusApi = activePlayer.enhancer;
      const keepApiLock = plusApi.lockPlaybackRate;
      const keepBlockRate = configManager.get('enhance.blockSetPlaybackRate');
      const durations = [];
      plusApi.lockPlaybackRate = t => { durations.push(t) };
      configManager.setLocal('enhance.blockSetPlaybackRate', false);
      tuner.lock('playbackRate', 1000);
      configManager.setLocal('enhance.blockSetPlaybackRate', true);
      tuner.lock('playbackRate', 1000);
      plusApi.lockPlaybackRate = keepApiLock;
      configManager.setLocal('enhance.blockSetPlaybackRate', keepBlockRate);
      if (durations[0] !== 1000) { throw new Error('没接管时锁定时长不该被改：' + durations[0]) }
      if (!(durations[1] > 1000 * 60 * 60 * 24 * 30)) { throw new Error('接管时锁定时长没被抬到长期：' + durations[1]) }
      return '三属性各一轮：解锁 → 设值 → 锁回，参数与时长一致；接管两个来源都算，接管时锁到长期'
    } finally { orig.forEach(one => { tuner[one[0]] = one[1] }) }
  }`
  },
  {
    group: '接管属性', name: '自己接管属性', body: `() => {
    const p = activePlayer.player();
    const keepPlus = mediaCore.mediaPlus;
    const keepBlock = configManager.get('enhance.blockSetPlaybackRate');
    configManager.setLocal('enhance.blockSetPlaybackRate', true);
    mediaCore.mediaPlus = function () { return false };
    activePlayer.enhancer = null;
    ['playbackRate', 'volume', 'currentTime'].forEach(n => delete p[n]);
    tuner.unlockPlaybackRate();
    try {
      tuner.setSpeed(1.3, true, true, true);
      tuner.setVolume(0.25, true, true);
      tuner.setCurrentTime(5);
      const 没接管 = ['playbackRate', 'volume', 'currentTime'].filter(n => !Object.getOwnPropertyDescriptor(p, n));
      if (没接管.length) { throw new Error('这三个属性没被接管：' + 没接管.join(',')) }
      p.playbackRate = 6;
      if (Number(p.playbackRate) !== 1.3) { throw new Error('外部写倍速没被拦住：' + p.playbackRate) }
      if (Number(tuner.getSpeed()) !== 1.3) { throw new Error('脚本记录的倍速被改写：' + tuner.getSpeed()) }
      if (!p.timeInfo || Math.round(p.timeInfo.value) !== 5) { throw new Error('接管时没记下进度值：' + JSON.stringify(p.timeInfo)) }
      if (Math.round(p.currentTime) !== 5) { throw new Error('进度没落到实例上：' + p.currentTime) }
      if (Number(p.volume) !== 0.25) { throw new Error('音量没落到实例上：' + p.volume) }
      return '三属性接管 + 外部写被拦'
    } finally {
      configManager.setLocal('enhance.blockSetPlaybackRate', keepBlock);
      mediaCore.mediaPlus = keepPlus;
      activePlayer.enhancer = keepPlus(p);
      ['playbackRate', 'volume', 'currentTime'].forEach(n => delete p[n]);
    }
  }`
  },
  {
    group: '接管属性', name: '命中派生 API', body: `() => {
    const p = activePlayer.player();
    const keepPlus = mediaCore.mediaPlus;
    const hits = [];
    const api = {};
    ['PlaybackRate', 'Volume', 'CurrentTime'].forEach(n => {
      api['set' + n] = v => hits.push('set' + n + '=' + v);
      api['lock' + n] = () => hits.push('lock' + n);
      api['unlock' + n] = () => hits.push('unlock' + n);
      api['locked' + n] = () => { hits.push('locked' + n); return false };
    });
    mediaCore.mediaPlus = function () { return api };
    activePlayer.enhancer = api;
    try {
      tuner.setSpeed(1.4, true, true, true);
      tuner.setVolume(0.4, true, true);
      tuner.setCurrentTime(3);
      tuner.lockPlaybackRate(50);
      tuner.unlockPlaybackRate();
      if (tuner.lockedVolume() !== false) { throw new Error('lockedVolume 该转给增强 API 的返回值') }
      ['setPlaybackRate=1.4', 'setVolume=0.4', 'setCurrentTime=3', 'lockPlaybackRate', 'unlockPlaybackRate', 'lockedVolume'].forEach(want => {
        if (!hits.includes(want)) { throw new Error('没命中 ' + want + '，实际命中：' + hits.join(',')) }
      });
      ['playbackRate', 'volume', 'currentTime'].forEach(prop => {
        const Api = prop.charAt(0).toUpperCase() + prop.slice(1);
        hits.length = 0;
        tuner['lock' + Api](); tuner['unlock' + Api](); tuner['locked' + Api]();
        if (hits.join() !== ['lock', 'unlock', 'locked'].map(k => k + Api).join()) { throw new Error(Api + ' 的三个动作没命中增强 API：' + hits.join()) }
      });
      return '9 组派生方法名全部命中，含 set 三属性'
    } finally { mediaCore.mediaPlus = keepPlus; activePlayer.enhancer = keepPlus(p) }
  }`
  },
  {
    group: '进全屏', name: '按序分派 Esc', body: `() => {
    const before = fullScreenInstances.length;
    const regs = [];
    const keepAdd = window.addEventListener;
    window.addEventListener = function (type) { regs.push(type); return keepAdd.apply(this, arguments) };
    let a, b;
    try {
      a = new FullScreen(document.createElement('video'));
      b = new FullScreen(document.createElement('video'), true);
    } finally { window.addEventListener = keepAdd }
    if (fullScreenInstances.length !== before + 2) { throw new Error('实例没登记进注册表：新增 ' + (fullScreenInstances.length - before) + ' 个') }
    if (regs.indexOf('keyup') >= 0) { throw new Error('构造时仍在各自挂 window keyup 监听：' + regs.join(',')) }
    const order = [];
    [a, b].forEach((inst, i) => { inst.onEscape = () => { order.push(i) } });
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    if (order.join() !== '0,1') { throw new Error('Esc 分派顺序不对：' + (order.join() || '一个实例都没收到')) }
    [a, b].forEach(inst => { delete inst.onEscape; inst.fullStatus = true });
    window.dispatchEvent(new KeyboardEvent('keyup', { key: 'Escape' }));
    if (a.isFull() || b.isFull()) { throw new Error('Esc 之后实例仍是全屏：a=' + a.isFull() + ' b=' + b.isFull()) }
    const branchOf = (full, nativeFull) => {
      const hit = [];
      const inst = { isFull: () => full, exit: () => hit.push('exit'), isFullScreen: () => nativeFull, exitFullScreen: () => hit.push('exitFullScreen') };
      FullScreen.prototype.onEscape.call(inst);
      return hit.join() || 'none'
    };
    if (branchOf(true, true) !== 'exit') { throw new Error('已页面全屏时 Esc 应先退页面全屏') }
    if (branchOf(false, true) !== 'exitFullScreen') { throw new Error('没有页面全屏时 Esc 应退浏览器全屏') }
    if (branchOf(false, false) !== 'none') { throw new Error('两种全屏都没有时 Esc 不该动手') }
    return '2 个实例共用 1 个窗口监听，分派顺序 0,1；退出分支 3 条各自命中'
  }`
  },
  {
    group: '走启动', name: '兜住启动异常', body: `() => {
    if (initEnhance.constructor.name !== 'Function') { throw new Error('initEnhance 是 ' + initEnhance.constructor.name + '：启动兜底会失效') }
    const calls = [];
    const keep = {
      docAdd: document.addEventListener, winAdd: window.addEventListener, ready: Utils.ready,
      pipInit: pageBridge.init, on: pageBridge.on, ua: PageBridge.spoofAgent, mouse: InputControl.register,
      mouseConf: configManager.get('mouse.enable')
    };
    try {
      configManager.setLocal('mouse.enable', true);
      document.addEventListener = function (type) { calls.push('doc:' + type); return true };
      window.addEventListener = function (type) { calls.push('win:' + type); return true };
      Utils.ready = selector => { calls.push('ready:' + selector); return true };
      pageBridge.pollPicture = () => { calls.push('pollPicture') };
      pageBridge.bindYield = () => { calls.push('bindYield') };
      pageBridge.on = name => { calls.push('on:' + name) };
      PageBridge.spoofAgent = () => { calls.push('fakeUA') };
      InputControl.register = () => { calls.push('mouseRegister') };
      bootState.runtimeReady = false;
      setupRuntime();
      const first = calls.slice();
      ['doc:visibilitychange', 'doc:addShadowRoot', 'ready:video', 'pollPicture', 'mouseRegister'].forEach(need => {
        if (first.indexOf(need) < 0) { throw new Error('这一步没进一次性装配：缺 ' + need + '，实际 ' + first.join(',')) }
      });
      setupRuntime();
      if (calls.length !== first.length) { throw new Error('重复装配又挂出了 ' + (calls.length - first.length) + ' 项：' + calls.slice(first.length).join(',')) }
      return '装配 ' + first.length + ' 项集中在守卫里，第二遍一项不增'
    } finally {
      Object.assign(document, { addEventListener: keep.docAdd });
      Object.assign(window, { addEventListener: keep.winAdd });
      Utils.ready = keep.ready;
      pageBridge.init = keep.pipInit;
      pageBridge.on = keep.on;
      PageBridge.spoofAgent = keep.ua;
      InputControl.register = keep.mouse;
      configManager.setLocal('mouse.enable', keep.mouseConf);
      bootState.runtimeReady = true;
    }
  }`
  },
  {
    disabledSite: true, group: '做收尾', name: '禁用下无异常', body: `() => {
    const errs = (window.__errs || []).filter(e => !/favicon/i.test(e));
    if (errs.length) { throw new Error(errs.slice(0, 2).join(' | ')) }
    return 'ok'
  }`
  }
];


async function buildSection () {
  const built = await P.build();
  P.write(built);
  build.logBuild(P, built);
  return 0;
}

async function suiteSection () {
  const DEFAULT_TARGET = path.join(P.OUT, P.ARTIFACT);
  const TARGET = argv.find(a => a.endsWith('.js')) || DEFAULT_TARGET;
  const targetPath = path.resolve(process.cwd(), TARGET);
  const source = P.sourceView();
  const lines = source.split('\n');

  const results = [];
  const unhandled = [];
  process.on('unhandledRejection', (r: any) => { unhandled.push(String(r && r.message || r)) });
  async function expect (group, name, fn) {
    try { const r = await fn(); pass(group, name, r === undefined ? null : String(r)) } catch (e) { fail(group, name, e.message) }
  }
  function pass (group, name, info) { results.push({ group, name, ok: true, info }) }
  function fail (group, name, info) { results.push({ group, name, ok: false, info }) }
  function assert (cond, msg) { if (!cond) throw new Error(msg || '断言失败') }

  function blockRange (hint) {
    const s = lines.findIndex(l => l.startsWith(hint));
    if (s < 0) return null;
    let depth = 0;
    for (let i = s; i < lines.length; i++) {
      for (const c of lines[i]) { if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) return [s, i] } }
    }
    return null;
  }
  function membersOf (text) {
    const out = new Set<string>();
    text.split('\n').forEach(l => {
      let m = /^  (?:async\s+)?(?:(?:get|set)\s+)?([\w$]+)\s*(?::\s*function\s*\(|[:(,])/.exec(l);
      if (m) out.add(m[1]);
      m = /^    this\.([\w$]+)\s*=/.exec(l);
      if (m) out.add(m[1]);
      m = /^  ([\w$]+),$/.exec(l);
      if (m) out.add(m[1]);
    });
    return out;
  }
  function codeMask (text) {
    const rows = [];
    let q = null, inBlock = false, row = null;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], p = text[i - 1];
      if (c === '\n') { if (q && q !== '`') q = null; row = null; continue }
    if (!row) { row = []; rows.push(row) }
    let code = 1;
    if (inBlock) { code = 0; if (c === '/' && p === '*') inBlock = false }
    else if (q) {
      code = 0;
      if (c === '\\') { row.push(0); i++; continue }
      if (c === q) q = null;
    } else if (c === '/' && text[i + 1] === '*') { code = 0; inBlock = true }
    else if (c === '/' && text[i + 1] === '/') { code = 0; q = '//' }
    else if (c === '`' || c === '"' || c === "'") { code = 0; q = c }
      row.push(code);
    }
    return rows;
  }
  const CONTROLLERS = [
    ['PlayerControl', 'activePlayer', 'createPlayer'], ['MenuControl', 'menu', 'createMenu'],
    ['TunerControl', 'tuner', 'createTuner'], ['PictureControl', 'picture', 'createPicture'],
    ['InputControl', 'input', 'createInput']
  ];
  const SUPPORT_CTLS = [
    ['MediaCore', 'mediaCore', 'createMedia'], ['SourceControl', 'mediaSource', 'createSource']
  ];
  const CTL_NAMES = CONTROLLERS.map(c => c[1]);
  const RETIRED_CTLS = ['transformCtl', 'filterCtl', 'tipsCtl', 'videoContextMenu', 'mediaCtl', 'rateCtl', 'volumeCtl', 'seekCtl', 'progressCtl', 'hotkeyCtl'];
  const FILTER_SHELLS = ['brightness', 'contrast', 'saturation', 'hue', 'blur'].flatMap(name => [name, name + 'Up', name + 'Down']);
  const LOCK_SHELLS = ['PlaybackRate', 'Volume', 'CurrentTime'].flatMap(n => ['lock' + n, 'unlock' + n, 'locked' + n]);
  const UtilsFirstUpper = str => `${str}`.replace(/^\S/, s => s.toUpperCase());
  const STATE_OWNER = {
    enhancer: 'activePlayer',
    enable: 'input', globalMode: 'input', crossDetected: 'input',
    _isFocus: 'input', keysPaused: 'input',
    playbackRate: 'tuner', volume: 'tuner',
    skipStep: 'tuner', followBuffer: 'tuner',
    scale: 'picture',
    hasExternal: 'configManager'
  };
  function classApi (cls) {
    const r = blockRange(`export class ${cls} {`);
    assert(r, `缺少类 ${cls}`);
    const out = new Set<string>();
    lines.slice(r[0], r[1] + 1).forEach(l => {
      let m = /^  (?:static )?(?:async )?(?:get |set )?([\w$]+)\s*(?::\s*function\s*\(|[:(,])/.exec(l);
      if (m) out.add(m[1]);
      m = /^  static (?:async )?([\w$]+)/.exec(l);
      if (m) out.add(m[1]);
      m = /^    this\.([\w$]+)\s*=/.exec(l);
      if (m) out.add(m[1]);
      m = /^  ([\w$]+),$/.exec(l);
      if (m) out.add(m[1]);
    });
    return out
  }
  async function staticPhase () {
    const built = await P.build();
    await expect('查源码', '编译产物并查漏模块', async () => {
      new vm.Script(built.code, { filename: P.ARTIFACT });
      const missing = P.unlinked(built.inputs);
      assert(!missing.length, '这些模块没进图：' + missing.join(','));
      return '压缩后 ' + Math.round(Buffer.byteLength(built.code) / 1024) + ' KB / 图里有 ' + built.inputs.length + ' 个模块，import 全部由打包器解析'
    });
    if (targetPath === path.resolve(P.OUT, P.ARTIFACT)) {
      await expect('查源码', '比产物新鲜度', () => {
        const onDisk = fs.readFileSync(targetPath, 'utf8');
        if (onDisk === built.code) { return P.ARTIFACT + ' 与源码一致' }
        const a = onDisk.split('\n'), b = built.code.split('\n');
        let i = 0;
        while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
        throw new Error('产物比 src 旧，第 ' + (i + 1) + ' 行起不一致：磁盘「' + (a[i] || '<无>').trim().slice(0, 50) + '」/ 现构建「' + (b[i] || '<无>').trim().slice(0, 50) + '」');
      });
    }
    await expect('查源码', '收齐模块清单', () => {
      const listed = fs.readFileSync(path.join(P.SRC, LIST_MODULE), 'utf8');
      const gone = P.modules().filter(f => f !== LIST_MODULE && !listed.includes('from "./' + f.replace(/\.ts$/, '') + '"'));
      assert(!gone.length, 'internals 的名单里没有：' + gone.join(','));
      return P.modules().length + ' 个模块的导出面全部可寻址';
    });
    await expect('查源码', '过全仓 tsc', () => {
      const t = P.typecheck();
      const lines = P.typeErrors(t);
      assert(t.ok, 'tsc 还有 ' + lines.length + ' 条报错：\n  ' + lines.slice(0, 5).join('\n  '));
      return 'tsconfig.json 覆盖 源码 + scripts，全绿';
    });
    await expect('查源码', '查 Node 泄漏', () => {
      const forbidden = [/from "node:/, /\brequire\s*\(/, /\bprocess\./, /\b__dirname\b/, /\bBuffer\s*\(/, /new Buffer\b/];
      const bad = [];
      P.modules().forEach(f => {
        const s = fs.readFileSync(path.join(P.SRC, f), 'utf8');
        forbidden.forEach(re => { const m = re.exec(s); if (m) { bad.push(f + ' 里出现 ' + m[0].trim()) } });
      });
      assert(!bad.length, bad.join(' / '));
      return P.modules().length + ' 个模块里没有 Node 专属东西';
    });
    const classMembers: { [ctl: string]: Set<string> } = {};
    await expect('查源码', '查类与构造次序', () => {
      const entry = fs.readFileSync(path.join(P.SRC, 'Entry.ts'), 'utf8');
      [...CONTROLLERS, ...SUPPORT_CTLS].forEach(([cls, ctl, factory]) => {
        assert(source.includes(`export class ${cls} {`), `缺少类 ${cls}`);
        assert(new RegExp(`^export let ${ctl} = null;$`, 'm').test(source), `缺少可寻址单例 ${ctl}`);
        assert(new RegExp(`^export const ${factory} = \\(\\) => \\{ ${ctl} = new ${cls}\\(\\); return ${ctl} \\};$`, 'm').test(source), `缺少单例工厂 ${factory}`);
        assert(entry.includes(factory), `${factory} 没有被入口按序构造`);
        classMembers[ctl] = classApi(cls);
        assert(classMembers[ctl].size > 3, `${cls} 一个成员都没解析到`);
      });
      const order = (/CAPABILITY_CONTROLLERS = \[([^\]]*)\]/.exec(entry) || [, ''])[1].split(',').map(s => s.trim()).filter(Boolean);
      assert(order.join(',') === CONTROLLERS.map(c => c[2]).join(','), '入口的构造次序与用例的控制器清单不同序：' + order.join(','));
      return (CONTROLLERS.length + SUPPORT_CTLS.length) + ' 个能力类，构造次序全部在 Entry.ts';
    });
    await expect('查源码', '按表生成滤镜动作', () => {
      assert(/PictureControl\.prototype\[def\.name/.test(source), '滤镜动作不再按 filterDefs 生成到 PictureControl.prototype 上');
      const apis = [...source.matchAll(/^  \{ name: '(\w+)',/gm)].map(m => m[1]);
      const generated = apis.flatMap(name => [name, name + 'Up', name + 'Down']);
      assert(generated.join(',') === FILTER_SHELLS.join(','), 'filterDefs 生成的动作名与契约不符：' + generated.join(','));
      generated.forEach(n => classMembers.picture.add(n));
      return apis.length + ' 组滤镜 / ' + generated.length + ' 个动作名';
    });
    await expect('查源码', '按表生成锁定动作', () => {
      assert(/TunerControl\.prototype\['lock' \+ api\]/.test(source), '锁定动作不再按 mediaProps 生成到 TunerControl.prototype 上');
      const line = (source.match(/^export const mediaProps = \{.*\};$/m) || [''])[0];
      assert(line, '找不到 mediaProps 这张表（三个受控属性的状态落点应只写一处、并压成一行）');
      const props = [...line.matchAll(/(?:\{ |, )(\w+): \(\) =>/g)].map(m => m[1]);
      const generated = props.flatMap(n => ['lock' + UtilsFirstUpper(n), 'unlock' + UtilsFirstUpper(n), 'locked' + UtilsFirstUpper(n)]);
      assert(generated.join(',') === LOCK_SHELLS.join(','), 'mediaProps 生成的动作名与契约不符：' + generated.join(','));
      const count = re => lines.filter(l => re.test(l)).length;
      assert(/^  lock \(prop, timeout = 200\) \{$/m.test(source) && /^  unlock \(prop\) \{$/m.test(source) && /^  locked \(prop\) \{$/m.test(source), '锁定三件套又开始收 info 了');
      assert(count(/, tuner\.(playbackRateInfo|volumeInfo|timeInfo\(\)),/) === 0, 'directSet 的调用点又把手上的 info 传进去了');
      assert(count(/const mediaProps = \{/) === 1, 'mediaProps 这张表不止一处');
      assert(count(/replace\(\/\^\\S\//) === 1, '首字母大写的派生不止一处实现');
      generated.forEach(n => classMembers.tuner.add(n));
      return props.length + ' 个受控属性 / ' + generated.length + ' 个锁定动作名';
    });
    await expect('查源码', '查已删组合根', () => {
      const code = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert(!/^(?:export )?const r6Player\b/m.test(code), '组合根 const r6Player 又回来了');
      assert(!/\br6Player\.[\w$]+/.test(code), '还有 r6Player.X 的调用（文案里的 r6Player 字样不受限）');
      assert(!/^(?:export )?const capabilities = \[/m.test(code), '能力委派表又回来了');
      assert(!/const t = r6Player;/.test(code), '又给组合根起了个别名 t');
      assert(!/\.\.\.args\) => \w+Ctl\[/.test(code), '又出现逐个方法手写转发箭头');
      assert(!/initInstance ?\([^)]/.test(code), 'initInstance 又带上参数了：' + (code.match(/initInstance ?\([^)]*\)/g) || []).join(', '));
      assert(!/activePlayer\.playerInstance *=/.test(code.replace(/takeInstance \(el\) \{ activePlayer\.playerInstance = el;[^}]*/, '')), '认领实例又绕过 takeInstance 直接赋值了');
      return '能力直达单例，只保留按键命令派发一处';
    });
    await expect('查源码', '查 h5 命名空间', () => {
      const code = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert(!/^(?:export )?const h5 = \{/m.test(code), '能力类命名空间 const h5 又回来了');
      assert(!/\bh5\b/.test(code), '代码里还有独立标识符 h5（站点任务应直接收 taskConf/data）');
      assert(!/window\.name *=/.test(code), '又往 window.name 上写脚本身份');
      assert(!/\.name\s*=\s*(['"])h5/i.test(code), '又往某个 window 别名上写脚本身份：' + (code.match(/\.name\s*=\s*(['"])h5[^;]*/i) || [''])[0]);
      ['_r6Player', '_r6PlayerInFrame', '_hasInitFullPageStyle_', '__r6playerContextMenuInit__'].forEach(name => {
        assert(!new RegExp('window\\.' + name + '\\b').test(code), `页面全局 window.${name} 又出现了`);
      });
      const writes = (code.match(/window\.[_$a-zA-Z]*[Hh]5[_$a-zA-Z]* *=/g) || [] as string[]).filter(w => !w.includes('__setR6PlayerCustomConfiguration__'));
      assert(!writes.length, '又出现带 h5 字样的页面全局：' + writes.join(', '));
      const leaks = (code.match(/unsafeWindow\.__[a-zA-Z]* *=/g) || [] as string[]).filter(w => !w.includes('__setR6PlayerCustomConfiguration__'));
      assert(!leaks.length, '往页面上多写了一个注入接口：' + leaks.join(', '));
      return '页面全局只剩上游机制那几个，注入接口仍是一个';
    });
    await expect('查源码', '查全局状态归属', () => {
      const bad = new Set<string>();
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        Object.keys(STATE_OWNER).forEach(name => {
          const re = new RegExp('\\b([\\w$]+Ctl|configManager)\\.' + name + '\\b', 'g');
          let m;
          while ((m = re.exec(l))) {
            if (m[1] !== STATE_OWNER[name] && !(STATE_OWNER[name] === 'hotkeyCtl' && /this\./.test(l))) bad.add(m[1] + '.' + name + '(第' + (i + 1) + '行)');
          }
        });
      });
      assert(!bad.size, '状态归属不对: ' + [...bad].join(', '));
      return 'ok';
    });
    await expect('查源码', '解析 ctl.X 引用', () => {
      const bad = new Set<string>();
      const re = new RegExp('\\b(' + CTL_NAMES.join('|') + ')\\.([\\w$]+)', 'g');
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        let m; re.lastIndex = 0;
        while ((m = re.exec(l))) {
          if (classMembers[m[1]].has(m[2])) continue;
          if (new RegExp(m[1] + '\\.' + m[2] + '\\s*=[^=]').test(l)) continue;
          bad.add(m[1] + '.' + m[2] + '(第' + (i + 1) + '行)');
        }
      });
      assert(!bad.size, [...bad].join(', '));
      return CTL_NAMES.length + ' 个单例的引用全部可解析';
    });
    await expect('查源码', '查 this 依赖', () => {
      const bad = [];
      CONTROLLERS.forEach(([cls]) => {
        const r = blockRange(`export class ${cls} {`);
        const cs = lines.findIndex((l, i) => i >= r[0] && i <= r[1] && /^  constructor \(\) \{/.test(l));
        let ce = cs, depth = 0;
        for (let i = cs; i <= r[1]; i++) { for (const c of lines[i]) { if (c === '{') depth++; else if (c === '}') { depth--; if (!depth) { ce = i; break } } } if (ce > cs) break }
        for (let i = ce + 1; i <= r[1]; i++) { const m = /\bthis\.([\w$]+)/.exec(lines[i]); if (m) bad.push(cls + ':' + (i + 1) + ' this.' + m[1]) }
      });
      assert(!bad.length, bad.join(', '));
      return '0 处残留';
    });
    await expect('查源码', '覆盖按键动作表', () => {
      const all = new Set(Object.values(classMembers).flatMap(s => [...s]));
      all.add('debuggerNow');
      const bad = new Set();
      lines.forEach(l => {
        const m = /command:\s*'([\w$]+)'/.exec(l);
        if (m && !all.has(m[1])) bad.add(m[1]);
      });
      assert(!bad.size, '默认快捷键配置里找不到对应方法: ' + [...bad].join(', '));
      FILTER_SHELLS.forEach(n => assert(all.has(n), '成员清单里缺滤镜动作 ' + n));
      assert(/^export const hotkeyCommands = Object\.create\(null\);$/m.test(source), '派发表应当是一张空的平表，内容由 buildCommands 填');
      const i = lines.findIndex(l => /^export const buildCommands = /.test(l));
      assert(i >= 0, '未找到 buildCommands');
      const text = lines.slice(i, i + 16).join('\n');
      CTL_NAMES.forEach(ctl => assert(text.includes(ctl), 'buildCommands 未纳入 ' + ctl));
      assert(/Object\.getOwnPropertyNames\(Object\.getPrototypeOf\(ctl\)\)/.test(text), '派发表不再从能力类原型推导');
      return all.size + ' 个可派发成员';
    });
    await expect('查源码', '查已删能力', () => {
      assert(!/\bzhText\b/.test(source), 'i18n 文案表又回来了');
      assert(!/GM_registerMenuCommand\s*\(/.test(source), '油猴注册菜单又回来了');
      const codeOnly = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert(!/r6playerUI|floating-ui|remoteHelper/.test(codeOnly), '图形界面 / 远程助手又回来了');
      return 'ok';
    });
    await expect('查源码', '查快捷键来源', () => {
      const codeOnly = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      ['PLAIN_KEY_ACTIONS', 'SHIFT_KEY_ACTIONS', 'SHIFT_MOVE_ACTIONS', 'USED_KEYS', 'runKeyAction'].forEach(name => {
        assert(!new RegExp('\\b' + name + '\\b').test(codeOnly), '手写按键表 ' + name + ' 又回来了');
      });
      assert(/^  findBinding \(event\)/m.test(codeOnly), '缺少 HotkeyControl.findBinding');
      const idx = lines.findIndex(l => /^  keyIndex \(\) \{/.test(l));
      assert(idx >= 0, '缺少 HotkeyControl.keyIndex');
      const body = lines.slice(idx, idx + 8).join('\n');
      assert(/configManager\.get\('hotkeys'\)/.test(body), 'keyIndex 读的若不是 hotkeys 配置，就有第二份来源');
      assert(/configManager\.revision/.test(body), 'keyIndex 没有按配置版本号失效');
      assert(!/_indexSource_/.test(codeOnly), '按键索引又退回按对象身份判等（读不到缓存）');
      const ts = lines.findIndex(l => /^  playerTrigger \(player, event\) \{/.test(l));
      assert(ts >= 0, '未找到 HotkeyControl.playerTrigger');
      const trigger = lines.slice(ts, ts + 14).join('\n');
      assert(/findBinding/.test(trigger), '兜底派发没有走 findBinding');
      assert(/stopPropagation/.test(trigger) && /preventDefault/.test(trigger), '兜底派发不再吞掉命中按键的默认事件');
      const hs = lines.findIndex(l => /^    hotkeys: \[/.test(l));
      assert(hs >= 0, '未找到默认 hotkeys 配置');
      const all = new Set(Object.values(classMembers).flatMap(s => [...s]));
      all.add('debuggerNow');
      const bad = [];
      let single = 0;
      let sequence = 0;
      for (let i = hs + 1; i < lines.length && !/^\s*\],/.test(lines[i]); i++) {
        const k = /key:\s*'([^']*)'/.exec(lines[i]);
        if (k && /\s/.test(k[1].trim())) sequence++;
        else if (k) single++;
        const c = /command:\s*'([\w$]+)'/.exec(lines[i]);
        if (c && !all.has(c[1])) bad.push(c[1]);
      }
      assert(!bad.length, '配置里引用了不可派发的命令: ' + bad.join(', '));
      assert(single + sequence >= 50, '只数到 ' + (single + sequence) + ' 个绑定，默认配置至少应有 50 个');
      return single + ' 个绑定全部由索引命中，' + sequence + ' 个多段序列交给 runner';
    });
    await expect('查源码', '查动作只写一次', () => {
      const r = blockRange('  static buildTree () {');
      assert(r, '未找到 buildTree 的完整块');
      const body = lines.slice(r[0], r[1] + 1);
      const closures = body.filter(l => /fn: \(\) =>/.test(l));
      assert(!closures.length, '菜单树里又出现手写动作闭包：' + closures.length + ' 处');
      const cmd = body.filter(l => /menuCmd\(/.test(l)).length;
      assert(cmd >= 30, '菜单动作只有 ' + cmd + ' 处走 menuCmd，多数仍在各写一遍');
      assert(/^export const menuCmd = /m.test(source) && /runCommand\(command, args\)/.test(source), 'menuCmd 没有接到 runCommand 上');
      assert(/^export const runCommand = /m.test(source), '未找到 runCommand 派发出口');
      const bare = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).filter(l => /location\.reload\(\)/.test(l));
      assert(bare.length <= 2, 'reload 散落在 ' + bare.length + ' 处，应收进 applyReload');
      ['「全局设置」', '「仅用于此网站」'].forEach(t => {
        const ns = lines.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => l.includes(t) && !/^\s*(\/\/|\*|\/\*)/.test(l));
        assert(ns.length === 1 && /const configScope/.test(ns[0][1]), t + ' 写了 ' + ns.length + ' 处（行 ' + ns.map(x => x[0]).join(',') + '），应只在 configScope 里');
      });
      const exp = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).filter(l => /window\.confirm\(|original\.confirm\(|original\.prompt\(|original\.alert\(/.test(l));
      assert(!exp.length, '二次确认/弹框又回来了：' + exp.map(l => l.trim().slice(0, 60)).join(' / '));
      return '菜单动作 ' + cmd + ' 处走 menuCmd，reload 剩 ' + bare.length + ' 处，无确认弹框';
    });
    await expect('查源码', '查工具命名空间', () => {
      ['ObjUtil', 'DomUtil', 'MediaUtil', 'EnvUtil', 'FnUtil'].forEach(n => {
        assert(!new RegExp('\\b' + n + '\\b').test(source), n + ' 又分出去了，工具应收在 Utils 里');
      });
      const r = blockRange('export class Utils {');
      assert(r, '未找到 class Utils');
      const body = lines.slice(r[0], r[1] + 1);
      const members = body.filter(l => /^  static /.test(l));
      assert(members.length >= 35, 'Utils 只有 ' + members.length + ' 个静态成员，域分组疑似丢了一段');
      const sections = body.filter(l => /^  \/\/ — /.test(l));
      assert(sections.length === 5, 'Utils 内部分段应有 5 段，实际 ' + sections.length);
      const inline = lines.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => /Object\.prototype\.toString\.call/.test(l) && (l.includes('[object Object]') || l.includes('[object Array]')));
      assert(inline.length <= 2, '散落的判型写法 ' + inline.length + ' 处（行 ' + inline.map(x => x[0]).join(',') + '）');
      return members.length + ' 个成员 / ' + sections.length + ' 个分段';
    });
    await expect('查源码', '查顶层类清单', () => {
      const names = (source.match(/^export class ([\w$]+) \{/gm) || []).map(l => l.slice(13, -2));
      const want = ['Utils', 'PageBridge', 'ConfigManager', 'TaskControl', 'FullScreen', 'HotkeysRunner',
        'PlayerControl', 'MenuControl', 'TunerControl', 'Amplifier', 'PictureControl', 'InputControl',
        'MediaCore', 'SourceControl'];
      assert(names.length === want.length, '顶层类 ' + names.length + ' 个，应为 ' + want.length + ' 个：' + names.join(','));
      const missing = want.filter(n => !names.includes(n));
      const extra = names.filter(n => !want.includes(n));
      assert(!missing.length && !extra.length, '类清单漂移，缺少 [' + missing + '] 多出 [' + extra + ']');
      const perFile = P.modules().map((f): [string, number] => [f, (fs.readFileSync(path.join(P.SRC, f), 'utf8').match(/^export class /gm) || []).length]);
      const crowded = perFile.filter(([, n]) => n > 3).map(([f, n]) => f + '(' + n + ')');
      assert(!crowded.length, '一个文件里塞了超过 3 个类：' + crowded.join(','));
      assert(!/\bTaskControlCenter\b/.test(source), '任务配置中心仍叫 TaskControlCenter');
      assert((source.match(/customTaskControlCenter/g) || []).length === 1, '外部注入字段 customTaskControlCenter 应当只被读取一次');
      return names.join(' / ');
    });
    await expect('查源码', '查单语句块', () => {
      const mask = codeMask(source);
      const codeOf = i => lines[i].split('').filter((ch, j) => mask[i] && mask[i][j]).join('');
      const left = [], tooLong = [], tooDeep = [];
      for (let i = 0; i + 2 < lines.length; i++) {
        const h = codeOf(i), b = codeOf(i + 1), c = codeOf(i + 2);
        if (!/\{\s*$/.test(h) || /\}\s*$/.test(h)) { continue }
        if (!b.trim() || lines[i + 1].includes('//') || /^\s*\*/.test(lines[i + 1])) { continue }
        if (!/^\s*\}(?:[,;)]*\s*| (?:else|catch|finally)\b.*)$/.test(c)) { continue }
        const merged = lines[i].replace(/\s*\{\s*$/, '') + '{ ' + lines[i + 1].trim() + ' ' + lines[i + 2].trim();
        if (merged.length > 200) { tooLong.push(i + 1); continue }
        if ((b.match(/\{/g) || []).length > 1) { tooDeep.push(i + 1); continue }
        left.push(i + 1);
      }
      assert(!left.length, '还有 ' + left.length + ' 处三行单语句块没压平：行 ' + left.join(','));
      const blank = lines.filter(l => !l.trim()).length;
      assert(!blank, '又出现 ' + blank + ' 个空行');
      return '总 ' + lines.length + ' 行、无空行；超长保留 ' + tooLong.length + ' 处、深嵌套保留 ' + tooDeep.length + ' 处';
    });
    await expect('查源码', '查多行字面量', () => {
      const mask = codeMask(source);
      const codeOf = i => lines[i].split('').filter((ch, j) => mask[i] && mask[i][j]).join('');
      const left = [], tooLong = [];
      for (let i = 0; i + 2 < lines.length; i++) {
        const open = codeOf(i).trimEnd();
        if (!/[\{\[]$/.test(open)) { continue }
        const want = open.slice(-1) === '{' ? '}' : ']';
        let d = 0;
        let end = -1;
        for (let j = i; j < Math.min(i + 12, lines.length); j++) {
          for (const ch of codeOf(j)) { if ('{(['.includes(ch)) d++; else if ('}])'.includes(ch)) d-- }
          if (j > i && d === 0) { end = j; break }
          if (d < 0) break
        }
        if (end < 0) { continue }
        if (!new RegExp('^\\s*' + '\\' + want + '[,;)]*\\s*$').test(codeOf(end))) { continue }
        const stem = open.slice(0, -1).replace(/\s+$/, '');
        if (stem && !/(=|:|\(|,|\[|\|\||&&|\?)$/.test(stem) && !/\breturn$/.test(stem)) { continue }
        let members = true;
        for (let j = i + 1; j < end - 1; j++) { if (!/,$/.test(codeOf(j).trimEnd())) { members = false } }
        if (!members || !codeOf(end - 1).trim()) { continue }
        if (lines.slice(i, end + 1).some(l => /(^|[^:\\])\/\/|\/\*/.test(l))) { continue }
        const merged = ' '.repeat((/^\s*/.exec(lines[i]) || [''])[0].length) + lines.slice(i, end + 1).map(l => l.trim()).join(' ').replace(/\s+/g, ' ');
        if (merged.length > 200) { tooLong.push(i + 1); continue }
        left.push(i + 1);
      }
      assert(!left.length, '还有 ' + left.length + ' 处多行字面量可以压平：行 ' + left.slice(0, 12).join(','));
      return '字面量已全部压平；超长保留 ' + tooLong.length + ' 处'
    });
    await expect('查源码', '查单处实现', () => {
      const code = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l));
      const count = re => code.filter(l => re.test(l)).length;
      assert(count(/^(?:export )?const blocksSet = name =>/) === 1, 'blocksSet() 判定应恰好一处，实际 ' + count(/^(?:export )?const blocksSet = name =>/) + ' 处');
      assert(count(/'enhance.blockSet'/) === 1, "blocksSet() 里拼接配置键的字面量应恰好一处，实际 " + count(/'enhance.blockSet'/) + " 处");
      ['blockSetVolume', 'blockSetPlaybackRate', 'blockSetCurrentTime'].forEach(k => {
        const ns = code.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => l.includes("enhance." + k + "'"));
        assert(ns.length === 1, k + ' 的配置键应只剩菜单开关一处，实际 ' + ns.length + ' 处，行 ' + ns.map(x => x[0]).join(','));
      });
      assert(count(/listPlayers\(\)\.forEach/) === 1, '遍历其它媒体实例的循环不止一处');
      assert(count(/api.setPlaybackRate|api.setVolume/) === 2, '跨实例同步的动作数不符');
      assert(count(/timeInfo = .*timeInfo \|\| \{\}/) === 1, 'timeInfo 的兜底初始化写了多遍');
      assert(count(/replace\(\/\[\\\\\/:\*\?"<>\|\]\/g/) === 1, '文件名非法字符的清洗写了多遍');
      assert(/^  static setTitle /m.test(source) && count(/Utils\.setTitle\(/) === 2, '站点标题写入没有都走 Utils.setTitle（应有 2 个站点任务调用）');
      assert(count(/new Proxy\(/) === 0, '构造 Proxy 必须一律走 original.Proxy，还有 ' + count(/new Proxy\(/) + ' 处用了裸 Proxy');
      assert(count(/new original\.Proxy\(/) >= 5, 'original.Proxy 的构造点少于一半，快照没被统一使用');
      assert(count(/document\.querySelector\(sel\)/) === 1, '藏水印的查询只该在 watermarkTask 里出现一次，实际 ' + count(/document\.querySelector\(sel\)/) + ' 处');
      assert(count(/init: watermarkTask\(/) === 2, 'youku/qq 两家的 init 该由 watermarkTask 给出，实际 ' + count(/init: watermarkTask\(/) + ' 处');
      assert(count(/: facebookTask,/) === 2, 'facebook 的全屏与网页全屏该指向同一个实现，实际 ' + count(/: facebookTask,/) + ' 处');
      const swallowLines = lines.filter(l => /catch \([a-z]+\) \{ *\}/.test(l));
      assert(swallowLines.length === 1 && /proto\[key\] instanceof Function/.test(swallowLines[0]), '空 catch 只该剩 snapMethods 那一个探针位，实际 ' + swallowLines.length + ' 处');
      assert(!/getPageWindow|_pageWindow|__rawFunction__/.test(source), '取页面真实 window 的机器已随 mountToGlobal 一起删除，不该有人再读 _pageWindow');
      return '门禁 3 个判定、跨实例同步 1 处、进度锁状态 1 处、标题清洗 1 处、裸 Proxy 0 处、空 catch 1 处';
    });
    await expect('查源码', '解析静态成员引用', () => {
      const statics = {};
      lines.forEach((l, i) => {
        const c = /^(?:export )?class ([\w$]+) \{/.exec(l);
        if (c) {
          const range = blockRange(l);
          statics[c[1]] = new Set(lines.slice(range[0], range[1] + 1)
            .map(x => /^  static (?:async )?(?:get |set )?([\w$]+)/.exec(x))
            .filter(Boolean).map(x => x[1]));
        }
      });
      const names = Object.keys(statics);
      if (!names.length) { throw new Error('一个静态成员都没解析到') }
      const bad = new Set();
      lines.forEach((l, i) => {
        if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
        const re = new RegExp('\\b(' + names.join('|') + ')\\.([\\w$]+)', 'g');
        let m;
        while ((m = re.exec(l))) {
          const cls = m[1], prop = m[2];
          if (['prototype', 'name', 'length', 'call', 'apply', 'bind'].includes(prop)) continue;
          if (statics[cls].has(prop)) continue;
          if (new RegExp(cls + '\\.' + prop + '\\s*=[^=]').test(l)) continue;
          bad.add(cls + '.' + prop + '(第' + (i + 1) + '行)');
        }
      });
      assert(!bad.size, '静态成员引用无法解析: ' + [...bad].join(', '));
      return names.filter(n => statics[n].size).map(n => n + '(' + statics[n].size + ')').join(', ');
    });
    await expect('查源码', '查日志出口', () => {
      const codeOnly = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l)).join('\n');
      assert(!/\bconsole\s*\.\s*(error|warn|info|table)\s*\(/.test(codeOnly), '仍有直接调用 console.error/warn/info 的日志');
      assert(!/\bdebug\s*\(/.test(codeOnly), 'debug() 间接出口又回来了，日志应直出 console.log');
      assert(!/^export const debug =/m.test(codeOnly), 'debug() 统一出口又回来了');
      const bad = lines.filter(l => !/^\s*(\/\/|\*|\/\*)/.test(l) && /console\.log\(/.test(l) && !/console\.log\((msg,\s*)?['"]\[[A-Z][a-z]+\]/.test(l) && !/const msg = '\[[A-Z][a-z]+\]/.test(l));
      assert(!bad.length, '日志未按「[文件名] 名词+动词」开头：' + bad.map(l => l.trim().slice(0, 80)).join(' / '));
      return '日志 ' + (codeOnly.match(/\bconsole\.log\(/g) || []).length + ' 处全部直出 console.log，前缀统一 [文件名]';
    });
    await expect('查源码', '查顶层 function', () => {
      const leaked = lines.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => /^(?:export )?(?:async )?function /.test(l));
      assert(!leaked.length, '顶层 function 声明: ' + leaked.map(([n, l]) => n + ':' + l.trim()).join(', '));
      const alias = lines.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => /^  ([\w$]+) = \1\s*$/.test(l));
      assert(!alias.length, '把函数别名挂成类字段: ' + alias.map(([n, l]) => n + ':' + l.trim()).join(', '));
      const dollar = lines.map((l, i): [number, string] => [i + 1, l]).filter(([, l]) => /\b[\w$]+\$1\b/.test(l));
      assert(!dollar.length, '打包残留命名: ' + dollar.map(([n, l]) => n + ':' + l.trim()).join(', '));
      return '工具函数全部收在静态类里，入口为词法绑定';
    });
    await expect('查源码', '查空行', () => {
      const blank = lines.filter(l => /^\s*$/.test(l)).length;
      assert(blank === 0, `存在 ${blank} 个空行，需要重新压缩`);
      return 'ok';
    });
    return { classMembers };
  }

  function rebindMediaMethods (ctx, media) {
    const proto = Object.getPrototypeOf(Object.getPrototypeOf(media));
    const forward = vm.runInContext('(fn) => function () { return fn.apply(this, arguments) }', ctx);
    ['play', 'pause', 'load'].forEach(name => {
      if (typeof proto[name] === 'function') { proto[name] = forward(proto[name]) }
    });
  }
  function rebindHostFunctions (ctx, sandbox) {
    const forward = vm.runInContext('(fn) => function () { return fn.apply(this, arguments) }', ctx);
    Object.keys(sandbox).filter(name => /^GM_/.test(name)).forEach(name => { sandbox[name] = forward(sandbox[name]) });
  }
  function load (opts, code?) {
    const distCode = code || fs.readFileSync(targetPath, 'utf8');
    const { sandbox, media, errors } = buildSandbox({ source: distCode, targetPath, opts: opts || {} });
    const ctx = vm.createContext(sandbox);
    vm.runInContext(makeStorageBootstrap() + '(globalThis.__storageSeed)', ctx);
    rebindMediaMethods(ctx, media);
    rebindHostFunctions(ctx, sandbox);
    let loadError = null;
    try { new vm.Script(distCode, { filename: TARGET }).runInContext(ctx) } catch (e) { loadError = e }
    if (sandbox.__playerInternals) { Object.assign(sandbox, sandbox.__playerInternals) }
    return { ctx, sandbox, media, errors, loadError, run: body => vm.runInContext('(' + body + ')', ctx)() };
  }
  function shuffleImports (text, seed) {
    let s = seed;
    const rnd = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 };
    const lines = text.split('\n');
    const at = lines.map((l, i) => /^import /.test(l) ? i : -1).filter(i => i >= 0);
    const picked = at.map(i => lines[i]);
    for (let i = picked.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [picked[i], picked[j]] = [picked[j], picked[i]] }
    at.forEach((lineIndex, k) => { lines[lineIndex] = picked[k] });
    return lines.join('\n')
  }
  function fingerprint (built) {
    const body = built.body;
    let h = 0;
    for (let i = 0; i < body.length; i++) { h = (h * 31 + body.charCodeAt(i)) | 0 }
    return body.length + ':' + h
  }
  const LIST_MODULE = 'Entry.ts';
  function exportedNames () {
    return P.modules().filter(f => f !== LIST_MODULE).flatMap(f => [...fs.readFileSync(path.join(P.SRC, f), 'utf8')
      .matchAll(/^export (?:const|let|var|class|function\*?) ([A-Za-z_$][\w$]*)/gm)].map(m => m[1]))
  }
  async function runtimePhase () {
    const env = load({});
    await expect('跑桩内', '在浏览器桩里加载', () => {
      assert(!env.loadError, env.loadError && (env.loadError.message + ' @ ' + String(env.loadError.stack).split('\n')[1]));
      const noisy = env.sandbox.__errs.filter(e => !/favicon|Clipboard|not allowed/i.test(e));
      assert(!noisy.length, noisy.join(' | '));
      // 沙盒没有 styleSheets，站点人机验证判定必然走 catch（catch 本就是给这类受限环境兜底的），不算失败日志
      const badLogs = env.sandbox.__consoleErrors.filter(e => !/\[Boot\] 页面判定异常/.test(e));
      assert(!badLogs.length, '加载期出现失败类日志：' + badLogs.join(' | '));
      return '无异常、无报错日志'
    });
    await expect('跑桩内', '查生成的动作', () => {
      const shells = FILTER_SHELLS.concat(LOCK_SHELLS).map(n => `'${n}'`).join(',');
      const gone = env.run('() => [' + shells + '].filter(n => ![PictureControl, TunerControl].some(c => Object.getOwnPropertyNames(c.prototype).includes(n)) || typeof hotkeyCommands[n] !== "function")');
      assert(!gone.length, '生成的动作没落到原型上或没进派发表：' + gone.join(','));
      const 锁 = env.run('() => { tuner.lockPlaybackRate(3000); const r = [tuner.lockedPlaybackRate(), tuner.setSpeed(2)]; tuner.unlockPlaybackRate(); return JSON.stringify([r[0], r[1] === false, tuner.lockedPlaybackRate()]) }');
      assert(锁 === '[true,true,false]', '锁定/解锁链路不对：' + 锁);
      const retired = env.run('() => ["disableHotkeysTemporarily", "enableHotkeys", "off"].filter(n => typeof hotkeyCommands[n] === "function")');
      assert(!retired.length, '已删除的方法仍在派发表上：' + retired.join(','));
      return FILTER_SHELLS.length + LOCK_SHELLS.length + ' 个生成动作可派发，3 个死方法已下线'
    });
    const api = env.run(`() => ({ ctls: [${CONTROLLERS.map(c => `'${c[1]}'`).join(',')}].filter(n => typeof eval(n) === "object"), support: ['configManager', 'mediaCore', 'mediaSource'].filter(n => typeof eval(n) === "object"), commands: Object.keys(hotkeyCommands).length, tcc: typeof taskCenter !== "object" ? "null" : Object.keys(taskCenter.conf).length, winName: String(window.name || ''), taskArgs: taskConf['acfun.cn'].switchPlay.length, escArgs: escapeTask(() => {}).callback.length })`);
    const stale = RETIRED_CTLS.filter(n => env.run('() => typeof ' + n) === 'object');
    await expect('跑桩内', '查单例寻址', () => {
      assert(api.ctls.length === CONTROLLERS.length, '可用单例只有 ' + api.ctls.length + ' 个，应为 ' + CONTROLLERS.length);
      assert(!stale.length, '仍有已合并单例的残留引用：' + stale.join(','));
      assert(api.support.length === 3, '配置/媒体核心/媒体源三个支撑单例不全：' + api.support.join(','));
      assert(api.commands >= 90, '按键命令派发表只有 ' + api.commands + ' 条');
      assert(!/r6player/i.test(api.winName), '脚本又往 window.name 上写了自己的身份：' + api.winName);
      assert(api.taskArgs === 0 && api.escArgs === 2, `任务回调签名不再是 (taskConf, data)：acfun ${api.taskArgs} 形参 / Esc 壳 ${api.escArgs} 形参`);
      return `${CONTROLLERS.length} 个控制器单例 + 3 个支撑单例 / 可派发命令 ${api.commands} 个 / 站点任务配置 ${api.tcc} 个`;
    });
    await expect('跑桩内', '双向对导出名', () => {
      const have = new Set(Object.keys(env.sandbox.__playerInternals || {}));
      const want = [...new Set(exportedNames())];
      const lost = want.filter(n => !have.has(n));
      assert(!lost.length, '寻址面里找不到：' + lost.join(','));
      const extra = [...have].filter(n => !want.includes(n));
      assert(!extra.length, '寻址面里有源码没导出的名字（手写名单才会这样）：' + extra.join(','));
      return want.length + ' 个导出名，两个方向都齐';
    });
    await expect('跑换序', '换序后重跑', async () => {
      const base = Object.keys(env.sandbox.__playerInternals).length;
      const list = P.modules();
      const sources = { 'Entry.ts': fs.readFileSync(path.join(P.SRC, 'Entry.ts'), 'utf8') };
      list.forEach(f => { sources[f] = fs.readFileSync(path.join(P.SRC, f), 'utf8') });
      const bad = [];
      const orders = new Set();
      for (const seed of [7, 42, 2026, 99]) {
        const overrides = {};
        list.forEach((f, i) => { overrides[f] = shuffleImports(sources[f], seed + i) });
        const built = await P.bundle({ entrySource: shuffleImports(sources['Entry.ts'], seed), overrides });
        orders.add(fingerprint(built));
        const e = load({}, built.code);
        if (e.loadError) { bad.push('种子 ' + seed + '：装载抛 ' + e.loadError.message); continue }
        const got = Object.keys(e.sandbox.__playerInternals || {}).length;
        if (got !== base) { bad.push('种子 ' + seed + '：寻址面只有 ' + got + ' 个名字，应为 ' + base + '（登记时模块还没求值完）'); continue }
        const failed = [];
        for (const c of cases.filter(x => !x.disabledSite)) {
          try { await e.run(c.body) } catch (err) { failed.push(c.name + ' :: ' + err.message) }
        }
        const cmds = e.run('() => Object.keys(hotkeyCommands).length');
        if (cmds !== api.commands) { failed.push('可派发命令 ' + cmds + ' 条，应为 ' + api.commands) }
        if (failed.length) { bad.push('种子 ' + seed + '：' + failed.length + ' 条用例红 —— ' + failed.slice(0, 3).join(' | ')) }
      }
      assert(!bad.length, bad.join('\n  '));
      assert(orders.size >= 3, '4 种书写顺序只产出 ' + orders.size + ' 种不同的产物，置换门等于没测');
      return orders.size + ' 种书写顺序 × ' + (cases.length - cases.filter(c => c.disabledSite).length) + ' 条用例全绿：寻址面 ' + base + ' 个名字 / 可派发命令 ' + api.commands + ' 条';
    });
    for (const c of cases.filter(c => !c.disabledSite)) {
      await expect('运行·' + c.group, c.name, () => env.run(c.body));
    }
    const disabled = load({ config: { enable: false } });
    await expect('跑禁用', '查禁用生效', () => {
      assert(!disabled.loadError, disabled.loadError && disabled.loadError.message);
      return 'ok';
    });
    for (const c of cases.filter(c => c.disabledSite)) {
      await expect('运行·禁用站点', c.name, () => disabled.run(c.body));
    }
  }

  async function main () {
    assert(cases.length >= 59, `用例应有 59 条以上，实际 ${cases.length} 条：改 cases.ts 时可能删掉了某条`);
    assert(cases.filter(c => c.disabledSite).length >= 3, '禁用场景用例不足 3 条：正常启用与禁用必须成对跑');
    await staticPhase();
    await runtimePhase();
    await new Promise(r => setTimeout(r, 0));
    await expect('做收尾', '查未处理拒绝', () => {
      if (unhandled.length) { throw new Error(unhandled.slice(0, 3).join(' | ')) }
      return '0 条'
    });
    const failed = results.filter(r => !r.ok);
    const byGroup = {};
    results.forEach(r => { (byGroup[r.group] = byGroup[r.group] || []).push(r) });
    Object.keys(byGroup).forEach(g => {
      console.log(`\n[${g}]`);
      byGroup[g].forEach(r => console.log(`  ${r.ok ? '✓' : '✗'} ${r.name}${r.info ? '  — ' + r.info : ''}`));
    });
    console.log(`\n合计 ${results.length} 项，失败 ${failed.length} 项`);
    failed.forEach(r => console.log('  ✗ ' + r.group + ' / ' + r.name + ' :: ' + r.info));
    if (withBrowser) {
      const dir = path.join(os.tmpdir(), 'r6player-smoke');
      fs.rmSync(dir, { recursive: true, force: true });
      fs.mkdirSync(dir, { recursive: true });
      let html = fs.readFileSync(path.join(A, 'browser.html'), 'utf8');
      const inline = (tag: string, code: string) => {
        assert(html.includes(tag), 'browser.html 里找不到 ' + tag);
        html = html.replace(tag, code);
      };
      inline('<script src="./cases.js"></script>', '<script>window.__h5pCases = ' + JSON.stringify(cases).replace(/<\//g, '<\\/') + ';</script>');
      inline('<script src="./smoke.js"></script>', '<script>' + fs.readFileSync(targetPath, 'utf8') + '</script>');
      const file = path.join(dir, 'browser.html');
      fs.writeFileSync(file, html);
      console.log('\n出浏览器夹具： file:///' + file.replace(/\\/g, '/'));
      console.log('执行 window.__h5pChecks() 复用同一批断言');
    }
    return failed.length;
  }
  return await main();
}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const SECTIONS = [
    { name: 'build', what: '先过 tsc 再出货', takesArgs: false, run: buildSection },
    { name: 'suite', what: '跑静态门与双驱动 92 项', takesArgs: true, run: suiteSection }
  ];
  const picks = argv.filter(a => !a.startsWith('--') && !a.endsWith('.js'));
  const fwd = argv.filter(a => a.startsWith('--') || a.endsWith('.js'));
  const chosen = picks.length ? SECTIONS.filter(s => picks.some(p => s.name.includes(p))) : SECTIONS;
  if (!chosen.length) {
    console.error('没有段匹配 ' + picks.join(' ') + '\n可选：' + SECTIONS.map(s => s.name).join(' '));
    process.exit(2);
  }
  if (fwd.length && !chosen.some(s => s.takesArgs)) {
    console.error('这些参数没有段接收：' + fwd.join(' ') + '（只有 suite 收参数）');
    process.exit(2);
  }

  const bad = [];
  for (const s of chosen) {
    const t0 = Date.now();
    let code = 0;
    try { code = (await s.run()) || 0 } catch (e) { code = 2; console.error(e && (e.message || e)) }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (code) bad.push(s.name);
    console.log((code ? '\x1b[31m✗\x1b[0m ' : '\x1b[32m✓\x1b[0m ') + s.name.padEnd(9) + secs.padStart(6) + 's  ' + s.what + (code ? '  退出码 ' + code : ''));
  }
  console.log('\n' + (bad.length ? '\x1b[31m' : '') + '共 ' + chosen.length + ' 段，失败 ' + bad.length + ' 段' + (bad.length ? '：' + bad.join(' ') : '\x1b[0m'));
  process.exit(bad.length ? 1 : 0);
}
