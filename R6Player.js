// ==UserScript==
// @name         R6 Player 播放器增强
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  【基于 xxxily/h5player 重构】支持所有网站，功能众多，不再一一赘述。
// @author       YisRime
// @match        *://*/*
// @grant        unsafeWindow
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addValueChangeListener
// @grant        GM_getTab
// @grant        GM_saveTab
// @grant        GM_openInTab
// @run-at       document-start
// @license      AGPLv3
// ==/UserScript==
(() => {
  var __defProp = Object.defineProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };

  // Utils.ts
  var Utils_exports = {};
  __export(Utils_exports, {
    Utils: () => Utils,
    original: () => original,
    tabIdentity: () => tabIdentity
  });
  var original = {
    Object: { defineProperty: Object.defineProperty },
    Proxy,
    Map,
    WeakMap,
    map: { clear: Map.prototype.clear, set: Map.prototype.set, has: Map.prototype.has, get: Map.prototype.get, delete: Map.prototype.delete },
    HTMLMediaElement,
    alert,
    confirm,
    prompt
  };
  var tabIdentity = { id: null, seq: 0 };
  var Utils = class _Utils {
    // — 对象与数组：判型、深拷贝、按路径读写、递归取数
    static isObj(obj) {
      return Object.prototype.toString.call(obj) === "[object Object]";
    }
    // 深拷贝：非对象（含 null）原样返回，数组 / 对象按成员递归复制
    static clone(source) {
      if (source === null || typeof source !== "object") {
        return source;
      }
      const result = _Utils.isArr(source) ? [] : {};
      for (const key in source) {
        result[key] = typeof source[key] === "object" ? _Utils.clone(source[key]) : source[key];
      }
      return result;
    }
    // 把 objB 深合并进 objA（改的是 objA），concatArr 为真时数组取拼接而不是覆盖
    static mergeObj(objA, objB, concatArr) {
      if (!_Utils.isObj(objA) || !_Utils.isObj(objB)) return objA;
      function deepMerge(objA2, objB2) {
        Object.keys(objB2).forEach((key) => {
          const subItemA = objA2[key];
          const subItemB = objB2[key];
          if (typeof subItemA === "undefined") {
            objA2[key] = subItemB;
          } else {
            if (_Utils.isObj(subItemA) && _Utils.isObj(subItemB)) {
              objA2[key] = deepMerge(subItemA, subItemB);
            } else {
              if (concatArr && _Utils.isArr(subItemA) && _Utils.isArr(subItemB)) {
                objA2[key] = subItemA.concat(subItemB);
              } else {
                objA2[key] = subItemB;
              }
            }
          }
        });
        return objA2;
      }
      return deepMerge(objA, objB);
    }
    // 按 a.b.c 路径写值，路径任一段断掉就返回 false
    static setPath(obj, path, val) {
      if (!obj || !path || typeof path !== "string") {
        return false;
      }
      let result = obj;
      const pathArr = path.split(".");
      for (let i = 0; i < pathArr.length; i++) {
        if (!result) break;
        if (i === pathArr.length - 1) {
          result[pathArr[i]] = val;
          return true;
        }
        result = result[pathArr[i]];
      }
      return false;
    }
    // 按 a.b.c 路径取值，中途断掉得到 undefined
    static getPath(obj, path) {
      path = path || "";
      const pathArr = path.split(".");
      let result = obj;
      for (let i = 0; i < pathArr.length; i++) {
        if (!result) break;
        result = result[pathArr[i]];
      }
      return result;
    }
    // 把对象抽成纯数据（标量直取、对象递归，最多三层），跨 Tab / 跨域传消息前用它
    static extractData(obj, deep) {
      deep = deep || 1;
      if (deep > 3) return {};
      const result = {};
      if (typeof obj !== "object") {
        return result;
      }
      for (const key in obj) {
        const val = obj[key];
        const valType = typeof val;
        if (valType === "number" || valType === "string" || valType === "boolean") {
          result[key] = val;
        } else if (valType === "object" && Object.prototype.propertyIsEnumerable.call(obj, key)) {
          result[key] = _Utils.extractData(val, deep + 1);
        }
      }
      return result;
    }
    // 是不是数组，走 Object.prototype.toString 所以跨 iframe 也准
    static isArr(arr) {
      return Object.prototype.toString.call(arr) === "[object Array]";
    }
    // — DOM 与行内样式：元素等待、遍历父级、可视范围、样式互转
    // 元素监听器：selector 可以是数组，shadowRoot 可选
    static ready(selector, fn, shadowRoot) {
      const win = window;
      const docRoot = shadowRoot || win.document.documentElement;
      if (!docRoot) return false;
      const MutationObserver = win.MutationObserver || win.WebKitMutationObserver;
      const listeners = docRoot._MutationListeners || [];
      function $ready(selector2, fn2) {
        listeners.push({ selector: selector2, fn: fn2 });
        if (!docRoot._MutationObserver) {
          docRoot._MutationListeners = listeners;
          docRoot._MutationObserver = new MutationObserver(() => {
            for (let i = 0; i < docRoot._MutationListeners.length; i++) {
              const item = docRoot._MutationListeners[i];
              check(item.selector, item.fn);
            }
          });
          docRoot._MutationObserver.observe(docRoot, { childList: true, subtree: true });
        }
        check(selector2, fn2);
      }
      function check(selector2, fn2) {
        const elements = docRoot.querySelectorAll(selector2);
        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];
          element._MutationReadyList_ = element._MutationReadyList_ || [];
          if (!element._MutationReadyList_.includes(fn2)) {
            element._MutationReadyList_.push(fn2);
            fn2.call(element, element);
          }
        }
      }
      const selectorArr = Array.isArray(selector) ? selector : [selector];
      selectorArr.forEach((selector2) => $ready(selector2, fn));
    }
    // 逐层向上遍历父节点，回调返回 true 时提前结束；onlyClassable 用于停在真正的元素节点上
    static eachParent(dom, fn, onlyClassable) {
      let parent = dom.parentNode;
      while (parent && (!onlyClassable || parent.classList)) {
        const isEnd = fn(parent, dom);
        if (isEnd) {
          break;
        }
        parent = parent.parentNode;
      }
    }
    // 把一段 CSS 文本插成 style 节点；带 id 且已存在就不重复插
    static addStyle(cssText, id, insetTo) {
      if (id && document.getElementById(id)) {
        return false;
      }
      const style = document.createElement("style");
      const head = insetTo || document.head || document.getElementsByTagName("head")[0];
      style.appendChild(document.createTextNode(cssText));
      head.appendChild(style);
      if (id) {
        style.setAttribute("id", id);
      }
      return style;
    }
    // 采集原型上的方法做原始参照：跨域受限或站点改写过的属性读取会抛错，逐个吞掉
    static snapMethods(proto, target) {
      Object.keys(proto).forEach((key) => {
        try {
          if (proto[key] instanceof Function) {
            target[key] = proto[key];
          }
        } catch (e) {
        }
      });
    }
    // 建元素顺手带上类名：菜单浮层里五个节点都是这两行
    static el(tag, className) {
      const node = document.createElement(tag);
      node.className = className;
      return node;
    }
    // 事件目标是不是可编辑区域（contenteditable 或输入类控件）
    static editable(target) {
      const isEditable = target.getAttribute && target.getAttribute("contenteditable") === "true";
      const isInputDom = /INPUT|TEXTAREA|SELECT|LABEL/.test(target.nodeName);
      return isEditable || isInputDom;
    }
    // 事件经过的完整路径：阴影树里的节点只有 composedPath 能拿到
    static eventPath(event) {
      return event.composedPath ? event.composedPath() : [event.target];
    }
    // 事件真正落在哪个元素上：路径为空时退回 target
    static eventTarget(event) {
      return _Utils.eventPath(event)[0] || event.target;
    }
    // 捕获阶段重绑一次按键监听：解绑要带上同一个 capture 标志才解得掉，重复调用不会叠加出多份处理
    static rebindKeydown(handler, docs) {
      docs.forEach((doc) => {
        doc.removeEventListener("keydown", handler, true);
        doc.addEventListener("keydown", handler, true);
      });
    }
    // 节点是否在阴影树里；returnShadowRoot 为真时返回那个 ShadowRoot
    static inShadow(node, returnShadowRoot) {
      for (; node; node = node.parentNode) {
        if (node.toString() === "[object ShadowRoot]") {
          return returnShadowRoot ? node : true;
        }
      }
      return false;
    }
    // 元素是否完整落在可视窗口内
    static inView(element) {
      const viewWidth = window.innerWidth || document.documentElement.clientWidth;
      const viewHeight = window.innerHeight || document.documentElement.clientHeight;
      const { top, left, right, bottom } = element.getBoundingClientRect();
      return top >= 0 && left >= 0 && right <= viewWidth && bottom <= viewHeight;
    }
    // 元素是否已不在文档里或不可见（无布局盒、隐藏、矩形全零）
    static invisible(element) {
      if (!element || element.offsetParent === null) {
        return true;
      }
      if (element.style.visibility === "hidden" || element.style.display === "none") {
        return true;
      }
      const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
      return top === 0 && right === 0 && bottom === 0 && left === 0 && width === 0 && height === 0;
    }
    // 页面里的单个元素，选择器由站点任务配置给出
    static q(str) {
      return document.querySelector(str);
    }
    // 属性名 -> API 方法名后缀：enhancer 的 set/lock/unlock/locked 与增强 API 的动态生成共用这一处
    static firstUpper(str) {
      return `${str}`.replace(/^\S/, (s) => s.toUpperCase());
    }
    // 站点标题写到播放器与外层容器上（截图与下载文件名取值处），顺手清洗文件名非法字符
    static setTitle(player, wrap, title) {
      const safe = `${title || ""}`.replace(/[\\/:*?"<>|]/g, "-");
      if (wrap) {
        wrap.setAttribute("data-title", safe);
      }
      if (player) {
        player.setAttribute("data-title", safe);
      }
      return safe;
    }
    // — 媒体元素：判定与画面区域内的命中测试
    static isMedia(element) {
      return element && (element instanceof HTMLMediaElement || element.HTMLMediaElement || element.HTMLVideoElement || element.HTMLAudioElement);
    }
    // 是不是视频元素，含被站点改造过标签名的
    static isVideo(element) {
      return element && (element instanceof HTMLVideoElement || element.HTMLVideoElement);
    }
    // 是不是音频元素，含被站点改造过标签名的
    static isAudio(element) {
      return element && (element instanceof HTMLAudioElement || element.HTMLAudioElement);
    }
    // 指针是否落在媒体元素画面区域内；bottomReserve 为下沿预留高度，缺省时按原生控制条预留 80px
    static onMedia(element, x, y, bottomReserve) {
      if (!element || !element.getBoundingClientRect) return false;
      const rect = element.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return false;
      const reserve = bottomReserve === void 0 ? element.controls && rect.height > 100 ? 80 : 0 : bottomReserve;
      return x > rect.left && x < rect.right && y > rect.top && y < rect.bottom - reserve;
    }
    // — 运行环境：iframe、存储可用性、新标签页
    static inFrame() {
      return window !== window.top;
    }
    // 是否处在跨域受限的 iframe 里（读 window.top 会抛错就是）
    static crossSite() {
      let result = true;
      try {
        if (window.top.localStorage || window.top.location.href) {
          result = false;
        }
      } catch (e) {
        result = true;
      }
      return result;
    }
    // localStorage 是否可用，读写方法都在才算
    static storageUsable() {
      return window.localStorage && window.localStorage.getItem instanceof Function && window.localStorage.setItem instanceof Function;
    }
    // 新标签页打开链接：同一地址 1 秒内只开一次，优先用 GM_openInTab
    static openTab(url, opts) {
      const now = Date.now();
      const sessionKey = `r6player_openTab_${url}`;
      let lastOpenTime = 0;
      if (window.GM_getValue && window.GM_setValue) {
        lastOpenTime = window.GM_getValue(sessionKey, 0);
        if (lastOpenTime && now - lastOpenTime < 1e3) {
          return;
        }
        window.GM_setValue(sessionKey, now);
      } else {
        lastOpenTime = sessionStorage.getItem(sessionKey);
        if (lastOpenTime && now - parseInt(lastOpenTime) < 1e3) {
          return;
        }
        sessionStorage.setItem(sessionKey, now.toString());
      }
      if (window.GM_openInTab) {
        window.GM_openInTab(url, opts || { active: true, insert: true, setParent: true });
      } else {
        const a = document.createElement("a");
        Object.assign(a, { href: url, target: "_blank", rel: "noopener noreferrer" });
        Object.assign(a.style, { display: "inline-block", width: "1px", height: "1px", opacity: 0 });
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          document.body.removeChild(a);
        }, 300);
      }
    }
    // 是否为 Cloudflare 的 challenge 页面
    static isChallenge() {
      const titleCheck = document.title.includes("Just a moment") || document.title.includes("Cloudflare") || document.title.includes("challenge");
      const metaRefreshExists = !!document.querySelector('meta[http-equiv="refresh"]');
      const robotsNoindexExists = !!document.querySelector('meta[name="robots"][content*="noindex"]');
      const mainWrapperExists = !!document.querySelector('.main-wrapper[role="main"]');
      const challengeErrorExists = !!document.querySelector("#challenge-error-text");
      const bodyNoJsClass = document.body && document.body.classList ? document.body.classList.contains("no-js") : false;
      const hasCloudflareStyling = document.styleSheets.length > 0 && (document.documentElement.innerHTML.includes("background-image: url(data:image/svg+xml;base64,") || document.documentElement.innerHTML.includes("challenge"));
      const metaFeatures = metaRefreshExists || robotsNoindexExists;
      const domFeatures = mainWrapperExists || challengeErrorExists || bodyNoJsClass;
      return titleCheck && metaFeatures || titleCheck && domFeatures || domFeatures && (mainWrapperExists ? 1 : 0) + (challengeErrorExists ? 1 : 0) + (bodyNoJsClass ? 1 : 0) >= 2 && metaFeatures || hasCloudflareStyling && (titleCheck || metaFeatures || domFeatures);
    }
    // 取一个全局自增的 id，作为当前 TAB 的标识
    static nextTabSeq() {
      if (!window.GM_getValue || !window.GM_setValue) {
        return ++tabIdentity.seq;
      }
      const gID = Number(window.GM_getValue("_global_id_") || 0) + 1;
      window.GM_setValue("_global_id_", gID);
      return gID;
    }
    // 取当前 TAB 的 id，供 iframe 判断自己是否与顶层同标签
    static getTabId() {
      return new Promise((resolve, reject) => {
        if (window.GM_getTab instanceof Function) {
          window.GM_getTab(function(obj) {
            if (!obj.tabId) {
              obj.tabId = _Utils.nextTabSeq();
              window.GM_saveTab(obj);
            }
            tabIdentity.id = obj.tabId;
            resolve(obj.tabId);
          });
        } else {
          resolve(Date.now());
        }
      });
    }
    // — 函数级：节流、数值步进、参数归一、吞掉浏览器拒绝
    static throttle(fn, interval = 80) {
      let timeout = null;
      return function() {
        if (timeout) return false;
        timeout = setTimeout(() => {
          timeout = null;
        }, interval);
        fn.apply(this, arguments);
      };
    }
    // 步进量：取正幅值，非数字或 0 时回落到该动作自己的默认步长；向下用 -stepValue(...)
    static stepValue(num, fallback) {
      return Math.abs(Number(num)) || fallback;
    }
    // 是不是修饰键，ctrl / shift / alt / meta 的左右键名与 capsLock 都算
    static isModifier(key) {
      return [
        "ctrl",
        "controlleft",
        "controlright",
        "shift",
        "shiftleft",
        "shiftright",
        "alt",
        "altleft",
        "altright",
        "meta",
        "metaleft",
        "metaright",
        "capsLock"
      ].includes(key.toLowerCase());
    }
    // 浏览器会以 Promise 拒绝的形式回应全屏等操作（如站点用 Permissions-Policy 禁止全屏），统一吞掉以免变成未捕获异常
    static swallow(ret, what) {
      if (ret && typeof ret.then === "function" && typeof ret.catch === "function") {
        ret.catch((e) => console.log("[Utils] Promise拒绝吞掉", what, e));
      }
    }
  };

  // Boot.ts
  var Boot_exports = {};
  __export(Boot_exports, {
    bootState: () => bootState,
    initEnhance: () => initEnhance,
    setupRuntime: () => setupRuntime,
    startUp: () => startUp,
    watchTags: () => watchTags
  });

  // Bridge.ts
  var Bridge_exports = {};
  __export(Bridge_exports, {
    PageBridge: () => PageBridge,
    fakeConfig: () => fakeConfig,
    pageBridge: () => pageBridge,
    pictureKey: () => pictureKey,
    userAgentMap: () => userAgentMap
  });

  // Input.ts
  var Input_exports = {};
  __export(Input_exports, {
    HotkeysRunner: () => HotkeysRunner,
    InputControl: () => InputControl,
    buildCommands: () => buildCommands,
    createInput: () => createInput,
    debuggerNow: () => debuggerNow,
    hotkeyCommands: () => hotkeyCommands,
    input: () => input,
    runCommand: () => runCommand
  });

  // Config.ts
  var Config_exports = {};
  __export(Config_exports, {
    ConfigManager: () => ConfigManager,
    applyReload: () => applyReload,
    blacklistedDomains: () => blacklistedDomains,
    blocksSet: () => blocksSet,
    configManager: () => configManager,
    configSave: () => configSave,
    configScope: () => configScope,
    configSwitch: () => configSwitch,
    defaultConfiguration: () => defaultConfiguration,
    downloadState: () => downloadState,
    globalFunctional: () => globalFunctional,
    menuCmd: () => menuCmd,
    menuGroups: () => menuGroups,
    menuItems: () => menuItems,
    menuOn: () => menuOn,
    rawLocalStorage: () => rawLocalStorage,
    siteDisabled: () => siteDisabled
  });

  // Task.ts
  var Task_exports = {};
  __export(Task_exports, {
    TaskControl: () => TaskControl,
    allowCross: () => allowCross,
    douyinTitle: () => douyinTitle,
    douyuScreen: () => douyuScreen,
    escapeTask: () => escapeTask,
    facebookTask: () => facebookTask,
    hoverTitle: () => hoverTitle,
    installTasks: () => installTasks,
    taskCenter: () => taskCenter,
    taskConf: () => taskConf,
    taskScratch: () => taskScratch,
    watermarkTask: () => watermarkTask,
    xgplayerTask: () => xgplayerTask
  });

  // Player.ts
  var Player_exports = {};
  __export(Player_exports, {
    FullScreen: () => FullScreen,
    PlayerControl: () => PlayerControl,
    activePlayer: () => activePlayer,
    createPlayer: () => createPlayer,
    fullScreenInstances: () => fullScreenInstances
  });

  // Media.ts
  var Media_exports = {};
  __export(Media_exports, {
    Amplifier: () => Amplifier,
    MediaCore: () => MediaCore,
    SourceControl: () => SourceControl,
    createMedia: () => createMedia,
    createSource: () => createSource,
    mediaCore: () => mediaCore,
    mediaSource: () => mediaSource,
    supportMediaTags: () => supportMediaTags
  });
  var supportMediaTags = ["video", "bwp-video"];
  var MediaCore = class {
    inited;
    proxied;
    originDescriptors;
    originMethods;
    mediaElementList;
    mediaElementHandler;
    mediaMap;
    plusProps;
    plusMethods;
    constructor() {
      this.inited = false;
      this.proxied = false;
      this.originDescriptors = {};
      this.originMethods = {};
      this.mediaElementList = [];
      this.mediaElementHandler = [];
      this.mediaMap = new original.Map();
      this.plusProps = ["playbackRate", "volume", "currentTime"];
      this.plusMethods = ["play", "pause"];
    }
    // 是不是原生 HTMLMediaElement，用启动时的快照判，站点后打的补丁改不动它
    isNative(el) {
      return el instanceof original.HTMLMediaElement;
    }
    // 为一个媒体元素建增强 API：按 plusProps/plusMethods 生成 lock/unlock/locked/get/set/apply 的派生方法
    mediaPlus(mediaElement) {
      if (!mediaCore.isNative(mediaElement)) {
        return false;
      }
      let enhancer = original.map.get.call(mediaCore.mediaMap, mediaElement);
      if (enhancer) {
        return enhancer;
      }
      const mediaPlusBaseApi = {
        // 锁住某个属性：带时长就到期自动解锁，不带就一锁到底
        lock(keyName, duration) {
          const infoKey = `__${keyName}_info__`;
          enhancer[infoKey] = enhancer[infoKey] || {};
          enhancer[infoKey].lock = true;
          duration = Number(duration);
          if (!Number.isNaN(duration) && duration > 0) {
            enhancer[infoKey].unlockTime = Date.now() + duration;
          }
        },
        // 解锁某个属性，到期时间回拨到过去
        unlock(keyName) {
          const infoKey = `__${keyName}_info__`;
          enhancer[infoKey] = enhancer[infoKey] || {};
          enhancer[infoKey].lock = false;
          enhancer[infoKey].unlockTime = Date.now() - 100;
        },
        // 某个属性当前是否被锁：有到期时间按时间判，没有就看标记
        locked(keyName) {
          const info = enhancer[`__${keyName}_info__`] || {};
          return info.unlockTime ? Date.now() < info.unlockTime : !!info.lock;
        },
        // 读原型上的取值器，只对已被代理的属性走这条路
        get(keyName) {
          if (mediaCore.originDescriptors[keyName] && mediaCore.originDescriptors[keyName].get && !mediaCore.originMethods[keyName]) {
            return mediaCore.originDescriptors[keyName].get.apply(mediaElement);
          }
        },
        // 写原型上的设值器，只对已被代理的属性走这条路
        set(keyName, val) {
          if (mediaCore.originDescriptors[keyName] && mediaCore.originDescriptors[keyName].set && !mediaCore.originMethods[keyName] && typeof val !== "undefined") {
            return mediaCore.originDescriptors[keyName].set.apply(mediaElement, [val]);
          }
        },
        // 调原型上的方法（play / pause 这类），第一个参数是方法名
        apply(keyName) {
          if (mediaCore.originMethods[keyName] instanceof Function) {
            const args = Array.from(arguments);
            args.shift();
            return mediaCore.originMethods[keyName].apply(mediaElement, args);
          }
        }
      };
      enhancer = { ...mediaPlusBaseApi };
      const extApiKeys = mediaCore.plusProps.concat(mediaCore.plusMethods);
      const baseApiKeys = Object.keys(mediaPlusBaseApi);
      extApiKeys.forEach((key) => {
        const isMethod = mediaCore.originMethods[key] instanceof Function;
        baseApiKeys.forEach((baseKey) => {
          if (isMethod ? baseKey === "get" || baseKey === "set" : baseKey === "apply") {
            return;
          }
          enhancer[`${baseKey}${Utils.firstUpper(key)}`] = function() {
            return mediaPlusBaseApi[baseKey].apply(null, [key, ...arguments]);
          };
        });
      });
      original.map.set.call(mediaCore.mediaMap, mediaElement, enhancer);
      return enhancer;
    }
    // 认领一个媒体元素：进全局列表、建增强 API、再逐个通知检测回调
    admit(ctx) {
      if (mediaCore.isNative(ctx) && !mediaCore.mediaElementList.includes(ctx)) {
        mediaCore.mediaElementList.push(ctx);
        mediaCore.mediaPlus(ctx);
        try {
          mediaCore.mediaElementHandler.forEach((handler) => {
            handler instanceof Function && handler(ctx);
          });
        } catch (e) {
          console.log("[Media] 检出回调异常", e);
        }
      }
    }
    // 给原型方法套代理：先认领调用者，被锁住的方法直接拦掉
    proxyMethod(element, methodName) {
      const originFunc = element && element.prototype[methodName];
      if (!originFunc) return;
      element.prototype[methodName] = new original.Proxy(originFunc, {
        // 方法代理的入口：先认领 ctx，命中锁定就返回，否则转给原方法
        apply(target, ctx, args) {
          mediaCore.admit(ctx);
          if (mediaCore.plusMethods.includes(methodName)) {
            const enhancer = mediaCore.mediaPlus(ctx);
            if (enhancer && enhancer.locked(methodName)) {
              return;
            }
          }
          return target.apply(ctx, args);
        }
      });
    }
    // 劫持原型属性：读时被锁按属性回缺省值，写时被锁直接吞掉，src 赋值顺带触发检出
    hijackProp(element, property) {
      if (!element || !element.prototype || !mediaCore.originDescriptors[property]) {
        return false;
      }
      original.Object.defineProperty.call(Object, element.prototype, property, {
        configurable: true,
        enumerable: true,
        get: function() {
          const val = mediaCore.originDescriptors[property].get.apply(this, arguments);
          const enhancer = mediaCore.mediaPlus(this);
          if (enhancer && enhancer.locked(property)) {
            if (property === "playbackRate") {
              return 1;
            }
          }
          return val;
        },
        set: function(value) {
          if (property === "src") {
            mediaCore.admit(this);
          }
          if (mediaCore.plusProps.includes(property)) {
            const enhancer = mediaCore.mediaPlus(this);
            if (enhancer && enhancer.locked(property)) {
              return;
            }
          }
          return mediaCore.originDescriptors[property].set.apply(this, arguments);
        }
      });
    }
    // 把一项设置同步到页面上的其它媒体元素，当前实例由调用方自己处理
    eachOther(except, apply) {
      activePlayer.listPlayers().forEach((media) => {
        if (media === except) return;
        const api = mediaCore.mediaPlus(media);
        if (api) {
          apply(api);
        }
      });
    }
    // 装媒体元素代理：play / pause / load / addEventListener 与四个属性各劫持一次，只装一次
    mediaProxy() {
      if (!mediaCore.proxied) {
        const proxyMethods = ["play", "pause", "load", "addEventListener"];
        proxyMethods.forEach((methodName) => {
          mediaCore.proxyMethod(HTMLMediaElement, methodName);
        });
        mediaCore.plusProps.concat(["src"]).forEach((property) => {
          mediaCore.hijackProp(HTMLMediaElement, property);
        });
        mediaCore.proxied = true;
      }
      return mediaCore.proxied;
    }
    // 登记检测回调并保证代理已装好，返回当前实例列表
    mediaChecker(handler) {
      if (!(handler instanceof Function) || mediaCore.mediaElementHandler.includes(handler)) {
        return mediaCore.mediaElementList;
      } else {
        mediaCore.mediaElementHandler.push(handler);
      }
      if (!mediaCore.proxied) {
        mediaCore.mediaProxy();
      }
      return mediaCore.mediaElementList;
    }
    // 初始化媒体核心：先留原型描述符与方法快照，再装代理与检测回调，只初始化一次
    init(mediaCheckerHandler) {
      if (mediaCore.inited) {
        return false;
      }
      mediaCore.originDescriptors = Object.getOwnPropertyDescriptors(HTMLMediaElement.prototype);
      Utils.snapMethods(HTMLMediaElement.prototype, mediaCore.originMethods);
      mediaCheckerHandler = mediaCheckerHandler instanceof Function ? mediaCheckerHandler : function() {
      };
      mediaCore.mediaChecker(mediaCheckerHandler);
      mediaCore.inited = true;
      return true;
    }
  };
  var mediaCore = null;
  var createMedia = () => {
    mediaCore = new MediaCore();
    return mediaCore;
  };
  var SourceControl = class {
    hasMediaSourceInit;
    originMethods;
    urlMethods;
    sourceMap;
    urlMap;
    constructor() {
      this.hasMediaSourceInit = false;
      this.originMethods = {};
      this.urlMethods = {};
      this.sourceMap = new original.Map();
      this.urlMap = new original.Map();
    }
    // 把媒体元素认领到它的 MediaSource 记录上，按 objectURL 对上号
    bindElement(mediaEl) {
      const curSrc = mediaEl.currentSrc || mediaEl.src;
      if (!curSrc) {
        return false;
      }
      mediaSource.sourceMap.forEach((mediaSourceInfo) => {
        if (mediaSourceInfo.mediaSource.__objURL__ && curSrc === mediaSourceInfo.mediaSource.__objURL__) {
          mediaSourceInfo.mediaElement = mediaEl;
        }
      });
    }
    // 关联的媒体元素已脱文档或不可见时，清掉缓冲数据与元素引用并从两张表里摘除，减少内存占用
    prune() {
      mediaSource.sourceMap.forEach((mediaSourceInfo) => {
        const mediaElement = mediaSourceInfo.mediaElement;
        if (!(mediaElement instanceof HTMLMediaElement) || Utils.invisible(mediaElement)) {
          if (mediaSourceInfo.sourceBuffer && mediaSourceInfo.sourceBuffer.length) {
            mediaSourceInfo.sourceBuffer.forEach((sourceBufferItem) => {
              sourceBufferItem.bufferData = [];
              sourceBufferItem.originAppendBuffer = null;
            });
            mediaSourceInfo.sourceBuffer = [];
          }
          mediaSourceInfo.mediaElement = null;
          original.map.delete.call(mediaSource.sourceMap, mediaSourceInfo.mediaSource);
          original.map.delete.call(mediaSource.urlMap, mediaSourceInfo.mediaSource);
        }
      });
    }
    // 给 createObjectURL / addSourceBuffer / endOfStream 各套一层代理，把流数据攒进记录表
    proxySource() {
      if (!mediaSource.originMethods.addSourceBuffer || !mediaSource.originMethods.endOfStream) {
        return false;
      }
      mediaSource.urlMethods.createObjectURL = mediaSource.urlMethods.createObjectURL || URL.prototype.constructor.createObjectURL;
      URL.prototype.constructor.createObjectURL = new original.Proxy(mediaSource.urlMethods.createObjectURL, {
        // 记下 objectURL 与 MediaSource 的对应关系
        apply(target, ctx, args) {
          const object = args[0];
          const objectURL = target.apply(ctx, args);
          if (object instanceof MediaSource && !original.map.has.call(mediaSource.urlMap, object)) {
            object.__objURL__ = objectURL;
            original.map.set.call(mediaSource.urlMap, object, objectURL);
          }
          return objectURL;
        }
      });
      MediaSource.prototype.addSourceBuffer = new original.Proxy(mediaSource.originMethods.addSourceBuffer, {
        // 新开一条记录，并把 sourceBuffer 的 appendBuffer 也换成代理来攒数据
        apply(target, ctx, args) {
          if (!original.map.has.call(mediaSource.sourceMap, ctx)) {
            original.map.set.call(mediaSource.sourceMap, ctx, { mediaSource: ctx, createTime: Date.now(), sourceBuffer: [], endOfStream: false });
          }
          const mediaSourceInfo = original.map.get.call(mediaSource.sourceMap, ctx);
          const mimeCodecs = args[0] || "";
          const sourceBuffer = target.apply(ctx, args);
          const sourceBufferItem = { mimeCodecs, originAppendBuffer: sourceBuffer.appendBuffer, bufferData: [], mediaInfo: {} };
          try {
            const mediaInfo = sourceBufferItem.mediaInfo;
            const tmpArr = sourceBufferItem.mimeCodecs.split(";");
            mediaInfo.type = tmpArr[0].split("/")[0];
            mediaInfo.format = tmpArr[0].split("/")[1];
            mediaInfo.codecs = tmpArr[1].trim().replace("codecs=", "").replace(/["']/g, "");
          } catch (e) {
            console.log("[Media] 媒体信息解析异常", sourceBufferItem, e);
          }
          mediaSourceInfo.sourceBuffer.push(sourceBufferItem);
          sourceBuffer.appendBuffer = new original.Proxy(sourceBufferItem.originAppendBuffer, {
            // 缓存这一段流数据
            apply(bufTarget, bufCtx, bufArgs) {
              if (!mediaSourceInfo.endOfStream) {
                sourceBufferItem.bufferData.push(bufArgs[0]);
              }
              return bufTarget.apply(bufCtx, bufArgs);
            }
          });
          return sourceBuffer;
        }
      });
      MediaSource.prototype.endOfStream = new original.Proxy(mediaSource.originMethods.endOfStream, {
        // 流结束：标记完成
        apply(target, ctx, args) {
          const mediaSourceInfo = original.map.get.call(mediaSource.sourceMap, ctx);
          if (mediaSourceInfo) {
            mediaSourceInfo.endOfStream = true;
          }
          return target.apply(ctx, args);
        }
      });
    }
    // 下载由 MediaSource 管理的媒体文件：不再弹确认与命名框，未就绪也直接下已缓冲的部分
    downloadStream(mediaEl, title) {
      const curSrc = mediaEl.currentSrc || mediaEl.src;
      if (!curSrc) {
        console.log("[Media] 下载地址缺失");
        return false;
      }
      let hasFindMediaSource = false;
      mediaSource.sourceMap.forEach((mediaSourceInfo) => {
        const source = mediaSourceInfo.mediaSource;
        if (!source.__objURL__) {
          console.log("[Media] objectURL缺失", source, mediaSourceInfo);
          return false;
        }
        if (curSrc !== source.__objURL__) {
          return false;
        }
        hasFindMediaSource = true;
        mediaSourceInfo.mediaElement = mediaEl;
        let mediaSourceTitle = null;
        mediaSourceInfo.sourceBuffer.forEach((sourceBufferItem) => {
          if (!sourceBufferItem.mimeCodecs || sourceBufferItem.mimeCodecs.toString().indexOf(";") === -1) {
            console.log("[Media] 流信息异常无法下载", sourceBufferItem);
            return false;
          }
          try {
            const mediaTitle = `${mediaSourceTitle || sourceBufferItem.mediaInfo.title || title || mediaEl.getAttribute("data-title") || document.title || Date.now()}`;
            mediaSourceTitle = mediaTitle;
            const fileName = `${mediaTitle}_${sourceBufferItem.mediaInfo.type}.${sourceBufferItem.mediaInfo.format}`;
            const a = document.createElement("a");
            const blobUrl = URL.createObjectURL(new Blob(sourceBufferItem.bufferData));
            a.href = blobUrl;
            a.download = fileName;
            try {
              a.click();
              mediaSourceInfo.hasDownload = true;
            } finally {
              URL.revokeObjectURL(blobUrl);
              sourceBufferItem.bufferData = [];
            }
          } catch (e) {
            mediaSourceInfo.hasDownload = false;
            console.log("[Media] 流下载异常", e);
          }
        });
      });
      if (!hasFindMediaSource) {
        console.log("[Media] 媒体流未找到", curSrc);
      }
    }
    // MediaSource 相关代理是否已装好
    hasInit() {
      return mediaSource.hasMediaSourceInit;
    }
    // 装 MediaSource 代理：先留一份原型方法快照，再逐个套代理，只装一次
    init() {
      if (mediaSource.hasMediaSourceInit) {
        return false;
      }
      if (!window.MediaSource) {
        return false;
      }
      Utils.snapMethods(MediaSource.prototype, mediaSource.originMethods);
      mediaSource.proxySource();
      mediaSource.hasMediaSourceInit = true;
    }
  };
  var mediaSource = null;
  var createSource = () => {
    mediaSource = new SourceControl();
    return mediaSource;
  };
  var Amplifier = class {
    _source;
    _gain;
    constructor(mediaElem) {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      this._source = context.createMediaElementSource(mediaElem);
      this._source.connect(this._gain = context.createGain());
      this._gain.connect(context.destination);
    }
    // 响度 → 分贝 → 增益倍数两条换算一步到位（每 10 分贝翻一倍）
    setLoudness(value) {
      this._gain.gain.value = Math.pow(10, 10 * Math.log2(value) / 20);
    }
  };

  // Menu.ts
  var Menu_exports = {};
  __export(Menu_exports, {
    MenuControl: () => MenuControl,
    createMenu: () => createMenu,
    menu: () => menu,
    menuStyle: () => menuStyle
  });

  // Picture.ts
  var Picture_exports = {};
  __export(Picture_exports, {
    PictureControl: () => PictureControl,
    createPicture: () => createPicture,
    filterDefs: () => filterDefs,
    picture: () => picture
  });
  var filterDefs = [
    { name: "brightness", noun: "亮度", up: "☀️", down: "🌙", label: "图像亮度：", scale: 100, unit: "%", base: 1, step: 0.1 },
    { name: "contrast", noun: "对比度", up: "◐", down: "◑", label: "图像对比度：", scale: 100, unit: "%", base: 1, step: 0.1 },
    { name: "saturation", noun: "饱和度", up: "🌈", down: "🌫️", label: "图像饱和度：", scale: 100, unit: "%", base: 1, step: 0.1 },
    // 色相是角度、模糊是像素，按原值展示，不能像比例值那样乘上100；色相是唯一可以取负的一组
    { name: "hue", noun: "色相", up: "🎨", down: "🎨", label: "图像色相：", scale: 1, unit: "°", base: 0, step: 1, negative: true },
    { name: "blur", noun: "模糊度", up: "💨", down: "💨", label: "图像模糊度：", scale: 1, unit: "px", base: 0, step: 1 }
  ];
  var filterDefaults = filterDefs.map((def) => def.base);
  var PictureControl = class {
    defaultTransform;
    scale;
    translate;
    rotate;
    rotateY;
    rotateX;
    historyTransform;
    transformGuard;
    _transformStyle;
    filter;
    key;
    setup;
    constructor() {
      this.defaultTransform = { scale: 1, translate: { x: 0, y: 0 }, rotate: 0, rotateY: 0, rotateX: 0 };
      this.scale = this.defaultTransform.scale;
      this.translate = Utils.clone(this.defaultTransform.translate);
      this.rotate = this.defaultTransform.rotate;
      this.rotateY = this.defaultTransform.rotateY;
      this.rotateX = this.defaultTransform.rotateX;
      this.historyTransform = {};
      this.transformGuard = null;
      this._transformStyle = { wanted: null, actual: null };
      this.filter = {
        key: filterDefaults.slice(),
        setup: function() {
          activePlayer.player().style.filter = `brightness(${this.key[0]}) contrast(${this.key[1]}) saturate(${this.key[2]}) hue-rotate(${this.key[3]}deg) blur(${this.key[4]}px)`;
        },
        reset: function() {
          this.key = filterDefaults.slice();
          this.setup();
        }
      };
    }
    // 画面样式由定时守护负责维持：值没变、也没被人改掉时不要重复赋值，避免持续触发样式重算
    writeTransform(player, transform) {
      const cache = picture._transformStyle;
      if (cache.wanted === transform && player.style.transform === cache.actual) {
        return;
      }
      player.style.transform = transform;
      cache.wanted = transform;
      cache.actual = player.style.transform;
    }
    // 逐键比较当前值与缺省值（translate 有两个子键），有差异就把 (键, 子键, 当前值) 交给回调
    eachDiff(handler) {
      Object.keys(picture.defaultTransform).forEach((key) => {
        const def = picture.defaultTransform[key];
        if (Utils.isObj(def)) {
          Object.keys(def).forEach((subKey) => {
            if (Number(picture[key][subKey]) !== def[subKey]) {
              handler(key, subKey, picture[key][subKey]);
            }
          });
        } else if (Number(picture[key]) !== def) {
          handler(key, null, picture[key]);
        }
      });
    }
    // 设置视频画面的缩放与位移
    setTransform(notTips) {
      const player = activePlayer.player();
      const scale = picture.scale = Number(Number(picture.scale).toFixed(2));
      const translate = picture.translate;
      const mirror = picture.rotateX === 180 ? `rotateX(${picture.rotateX}deg)` : picture.rotateY === 180 ? `rotateY(${picture.rotateY}deg)` : "";
      const transform = `scale(${scale.toFixed(2)}) translate(${translate.x}px, ${translate.y}px) rotate(${picture.rotate}deg) ${mirror}`;
      picture.writeTransform(player, transform);
      let tipsMsg = `视频缩放率：${(scale * 100).toFixed(0)}%`;
      if (translate.x) {
        tipsMsg += ` 水平位移：${picture.translate.x}px`;
      }
      if (translate.y) {
        tipsMsg += ` 垂直位移：${picture.translate.y}px`;
      }
      if (notTips !== true) {
        picture.eachDiff((key, subKey, val) => {
          if (subKey) {
            picture.historyTransform[key] = picture.historyTransform[key] || {};
            picture.historyTransform[key][subKey] = val;
          } else {
            picture.historyTransform[key] = val;
          }
        });
        menu.tips(tipsMsg);
      }
      if (!picture.transformGuard) {
        picture.transformGuard = setInterval(() => {
          picture.setTransform(true);
        }, 300);
      }
    }
    // 视频画面旋转 90 度
    setRotate() {
      picture.rotate += 90;
      if (picture.rotate % 360 === 0) picture.rotate = 0;
      picture.setTransform(true);
      menu.tips("画面旋转：" + picture.rotate + "°");
    }
    // 镜像就是绕对应那根轴翻到 180 再翻回来，两个方向只差一个字段名
    setMirror(vertical = false) {
      const axis = vertical ? "rotateX" : "rotateY";
      picture[axis] = picture[axis] === 0 ? 180 : 0;
      picture.setTransform(true);
      menu.tips(` ${vertical ? "垂直" : "水平"}镜像 ${picture[axis]}deg`);
    }
    // 缩放视频画面：菜单与用户自定的快捷键都可能把字符串递进来，先收成数字再落状态
    setScale(num) {
      num = Number(num);
      picture.scale = Number.isNaN(num) ? 1 : num;
      picture.setTransform();
    }
    // 缩放一档：放大与缩小只差一个符号
    scaleStep(num, sign) {
      picture.setScale(picture.scale + sign * Utils.stepValue(num, 0.05));
    }
    // 视频放大
    zoomIn(num) {
      picture.scaleStep(num, 1);
    }
    // 视频缩小
    zoomOut(num) {
      picture.scaleStep(num, -1);
    }
    // 设置视频画面的位移属性
    setTranslate(x, y) {
      if (typeof x === "number") {
        picture.translate.x = x;
      }
      if (typeof y === "number") {
        picture.translate.y = y;
      }
      picture.setTransform();
    }
    // 沿一个轴平移一步，四个方向只差符号；命令名要留给默认快捷键配置，所以各留一层壳
    translateStep(axis, sign, num) {
      const step = sign * Utils.stepValue(num, 10);
      picture.setTranslate(axis === "x" ? picture.translate.x + step : null, axis === "y" ? picture.translate.y + step : null);
    }
    // 视频画面向右平移
    moveRight(num) {
      return picture.translateStep("x", 1, num);
    }
    // 视频画面向左平移
    moveLeft(num) {
      return picture.translateStep("x", -1, num);
    }
    // 视频画面向上平移
    moveUp(num) {
      return picture.translateStep("y", -1, num);
    }
    // 视频画面向下平移
    moveDown(num) {
      return picture.translateStep("y", 1, num);
    }
    // 复位画面变换：已到缺省值就退回上一次的历史值，否则回到出厂缺省
    resetTransform(notTips) {
      let diff = false;
      picture.eachDiff(() => {
        diff = true;
      });
      if (!diff && Object.keys(picture.historyTransform).length) {
        Object.keys(picture.historyTransform).forEach((key) => {
          if (Utils.isObj(picture.historyTransform[key])) {
            Object.keys(picture.historyTransform[key]).forEach((subKey) => {
              picture[key][subKey] = picture.historyTransform[key][subKey];
            });
          } else {
            picture[key] = picture.historyTransform[key];
          }
        });
      } else {
        const defaultTransform = Utils.clone(picture.defaultTransform);
        Object.keys(defaultTransform).forEach((key) => {
          picture[key] = defaultTransform[key];
        });
      }
      picture.setTransform(notTips);
    }
    // — 图像滤镜：亮度/对比度/饱和度/色相/模糊（原 FilterControl 全部并入此处）
    setFilter(item, num, isDown) {
      const def = filterDefs[item];
      if (!def || typeof num !== "number") {
        console.log("[Picture] 滤镜参数错误", item, num);
        return false;
      }
      if (isDown === true && num > 0) {
        num = -num;
      }
      const key = picture.filter.key;
      key[item] = Number((key[item] + num).toFixed(2));
      if (key[item] < 0 && !def.negative) {
        key[item] = 0;
      }
      picture.filter.setup();
      menu.tips(def.label + parseInt(String(key[item] * def.scale)) + def.unit);
    }
    // 五个滤镜的 15 个动作（brightnessUp / hueDown …）按 filterDefs 生成到原型上
    resetPicture() {
      picture.resetTransform(true);
      picture.filter.reset();
      menu.tips("图像属性：复位");
    }
  };
  var picture = null;
  var createPicture = () => {
    picture = new PictureControl();
    return picture;
  };
  filterDefs.forEach((def, item) => {
    PictureControl.prototype[def.name] = (num) => picture.setFilter(item, num);
    PictureControl.prototype[def.name + "Up"] = (num) => picture.setFilter(item, num || def.step);
    PictureControl.prototype[def.name + "Down"] = (num) => picture.setFilter(item, num || -def.step, true);
  });

  // Menu.ts
  var menuStyle = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .r6pcm-menu {
      position: fixed;
      left: 0;
      top: 0;
      min-width: 210px;
      padding: 5px;
      background: rgba(36, 36, 40, 0.98);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 10px;
      box-shadow: 0 9px 32px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
      color: #f1f1f3;
      font-size: 13px;
      font-family: system-ui, -apple-system, 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', sans-serif;
      user-select: none;
      -webkit-user-select: none;
      max-height: min(600px, calc(100vh - 16px));
      overflow-y: auto;
      scrollbar-width: thin;
    }
    .r6pcm-menu::-webkit-scrollbar { width: 6px; }
    .r6pcm-menu::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.2); border-radius: 3px; }
    .r6pcm-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      height: 32px;
      padding: 0 10px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
    }
    .r6pcm-item:hover { background: rgba(255, 255, 255, 0.12); }
    .r6pcm-item__label { overflow: hidden; text-overflow: ellipsis; }
    .r6pcm-item__arrow { color: #9a9aa0; font-size: 11px; flex: none; }
    .r6pcm-divider { height: 1px; margin: 5px 8px; background: rgba(255, 255, 255, 0.1); }
  `;
  var contextMenuInited = false;
  var MenuControl = class _MenuControl {
    fontSize;
    tipsClassName;
    timers;
    host;
    shadow;
    isOpen;
    menuStack;
    closeBound;
    constructor() {
      this.fontSize = 12;
      this.tipsClassName = "html_player_enhance_tips";
      this.timers = new Array(3);
      this.host = null;
      this.shadow = null;
      this.isOpen = false;
      this.menuStack = [];
      this.closeBound = false;
    }
    // 取提示浮层的挂载容器：播放器的父节点，父节点没有布局盒时再上退一层
    tipsHost(videoEl) {
      const player = videoEl || activePlayer.player();
      let tispContainer = player.parentNode || player;
      const containerBox = tispContainer.getBoundingClientRect();
      if ((!containerBox.width || !containerBox.height) && tispContainer.parentNode) {
        tispContainer = tispContainer.parentNode;
      }
      return tispContainer;
    }
    // 在画面上弹一条即时提示，先备份容器行内样式，两秒后还原
    tips(str) {
      const player = activePlayer.player();
      if (!player) {
        console.log("[Menu] 提示无实例落空", str);
        return true;
      }
      const isAudio = activePlayer.isAudioInstance();
      const parentNode = menu.tipsMount();
      if (parentNode === player) {
        console.log("[Menu] 提示容器异常", player, str);
        return false;
      }
      let backupStyle = "";
      if (!isAudio) {
        const defStyle = parentNode.getAttribute("style") || "";
        backupStyle = parentNode.getAttribute("style-backup") || "";
        if (!backupStyle) {
          let backupSty = defStyle || "style-backup: none";
          const backupStyObj = {};
          backupSty.split(";").forEach((item) => {
            const parts = item.split(":");
            if (parts.length === 2) {
              backupStyObj[parts[0].trim()] = parts[1].trim();
            }
          });
          if (backupStyObj.opacity === "0") {
            backupStyObj.opacity = "1";
          }
          if (backupStyObj.visibility === "hidden") {
            backupStyObj.visibility = "visible";
          }
          backupSty = Object.keys(backupStyObj).map((key) => `${key}: ${backupStyObj[key]}`).join("; ");
          parentNode.setAttribute("style-backup", backupSty);
          backupStyle = defStyle;
        } else if (defStyle && !defStyle.includes("style-backup")) {
          backupStyle = defStyle;
        }
        const newStyleArr = backupStyle.split(";");
        const oldPosition = parentNode.getAttribute("def-position") || window.getComputedStyle(parentNode).position;
        if (parentNode.getAttribute("def-position") === null) {
          parentNode.setAttribute("def-position", oldPosition || "");
        }
        if (["static", "inherit", "initial", "unset", ""].includes(oldPosition)) {
          newStyleArr.push("position: relative");
        }
        const playerBox = player.getBoundingClientRect();
        const parentNodeBox = parentNode.getBoundingClientRect();
        if (!parentNodeBox.width || !parentNodeBox.height) {
          newStyleArr.push("min-width:" + playerBox.width + "px");
          newStyleArr.push("min-height:" + playerBox.height + "px");
        }
        parentNode.setAttribute("style", newStyleArr.join(";"));
        const newPlayerBox = player.getBoundingClientRect();
        if (Math.abs(newPlayerBox.height - playerBox.height) > 50) {
          parentNode.setAttribute("style", backupStyle);
        }
      }
      const tipsSelector = "." + menu.tipsClassName;
      const tipsList = document.querySelectorAll(tipsSelector);
      if (tipsList.length > 1) {
        tipsList.forEach((tipsItem) => {
          tipsItem.remove();
        });
      }
      let tipsDom = parentNode.querySelector(tipsSelector);
      if (!tipsDom) {
        menu.initTips();
        tipsDom = parentNode.querySelector(tipsSelector);
        if (!tipsDom) {
          console.log("[Menu] 提示节点缺失");
          return false;
        }
      }
      const style = tipsDom.style;
      tipsDom.innerText = str;
      for (let i = 0; i < 3; i++) {
        if (menu.timers[i]) clearTimeout(menu.timers[i]);
      }
      function showTips() {
        style.display = "block";
        menu.timers[0] = setTimeout(function() {
          style.opacity = 1;
        }, 50);
        menu.timers[1] = setTimeout(function() {
          style.opacity = 0;
          style.display = "none";
          if (backupStyle) {
            parentNode.setAttribute("style", backupStyle);
          }
        }, 2e3);
      }
      if (style.display === "block") {
        style.display = "none";
        clearTimeout(menu.timers[2]);
        menu.timers[2] = setTimeout(function() {
          showTips();
        }, 100);
      } else {
        showTips();
      }
    }
    // 提示节点的挂载容器：音频实例没有可用的画面包裹层，直接挂在 body 上
    tipsMount() {
      return activePlayer.isAudioInstance() ? document.body : menu.tipsHost();
    }
    // 设置提示DOM的样式
    initTips() {
      const isAudio = activePlayer.isAudioInstance();
      const parentNode = menu.tipsMount();
      if (parentNode.querySelector("." + menu.tipsClassName)) return;
      const tipsStyle = `
      position: ${isAudio ? "fixed" : "absolute"};
      z-index: 999999;
      font-size: ${menu.fontSize || 16}px;
      padding: 5px 10px;
      background: rgba(0,0,0,0.4);
      color:white;
      ${isAudio ? "bottom: 0; right: 0;" : "top: 0; left: 0;"}
      transition: all 500ms ease;
      opacity: 0;
      border-${isAudio ? "top-left" : "bottom-right"}-radius: 5px;
      display: none;
      -webkit-font-smoothing: subpixel-antialiased;
      font-family: 'microsoft yahei', Verdana, Geneva, sans-serif;
      -webkit-user-select: none;
    `;
      const tips = document.createElement("div");
      tips.setAttribute("style", tipsStyle);
      tips.setAttribute("class", menu.tipsClassName);
      parentNode.appendChild(tips);
    }
    // 将菜单浮层定位到指定坐标，并确保完整显示在视口内
    placeMenu(menuEl, x, y) {
      menuEl.style.left = "0px";
      menuEl.style.top = "0px";
      const rect = menuEl.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      let left = x;
      if (left + rect.width > vw - 8) {
        left = vw - rect.width - 8;
      }
      if (left < 8) {
        left = 8;
      }
      let top = y;
      if (top + rect.height > vh - 8) {
        top = vh - rect.height - 8;
      }
      if (top < 8) {
        top = 8;
      }
      menuEl.style.left = left + "px";
      menuEl.style.top = top + "px";
    }
    // 关闭第level层及更深的菜单浮层
    closeFrom(level) {
      for (let i = menu.menuStack.length - 1; i >= level; i--) {
        const el = menu.menuStack[i];
        el && el.remove();
        menu.menuStack.splice(i, 1);
      }
    }
    // 关掉整个菜单栈并清掉打开标记
    close() {
      menu.closeFrom(0);
      menu.isOpen = false;
    }
    //   渲染一层菜单浮层：nodes 结构 {title, fn, children, divider}，level 为层级，(x, y) 为期望坐标全屏时要挂到全屏元素内部，否则菜单会被 top layer 遮挡
    renderNodes(nodes, level, x, y) {
      const mountRoot = document.fullscreenElement || document.documentElement;
      if (!(menu.host && menu.host.isConnected && menu.host.parentNode === mountRoot && menu.shadow)) {
        if (menu.host && menu.host.isConnected) {
          menu.host.parentNode.removeChild(menu.host);
        }
        menu.host = document.createElement("div");
        menu.host.style.cssText = "position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647;";
        mountRoot.appendChild(menu.host);
        if (menu.host.attachShadow) {
          menu.shadow = menu.host.attachShadow({ mode: "open" });
        } else {
          menu.shadow = menu.host;
        }
        const style = document.createElement("style");
        style.textContent = menuStyle;
        menu.shadow.appendChild(style);
      }
      const menuEl = Utils.el("div", "r6pcm-menu");
      nodes.forEach((node) => {
        if (node.divider) {
          const divider = Utils.el("div", "r6pcm-divider");
          menuEl.appendChild(divider);
          return;
        }
        const row = Utils.el("div", "r6pcm-item");
        const label = Utils.el("span", "r6pcm-item__label");
        label.textContent = typeof node.title === "function" ? node.title() : node.title || "";
        row.appendChild(label);
        if (Array.isArray(node.children) && node.children.length) {
          const arrow = Utils.el("span", "r6pcm-item__arrow");
          arrow.textContent = "▸";
          row.appendChild(arrow);
          row.addEventListener("mouseenter", () => {
            menu.closeFrom(level + 1);
            const rowRect = row.getBoundingClientRect();
            const subEl = menu.renderNodes(node.children, level + 1, rowRect.right + 2, rowRect.top - 6);
            const subRect = subEl.getBoundingClientRect();
            if (subRect.right > window.innerWidth - 8) {
              menu.placeMenu(subEl, rowRect.left - subRect.width - 2, rowRect.top - 6);
            }
          });
        } else {
          row.addEventListener("mouseenter", () => {
            menu.closeFrom(level + 1);
          });
          if (node.fn instanceof Function) {
            row.addEventListener("click", (event) => {
              event.stopPropagation();
              menu.close();
              setTimeout(() => {
                try {
                  node.fn();
                } catch (err) {
                  console.log("[Menu] 菜单动作异常", err);
                }
              }, 50);
            });
          }
        }
        menuEl.appendChild(row);
      });
      menu.shadow.appendChild(menuEl);
      menu.placeMenu(menuEl, x, y);
      menu.menuStack[level] = menuEl;
      menu.isOpen = true;
      return menuEl;
    }
    // 在 (x, y) 处打开菜单：先清旧栈，再渲染功能树第一层；全局关闭事件（点外部 / Esc / 滚动 / 缩放 / 全屏切换 / 失焦）只挂一次
    open(x, y) {
      menu.close();
      menu.renderNodes(_MenuControl.buildTree(), 0, x, y);
      if (menu.closeBound) return;
      menu.closeBound = true;
      window.addEventListener("mousedown", (event) => {
        if (!menu.isOpen) return;
        if (!Utils.eventPath(event).includes(menu.host)) {
          menu.close();
        }
      }, true);
      window.addEventListener("keydown", (event) => {
        if (menu.isOpen && event.key === "Escape") {
          menu.close();
        }
      }, true);
      window.addEventListener("scroll", () => {
        menu.isOpen && menu.close();
      }, true);
      window.addEventListener("resize", () => {
        menu.isOpen && menu.close();
      });
      document.addEventListener("fullscreenchange", () => {
        menu.isOpen && menu.close();
      });
      window.addEventListener("blur", () => {
        menu.isOpen && menu.close();
      });
    }
    // 功能树（单一数据源）：视频右键的多级增强菜单直接渲染该树
    static buildTree() {
      return [
        {
          title: "▶ 播放控制",
          children: [
            menuCmd("⏯ 播放 / 暂停", "switchPlay"),
            menuCmd("⏩ 快进 5 秒", "seekForward"),
            menuCmd("⏭ 快进 30 秒", "seekForward", 30),
            menuCmd("⏪ 后退 5 秒", "seekBack"),
            menuCmd("⏮ 后退 30 秒", "seekBack", -30),
            { divider: true },
            menuCmd("▶| 下一帧", "freezeFrame", 1),
            menuCmd("|◀ 上一帧", "freezeFrame", -1),
            menuCmd("⏭ 播放下一集（需网站支持）", "nextVideo")
          ]
        },
        {
          title: "🎚 倍速",
          children: [
            menuCmd("🐢 减速播放 -0.1", "slowDown"),
            menuCmd("🐇 加速播放 +0.1", "speedUp"),
            menuCmd("↩️ 恢复正常速度（1x / 上次倍速）", "resetSpeed"),
            { divider: true },
            ...["0.5", "0.75", "1.0", "1.25", "1.5", "2.0", "3.0", "4.0", "8.0", "16.0"].map((r) => menuCmd(r + "x", "applyRate", Number(r))),
            { divider: true },
            ...["1", "2", "3", "4"].map((n) => menuCmd("🚀 快速跳速 " + n + "x（连按叠加）", "boost", Number(n)))
          ]
        },
        {
          title: "🔊 音量",
          children: [menuCmd("🔊 音量 +20%", "volumeUp", 0.2), menuCmd("🔉 音量 -20%", "volumeDown", -0.2), menuCmd("🔊 音量 +5%", "volumeUp", 0.05), menuCmd("🔉 音量 -5%", "volumeDown", -0.05)]
        },
        {
          title: "🖼 画面",
          children: [
            menuCmd("📷 截图（复制到剪贴板并下载）", "capture"),
            menuCmd("📺 画中画", "togglePicture"),
            menuCmd("⛶ 全屏", "maximize"),
            menuCmd("🖥 网页全屏", "webMaximize"),
            { divider: true },
            menuCmd("🔄 画面旋转 90°", "setRotate"),
            menuCmd("↔️ 画面水平镜像翻转", "setMirror"),
            menuCmd("↕️ 画面垂直镜像翻转", "setMirror", true),
            { divider: true },
            menuCmd("🔍 放大画面 +0.05", "zoomIn"),
            menuCmd("🔍 缩小画面 -0.05", "zoomOut"),
            menuCmd("🎯 恢复画面（缩放位移复位）", "resetTransform"),
            { divider: true },
            ...[["➡️", "右", "Right"], ["⬅️", "左", "Left"], ["⬆️", "上", "Up"], ["⬇️", "下", "Down"]].map(([icon, name, dir]) => menuCmd(icon + " 画面" + name + "移 10px", "move" + dir))
          ]
        },
        {
          title: "🎨 滤镜",
          children: [
            ...filterDefs.flatMap((def) => [menuCmd(def.up + " 增加" + def.noun, def.name + "Up"), menuCmd(def.down + " 减少" + def.noun, def.name + "Down")]),
            { divider: true },
            menuCmd("♻️ 图像复位（滤镜+画面）", "resetPicture")
          ]
        },
        { title: "⬇️ 下载与进度", children: [menuCmd("⬇️ 下载音视频（实验性功能）", "mediaDownload"), { divider: true }, menuCmd("启用/禁用：自动跟随跳转到缓冲区时间", "toggleBuffered"), menuCmd("🔁 允许/禁止自动恢复播放进度", "toggleRestore")] },
        { title: "⌨️ 快捷键", children: [menuCmd(() => `${input.keysPaused ? "启用快捷键" : "禁用快捷键"}（临时）`, "toggleHotkeys"), menuCmd(() => `${input.enable ? "禁用" : "启用"} r6Player 增强（Ctrl+空格）`, "toggleEnhance")] },
        { title: "⚙️ 设置", children: menuItems() },
        { title: "ℹ️ 关于", children: [menuCmd("🖨 打印播放器信息（调试）", "printInfo")] }
      ];
    }
    // 初始化视频右键菜单：window 捕获阶段接管 contextmenu，先于网站自身处理
    static init() {
      if (contextMenuInited) return;
      contextMenuInited = true;
      window.addEventListener("contextmenu", (event) => {
        if (!menuOn()) {
          menu.close();
          return;
        }
        const mediaEl = Utils.eventPath(event).find((node) => node && Utils.isMedia(node));
        const selection = window.getSelection && window.getSelection();
        if (!mediaEl || !Utils.onMedia(mediaEl, event.clientX, event.clientY) || selection && !selection.isCollapsed) {
          menu.close();
          return;
        }
        if (activePlayer.player() !== mediaEl) {
          activePlayer.claim(mediaEl);
        }
        event.preventDefault();
        event.stopPropagation();
        menu.open(event.clientX, event.clientY);
      }, true);
    }
  };
  var menu = null;
  var createMenu = () => {
    menu = new MenuControl();
    return menu;
  };

  // Tuner.ts
  var Tuner_exports = {};
  __export(Tuner_exports, {
    TunerControl: () => TunerControl,
    createTuner: () => createTuner,
    mediaProps: () => mediaProps,
    progressKey: () => progressKey,
    takenOver: () => takenOver,
    tuner: () => tuner
  });
  var mediaProps = { playbackRate: () => tuner.playbackRateInfo, volume: () => tuner.volumeInfo, currentTime: () => tuner.timeInfo() };
  var progressKey = (duration) => window.location.href + duration;
  var restoreKey = () => "media.allowRestorePlayProgress." + location.host;
  var takenOver = (api) => taskCenter.doTask("blockSet" + api) || blocksSet(api);
  var TunerControl = class {
    playbackRate;
    lastPlaybackRate;
    playbackRateInfo;
    boostInfo;
    _setPlaybackRateDuplicate_;
    _setPlaybackRateDuplicate2_;
    volume;
    volumeInfo;
    skipStep;
    fps;
    followBuffer;
    _firstProgressRecord_;
    _hasRestorePlayProgress_;
    constructor() {
      this.playbackRate = configManager.get("media.playbackRate");
      this.lastPlaybackRate = configManager.get("media.lastPlaybackRate");
      this.playbackRateInfo = { lockTimeout: Date.now() - 1, time: Date.now(), value: -1 };
      this.boostInfo = null;
      this._setPlaybackRateDuplicate_ = null;
      this._setPlaybackRateDuplicate2_ = null;
      this.volume = configManager.get("media.volume");
      this.volumeInfo = { lockTimeout: Date.now() - 1, time: Date.now(), value: -1 };
      this.skipStep = 5;
      this.fps = 30;
      this.followBuffer = false;
      this._firstProgressRecord_ = null;
      this._hasRestorePlayProgress_ = null;
    }
    // 取当前倍速：iframe 里优先用全局层的值，统一保留一位小数
    getSpeed() {
      let playbackRate = configManager.get("media.playbackRate") || tuner.playbackRate;
      if (Utils.inFrame()) {
        const globalPlaybackRate = configManager.getGlobal("media.playbackRate");
        if (globalPlaybackRate) {
          playbackRate = globalPlaybackRate;
        }
      }
      return Number(Number(playbackRate).toFixed(1));
    }
    // 倍速、音量、进度的锁是同一套动作：有增强 API 交给 API，否则写进各自的 info.lockTimeout
    lock(prop, timeout = 200) {
      const api = Utils.firstUpper(prop);
      if (activePlayer.enhancer) {
        if (blocksSet(api)) {
          timeout = 1e3 * 60 * 60 * 24 * 365;
        }
        activePlayer.enhancer["lock" + api](timeout);
        return true;
      }
      const info = mediaProps[prop]();
      if (info) {
        info.lockTimeout = Date.now() + timeout;
      }
    }
    // 解锁：有增强 API 就调它，否则把 info.lockTimeout 拨到过去，立刻失效
    unlock(prop) {
      if (activePlayer.enhancer) {
        activePlayer.enhancer["unlock" + Utils.firstUpper(prop)]();
        return true;
      }
      const info = mediaProps[prop]();
      if (info) {
        info.lockTimeout = Date.now() - 1;
      }
    }
    // 查这个属性是否还在锁定期：有增强 API 问它，否则看 info.lockTimeout 有没有到期
    locked(prop) {
      if (activePlayer.enhancer) {
        return activePlayer.enhancer["locked" + Utils.firstUpper(prop)]();
      }
      const info = mediaProps[prop]();
      return !!(info && info.lockTimeout) && Date.now() - info.lockTimeout < 0;
    }
    // 把媒体元素的原生属性接管到实例上：以原型描述符为底装给定的读写，三个属性只差描述符内容
    proxyProp(player, name, describe) {
      try {
        const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, name);
        original.Object.defineProperty.call(Object, player, name, Object.assign({ configurable: true }, describe(native)));
      } catch (e) {
        console.log("[Tuner] 属性接管失败", name, e);
      }
    }
    // 写媒体属性的两条路：增强 API 在位时转交给它，否则直写实例并接管该属性
    plusSet(prop, value) {
      if (!activePlayer.enhancer) {
        return false;
      }
      activePlayer.enhancer["set" + Utils.firstUpper(prop)](value);
      return true;
    }
    // 直写之前先删掉实例上的同名属性：站点可能在那里装了拦截器，删掉才轮得到原型
    directSet(player, prop, value, describe) {
      delete player[prop];
      player[prop] = value;
      const info = mediaProps[prop]();
      if (info) {
        info.time = Date.now();
        info.value = value;
      }
      tuner.proxyProp(player, prop, describe);
    }
    // 用户主动调速的统一走法：先解上一轮的锁再设值，设完立刻锁回去，否则会被站点的调速逻辑改回；num 为 null 表示按当前记录值重设
    applyRate(num, notips, lockTime) {
      return tuner.applyProp("playbackRate", num, lockTime || 1e3, notips);
    }
    // 解决高低倍速频繁切换后，音画不同步的问题
    fixSpeed(oldSpeed) {
      if (Math.abs(tuner.getSpeed() - oldSpeed) > 1) {
        tuner.seekForward(0.1, true);
      }
    }
    // 三个属性共用的那一套：先解开上一轮的锁再设值，设完立刻锁回去（倍速的设值器叫 setSpeed，其余按属性名派生）
    applyProp(prop, value, lockTime, notips) {
      const api = Utils.firstUpper(prop);
      tuner["unlock" + api]();
      const suc = tuner[prop === "playbackRate" ? "setSpeed" : "set" + api](value, notips);
      tuner["lock" + api](lockTime || 500);
      return suc;
    }
    // 设置播放速度
    setSpeed(num, notips, duplicate, skipLock) {
      const player = activePlayer.player();
      if (!skipLock && tuner.lockedPlaybackRate()) {
        console.log("[Tuner] 调速已锁定");
        return false;
      }
      if (taskCenter.doTask("playbackRate")) {
        return;
      }
      if (!player) return;
      const oldSpeed = tuner.getSpeed();
      let curPlaybackRate = oldSpeed;
      if (num) {
        num = Number(num);
        if (Number.isNaN(num)) {
          console.log("[Tuner] 速度转换失败");
          return false;
        }
        if (num <= 0) {
          num = 0.1;
        } else if (num > 16) {
          num = 16;
        }
        num = Number(num.toFixed(1));
        curPlaybackRate = num;
      }
      tuner.playbackRate = curPlaybackRate;
      configManager.persistMedia("media.playbackRate", curPlaybackRate);
      const changed = Boolean(num) || curPlaybackRate !== 1;
      if (tuner.plusSet("playbackRate", curPlaybackRate)) {
        mediaCore.eachOther(player, (api) => api.setPlaybackRate(curPlaybackRate));
      } else {
        tuner.directSet(player, "playbackRate", curPlaybackRate, (native) => ({
          get: function() {
            return curPlaybackRate || native.get.apply(player, arguments);
          },
          set: function(val) {
            if (typeof val !== "number") {
              return false;
            }
            !Number.isInteger(player._blockSetPlaybackRateTips_) && (player._blockSetPlaybackRateTips_ = 0);
            if (taskCenter.doTask("blockSetPlaybackRate")) {
              player._blockSetPlaybackRateTips_++;
              player._blockSetPlaybackRateTips_ < 3 && console.log("[Tuner] 调速任务接管");
              return false;
            }
            if (blocksSet("PlaybackRate")) {
              player._blockSetPlaybackRateTips_++;
              player._blockSetPlaybackRateTips_ < 3 && console.log("[Tuner] 调速开关锁定");
              return false;
            } else {
              tuner.setSpeed(val);
            }
          }
        }));
        player._setPlaybackRate_ = { time: Date.now(), value: curPlaybackRate };
        if (changed && !duplicate && blocksSet("PlaybackRate")) {
          clearTimeout(tuner._setPlaybackRateDuplicate_);
          clearTimeout(tuner._setPlaybackRateDuplicate2_);
          const duplicatePlaybackRate = () => {
            tuner.unlockPlaybackRate();
            tuner.setSpeed(curPlaybackRate, true, true);
            tuner.lockPlaybackRate(1e3);
          };
          tuner._setPlaybackRateDuplicate_ = setTimeout(duplicatePlaybackRate, 600);
          tuner._setPlaybackRateDuplicate2_ = setTimeout(duplicatePlaybackRate, 1200);
        }
      }
      changed && !notips && menu.tips("播放速度：" + player.playbackRate);
      tuner.fixSpeed(oldSpeed);
      return true;
    }
    // 加强版调速：短时间内设同一个值就叠加放大，用于广告快进、片头片尾速看
    boost(num) {
      num = Number(num);
      if (!num) {
        return false;
      }
      tuner.boostInfo = tuner.boostInfo || {};
      tuner.boostInfo[num] = tuner.boostInfo[num] || { time: Date.now() - 1e3, value: num };
      if (Date.now() - tuner.boostInfo[num].time < 300) {
        tuner.boostInfo[num].value = tuner.boostInfo[num].value + num;
      } else {
        tuner.boostInfo[num].value = num;
      }
      tuner.boostInfo[num].time = Date.now();
      return tuner.applyRate(tuner.boostInfo[num].value);
    }
    // 恢复播放速度，还原到1倍速度、或恢复到上次的倍速
    resetSpeed(player) {
      player = player || activePlayer.player();
      tuner.unlockPlaybackRate();
      const oldSpeed = Number(player.playbackRate);
      const playbackRate = oldSpeed === 1 ? tuner.lastPlaybackRate : 1;
      if (oldSpeed !== 1) {
        tuner.lastPlaybackRate = oldSpeed;
        configManager.setLocal("media.lastPlaybackRate", oldSpeed);
      }
      return tuner.applyRate(playbackRate);
    }
    // 把当前设定的倍速重新同步给播放器，并短暂锁定避免被外部逻辑改回去
    resync(notips) {
      return tuner.applyRate(null, notips);
    }
    // 在当前倍速上步进一格，并短暂锁定避免外部调速逻辑干扰
    stepSpeed(delta) {
      const player = activePlayer.player();
      if (!player) return;
      return tuner.applyRate(player.playbackRate + delta);
    }
    // 提升播放速率
    speedUp(num) {
      tuner.stepSpeed(Utils.stepValue(num, 0.1));
    }
    // 降低播放速率
    slowDown(num) {
      tuner.stepSpeed(-Utils.stepValue(num, 0.1));
    }
    // 取当前音量：iframe 里、或站点接管音量时优先用全局层的值，保留两位小数
    getVolume() {
      let volume = configManager.get("media.volume");
      if (Utils.inFrame() || blocksSet("Volume")) {
        const globalVolume = configManager.getGlobal("media.volume");
        if (globalVolume !== null) {
          volume = globalVolume;
        }
      }
      return Number(Number(volume).toFixed(2));
    }
    // 设置声音大小
    setVolume(num, notips, outerCall) {
      const player = activePlayer.player();
      if (tuner.lockedVolume()) {
        return false;
      }
      if (!num && num !== 0) {
        num = tuner.getVolume();
      }
      num = Number(Number(num).toFixed(2));
      if (num < 0) {
        num = 0;
      }
      if (num > 1 && configManager.get("enhance.allowAcousticGain")) {
        num = Math.ceil(num);
        try {
          player._amp_ = player._amp_ || new Amplifier(player);
        } catch (e) {
          num = 1;
          console.log("[Tuner] 响度增益异常", e);
        }
        if (num > 6) {
          num = 6;
        }
        if (!player._amp_ || !player._amp_.setLoudness) {
          num = 1;
        }
      } else if (num > 1) {
        num = 1;
      }
      tuner.volume = num;
      if (num > 1 && player._amp_ && player._amp_.setLoudness) {
        player._amp_.setLoudness(num);
        if (!outerCall) {
          player.muted = false;
        }
        !notips && menu.tips("音量：" + parseInt(String(num * 100)) + "%");
        return true;
      }
      configManager.persistMedia("media.volume", num, blocksSet("Volume"));
      if (tuner.plusSet("volume", num)) {
        mediaCore.eachOther(player, (api) => api.setVolume(num));
      } else {
        tuner.directSet(player, "volume", num, (native) => ({
          get: function() {
            return native.get.apply(player, arguments);
          },
          set: function(val) {
            if (typeof val !== "number" || val < 0) {
              return false;
            }
            if (takenOver("Volume")) {
              return false;
            } else {
              tuner.setVolume(val, false, true);
            }
          }
        }));
      }
      if (!outerCall) {
        player.muted = false;
      }
      !notips && menu.tips("音量：" + parseInt(String(player.volume * 100)) + "%");
    }
    // 在当前音量上步进一格：超过 1 倍的是响度增益值，步进要基于增益值
    stepVolume(delta) {
      const player = activePlayer.player();
      if (!player) return;
      let target = player.volume + delta;
      if (tuner.volume > 1 && player._amp_) {
        target = Number(tuner.volume) + delta;
        if (delta < 0) {
          target = Math.floor(target);
        }
      }
      return tuner.applyProp("volume", target, 500);
    }
    // 提高音量，没给步长就按 20% 走
    volumeUp(num) {
      tuner.stepVolume(Utils.stepValue(num, 0.2));
    }
    // 降低音量，没给步长就按 20% 走
    volumeDown(num) {
      tuner.stepVolume(-Utils.stepValue(num, 0.2));
    }
    // 进度相关状态在实例上的落脚点：没有增强 API 时靠它记下锁定到期时间与最近一次设值
    timeInfo() {
      const player = activePlayer.player();
      if (!player) return null;
      player.timeInfo = player.timeInfo || {};
      return player.timeInfo;
    }
    // 设置播放进度
    setCurrentTime(num) {
      if (!num && num !== 0) return;
      num = Number(num);
      const _num = Math.abs(Number(num.toFixed(1)));
      const player = activePlayer.player();
      if (tuner.lockedCurrentTime()) {
        return false;
      }
      if (taskCenter.doTask("currentTime")) {
        return;
      }
      if (tuner.plusSet("currentTime", _num)) {
        return true;
      }
      tuner.directSet(player, "currentTime", _num, (native) => ({
        enumerable: true,
        get: function() {
          return native.get.apply(player, arguments);
        },
        set: function(val) {
          if (typeof val !== "number" || takenOver("CurrentTime")) {
            return false;
          }
          if (tuner.lockedCurrentTime()) {
            return false;
          }
          player.timeInfo.time = Date.now();
          player.timeInfo.value = val;
          return native.set.apply(player, arguments);
        }
      }));
    }
    // 在当前进度上步进 delta 秒，delta 为负即后退
    seekBy(delta, hideTips) {
      const player = activePlayer.player();
      if (!player) return;
      let target = player.currentTime + delta;
      if (target < 1) {
        target = 0;
      }
      tuner.applyProp("currentTime", target, 500);
      !hideTips && menu.tips((delta > 0 ? "前进：" : "后退：") + Math.abs(delta) + "秒");
    }
    // 前进：任务配置中心接管了就不动，否则按给定秒数或默认步长跳
    seekForward(num, hideTips) {
      if (taskCenter.doTask("addCurrentTime")) {
        return;
      }
      tuner.seekBy(Utils.stepValue(num, tuner.skipStep), hideTips);
    }
    // 后退：任务配置中心接管了就不动，否则按给定秒数或默认步长退
    seekBack(num) {
      if (taskCenter.doTask("subtractCurrentTime")) {
        return;
      }
      tuner.seekBy(-Utils.stepValue(num, tuner.skipStep));
    }
    // 定格帧画面：perFps 为 1 定格到下一帧、-1 到上一帧
    freezeFrame(perFps) {
      perFps = perFps || 1;
      const player = activePlayer.player();
      player.currentTime += Number(perFps / tuner.fps);
      if (!player.paused) player.pause();
      player._hangUp_ && player._hangUp_("play", 400);
      if (perFps === 1) {
        menu.tips("定位：下一帧");
      } else if (perFps === -1) {
        menu.tips("定位：上一帧");
      } else {
        menu.tips("定格帧画面：" + perFps);
      }
    }
    // 切换「自动跟随跳转到缓冲区时间」开关，并提示当前状态
    toggleBuffered() {
      tuner.followBuffer = !tuner.followBuffer;
      menu.tips(tuner.followBuffer ? "自动跟随跳转到缓冲区时间" : "禁用自动跟随跳转到缓冲区时间");
    }
    // 本站是否允许自动恢复播放进度：没写过这一项就算允许
    allowRestore() {
      const allowRestoreVal = configManager.get(restoreKey());
      return allowRestoreVal === null || allowRestoreVal;
    }
    // 切换自动恢复播放进度的状态
    toggleRestore() {
      const allowRestore = Utils.crossSite() ? false : !tuner.allowRestore();
      configManager.set(restoreKey(), allowRestore);
      if (allowRestore) {
        menu.tips("允许自动恢复播放进度");
        tuner.restoreProgress(activePlayer.player());
      } else {
        menu.tips("禁止自动恢复播放进度");
      }
    }
    // 取播放进度（不传 player 就返回整张进度表）
    getProgress(player) {
      const progressMap = configManager.get("media.progress") || {};
      if (!player) {
        return progressMap;
      }
      const keyName = progressKey(player.duration);
      if (!progressMap[keyName] || Number.isNaN(Number(player.duration)) || Number(progressMap[keyName].duration) !== Number(player.duration)) {
        return player.currentTime;
      }
      return progressMap[keyName].progress;
    }
    // 进度表超限就按记录时间淘汰最早的那一批（并列一起淘汰，与原实现一致）
    trimProgress(progressMap) {
      const keys = Object.keys(progressMap);
      if (keys.length <= 10) {
        return progressMap;
      }
      const oldest = Math.min(...keys.map((k) => (progressMap[k] || {}).t).filter(Boolean));
      keys.forEach((k) => {
        if (progressMap[k] && progressMap[k].t === oldest) {
          delete progressMap[k];
        }
      });
      return progressMap;
    }
    // 播放进度记录器
    recordProgress(player) {
      clearTimeout(player._playProgressTimer_);
      function recorder(player2) {
        player2._playProgressTimer_ = setTimeout(function() {
          const isToShort = !player2.duration || Number.isNaN(Number(player2.duration)) || player2.duration < 120;
          const isLeave = document.visibilityState !== "visible" && player2.paused;
          if (!tuner.allowRestore() || isToShort || isLeave) {
            recorder(player2);
            return true;
          }
          const progressMap = tuner.getProgress();
          const keyName = progressKey(player2.duration);
          if (!progressMap[keyName]) {
            tuner._firstProgressRecord_ = keyName;
            tuner._hasRestorePlayProgress_ = keyName;
          }
          tuner.trimProgress(progressMap);
          progressMap[keyName] = { progress: player2.currentTime, duration: player2.duration, t: (/* @__PURE__ */ new Date()).getTime() };
          configManager.setLocal("media.progress", progressMap);
          recorder(player2);
        }, 1e3 * 2);
      }
      recorder(player);
    }
    // 设置播放进度
    restoreProgress(player) {
      if (!player || !player.duration || Number.isNaN(player.duration)) return;
      const curTime = Number(tuner.getProgress(player));
      if (!curTime || Number.isNaN(curTime) || curTime < 10 || curTime >= player.duration) return;
      if (Math.abs(curTime - player.currentTime) < 2) {
        return false;
      }
      const keyName = progressKey(player.duration);
      tuner._hasRestorePlayProgress_ = tuner._hasRestorePlayProgress_ || "";
      if (tuner._hasRestorePlayProgress_ === keyName || tuner._firstProgressRecord_ === keyName) {
        if (tuner._hasRestorePlayProgress_ === keyName) {
          tuner._firstProgressRecord_ = "";
        }
        return false;
      }
      if (tuner.allowRestore()) {
        player.currentTime = curTime - 1.5;
        tuner._hasRestorePlayProgress_ = keyName;
        menu.tips("为你恢复上次播放进度");
      } else {
        menu.tips("恢复播放进度功能已禁用，可通过菜单或 SHIFT+R 开启该功能");
      }
    }
  };
  var tuner = null;
  var createTuner = () => {
    tuner = new TunerControl();
    return tuner;
  };
  Object.keys(mediaProps).forEach((prop) => {
    const api = Utils.firstUpper(prop);
    TunerControl.prototype["lock" + api] = (timeout = 200) => tuner.lock(prop, timeout);
    TunerControl.prototype["unlock" + api] = () => tuner.unlock(prop);
    TunerControl.prototype["locked" + api] = () => tuner.locked(prop);
  });

  // Player.ts
  var PlayerControl = class _PlayerControl {
    enhancer;
    playerInstance;
    intersectionObserver;
    exitTime;
    autoPlayed;
    constructor() {
      this.enhancer = null;
      this.playerInstance = null;
      this.intersectionObserver = new IntersectionObserver((entries) => activePlayer.onIntersect(entries), { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
      this.exitTime = null;
      this.autoPlayed = false;
    }
    // 获取当前播放器的实例
    player() {
      if (!activePlayer.playerInstance) {
        const mediaList = activePlayer.listPlayers();
        if (mediaList.length) {
          activePlayer.takeInstance(mediaList[mediaList.length - 1]);
        }
      }
      const playerInstance = activePlayer.playerInstance;
      if (playerInstance && !activePlayer.enhancer) {
        activePlayer.enhancer = mediaCore.mediaPlus(playerInstance);
      }
      return playerInstance;
    }
    // 当前认领的实例是不是音频元素
    isAudioInstance() {
      return Utils.isAudio(activePlayer.player());
    }
    // 每个网页可能存在的多个video播放器
    listPlayers() {
      const list = mediaCore.mediaElementList;
      function findPlayer(context) {
        supportMediaTags.forEach((tagName) => {
          context.querySelectorAll(tagName).forEach(function(player) {
            if (player.tagName.toLowerCase() === "bwp-video") {
              player.HTMLVideoElement = true;
            }
            if (Utils.isMedia(player) && !list.includes(player)) {
              list.push(player);
            }
          });
        });
      }
      findPlayer(document);
      if (window._shadowDomList_) {
        window._shadowDomList_.forEach(function(shadowRoot) {
          findPlayer(shadowRoot);
        });
      }
      return list;
    }
    // 沿父链找与播放器等宽等高的包裹节点，找不到返回 null
    getWrap() {
      const player = activePlayer.player();
      if (!player) return;
      let wrapDom = null;
      const playerBox = player.getBoundingClientRect();
      Utils.eachParent(player, function(parent) {
        if (parent === document || !parent.getBoundingClientRect) return;
        const parentBox = parent.getBoundingClientRect();
        if (parentBox.width && parentBox.height && parentBox.width === playerBox.width && parentBox.height === playerBox.height) {
          wrapDom = parent;
        }
      });
      return wrapDom;
    }
    // 初始化播放器实例：每次认领都重做的同步在门外，事件监听与全屏对象由一面旗管住，同一元素只装一次
    initInstance() {
      const player = activePlayer.playerInstance;
      if (!player) return;
      activePlayer.enhancer = mediaCore.mediaPlus(player);
      tuner.playbackRate = tuner.getSpeed();
      input.isFocus();
      activePlayer.proxyPlay(player);
      tuner.resync();
      input.mountRunner();
      if (taskCenter.siteConf().init) {
        taskCenter.doTask("init", player);
      }
      activePlayer.once(player, "__wired__", () => {
        player._fullScreen_ = new FullScreen(player);
        player._fullPageScreen_ = new FullScreen(player, true);
        player.addEventListener("canplay", () => activePlayer.autoPlay(player));
        let setPlaybackRateOnPlayingCount = 0;
        player.addEventListener("playing", function(event) {
          tuner.resync(setPlaybackRateOnPlayingCount > 0);
          if (blocksSet("Volume") && event.target.muted === false) {
            tuner.setVolume(configManager.getGlobal("media.volume"), true);
          }
          if (blocksSet("CurrentTime")) {
            tuner.lockCurrentTime();
          }
          tuner.restoreProgress(player);
          if (setPlaybackRateOnPlayingCount++ === 0) {
            setTimeout(() => {
              tuner.recordProgress(player);
            }, 2e3);
          }
        });
        ["enterpictureinpicture", "leavepictureinpicture"].forEach((name) => {
          player.addEventListener(name, () => {
            const usePictureInPicture = name === "enterpictureinpicture";
            if (!usePictureInPicture) {
              activePlayer.exitTime = Date.now();
            }
            pageBridge.send(pictureKey, { usePictureInPicture });
            console.log("[Player] 画中画切换", name, player);
          });
        });
        function srcRecord(player2) {
          const src = player2.currentSrc || player2.src;
          if (!src) {
            return;
          }
          player2.srcList = player2.srcList || [src];
          if (!player2.srcList.includes(src)) {
            player2.srcList.push(src);
          }
        }
        function updateBufferedTime(player2) {
          if (player2.buffered.length > 0) {
            const bufferedTime = player2.buffered.end(player2.buffered.length - 1);
            player2.bufferedTime = bufferedTime;
          }
          if (tuner.followBuffer && player2.bufferedTime && activePlayer.player() === player2 && player2.bufferedTime < player2.duration - 1 && player2.currentTime < player2.bufferedTime - 1) {
            tuner.setCurrentTime(player2.bufferedTime);
          }
        }
        const srcLogArgs = { loadeddata: () => [`${player.src} video duration: ${player.duration} video dom:`, player], durationchange: () => [`${player.duration}`], loadstart: () => [player.currentSrc, player.src] };
        Object.keys(srcLogArgs).forEach((name) => {
          player.addEventListener(name, () => {
            console.log("[Player] 媒体事件", name, ...srcLogArgs[name]());
            srcRecord(player);
          });
        });
        let lastCleanMediaSourceDataTime = Date.now();
        const syncMediaSource = () => {
          mediaSource.bindElement(player);
        };
        player.addEventListener("timeupdate", () => {
          srcRecord(player);
          syncMediaSource();
        });
        player.addEventListener("progress", () => {
          updateBufferedTime(player);
          syncMediaSource();
          if (Date.now() - lastCleanMediaSourceDataTime > 1e3 * 10) {
            lastCleanMediaSourceDataTime = Date.now();
            mediaSource.prune();
          }
        });
      });
    }
    // 同一个实例上同一件事只做一次：标记位写在实例上，做过直接跳过
    once(player, flag, action) {
      if (player[flag]) {
        return false;
      }
      player[flag] = true;
      action();
      return true;
    }
    // 「同一类监听只装一次」的常用写法
    onceOn(player, flag, event, handler) {
      return activePlayer.once(player, flag, () => player.addEventListener(event, handler));
    }
    // 刚关闭画中画不久，此段时间内允许跨TAB控制
    justExited() {
      return activePlayer.exitTime && Date.now() - activePlayer.exitTime < 1e3 * 10;
    }
    // 对播放器实例的 play/pause 做代理，顺带实现 _hangUp_ 挂起
    proxyPlay(player) {
      if (!player) return;
      ["play", "pause"].forEach((key) => {
        const originKey = "origin_" + key;
        if (Reflect.has(player, key) && !Reflect.has(player, originKey)) {
          player[originKey] = player[key];
          const proxy = new original.Proxy(player[key], {
            // play / pause 的代理：命中挂起窗口就拦掉这次调用，其余照原样转给实例
            apply(target, ctx, args) {
              const hangUpDetail = (player._hangUpInfo_ || {})[key];
              if (hangUpDetail && hangUpDetail.timeout >= Date.now()) {
                console.log("[Player] 调用挂起", key);
                return false;
              }
              return target.apply(ctx || player, args);
            }
          });
          player[key] = proxy;
        }
      });
      if (!player._hangUp_) {
        player._hangUpInfo_ = {};
        player._hangUp_ = function(name, timeout) {
          timeout = Number(timeout) || 200;
          player._hangUpInfo_[name] = { timeout: Date.now() + timeout };
        };
        player._unHangUp_ = function(name) {
          if (player._hangUpInfo_ && player._hangUpInfo_[name]) {
            player._hangUpInfo_[name].timeout = Date.now() - 1;
          }
        };
      }
    }
    // 把当前实例、换源历史与运行环境打到调试日志
    printInfo(p) {
      const player = p || activePlayer.player();
      const info = { curPlayer: player, srcList: player.srcList, mediaSource, window };
      console.log("[Player] 实例信息", info);
    }
    // 认下当前实例：换实例就得把它重新接一遍线
    takeInstance(el) {
      activePlayer.playerInstance = el;
      activePlayer.initInstance();
    }
    // 视口观察回调：一轮 entries 里只认「可见比例最大且超过 0.4」的那个元素
    onIntersect(entries) {
      let tmpIntersectionRatio = 0;
      entries.forEach((entrie) => {
        entrie.target._intersectionInfo_ = entrie;
        if (entrie.intersectionRatio > tmpIntersectionRatio && entrie.intersectionRatio > 0.4) {
          tmpIntersectionRatio = entrie.intersectionRatio;
          const oldPlayer = activePlayer.player();
          if (oldPlayer && oldPlayer._intersectionInfo_ && tmpIntersectionRatio < oldPlayer._intersectionInfo_.intersectionRatio) {
            return;
          }
          const toggleResult = activePlayer.claim(entrie.target);
          toggleResult && console.log("[Player] 实例切换", entrie);
        }
      });
    }
    // 判定要不要把这个元素认领为当前实例：视频看尺寸够不够大，音频只在原本就是音频、或原实例已脱离文档时才换
    claim(el) {
      if (!el || !el.getBoundingClientRect) {
        return false;
      }
      if (activePlayer.player() === el) {
        return false;
      }
      if (!activePlayer.playerInstance && Utils.isMedia(el)) {
        activePlayer.takeInstance(el);
        return true;
      }
      if (Utils.isVideo(el)) {
        const container = menu.tipsHost(el);
        const elInfo = el.getBoundingClientRect();
        const parentElInfo = container && container.getBoundingClientRect();
        if (elInfo && elInfo.width > 200 && parentElInfo && parentElInfo.width > 200) {
          activePlayer.takeInstance(el);
        }
      } else if (Utils.isAudio(el)) {
        const cur = activePlayer.playerInstance;
        if (Utils.isAudio(cur) || Utils.isVideo(cur) && !cur.isConnected) {
          activePlayer.takeInstance(el);
        }
      }
    }
    // 检出页面上可接管的播放器实例
    detectPlayer() {
      const playerList = activePlayer.listPlayers();
      if (playerList.length) {
        if (playerList.length === 1) {
          activePlayer.takeInstance(playerList[0]);
        }
        playerList.forEach(function(player) {
          activePlayer.onceOn(player, "_hasMouseRedirectEvent_", "mouseenter", (event) => activePlayer.claim(event.target));
          activePlayer.onceOn(player, "_hasPlayingRedirectEvent_", "playing", (event) => {
            const media = event.target;
            if (media.duration && media.duration < 8) {
              return false;
            }
            activePlayer.claim(media);
          });
          activePlayer.once(player, "_hasIntersectionObserver_", () => activePlayer.intersectionObserver.observe(player));
        });
        if (Utils.crossSite()) {
          const curPlayer = activePlayer.playerInstance;
          if (curPlayer) {
            pageBridge.send("videoDetected", { src: curPlayer.src });
          }
        }
      }
    }
    // 自动播放：只有站点任务表配了 autoPlay 才走，按钮未就绪时轮询重试
    autoPlay(p) {
      const player = p || activePlayer.player();
      const taskConf2 = taskCenter.siteConf();
      if (taskConf2.autoPlay && configManager.getLocal("media.autoPlay") === null) {
        configManager.setLocal("media.autoPlay", true);
      }
      if (!configManager.get("media.autoPlay") || !p && activePlayer.autoPlayed || !player || p && p !== activePlayer.player() || document.hidden) {
        return false;
      }
      if (!Utils.inView(player) || Utils.inFrame()) {
        return false;
      }
      if (!taskConf2.autoPlay) {
        return false;
      }
      activePlayer.autoPlayed = true;
      if (!player.paused) {
        return;
      }
      taskCenter.doTask("autoPlay");
      if (!player.paused) {
        return;
      }
      player._initAutoPlayCount_ = (player._initAutoPlayCount_ || 0) + 1;
      if (player._initAutoPlayCount_ >= 10) {
        return false;
      }
      setTimeout(function() {
        activePlayer.autoPlay(player);
      }, 200);
    }
    // 全屏与网页全屏只差一个站点任务和一种包裹实例，其余逻辑同构
    toggleScreen(task, screenKey) {
      const player = activePlayer.player();
      if (!taskCenter.doTask(task) && player && player[screenKey]) {
        player[screenKey].toggle();
      }
    }
    // 设置视频全屏
    maximize() {
      return activePlayer.toggleScreen("fullScreen", "_fullScreen_");
    }
    // 设置页面全屏
    webMaximize() {
      return activePlayer.toggleScreen("webFullScreen", "_fullPageScreen_");
    }
    // 切换画中画
    togglePicture() {
      const player = activePlayer.player();
      const exiting = window._isPictureInPicture_ && document.pictureInPictureElement;
      const task = exiting ? document.exitPictureInPicture() : player && player.requestPictureInPicture && player.requestPictureInPicture();
      if (!task) {
        return;
      }
      const settle = (state) => () => {
        window._isPictureInPicture_ = state;
      };
      const failed = (e) => {
        window._isPictureInPicture_ = null;
        console.log("[Player] 画中画切换异常", e);
      };
      task.then(settle(exiting ? null : true)).catch(failed);
    }
    // 播放下一个视频，默认是没有这个功能的，只有在任务中心里配置了next字段才会有该功能
    nextVideo() {
      const isDo = taskCenter.doTask("next");
      if (!isDo) {
        console.log("[Player] 下一集不支持");
      }
    }
    // 切换播放状态
    switchPlay() {
      const player = activePlayer.player();
      if (taskCenter.doTask("switchPlay")) {
        return;
      }
      const isPlay = player.paused;
      const action = isPlay ? "play" : "pause";
      const other = isPlay ? "pause" : "play";
      const api = activePlayer.enhancer;
      if (!taskCenter.doTask(action)) {
        if (api && api.applyPlay && api.applyPause) {
          isPlay ? api.lockPause(400) : api.lockPlay(400);
          Utils.swallow(isPlay ? api.applyPlay() : api.applyPause(), "切换播放状态");
        } else {
          if (player._hangUp_) {
            player._hangUp_(other, 400);
            player._unHangUp_(action);
          }
          Utils.swallow(isPlay ? player.play() : player.pause(), "切换播放状态");
        }
        menu.tips(isPlay ? "播放" : "暂停");
      }
      taskCenter.doTask(isPlay ? "afterPlay" : "afterPause");
    }
    // 菜单里的下载入口：没开实验性功能就直接开启并重载
    mediaDownload() {
      if (!configManager.get("enhance.allowExperimentFeatures")) {
        applyReload(() => configSave("global", "enhance.allowExperimentFeatures", true));
        return;
      }
      console.log("[Player] 流下载启用");
      _PlayerControl.downloadMedia(activePlayer.player());
    }
    // 截图入口：抓不到画面就提示；后台页里先冻帧再截
    capture() {
      const player = activePlayer.player();
      const canvas = activePlayer.grabCanvas(player, true);
      if (!canvas) {
        menu.tips("当前没有可截取的画面，请稍后再试");
        return;
      }
      if (!player.paused && !document.pictureInPictureElement && document.visibilityState !== "visible") {
        tuner.freezeFrame();
      }
    }
    // 把截图写进剪贴板：无权限、没有用户手势、剪贴板API不可用都是正常情况，不该变成未捕获拒绝
    static async setClipboard(blob) {
      try {
        if (!navigator.clipboard) {
          console.log("[Player] 剪贴板不可用", "https://developer.mozilla.org/en-US/docs/Web/API/Clipboard");
          return false;
        }
        await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
        console.log("[Player] 剪贴板写入成功", blob.type);
        return true;
      } catch (e) {
        console.log("[Player] 剪贴板写入失败", blob && blob.type, e);
        return false;
      }
    }
    // 截图：把当前帧画进 canvas，download 为真则落盘，否则开预览页
    grabCanvas(video, download, title) {
      if (!video) return false;
      const currentTime = `${Math.floor(video.currentTime / 60)}'${(video.currentTime % 60).toFixed(3)}''`;
      const captureTitle = title || `${document.title}_${currentTime}`;
      video.setAttribute("crossorigin", "anonymous");
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      if (!canvas.width || !canvas.height) {
        console.log("[Player] 截图画面缺失");
        return false;
      }
      const context = canvas.getContext("2d");
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      if (download) {
        activePlayer.saveCanvas(canvas, captureTitle, video);
      } else {
        activePlayer.previe(canvas, captureTitle);
      }
      return canvas;
    }
    // 预览截图
    previe(canvas, title) {
      canvas.style = "max-width:100%";
      const previewPage = window.open("", "_blank");
      previewPage.document.title = `capture previe - ${title || "Untitled"}`;
      previewPage.document.body.style.textAlign = "center";
      previewPage.document.body.style.background = "#000";
      previewPage.document.body.appendChild(canvas);
    }
    // canvas 下载截图：先复制到剪贴板再下载，避免下载导致页面失焦
    saveCanvas(canvas, title, video) {
      title = title || "videoCapturer_" + Date.now();
      function isUsable(blob, action) {
        if (blob) return true;
        console.log("[Player] 画布导出失败", action, video);
        return false;
      }
      try {
        canvas.toBlob(function(blob) {
          if (!isUsable(blob, "复制到剪贴板")) {
            return;
          }
          _PlayerControl.setClipboard(blob);
        }, "image/png", 0.99);
      } catch (e) {
        console.log("[Player] 剪贴板复制失败", e);
      }
      try {
        canvas.toBlob(function(blob) {
          if (!isUsable(blob, "下载截图")) {
            return activePlayer.previe(canvas, title);
          }
          const el = document.createElement("a");
          el.download = `${title}.jpg`;
          el.href = URL.createObjectURL(blob);
          el.click();
        }, "image/jpeg", 0.99);
      } catch (e) {
        activePlayer.previe(canvas, title);
        console.log("[Player] 截图下载受限", video, e, "https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS");
      }
    }
    // 造一个 a 标签触发浏览器下载
    static saveFile(url, title) {
      const downloadEl = document.createElement("a");
      downloadEl.href = url;
      downloadEl.target = "_blank";
      downloadEl.download = title;
      downloadEl.click();
    }
    // 下载媒体：blob 与短视频走 fetch 再落盘，长视频直接交回浏览器；重复下载按状态逐级确认
    static downloadMedia(mediaEl, title, downloadType) {
      const mediaUrl = mediaEl.src || mediaEl.currentSrc;
      const mediaState = downloadState.get(mediaUrl) || {};
      if (mediaUrl && !mediaUrl.startsWith("blob:")) {
        const isVideo = mediaEl instanceof HTMLVideoElement;
        const mediaInfo = { type: isVideo ? "video" : "audio", format: isVideo ? "mp4" : "mp3" };
        let mediaTitle = `${title || mediaEl.getAttribute("data-title") || document.title || Date.now()}_${mediaInfo.type}.${mediaInfo.format}`;
        if (downloadType === "blob" || mediaEl.duration < 60 * 5) {
          if (mediaState.downloading && Date.now() - mediaState.downloading < 1e3 * 1) {
            return false;
          }
          if (!mediaTitle.endsWith(mediaInfo.format)) {
            mediaTitle = mediaTitle + "." + mediaInfo.format;
          }
          let fetchUrl = mediaUrl;
          if (mediaUrl.startsWith("http://") && location.href.startsWith("https://")) {
            fetchUrl = mediaUrl.replace("http://", "https://");
          }
          const mark = (patch) => {
            Object.assign(mediaState, patch);
            downloadState.set(mediaUrl, mediaState);
          };
          mark({ downloading: Date.now() });
          fetch(fetchUrl).then((res) => res.blob()).then((blob) => {
            const blobUrl = window.URL.createObjectURL(blob);
            activePlayer.saveFile(blobUrl, mediaTitle);
            mark({ downloading: void 0, hasDownload: true });
            window.URL.revokeObjectURL(blobUrl);
          }).catch((err) => {
            console.log("[Player] fetch下载失败", err);
            activePlayer.saveFile(mediaUrl, mediaTitle);
            mark({ downloading: void 0, hasDownload: true });
          });
        } else {
          activePlayer.saveFile(mediaUrl, mediaTitle);
        }
      } else if (mediaSource.hasInit()) {
        mediaSource.downloadStream(mediaEl, title);
      } else {
        console.log("[Player] 下载通道缺失", mediaEl);
      }
    }
  };
  var activePlayer = null;
  var createPlayer = () => {
    activePlayer = new PlayerControl();
    return activePlayer;
  };
  var fullScreenInstances = [];
  var fullPageStyleInjected = false;
  window.addEventListener("keyup", (event) => {
    if (event.key && event.key.toLowerCase() === "escape") {
      fullScreenInstances.forEach((inst) => inst.onEscape());
    }
  }, true);
  var FullScreen = class {
    dom;
    shadowRoot;
    fullStatus;
    pageMode;
    _container_;
    constructor(dom, pageMode) {
      this.dom = dom;
      this.shadowRoot = null;
      this.fullStatus = false;
      this.pageMode = pageMode || false;
      const fullPageStyle = `
      ._webfullscreen_box_size_ {
				width: 100% !important;
				height: 100% !important;
			}
      ._webfullscreen_ {
        display: block !important;
				position: fixed !important;
				width: 100% !important;
				height: 100% !important;
				top: 0 !important;
				left: 0 !important;
				background: #000 !important;
				z-index: 999999 !important;
			}
			._webfullscreen_zindex_ {
				z-index: 999999 !important;
			}
		`;
      if (!fullPageStyleInjected && window.GM_addStyle) {
        window.GM_addStyle(fullPageStyle);
        fullPageStyleInjected = true;
      }
      const shadowRoot = Utils.inShadow(dom, true);
      if (shadowRoot) {
        this.shadowRoot = shadowRoot;
        Utils.addStyle(fullPageStyle, "fullPageStyle", shadowRoot);
      }
      fullScreenInstances.push(this);
      this.getContainer();
    }
    // 按 Esc：先退页面全屏，再退浏览器原生全屏，与原实现每个实例各自的判断一致
    onEscape() {
      if (this.isFull()) {
        this.exit();
      } else if (this.isFullScreen()) {
        this.exitFullScreen();
      }
    }
    // 沿父链找包裹容器：第一个比画面小的父节点就是它，标记后缓存下来
    getContainer() {
      if (this._container_) return this._container_;
      const d = this.dom;
      const domBox = d.getBoundingClientRect();
      let container = d;
      Utils.eachParent(d, (parentNode) => {
        const noParentNode = !parentNode || !parentNode.getBoundingClientRect;
        if (noParentNode || parentNode.getAttribute("data-fullscreen-container")) {
          container = parentNode;
          return true;
        }
        const parentBox = parentNode.getBoundingClientRect();
        const isInsideTheBox = parentBox.width <= domBox.width && parentBox.height <= domBox.height;
        if (isInsideTheBox) {
          container = parentNode;
        } else {
          return true;
        }
      }, true);
      container.setAttribute("data-fullscreen-container", "true");
      this._container_ = container;
      return container;
    }
    // 当前是否处于「网页全屏」——脚本自己铺的样式，或本实例的状态位
    isFull() {
      return this.dom.classList.contains("_webfullscreen_") || this.fullStatus;
    }
    // 浏览器原生全屏是否生效（跨前缀各查一遍）
    isFullScreen() {
      return !!(document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen || document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement);
    }
    // 在包裹容器上请求浏览器原生全屏，跨前缀挑一个可用方法
    enterFullScreen() {
      const container = this.getContainer();
      const enterFn = container.requestFullscreen || container.webkitRequestFullScreen || container.mozRequestFullScreen || container.msRequestFullScreen;
      Utils.swallow(enterFn && enterFn.call(container), "进入全屏");
    }
    // 进入网页全屏：沿父链铺全屏样式、容器那层起提层级；页面模式不碰原生全屏
    enter() {
      if (this.isFull()) return;
      const container = this.getContainer();
      let needSetIndex = this.dom === container;
      const addFullscreenStyleToParentNode = (node) => Utils.eachParent(node, (parentNode) => {
        parentNode.classList.add("_webfullscreen_");
        if (container === parentNode || needSetIndex) {
          needSetIndex = true;
          parentNode.classList.add("_webfullscreen_zindex_");
        }
      }, true);
      addFullscreenStyleToParentNode(this.dom);
      if (this.dom.parentNode) {
        const domBox = this.dom.getBoundingClientRect();
        const domParentBox = this.dom.parentNode.getBoundingClientRect();
        if (domParentBox.width - domBox.width >= 5) {
          this.dom.classList.add("_webfullscreen_");
        }
        if (this.shadowRoot && this.shadowRoot._shadowHost) {
          const shadowHost = this.shadowRoot._shadowHost;
          const shadowHostBox = shadowHost.getBoundingClientRect();
          if (shadowHostBox.width <= domBox.width) {
            shadowHost.classList.add("_webfullscreen_");
            addFullscreenStyleToParentNode(shadowHost);
          }
        }
      }
      if (!this.pageMode) {
        this.enterFullScreen();
      }
      this.fullStatus = true;
    }
    // 退出浏览器原生全屏，跨前缀挑一个可用方法
    exitFullScreen() {
      const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
      Utils.swallow(exitFn && exitFn.call(document), "退出全屏");
    }
    // 退出网页全屏：摘掉沿父链铺的样式与层级；页面模式只在原生全屏生效时才退
    exit() {
      const removeFullscreenStyleToParentNode = (node) => Utils.eachParent(node, (parentNode) => {
        parentNode.classList.remove("_webfullscreen_");
        parentNode.classList.remove("_webfullscreen_zindex_");
      }, true);
      removeFullscreenStyleToParentNode(this.dom);
      this.dom.classList.remove("_webfullscreen_");
      if (this.shadowRoot && this.shadowRoot._shadowHost) {
        const shadowHost = this.shadowRoot._shadowHost;
        shadowHost.classList.remove("_webfullscreen_");
        removeFullscreenStyleToParentNode(shadowHost);
      }
      if (!this.pageMode || this.isFullScreen()) {
        this.exitFullScreen();
      }
      this.fullStatus = false;
    }
    // 按当前状态在进 / 退之间翻转
    toggle() {
      this.isFull() ? this.exit() : this.enter();
    }
  };

  // Task.ts
  var taskScratch = {};
  var allowCross = () => {
    activePlayer.player().setAttribute("crossOrigin", "anonymous");
  };
  var xgplayerTask = { fullScreen: ".xgplayer-fullscreen", webFullScreen: ".xgplayer-page-full-screen", next: [".xgplayer-playswitch-next"] };
  var escapeTask = (body) => ({ register: ["escape"], callback: (taskConf2, data) => {
    const { event } = data;
    if (event.keyCode === 27) {
      body(taskConf2, data);
    }
  } });
  var watermarkTask = (...selectors) => () => {
    selectors.forEach((sel) => setTimeout(() => {
      const dom = document.querySelector(sel);
      if (dom) {
        dom.style.opacity = 0;
      }
    }, 1e3 * 5));
  };
  var facebookTask = () => {
    const actionBtn = activePlayer.player().parentNode.querySelectorAll("button");
    if (actionBtn && actionBtn.length > 3) {
      actionBtn[actionBtn.length - 2].click();
      return true;
    }
  };
  var douyuScreen = (flag, enter, exit) => () => {
    const player = activePlayer.player();
    const container = player._fullScreen_.getContainer();
    container.querySelector(`div[title="${player[flag] ? exit : enter}"]`).click();
    player[flag] = !player[flag];
    return true;
  };
  var hoverTitle = (wrapSelector, delay, readTitle) => (taskConf2) => {
    const player = activePlayer.player();
    const wrapEl = player && player.closest(wrapSelector);
    if (!wrapEl) return;
    const run = () => {
      if (wrapEl.getAttribute("data-title")) {
        return;
      }
      if (readTitle(player, wrapEl)) {
        wrapEl.removeEventListener("mouseover", run);
      }
    };
    wrapEl.addEventListener("mouseover", run);
    setTimeout(run, delay);
  };
  var douyinTitle = hoverTitle('div[data-e2e="feed-item"]', 1200, (player, wrapEl) => {
    const videoInfo = wrapEl.querySelector(".video-info-detail");
    if (!videoInfo) {
      return false;
    }
    const accountName = videoInfo.querySelector(".account-name").innerText.replace(/^@*/, "");
    const titleText = videoInfo.querySelector(".title").innerText.trim();
    document.title = Utils.setTitle(player, wrapEl, `${titleText} - ${accountName}`);
    return true;
  });
  var taskConf = {
    "youtube.com": {
      init: function(taskConf2) {
        if (taskScratch.hasBindSkipAdEvents) {
          return;
        }
        const startTime = (/* @__PURE__ */ new Date()).getTime();
        let skipCount = 0;
        const skipHandler = (element) => {
          const endTime = (/* @__PURE__ */ new Date()).getTime();
          const time = endTime - startTime;
          if (time < 3e3) {
            return false;
          }
          if (document.hidden) {
            return false;
          }
          element.click();
          skipCount++;
          console.log("[Task] 广告跳过", skipCount);
        };
        Utils.ready(".ytp-ad-skip-button", function(element) {
          skipHandler(element);
        });
        Utils.ready(".ytp-ad-skip-button-modern", function(element) {
          skipHandler(element);
        });
        setInterval(function() {
          const adSkipBtn = document.querySelector(".ytp-ad-skip-button");
          const adSkipBtnModern = document.querySelector(".ytp-ad-skip-button-modern");
          adSkipBtn && skipHandler(adSkipBtn);
          adSkipBtnModern && skipHandler(adSkipBtnModern);
        }, 1e3);
        taskScratch.hasBindSkipAdEvents = true;
      },
      webFullScreen: "button.ytp-size-button",
      fullScreen: "button.ytp-fullscreen-button",
      next: ".ytp-next-button",
      afterPlay: function(taskConf2) {
        setTimeout(() => {
          tuner.seekForward(0.01, true);
        }, 0);
        const player = activePlayer.player();
        const playerwWrap = player.closest(".html5-video-player");
        if (!playerwWrap) {
          return;
        }
        playerwWrap.classList.add("ytp-autohide", "playing-mode");
        clearTimeout(playerwWrap.autohideTimer);
        playerwWrap.autohideTimer = setTimeout(() => {
          playerwWrap.classList.add("ytp-autohide", "playing-mode");
        }, 1e3);
        if (!playerwWrap.hasBindCustomEvents) {
          const mousemoveHander = (event) => {
            playerwWrap.classList.remove("ytp-autohide", "ytp-hide-info-bar");
            clearTimeout(playerwWrap.mousemoveTimer);
            playerwWrap.mousemoveTimer = setTimeout(() => {
              if (!player.paused) {
                playerwWrap.classList.add("ytp-autohide", "ytp-hide-info-bar");
              }
            }, 1e3 * 2);
          };
          const clickHander = (event) => {
            activePlayer.switchPlay();
            mousemoveHander();
          };
          player.addEventListener("mousemove", mousemoveHander);
          player.addEventListener("click", clickHander);
          playerwWrap.hasBindCustomEvents = true;
        }
        const spinner = playerwWrap.querySelector(".ytp-spinner");
        if (spinner) {
          const hiddenSpinner = () => {
            spinner && (spinner.style.visibility = "hidden");
          };
          const visibleSpinner = () => {
            spinner && (spinner.style.visibility = "visible");
          };
          hiddenSpinner();
          clearTimeout(playerwWrap.spinnerTimer);
          playerwWrap.spinnerTimer = setTimeout(() => {
            spinner.style.display = "none";
            visibleSpinner();
          }, 1e3);
        }
      },
      afterPause: function(taskConf2) {
        const player = activePlayer.player();
        const playerwWrap = player.closest(".html5-video-player");
        if (!playerwWrap) return;
        playerwWrap.classList.remove("ytp-autohide", "playing-mode");
        playerwWrap.classList.add("paused-mode");
        clearTimeout(playerwWrap.autohideTimer);
      },
      // 按 Esc 取消播放下一个推荐的视频
      shortcuts: escapeTask(() => {
        if (document.querySelector(".ytp-upnext").style.display !== "none") {
          document.querySelector(".ytp-upnext-cancel-button").click();
        }
      })
    },
    "netflix.com": {
      fullScreen: "button.button-nfplayerFullscreen",
      addCurrentTime: "button.button-nfplayerFastForward",
      subtractCurrentTime: "button.button-nfplayerBackTen",
      // 使用netflix自身的调速，因为目前插件没法解决调速导致的服务中断问题
      playbackRate: true,
      shortcuts: { register: ["f"], callback: function(taskConf2, data) {
        return true;
      } }
    },
    "bilibili.com": {
      fullScreen: function() {
        const fullScreen = Utils.q(".bpx-player-ctrl-full") || Utils.q(".squirtle-video-fullscreen") || Utils.q(".bilibili-player-video-btn-fullscreen");
        if (fullScreen) {
          fullScreen.click();
          return true;
        }
      },
      webFullScreen: function() {
        const oldWebFullscreen = Utils.q(".bilibili-player-video-web-fullscreen");
        const webFullscreenEnter = Utils.q(".bpx-player-ctrl-web-enter") || Utils.q(".squirtle-pagefullscreen-inactive");
        const webFullscreenLeave = Utils.q(".bpx-player-ctrl-web-leave") || Utils.q(".squirtle-pagefullscreen-active");
        if (oldWebFullscreen || webFullscreenEnter && webFullscreenLeave) {
          const webFullscreen = oldWebFullscreen || (getComputedStyle(webFullscreenLeave).display === "none" ? webFullscreenEnter : webFullscreenLeave);
          webFullscreen.click();
          setTimeout(function() {
            const danmaku = Utils.q(".bpx-player-dm-input") || Utils.q(".bilibili-player-video-danmaku-input");
            danmaku && danmaku.blur();
          }, 1e3 * 0.1);
          return true;
        }
      },
      autoPlay: [".bpx-player-ctrl-play", ".squirtle-video-start", ".bilibili-player-video-btn-start"],
      switchPlay: [".bpx-player-ctrl-play", ".squirtle-video-start", ".bilibili-player-video-btn-start"],
      next: [".bpx-player-ctrl-next", ".squirtle-video-next", ".bilibili-player-video-btn-next", '.bpx-player-ctrl-btn[aria-label="下一个"]'],
      // 按 Esc 退出网页全屏
      shortcuts: escapeTask(() => {
        const oldWebFullscreen = Utils.q(".bilibili-player-video-web-fullscreen");
        if (oldWebFullscreen && oldWebFullscreen.classList.contains("closed")) {
          oldWebFullscreen.click();
        } else {
          const webFullscreenLeave = Utils.q(".bpx-player-ctrl-web-leave") || Utils.q(".squirtle-pagefullscreen-active");
          if (webFullscreenLeave && getComputedStyle(webFullscreenLeave).display !== "none") {
            webFullscreenLeave.click();
          }
        }
      })
    },
    "t.bilibili.com": { fullScreen: 'button[name="fullscreen-button"]' },
    "live.bilibili.com": {
      init: function() {
        if (!JSON._stringifySource_) {
          JSON._stringifySource_ = JSON.stringify;
          JSON.stringify = function(arg1) {
            try {
              return JSON._stringifySource_.apply(this, arguments);
            } catch (e) {
              console.log("[Task] JSON序列化异常", e, arg1);
            }
          };
        }
      },
      fullScreen: ".bilibili-live-player-video-controller-fullscreen-btn button",
      webFullScreen: ".bilibili-live-player-video-controller-web-fullscreen-btn button",
      switchPlay: ".bilibili-live-player-video-controller-start-btn button"
    },
    "acfun.cn": {
      fullScreen: '[data-bind-key="screenTip"]',
      webFullScreen: '[data-bind-key="webTip"]',
      switchPlay: function() {
        const player = activePlayer.player();
        const status = player.paused;
        setTimeout(function() {
          if (status === player.paused) {
            if (player.paused) {
              player.play();
            } else {
              player.pause();
            }
          }
        }, 200);
      }
    },
    "ixigua.com": {
      fullScreen: ["xg-fullscreen.xgplayer-fullscreen", '.xgplayer-control-item__entry[aria-label="全屏"]', '.xgplayer-control-item__entry[aria-label="退出全屏"]'],
      webFullScreen: ["xg-cssfullscreen.xgplayer-cssfullscreen", '.xgplayer-control-item__entry[aria-label="剧场模式"]', '.xgplayer-control-item__entry[aria-label="退出剧场模式"]']
    },
    "tv.sohu.com": { fullScreen: 'button[data-title="网页全屏"]', webFullScreen: 'button[data-title="全屏"]' },
    "iqiyi.com": {
      fullScreen: ".iqp-btn-fullscreen",
      webFullScreen: ".iqp-btn-webscreen",
      next: ".iqp-btn-next",
      init: function(taskConf2) {
        watermarkTask(".iqp-logo-box")();
        window.GM_addStyle(`
          div[templatetype="common_pause"]{ display:none }
          .iqp-logo-box{ display:none !important }
      `);
      }
    },
    "youku.com": { fullScreen: ".control-fullscreen-icon", next: ".control-next-video", init: watermarkTask(".youku-layer-logo") },
    "ted.com": { fullScreen: "button.Fullscreen" },
    "qq.com": {
      pause: ".container_inner .txp-shadow-mod",
      play: ".container_inner .txp-shadow-mod",
      shortcuts: {
        register: ["c", "x", "z", "1", "2", "3", "4"],
        callback: function(taskConf2, data) {
          const { event } = data;
          const key = event.key.toLowerCase();
          const keyName = "customShortcuts_" + key;
          if (!taskScratch[keyName]) {
            taskScratch[keyName] = { time: Date.now(), playbackRate: tuner.playbackRate };
            return false;
          } else {
            if (Date.now() - taskScratch[keyName].time < 200) {
              return false;
            }
            if (taskScratch[keyName] === tuner.playbackRate || taskScratch[keyName] === true) {
              if (window.sessionStorage.playbackRate && /(c|x|z|1|2|3|4)/.test(key)) {
                const curSpeed = Number(window.sessionStorage.playbackRate);
                const perSpeed = curSpeed - 0.1 >= 0 ? curSpeed - 0.1 : 0.1;
                const nextSpeed = curSpeed + 0.1 <= 4 ? curSpeed + 0.1 : 4;
                let targetSpeed = curSpeed;
                switch (key) {
                  case "z":
                    targetSpeed = 1;
                    break;
                  case "c":
                    targetSpeed = nextSpeed;
                    break;
                  case "x":
                    targetSpeed = perSpeed;
                    break;
                  default:
                    targetSpeed = Number(key);
                    break;
                }
                window.sessionStorage.playbackRate = targetSpeed;
                tuner.seekForward(0.01, true);
                tuner.setSpeed(targetSpeed, true);
                return true;
              }
              taskScratch[keyName] = true;
            } else {
              taskScratch[keyName] = false;
            }
          }
        }
      },
      fullScreen: 'txpdiv[data-report="window-fullscreen"]',
      webFullScreen: 'txpdiv[data-report="browser-fullscreen"]',
      next: 'txpdiv[data-report="play-next"]',
      init: watermarkTask(".txp-watermark", ".txp-watermark-action"),
      include: /(v.qq|sports.qq)/
    },
    "pan.baidu.com": { fullScreen: function(taskConf2) {
      activePlayer.player().parentNode.querySelector(".vjs-fullscreen-control").click();
    } },
    "facebook.com": {
      fullScreen: facebookTask,
      webFullScreen: facebookTask,
      // 在视频模式下按esc键，自动返回上一层界面
      shortcuts: escapeTask(() => {
        Utils.eachParent(activePlayer.player(), function(parentNode) {
          if (parentNode.getAttribute("data-fullscreen-container") === "true") {
            const goBackBtn = parentNode.parentNode.querySelector("div>a>i>u");
            if (goBackBtn) {
              goBackBtn.parentNode.parentNode.click();
            }
            return true;
          }
        });
      })
    },
    "douyu.com": { fullScreen: douyuScreen("_isFullScreen_", "窗口全屏", "退出窗口全屏"), webFullScreen: douyuScreen("_isWebFullScreen_", "网页全屏", "退出网页全屏") },
    "open.163.com": {
      init: function(taskConf2) {
        const player = activePlayer.player();
        player.setAttribute("crossOrigin", "anonymous");
      }
    },
    "agefans.tv": { init: allowCross },
    "chaoxing.com": { fullScreen: ".vjs-fullscreen-control" },
    "yixi.tv": { init: allowCross },
    "douyin.com": { ...xgplayerTask, init: (taskConf2) => {
      allowCross();
      douyinTitle(taskConf2);
    } },
    "live.douyin.com": { ...xgplayerTask, init: allowCross },
    "zhihu.com": {
      fullScreen: ['button[aria-label="全屏"]', 'button[aria-label="退出全屏"]'],
      play: function(taskConf2, data) {
        const player = activePlayer.player();
        if (player && player.parentNode && player.parentNode.parentNode) {
          const maskWrap = player.parentNode.parentNode.querySelector("div~div:nth-child(3)");
          if (maskWrap) {
            const mask = maskWrap.querySelector("div");
            if (mask && mask.innerText === "") {
              mask.click();
            }
          }
        }
      },
      init: allowCross
    },
    "weibo.com": { fullScreen: ["button.wbpv-fullscreen-control"], webFullScreen: ["div.wbpv-open-layer-button"] },
    "twitter.com": {
      init: hoverTitle('article[data-testid="tweet"]', 600, (player, wrapEl) => {
        const titleEl = wrapEl.querySelector('div[data-testid="tweetText"]');
        if (!titleEl) {
          return false;
        }
        Utils.setTitle(player, wrapEl, titleEl.innerText.trim());
        return true;
      })
    }
  };
  var TaskControl = class _TaskControl {
    conf;
    doTaskFunc;
    constructor(taskConf2, doTaskFunc) {
      this.conf = taskConf2 || {};
      this.doTaskFunc = doTaskFunc instanceof Function ? doTaskFunc : function() {
      };
    }
    // 取当前主域名：子域多于两段时去掉最左一段（www.a.com → a.com）
    getDomain() {
      const host = window.location.host;
      let domain = host;
      const tmpArr = host.split(".");
      if (tmpArr.length > 2) {
        tmpArr.shift();
        domain = tmpArr.join(".");
      }
      return domain;
    }
    // 任务配置的 include / exclude 正则是否命中当前地址，exclude 命中即否决
    isMatch(taskConf2) {
      const url = window.location.href;
      let isMatch = false;
      if (!taskConf2.include && !taskConf2.exclude) {
        isMatch = true;
      } else {
        if (taskConf2.include && taskConf2.include.test(url)) {
          isMatch = true;
        }
        if (taskConf2.exclude && taskConf2.exclude.test(url)) {
          isMatch = false;
        }
      }
      return isMatch;
    }
    // 取本站任务表：host 优先、主域名兜底，再按 include / exclude 过滤
    siteConf() {
      const domain = this.getDomain();
      const taskConf2 = this.conf[window.location.host] || this.conf[domain];
      if (taskConf2 && this.isMatch(taskConf2)) {
        return taskConf2;
      }
      return {};
    }
    // 按任务名派发：站点没配任务表、或表里没这个任务名，都返回 false
    doTask(taskName, data) {
      if (!taskName) return false;
      const taskConf2 = this.siteConf();
      if (!Utils.isObj(taskConf2) || !taskConf2[taskName]) return false;
      return this.doTaskFunc(taskName, taskConf2, data);
    }
    // 造一个真 TaskControl：派发函数按任务值的形态分四路——shortcuts 回调、函数、布尔、选择器
    static create() {
      return new _TaskControl(taskConf, function(taskName, taskConf2, data) {
        try {
          const task = taskConf2[taskName];
          if (taskName === "shortcuts") {
            if (Utils.isObj(task) && task.callback instanceof Function) {
              return task.callback(taskConf2, data);
            }
          } else if (task instanceof Function) {
            try {
              return task(taskConf2, data);
            } catch (e) {
              console.log("[Task] 自定义函数失败", taskName, taskConf2, data, e);
              return false;
            }
          } else if (typeof task === "boolean") {
            return task;
          } else {
            const roots = [activePlayer.getWrap(), document];
            const selectorList = Array.isArray(task) ? task : [task];
            for (const selector of selectorList) {
              for (const root of roots) {
                const target = root && root.querySelector(selector);
                if (target) {
                  target.click();
                  return true;
                }
              }
            }
          }
        } catch (e) {
          console.log("[Task] 自定义任务失败", taskName, taskConf2, data, e);
          return false;
        }
      });
    }
  };
  var taskCenter = null;
  var installTasks = (isEnhanceOn) => {
    taskCenter = isEnhanceOn ? TaskControl.create() : new TaskControl({}, function() {
    });
  };

  // Config.ts
  var defaultConfiguration = {
    prefix: "_r6player_",
    config: {
      enable: true,
      media: { autoPlay: false, playbackRate: 1, volume: 1, lastPlaybackRate: 1.5, progress: {} },
      enableHotkeys: true,
      hotkeys: [
        { desc: "网页全屏", key: "shift+enter", command: "webMaximize", disabled: false },
        { desc: "全屏", key: "enter", command: "maximize" },
        { desc: "切换画中画模式", key: "shift+p", command: "togglePicture" },
        { desc: "视频截图", key: "shift+s", command: "capture" },
        { desc: "启用或禁止自动恢复播放进度功能", key: "shift+r", command: "toggleRestore" },
        { desc: "垂直镜像翻转", key: "shift+m", command: "setMirror", args: [true] },
        { desc: "水平镜像翻转", key: "m", command: "setMirror" },
        { desc: "下载音视频文件（实验性功能）", key: "shift+d", command: "mediaDownload" },
        { desc: "缩小视频画面 -0.05", key: "shift+x", command: "zoomOut", args: -0.05 },
        { desc: "放大视频画面 +0.05", key: "shift+c", command: "zoomIn", args: 0.05 },
        { desc: "恢复视频画面", key: "shift+z", command: "resetTransform" },
        { desc: "画面向右移动10px", key: "shift+arrowright", command: "moveRight", args: 10 },
        { desc: "画面向左移动10px", key: "shift+arrowleft", command: "moveLeft", args: -10 },
        { desc: "画面向上移动10px", key: "shift+arrowup", command: "moveUp", args: 10 },
        { desc: "画面向下移动10px", key: "shift+arrowdown", command: "moveDown", args: -10 },
        { desc: "前进5秒", key: "arrowright", command: "seekForward", args: 5 },
        { desc: "后退5秒", key: "arrowleft", command: "seekBack", args: -5 },
        { desc: "前进30秒", key: "ctrl+arrowright", command: "seekForward", args: [30] },
        { desc: "后退30秒", key: "ctrl+arrowleft", command: "seekBack", args: [-30] },
        { desc: "音量升高 5%", key: "arrowup", command: "volumeUp", args: [0.05] },
        { desc: "音量降低 5%", key: "arrowdown", command: "volumeDown", args: [-0.05] },
        { desc: "音量升高 20%", key: "ctrl+arrowup", command: "volumeUp", args: [0.2] },
        { desc: "音量降低 20%", key: "ctrl+arrowdown", command: "volumeDown", args: [-0.2] },
        { desc: "切换暂停/播放", key: "space", command: "switchPlay" },
        { desc: "减速播放", key: "x", command: "slowDown", args: -0.1 },
        { desc: "加速播放", key: "c", command: "speedUp", args: 0.1 },
        { desc: "正常速度播放", key: "z", command: "resetSpeed" },
        { desc: "设置1x的播放速度", key: "Digit1", command: "boost", args: 1 },
        { desc: "设置1x的播放速度", key: "Numpad1", command: "boost", args: 1 },
        { desc: "设置2x的播放速度", key: "Digit2", command: "boost", args: 2 },
        { desc: "设置2x的播放速度", key: "Numpad2", command: "boost", args: 2 },
        { desc: "设置3x的播放速度", key: "Digit3", command: "boost", args: 3 },
        { desc: "设置3x的播放速度", key: "Numpad3", command: "boost", args: 3 },
        { desc: "设置4x的播放速度", key: "Digit4", command: "boost", args: 4 },
        { desc: "设置4x的播放速度", key: "Numpad4", command: "boost", args: 4 },
        { desc: "下一帧", key: "F", command: "freezeFrame", args: 1 },
        { desc: "上一帧", key: "D", command: "freezeFrame", args: -1 },
        { desc: "增加亮度", key: "E", command: "brightnessUp" },
        { desc: "减少亮度", key: "W", command: "brightnessDown" },
        { desc: "增加对比度", key: "T", command: "contrastUp" },
        { desc: "减少对比度", key: "R", command: "contrastDown" },
        { desc: "增加饱和度", key: "U", command: "saturationUp" },
        { desc: "减少饱和度", key: "Y", command: "saturationDown" },
        { desc: "增加色相", key: "O", command: "hueUp" },
        { desc: "减少色相", key: "I", command: "hueDown" },
        { desc: "模糊增加 1 px", key: "K", command: "blurUp" },
        { desc: "模糊减少 1 px", key: "J", command: "blurDown" },
        { desc: "图像复位", key: "Q", command: "resetPicture" },
        { desc: "画面旋转 90 度", key: "S", command: "setRotate" },
        { desc: "播放下一集", key: "N", command: "nextVideo" },
        { desc: "插入debugger断点", key: "ctrl+shift+alt+d", command: "debuggerNow" }
      ],
      mouse: { enable: false, longPressTime: 600 },
      download: { enable: true },
      enhance: {
        // 不禁用默认调速逻辑的话，切换视频时倍速很容易被重置，所以默认开启
        blockSetPlaybackRate: true,
        blockSetCurrentTime: false,
        blockSetVolume: false,
        allowExperimentFeatures: false,
        allowExternalCustomConfiguration: false,
        allowAcousticGain: false,
        allowCrossOriginControl: true
      },
      rightClickMenu: { enable: true },
      debug: false,
      blacklist: {
        // url 黑名单：只挡单页（如 B 站首页），不整站禁用
        urls: ["https://www.bilibili.com/"],
        domains: ["challenges.cloudflare.com"]
      }
    }
  };
  var rawLocalStorage = (function getRawLocalStorage() {
    const usable = Utils.storageUsable();
    const raw = {};
    ["getItem", "setItem", "removeItem"].forEach((apiKey) => {
      const native = usable && localStorage[apiKey];
      raw[apiKey] = native ? function() {
        return native.apply(localStorage, arguments);
      } : function() {
        console.log("[Config] localStorage不可用");
      };
    });
    return raw;
  })();
  var storageLayers = {
    local: { label: "localStorage", usable: Utils.storageUsable, keys: () => Object.keys(localStorage), get: (key) => rawLocalStorage.getItem(key), set: (key, val) => rawLocalStorage.setItem(key, Utils.isObj(val) || Utils.isArr(val) ? JSON.stringify(val) : val), del: (key) => rawLocalStorage.removeItem(key), encoded: true, fallback: null },
    global: { label: "globalStorage", usable: () => window.GM_setValue && window.GM_getValue && window.GM_deleteValue && window.GM_listValues instanceof Function, keys: () => window.GM_listValues(), get: (key) => window.GM_getValue(key), set: (key, val) => window.GM_setValue(key, val), del: (key) => window.GM_deleteValue(key), encoded: false, fallback: "local" }
  };
  var ConfigManager = class {
    hasExternal;
    opts;
    _keyNames;
    revision;
    _confObjRevision_;
    constructor(opts) {
      this.hasExternal = false;
      this.opts = opts;
      this._keyNames = {};
      this.revision = 0;
      this._confObjRevision_ = -1;
    }
    // 吃宿主页面注入的配置并合并进默认表与任务配置：只有开了「允许外部自定义」才生效，推进配置版本号并打上标记
    mergeExternal(config, tag = "Default") {
      if (!config || !this.getGlobal("enhance.allowExternalCustomConfiguration")) return false;
      const configuration = Utils.mergeObj(this.opts.config, config.customConfiguration);
      this.revision++;
      const mergedTaskConf = Utils.mergeObj(taskConf, config.customTaskControlCenter);
      if (taskCenter) {
        taskCenter.conf = mergedTaskConf;
      }
      console.log("[Config] 外部配置合并", configuration, mergedTaskConf);
      this.hasExternal = true;
      return true;
    }
    // 配置路径转存储键名：加前缀、点号换下划线，结果缓存进 _keyNames
    confKey(confPath = "") {
      return this._keyNames[confPath] || (this._keyNames[confPath] = this.opts.prefix + confPath.replace(/\./g, "_"));
    }
    // 存储键名还原成配置路径：去掉前缀、下划线换回点号
    getConfPath(keyName = "") {
      return (keyName.startsWith(this.opts.prefix) ? keyName.slice(this.opts.prefix.length) : keyName).replace(/_/g, ".");
    }
    // 读配置：本地层优先，其次全局层，最后落到内存默认表
    get(confPath) {
      if (typeof confPath !== "string") {
        return null;
      }
      const localConf = this.getLocal(confPath);
      if (localConf !== null) {
        return localConf;
      }
      const globalConf = this.getGlobal(confPath);
      if (globalConf !== null) {
        return globalConf;
      }
      return this.getMemory(confPath);
    }
    // 写配置：先试本地层，写不进再升级到全局层
    set(confPath, val) {
      return this.setLocal(confPath, val) || this.setGlobal(confPath, val);
    }
    //   媒体数值的持久化位置：iframe 里的本地存储属于顶层页面，写不进本站，只能升级到全局层；站点自己接管该项时（forceGlobal）同理
    persistMedia(confPath, val, forceGlobal) {
      return forceGlobal || Utils.inFrame() ? this.setGlobal(confPath, val) : this.set(confPath, val);
    }
    // 列出两层已落盘的配置与内存默认表，供导出与诊断
    list() {
      const result = { localConf: this.listLocal(), globalConf: this.listGlobal(), defConfig: this.opts.config };
      return result;
    }
    // 清掉两层已落盘的配置
    clear() {
      this.clearLocal();
      this.clearGlobal();
    }
    // 从内存默认表里按路径取值，没有就返回 null
    getMemory(confPath) {
      const val = Utils.getPath(this.getConfObj(), confPath);
      return typeof val === "undefined" || val === null ? null : val;
    }
    // 读一层：这一层不可用就退到它声明的兜底层，读不到键则退到内存里的默认值
    readLayer(layerName, confPath) {
      const layer = storageLayers[layerName];
      if (!layer.usable()) {
        return layer.fallback ? this.readLayer(layer.fallback, confPath) : null;
      }
      const key = this.confKey(confPath);
      const stored = layer.get(key);
      if (stored === null || typeof stored === "undefined") {
        return this.getMemory(confPath);
      }
      if (!layer.encoded) {
        return stored;
      }
      try {
        return JSON.parse(stored);
      } catch (e) {
        console.log("[Config] 配置解析异常", key, stored);
        return stored;
      }
    }
    // 读本地层
    getLocal(confPath) {
      return this.readLayer("local", confPath);
    }
    // 读全局层
    getGlobal(confPath) {
      return this.readLayer("global", confPath);
    }
    // 写一层：先校验并更新内存快照，再落盘；这层不可用就退到它声明的兜底层
    writeLayer(layerName, confPath, val) {
      const layer = storageLayers[layerName];
      if (typeof confPath !== "string" || typeof val === "undefined" || val === null) return false;
      Utils.setPath(this.opts.config, confPath, val);
      this.revision++;
      const key = this.confKey(confPath);
      if (!layer.usable()) {
        return layer.fallback ? this.writeLayer(layer.fallback, confPath, val) : false;
      }
      try {
        layer.set(key, val);
        return true;
      } catch (e) {
        console.log("[Config] 配置写入异常", layer.label, key, val, e);
        return false;
      }
    }
    // 写本地层
    setLocal(confPath, val) {
      return this.writeLayer("local", confPath, val);
    }
    // 写全局层
    setGlobal(confPath, val) {
      return this.writeLayer("global", confPath, val);
    }
    // 列出某一层已经落盘的配置：按前缀筛键，值仍走该层自己的读法
    listLayer(layerName) {
      const layer = storageLayers[layerName];
      const result = {};
      if (!layer.usable()) {
        return result;
      }
      layer.keys().forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          const confPath = this.getConfPath(key);
          result[confPath] = this.readLayer(layerName, confPath);
        }
      });
      return result;
    }
    // 列出本地层已落盘的配置
    listLocal() {
      return this.listLayer("local");
    }
    // 列出全局层已落盘的配置
    listGlobal() {
      return this.listLayer("global");
    }
    // 把两层已落盘的值合进内存配置；枚举 + 逐键 JSON.parse 太贵，按 revision 一个版本只做一次，返回的仍是 opts.config 本体
    getConfObj() {
      if (this._confObjRevision_ === this.revision) {
        return this.opts.config;
      }
      this._confObjRevision_ = this.revision;
      const confList = this.list();
      Object.keys(confList.globalConf).forEach((confPath) => {
        Utils.setPath(this.opts.config, confPath, confList.globalConf[confPath]);
      });
      Object.keys(confList.localConf).forEach((confPath) => {
        Utils.setPath(this.opts.config, confPath, confList.localConf[confPath]);
      });
      return this.opts.config;
    }
    // 清空一层里带前缀的键，并推进配置版本号
    clearLayer(layerName) {
      const layer = storageLayers[layerName];
      if (!layer.usable()) return;
      layer.keys().forEach((key) => {
        if (key.startsWith(this.opts.prefix)) {
          layer.del(key);
        }
      });
      this.revision++;
    }
    // 清空本地层
    clearLocal() {
      this.clearLayer("local");
    }
    // 清空全局层
    clearGlobal() {
      this.clearLayer("global");
    }
  };
  var configManager = new ConfigManager(defaultConfiguration);
  var downloadState = /* @__PURE__ */ new Map();
  var configScope = (layer) => layer === "site" ? "「仅用于此网站」" : "「全局设置」";
  var configSave = (layer, key, val) => layer === "site" ? configManager.setLocal(key, val) : configManager.setGlobal(key, val);
  var applyReload = (apply) => {
    if (apply) apply();
    window.location.reload();
    return true;
  };
  var blacklistedDomains = () => configManager.get("blacklist.domains") || [];
  var siteDisabled = () => blacklistedDomains().includes(location.host);
  var menuOn = () => configManager.get("rightClickMenu.enable") !== false;
  var blocksSet = (name) => configManager.get("enhance.blockSet" + name) === true;
  var configSwitch = (key, layer, texts) => {
    const scope = configScope(layer);
    const isTurningOn = () => !configManager.get(key);
    const label = () => texts[isTurningOn() ? 0 : 1];
    return { title: () => `${label()} ${scope}`, fn: () => {
      applyReload(() => configSave(layer, key, isTurningOn()));
    } };
  };
  var globalFunctional = {
    // 切换脚本的启用或禁用状态：黑名单是全局的一份列表，不是布尔开关
    toggleEnable: {
      title: () => `${siteDisabled() ? "启用脚本" : "禁用脚本"} ${configScope("site")}`,
      fn: () => {
        const turningOn = siteDisabled();
        applyReload(() => {
          const list = blacklistedDomains();
          configSave("global", "blacklist.domains", turningOn ? list.filter((item) => item !== location.host) : list.concat(location.host));
        });
      }
    },
    // 切换默认播放进度的控制逻辑
    toggleCurrentTime: configSwitch("enhance.blockSetCurrentTime", "site", ["允许默认播放进度控制逻辑", "禁用默认播放进度控制逻辑"]),
    toggleVolume: configSwitch("enhance.blockSetVolume", "site", ["允许默认音量控制逻辑", "禁用默认音量控制逻辑"]),
    // 倍速参数只能全局设置，本站覆盖会互相打架
    togglePlaybackRate: configSwitch("enhance.blockSetPlaybackRate", "global", ["允许默认速度调节逻辑", "禁用默认速度调节逻辑"]),
    toggleGain: configSwitch("enhance.allowAcousticGain", "global", ["开启音量增益能力", "禁用音量增益能力"]),
    toggleCrossControl: configSwitch("enhance.allowCrossOriginControl", "global", ["开启跨域控制能力", "禁用跨域控制能力"]),
    toggleExperiment: configSwitch("enhance.allowExperimentFeatures", "global", ["开启实验性功能", "禁用实验性功能"]),
    toggleExternal: configSwitch("enhance.allowExternalCustomConfiguration", "global", ["开启外部自定义能力", "关闭外部自定义能力"]),
    toggleDebug: configSwitch("debug", "global", ["开启调试模式", "关闭调试模式"]),
    // 还原全局的默认配置
    restoreDefault: {
      title: "还原全局的默认配置",
      fn: () => {
        configManager.clear();
        applyReload();
      }
    },
    openFrame: { title: "单独打开跨域的页面", fn: () => {
      Utils.openTab(location.href);
    } },
    // 切换视频右键菜单的启用或禁用状态（实时生效，无需刷新）
    toggleMenu: {
      title: () => `${menuOn() ? "禁用" : "启用"}视频右键菜单 ${configScope("global")}`,
      fn: () => {
        const isEnable = menuOn();
        configSave("global", "rightClickMenu.enable", !isEnable);
        menu.close();
      }
    },
    toggleHotkeys: configSwitch("enableHotkeys", "global", ["启用快捷键", "禁用快捷键"]),
    siteHotkeys: configSwitch("enableHotkeys", "site", ["启用快捷键", "禁用快捷键"]),
    toggleMouse: configSwitch("mouse.enable", "global", ["启用鼠标控制", "禁用鼠标控制"]),
    siteMouse: configSwitch("mouse.enable", "site", ["启用鼠标控制", "禁用鼠标控制"]),
    setLongPress: {
      title: () => `长按多久响应鼠标长按事件 ${configScope("global")}`,
      fn: () => {
        const typed = prompt(`长按多久响应鼠标长按事件 ${configScope("global")}`, configManager.get("mouse.longPressTime") || 600);
        if (!typed) {
          return;
        }
        configSave("global", "mouse.longPressTime", Number(typed));
        window.location.reload();
      }
    },
    toggleDownload: configSwitch("download.enable", "global", ["开启媒体下载", "关闭媒体下载"]),
    siteDownload: configSwitch("download.enable", "site", ["开启媒体下载", "关闭媒体下载"])
  };
  var menuCmd = (title, command, ...args) => ({ title, command, args, fn: () => runCommand(command, args) });
  var menuGroups = [
    ["toggleMenu", "toggleEnable"],
    ["togglePlaybackRate", "toggleCurrentTime", "toggleVolume", "toggleGain", "toggleCrossControl", "toggleExperiment", "toggleExternal"],
    ["toggleHotkeys", "siteHotkeys", "toggleMouse", "siteMouse", "setLongPress", "toggleDownload", "siteDownload"],
    ["toggleDebug", "restoreDefault", "openFrame"]
  ];
  var menuItems = () => menuGroups.map((group) => group.map((key) => globalFunctional[key])).reduce((all, items, i) => all.concat(i ? { divider: true } : [], items), []);

  // Input.ts
  var swallowEvent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };
  var InputControl = class _InputControl {
    enable;
    globalMode;
    crossDetected;
    _isFocus;
    hotkeysRunner;
    keysPaused;
    _bound_;
    _relayed_;
    _keyIndex_;
    _indexRevision_;
    constructor() {
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
    static signature(mods, key) {
      if (!key) return "";
      const sorted = mods.filter(Boolean).sort();
      return sorted.length ? sorted.join("+") + "+" + key : key;
    }
    // 按键索引：从 hotkeys 配置推导出的「签名 -> 配置项」表，兜底派发与广播过滤共用它；按配置版本号缓存，配置一改（revision 推进）就重建
    keyIndex() {
      if (input._indexRevision_ !== configManager.revision) {
        input._indexRevision_ = configManager.revision;
        const index = /* @__PURE__ */ new Map();
        (Array.isArray(configManager.get("hotkeys")) ? configManager.get("hotkeys") : []).forEach((conf) => {
          if (!conf || conf.disabled || typeof conf.key !== "string") {
            return;
          }
          const bindings = HotkeysRunner.parseKeys(conf.key, HotkeysRunner.platformMod());
          if (bindings.length !== 1) {
            return;
          }
          const sig = _InputControl.signature(bindings[0][0], bindings[0][1]);
          if (sig && !index.has(sig)) {
            index.set(sig, conf);
          }
        });
        input._keyIndex_ = index;
      }
      return input._keyIndex_;
    }
    // 按事件可能拼出的几种签名逐个查索引，取第一条命中的配置；key 与 code 两种写法都认
    findBinding(event) {
      if (!event) return null;
      const index = input.keyIndex();
      const mods = [];
      if (event.ctrlKey) {
        mods.push("ctrl");
      }
      if (event.altKey) {
        mods.push("alt");
      }
      if (event.metaKey) {
        mods.push("meta");
      }
      if (event.shiftKey) {
        mods.push("shift");
      }
      const signatures = [event.key, event.code].filter((name) => typeof name === "string").map((name) => _InputControl.signature(mods, name.toLowerCase())).filter(Boolean);
      for (let i = 0; i < signatures.length; i++) {
        if (index.has(signatures[i])) {
          return index.get(signatures[i]);
        }
      }
      return null;
    }
    // 这个按键是否归脚本处理（跨Tab广播按它过滤）
    static isRegistered(event) {
      return !!input.findBinding(event);
    }
    // 临时禁用 / 启用快捷键：直接翻转状态位并给出提示，不弹确认
    toggleHotkeys() {
      input.keysPaused = !input.keysPaused;
      menu.tips(input.keysPaused ? "快捷键已临时禁用" : "快捷键已临时启用");
    }
    // 整套增强的总开关：Ctrl+空格与右键菜单里的同名项共用一处
    toggleEnhance() {
      input.enable = !input.enable;
      menu.tips(input.enable ? "启用r6Player插件" : "禁用r6Player插件");
      return input.enable;
    }
    // 按需建按键引擎；在非同源 iframe 里把组合键监视挂到 window.top 上
    mountRunner() {
      if (!input.hotkeysRunner) {
        input.hotkeysRunner = new HotkeysRunner(configManager.get("hotkeys"));
        if (Utils.inFrame() && !Utils.crossSite()) {
          input.hotkeysRunner.addWindow(window.top);
        }
      }
    }
    // 播放器的聚焦事件
    isFocus() {
      const player = activePlayer.player();
      if (!player) return;
      player.onmouseenter = function(e) {
        input._isFocus = true;
      };
      player.onmouseleave = function(e) {
        input._isFocus = false;
      };
    }
    //   兜底派发：runner 只认本窗口的 KeyboardEvent，跨Tab/跨域来的模拟事件进不去，这里按同一份 hotkeys 配置查动作，保证两条路径的执行结果一致
    playerTrigger(player, event) {
      if (!player || !event) return false;
      const conf = input.findBinding(event);
      if (!conf) {
        return false;
      }
      if (!runCommand(conf.command, conf.args)) {
        return false;
      }
      event.stopPropagation && event.stopPropagation();
      event.preventDefault && event.preventDefault();
      return true;
    }
    // 运行站点自定义的快捷键任务：修饰键+主键拼好与注册项同序比对，命中即派发
    siteShortcut(player, event) {
      if (!player || !event) return;
      const key = event.key.toLowerCase();
      const taskConf2 = taskCenter.siteConf();
      const confIsCorrect = Utils.isObj(taskConf2.shortcuts) && Array.isArray(taskConf2.shortcuts.register) && taskConf2.shortcuts.callback instanceof Function;
      const combineKey = [];
      if (event.ctrlKey) {
        combineKey.push("ctrl");
      }
      if (event.shiftKey) {
        combineKey.push("shift");
      }
      if (event.altKey) {
        combineKey.push("alt");
      }
      if (event.metaKey) {
        combineKey.push("command");
      }
      combineKey.push(key);
      const hit = confIsCorrect && taskConf2.shortcuts.register.some((shortcut) => {
        const regKey = shortcut.split("+");
        return regKey.length === combineKey.length && regKey.every((name) => combineKey.includes(name));
      });
      if (!hit) {
        return false;
      }
      const isDo = taskCenter.doTask("shortcuts", { event, player });
      if (isDo) {
        swallowEvent(event);
      }
      return isDo;
    }
    // 按键响应方法
    keydownEvent(event) {
      const keyCode = event.keyCode;
      const player = activePlayer.player();
      if (input.keysPaused || Utils.editable(Utils.eventTarget(event))) return;
      pageBridge.send("globalKeydownEvent", event, 0);
      if (!player) {
        if (input.crossDetected) {
          if (!configManager.get("enhance.allowCrossOriginControl")) {
            return false;
          }
          if (input.hotkeysRunner && input.hotkeysRunner.run) {
            input.hotkeysRunner.run({ event, stopPropagation: true, preventDefault: true });
          } else {
            input.mountRunner();
            swallowEvent(event);
          }
        }
        return false;
      }
      if (event.ctrlKey && keyCode === 32) {
        input.toggleEnhance();
      }
      if (!input.enable) {
        console.log("[Input] 增强已禁用");
        return false;
      }
      if (event.ctrlKey && keyCode === 220) {
        input.globalMode = !input.globalMode;
        menu.tips("全局模式：" + (input.globalMode ? " ON" : " OFF"));
      }
      if (!input.globalMode && !input._isFocus) return;
      if (input.siteShortcut(player, event) === true) return;
      if (input.hotkeysRunner && input.hotkeysRunner.run) {
        const matchResult = input.hotkeysRunner.run({ event, stopPropagation: true, preventDefault: true });
        if (matchResult) {
          console.log("[Input] 按键命中", matchResult);
          return true;
        }
      } else {
        return input.playerTrigger(player, event);
      }
    }
    // 响应来自按键消息的广播
    bindRelay() {
      if (input._relayed_) return;
      let triggerFakeEvent = function(name, oldVal, newVal, remote) {
        const player = activePlayer.player();
        if (player && !input.keysPaused) {
          const fakeEvent = newVal.data;
          fakeEvent.stopPropagation = () => {
          };
          fakeEvent.preventDefault = () => {
          };
          input.playerTrigger(player, fakeEvent);
          console.log("[Input] 跨域按键响应", newVal);
        }
      };
      if (!pageBridge.pictureOpen() && !input.crossDetected) {
        triggerFakeEvent = Utils.throttle(triggerFakeEvent, 80);
      }
      pageBridge.on("globalKeydownEvent", async (name, oldVal, newVal, remote) => {
        if (remote) {
          if (Utils.crossSite()) {
            if (document.visibilityState === "visible" && newVal.originTab) {
              triggerFakeEvent(name, oldVal, newVal, remote);
            }
          } else if (pageBridge.pictureOpen()) {
            if (!newVal.originTab && (document.pictureInPictureElement || activePlayer.justExited())) {
              triggerFakeEvent(name, oldVal, newVal, remote);
            }
          }
        }
      });
      input._relayed_ = true;
    }
    // 绑定相关事件
    bindEvent() {
      if (input._bound_) return;
      const docs = [document];
      if (Utils.inFrame() && !Utils.crossSite()) {
        docs.push(window.top.document);
      }
      Utils.rebindKeydown(input.keydownEvent, docs);
      input._bound_ = true;
    }
    // 长按视频画面进行3倍速快进的鼠标控制
    static register() {
      const longPressTime = configManager.get("mouse.longPressTime") || 600;
      let mouseEventTimer = null;
      let hasHandleEvent = false;
      let isPaused = false;
      let oldPlaybackRate = 1;
      document.addEventListener("mousedown", function(event) {
        const player = activePlayer.player();
        if (!player || !(player instanceof HTMLVideoElement)) {
          return;
        }
        isPaused = player.paused;
        if (!Utils.onMedia(player, event.clientX, event.clientY, 80)) {
          return;
        }
        if (event.button === 0) {
          mouseEventTimer = setTimeout(() => {
            hasHandleEvent = true;
            oldPlaybackRate = tuner.getSpeed();
            tuner.applyRate(3, false, 800);
            swallowEvent(event);
          }, longPressTime);
        }
      }, true);
      document.addEventListener("mouseup", function(event) {
        mouseEventTimer && clearTimeout(mouseEventTimer);
        if (hasHandleEvent) {
          hasHandleEvent = false;
          swallowEvent(event);
          if (isPaused) {
            activePlayer.enhancer.lockPlay(600);
          } else {
            activePlayer.enhancer.lockPause(600);
          }
          tuner.applyRate(oldPlaybackRate, false, 800);
        }
      }, true);
    }
  };
  var input = null;
  var createInput = () => {
    input = new InputControl();
    return input;
  };
  var debuggerNow = () => {
    if (!window._debugMode_) return false;
    const script = document.createElement("script");
    script.innerText = "debugger";
    document.body.appendChild(script);
    return true;
  };
  var hotkeyCommands = /* @__PURE__ */ Object.create(null);
  var buildCommands = () => {
    hotkeyCommands.debuggerNow = debuggerNow;
    [activePlayer, menu, tuner, picture, input].forEach((ctl) => {
      Object.getOwnPropertyNames(Object.getPrototypeOf(ctl)).forEach((name) => {
        if (name === "constructor" || name in hotkeyCommands) return;
        if (typeof ctl[name] !== "function") return;
        hotkeyCommands[name] = (...args) => ctl[name](...args);
      });
    });
    return hotkeyCommands;
  };
  var runCommand = (command, args) => {
    const fn = typeof command === "function" ? command : hotkeyCommands[command];
    if (!(fn instanceof Function)) {
      console.log("[Input] 命令派发失败", String(command));
      return false;
    }
    const argv = Array.isArray(args) ? args : typeof args === "undefined" ? [] : [args];
    fn(...argv);
    return true;
  };
  var keyAlias = { ControlLeft: "ctrl", ControlRight: "ctrl", ShiftLeft: "shift", ShiftRight: "shift", AltLeft: "alt", AltRight: "alt", MetaLeft: "meta", MetaRight: "meta" };
  var modGuard = new original.WeakMap();
  var HotkeysRunner = class _HotkeysRunner {
    window;
    windowList;
    MOD;
    prevPress;
    _prevTimer_;
    modState;
    hotkeys;
    constructor(hotkeys, win = window) {
      this.window = win;
      this.windowList = [win];
      this.MOD = _HotkeysRunner.platformMod();
      this.prevPress = null;
      this._prevTimer_ = null;
      this.modState = new original.Map();
      this.hotkeys = hotkeys || [];
      if (Array.isArray(this.hotkeys)) {
        this.hotkeys.forEach((config) => {
          if (!Utils.isObj(config) || !config.key || typeof config.key !== "string") {
            return;
          }
          config.keyBindings = _HotkeysRunner.parseKeys(config.key, this.MOD);
        });
      } else {
        this.hotkeys = [];
      }
      this.watchMods(win);
    }
    //   — 按键配置解析：引擎的逐段匹配与兜底派发的签名查表共用这一份，不再各解析一遍$mod 在 Mac 上是 meta、其它平台是 ctrl；拿不到 navigator 时按非 Mac 处理
    static platformMod() {
      return /Mac|iPod|iPhone|iPad/.test(typeof navigator === "object" && navigator.platform ? navigator.platform : "") ? "meta" : "ctrl";
    }
    // 一段按键串 -> [修饰键（按书写顺序）, 主键]；纯修饰键组合的主键为空串
    static parsePress(press, mod) {
      const mods = [];
      let key = "";
      press.split(/\b\+/).forEach((k) => {
        k = k === "$mod" ? mod : k;
        if (Utils.isModifier(k)) {
          mods.push(k);
        } else {
          key = k;
        }
      });
      return [mods, key];
    }
    // 整条配置 -> 逐段解析结果；空格分段即多段序列（如 space c），只有引擎能走完
    static parseKeys(key, mod) {
      return key.trim().toLowerCase().split(/\s+/).map((press) => _HotkeysRunner.parsePress(press, mod));
    }
    // 设置其它window对象的组合键监控逻辑
    addWindow(win) {
      this.window = win;
      if (!this.windowList.includes(win)) {
        this.windowList.push(win);
      }
      this.watchMods(win);
    }
    // 当前键盘事件与某一段预期按键配置是否匹配
    isMatch(event, press, heldKeys) {
      if (!event || !Array.isArray(press)) {
        return false;
      }
      const held = event.modsMap || this.heldMods();
      const mods = press[0];
      const key = press[1];
      if (mods.length !== held.size) {
        return false;
      }
      if (key && event.key.toLowerCase() !== key && event.code.toLowerCase() !== key) {
        return false;
      }
      let result = true;
      const modsKey = heldKeys || this.modsOf(event);
      mods.forEach((key2) => {
        if (!modsKey.has(key2)) {
          result = false;
        }
      });
      return result;
    }
    // 把当前按住的修饰键展开成便于查表的形态（同时兼容大小写与别名）
    modsOf(event) {
      const held = event.modsMap || this.heldMods();
      const modsKey = new original.Map();
      held.forEach((val, key) => {
        modsKey.set(key, val);
        modsKey.set(key.toLowerCase(), val);
        keyAlias[key] && modsKey.set(keyAlias[key], val);
      });
      return modsKey;
    }
    //   上一段按键是否与给定段匹配，多段序列靠它衔接引擎主循环：逐条配置按段匹配，命中就吞事件并按需派发命令，返回命中的配置
    run(opts = {}) {
      if (!this.windowList.some((win) => win.KeyboardEvent === opts.event.constructor)) {
        return false;
      }
      const event = opts.event;
      const heldKeys = this.modsOf(event);
      let matchResult = null;
      this.hotkeys.forEach((hotkeyConf) => {
        if (hotkeyConf.disabled || !hotkeyConf.keyBindings) {
          return false;
        }
        let press = hotkeyConf.keyBindings[0];
        if (this.prevPress) {
          if (hotkeyConf.keyBindings.length <= 1 || !this.isMatch(this.prevPress, press)) {
            return false;
          }
          press = hotkeyConf.keyBindings[1];
        }
        const isMatch = this.isMatch(event, press, heldKeys);
        if (!isMatch) {
          return false;
        }
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
          this._prevTimer_ = setTimeout(() => {
            this.prevPress = null;
          }, 1e3);
          return true;
        }
        if (hotkeyConf.keyBindings.length > 1 && press !== hotkeyConf.keyBindings[0]) {
          setTimeout(() => {
            this.prevPress = null;
          }, 0);
        }
        runCommand(hotkeyConf.command, hotkeyConf.args);
      });
      return matchResult;
    }
    // 给一个 window 挂组合键状态监听（按下置位、松开延迟复位、失焦全清），每个 window 只挂一次
    watchMods(win = window) {
      const self = this;
      const modState = self.modState;
      if (!win || win !== win.self || !win.addEventListener || modGuard.get(win)) {
        return false;
      }
      const timers = {};
      function pressMod(event) {
        Utils.isModifier(event.code) && modState.set(event.code, true);
      }
      function releaseMod(event) {
        if (!(event instanceof KeyboardEvent)) {
          modState.forEach((val, key) => {
            modState.set(key, false);
          });
          return true;
        }
        if (Utils.isModifier(event.code)) {
          clearTimeout(timers[event.code]);
          timers[event.code] = setTimeout(() => {
            modState.set(event.code, false);
          }, 50);
        }
      }
      win.addEventListener("keydown", pressMod, true);
      win.addEventListener("keypress", pressMod, true);
      win.addEventListener("keyup", releaseMod, true);
      win.addEventListener("blur", releaseMod, true);
      modGuard.set(win, true);
    }
    // 取当前所有按下的修饰键，跨 Tab 转发按键时要把这份状态一起带上
    heldMods() {
      const modState = this.modState;
      const result = new original.Map();
      modState.forEach((val, key) => {
        if (val === true) {
          result.set(key, val);
        }
      });
      return result;
    }
  };

  // Bridge.ts
  var userAgentMap = {
    iPhone: {
      safari: "Mozilla/5.0 (iPhone; CPU iPhone OS 13_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/111.0.0.0 Mobile/15E148 Safari/604.1",
      chrome: "Mozilla/5.0 (iPhone; CPU iPhone OS 12_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/74.0.3729.121 Mobile/15E148 Safari/605.1"
    }
  };
  var fakeConfig = { "open.163.com": userAgentMap.iPhone.chrome, "m.open.163.com": userAgentMap.iPhone.chrome, "pan.baidu.com": userAgentMap.iPhone.safari };
  var pictureKey = "globalPictureInPictureInfo";
  var PageBridge = class _PageBridge {
    // 跨Tab按键让位只绑一次：标记留在实例上，重试路径不会再挂第二份
    _bound_;
    // 某些网页用 attachShadow closed mode，改成 open 才拿得到 video（如百度云盘）
    static openShadow() {
      if (window._hasHackAttachShadow_) return;
      try {
        window._shadowDomList_ = [];
        window.Element.prototype._attachShadow = window.Element.prototype.attachShadow;
        window.Element.prototype.attachShadow = function() {
          const arg = arguments;
          const isClosed = arg[0] && arg[0].mode === "closed";
          if (arg[0] && arg[0].mode) {
            arg[0].mode = "open";
          }
          const shadowRoot = this._attachShadow.apply(this, arg);
          window._shadowDomList_.push(shadowRoot);
          shadowRoot._shadowHost = this;
          const shadowEvent = new window.CustomEvent("addShadowRoot", { detail: { shadowRoot, message: "addShadowRoot", time: /* @__PURE__ */ new Date() }, bubbles: true, cancelable: true });
          document.dispatchEvent(shadowEvent);
          if (isClosed) {
            original.Object.defineProperty.call(Object, this, "shadowRoot", {
              // 站点用的是 closed 模式，就把 shadowRoot 对外装回 null
              get() {
                return null;
              }
            });
          }
          return shadowRoot;
        };
        window._hasHackAttachShadow_ = true;
      } catch (e) {
        console.log("[Bridge] shadowRoot劫持异常", e);
      }
    }
    // 按站点伪装 Navigator 的 userAgent
    static spoofAgent(ua) {
      ua = ua || fakeConfig[window.location.host];
      if (!ua) return;
      const desc = Object.getOwnPropertyDescriptor(Navigator.prototype, "userAgent");
      Object.defineProperty(Navigator.prototype, "userAgent", { ...desc, get: function() {
        return ua;
      } });
    }
    // 反制站点对媒体属性的锁定：定义发生的那一刻把属性改成可配置，并把真正落地的键名挪开
    static unlockable(target, key, option) {
      if (!option || typeof option !== "object") {
        return [target, key, option];
      }
      if (target instanceof Element && typeof key === "string" && key.indexOf("on") >= 0) {
        option.configurable = true;
      }
      if (target instanceof HTMLVideoElement && typeof key === "string" && ["playbackRate", "currentTime", "volume", "muted"].includes(key)) {
        console.log("[Bridge] 媒体属性锁拦截", key);
        option.configurable = true;
        key += "_hack";
      }
      return [target, key, option];
    }
    // 统一包一层 try/catch：失败只记日志并返回 null，不把异常抛给站点
    static safeDefine(rawFn, args, methodName) {
      try {
        return rawFn.apply(Object, args);
      } catch (e) {
        console.log("[Bridge] 属性定义异常", methodName, e);
        return null;
      }
    }
    // 把 Object.defineProperty 与 defineProperties 换成会先解锁的版本
    static hackDefine() {
      const rawDefineProperty = Object.defineProperty;
      const rawDefineProperties = Object.defineProperties;
      Object.defineProperty = function(target, key, option) {
        return _PageBridge.safeDefine(rawDefineProperty, _PageBridge.unlockable(target, key, option), "defineProperty");
      };
      Object.defineProperties = function(target, properties) {
        if (target instanceof Element && properties) {
          const unlocked = {};
          Object.keys(properties).forEach((key) => {
            const afterArgs = _PageBridge.unlockable(target, key, properties[key]);
            unlocked[afterArgs[1]] = afterArgs[2];
          });
          properties = unlocked;
        }
        return _PageBridge.safeDefine(rawDefineProperties, [target, properties], "defineProperties");
      };
    }
    // 代理媒体元素的事件注册，以便调试或阻断 ratechange
    static proxyEvents() {
      if (HTMLMediaElement.prototype._rawAddEventListener_) {
        return false;
      }
      HTMLMediaElement.prototype._rawAddEventListener_ = HTMLMediaElement.prototype.addEventListener;
      HTMLMediaElement.prototype._rawRemoveEventListener_ = HTMLMediaElement.prototype.removeEventListener;
      HTMLMediaElement.prototype.addEventListener = new original.Proxy(HTMLMediaElement.prototype.addEventListener, {
        // 只给 ratechange 的监听器再包一层，其余事件原样放行
        apply(target, ctx, args) {
          const eventName = args[0];
          const listener = args[1];
          if (listener instanceof Function && eventName === "ratechange") {
            args[1] = new original.Proxy(listener, {
              // 识别站点阻速：速率被改过、或与脚本设的值对不上，就吞掉这次事件
              apply(target2, ctx2, args2) {
                if (ctx2) {
                  if (ctx2.playbackRate && eventName === "ratechange") {
                    if (ctx2._hasBlockRatechangeEvent_) {
                      return true;
                    }
                    const oldRate = ctx2.playbackRate;
                    const startTime = Date.now();
                    const result = target2.apply(ctx2, args2);
                    const blockRatechangeBehave1 = oldRate !== ctx2.playbackRate || Date.now() - startTime > 1e3;
                    const blockRatechangeBehave2 = ctx2._setPlaybackRate_ && ctx2._setPlaybackRate_.value !== ctx2.playbackRate;
                    if (blockRatechangeBehave1 || blockRatechangeBehave2) {
                      console.log("[Bridge] 阻速行为拦截", eventName, listener);
                      ctx2._hasBlockRatechangeEvent_ = true;
                      return true;
                    } else {
                      return result;
                    }
                  }
                }
                try {
                  return target2.apply(ctx2, args2);
                } catch (e) {
                  console.log("[Bridge] 事件代理异常", eventName, listener, e);
                }
              }
            });
          }
          return target.apply(ctx, args);
        }
      });
    }
    // 发消息：带上 tabId、标题、referrer 等必要信息，并按间隔节流
    send(name, data, throttleInterval = 80) {
      if (!window.GM_getValue || !window.GM_setValue) {
        return false;
      }
      const oldMsg = window.GM_getValue(name);
      if (oldMsg && oldMsg.updateTime) {
        const interval = Math.abs(Date.now() - oldMsg.updateTime);
        if (interval < throttleInterval) {
          return false;
        }
      }
      const msg = { data, tabId: tabIdentity.id || "undefined", title: document.title, referrer: Utils.extractData(window.location), updateTime: Date.now() };
      if (typeof data === "object") {
        msg.data = Utils.extractData(data);
      }
      window.GM_setValue(name, msg);
    }
    // 读跨 Tab 消息，底层就是 GM_getValue
    get(name) {
      return window.GM_getValue && window.GM_getValue(name);
    }
    // 订阅跨 Tab 消息：先标记来源是不是本 Tab，再回调
    on(name, fn) {
      return window.GM_addValueChangeListener && window.GM_addValueChangeListener(name, function(name2, oldVal, newVal, remote) {
        newVal.originTab = newVal.tabId === tabIdentity.id;
        fn instanceof Function && fn.apply(null, arguments);
      });
    }
    // 意外退出的时候leavepictureinpicture事件并不会被调用，所以只能通过轮询来更新画中画信息
    pollPicture() {
      setInterval(() => {
        if (document.pictureInPictureElement) {
          pageBridge.send(pictureKey, { usePictureInPicture: true });
        }
      }, 1e3 * 1.5);
    }
    // 判断当前是否开启了画中画功能
    pictureOpen() {
      const data = pageBridge.get(pictureKey);
      if (!data || !data.data) {
        return false;
      }
      return Math.abs(Date.now() - data.updateTime) < (data.data.usePictureInPicture ? 1e3 * 3 : 1e3 * 15);
    }
    //   别的 Tab 开着画中画时，本页按下已注册的快捷键就吞掉，让给那个 Tab；ctrl/meta + c/v/f/d 这类系统级快捷键排除在外，减少对复制粘贴查找下载的干扰
    yieldKeys(event) {
      if (Utils.editable(Utils.eventTarget(event))) return;
      if (pageBridge.pictureOpen()) {
        const pipInfo = pageBridge.get(pictureKey);
        const exclude = event && typeof event.keyCode !== "undefined" && (event.ctrlKey || event.metaKey) && ["c", "v", "f", "d"].includes(event.key.toLowerCase());
        if (pipInfo.tabId !== tabIdentity.id && InputControl.isRegistered(event) && !exclude) {
          event.stopPropagation();
          event.preventDefault();
          return true;
        }
      }
    }
    // 绑定跨 Tab 按键让位，只绑一次
    bindYield() {
      if (pageBridge._bound_) return;
      Utils.rebindKeydown(pageBridge.yieldKeys, [document]);
      pageBridge._bound_ = true;
    }
  };
  var pageBridge = new PageBridge();

  // Boot.ts
  var applyExternal = () => {
    const conf = window.unsafeWindow && window.unsafeWindow.__r6PlayerCustomConfiguration__;
    if (conf && !configManager.hasExternal) {
      configManager.mergeExternal(conf);
    }
  };
  var playerDetected = () => {
    applyExternal();
    if (taskCenter.doTask("disable") === true) {
      console.log("[Boot] 任务中心禁用本站检测", location.host);
      return true;
    }
    return activePlayer.detectPlayer();
  };
  var watchTags = (root) => supportMediaTags.forEach((tagName) => Utils.ready(tagName, () => playerDetected(), root));
  var bootState = { runtimeReady: false, initTryCount: 0 };
  var setupRuntime = () => {
    if (bootState.runtimeReady) return true;
    bootState.runtimeReady = true;
    applyExternal();
    if (configManager.get("debug") === true) {
      window._debugMode_ = true;
    }
    PageBridge.spoofAgent();
    if (configManager.get("enableHotkeys") !== false) {
      input.bindEvent();
      input.bindRelay();
    } else {
      console.log("[Boot] 快捷键禁用");
    }
    pageBridge.on("videoDetected", (name, oldVal, newVal, remote) => {
      if (newVal.originTab) {
        input.crossDetected = true;
      }
      console.log("[Boot] 跨域视频检出", newVal, remote);
    });
    document.addEventListener("visibilitychange", function() {
      activePlayer.autoPlay();
    });
    if (window.unsafeWindow && configManager.getGlobal("enhance.allowExternalCustomConfiguration")) {
      window.unsafeWindow.__setR6PlayerCustomConfiguration__ = (config, tag) => configManager.mergeExternal(config, tag);
    }
    watchTags();
    document.addEventListener("addShadowRoot", (e) => watchTags(e.detail.shadowRoot));
    pageBridge.pollPicture();
    pageBridge.bindYield();
    if (Utils.inFrame()) {
      console.log("[Boot] 启动完成, in iframe:");
    } else {
      console.log("[Boot] 启动完成");
    }
    if (Utils.crossSite()) {
      console.log("[Boot] 跨域iframe受限", window.location.href);
    }
    if (configManager.get("mouse.enable")) {
      InputControl.register();
    }
    return true;
  };
  var initEnhance = () => {
    try {
      if (Utils.isChallenge()) {
        console.log("[Boot] 人机验证页暂停", location.href);
        return false;
      }
    } catch (e) {
      console.log("[Boot] 页面判定异常", e);
    }
    const isEnabled = configManager.get("enable");
    const blackUrlList = configManager.get("blacklist.urls") || [];
    const isInBlackList = blackUrlList.includes(location.href) || siteDisabled();
    const isEnhanceOn = !!isEnabled && !isInBlackList;
    if (isInBlackList) {
      console.log("[Boot] 黑名单禁用本站", location.href, "如需开启请在配置 blacklist 中移除该地址");
    }
    installTasks(isEnhanceOn);
    try {
      if (isEnhanceOn) {
        mediaCore.init(function(mediaElement) {
          playerDetected();
        });
        if (configManager.get("enhance.allowExperimentFeatures") && configManager.get("download.enable")) {
          mediaSource.init();
          console.log("[Boot] 实验功能开启警示");
          console.log("[Boot] 媒体流捕获启用");
        }
        PageBridge.hackDefine();
        PageBridge.openShadow();
        PageBridge.proxyEvents();
      }
    } catch (e) {
      console.log("[Boot] 页面劫持异常", e);
    }
    MenuControl.init();
    if (!isEnhanceOn) {
      console.log("[Boot] 配置禁用本站", location.host);
      return false;
    }
    try {
      setupRuntime();
    } catch (e) {
      console.log("[Boot] 装配失败", e);
    }
  };
  var startUp = (retryCount = 0) => {
    if (!window.document || !window.document.documentElement) {
      setTimeout(() => {
        if (retryCount < 200) {
          startUp(retryCount + 1);
        } else {
          console.log("[Boot] documentElement缺失", window);
        }
      }, 10);
      return false;
    } else if (retryCount > 0) {
      console.log("[Boot] documentElement就绪", retryCount, window);
    }
    initEnhance();
  };

  // Entry.ts
  var MODULES = [
    Boot_exports,
    Config_exports,
    Media_exports,
    Bridge_exports,
    Utils_exports,
    Input_exports,
    Picture_exports,
    Player_exports,
    Tuner_exports,
    Menu_exports,
    Task_exports
  ];
  var internals = {};
  var exposeInternals = () => {
    const seen = /* @__PURE__ */ new Set();
    MODULES.forEach((ns) => {
      Object.keys(ns).forEach((name) => {
        if (seen.has(name)) {
          throw new Error("内部清单里名字重复：" + name);
        }
        seen.add(name);
        Object.defineProperty(internals, name, { enumerable: true, get: () => ns[name] });
      });
    });
    window.__playerInternals = internals;
    return internals;
  };
  var CAPABILITY_CONTROLLERS = [createPlayer, createMenu, createTuner, createPicture, createInput];
  exposeInternals();
  Utils.getTabId();
  createMedia();
  createSource();
  CAPABILITY_CONTROLLERS.forEach((create) => create());
  buildCommands();
  try {
    startUp(0);
  } catch (e) {
    setTimeout(() => {
      if (bootState.initTryCount < 200) {
        bootState.initTryCount++;
        startUp(0);
        console.log("[Entry] 启动重试", bootState.initTryCount, e);
      }
    }, 10);
  }
})();
// @license Copyright 2017 - Chris West - MIT Licensed · https://cwestblog.com/2017/08/22/web-audio-api-controlling-audio-video-loudness/
