// 防护域：风控闸门、防巡查与交卷控制
import { FrameProbe } from "./Probe.ts";
import { sleep, HAS_DOM, PAGE_WINDOW, jitter } from "./Utils.ts";

// 风控弹层闸门
export class RiskGate {
  static MARKERS = ['.yidun_popup--light', '.yidun_panel', '#fcqrimg', '.chapterVideoFaceMaskDiv', '.verify-box'];
  // 是否被拦
  static blocking(page) {
    if (!page || !page.querySelectorAll) return null;
    for (const selector of RiskGate.MARKERS) {
      const hit = FrameProbe.queryAll(selector, page).find((node) => FrameProbe.visible(node));
      if (hit) return selector;
    }
    return null;
  }
  // 等到放行或超时
  static async wait(page, options) {
    const config = options || {};
    const log = config.log || null;
    const timeout = config.timeoutMs == null ? 120000 : config.timeoutMs;
    const started = Date.now();
    let blocked = RiskGate.blocking(page);
    if (!blocked) return true;
    if (log) log.warn('检测到风控弹层（' + blocked + '），请手动完成验证后自动继续');
    while (blocked && Date.now() - started < timeout) {
      if (config.aborted && config.aborted()) {
        if (log) log.warn('等待验证期间已停止');
        return false;
      }
      await sleep(1000);
      blocked = RiskGate.blocking(page);
    }
    if (blocked) {
      if (log) log.error('等待验证超时，本轮作答中止：请完成验证后重新点开始');
      return false;
    }
    if (log) log.info('验证已通过，继续作答');
    return true;
  }
}

const RESTRICTED_EVENTS = ['selectstart', 'select', 'copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drag', 'drop', 'blur', 'focus'];

// 防巡查
export class PatrolShield {
  static restores = [];
  static sweepTimer: any = null;

  // 三档语义：解禁复制 / 切屏广播 / 掐检测定时器
  static install(level, context) {
    const options = context || {};
    if (!HAS_DOM || !level) return { installed: [] };
    const win = options.win || PAGE_WINDOW;
    const page = options.page || win.document;
    const log = options.log || null;
    if (win.__AUTOQUIZ_PATROL_LEVEL__ >= level) return { installed: [], already: win.__AUTOQUIZ_PATROL_LEVEL__ };
    win.__AUTOQUIZ_PATROL_LEVEL__ = level;
    const installed = [];

    // 先存再摘：内联事件与选区
    for (const event of RESTRICTED_EVENTS) {
      const key = 'on' + event;
      if (page[key] && !page['__autoquiz_' + key]) page['__autoquiz_' + key] = page[key];
      page[key] = () => true;
    }
    if (win.getSelection) {
      try {
        const selection = win.getSelection();
        if (selection) {
          const rawRemove = selection.removeAllRanges;
          const rawEmpty = selection.empty;
          selection.removeAllRanges = () => {};
          if (selection.empty) selection.empty = () => {};
          PatrolShield.restores.push(() => {
            if (rawRemove) selection.removeAllRanges = rawRemove;
            if (rawEmpty) selection.empty = rawEmpty;
          });
        }
      } catch (e) {}
    }
    if (!page.getElementById('autoquiz-unlock')) {
      const style = page.createElement('style');
      style.id = 'autoquiz-unlock';
      style.textContent = '*{user-select:text !important;-webkit-user-select:text !important}';
      (page.head || page.documentElement).appendChild(style);
    }
    const sweep = () => {
      const roots = FrameProbe.documents(win).map((entry) => entry.doc);
      let cleared = 0;
      for (const root of roots) {
        for (const node of Array.from(root.getElementsByTagName('*'))) {
          for (const event of RESTRICTED_EVENTS) {
            const key = 'on' + event;
            if (node[key]) {
              node['__autoquiz_' + key] = node[key];
              node[key] = null;
              cleared += 1;
            }
          }
        }
      }
      return cleared;
    };
    sweep();
    if (PatrolShield.sweepTimer) clearInterval(PatrolShield.sweepTimer);
    PatrolShield.sweepTimer = setInterval(sweep, 10000);
    installed.push('unlock');

    if (level >= 2) {
      // 只改 toggle 广播
      if (!win.__AUTOQUIZ_POSTMESSAGE_HOOKED__) {
        win.__AUTOQUIZ_POSTMESSAGE_HOOKED__ = 1;
        const raw = win.postMessage;
        win.postMessage = function (message, targetOrigin, transfer) {
          let payload = message;
          if (typeof payload === 'string' && payload.includes('"toggle":true')) {
            payload = payload.replace(/"toggle"\s*:\s*true/g, '"toggle":false');
          }
          return raw.call(this, payload, targetOrigin, transfer);
        };
        PatrolShield.restores.push(() => { win.postMessage = raw; win.__AUTOQUIZ_POSTMESSAGE_HOOKED__ = 0; });
      }
      // 钉住焦点
      try {
        if (!page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__) {
          page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__ = 1;
          page.__AUTOQUIZ_RAW_HAS_FOCUS__ = page.hasFocus;
          page.hasFocus = () => true;
          PatrolShield.restores.push(() => {
            page.hasFocus = page.__AUTOQUIZ_RAW_HAS_FOCUS__;
            page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__ = 0;
          });
        }
      } catch (e) {}
      installed.push('postMessage + hasFocus');
    }
    if (level >= 3) {
      // 掐检测定时器
      const signatures = options.signatures || ['checkoutNotTrustScript'];
      if (!win.__AUTOQUIZ_TIMER_HOOKED__) {
        win.__AUTOQUIZ_TIMER_HOOKED__ = 1;
        const originalInterval = win.setInterval;
        const originalTimeout = win.setTimeout;
        const suspicious = (stack) => signatures.some((signature) => stack && stack.includes(signature));
        win.setInterval = function (handler, delay, ...args) {
          if (suspicious(new Error().stack)) return -1;
          return originalInterval.call(this, handler, delay, ...args);
        };
        win.setTimeout = function (handler, delay, ...args) {
          if (suspicious(new Error().stack)) return -1;
          return originalTimeout.call(this, handler, delay, ...args);
        };
        PatrolShield.restores.push(() => {
          win.setInterval = originalInterval;
          win.setTimeout = originalTimeout;
          win.__AUTOQUIZ_TIMER_HOOKED__ = 0;
        });
      }
      installed.push('timerGuard');
    }
    if (log) log.info('防巡查已开启到第 ' + level + ' 档（' + installed.join(' / ') + '）');
    return { installed };
  }

  // 降档要还原
  static uninstall(context) {
    const win = (context || {}).win || PAGE_WINDOW;
    if (!HAS_DOM || !win) return false;
    if (PatrolShield.sweepTimer) {
      clearInterval(PatrolShield.sweepTimer);
      PatrolShield.sweepTimer = null;
    }
    const page = win.document;
    if (page) {
      for (const event of RESTRICTED_EVENTS) {
        const key = 'on' + event;
        if (page['__autoquiz_' + key]) {
          page[key] = page['__autoquiz_' + key];
          try { delete page['__autoquiz_' + key]; } catch (e) { page['__autoquiz_' + key] = null; }
        } else if (page[key]) page[key] = null;
      }
      const style = page.getElementById && page.getElementById('autoquiz-unlock');
      if (style && style.remove) style.remove();
    }
    while (PatrolShield.restores.length) {
      try {
        PatrolShield.restores.pop()();
      } catch (e) {}
    }
    win.__AUTOQUIZ_PATROL_LEVEL__ = 0;
    return true;
  }
}

// 交卷控制
export class SubmitController {
  declare context: any;
  declare log: any;
  declare native: any;
  declare patched: any;
  declare settings: any;
  declare spec: any;

  constructor(spec, context) {
    this.spec = spec;
    this.context = context;
    this.log = context.log;
    this.settings = context.settings;
    this.patched = null;
    this.native = {};
  }

  // 自动过确认框
  install(win) {
    if (!win || win.__AUTOQUIZ_DIALOG_PATCHED__) return;
    try {
      win.__AUTOQUIZ_DIALOG_PATCHED__ = 1;
      this.patched = win;
      this.native = { alert: win.alert, confirm: win.confirm };
      win.confirm = () => true;
      win.alert = (message) => {
        const text = String(message == null ? '' : message);
        this.log.info('页面提示: ' + text);
        if (/验证码|滑块|登录失效|请先登录|风险/.test(text)) {
          this.context.requestPause && this.context.requestPause('页面出现风控提示: ' + text);
        }
      };
    } catch (e) {
      this.log.warn('对话框接管失败: ' + e.message);
    }
  }

  // 撤走要还回原函数
  uninstall() {
    const win = this.patched;
    if (!win) return false;
    this.patched = null;
    ['alert', 'confirm'].forEach((name) => {
      const original = this.native[name];
      if (typeof original === 'function') win[name] = original;
      else delete win[name];
    });
    delete win.__AUTOQUIZ_DIALOG_PATCHED__;
    return true;
  }

  // 调站点全局函数
  callGlobals(names, win) {
    const list = names || [];
    const called = [];
    for (const name of list) {
      if (typeof win[name] === 'function') {
        try {
          win[name]();
          called.push(name);
        } catch (e) {
          this.log.warn(`调用站点函数 ${name}() 失败: ${e.message}`);
        }
      }
    }
    return called;
  }

  // 点按钮
  clickButton(target, win) {
    const page = win && win.document;
    if (!target || !page) return false;
    const button = FrameProbe.pick(target, page);
    if (!button) return false;
    try {
      button.click();
      return true;
    } catch (e) {
      return false;
    }
  }

  // 保存
  async save(win) {
    const submit = this.spec.submit || {};
    const called = this.callGlobals(submit.saveGlobals, win);
    if (called.length) return { ok: true, via: called.join(',') };
    if (this.clickButton(submit.saveButton, win)) return { ok: true, via: 'saveButton' };
    return { ok: false, via: 'none' };
  }

  // 提交
  async submit(win) {
    const submit = this.spec.submit || {};
    const called = this.callGlobals(submit.globals, win);
    if (called.length) return { ok: true, via: called.join(',') };
    if (this.clickButton(submit.button, win)) return { ok: true, via: 'button' };
    return { ok: false, via: 'none' };
  }

  // 清交卷确认层
  dismissConfirm(win) {
    const selector = (this.spec.submit || {}).confirm;
    if (!selector) return false;
    const page = (win && win.document) || (HAS_DOM ? document : null);
    const layer = FrameProbe.queryAll(selector, page)[0] || null;
    if (!layer || !FrameProbe.visible(layer)) return false;
    const confirmButton = FrameProbe.byText('button, a, .btn, [class*=btn]', ['确定', '确认', '提交', '是的'], layer)[0];
    if (confirmButton) {
      try {
        confirmButton.click();
      } catch (e) {}
    }
    if (FrameProbe.visible(layer)) {
      try {
        layer.style.display = 'none';
      } catch (e) {}
    }
    return true;
  }

  // 收尾交卷
  async finish(win, results, info) {
    const mode = this.settings.submitMode;
    const total = results.length;
    const resolved = results.filter((entry) => entry && entry.finish).length;
    const rate = total ? (resolved / total) * 100 : 0;
    const report: any = { rate, mode, action: 'none' };
    if (mode === 'none') return report;
    const guardPage = (win && win.document) || (HAS_DOM ? document : null);
    if (RiskGate.blocking(guardPage)) {
      report.action = 'blocked';
      return report;
    }
    const submit = this.spec.submit || {};
    const wired = !!(submit.globals || []).length || !!(submit.saveGlobals || []).length || !!submit.button || !!submit.saveButton;
    if (!wired) {
      report.action = 'manual';
      return report;
    }
    if (mode === 'submit' || (mode === 'gate' && rate >= this.settings.submitRateGate)) {
      await jitter([500, 1200]);
      // 用时不够不交
      const per = this.settings.submitMinSecondsPerQuestion || 0;
      const elapsed = (info || {}).elapsedMs;
      if (per && results.length && elapsed != null) {
        const need = results.length * per * 1000 - elapsed;
        if (need > 0) {
          this.log.info(`按平台习惯还需停留 ${Math.ceil(need / 1000)} 秒才能交卷`);
          await sleep(need);
        }
      }
      const outcome = await this.submit(win);
      report.action = outcome.ok ? 'submit:' + outcome.via : 'submit-failed';
      if (outcome.ok) {
        await sleep(600);
        report.confirm = this.dismissConfirm(win);
      } else {
        const fallback = await this.save(win);
        report.action = fallback.ok ? 'save-fallback' : 'nothing';
      }
      return report;
    }
    const saved = await this.save(win);
    report.action = saved.ok ? 'save:' + saved.via : 'save-failed';
    return report;
  }
}
