import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { registerHooks } from 'node:module';

const A = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(A, '..');
const PROJ = path.join(ROOT, 'AutoQuiz');
let GEN = 0;
registerHooks({
  resolve (spec, ctx, next) {
    const r = next(spec, ctx);
    if (!GEN || !r.url.startsWith('file:') || r.url.includes('?')) { return r }
    return fileURLToPath(r.url).startsWith(PROJ + path.sep)
      ? { ...r, url: r.url + '?gen=' + GEN, shortCircuit: true }
      : r;
  }
});

const state = { pass: 0, fail: [] as { name: string; msg: string }[], skipped: [] as [string, string][] };
let chain = Promise.resolve();

export function check(name: string, fn: () => any): Promise<void> {
  chain = chain.then(() => (async () => {
    try {
      const r = await fn();
      if (r === false) throw new Error('断言返回 false');
      state.pass++;
    } catch (e: any) {
      state.fail.push({ name, msg: (e && e.message) || String(e) });
    }
  })());
  return chain;
}

export function skip(name: string, why: string) { state.skipped.push([name, why]); }
export function reset () { state.pass = 0; state.fail.length = 0; state.skipped.length = 0; chain = Promise.resolve(); }

const IDS = new Map<any, string>();
let ID_NEXT = 0;
const idOf = (v: any) => {
  if (!IDS.has(v)) IDS.set(v, '#' + (++ID_NEXT));
  return IDS.get(v)!;
};

function ser(v: any, depth: number): string {
  if (v === null || v === undefined) return String(v);
  const t = typeof v;
  if (t === 'function' || t === 'symbol') return t + idOf(v);
  if (t !== 'object') return JSON.stringify(v);
  if (depth > 5) return '…' + (Array.isArray(v) ? '[…]' : '{…}');
  if (Array.isArray(v)) return '[' + v.map(x => ser(x, depth + 1)).join(',') + ']';
  return '{' + Object.keys(v).sort().map(k => k + ':' + ser(v[k], depth + 1)).join(',') + '}';
}

export function eq(actual: any, expected: any, label?: string) {
  const a = ser(actual, 0);
  const b = ser(expected, 0);
  if (a !== b) throw new Error((label || '') + ' 期望 ' + b + '，实际 ' + a);
  return true;
}

export function near(actual: number, expected: number, tol: number, label?: string) {
  if (!(Math.abs(actual - expected) <= tol)) throw new Error((label || '') + ' 期望 ' + expected + '±' + tol + '，实际 ' + actual);
  return true;
}

export function truthy(v: any, label?: string) {
  if (!v) throw new Error((label || '') + ' 期望为真，实际 ' + JSON.stringify(v));
  return true;
}

export async function report(title: string) {
  await chain;
  for (const [name, why] of state.skipped) console.log('  \x1b[33m--\x1b[0m ' + name + '（跳过：' + why + '）');
  const fail = state.fail.length;
  const pass = state.pass;
  const skipped = state.skipped.length;
  if (fail) {
    console.log('\n' + title + '：' + pass + ' 通过 / ' + fail + ' 失败');
    state.fail.forEach(f => console.log('  \x1b[31m✗\x1b[0m ' + f.name + '\n      ' + f.msg));
  } else {
    console.log(title + '：' + pass + ' 条断言全过' + (skipped ? '（另跳过 ' + skipped + '）' : ''));
  }
  reset();
  return fail;
}


function makeNode(tag: any, attrs?: any, text?: any): any {
  const node: any = {
    tagName: String(tag).toUpperCase(), nodeType: 1, _text: text || '',
    attributes: Object.assign({}, attrs || {}), children: [], parentNode: null, ownerDocument: null,
    style: {}, dataset: {}, classList: { contains: (c: any) => (' ' + (node.attributes.class || '') + ' ').includes(' ' + c + ' ') },
    checked: false, disabled: false, readOnly: false, value: (attrs && attrs.value) || '',
    setAttribute(k: any, v: any) {
      this.attributes[k] = String(v);
      if (k === 'id') this.id = String(v);
      if (k === 'class') this.className = String(v);
      if (k === 'value') this.value = String(v);
      if (k === 'checked') this.checked = true;
    },
    getAttribute(k: any) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
    hasAttribute(k: any) { return Object.prototype.hasOwnProperty.call(this.attributes, k); },
    appendChild(c: any) { c.parentNode = this; this.children.push(c); return c; },
    insertBefore(c: any) { return this.appendChild(c); },
    removeChild(c: any) { const i = this.children.indexOf(c); if (i >= 0) { this.children.splice(i, 1); c.parentNode = null; } },
    remove() { if (this.parentNode) this.parentNode.removeChild(this); },
    get parentElement() { return this.parentNode || null; },
    get childNodes() { return this.children; },
    get firstChild() { return this.children[0] || null; },
    get lastChild() { return this.children[this.children.length - 1] || null; },
    get nextElementSibling() {
      const p = this.parentNode;
      if (!p) return null;
      const at = p.children.indexOf(this);
      return at >= 0 ? (p.children[at + 1] || null) : null;
    },
    get previousElementSibling() {
      const p = this.parentNode;
      if (!p) return null;
      const at = p.children.indexOf(this);
      return at > 0 ? p.children[at - 1] : null;
    },
    after(...nodes: any[]) { const p = this.parentNode; if (p) nodes.forEach(n => p.appendChild(n)); },
    before(...nodes: any[]) { const p = this.parentNode; if (p) nodes.forEach(n => p.appendChild(n)); },
    replaceWith(...nodes: any[]) {
      const p = this.parentNode;
      if (!p) return;
      const at = p.children.indexOf(this);
      p.children.splice(at, 1, ...nodes);
      nodes.forEach(n => { n.parentNode = p; });
      this.parentNode = null;
    },
    insertAdjacentHTML(where: any, html: any) { const n = makeNode('div'); n._html = html; this.appendChild(n); },
    scrollIntoView() {}, select() {},
    cloneNode(deep: any) {
      const copy = makeNode(this.tagName, Object.assign({}, this.attributes), this._text);
      copy._html = this._html;
      copy.ownerDocument = this.ownerDocument;
      if (deep) (this.children || []).forEach((c: any) => copy.appendChild(c.cloneNode(true)));
      return copy;
    },
    addEventListener(type: any, fn: any) { (this._listeners = this._listeners || {})[type] = (this._listeners[type] || []).concat(fn); },
    removeEventListener() {},
    click() {
      if (this.tagName === 'INPUT') {
        const type = String(this.getAttribute('type') || '').toLowerCase();
        if (type === 'radio') {
          const name = this.getAttribute('name');
          (this.parentNode ? this.parentNode.children : []).forEach((sib: any) => {
            if (sib !== this && sib.tagName === 'INPUT' && String(sib.getAttribute('type') || '').toLowerCase() === 'radio' && sib.getAttribute('name') === name) sib.checked = false;
          });
          this.checked = true;
        } else if (type === 'checkbox') {
          this.checked = !this.checked;
        }
      }
      (this._listeners && this._listeners.click || []).forEach((fn: any) => fn({ target: this }));
      this.ownerDocument && this.ownerDocument._clicks.push(this);
    },
    focus() {}, blur() {}, contains(other: any) { let p = other; while (p) { if (p === this) return true; p = p.parentNode; } return false; },
    getBoundingClientRect() { return { width: 120, height: 24, top: 10, left: 10, right: 130, bottom: 34 }; },
    get textContent() { return this._text + this.children.map((c: any) => c.textContent || '').join(''); },
    set textContent(v: any) { this._text = String(v); },
    get innerText() { return this.textContent; },
    get innerHTML() { return this._html || ''; },
    set innerHTML(v: any) { this._html = String(v); }
  };
  if (node.attributes.id) node.id = node.attributes.id;
  if (node.attributes.class) node.className = node.attributes.class;
  node.matches = (sel: any) => matches(node, sel);
  node.closest = (sel: any) => { let p: any = node; while (p) { if (p.nodeType === 1 && matches(p, sel)) return p; p = p.parentNode; } return null; };
  node.querySelectorAll = (sel: any) => collect(node, sel);
  node.querySelector = (sel: any) => collect(node, sel)[0] || null;
  return node;
}

function matchSimple(node: any, step: string): boolean {
  if (node.nodeType !== 1) return false;
  let rest = step;
  const tag = /^[a-zA-Z][a-zA-Z0-9]*/.exec(step);
  if (tag && !/^[.#[:]/.test(step)) {
    if (node.tagName !== tag[0].toUpperCase()) return false;
    rest = step.slice(tag[0].length);
  }
  const re = /([#.]?[\w-]+|\[[^\]]+\]|:not\([^)]*\)|:(?:checked|last-child|first-child))/g;
  let m;
  const parts: string[] = [];
  while ((m = re.exec(rest))) parts.push(m[1]);
  for (const p of parts) {
    if (p[0] === '#') { if (node.id !== p.slice(1)) return false; }
    else if (p[0] === '.') { if (!(' ' + (node.className || '') + ' ').includes(' ' + p.slice(1) + ' ')) return false; }
    else if (p === ':checked') { if (!node.checked) return false; }
    else if (p === ':last-child') {
      const sib = node.parentNode ? node.parentNode.children.filter((c: any) => c !== node) : [];
      const sameTag = node.parentNode ? node.parentNode.children.filter((c: any) => c.tagName === node.tagName) : [];
      if (sameTag[sameTag.length - 1] !== node && sib[sib.length - 1] !== node) return false;
    } else if (p === ':first-child') {
      const sameTag = node.parentNode ? node.parentNode.children.filter((c: any) => c.tagName === node.tagName) : [];
      if (sameTag[0] !== node) return false;
    } else if (p.startsWith(':not(')) {
      if (matchSimple(node, p.slice(5, -1))) return false;
    } else if (p[0] === '[') {
      const mm = /^\[([\w-]+)(?:([~^*|$]?=)"?([^\]"]*)"?)?\]$/.exec(p);
      if (!mm) return false;
      const v = node.getAttribute(mm[1]);
      if (v === null) return false;
      if (mm[2] === '=*' && !String(v).includes(mm[3])) return false;
      if (mm[2] === '=' && String(v) !== mm[3]) return false;
    }
  }
  return true;
}

function matches(node: any, selector: any) {
  return String(selector).split(',').map((s: string) => s.trim()).filter(Boolean)
    .some((one: string) => matchSimple(node, one.replace(/\s*>\s*/g, ' ').split(' ').pop()!));
}

function walk(node: any, out: any[]) {
  for (const c of node.children || []) { out.push(c); walk(c, out); }
  return out;
}

function collect(root: any, selector: any) {
  const all = walk(root, []);
  return String(selector).split(',').map((s: string) => s.trim()).filter(Boolean).flatMap((one: string) => {
    const steps = one.replace(/\s*>\s*/g, ' > ').split(/\s+/).filter(Boolean);
    const last = steps[steps.length - 1];
    return all.filter((node: any) => {
      if (!matchSimple(node, last)) return false;
      let cursor = node.parentNode;
      for (let i = steps.length - 2; i >= 0; i--) {
        const step = steps[i];
        if (step === '>') { i--; if (!cursor || !matchSimple(cursor, steps[i])) return false; cursor = cursor.parentNode; continue; }
        let hit = false;
        while (cursor) { if (matchSimple(cursor, step)) { hit = true; cursor = cursor.parentNode; break; } cursor = cursor.parentNode; }
        if (!hit) return false;
      }
      return true;
    });
  });
}

export function makeDocument(href?: string) {
  const doc: any = makeNode('html', {}, '');
  doc.ownerDocument = doc;
  doc._clicks = [];
  doc.documentElement = doc;
  doc.head = doc.appendChild(makeNode('head'));
  doc.body = doc.appendChild(makeNode('body'));
  doc.createElement = (t: any) => { const n = makeNode(t); n.ownerDocument = doc; return n; };
  doc.createTextNode = (t: any) => ({ nodeType: 3, textContent: String(t), parentNode: null });
  doc.createElementNS = doc.createElement;
  doc.getElementById = (id: any) => collect(doc, '#' + id)[0] || null;
  doc.getElementsByTagName = (t: any) => walk(doc, []).filter((n: any) => n.tagName === String(t).toUpperCase());
  doc.addEventListener = () => {};
  doc.readyState = 'complete';
  doc.hidden = false;
  doc.title = 'stub';
  const url = { hostname: 'stub.example', href: href || 'https://stub.example/exam' };
  const self: any = {
    window: null, document: doc, location: url, navigator: { userAgent: 'node' },
    setTimeout, clearTimeout, setInterval: () => 0, clearInterval: () => {},
    addEventListener(type: any, fn: any) { (self._listeners = self._listeners || {})[type] = (self._listeners[type] || []).concat(fn); },
    removeEventListener(type: any, fn: any) {
      if (!self._listeners || !self._listeners[type]) return;
      self._listeners[type] = self._listeners[type].filter((f: any) => f !== fn);
    },
    __fire(type: any, event?: any) {
      ((self._listeners && self._listeners[type]) || []).forEach((fn: any) => fn(Object.assign({ type }, event || {})));
      return ((self._listeners && self._listeners[type]) || []).length;
    },
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    MutationObserver: function (this: any) { this.observe = () => {}; this.disconnect = () => {}; },
    XMLHttpRequest: function (this: any) { this.open = () => {}; this.send = () => {}; this.setRequestHeader = () => {}; },
    URL, Blob: function () {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720,
    JSON, Math, Date, Promise, RegExp, Error, Map, Set, WeakMap, Array, Object, String, Number, Boolean, Function, Symbol,
    Uint8Array, ArrayBuffer, TextEncoder, TextDecoder, encodeURIComponent, decodeURIComponent, parseInt, parseFloat, isNaN
  };
  self.window = self;
  self.self = self;
  doc.defaultView = self;
  return { doc, win: self, node: (t: any, a?: any, x?: any) => { const n = doc.createElement(t); Object.entries(a || {}).forEach(([k, v]) => n.setAttribute(k, v)); if (x != null) n.textContent = x; return n; } };
}

export async function load(names: [string, string][], opts?: any): Promise<any> {
  GEN++;
  const env = makeDocument((opts && opts.href) || 'https://stub.example/exam');
  const mem = new Map();
  const g: any = globalThis;
  const store = new Map();
  env.win.localStorage = {
    getItem: (k: any) => (store.has(k) ? store.get(k) : null),
    setItem: (k: any, v: any) => { store.set(k, String(v)); g.dispatchEvent && g.dispatchEvent({ type: 'storage' } as any); },
    removeItem: (k: any) => store.delete(k),
    clear: () => store.clear(),
    get length() { return store.size; },
    key: (i: any) => [...store.keys()][i] ?? null
  };
  env.win.Audio = function (src: any) {
    return { src, loop: false, muted: false, volume: 1, playCalls: 0, play() { this.playCalls++; return Promise.resolve(); }, pause() {}, load() {} };
  };
  for (const k of ['window', 'document', 'location', 'XMLHttpRequest', 'MutationObserver', 'Audio', 'localStorage',
    'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'clearTimeout',
    'setInterval', 'clearInterval', 'addEventListener', 'removeEventListener', 'matchMedia', 'devicePixelRatio',
    'innerWidth', 'innerHeight', 'navigator', 'HTMLElement']) {
    if (k === 'navigator') { Object.defineProperty(g, 'navigator', { value: env.win.navigator, configurable: true, writable: true }); continue; }
    if (k in env.win) g[k] = env.win[k];
  }
  g.unsafeWindow = env.win;
  g.GM_getValue = (k: any, d: any) => (mem.has(k) ? mem[k] : d);
  g.GM_setValue = (k: any, v: any) => { mem[k] = v; mem.set(k, v); };
  g.GM_getResourceText = (name: any) => (opts && opts.resources && opts.resources[name]) || null;
  g.GM_xmlhttpRequest = (opts && opts.onRequest) || (() => { throw new Error('测试没提供 GM_xmlhttpRequest'); });
  g.Tesseract = (opts && opts.Tesseract) || undefined;
  const out: any = {};
  for (const [as, file] of names) {
    const mod = await import(pathToFileURL(path.join(PROJ, file)).href);
    Object.assign(out, pick(mod, as));
  }
  return { env, mem, store, ...out };
}

function pick(mod: any, names: any) {
  if (names === '*') return { ...mod };
  const out: any = {};
  for (const n of String(names).split(',').map((s: string) => s.trim()).filter(Boolean)) {
    if (!(n in mod)) throw new Error('源码里没有导出名 ' + n);
    out[n] = mod[n];
  }
  return out;
}


async function buildSection () {
  const { project, logBuild } = await import('./build.ts');
  const P = project('AutoQuiz');
  const built = await P.build();
  P.write(built);
  logBuild(P, built);
  return 0;
}

async function gatesSection () {
  const { project } = await import('./build.ts');
  const P = project('AutoQuiz');
  const A = path.dirname(fileURLToPath(import.meta.url));
  const fails: string[] = [];
  const fail = (gate: string, msg: string) => fails.push(gate + ': ' + msg);
  const ok = (gate: string, msg: string) => console.log('  \x1b[32m✓\x1b[0m   ' + gate.padEnd(4) + msg);

  const modules = P.modules();
  const posix = (p: string) => p.split('\\').join('/');
  const resolves = (from: string, spec: string) => posix(path.posix.normalize(path.posix.join(posix(path.posix.dirname(from)), spec)));
  const text: Record<string, string> = {};
  const deps: Record<string, string[]> = {};
  for (const f of modules) {
    const src = fs.readFileSync(path.join(P.SRC, f), 'utf8');
    text[f] = src;
    deps[f] = [];
    for (const m of src.matchAll(/^\s*import\s+(?:\{([^}]*)\}|(\w+))?\s*(?:from\s+)?['"](\.{1,2}\/[\w./-]+)['"]/gm)) {
      const dep = resolves(f, m[3]);
      if (!modules.includes(dep)) { fail('①', f + ' 缺模块 ' + dep); continue; }
      deps[f].push(dep);
    }
    deps[f] = [...new Set(deps[f])];
  }
  const owners: Record<string, string[]> = {};
  for (const f of modules) {
    owners[f] = [];
    for (const m of text[f].matchAll(/^\s*export\s+(?:async\s+)?(?:const|let|var|function|class)\s+([A-Za-z_$][\w$]*)/gm)) owners[f].push(m[1]);
    for (const m of text[f].matchAll(/^\s*export\s*\{([^}]*)\}/gm)) {
      m[1].split(',').forEach(s => { const n = s.trim().split(/\s+as\s+/).pop(); if (n) owners[f].push(n); });
    }
  }
  const EXPORT_COUNT = Object.values(owners).reduce((a, b) => a + b.length, 0);

  const closure = (v: string) => {
    const seen = new Set<string>();
    const stack = [...deps[v]];
    while (stack.length) {
      const w = stack.pop()!;
      if (seen.has(w)) continue;
      seen.add(w);
      for (const u of deps[w] || []) if (!seen.has(u)) stack.push(u);
    }
    return seen;
  };
  const reach: Record<string, Set<string>> = {};
  for (const m of modules) reach[m] = closure(m);
  const cyc: string[] = [];
  for (const m of modules) for (const w of deps[m]) if (reach[w] && reach[w].has(m)) cyc.push(m + ' → ' + w);
  if (cyc.length) cyc.forEach(c => fail('①', '图里有环：' + c));
  else if (modules.length < 10) fail('①', '只扫到 ' + modules.length + ' 个模块，目录或后缀不对');
  else ok('①', modules.length + ' 模块 / ' + Object.values(deps).reduce((a, b) => a + b.length, 0) + ' 条边，无环');

  const types = P.typecheck();
  const tscLines = P.typeErrors(types);
  if (!types.started) fail('②', 'tsc 没跑起来：' + types.out);
  else if (!types.ok && !tscLines.length) fail('②', 'tsc 退出码非 0 却没吐 error，输出不可信：' + types.out.slice(0, 160));
  const unbound = tscLines.filter(l => /TS2304|TS2552|TS2580/.test(l));
  const unused = tscLines.filter(l => /TS6133/.test(l));
  unbound.forEach(l => fail('②', '查漏 import：' + l.trim()));
  unused.forEach(l => fail('②', '查未使用：' + l.trim()));
  tscLines.filter(l => !/TS2304|TS2552|TS2580|TS6133/.test(l)).slice(0, 8).forEach(l => fail('②', l.trim()));
  if (tscLines.length > 8) fail('②', '另有 ' + (tscLines.length - 8) + ' 条未列出');
  if (types.ok && !tscLines.length) ok('②', '全仓 tsc 0 错（' + modules.length + ' 模块 / ' + EXPORT_COUNT + ' 导出名）');

  function makeStub(href?: string) {
    const el = () => {
      const node: any = {
        style: {}, dataset: {}, children: [], attributes: {},
        setAttribute(k: any, v: any) { this.attributes[k] = String(v); },
        getAttribute(k: any) { return Object.prototype.hasOwnProperty.call(this.attributes, k) ? this.attributes[k] : null; },
        appendChild(c: any) { this.children.push(c); return c; },
        removeChild(c: any) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); },
        remove() {}, addEventListener() {}, removeEventListener() {},
        querySelector() { return null; }, querySelectorAll() { return []; },
        matches() { return false; }, closest() { return null; }, contains() { return false; },
        get textContent() { return this._t || ''; }, set textContent(v: any) { this._t = String(v); },
        click() {}
      };
      return node;
    };
    const timers: any[] = [];
    const doc: any = {
      documentElement: el(), head: el(), body: el(), readyState: 'complete', hidden: false,
      createElement: el, createElementNS: el, createTextNode: () => el(),
      querySelector: () => null, querySelectorAll: () => [], getElementById: () => null,
      addEventListener() {}, removeEventListener() {}, getElementsByTagName: () => [],
      defaultView: null, fonts: { ready: Promise.resolve() }
    };
    const win: any = {
      location: { href: href || 'https://example.com/', hostname: 'example.com', protocol: 'https:', origin: 'https://example.com' },
      document: doc, navigator: { userAgent: 'node-stub' }, console,
      setTimeout: (fn: any, ms: any) => { timers.push(fn); return timers.length; },
      clearTimeout() {}, setInterval: () => 0, clearInterval() {},
      addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {} }),
      getComputedStyle: () => ({ getPropertyValue: () => '' }), MutationObserver: function () { return { observe() {}, disconnect() {} }; },
      XMLHttpRequest: function () { return { open() {}, send() {}, setRequestHeader() {}, addEventListener() {} }; },
      URL, Blob: function () {}, Uint8Array, ArrayBuffer, Map, Set, Promise, JSON, Math, Date, RegExp, Error,
      String, Number, Boolean, Array, Object, Function, Symbol, WeakMap, TextEncoder, TextDecoder,
      requestAnimationFrame: (fn: any) => setTimeout(fn, 0), cancelAnimationFrame() {}, devicePixelRatio: 1, innerWidth: 1280, innerHeight: 720
    };
    doc.defaultView = win;
    win.window = win;
    win.self = win;
    win.globalThis = win;
    return { win, timers };
  }

  function runInStub(code: string, filename: string): any {
    const { win } = makeStub();
    win.console = console;
    win.Buffer = Buffer;
    win.URLSearchParams = URLSearchParams;
    vm.createContext(win);
    vm.runInContext(code, win, { filename });
    return win;
  }

  const VERSION = P.version();
  for (const f of ['AutoQuiz.js']) {
    const file = path.join(P.OUT, f);
    if (!fs.existsSync(file)) { fail('③', '缺产物 ' + f); continue; }
    try {
      const code = fs.readFileSync(file, 'utf8');
      const lowered = (code.match(/static\s*\{/g) || []).length;
      const ctx = runInStub(code, f);
      if (lowered) fail('③', f + ' 里有 ' + lowered + ' 处 static {} 块');
      else if (!new RegExp('^// @version +' + VERSION + '$', 'm').test(code)) fail('③', f + ' 的 @version 不是源码里的 ' + VERSION);
      else if (ctx.__AUTOQUIZ_LOADED__ !== VERSION) fail('③', f + ' 求值期没走到 __AUTOQUIZ_LOADED__，期望 ' + VERSION + ' 实际 ' + ctx.__AUTOQUIZ_LOADED__);
      else ok('③', f + ' 桩内求值通过');
    } catch (e: any) {
      fail('③', f + ' 求值抛 ' + (e && e.message));
    }
  }

  const fresh = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'build.ts'), 'AutoQuiz', '--check'], { encoding: 'utf8', cwd: ROOT });
  if (fresh.status !== 0) fail('④', ((fresh.stdout || '') + (fresh.stderr || '')).trim().split('\n').slice(0, 4).join(' / '));
  else ok('④', (fresh.stdout || '').trim().split('\n').pop());

  const child = `
const url = await import('node:url');
const harnessUrl = url.pathToFileURL(${JSON.stringify(path.join(A, 'AutoQuiz.test.ts'))}).href;
const h = await import(harnessUrl);
const files = ${JSON.stringify(modules)};
await h.load(files.map(f => ['*', f]));
console.log('装载 ' + files.length + ' 模块');
process.exit(0);
`;
  const loaded = spawnSync(process.execPath, ['--input-type=module', '-e', child], { encoding: 'utf8', cwd: A });
  const loadErr = ((loaded.stdout || '') + (loaded.stderr || '')).split('\n')
    .find(l => /Error|SyntaxError|is not defined|Cannot find/.test(l) && !l.includes('process.exit'));
  if (loaded.status !== 0) fail('⑤', '模块装载失败：' + (loadErr || (loaded.stderr || '').trim().split('\n')[0]).slice(0, 160));
  else ok('⑤', modules.length + ' 个模块 node 原生 import 通过');

  if (fails.length) {
    console.log('\n门禁挂了 ' + fails.length + ' 条：');
    fails.forEach(f => console.log('  \x1b[31m✗\x1b[0m ' + f));
    return fails.length;
  }
  console.log('\n跑完五道门');
  return 0;

}

async function unitSection () {

  const {
    QuestionType, DEFAULT_SETTINGS, TextSanitizer, AnswerResolver, FrameProbe, CacheSource,
    md5Hex, shortHash, unique, random, sleep, DEFAULT_SEPARATORS, QuestionScanner
  } = await load([
    ['QuestionType', 'Utils.ts'],
    ['DEFAULT_SETTINGS', 'Config.ts'],
    ['TextSanitizer', 'Probe.ts'],
    ['AnswerResolver, DEFAULT_SEPARATORS', 'Solve.ts'],
    ['FrameProbe', 'Probe.ts'],
    ['CacheSource', 'Solve.ts'],
    ['unique', 'Utils.ts'],
    ['random, sleep', 'Utils.ts'],
    ['md5Hex, shortHash', 'Utils.ts'],
    ['QuestionScanner', 'Solve.ts']
  ]);

  check('算 md5 已知向量', () => {
    eq(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e', '算空串');
    eq(md5Hex('abc'), '900150983cd24fb0d6963f7d28e17f72', '算 abc');
    eq(md5Hex('hello'), '5d41402abc4b2a76b9719d911017c592', '算 hello');
  });
  check('比 node crypto 同批向量', () => {
    eq(md5Hex(''), 'd41d8cd98f00b204e9800998ecf8427e', '算空');
    eq(md5Hex('中'), 'aed1dfbc31703955e64806b799b67645', '中文按字节算');
    eq(md5Hex('中文混合abc123'), '5ea6045908b7bfd18956800ac22b8d16', '算混排');
  });
  check('取 md5 前 16 位', () => {
    const h = shortHash('https://example.com/a.png');
    truthy(h.length === 16, '定长 16');
    eq(h, md5Hex('https://example.com/a.png').slice(0, 16), '与 md5 对齐');
    eq(shortHash(null), md5Hex('').slice(0, 16), '空值也走 md5');
  });

  check('折全角与中文标点', () => {
    eq(TextSanitizer.fold('Ａ'), 'A', '折全角字母');
    eq(TextSanitizer.fold('。'), '.', '折句号');
    eq(TextSanitizer.fold('、'), ',', '折顿号');
    eq(TextSanitizer.fold('“引”'), '"引"', '折弯引号');
  });
  check('归空白小写与字数字符', () => {
    eq(TextSanitizer.normalize(' Ａ． 甲 '), 'a甲', '归全角带标点');
    eq(TextSanitizer.normalize('下列哪一项？（ ）'), '下列哪一项', '丢问号括号');
    eq(TextSanitizer.normalize(null), '', '接 null 不炸');
  });
  check('复用归一缓存', () => {
    const s = '缓存键一致性检查' + Date.now();
    truthy(TextSanitizer.normalize(s) === TextSanitizer.normalize(s), '第二次同引用');
  });
  check('截长题干留首尾', () => {
    const long = '甲'.repeat(300);
    const k = TextSanitizer.key(long);
    truthy(k.length < long.length, '必须变短');
    truthy(k.includes('#'), '截断带分隔标记');
    eq(TextSanitizer.key('短题干'), '短题干', '短的不动');
  });
  check('只剥真选项前缀', () => {
    eq(TextSanitizer.stripPrefix('A. 甲'), '甲', '剥字母前缀');
    eq(TextSanitizer.stripPrefix('（B）乙'), '乙', '剥括号字母');
    eq(TextSanitizer.stripPrefix('3、多选题'), '3、多选题', '数字题号不动');
    eq(TextSanitizer.stripPrefix('A B C 三人同行'), 'A B C 三人同行', '拉丁字母串不动');
    eq(TextSanitizer.stripPrefix('A 甲'), '甲', '裸字母加中文才剥');
  });

  check('算二元组相似度', () => {
    near(AnswerResolver.bigramScore('下列属于正确的是', '下列属于正确的是'), 1, 1e-9, '同串为 1');
    truthy(AnswerResolver.bigramScore('光合作用', '红楼梦贾宝玉') < 0.2, '无关串要低');
    eq(AnswerResolver.bigramScore('', '甲'), 0, '空串为 0');
  });
  check('认多字近题', () => {
    const a = '下列哪一项属于我国的基本经济制度';
    const b = a + '呢';
    truthy(AnswerResolver.bigramScore(a, b) > 0.9, '多一字也要过 0.9');
  });
  check('归编辑距离分', () => {
    const s1 = AnswerResolver.levenshteinScore('abcdef', 'abcdef');
    const s2 = AnswerResolver.levenshteinScore('abcdef', 'abcdeg');
    const s3 = AnswerResolver.levenshteinScore('abcdef', 'zzzzzz');
    truthy(s1 > s2 && s2 > s3, s1 + '/' + s2 + '/' + s3);
    truthy(s1 <= 1 && s1 >= 0, '落在 0..1');
  });

  check('认极性词与符号', () => {
    eq(AnswerResolver.polarity('正确'), 'true', '出正确');
    eq(AnswerResolver.polarity('错误'), 'false', '出错误');
    eq(AnswerResolver.polarity('A. 对'), 'true', '剥选项前缀');
    eq(AnswerResolver.polarity('√'), 'true', '出勾');
    eq(AnswerResolver.polarity('×'), 'false', '出叉');
    eq(AnswerResolver.polarity('不一定'), null, '含糊不猜');
  });
  check('定位判断选项', () => {
    const byText = AnswerResolver.judgeIndices([{ text: 'A. 正确' }, { text: 'B. 错误' }]);
    eq([byText.trueAt, byText.falseAt, !!byText.guessed], [0, 1, false], '按文案定位');
    const bare = AnswerResolver.judgeIndices([{ text: '' }, { text: '' }]);
    eq([bare.trueAt, bare.falseAt, !!bare.guessed], [0, 1, true], '裸按钮标 guessed');
  });
  check('抽选项字母', () => {
    eq(AnswerResolver.extractLetters('ABD'), [0, 1, 3], '连写递增');
    eq(AnswerResolver.extractLetters('A,C'), [0, 2], '逗号分隔可乱序');
    eq(AnswerResolver.extractLetters('C,A'), [0, 2], '乱序要分隔符');
    eq(AnswerResolver.extractLetters('had'), [], '单词不当选项');
    eq(AnswerResolver.extractLetters('甲乙'), [], '非字母为空');
  });
  check('去重保序', () => eq(unique([3, 1, 3, 2, 1]), [3, 1, 2]));

  check('切多空答案', () => {
    eq(AnswerResolver.splitAnswer('甲;乙;丙', DEFAULT_SEPARATORS, 3), ['甲', '乙', '丙'], '段数正好');
    eq(AnswerResolver.splitAnswer('甲;乙;丙', DEFAULT_SEPARATORS, 2), ['甲', '乙', '丙'], '空数对不上不硬切');
    eq(AnswerResolver.splitAnswer('甲；乙', DEFAULT_SEPARATORS, 2), ['甲', '乙'], '认中文分号');
    eq(AnswerResolver.splitAnswer('["甲","乙"]', DEFAULT_SEPARATORS, 2), ['甲', '乙'], '认 JSON 数组串');
    eq(AnswerResolver.splitAnswer('', DEFAULT_SEPARATORS, 1), [], '空串为空');
    eq(AnswerResolver.splitAnswer('甲#乙#丙;丁', DEFAULT_SEPARATORS, 2), ['甲#乙#丙', '丁'], '取段数对得上那种');
  });
  check('只认表内分隔符', () => {
    eq(AnswerResolver.splitAnswer('甲、乙、丙', DEFAULT_SEPARATORS, 3), ['甲、乙、丙'], '整串留着');
    eq(AnswerResolver.splitAnswer('甲---乙', DEFAULT_SEPARATORS, 2), ['甲', '乙'], '长分隔符优先');
  });

  check('摘 jQuery 集合后缀', () => {
    eq(FrameProbe.splitFilter('main:last'), { base: 'main', at: -1 }, '认 :last');
    eq(FrameProbe.splitFilter('#question div div:first'), { base: '#question div div', at: 0 }, '认 :first');
    eq(FrameProbe.splitFilter('.opt:eq(2)'), { base: '.opt', at: 2 }, '认 :eq(n)');
    eq(FrameProbe.splitFilter('.plain'), { base: '.plain', at: null }, '无后缀不动');
  });
  check('复用选择器解析', () => {
    const sel = '.a, .b:eq(1)';
    truthy(FrameProbe.parsed(sel) === FrameProbe.parsed(sel), '要同引用');
    eq(FrameProbe.parsed(sel).length, 2, '逗号拆两段');
  });
  check('摊平选择器数组', () => {
    eq(FrameProbe.candidates(['.a', '', '.b']), ['.a', '.b'], '摊平数组');
    eq(FrameProbe.candidates('.a , .b'), ['.a', '.b'], '摊平逗号串');
    eq(FrameProbe.candidates(null), [], '空值为空');
  });

  const cacheStore = (list) => ({ cacheList: () => list, get: () => list, set: () => {} });
  const q = (stem, key) => ({ stem, cacheKey: key, type: QuestionType.SINGLE });
  check('精确键命中', async () => {
    const src = new CacheSource({ store: cacheStore([{ key: 'k1', stem: '题干甲', answer: ['A'] }]), settings: { useCache: true, cacheFuzzyThreshold: 0.92 } });
    const got = await src.fetch(q('题干甲', 'k1'));
    eq(got, [['A']], '精确命中');
  });
  check('模糊近题命中', async () => {
    const stem = '下列哪一项属于我国的基本经济制度';
    const src = new CacheSource({ store: cacheStore([{ key: 'other', stem, answer: ['B'] }]), settings: { useCache: true, cacheFuzzyThreshold: 0.92 } });
    const got = await src.fetch(q(stem + '呢', 'different-key'));
    eq(got, [['B']], '模糊命中');
  });
  check('剪枝远条目', async () => {
    const long = '甲'.repeat(60);
    const src = new CacheSource({ store: cacheStore([{ key: 'x', stem: long, answer: ['Z'] }, { key: 'y', stem: '甲乙', answer: ['短'] }]), settings: { useCache: true, cacheFuzzyThreshold: 0.92 } });
    const got = await src.fetch(q(long, 'no-such-key'));
    eq(got, [['Z']], '只留长条目');
  });
  check('关开关不参与', () => {
    const src = new CacheSource({ store: cacheStore([]), settings: { useCache: false } });
    eq(src.enabled(), false, '报不启用');
  });
  check('保住优先级 0', () => {
    eq(CacheSource.PRIORITY, 0, '优先级为 0');
    eq(CacheSource.NAME, 'cache', '名为 cache');
    eq(CacheSource.SHORT_CIRCUIT, true, '命中即短路');
  });

  check('认数字码 0', () => {
    const scanner = new QuestionScanner({ typeCodes: { 0: QuestionType.SINGLE, 1: QuestionType.MULTIPLE, 14: QuestionType.MATCH } }, { info() {}, warn() {}, log() {} });
    eq(scanner.parseLabel('0'), QuestionType.SINGLE, '数字 0 归单选');
    eq(scanner.parseLabel('多选题'), QuestionType.MULTIPLE, '文案归多选');
    eq(scanner.parseLabel('完形填空题'), QuestionType.MATCH, '完形归 match');
    eq(scanner.parseLabel(''), null, '空标签为 null');
  });
  check('查枚举唯一', () => {
    const values = Object.values(QuestionType);
    eq(new Set(values).size, values.length, '枚举唯一');
  });

  check('查默认开关', () => {
    const off = ['useVideoRate', 'useForum', 'useVueProbe', 'useResponseTamper', 'useKeepAlive'];
    off.forEach(k => truthy(k in DEFAULT_SETTINGS, k + ' 缺项'));
    eq(off.filter(k => DEFAULT_SETTINGS[k] !== false), [], '五个默认关');
    eq(DEFAULT_SETTINGS.useSingleTab, true, '让位默认开');
    eq([DEFAULT_SETTINGS.enabled, DEFAULT_SETTINGS.autoStart], [true, false], '刷题默认开、自动刷默认关');
  });
  check('查随机与休眠边界', async () => {
    for (let i = 0; i < 50; i++) { const v = random(5, 9); truthy(v >= 5 && v < 10, '落在区间'); }
    const t0 = Date.now();
    await sleep(0);
    truthy(Date.now() - t0 < 200, '休眠 0 不卡');
  });

  return await report('unit');

}

async function e2eSection () {

  const SYNTHETIC_HREF = 'https://autoquiz-synthetic.test/exam/autoquiz-synthetic/';

  const {
    QuestionType, FrameProbe, QuestionScanner, PlatformRegistry, AnswerResolver, CacheSource,
    AddonLoop, syncHooks, shareContext, Logger, DEFAULT_SETTINGS,
    JsonWatch, NetworkCapture, CaptureSource, RiskGate, SubmitController,
    KeepAlive, ResponseTamper, SessionLock, VideoRate, ForumPoster, VueProbe
  } = await load([
    ['QuestionType', 'Utils.ts'],
    ['DEFAULT_SETTINGS', 'Config.ts'],
    ['FrameProbe', 'Probe.ts'],
    ['QuestionScanner', 'Solve.ts'],
    ['PlatformRegistry', 'Spec.ts'],
    ['AnswerResolver, DEFAULT_SEPARATORS', 'Solve.ts'],
    ['CacheSource', 'Solve.ts'],
    ['JsonWatch', 'Spec.ts'],
    ['NetworkCapture', 'Capture.ts'],
    ['CaptureSource', 'Solve.ts'],
    ['RiskGate', 'Guard.ts'],
    ['SubmitController', 'Guard.ts'],
    ['KeepAlive', 'Addon.ts'],
    ['ResponseTamper', 'Addon.ts'],
    ['SessionLock', 'Addon.ts'],
    ['VideoRate', 'Addon.ts'],
    ['ForumPoster', 'Addon.ts'],
    ['VueProbe', 'Addon.ts'],
    ['AddonLoop, syncHooks, shareContext', 'Addon.ts'],
    ['Logger', 'Utils.ts']
  ], { href: SYNTHETIC_HREF });

  const doc: any = globalThis.document;
  const node = (t: any, a?: any, x?: any) => {
    const n = doc.createElement(t);
    Object.entries(a || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (x != null) n.textContent = x;
    return n;
  };

  const SPEC = {
    key: 'autoquiz-synthetic',
    name: '合成站（测试用）',
    hosts: ['autoquiz-synthetic.test'],
    match: [/autoquiz-synthetic/i],
    question: { root: '.TiMu', stem: '.stem', options: '.opt', typeText: '.qtype' },
    write: { target: '.opt' }
  };

  function paper() {
    doc.body.children.length = 0;
    const list = doc.appendChild(node('div', { class: 'question-list-box' }));
    const one = list.appendChild(node('div', { class: 'TiMu' }));
    one.appendChild(node('div', { class: 'qtype' }, '单选题'));
    one.appendChild(node('div', { class: 'stem' }, '1、下列哪一项属于我国的基本经济制度？'));
    ['A. 公有制为主体、多种所有制共同发展', 'B. 单一公有制', 'C. 按需分配'].forEach(t => one.appendChild(node('div', { class: 'opt' }, t)));
    const two = list.appendChild(node('div', { class: 'TiMu' }));
    two.appendChild(node('div', { class: 'qtype' }, '判断题'));
    two.appendChild(node('div', { class: 'stem' }, '2、市场经济只是一种资源配置方式。'));
    ['正确', '错误'].forEach(t => two.appendChild(node('div', { class: 'opt' }, t)));
    return { one, two };
  }

  const log = new Logger({ mirror: false });
  const scanner = new QuestionScanner(SPEC, log);
  const cards = paper();

  check('采两张题卡', () => {
    const { questions, doc: found } = scanner.scan();
    eq(questions.length, 2, '出题数');
    truthy(found === doc, '题根落在本文档');
    eq(questions[0].type, QuestionType.SINGLE, '第 1 题题型');
    eq(questions[1].type, QuestionType.JUDGEMENT, '第 2 题题型');
    eq(questions[0].options.length, 3, '第 1 题选项数');
    truthy(questions[0].stem.includes('基本经济制度'), '题干带正文');
    eq(questions[0].optionTexts[0], '公有制为主体、多种所有制共同发展', '选项已剥前缀');
    truthy(questions[0].root === cards.one, '题根是页面上那个');
    return true;
  });

  check('取答并选中', async () => {
    const { questions } = scanner.scan();
    const q = questions[0];
    const store = { cacheList: () => [{ key: q.cacheKey, stem: q.stem, answer: ['公有制为主体'] }], get: () => [], set: () => {} };
    const answers = await new CacheSource({ store, settings: { useCache: true, cacheFuzzyThreshold: 0.92 } }).fetch(q);
    eq(answers.length, 1, '缓存出一条候选');
    const got = AnswerResolver.resolveFor(QuestionType.SINGLE, [{ from: 'cache', priority: 0, answers: answers[0] }], q.options, { singleThreshold: 0.65 });
    truthy(got.finish, '要匹配成功：' + (got.reason || ''));
    eq(got.indices, [0], '选中第 1 个');
    q.options[got.indices[0]].node.click();
    eq(doc._clicks.length, 1, '点到页面节点');
    truthy(doc._clicks[0] === q.options[0].node, '点的就是那个节点');
  });

  check('兜底判断按钮', () => {
    const bare = [{ text: '' }, { text: '' }];
    const got = AnswerResolver.resolveFor(QuestionType.JUDGEMENT, [{ from: 'cache', priority: 0, answers: ['对'] }], bare, {});
    truthy(got.finish, '要能落子');
    eq(got.indices, [0], '对落在第 0 个');
  });

  check('查选择器后缀与并列', () => {
    const { one } = paper();
    eq(FrameProbe.queryAll('.opt', one).length, 3, '查出三个选项');
    truthy(FrameProbe.queryAll('.opt:last', one)[0] === FrameProbe.queryAll('.opt', one)[2], '取末尾');
    truthy(FrameProbe.queryAll('.opt:eq(1)', one)[0] === FrameProbe.queryAll('.opt', one)[1], '取中间');
    eq(FrameProbe.queryAll('.nope, .stem', one).length, 1, '并列取命中段');
    eq(FrameProbe.queryAll('.nope', one), [], '都没命中给空数组');
  });

  check('穿两层 iframe', () => {
    const mid = makeDocument(SYNTHETIC_HREF);
    const deep = makeDocument(SYNTHETIC_HREF);
    const frameA = doc.createElement('iframe');
    frameA.contentWindow = mid.win;
    doc.body.appendChild(frameA);
    const frameB = mid.doc.createElement('iframe');
    frameB.contentWindow = deep.win;
    mid.doc.body.appendChild(frameB);
    const seen = FrameProbe.documents(globalThis.window, 3);
    eq(seen.map(e => e.depth), [0, 1, 2], '出深度序列');
    truthy(seen.every(e => !!e.doc), '每层都带 doc');
    truthy(seen[2].doc === deep.doc, '走到最里层');
    frameA.remove();
  });

  check('注册并按 URL 认领', () => {
    PlatformRegistry.register(SPEC);
    const hit = PlatformRegistry.detect(SYNTHETIC_HREF, doc);
    truthy(hit, '要命中一个 spec');
    eq(hit.key, 'autoquiz-synthetic', '命中合成站');
    truthy(PlatformRegistry.specs.some(s => s.key === 'autoquiz-synthetic'), '进分派表');
  });
  check('重复注册即替换', () => {
    const before = PlatformRegistry.specs.length;
    PlatformRegistry.register(Object.assign({}, SPEC, { name: '合成站 v2' }));
    eq(PlatformRegistry.specs.length, before, '条数不变');
    eq(PlatformRegistry.specs.find(s => s.key === SPEC.key).name, '合成站 v2', '内容已换');
  });

  check('投递设置不留定时器', () => {
    shareContext({ settings: { useVideoRate: false, useForum: false, useKeepAlive: false }, log });
    const loop = AddonLoop.obtain(doc);
    eq(loop.wanted(), false, '全关就不参与');
    eq(loop.timer, null, '不留空转定时器');
    shareContext({ settings: { useVideoRate: false, useForum: true, forumTexts: '已刷新,支持一下', useKeepAlive: false }, log });
    eq(loop.settings().useForum, true, '换档读到新设置');
    eq(AddonLoop.obtain(doc) === loop, true, '全站只一个循环');
  });

  check('装并还原 JSON.parse', () => {
    const original = JSON.parse;
    syncHooks({ jsonCapture: 'all' }, log);
    truthy(JSON.parse !== original, 'all 档接管');
    syncHooks({ jsonCapture: 'off' }, log);
    eq(JSON.parse, original, '关掉还原原函数');
    syncHooks({ jsonCapture: 'xhr' }, log);
    eq(JSON.parse, original, 'xhr 档不碰');
  });

  check('稳缓存键', () => {
    const first = scanner.scan().questions;
    const second = scanner.scan().questions;
    eq(first[0].options[0].letter, 'A', '第 0 个字母 A');
    eq(first[0].options[2].letter, 'C', '第 2 个字母 C');
    truthy(first[0].cacheKey && first[0].cacheKey.length > 4, 'cacheKey 非空');
    eq(first[0].cacheKey, second[0].cacheKey, '重扫缓存键不变');
    eq(first.map(q => q.cacheKey).join('|'), second.map(q => q.cacheKey).join('|'), '整卷顺序不变');
  });

  check('只缓冲候选键回包', () => {
    const original = JSON.parse;
    JsonWatch.install(globalThis.window);
    truthy(JSON.parse !== original, '装后接管');
    const worth = { paper: [{ Id: 1, ContentText: '题干甲', Answers: ['A'] }] };
    const kept = JSON.parse(JSON.stringify(worth));
    truthy(JsonWatch.payloads.some(p => p && p.paper), '候选键包进缓冲');
    truthy(kept && kept.paper.length === 1, '不改变解析结果');
    JSON.parse('{"totallyUnrelatedKey":1}');
    eq(JsonWatch.payloads.some(p => p && p.totallyUnrelatedKey), false, '不相干不占缓冲');
    JsonWatch.release();
    eq(JSON.parse, original, '还回原函数');
  });

  const ZHS_PAYLOAD = () => ({
    rt: {
      examBase: {
        workExamParts: [{
          questionDtos: [{
            id: 900, name: '阅读理解（复合大题）', questionType: { name: '阅读理解' }, questionOptions: [], answer: '',
            questionChildrens: [
              { id: 901, name: '第1小题：这张图说明什么', questionType: { name: '单选题' }, questionOptions: [{ content: '甲', id: 'A' }, { content: '乙', id: 'B' }], answer: '甲' },
              { id: 902, name: '第2小题：这说法对不对', questionType: { name: '判断题' }, questionOptions: [{ content: '正确', id: 'A' }, { content: '错误', id: 'B' }], answer: '正确' }
            ]
          }]
        }]
      }
    }
  });

  const ZHS = () => PlatformRegistry.specs.find(s => s.key === 'zhihuishu-exam');
  const CAP_SETTINGS = Object.assign({}, DEFAULT_SETTINGS, { jsonCapture: 'xhr' });

  check('查三档拦截', () => {
    const zhs = ZHS();
    truthy(zhs && zhs.capture, '智慧树带声明');
    const entry = zhs.capture[0];
    const jsonEntry = { source: 'jsonparse', shape: ['paper'], list: 'paper' };
    const at = level => new NetworkCapture(zhs, { log, settings: Object.assign({}, DEFAULT_SETTINGS, { jsonCapture: level }) });
    eq(at('off').usable(entry), false, 'off 档不采');
    eq(at('xhr').usable(entry), true, 'xhr 档放 xhr 源');
    eq(at('xhr').usable(jsonEntry), false, 'xhr 档不放 jsonparse');
    eq(at('all').usable(jsonEntry), true, 'all 档放全局钩子');
  });

  check('摊平复合大题', () => {
    const cap = new NetworkCapture(ZHS(), { log, settings: CAP_SETTINGS });
    eq(cap.ingest(ZHS_PAYLOAD()), 2, '摊成两条记录');
    const rec = cap.records.find(r => String(r.qid) === '901' || String(r.id) === '901');
    truthy(rec, '按子题 id 存');
    eq(rec.options, ['甲', '乙'], '取子题选项');
    truthy(String(rec.question || '').includes('这张图'), '题干取子题');
    const fresh = new NetworkCapture(ZHS(), { log, settings: CAP_SETTINGS });
    const p = ZHS_PAYLOAD();
    delete p.rt.examBase.workExamParts[0].questionDtos[0].questionChildrens[0].questionType;
    fresh.ingest(p);
    const fallen = fresh.records.find(r => String(r.qid) === '901' || String(r.id) === '901');
    truthy(fallen && /阅读理解/.test(String(fallen.typeLabel || '')), '缺题型要回落父项，实际 ' + JSON.stringify(fallen && fallen.typeLabel));
  });

  check('重放题包不变', () => {
    const cap = new NetworkCapture(ZHS(), { log, settings: CAP_SETTINGS });
    cap.ingest(ZHS_PAYLOAD());
    const rec0 = cap.records.find(r => String(r.qid) === '901' || String(r.id) === '901');
    const batchBefore = cap.batch.map(r => r.qid || r.id).join(',');
    eq(cap.ingest(ZHS_PAYLOAD()), 0, '重放不新增');
    eq(cap.batch.map(r => r.qid || r.id).join(','), batchBefore, '批次不变');
    eq(cap.records.find(r => String(r.qid) === '901' || String(r.id) === '901') === rec0, true, '还是同一个对象');
    rec0.answer = ['甲'];
    const hole = ZHS_PAYLOAD();
    delete hole.rt.examBase.workExamParts[0].questionDtos[0].questionChildrens[0].answer;
    cap.ingest(hole);
    eq(rec0.answer, ['甲'], '空值不覆盖答案');
  });

  check('翻字母成文本', async () => {
    const zhs = PlatformRegistry.specs.find(s => s.key === 'zhihuishu-exam');
    const cap = new NetworkCapture(zhs, { log, settings: CAP_SETTINGS });
    cap.ingest(ZHS_PAYLOAD());
    cap.installed = true;
    const source = new CaptureSource({ capture: cap, settings: CAP_SETTINGS, log });
    eq(source.enabled(), true, '没装上不参与');
    const rec = cap.records.find(r => String(r.qid) === '901' || String(r.id) === '901');
    eq(cap.match({ id: String(rec.qid || rec.id) }) === rec, true, '按 id 对齐记录');
    eq(CaptureSource.expandLetters(['B'], ['甲', '乙']), ['乙'], 'B 翻成第 2 个');
    eq(CaptureSource.expandLetters(['1'], ['甲', '乙']), ['1'], '纯数字不猜');
  });

  check('只拦可见弹层', () => {
    doc.body.children.length = 0;
    doc.body.appendChild(node('div', { class: 'verify-box', style: 'display:block' }));
    eq(RiskGate.blocking(doc), '.verify-box', '可见弹层要拦');
    doc.body.children.length = 0;
    doc.body.appendChild(node('div', { class: 'verify-box', style: 'display:none' }));
    eq(RiskGate.blocking(doc), null, '隐藏不算拦');
    doc.body.children.length = 0;
    eq(RiskGate.blocking(doc), null, '空页面不拦');
  });
  check('查风控等待', async () => {
    doc.body.children.length = 0;
    eq(await RiskGate.wait(doc, { log }), true, '干净立刻放行');
    doc.body.appendChild(node('div', { class: 'yidun_panel', style: 'display:block' }));
    eq(await RiskGate.wait(doc, { log, timeoutMs: 0 }), false, '超时叫停');
    eq(await RiskGate.wait(doc, { log, timeoutMs: 0, aborted: () => true }), false, '中止不放行');
    doc.body.children.length = 0;
    eq(await RiskGate.wait(doc, { log, timeoutMs: 0 }), true, '消失后放行');
  });

  check('接管并还原对话框', () => {
    const win: any = globalThis.window;
    const nativeAlert = () => { throw new Error('站点的 alert'); };
    const nativeConfirm = () => false;
    win.alert = nativeAlert;
    win.confirm = nativeConfirm;
    const ctrl = new SubmitController(SPEC, { log, settings: DEFAULT_SETTINGS });
    ctrl.install(win);
    truthy(win.confirm !== nativeConfirm, 'confirm 被接管');
    eq(win.confirm('确定交卷吗？'), true, '确认框恒真');
    let paused = null;
    const other = Object.assign(Object.create(null), { alert: () => {}, confirm: () => false });
    const withPause = new SubmitController(SPEC, { log, settings: DEFAULT_SETTINGS, requestPause: why => { paused = why; } });
    withPause.install(other);
    other.alert('请先完成滑块验证');
    truthy(paused && /风控/.test(paused), '风控话术要转暂停，实际 ' + paused);
    withPause.uninstall();
    truthy(!('confirm' in other) || typeof other.confirm === 'function', '卸载后仍是函数');
    ctrl.uninstall();
    eq(win.confirm, nativeConfirm, '还原 confirm');
    eq(win.alert, nativeAlert, '还原 alert');
    delete win.__AUTOQUIZ_DIALOG_PATCHED__;
    win.alert = undefined;
    win.confirm = undefined;
  });
  check('按序交卷', async () => {
    const win: any = globalThis.window;
    let calls = 0;
    win.submitExamForTest = () => { calls++; };
    doc.body.children.length = 0;
    doc.body.appendChild(node('button', { class: 'btnBlueSubmit' }, '交卷'));
    const byGlobal = new SubmitController(Object.assign({}, SPEC, { submit: { globals: ['submitExamForTest'] } }), { log, settings: DEFAULT_SETTINGS });
    eq(await byGlobal.submit(win), { ok: true, via: 'submitExamForTest' }, '先走全局函数');
    eq(calls, 1, '真的调到了');
    const byButton = new SubmitController(Object.assign({}, SPEC, { submit: { button: '.btnBlueSubmit' } }), { log, settings: DEFAULT_SETTINGS });
    eq((await byButton.submit(win)).via, 'button', '没全局就点按钮');
    const nothing = new SubmitController(SPEC, { log, settings: DEFAULT_SETTINGS });
    eq(await nothing.save(win), { ok: false, via: 'none' }, '都没有就报 none');
    delete win.submitExamForTest;
  });
  check('点交卷确认层', () => {
    const win: any = globalThis.window;
    doc.body.children.length = 0;
    const layer = doc.body.appendChild(node('div', { class: 'nail-submit-window', style: 'display:block' }));
    layer.appendChild(node('button', { class: 'cancelBtn' }, '取消'));
    const okBtn = layer.appendChild(node('button', { class: 'saveBtn' }, '确定'));
    const ctrl = new SubmitController(Object.assign({}, SPEC, { submit: { confirm: '.nail-submit-window' } }), { log, settings: DEFAULT_SETTINGS });
    eq(ctrl.dismissConfirm(win), true, '有确认层要处理');
    eq(doc._clicks[doc._clicks.length - 1] === okBtn, true, '点确定不点取消');
    eq(new SubmitController(SPEC, { log, settings: DEFAULT_SETTINGS }).dismissConfirm(win), false, '没声明不动手');
    layer.children.length = 0;
  });

  check('装并还原响应钩', () => {
    const win: any = globalThis.window;
    const rawOpen = win.XMLHttpRequest.prototype.open;
    const rawText = Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype, 'responseText');
    eq(ResponseTamper.install(win, [SPEC]), false, '没声明不装');
    const poisoned = PlatformRegistry.specs.filter(s => s.poison);
    truthy(poisoned.length > 0, '要有站声明 poison');
    eq(ResponseTamper.install(win, poisoned), true, '有声明就装');
    truthy(win.XMLHttpRequest.prototype.open !== rawOpen, 'open 被换掉');
    ResponseTamper.release();
    eq(win.XMLHttpRequest.prototype.open, rawOpen, '还原 open');
    eq(!!Object.getOwnPropertyDescriptor(win.XMLHttpRequest.prototype, 'responseText'), !!rawText, '描述符不留残留');
  });
  check('接管并还原 call', () => {
    const win: any = globalThis.window;
    const rawCall = win.Function.prototype.call;
    eq(VueProbe.install(win), true, '要装得上');
    truthy(win.Function.prototype.call !== rawCall, 'call 被接管');
    VueProbe.uninstall();
    eq(win.Function.prototype.call, rawCall, '卸载必须还原');
  });
  check('造可播 WAV', () => {
    const url = KeepAlive.silentWav(8);
    truthy(String(url).startsWith('data:audio/wav;base64,'), '用内联 data URL');
    const bytes = Uint8Array.from(Buffer.from(String(url).split(',')[1], 'base64'));
    const tag = at => Array.from(bytes.slice(at, at + 4), b => String.fromCharCode(b)).join('');
    eq([tag(0), tag(8), tag(12), tag(36)], ['RIFF', 'WAVE', 'fmt ', 'data'], '四个块标记');
    const view = new DataView(bytes.buffer);
    eq([view.getUint16(20, true), view.getUint16(22, true), view.getUint32(24, true), view.getUint16(34, true)], [1, 1, 8000, 8], 'PCM 单声道 8k 8bit');
    eq([view.getUint32(4, true), view.getUint32(40, true)], [44, 8], '两长度字段自洽');
    eq(bytes.length, 52, '44 字节头加 8 采样');
    const win: any = globalThis.window;
    const keeper = new KeepAlive({ log });
    eq(keeper.start(win), true, '启动要成功');
    const audio = keeper.audio;
    truthy(audio && audio.muted === true && audio.loop === true, '必须静音循环');
    keeper.stop();
    eq(keeper.audio, null, '停后不留音频对象');
  });
  check('分站点占席位', () => {
    const win: any = globalThis.window;
    let conflict = null;
    const a = new SessionLock({ log, win, sessionId: 'A', onConflict: who => { conflict = who; } });
    const b = new SessionLock({ log, win, sessionId: 'B', onConflict: () => {} });
    eq(a.acquire('chaoxing.com'), true, 'A 拿到席位');
    eq(win.localStorage.getItem(SessionLock.slot('chaoxing.com')), 'A', '键按站点分');
    b.acquire('chaoxing.com');
    eq(win.localStorage.getItem(SessionLock.slot('chaoxing.com')), 'B', '后拿的覆盖');
    win.__fire('storage', { key: SessionLock.slot('chaoxing.com'), newValue: 'B' });
    eq(conflict, 'B', 'A 收冲突让位');
    a.release('chaoxing.com');
    eq(win.localStorage.getItem(SessionLock.slot('chaoxing.com')), 'B', 'A 清不掉 B 的');
    b.release('chaoxing.com');
    eq(win.localStorage.getItem(SessionLock.slot('chaoxing.com')), null, 'B 清掉自己那份');
  });
  check('以读回为准', () => {
    eq(VideoRate.valid(1), 1, '1 倍是合法值');
    eq(VideoRate.valid(0), 0, '0 是哨兵值');
    eq(VideoRate.valid(20), 0, '超范围归 0');
    eq(VideoRate.valid(2), 2, '2 倍照收');
    const video: any = { playbackRate: 1, paused: false, ended: false, play() { return Promise.resolve(); }, addEventListener() {}, _written: [] };
    Object.defineProperty(video, 'playbackRate', {
      get() { return this._r; }, set(v) { this._written.push(v); this._r = v; }
    });
    video._r = 1;
    eq(VideoRate.apply(video, 2, false), true, '站点接受要认');
    eq(video.playbackRate, 2, '确实写进去');
    const stubborn = { playbackRate: 1, paused: false, play() { return Promise.resolve(); }, addEventListener() {} };
    Object.defineProperty(stubborn, 'playbackRate', { get: () => 1, set: () => {} });
    eq(VideoRate.apply(stubborn, 2, false), false, '站点拒绝不算数');
  });
  check('只认自填文案', () => {
    eq(ForumPoster.texts('已刷新, 支持一下,,顶'), ['已刷新', '支持一下', '顶'], '只取自填文案');
    eq(ForumPoster.texts(''), [], '没填就没有');
    doc.body.children.length = 0;
    const poster = new ForumPoster({ log, click: n => { n.click(); return true; } });
    const before = doc._clicks.length;
    const result = poster.post(doc, { texts: ['已刷新'] });
    truthy(result && result.action === 'no-box', '缺框要回 no-box，实际 ' + JSON.stringify(result));
    eq(doc._clicks.length - before, 0, '缺框一个都不点');
  });

  const SPEC_KEYS = PlatformRegistry.specs.map(s => s.key);
  check('查 spec key 唯一', () => {
    eq(new Set(SPEC_KEYS).size, SPEC_KEYS.length, 'key 唯一');
    const homeless = PlatformRegistry.specs.filter(s => !(s.match && s.match.length) && !(s.hosts && s.hosts.length));
    eq(homeless.map(s => s.key), [], '每条要有 match 或 hosts');
  });
  check('查宽路径基线', () => {
    const HOSTLIKE = /\.[a-z]{2,}/i;
    const loose = [];
    PlatformRegistry.specs.forEach(s => {
      const entries = s.match || [];
      const hasHostOwn = (s.hosts || []).length > 0;
      entries.forEach(entry => {
        const parts = Array.isArray(entry) ? entry : [entry];
        const groupHasHost = parts.some(p => HOSTLIKE.test(String(p.source || '')));
        const literal = parts.map(p => String(p.source || '')).join('');
        if (!groupHasHost && !hasHostOwn && literal.replace(/\\\/|\^|\$|\[|\]|\(|\)|\{|\}|\?|\*|\+|\.|\||\\/g, '').length < 14) {
          loose.push(s.key + ' :: ' + literal);
        }
      });
    });
    const CEILING = 5;
    if (loose.length > CEILING) throw new Error('spec 宽路径越界 ' + loose.length + ' 条，超过已知基线 ' + CEILING + '：' + loose.join(' | '));
    if (loose.length < CEILING) console.log('  （宽路径越界降到 ' + loose.length + ' 条，可下调基线 ' + CEILING + '）');
    truthy(loose.length <= CEILING, '宽路径在基线内');
  });
  check('查选择器写法', () => {
    const bad = [];
    const walk = (value, where) => {
      if (typeof value === 'string') {
        if (!/[.#\[]|:not|>/.test(value)) return;
        const depthOk = (value.match(/\(/g) || []).length === (value.match(/\)/g) || []).length;
        if (!depthOk) bad.push(where + ' 括号不配对: ' + value);
        if (/,\s*,|,\s*$|^\s*,/.test(value) && value.includes(',')) bad.push(where + ' 有空段: ' + value);
        return;
      }
      if (Array.isArray(value)) { value.forEach((v, i) => walk(v, where + '[' + i + ']')); return; }
      if (value && typeof value === 'object') { Object.keys(value).forEach(k => walk(value[k], where + '.' + k)); }
    };
    PlatformRegistry.specs.forEach(s => ['question', 'write', 'pager', 'submit', 'answerCard'].forEach(k => walk(s[k], s.key + '.' + k)));
    eq(bad, [], '查选择器写法，' + bad.length + ' 处不合格');
  });
  check('查假开关', () => {
    const CONFIG_PATHS = ['question.optionsSplit', 'question.optionsByType', 'question.judgementOptions', 'question.indexFrom',
      'question.typeAttribute', 'capture.listJson', 'capture.answerIndex', 'poison', 'submit.confirm'];
    const used = path => PlatformRegistry.specs.some(s => {
      const [head, tail] = path.split('.');
      if (head === 'capture') {
        const list = s.capture ? (Array.isArray(s.capture) ? s.capture : [s.capture]) : [];
        return list.some(entry => entry && entry[tail] != null);
      }
      if (tail === undefined) return s[head] != null;
      return s[head] && s[head][tail] != null;
    });
    const dead = CONFIG_PATHS.filter(p => !used(p));
    eq(dead, [], '查假开关：' + dead.join(', '));
  });

  return await report('e2e');

}

async function routingSection () {

  const { PlatformRegistry, SPECS } = await load([
    ['PlatformRegistry', 'Spec.ts'],
    ['SPECS', 'Spec.ts']
  ], { href: 'https://routing-check.invalid/' });

  const specs = PlatformRegistry.specs;

  function literal(pattern) {
    const src = String(pattern.source);
    let out = '';
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '\\') {
        const next = src[i + 1];
        if (next === undefined) break;
        out += next === 'd' ? '1' : next === 'w' ? 'a' : next === 's' ? '-' : next;
        i += 1;
        continue;
      }
      if (ch === '[') {
        const close = src.indexOf(']', i);
        if (close < 0) break;
        const body = src.slice(i + 1, close);
        out += body.startsWith('^') ? 'a' : (body[0] || 'a');
        i = close;
        continue;
      }
      if (ch === '{') {
        const close = src.indexOf('}', i);
        if (close > 0) i = close;
        continue;
      }
      if (ch === '(' || ch === ')' || ch === '^' || ch === '$') continue;
      if (ch === '|' || ch === '*' || ch === '?') {
        const rest = src.slice(i + 1);
        const stop = rest.search(ch === '|' ? /[\])]/ : /[a-z0-9]/i);
        if (ch === '|' && stop >= 0) i += stop;
        continue;
      }
      if (ch === '.') { out += 'x'; continue; }
      out += ch;
    }
    return out;
  }

  const HOSTLIKE = /^[a-z0-9][a-z0-9.-]*$/i;
  const hostText = p => literal(p).replace(/^\/+|\/+$/g, '').replace(/^\/\/(?:www\.)?/i, '');

  function partsOf(entry) {
    return Array.isArray(entry) ? entry : [entry];
  }

  function urlFor(spec, entry) {
    const parts = partsOf(entry);
    const asText = parts.map(p => (p instanceof RegExp ? p : new RegExp(String(p))));
    const hostItem = asText.map(hostText).find(t => t.includes('.') && !t.includes('/') && HOSTLIKE.test(t));
    const pathish = asText.map(p => literal(p)).find(t => t.includes('/'));
    const bareItem = asText.map(p => literal(p)).find(t => !t.includes('/') && !t.includes('.') && t.length > 4);
    const host = hostItem || (spec.hosts || [])[0] || 'routing-check.invalid';
    let path = pathish || ('/' + (bareItem || 'exam'));
    if (!path.startsWith('/')) path = '/' + path;
    return 'https://' + host + path;
  }

  const hostnames = spec => (spec.hosts || []).map(h => String(h).toLowerCase());
  const covers = (host, domains) => domains.some(d => host === d || host.endsWith('.' + d));

  check('按 label 边界认域名', () => {
    const COMPLETE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?)+$/i;
    const wrong = [];
    let checked = 0;
    specs.forEach(spec => (spec.hosts || []).forEach(domain => {
      const name = String(domain).toLowerCase();
      if (!COMPLETE.test(name)) return;
      ['/exam/test?cid=1', '/'].forEach(path => {
        const traps = ['https://zz' + name + path, 'https://' + name + 'zz.example' + path, 'https://' + name.replace(/\./g, '') + '.test' + path];
        traps.forEach(url => {
          const hit = PlatformRegistry.byHref(url);
          checked++;
          if (hit && hit.key === spec.key) wrong.push(spec.key + ' 认领了 ' + url);
        });
      });
    }));
    truthy(checked > 200, '查假域名，只测到 ' + checked + ' 个');
    eq(wrong.slice(0, 6), [], '查假域名，' + wrong.length + ' 处被当真域名认了');
  });

  check('查不误伤合法域名', () => {
    const COMPLETE = /^[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?)+$/i;
    const lost = [];
    let checked = 0;
    specs.forEach(spec => (spec.match || []).forEach(entry => {
      if (!Array.isArray(entry)) return;
      const hostItems = entry.filter(p => p instanceof RegExp && !literal(p).includes('/') && literal(p).includes('.'));
      const pathItem = entry.find(p => p instanceof RegExp && String(p.source).includes('\\/'));
      if (!hostItems.length || !pathItem) return;
      const path = (() => { const raw = literal(pathItem); return raw.startsWith('/') ? raw : '/' + raw; })();
      hostItems.forEach(p => {
        const pieces = String(p.source).split('|').map(src => {
          try { return literal(new RegExp(src, p.flags)); } catch (e) { return ''; }
        });
        pieces.forEach(h => {
          const name = h.trim().replace(/^\.+|\.+$/g, '');
          if (!COMPLETE.test(name)) return;
          [name, 'deep.sub.' + name].forEach(host => {
            const url = 'https://' + host + path;
            checked++;
            if (!PlatformRegistry.matches(spec, url)) lost.push(spec.key + ' 丢了 ' + url);
          });
        });
      });
    }));
    truthy(checked >= 40, '查组合，只测到 ' + checked + ' 个');
    eq(lost.slice(0, 6), [], '查误伤，' + lost.length + ' 个合法域名被挡掉');
  });

  check('查 ouchn 归属', () => {
    const edu = '/edu/public/student/index';
    eq(PlatformRegistry.byHref('https://zzx.ouchn.edu.cn' + edu).key, 'zzx-ouchn-exam', 'zzx 子域归 zzx');
    eq(PlatformRegistry.byHref('https://old-zzx.ouchn.edu.cn' + edu).key, 'oldzzx-exam', 'old-zzx 归 oldzzx');
  });

  const hostPatterns = [];
  specs.forEach(spec => (spec.match || []).forEach(entry => {
    partsOf(entry).forEach(p => {
      if (!(p instanceof RegExp)) return;
      const rendered = hostText(p);
      if (rendered.includes('.') && !rendered.includes('/')) hostPatterns.push({ spec: spec.key, re: p, host: rendered });
    });
  }));

  check('稳域名型抽取量', () => {
    console.log('  （查域名型判定，认出 ' + hostPatterns.length + ' 条）');
    truthy(hostPatterns.length >= 60, '查域名型判定，只抽到 ' + hostPatterns.length + ' 条');
  });

  const crossClaimed = [];
  const unclaimed = [];
  let covered = 0;
  specs.forEach(spec => {
    (spec.match || []).forEach(entry => {
      const url = urlFor(spec, entry);
      const winner = PlatformRegistry.byHref(url);
      if (!winner) { unclaimed.push(spec.key + ' → ' + url); return; }
      covered++;
      if (winner.key === spec.key) return;
      const host = url.replace(/^https:\/\//, '').split('/')[0];
      const sameFamily = covers(host, hostnames(winner)) && covers(host, hostnames(spec));
      if (!sameFamily) crossClaimed.push(spec.key + ' 的 ' + url + ' 被 ' + winner.key + ' 抢走');
    });
  });

  check('查矩阵覆盖率', () => {
    const total = specs.reduce((n, s) => n + (s.match || []).length, 0);
    console.log('  （查矩阵，覆盖 ' + covered + '/' + total + ' 条 match，无人认领 ' + unclaimed.length + ' 条）');
    truthy(covered >= Math.floor(total * 0.85), '查矩阵，认领 ' + covered + ' / ' + total + '，无人认领 ' + unclaimed.length + ' 条');
    if (unclaimed.length) console.log('  （无人认领的：' + unclaimed.slice(0, 3).join(' ; ') + '）');
    return true;
  });

  check('查跨域抢占', () => {
    eq(crossClaimed.slice(0, 8), [], '查跨域抢占，' + crossClaimed.length + ' 处');
  });

  check('造超星五族 URL', () => {
    const families = PlatformRegistry.specs.filter(s => s.key.startsWith('chaoxing-'));
    truthy(families.length >= 5, '超星族至少 5 条');
    const wrong = [];
    families.forEach(spec => spec.match.forEach(entry => {
      const path = literal(entry instanceof RegExp ? entry : entry[entry.length - 1]);
      ['https://mooc1.chaoxing.com/', 'https://mooc2-ans.chaoxing.com/mooc2-ans/'].forEach(base => {
        const url = base + path.replace(/^\/+/, '') + '?courseId=1';
        if (!PlatformRegistry.matches(spec, url)) return;
        const hit = PlatformRegistry.byHref(url);
        if (!hit || hit.key !== spec.key) wrong.push(spec.key + ' @ ' + url + ' → ' + (hit ? hit.key : '无人认领'));
      });
    }));
    eq(wrong.slice(0, 6), [], '查超星归属，共 ' + wrong.length + ' 处不对');
  });

  check('查 exclude 生效', () => {
    const withExclude = specs.filter(s => (s.exclude || []).length);
    truthy(withExclude.length > 0, '要有带 exclude 的');
    const broke = [];
    withExclude.forEach(spec => {
      spec.exclude.forEach(ex => {
        const path = literal(ex).replace(/^[^/]*(?=.)/, '');
        const url = 'https://' + ((spec.hosts || [])[0] || 'x.example') + '/' + path;
        if (!(ex instanceof RegExp) || !ex.test(url)) return;
        if (!PlatformRegistry.matches(spec, url)) return;
        const hit = PlatformRegistry.byHref(url);
        if (hit && hit.key === spec.key) broke.push(spec.key + ' 没被自己的 exclude 挡住: ' + url);
      });
    });
    eq(broke, [], 'exclude 失效');
  });

  check('查 presence 兜底', () => {
    eq(PlatformRegistry.byPresence('https://totally-unknown-host.test/x', { querySelectorAll: () => [{}] }), null, '域名对不上不兜底');
    eq(PlatformRegistry.byPresence('not a url', { querySelectorAll: () => [{}] }), null, '非法 URL 放弃');
    eq(PlatformRegistry.byPresence('https://mooc2-ans.chaoxing.com/x', null), null, '没 document 不动手');
    const hitRoot = sel => (String(sel).includes('.questionLi') || String(sel).includes('.TiMu') ? [{}] : []);
    truthy(PlatformRegistry.byPresence('https://mooc2-ans.chaoxing.com/x', { querySelectorAll: hitRoot }), '域名对加题根要兜住');
    eq(PlatformRegistry.byPresence('https://mooc2-ans.chaoxing.com/x', { querySelectorAll: () => [] }), null, '没题根不认领');
  });

  check('查核心表靠前', () => {
    eq(specs.slice(0, SPECS.length).map(s => s.key).join(','), SPECS.map(s => s.key).join(','), '前段是核心表');
  });

  check('对齐 byHref 与 detect', () => {
    const url = 'https://mooc2-ans.chaoxing.com/mooc2-ans/exam-ans/exam/test/reVersionTestStartNew?courseId=1';
    const direct = PlatformRegistry.byHref(url);
    truthy(direct, '该由 match 命中');
    eq(PlatformRegistry.detect(url, { querySelectorAll: () => [] }), direct, '直接命中不换源');
  });

  return await report('routing');

}

async function engineSection () {

  const { QuizEngine, QuestionType, DEFAULT_SETTINGS, Logger, PlatformRegistry } = await load([
    ['QuizEngine', 'Engine.ts'],
    ['QuestionType', 'Utils.ts'],
    ['DEFAULT_SETTINGS', 'Config.ts'],
    ['Logger', 'Utils.ts'],
    ['PlatformRegistry', 'Spec.ts']
  ], { href: 'https://engine-synthetic.test/exam' });

  const SPEC = {
    key: 'engine-synthetic',
    name: '引擎合成站',
    hosts: ['engine-synthetic.test'],
    match: [/engine-synthetic/i],
    question: { root: '.TiMu', stem: '.stem', options: '.opt', clickables: '.opt input', typeText: '.qtype' },
    write: { target: '.opt', checked: ['input:checked'] }
  };

  const doc: any = globalThis.document;
  const log = new Logger({ mirror: false });
  const mk = (t: any, a?: any, x?: any) => {
    const n = doc.createElement(t);
    Object.entries(a || {}).forEach(([k, v]) => n.setAttribute(k, v));
    if (x != null) n.textContent = x;
    return n;
  };

  function paper() {
    doc.children.length = 0;
    doc.head = doc.appendChild(mk('head'));
    doc.body = doc.appendChild(mk('body'));
    const card = (type, stem, opts, inputType) => {
      const root = doc.body.appendChild(mk('div', { class: 'TiMu' }));
      root.appendChild(mk('div', { class: 'qtype' }, type));
      root.appendChild(mk('div', { class: 'stem' }, stem));
      opts.forEach(text => {
        const opt = root.appendChild(mk('div', { class: 'opt' }));
        opt.appendChild(mk('span', {}, text));
        opt.appendChild(mk('input', { type: inputType, name: stem.slice(0, 4) }));
      });
      return root;
    };
    card('单选题', '1、下列哪一项属于我国的基本经济制度？', ['公有制为主体、多种所有制共同发展', '单一公有制', '按需分配'], 'radio');
    card('多选题', '2、下列属于市场失灵的有？', ['外部性', '公共物品', '完全竞争', '垄断'], 'checkbox');
    card('判断题', '3、市场经济只是一种资源配置方式。', ['正确', '错误'], 'radio');
  }

  const inputOf = o => (o.node.tagName === 'INPUT' ? o.node : o.node.querySelector('input'));

  const settings = (extra?: any) => Object.assign({}, DEFAULT_SETTINGS, {
    lanes: 1, questionDelay: [0, 0], optionDelay: [0, 0], minTimeMs: 0, useCache: true
  }, extra || {});

  let cacheWrites = [];
  function engine(extraSettings?: any) {
    cacheWrites = [];
    const store = {
      cacheList: () => [],
      cachePut: entry => cacheWrites.push(entry),
      settings: () => settings(extraSettings),
      get: (k, d) => d,
      set: () => {}
    };
    return new QuizEngine({ spec: SPEC, settings: settings(extraSettings), store, log });
  }

  paper();
  let eng = engine();
  let questions = eng.rescan();

  check('采三题', () => {
    eq(questions.length, 3, '出题数');
    eq(questions.map(q => q.type), [QuestionType.SINGLE, QuestionType.MULTIPLE, QuestionType.JUDGEMENT], '出题型序列');
    eq(questions[1].options.length, 4, '多选四选项');
    eq(questions[0].options[0].node.tagName, 'INPUT', '可点节点取 input');
    eq(questions[0].options[0].textNode.tagName, 'DIV', '文字节点取 .opt');
    truthy(questions[0].options[0].text.includes('基本经济制度') === false && questions[0].options[0].text.length > 0, '选项文本非空，实际 ' + JSON.stringify(questions[0].options[0].text));
    return true;
  });

  check('单选命中即写', async () => {
    const rec = await eng.answerOne(0, { candidates: [{ from: 'cache', priority: 0, answers: ['公有制为主体、多种所有制共同发展'] }] });
    eq([rec.finish, rec.from, rec.matched], [true, 'cache', 'exact'], '命中并说明来源');
    eq(rec.written >= 1, true, '计入写入数');
    const radio = inputOf(questions[0].options[0]);
    eq(radio.checked, true, '第 1 个被选中');
    eq(questions[0].options.slice(1).some(o => inputOf(o).checked), false, '其余没被点上');
  });

  check('只回写非缓存命中', async () => {
    await eng.answerOne(0, { candidates: [{ from: 'cache', priority: 0, answers: ['公有制为主体、多种所有制共同发展'] }] });
    eq(cacheWrites.length, 0, '缓存命中不回写');
    await eng.answerOne(0, { candidates: [{ from: 'tiku', priority: 3, answers: ['单一公有制'] }] });
    eq(cacheWrites.length, 1, '题库命中要回写');
    eq([cacheWrites[0].stem.includes('基本经济制度'), Array.isArray(cacheWrites[0].answer), !!cacheWrites[0].key], [true, true, true], '回写记录可再查');
  });

  check('多选按组勾', async () => {
    const rec = await eng.answerOne(1, { candidates: [{ from: 'tiku', priority: 3, answers: [['外部性', '公共物品']] }] });
    eq(rec.finish, true, '要命中');
    eq(rec.texts.sort().join('|'), ['公共物品', '外部性'].sort().join('|'), '两个都选上');
    const boxes = questions[1].options.map(o => inputOf(o).checked);
    eq(boxes, [true, true, false, false], '勾了前两个');
  });

  check('未命中不写', async () => {
    const before = cacheWrites.length;
    const rec = await eng.answerOne(2, { candidates: [{ from: 'tiku', priority: 3, answers: ['这个答案对不上任何选项'] }] });
    eq([rec.finish, rec.forced], [false, false], '不装作写过');
    eq('written' in rec, false, '记录里没有 written');
    truthy(/no-|empty|unmatched|candidate/.test(String(rec.matched)), 'matched 要说原因，实际 ' + rec.matched);
    eq(questions[2].options.some(o => inputOf(o).checked), false, '未命中不点');
    eq(cacheWrites.length, before, '未命中不回写');
    truthy(Array.isArray(rec.candidateTexts) && /tiku:/.test(rec.candidateTexts[0]), '说清题库回了什么');
  });

  check('随机兜底不算对', async () => {
    paper();
    const e = engine({ fillUnmatched: true });
    e.rescan();
    const rec = await e.answerOne(0, { candidates: [{ from: 'tiku', priority: 3, answers: ['对不上的答案'] }] });
    eq([rec.finish, rec.forced, rec.matched], [false, true, 'random'], '随机填必须标 forced');
    eq(rec.written + rec.skipped >= 1, true, '要碰到页面');
    const s = e.summary();
    eq([s.total, s.answered], [3, 0], '整页 3 题真命中 0');
  });

  check('跑完一页对账', async () => {
    const e = engine();
    e.rescan();
    const fetched = { tiku: 0 };
    e.hub.sources.forEach(source => {
      if (source.name !== 'tiku') return;
      source.fetch = async () => { fetched.tiku++; return [['公有制为主体、多种所有制共同发展'], ['外部性', '公共物品'], ['正确']][Math.min(fetched.tiku, 3) - 1] ? [[['公有制为主体、多种所有制共同发展'], ['外部性', '公共物品'], ['正确']][fetched.tiku - 1]] : []; };
    });
    await e.runPage(0);
    const s = e.summary();
    eq([s.total, s.done, s.pending], [3, 3, 0], '三题都有结论');
    truthy(s.answered >= 1, '至少一题真命中，实际 ' + s.answered);
    const again = await e.runPage(0);
    truthy(again === undefined || typeof again === 'object', '重复跑不抛');
  });

  check('停止后不再写', async () => {
    const e = engine();
    e.rescan();
    e.hub.sources.forEach(source => {
      if (source.name === 'tiku') source.fetch = async () => [['公有制为主体、多种所有制共同发展'], ['外部性', '公共物品'], ['正确']];
    });
    e.stop();
    const before = doc._clicks.length;
    await e.runPage(0);
    eq(doc._clicks.length, before, '停止后不点');
    eq(e.summary().answered, 0, '也不作答');
  });

  check('回扫答题卡', () => {
    const marked = Object.assign({}, SPEC, { question: Object.assign({}, SPEC.question, { doneMarker: '.done-flag' }) });
    const e = new QuizEngine({ spec: marked, settings: settings(), store: { cacheList: () => [], cachePut: () => {}, settings: () => settings(), get: (k, d) => d, set: () => {} }, log });
    e.rescan();
    eq(e.skipDone(e.questions[0]), false, '没标记不算已答');
    e.questions[0].root.appendChild(mk('span', { class: 'done-flag' }));
    eq(e.skipDone(e.questions[0]), true, '有标记就要认');
  });

  check('查状态机', () => {
    const e = engine();
    e.rescan();
    e.pause('风控弹层');
    eq([e.state, e.pauseReason], ['idle', ''], '没在跑不许改态');
    e.state = 'running';
    e.pause('风控弹层');
    eq([e.state, e.pauseReason], ['paused', '风控弹层'], '暂停带原因');
    e.resume();
    eq(e.state, 'running', '恢复回运行态');
    e.stop();
    eq([e.state, e.abort], ['idle', true], '停止置 abort');
  });

  check('注册合成站', () => {
    PlatformRegistry.register(SPEC);
    eq(PlatformRegistry.byHref('https://engine-synthetic.test/exam/1').key, 'engine-synthetic', '合成站能认领');
  });

  return await report('engine');

}

const isCli = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) {
  const SECTIONS = [
    { name: 'build', what: '出产物并拦图外模块', run: buildSection },
    { name: 'gates', what: '跑五道门', run: gatesSection },
    { name: 'unit', what: '查纯函数 29 条', run: unitSection },
    { name: 'e2e', what: '查链路 30 条', run: e2eSection },
    { name: 'routing', what: '查路由矩阵 11 条', run: routingSection },
    { name: 'engine', what: '查编排 11 条', run: engineSection }
  ];
  const picks = process.argv.slice(2).filter(a => !a.startsWith('--'));
  const chosen = picks.length ? SECTIONS.filter(s => picks.some(p => s.name.includes(p))) : SECTIONS;
  if (!chosen.length) {
    console.error('没有段匹配 ' + picks.join(' ') + '\n可选：' + SECTIONS.map(s => s.name).join(' '));
    process.exit(2);
  }

  const bad = [];
  for (const s of chosen) {
    const t0 = Date.now();
    let code = 0;
    reset();
    try { code = (await s.run()) || 0 } catch (e) { code = 2; console.error(e && (e.message || e)) }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (code) bad.push(s.name);
    console.log((code ? '\x1b[31m✗\x1b[0m ' : '\x1b[32m✓\x1b[0m ') + s.name.padEnd(9) + secs.padStart(6) + 's  ' + s.what + (code ? '  退出码 ' + code : ''));
  }
  console.log('\n' + (bad.length ? '\x1b[31m' : '') + '共 ' + chosen.length + ' 段，失败 ' + bad.length + ' 段' + (bad.length ? '：' + bad.join(' ') : '\x1b[0m'));
  process.exit(bad.length ? 1 : 0);
}
