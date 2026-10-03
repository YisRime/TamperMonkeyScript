// 附加域：Vue 取题、响应改写、多开让位、倍速、保活、水帖与附加循环
import { Logger, toBase64, NAMESPACE, PAGE_WINDOW } from "./Utils.ts";
import { Store } from "./Config.ts";
import { FrameProbe, TextSanitizer } from "./Probe.ts";
import { JsonWatch, PlatformRegistry } from "./Spec.ts";

// Vue 实例穿透
export class VueProbe {
  static KEY = '__autoquizVue';
  static LIST = '__AUTOQUIZ_VUE_LIST__';
  static installs = 0;
  static restore = null;

  // 装钩
  static install(win) {
    if (!win) return false;
    if (VueProbe.installs) { VueProbe.installs += 1; return true; }
    const rawCall = win.Function && win.Function.prototype && win.Function.prototype.call;
    if (!rawCall) return false;
    const isVue = (value) => !!(value && typeof value.mixin === 'function' && typeof value.version === 'string');
    const mixinInto = (candidate) => {
      const vue = candidate && candidate.default && isVue(candidate.default) ? candidate.default : candidate;
      if (!isVue(vue) || vue.__autoquizMixed) return false;
      vue.__autoquizMixed = 1;
      try {
        vue.mixin({
          mounted() {
            const element = this.$el;
            if (element && !element[VueProbe.KEY]) {
              try { element[VueProbe.KEY] = this; } catch (e) {}
            }
            if (!win[VueProbe.LIST]) win[VueProbe.LIST] = [];
            const list = win[VueProbe.LIST];
            if (list.length < 4000) list.push(this);
          }
        });
      } catch (e) { return false; }
      return true;
    };
    win.Function.prototype.call = function (thisArg, ...args) {
      const result = rawCall.apply(this, [thisArg].concat(args));
      if (!VueProbe.installs) return result;
      mixinInto(thisArg);
      for (let i = 0; i < args.length && i < 3; i++) mixinInto(args[i]);
      return result;
    };
    VueProbe.installs = 1;
    VueProbe.restore = () => { win.Function.prototype.call = rawCall; };
    return true;
  }

  // 卸钩
  static uninstall() {
    if (!VueProbe.installs) return;
    VueProbe.installs -= 1;
    if (!VueProbe.installs && VueProbe.restore) {
      VueProbe.restore();
      VueProbe.restore = null;
    }
  }
}

// 响应改写
export class ResponseTamper {
  static installs = 0;
  static restore = null;

  // 无声明不装钩
  static install(win, specs) {
    const list = Array.isArray(specs) ? specs : [specs].filter(Boolean);
    if (!win || !list.some((spec) => (spec.poison || []).length)) return false;
    if (ResponseTamper.installs) { ResponseTamper.installs += 1; return true; }
    const Raw = win.XMLHttpRequest;
    if (!Raw || !Raw.prototype) return false;
    const rawOpen = Raw.prototype.open;
    Raw.prototype.open = function (method, url, ...rest) {
      // 按站点取规则并挂改写钩
      const target = String(url || '');
      for (const spec of list) {
        const rules = spec.poison || [];
        for (const rule of rules) {
          if (rule && rule.marker && target.includes(rule.marker)) {
            const body = rule.with == null ? '[]' : String(rule.with);
            this.addEventListener('readystatechange', function () {
              if (this.readyState !== 4) return;
              ['responseText', 'response'].forEach((field) => {
                try {
                  Object.defineProperty(this, field, { configurable: true, get: () => body });
                } catch (e) {}
              });
            });
            break;
          }
        }
      }
      return rawOpen.apply(this, [method, url].concat(rest));
    };
    ResponseTamper.installs = 1;
    ResponseTamper.restore = () => { Raw.prototype.open = rawOpen; };
    return true;
  }

  // 卸钩
  static release() {
    if (!ResponseTamper.installs) return;
    ResponseTamper.installs -= 1;
    if (!ResponseTamper.installs && ResponseTamper.restore) {
      ResponseTamper.restore();
      ResponseTamper.restore = null;
    }
  }
}

// 同站多开互斥
export class SessionLock {
  declare listener: any;
  declare log: any;
  declare onConflict: any;
  declare sessionId: any;
  declare win: any;

  // 席位按站点分
  static slot(host) {
    return 'autoquiz_session:' + String(host || 'local');
  }

  constructor(options: any = {}) {
    this.log = options.log || new Logger({ mirror: false });
    this.win = options.win || null;
    this.sessionId = options.sessionId || '';
    this.listener = null;
    this.onConflict = options.onConflict || null;
  }

  // 取本地存储
  static store(win) {
    try {
      return win && win.localStorage ? win.localStorage : null;
    } catch (e) {
      return null;
    }
  }

  // 抢席位
  acquire(host) {
    const win = this.win;
    const storage = SessionLock.store(win);
    if (!storage || !win || !this.sessionId) return false;
    const key = SessionLock.slot(host);
    try {
      storage.setItem(key, this.sessionId);
    } catch (e) {
      return false;
    }
    if (this.listener) return true;
    this.listener = (event) => {
      if (!event || event.key !== key || !event.newValue || event.newValue === this.sessionId) return;
      this.log.warn('检测到另一个标签页在同一站点作答，本实例已暂停');
      if (this.onConflict) this.onConflict(event.newValue);
    };
    win.addEventListener('storage', this.listener);
    return true;
  }

  // 让出席位
  release(host) {
    const storage = SessionLock.store(this.win);
    if (storage) {
      try {
        if (storage.getItem(SessionLock.slot(host)) === this.sessionId) storage.removeItem(SessionLock.slot(host));
      } catch (e) {}
    }
    if (this.win && this.listener) {
      try {
        this.win.removeEventListener('storage', this.listener);
      } catch (e) {}
    }
    this.listener = null;
  }
}

// 视频倍速
export class VideoRate {
  declare keepPlaying: any;
  declare log: any;
  declare observer: any;
  declare rate: any;
  declare timer: any;
  declare watched: any;

  constructor(options: any = {}) {
    this.log = options.log || new Logger({ mirror: false });
    this.timer = null;
    this.observer = null;
    this.watched = new WeakSet();
    this.rate = 1;
    this.keepPlaying = false;
  }

  // 校验倍速
  static valid(rate) {
    const value = Number(rate);
    return Number.isFinite(value) && value >= 0.25 && value <= 16 ? value : 0;
  }

  // 只改单个视频
  static apply(video, rate, keepPlaying) {
    const want = VideoRate.valid(rate);
    if (!want) return false;
    let done = false;
    try {
      if (Number(video.playbackRate) !== want) video.playbackRate = want;
      done = Number(video.playbackRate) === want;
    } catch (e) {}
    if (keepPlaying) VideoRate.resume(video);
    return done;
  }

  // 被暂停续播
  static resume(video) {
    try {
      if (video.ended || !video.paused) return;
      const playing = video.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    } catch (e) {}
  }

  // 起倍速
  start(page, rate, keepPlaying) {
    this.stop();
    const want = VideoRate.valid(rate);
    if (!want || !page || !page.body) return false;
    this.rate = want;
    this.keepPlaying = !!keepPlaying;
    const self = this;
    const sweep = () => {
      Array.from<any>(page.querySelectorAll('video')).forEach((video) => {
        if (!self.watched.has(video)) {
          self.watched.add(video);
          const reassert = () => VideoRate.apply(video, self.rate, self.keepPlaying);
          ['play', 'ratechange', 'loadedmetadata', 'seeked'].forEach((type) => video.addEventListener(type, reassert));
          if (self.keepPlaying) video.addEventListener('ended', () => VideoRate.resume(video));
        }
        VideoRate.apply(video, self.rate, self.keepPlaying);
      });
    };
    sweep();
    if (typeof MutationObserver === 'function') {
      try {
        this.observer = new MutationObserver(sweep);
        this.observer.observe(page.body, { childList: true, subtree: true });
      } catch (e) {
        this.log.warn('视频监听挂不上，退回轮询: ' + e.message);
      }
    }
    this.timer = setInterval(sweep, 4000);
    return true;
  }

  // 停倍速
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.observer && this.observer.disconnect) this.observer.disconnect();
    this.observer = null;
    this.rate = 0;
    this.keepPlaying = false;
  }
}

// 静音音频保活
export class KeepAlive {
  declare audio: any;
  declare page: any;
  declare listener: any;
  declare log: any;

  constructor(options: any = {}) {
    this.log = options.log || new Logger({ mirror: false });
    this.audio = null;
    this.listener = null;
    this.page = null;
  }

  // 静音采样值
  static silentWav(samples?) {
    const count = samples || 4000;
    const bytes = new Uint8Array(44 + count);
    const view = new DataView(bytes.buffer);
    const ascii = (at, text) => {
      for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
    };
    ascii(0, 'RIFF');
    view.setUint32(4, 36 + count, true);
    ascii(8, 'WAVE');
    ascii(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, 8000, true);
    view.setUint32(28, 8000, true);
    view.setUint16(32, 1, true);
    view.setUint16(34, 8, true);
    ascii(36, 'data');
    view.setUint32(40, count, true);
    bytes.fill(128, 44);
    return 'data:audio/wav;base64,' + toBase64(bytes);
  }

  // 起保活
  start(win) {
    if (this.audio) return true;
    const page = win && win.document;
    if (!win || !win.Audio || !page) return false;
    try {
      const audio = new win.Audio(KeepAlive.silentWav());
      audio.loop = true;
      audio.muted = true;
      this.audio = audio;
      this.page = page;
      this.listener = () => this.sync();
      page.addEventListener('visibilitychange', this.listener);
      this.sync();
      return true;
    } catch (e) {
      this.log.warn('静音保活起不来: ' + e.message);
      this.audio = null;
      return false;
    }
  }

  // 仅后台播放
  sync() {
    if (!this.audio) return false;
    const hidden = !!(this.page && this.page.hidden);
    if (hidden) {
      const playing = this.audio.play();
      if (playing && typeof playing.catch === 'function') playing.catch(() => {});
    } else if (!this.audio.paused) {
      try {
        this.audio.pause();
      } catch (e) {}
    }
    return hidden;
  }

  // 停保活
  stop() {
    if (this.audio) {
      try {
        this.audio.pause();
        this.audio.src = '';
      } catch (e) {}
    }
    if (this.page && this.listener) {
      try {
        this.page.removeEventListener('visibilitychange', this.listener);
      } catch (e) {}
    }
    this.audio = null;
    this.listener = null;
    this.page = null;
  }
}

// 讨论区水帖
export class ForumPoster {
  declare click: any;
  declare fill: any;
  declare log: any;

  constructor(options: any = {}) {
    this.log = options.log || new Logger({ mirror: false });
    this.click = typeof options.click === 'function' ? options.click : (node) => { try { node.click(); return true; } catch (e) { return false; } };
    this.fill = typeof options.fill === 'function' ? options.fill : null;
  }

  // 切文案
  static texts(raw) {
    return String(raw == null ? '' : raw)
      .split(/[,，、\n]/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  // 发帖
  post(page, options) {
    const config = options || {};
    const list = ForumPoster.texts(config.texts);
    const text = config.text || (list.length ? list[Math.min(list.length - 1, Math.floor((config.random || Math.random)() * list.length))] : '');
    if (!text) return { action: 'no-text', text: '' };
    // 只认讨论框
    const visible = FrameProbe.queryAll('textarea, [contenteditable="true"], input[type=text]', page)
      .filter((node) => !node.disabled && !node.readOnly && FrameProbe.visible(node));
    const scoreOf = (node) => {
      const scope = [node.placeholder, node.name, node.id, node.className, node.parentElement && node.parentElement.className, node.parentElement && node.parentElement.textContent]
        .map((value) => TextSanitizer.collapse(String(value == null ? '' : value))).join(' ');
      return /讨论|回复|评论|discuss|comment|reply|forum/i.test(scope) ? 2 : 0;
    };
    const box = visible.slice().sort((a, b) => scoreOf(b) - scoreOf(a)).find((node) => scoreOf(node) > 0) || null;
    if (!box) return { action: 'no-box', text };
    // 容器内找按钮
    const container = (box.closest && box.closest('[class*=discuss], [class*=comment], [class*=reply], [class*=publish], form')) || page;
    const submitSelector = 'button, a, .btn, [class*=submit], [class*=publish]';
    const submitTexts = ['发布', '发表', '提交回复', '回复', 'POST'];
    const found = FrameProbe.byText(submitSelector, submitTexts, container);
    const button = found.length ? found[0] : (container === page ? null : FrameProbe.byText(submitSelector, submitTexts, page)[0] || null);
    if (!button) return { action: 'no-submit', text };
    // 写进框
    if (box.isContentEditable) { box.textContent = text; } else { box.value = String(text); }
    if (this.fill) {
      this.fill(box, text);
    } else {
      const view = box.ownerDocument && box.ownerDocument.defaultView;
      const EventClass = view && view.Event;
      if (EventClass) ['input', 'change'].forEach((type) => { try { box.dispatchEvent(new EventClass(type, { bubbles: true })); } catch (e) {} });
    }
    const clicked = this.click(button);
    this.log.info(clicked ? '已提交讨论帖：' + text.slice(0, 20) : '讨论发布按钮点不动，请手动提交');
    return { action: clicked ? 'posted' : 'no-submit', text };
  }
}

const HOOK_TOKEN = { json: false, tamper: false };

let context = null;

// 注入引擎上下文
export function shareContext(shared) { context = shared; }

// 抢装全局钩子
export function syncHooks(settings, log?) {
  const config = settings || {};
  if (config.jsonCapture === 'all' && !HOOK_TOKEN.json) {
    JsonWatch.install(PAGE_WINDOW);
    HOOK_TOKEN.json = true;
  } else if (config.jsonCapture !== 'all' && HOOK_TOKEN.json) {
    JsonWatch.release();
    HOOK_TOKEN.json = false;
  }
  if (config.useResponseTamper && !HOOK_TOKEN.tamper) {
    if (!ResponseTamper.install(PAGE_WINDOW, PlatformRegistry.specs) && log) log.warn('没有站点声明要改写的接口，响应改写未启用');
    else HOOK_TOKEN.tamper = true;
  } else if (!config.useResponseTamper && HOOK_TOKEN.tamper) {
    ResponseTamper.release();
    HOOK_TOKEN.tamper = false;
  }
}

// 附加能力循环
export class AddonLoop {
  static shared: any = null;

  declare click: any;
  declare keeper: any;
  declare log: any;
  declare posted: any;
  declare poster: any;
  declare rated: any;
  declare readSettings: any;
  declare timer: any;
  declare video: any;

  constructor(options: any = {}) {
    this.readSettings = options.settings;
    this.log = options.log || new Logger({ mirror: false });
    this.click = options.click || ((node) => { try { node.click(); return true; } catch (e) { return false; } });
    this.video = new VideoRate({ log: this.log });
    this.poster = new ForumPoster({ log: this.log, click: this.click });
    this.keeper = null;
    this.timer = null;
    this.posted = false;
    this.rated = false;
  }

  // 当前设置
  settings() {
    return this.readSettings() || {};
  }

  // 常驻定时器
  wanted() {
    const config = this.settings();
    return !!config.useVideoRate || (!!config.useForum && !!ForumPoster.texts(config.forumTexts).length && !this.posted);
  }

  // 同步附加能力
  sync(page) {
    const config = this.settings();
    const rate = VideoRate.valid(config.videoRate);
    if (config.useVideoRate && rate) {
      if (!this.rated || this.video.rate !== rate || this.video.keepPlaying !== !!config.videoKeepPlaying) {
        this.rated = this.video.start(page, rate, config.videoKeepPlaying);
        if (this.rated) this.log.info(`视频倍速已开启：${rate}x${config.videoKeepPlaying ? ' + 自动续播' : ''}（部分平台会检测速率，被检测请改回 1）`);
      }
    } else if (this.rated) {
      this.video.stop();
      this.rated = false;
    }
    if (config.useForum && !this.posted && ForumPoster.texts(config.forumTexts).length) {
      const done = this.poster.post(page, { texts: config.forumTexts });
      if (done.action === 'posted') this.posted = true;
      else if (done.action !== 'no-box' && done.action !== 'no-text') this.log.warn('讨论帖没发出去：' + done.action);
    }
    return { rated: this.rated, posted: this.posted };
  }

  // 起循环
  start(page, intervalMs) {
    // 保活自带事件
    if (this.settings().useKeepAlive) {
      if (!this.keeper) {
        const keeper = new KeepAlive({ log: this.log });
        if (keeper.start(PAGE_WINDOW)) this.keeper = keeper;
        else keeper.stop();
      }
    } else if (this.keeper) {
      this.keeper.stop();
      this.keeper = null;
    }
    if (!this.wanted()) {
      if (this.timer) { clearInterval(this.timer); this.timer = null; }
      if (this.rated) { this.video.stop(); this.rated = false; }
      return this;
    }
    this.sync(page);
    if (!this.timer) {
      this.timer = setInterval(() => {
        if (!this.wanted()) this.stop();
        else this.sync(page);
      }, intervalMs || 4000);
    }
    return this;
  }

  // 停循环
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.video.stop();
    this.rated = false;
  }

  // 全站单例入口
  static obtain(page, options?) {
    if (!AddonLoop.shared) {
      const store = new Store(NAMESPACE);
      AddonLoop.shared = new AddonLoop({
        settings: () => (context ? context.settings : store.settings()),
        log: (context && context.log) || new Logger()
      });
    }
    return AddonLoop.shared.start(page, options && options.intervalMs);
  }
}
