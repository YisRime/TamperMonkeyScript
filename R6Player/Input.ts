// 输入域：按键与鼠标手势控制（InputControl）、命令派发与按键引擎（HotkeysRunner / runCommand）
import { Utils, original } from "./Utils";
import { pageBridge } from "./Bridge";
import { configManager } from "./Config";
import { taskCenter } from "./Task";
import { activePlayer } from "./Player";
import { menu } from "./Menu";
import { tuner } from "./Tuner";
import { picture } from "./Picture";
// 命中脚本的按键/手势一律吞掉：阻止默认与阻止冒泡总是一起来，顺序无需区分吞掉一个已命中的事件：阻止默认与阻止冒泡一起来
const swallowEvent = event => { event.preventDefault(); event.stopPropagation() };
export class InputControl {
  enable: any;
  globalMode: any;
  crossDetected: any;
  _isFocus: any;
  hotkeysRunner: any;
  keysPaused: any;
  _bound_: any;
  _relayed_: any;
  _keyIndex_: any;
  _indexRevision_: any;
  constructor () {
    this.enable = true;
    this.globalMode = true;
    this.crossDetected = false;
    this._isFocus = false;
    this.hotkeysRunner = null;
    this.keysPaused = false;
    this._bound_ = false;
    this._relayed_ = false;
    this._keyIndex_ = null;
    this._indexRevision_ = -1;
  }
  // 签名：修饰键按字典序拼接再跟主键；建索引与查索引用的是同一拼法，否则永远撞不上
  static signature (mods, key) {
    if (!key) return ''
    const sorted = mods.filter(Boolean).sort();
    return sorted.length ? sorted.join('+') + '+' + key : key
  }
  // 按键索引：从 hotkeys 配置推导出的「签名 -> 配置项」表，兜底派发与广播过滤共用它；按配置版本号缓存，配置一改（revision 推进）就重建
  keyIndex () {
    if (input._indexRevision_ !== configManager.revision) {
      input._indexRevision_ = configManager.revision;
      const index = new Map();
      (Array.isArray(configManager.get('hotkeys')) ? configManager.get('hotkeys') : []).forEach(conf => {
        if (!conf || conf.disabled || typeof conf.key !== 'string') { return }
        const bindings = HotkeysRunner.parseKeys(conf.key, HotkeysRunner.platformMod());
        if (bindings.length !== 1) { return }
        const sig = InputControl.signature(bindings[0][0], bindings[0][1]);
        if (sig && !index.has(sig)) { index.set(sig, conf) }
      });
      input._keyIndex_ = index;
    }
    return input._keyIndex_
  }
  // 按事件可能拼出的几种签名逐个查索引，取第一条命中的配置；key 与 code 两种写法都认
  findBinding (event) {
    if (!event) return null
    const index = input.keyIndex();
    const mods = [];
    if (event.ctrlKey) { mods.push('ctrl') }
    if (event.altKey) { mods.push('alt') }
    if (event.metaKey) { mods.push('meta') }
    if (event.shiftKey) { mods.push('shift') }
    const signatures = [event.key, event.code].filter(name => typeof name === 'string').map(name => InputControl.signature(mods, name.toLowerCase())).filter(Boolean);
    for (let i = 0; i < signatures.length; i++) { if (index.has(signatures[i])) { return index.get(signatures[i]) } }
    return null
  }
  // 这个按键是否归脚本处理（跨Tab广播按它过滤）
  static isRegistered (event) { return !!input.findBinding(event) }
  // 临时禁用 / 启用快捷键：直接翻转状态位并给出提示，不弹确认
  toggleHotkeys () {
    input.keysPaused = !input.keysPaused;
    menu.tips(input.keysPaused ? '快捷键已临时禁用' : '快捷键已临时启用');
  }
  // 整套增强的总开关：Ctrl+空格与右键菜单里的同名项共用一处
  toggleEnhance () {
    input.enable = !input.enable;
    menu.tips(input.enable ? '启用r6Player插件' : '禁用r6Player插件');
    return input.enable
  }
  // 按需建按键引擎；在非同源 iframe 里把组合键监视挂到 window.top 上
  mountRunner () {
    if (!input.hotkeysRunner) {
      input.hotkeysRunner = new HotkeysRunner(configManager.get('hotkeys'));
      if (Utils.inFrame() && !Utils.crossSite()) { input.hotkeysRunner.addWindow(window.top); }
    }
  }
  // 播放器的聚焦事件
  isFocus () {
    const player = activePlayer.player(); if (!player) return
    player.onmouseenter = function (e) { input._isFocus = true; };
    player.onmouseleave = function (e) { input._isFocus = false; };
  }
  //   兜底派发：runner 只认本窗口的 KeyboardEvent，跨Tab/跨域来的模拟事件进不去，这里按同一份 hotkeys 配置查动作，保证两条路径的执行结果一致
  playerTrigger (player, event) {
    if (!player || !event) return false
    const conf = input.findBinding(event);
    if (!conf) { return false }
    if (!runCommand(conf.command, conf.args)) { return false }
    event.stopPropagation && event.stopPropagation();
    event.preventDefault && event.preventDefault();
    return true
  }
  // 运行站点自定义的快捷键任务：修饰键+主键拼好与注册项同序比对，命中即派发
  siteShortcut (player, event) {
    if (!player || !event) return
    const key = event.key.toLowerCase();
    const taskConf = taskCenter.siteConf();
    const confIsCorrect = Utils.isObj(taskConf.shortcuts) &&
      Array.isArray(taskConf.shortcuts.register) &&
      taskConf.shortcuts.callback instanceof Function;
    const combineKey = [];
    if (event.ctrlKey) { combineKey.push('ctrl'); }
    if (event.shiftKey) { combineKey.push('shift'); }
    if (event.altKey) { combineKey.push('alt'); }
    if (event.metaKey) { combineKey.push('command'); }
    combineKey.push(key);
    const hit = confIsCorrect && taskConf.shortcuts.register.some(shortcut => {
      const regKey = shortcut.split('+');
      return regKey.length === combineKey.length && regKey.every(name => combineKey.includes(name))
    });
    if (!hit) { return false }
    const isDo = taskCenter.doTask('shortcuts', { event, player });
    if (isDo) { swallowEvent(event) }
    return isDo
  }
  // 按键响应方法
  keydownEvent (event) {
    const keyCode = event.keyCode;
    const player = activePlayer.player();
    if (input.keysPaused || Utils.editable(Utils.eventTarget(event))) return
    pageBridge.send('globalKeydownEvent', event, 0);
    if (!player) {
      if (input.crossDetected) {
        if (!configManager.get('enhance.allowCrossOriginControl')) { return false }
        if (input.hotkeysRunner && input.hotkeysRunner.run) { input.hotkeysRunner.run({ event, stopPropagation: true, preventDefault: true }) } else {
          input.mountRunner();
          swallowEvent(event);
        }
      }
      return false
    }
    if (event.ctrlKey && keyCode === 32) { input.toggleEnhance(); }
    if (!input.enable) {
      console.log('[Input] 增强已禁用');
      return false
    }
    if (event.ctrlKey && keyCode === 220) {
      input.globalMode = !input.globalMode;
      menu.tips('全局模式：' + (input.globalMode ? ' ON' : ' OFF'));
    }
    if (!input.globalMode && !input._isFocus) return
    if (input.siteShortcut(player, event) === true) return
    if (input.hotkeysRunner && input.hotkeysRunner.run) {
      const matchResult = input.hotkeysRunner.run({ event, stopPropagation: true, preventDefault: true });
      if (matchResult) {
        console.log('[Input] 按键命中', matchResult);
        return true
      }
    } else { return input.playerTrigger(player, event) }
  }
  // 响应来自按键消息的广播
  bindRelay () {
    if (input._relayed_) return
    let triggerFakeEvent = function (name, oldVal, newVal, remote) {
      const player = activePlayer.player();
      if (player && !input.keysPaused) {
        const fakeEvent = newVal.data;
        fakeEvent.stopPropagation = () => { };
        fakeEvent.preventDefault = () => { };
        input.playerTrigger(player, fakeEvent);
        console.log('[Input] 跨域按键响应', newVal);
      }
    };
    if (!pageBridge.pictureOpen() && !input.crossDetected) { triggerFakeEvent = Utils.throttle(triggerFakeEvent, 80); }
    pageBridge.on('globalKeydownEvent', async (name, oldVal, newVal, remote) => {
      if (remote) {
        if (Utils.crossSite()) { if (document.visibilityState === 'visible' && newVal.originTab) { triggerFakeEvent(name, oldVal, newVal, remote); } } else if (pageBridge.pictureOpen()) { if (!newVal.originTab && (document.pictureInPictureElement || activePlayer.justExited())) { triggerFakeEvent(name, oldVal, newVal, remote); } }
      }
    });
    input._relayed_ = true;
  }
  // 绑定相关事件
  bindEvent () {
    if (input._bound_) return
    const docs = [document];
    if (Utils.inFrame() && !Utils.crossSite()) { docs.push(window.top.document); }
    Utils.rebindKeydown(input.keydownEvent, docs);
    input._bound_ = true;
  }
  // 长按视频画面进行3倍速快进的鼠标控制
  static register () {
    const longPressTime = configManager.get('mouse.longPressTime') || 600;
    let mouseEventTimer = null;
    let hasHandleEvent = false;
    let isPaused = false;
    let oldPlaybackRate = 1;
    document.addEventListener('mousedown', function (event) {
      const player = activePlayer.player();
      if (!player || !(player instanceof HTMLVideoElement)) { return }
      isPaused = player.paused;
      if (!Utils.onMedia(player, event.clientX, event.clientY, 80)) { return }
      if (event.button === 0) {
        mouseEventTimer = setTimeout(() => {
          hasHandleEvent = true;
          oldPlaybackRate = tuner.getSpeed();
          tuner.applyRate(3, false, 800);
          swallowEvent(event);
        }, longPressTime);
      }
    }, true);
    document.addEventListener('mouseup', function (event) {
      mouseEventTimer && clearTimeout(mouseEventTimer);
      if (hasHandleEvent) {
        hasHandleEvent = false;
        swallowEvent(event);
        if (isPaused) { activePlayer.enhancer.lockPlay(600); } else { activePlayer.enhancer.lockPause(600); }
        tuner.applyRate(oldPlaybackRate, false, 800);
      }
    }, true);
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let input = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createInput = () => { input = new InputControl(); return input };
// 按键域：命令派发表 + 按键引擎。按键（本地与跨 Tab 模拟事件）与右键菜单都从 runCommand 出去在页面里下断点用，仅在调试模式下有意义
export const debuggerNow = () => {
  if (!window._debugMode_) return false
  const script = document.createElement('script');
  script.innerText = 'debugger';
  document.body.appendChild(script);
  return true
}
export const hotkeyCommands = Object.create(null);
// 填满派发表：要读五个控制器实例的原型，所以是生命周期的一步（入口构造完单例后调一次）
export const buildCommands = () => {
  hotkeyCommands.debuggerNow = debuggerNow;
  [activePlayer, menu, tuner, picture, input].forEach(ctl => {
    Object.getOwnPropertyNames(Object.getPrototypeOf(ctl)).forEach(name => {
      if (name === 'constructor' || name in hotkeyCommands) return
      if (typeof ctl[name] !== 'function') return
      hotkeyCommands[name] = (...args) => ctl[name](...args)
    });
  });
  return hotkeyCommands
};
// 全脚本唯一的命令派发出口：命令名查表、函数直调；取不到就记一条日志并返回 false
export const runCommand = (command, args) => {
  const fn = typeof command === 'function' ? command : hotkeyCommands[command];
  if (!(fn instanceof Function)) {
    console.log('[Input] 命令派发失败', String(command));
    return false
  }
  const argv = Array.isArray(args) ? args : (typeof args === 'undefined' ? [] : [args]);
  fn(...argv);
  return true
};
// 组合键监视的状态是跨实例共享的，守卫放在模块级
const keyAlias = { ControlLeft: 'ctrl', ControlRight: 'ctrl', ShiftLeft: 'shift', ShiftRight: 'shift', AltLeft: 'alt', AltRight: 'alt', MetaLeft: 'meta', MetaRight: 'meta' };
// 某个 window 是否已绑定过组合键监听；等价于原先那个模块级单例的作用域
const modGuard = new original.WeakMap();
// HotkeysRunner：按键引擎，含组合键状态监视（那份状态只服务于本引擎的匹配判定）
export class HotkeysRunner {
  window: any;
  windowList: any;
  MOD: any;
  prevPress: any;
  _prevTimer_: any;
  modState: any;
  hotkeys: any;
  constructor (hotkeys, win = window) {
    this.window = win;
    this.windowList = [win];
    this.MOD = HotkeysRunner.platformMod();
    this.prevPress = null;
    this._prevTimer_ = null;
    this.modState = new original.Map();
    // 数据预处理：把每条配置的 key 解析成逐段匹配用的 keyBindings；非数组配置给空表
    this.hotkeys = hotkeys || [];
    if (Array.isArray(this.hotkeys)) { this.hotkeys.forEach((config) => { if (!Utils.isObj(config) || !config.key || typeof config.key !== 'string') { return } config.keyBindings = HotkeysRunner.parseKeys(config.key, this.MOD); }); } else { this.hotkeys = [] }
    this.watchMods(win);
  }
  //   — 按键配置解析：引擎的逐段匹配与兜底派发的签名查表共用这一份，不再各解析一遍$mod 在 Mac 上是 meta、其它平台是 ctrl；拿不到 navigator 时按非 Mac 处理
  static platformMod () { return /Mac|iPod|iPhone|iPad/.test(typeof navigator === 'object' && navigator.platform ? navigator.platform : '') ? 'meta' : 'ctrl' }
  // 一段按键串 -> [修饰键（按书写顺序）, 主键]；纯修饰键组合的主键为空串
  static parsePress (press, mod) {
    const mods = [];
    let key = '';
    press.split(/\b\+/).forEach(k => { k = k === '$mod' ? mod : k; if (Utils.isModifier(k)) { mods.push(k) } else { key = k } });
    return [mods, key]
  }
  // 整条配置 -> 逐段解析结果；空格分段即多段序列（如 space c），只有引擎能走完
  static parseKeys (key, mod) { return key.trim().toLowerCase().split(/\s+/).map(press => HotkeysRunner.parsePress(press, mod)) }
  // 设置其它window对象的组合键监控逻辑
  addWindow (win) {
    this.window = win;
    if (!this.windowList.includes(win)) { this.windowList.push(win); }
    this.watchMods(win);
  }
  // 当前键盘事件与某一段预期按键配置是否匹配
  isMatch (event, press, heldKeys?) {
    if (!event || !Array.isArray(press)) { return false }
    const held = event.modsMap || this.heldMods();
    const mods = press[0];
    const key = press[1];
    if (mods.length !== held.size) { return false }
    if (key && event.key.toLowerCase() !== key && event.code.toLowerCase() !== key) { return false }
    let result = true;
    const modsKey = heldKeys || this.modsOf(event);
    mods.forEach((key) => { if (!modsKey.has(key)) { result = false; } });
    return result
  }
  // 把当前按住的修饰键展开成便于查表的形态（同时兼容大小写与别名）
  modsOf (event) {
    const held = event.modsMap || this.heldMods();
    const modsKey = new original.Map();
    held.forEach((val, key) => {
      modsKey.set(key, val);
      modsKey.set(key.toLowerCase(), val);
      keyAlias[key] && modsKey.set(keyAlias[key], val);
    });
    return modsKey
  }
  //   上一段按键是否与给定段匹配，多段序列靠它衔接引擎主循环：逐条配置按段匹配，命中就吞事件并按需派发命令，返回命中的配置
  run (opts: any = {}) {
    if (!this.windowList.some(win => win.KeyboardEvent === opts.event.constructor)) { return false }
    const event = opts.event;
    const heldKeys = this.modsOf(event);
    let matchResult = null;
    this.hotkeys.forEach(hotkeyConf => {
      if (hotkeyConf.disabled || !hotkeyConf.keyBindings) { return false }
      let press = hotkeyConf.keyBindings[0];
      if (this.prevPress) {
        if (hotkeyConf.keyBindings.length <= 1 || !this.isMatch(this.prevPress, press)) { return false }
        press = hotkeyConf.keyBindings[1];
      }
      const isMatch = this.isMatch(event, press, heldKeys);
      if (!isMatch) { return false }
      matchResult = hotkeyConf;
      const stopPropagation = opts.stopPropagation || hotkeyConf.stopPropagation;
      const preventDefault = opts.preventDefault || hotkeyConf.preventDefault;
      stopPropagation && event.stopPropagation();
      preventDefault && event.preventDefault();
      if (press === hotkeyConf.keyBindings[0] && hotkeyConf.keyBindings.length > 1) {
        this.prevPress = {
          modsMap: this.heldMods(),
          code: event.code,
          key: event.key,
          keyCode: event.keyCode,
          altKey: event.altKey,
          shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey,
          metaKey: event.metaKey
        };
        clearTimeout(this._prevTimer_);
        this._prevTimer_ = setTimeout(() => { this.prevPress = null; }, 1000);
        return true
      }
      if (hotkeyConf.keyBindings.length > 1 && press !== hotkeyConf.keyBindings[0]) { setTimeout(() => { this.prevPress = null; }, 0); }
      runCommand(hotkeyConf.command, hotkeyConf.args);
    });
    return matchResult
  }
  // 给一个 window 挂组合键状态监听（按下置位、松开延迟复位、失焦全清），每个 window 只挂一次
  watchMods (win = window) {
    const self = this;
    const modState = self.modState;
    if (!win || win !== win.self || !win.addEventListener || modGuard.get(win)) { return false }
    const timers = {};
    // 按下修饰键就把它在本窗口的状态置为 true
    function pressMod (event) { Utils.isModifier(event.code) && modState.set(event.code, true); }
    // 松开修饰键延迟 50ms 复位；blur 这类非键盘事件一律全清
    function releaseMod (event) {
      if (!(event instanceof KeyboardEvent)) {
        modState.forEach((val, key) => { modState.set(key, false); });
        return true
      }
      if (Utils.isModifier(event.code)) {
        clearTimeout(timers[event.code]);
        timers[event.code] = setTimeout(() => { modState.set(event.code, false); }, 50);
      }
    }
    win.addEventListener('keydown', pressMod, true);
    win.addEventListener('keypress', pressMod, true);
    win.addEventListener('keyup', releaseMod, true);
    win.addEventListener('blur', releaseMod, true);
    modGuard.set(win, true);
  }
  // 取当前所有按下的修饰键，跨 Tab 转发按键时要把这份状态一起带上
  heldMods () {
    const modState = this.modState;
    const result = new original.Map();
    modState.forEach((val, key) => { if (val === true) { result.set(key, val); } });
    return result
  }
}
