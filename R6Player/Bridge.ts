// PageBridge：对页面原生 API 的劫持与代理（attachShadow / defineProperty / 媒体事件 / UA），以及跨 Tab 消息通道与按键转发
import { Utils, tabIdentity, original } from "./Utils";
import { InputControl } from "./Input";
// 按站点伪装 UA：先有一份 ua 字符串表，再有一份「哪个站用哪条」的配置（原 ua-presets）ua信息来源：https://developers.whatismybrowser.com
export const userAgentMap = {
  iPhone: {
    safari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/111.0.0.0 Mobile/15E148 Safari/604.1',
    chrome: 'Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/74.0.3729.121 Mobile/15E148 Safari/605.1'
  }
};
// 百度盘非会员用自带播放器，脚本拿不到视频，只能靠伪装 ua
export const fakeConfig = { 'open.163.com': userAgentMap.iPhone.chrome, 'm.open.163.com': userAgentMap.iPhone.chrome, 'pan.baidu.com': userAgentMap.iPhone.safari };
// 跨Tab控制时不转发的系统级快捷键，留给页面自己的复制/粘贴/下载/查找跨 Tab 那份「谁在放画中画」的消息名：发送、轮询、按键让出三处都读它
export const pictureKey = 'globalPictureInPictureInfo';
export class PageBridge {
  // 跨Tab按键让位只绑一次：标记留在实例上，重试路径不会再挂第二份
  _bound_: any;
  // 某些网页用 attachShadow closed mode，改成 open 才拿得到 video（如百度云盘）
  static openShadow () {
    if (window._hasHackAttachShadow_) return
    try {
      window._shadowDomList_ = [];
      window.Element.prototype._attachShadow = window.Element.prototype.attachShadow;
      window.Element.prototype.attachShadow = function () {
        const arg = arguments;
        const isClosed = arg[0] && arg[0].mode === 'closed';
        if (arg[0] && arg[0].mode) { arg[0].mode = 'open'; }
        const shadowRoot = this._attachShadow.apply(this, arg);
        window._shadowDomList_.push(shadowRoot);
        shadowRoot._shadowHost = this;
                const shadowEvent = new window.CustomEvent('addShadowRoot', { detail: { shadowRoot, message: 'addShadowRoot', time: new Date() }, bubbles: true, cancelable: true });
        document.dispatchEvent(shadowEvent);
        if (isClosed) {
          original.Object.defineProperty.call(Object, this, 'shadowRoot', {
            // 站点用的是 closed 模式，就把 shadowRoot 对外装回 null
            get () { return null }
          });
        }
        return shadowRoot
      };
      window._hasHackAttachShadow_ = true;
    } catch (e) { console.log('[Bridge] shadowRoot劫持异常', e); }
  }
  // 按站点伪装 Navigator 的 userAgent
  static spoofAgent (ua?) {
    ua = ua || fakeConfig[window.location.host];
    if (!ua) return
    const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, 'userAgent');
    Object.defineProperty(Navigator.prototype, 'userAgent', { ...desc, get: function () { return ua } });
  }
  // 反制站点对媒体属性的锁定：定义发生的那一刻把属性改成可配置，并把真正落地的键名挪开
  static unlockable (target, key, option) {
    if (!option || typeof option !== 'object') { return [target, key, option] }
    if (target instanceof Element && typeof key === 'string' && key.indexOf('on') >= 0) { option.configurable = true; }
    if (target instanceof HTMLVideoElement && typeof key === 'string' && ['playbackRate', 'currentTime', 'volume', 'muted'].includes(key)) {
      console.log('[Bridge] 媒体属性锁拦截', key);
      option.configurable = true;
      key += '_hack';
    }
    return [target, key, option]
  }
  // 统一包一层 try/catch：失败只记日志并返回 null，不把异常抛给站点
  static safeDefine (rawFn, args, methodName) {
    try { return rawFn.apply(Object, args) } catch (e) {
      console.log('[Bridge] 属性定义异常', methodName, e);
      return null
    }
  }
  // 把 Object.defineProperty 与 defineProperties 换成会先解锁的版本
  static hackDefine () {
    const rawDefineProperty = Object.defineProperty;
    const rawDefineProperties = Object.defineProperties;
    Object.defineProperty = function (target, key, option) { return PageBridge.safeDefine(rawDefineProperty, PageBridge.unlockable(target, key, option), 'defineProperty') };
    Object.defineProperties = function (target, properties) {
      if (target instanceof Element && properties) {
        const unlocked = {};
        Object.keys(properties).forEach(key => {
          const afterArgs = PageBridge.unlockable(target, key, properties[key]);
          unlocked[afterArgs[1]] = afterArgs[2];
        });
        properties = unlocked;
      }
      return PageBridge.safeDefine(rawDefineProperties, [target, properties], 'defineProperties')
    };
  }
  // 代理媒体元素的事件注册，以便调试或阻断 ratechange
  static proxyEvents () {
    if (HTMLMediaElement.prototype._rawAddEventListener_) { return false }
    HTMLMediaElement.prototype._rawAddEventListener_ = HTMLMediaElement.prototype.addEventListener;
    HTMLMediaElement.prototype._rawRemoveEventListener_ = HTMLMediaElement.prototype.removeEventListener;
    HTMLMediaElement.prototype.addEventListener = new original.Proxy(HTMLMediaElement.prototype.addEventListener, {
      // 只给 ratechange 的监听器再包一层，其余事件原样放行
      apply (target, ctx, args) {
        const eventName = args[0];
        const listener = args[1];
        if (listener instanceof Function && eventName === 'ratechange') {
          args[1] = new original.Proxy(listener, {
            // 识别站点阻速：速率被改过、或与脚本设的值对不上，就吞掉这次事件
            apply (target, ctx, args) {
              if (ctx) {
                if (ctx.playbackRate && eventName === 'ratechange') {
                  if (ctx._hasBlockRatechangeEvent_) { return true }
                  const oldRate = ctx.playbackRate;
                  const startTime = Date.now();
                  const result = target.apply(ctx, args);
                  const blockRatechangeBehave1 = oldRate !== ctx.playbackRate || Date.now() - startTime > 1000;
                  const blockRatechangeBehave2 = ctx._setPlaybackRate_ && ctx._setPlaybackRate_.value !== ctx.playbackRate;
                  if (blockRatechangeBehave1 || blockRatechangeBehave2) {
                    console.log('[Bridge] 阻速行为拦截', eventName, listener);
                    ctx._hasBlockRatechangeEvent_ = true;
                    return true
                  } else { return result }
                }
              }
              try { return target.apply(ctx, args) } catch (e) { console.log('[Bridge] 事件代理异常', eventName, listener, e); }
            }
          });
        }
        return target.apply(ctx, args)
      }
    });
  }
  // 发消息：带上 tabId、标题、referrer 等必要信息，并按间隔节流
  send (name, data, throttleInterval = 80) {
    if (!window.GM_getValue || !window.GM_setValue) { return false }
    const oldMsg = window.GM_getValue(name);
    if (oldMsg && oldMsg.updateTime) {
      const interval = Math.abs(Date.now() - oldMsg.updateTime);
      if (interval < throttleInterval) { return false }
    }
    const msg = { data, tabId: tabIdentity.id || 'undefined', title: document.title, referrer: Utils.extractData(window.location), updateTime: Date.now() };
    if (typeof data === 'object') { msg.data = Utils.extractData(data); }
    window.GM_setValue(name, msg);
  }
  // 读跨 Tab 消息，底层就是 GM_getValue
  get (name) { return window.GM_getValue && window.GM_getValue(name) }
  // 订阅跨 Tab 消息：先标记来源是不是本 Tab，再回调
  on (name, fn) {
    return window.GM_addValueChangeListener && window.GM_addValueChangeListener(name, function (name, oldVal, newVal, remote) {
      newVal.originTab = newVal.tabId === tabIdentity.id;
      fn instanceof Function && fn.apply(null, arguments);
    })
  }
  // 意外退出的时候leavepictureinpicture事件并不会被调用，所以只能通过轮询来更新画中画信息
  pollPicture () {
    setInterval(() => { if (document.pictureInPictureElement) { pageBridge.send(pictureKey, { usePictureInPicture: true }); } }, 1000 * 1.5);
  }
  // 判断当前是否开启了画中画功能
  pictureOpen () {
    const data = pageBridge.get(pictureKey);
    if (!data || !data.data) { return false }
    return Math.abs(Date.now() - data.updateTime) < (data.data.usePictureInPicture ? 1000 * 3 : 1000 * 15)
  }
  //   别的 Tab 开着画中画时，本页按下已注册的快捷键就吞掉，让给那个 Tab；ctrl/meta + c/v/f/d 这类系统级快捷键排除在外，减少对复制粘贴查找下载的干扰
  yieldKeys (event) {
    if (Utils.editable(Utils.eventTarget(event))) return
    if (pageBridge.pictureOpen()) {
      const pipInfo = pageBridge.get(pictureKey);
      const exclude = event && typeof event.keyCode !== 'undefined' && (event.ctrlKey || event.metaKey) && ['c', 'v', 'f', 'd'].includes(event.key.toLowerCase());
      if (pipInfo.tabId !== tabIdentity.id && InputControl.isRegistered(event) && !exclude) {
        event.stopPropagation();
        event.preventDefault();
        return true
      }
    }
  }
  // 绑定跨 Tab 按键让位，只绑一次
  bindYield () {
    if (pageBridge._bound_) return
    Utils.rebindKeydown(pageBridge.yieldKeys, [document]);
    pageBridge._bound_ = true;
  }
}
export const pageBridge = new PageBridge();