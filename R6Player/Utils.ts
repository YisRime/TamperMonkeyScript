// Utils：全脚本共用的静态小工具，一个命名空间、按域分段原生函数快照：脚本在 document-start 就取一份，页面后打的补丁改不动它。构造 Proxy、Map、defineProperty 一律走这里，裸用全局名会被站点污染
export const original = {
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
// 跨Tab消息通讯的身份状态：标签页 id 由下面的 getTabId 初始化一次，供 pageBridge 标记消息来源。收成对象而不是两个 let：模块私有化之后，测试与调试只能改属性，改不动绑定
export const tabIdentity = { id: null, seq: 0 };
export class Utils {
  // — 对象与数组：判型、深拷贝、按路径读写、递归取数
  static isObj (obj) { return Object.prototype.toString.call(obj) === '[object Object]' }
  // 深拷贝：非对象（含 null）原样返回，数组 / 对象按成员递归复制
  static clone (source) {
    if (source === null || typeof source !== 'object') { return source }
    const result = Utils.isArr(source) ? [] : {};
    for (const key in source) { result[key] = (typeof source[key] === 'object') ? Utils.clone(source[key]) : source[key]; }
    return result
  }
  // 把 objB 深合并进 objA（改的是 objA），concatArr 为真时数组取拼接而不是覆盖
  static mergeObj (objA, objB, concatArr?) {
    if (!Utils.isObj(objA) || !Utils.isObj(objB)) return objA
    // mergeObj 的内层递归：只覆盖同名键，两边都是对象就继续往下钻
    function deepMerge (objA, objB) {
      Object.keys(objB).forEach(key => {
        const subItemA = objA[key];
        const subItemB = objB[key];
        if (typeof subItemA === 'undefined') { objA[key] = subItemB; } else {
          if (Utils.isObj(subItemA) && Utils.isObj(subItemB)) { objA[key] = deepMerge(subItemA, subItemB); } else {
            if (concatArr && Utils.isArr(subItemA) && Utils.isArr(subItemB)) { objA[key] = subItemA.concat(subItemB); } else { objA[key] = subItemB; }
          }
        }
      });
      return objA
    }
    return deepMerge(objA, objB)
  }
  // 按 a.b.c 路径写值，路径任一段断掉就返回 false
  static setPath (obj, path, val) {
    if (!obj || !path || typeof path !== 'string') { return false }
    let result = obj;
    const pathArr = path.split('.');
    for (let i = 0; i < pathArr.length; i++) {
      if (!result) break
      if (i === pathArr.length - 1) {
        result[pathArr[i]] = val;
        return true
      }
      result = result[pathArr[i]];
    }
    return false
  }
  // 按 a.b.c 路径取值，中途断掉得到 undefined
  static getPath (obj, path) {
    path = path || '';
    const pathArr = path.split('.');
    let result = obj;
    for (let i = 0; i < pathArr.length; i++) {
      if (!result) break
      result = result[pathArr[i]];
    }
    return result
  }
  // 把对象抽成纯数据（标量直取、对象递归，最多三层），跨 Tab / 跨域传消息前用它
  static extractData (obj, deep?) {
    deep = deep || 1;
    if (deep > 3) return {}
    const result = {};
    if (typeof obj !== 'object') { return result }
    for (const key in obj) {
      const val = obj[key];
      const valType = typeof val;
      if (valType === 'number' || valType === 'string' || valType === 'boolean') { result[key] = val } else if (valType === 'object' && Object.prototype.propertyIsEnumerable.call(obj, key)) { result[key] = Utils.extractData(val, deep + 1) }
    }
    return result
  }
  // 是不是数组，走 Object.prototype.toString 所以跨 iframe 也准
  static isArr (arr) { return Object.prototype.toString.call(arr) === '[object Array]' }
  // — DOM 与行内样式：元素等待、遍历父级、可视范围、样式互转
  // 元素监听器：selector 可以是数组，shadowRoot 可选
  static ready (selector, fn, shadowRoot?) {
    const win = window;
    const docRoot = shadowRoot || win.document.documentElement;
    if (!docRoot) return false
    const MutationObserver = win.MutationObserver || win.WebKitMutationObserver;
    const listeners = docRoot._MutationListeners || [];
    // 注册一个选择器监听并立刻试一次；同一根节点上只挂一个 MutationObserver
    function $ready (selector, fn) {
      listeners.push({ selector: selector, fn: fn });
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
      check(selector, fn);
    }
    // 查一遍选择器，给每个新命中的元素打上已通知标记再回调一次
    function check (selector, fn) {
      const elements = docRoot.querySelectorAll(selector);
      for (let i = 0; i < elements.length; i++) {
        const element = elements[i];
        element._MutationReadyList_ = element._MutationReadyList_ || [];
        if (!element._MutationReadyList_.includes(fn)) {
          element._MutationReadyList_.push(fn);
          fn.call(element, element);
        }
      }
    }
    const selectorArr = Array.isArray(selector) ? selector : [selector];
    selectorArr.forEach(selector => $ready(selector, fn));
  }
  // 逐层向上遍历父节点，回调返回 true 时提前结束；onlyClassable 用于停在真正的元素节点上
  static eachParent (dom, fn, onlyClassable?) {
    let parent = dom.parentNode;
    while (parent && (!onlyClassable || parent.classList)) {
      const isEnd = fn(parent, dom);
      if (isEnd) { break }
      parent = parent.parentNode;
    }
  }
  // 把一段 CSS 文本插成 style 节点；带 id 且已存在就不重复插
  static addStyle (cssText, id, insetTo) {
    if (id && document.getElementById(id)) { return false }
    const style = document.createElement('style');
    const head = insetTo || document.head || document.getElementsByTagName('head')[0];
    style.appendChild(document.createTextNode(cssText));
    head.appendChild(style);
    if (id) { style.setAttribute('id', id); }
    return style
  }
  // 采集原型上的方法做原始参照：跨域受限或站点改写过的属性读取会抛错，逐个吞掉
  static snapMethods (proto, target) {
    Object.keys(proto).forEach(key => { try { if (proto[key] instanceof Function) { target[key] = proto[key] } } catch (e) {} });
  }
  // 建元素顺手带上类名：菜单浮层里五个节点都是这两行
  static el (tag, className) { const node = document.createElement(tag); node.className = className; return node }
  // 事件目标是不是可编辑区域（contenteditable 或输入类控件）
  static editable (target) {
    const isEditable = target.getAttribute && target.getAttribute('contenteditable') === 'true';
    const isInputDom = /INPUT|TEXTAREA|SELECT|LABEL/.test(target.nodeName);
    return isEditable || isInputDom
  }
  // 事件经过的完整路径：阴影树里的节点只有 composedPath 能拿到
  static eventPath (event) { return event.composedPath ? event.composedPath() : [event.target] }
  // 事件真正落在哪个元素上：路径为空时退回 target
  static eventTarget (event) { return Utils.eventPath(event)[0] || event.target }
  // 捕获阶段重绑一次按键监听：解绑要带上同一个 capture 标志才解得掉，重复调用不会叠加出多份处理
  static rebindKeydown (handler, docs) { docs.forEach(doc => { doc.removeEventListener('keydown', handler, true); doc.addEventListener('keydown', handler, true); }); }
  // 节点是否在阴影树里；returnShadowRoot 为真时返回那个 ShadowRoot
  static inShadow (node, returnShadowRoot) {
    for (; node; node = node.parentNode) { if (node.toString() === '[object ShadowRoot]') { return returnShadowRoot ? node : true } }
    return false
  }
  // 元素是否完整落在可视窗口内
  static inView (element) {
    const viewWidth = window.innerWidth || document.documentElement.clientWidth;
    const viewHeight = window.innerHeight || document.documentElement.clientHeight;
    const { top, left, right, bottom } = element.getBoundingClientRect();
    return top >= 0 && left >= 0 && right <= viewWidth && bottom <= viewHeight
  }
  // 元素是否已不在文档里或不可见（无布局盒、隐藏、矩形全零）
  static invisible (element) {
    if (!element || element.offsetParent === null) { return true }
    if (element.style.visibility === 'hidden' || element.style.display === 'none') { return true }
    const { top, right, bottom, left, width, height } = element.getBoundingClientRect();
    return top === 0 && right === 0 && bottom === 0 && left === 0 && width === 0 && height === 0
  }
  // 页面里的单个元素，选择器由站点任务配置给出
  static q (str) { return document.querySelector(str) }
  // 属性名 -> API 方法名后缀：enhancer 的 set/lock/unlock/locked 与增强 API 的动态生成共用这一处
  static firstUpper (str) { return `${str}`.replace(/^\S/, s => s.toUpperCase()) }
  // 站点标题写到播放器与外层容器上（截图与下载文件名取值处），顺手清洗文件名非法字符
  static setTitle (player, wrap, title) {
    const safe = `${title || ''}`.replace(/[\\/:*?"<>|]/g, '-');
    if (wrap) { wrap.setAttribute('data-title', safe) }
    if (player) { player.setAttribute('data-title', safe) }
    return safe
  }
  // — 媒体元素：判定与画面区域内的命中测试
  static isMedia (element) { return element && (element instanceof HTMLMediaElement || element.HTMLMediaElement || element.HTMLVideoElement || element.HTMLAudioElement) }
  // 是不是视频元素，含被站点改造过标签名的
  static isVideo (element) { return element && (element instanceof HTMLVideoElement || element.HTMLVideoElement) }
  // 是不是音频元素，含被站点改造过标签名的
  static isAudio (element) { return element && (element instanceof HTMLAudioElement || element.HTMLAudioElement) }
  // 指针是否落在媒体元素画面区域内；bottomReserve 为下沿预留高度，缺省时按原生控制条预留 80px
  static onMedia (element, x, y, bottomReserve?) {
    if (!element || !element.getBoundingClientRect) return false
    const rect = element.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false
    const reserve = bottomReserve === undefined ? (element.controls && rect.height > 100 ? 80 : 0) : bottomReserve;
    return x > rect.left && x < rect.right && y > rect.top && y < rect.bottom - reserve
  }
  // — 运行环境：iframe、存储可用性、新标签页
  static inFrame () { return window !== window.top }
  // 是否处在跨域受限的 iframe 里（读 window.top 会抛错就是）
  static crossSite () {
    let result = true;
    try { if (window.top.localStorage || window.top.location.href) { result = false; } } catch (e) { result = true; }
    return result
  }
  // localStorage 是否可用，读写方法都在才算
  static storageUsable () { return window.localStorage && window.localStorage.getItem instanceof Function && window.localStorage.setItem instanceof Function }
  // 新标签页打开链接：同一地址 1 秒内只开一次，优先用 GM_openInTab
  static openTab (url, opts?) {
    const now = Date.now();
    const sessionKey = `r6player_openTab_${url}`;
    let lastOpenTime: any = 0;
    if (window.GM_getValue && window.GM_setValue) {
      lastOpenTime = window.GM_getValue(sessionKey, 0);
      if (lastOpenTime && (now - lastOpenTime) < 1000) { return }
      window.GM_setValue(sessionKey, now);
    } else {
      lastOpenTime = sessionStorage.getItem(sessionKey);
      if (lastOpenTime && (now - parseInt(lastOpenTime)) < 1000) { return }
      sessionStorage.setItem(sessionKey, now.toString());
    }
    if (window.GM_openInTab) { window.GM_openInTab(url, opts || { active: true, insert: true, setParent: true }) } else {
      const a = document.createElement('a');
      Object.assign(a, { href: url, target: '_blank', rel: 'noopener noreferrer' });
      Object.assign(a.style, { display: 'inline-block', width: '1px', height: '1px', opacity: 0 });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); }, 300);
    }
  }
  // 是否为 Cloudflare 的 challenge 页面
  static isChallenge () {
    const titleCheck = document.title.includes('Just a moment') ||
                       document.title.includes('Cloudflare') ||
                       document.title.includes('challenge');
    const metaRefreshExists = !!document.querySelector('meta[http-equiv="refresh"]');
    const robotsNoindexExists = !!document.querySelector('meta[name="robots"][content*="noindex"]');
    const mainWrapperExists = !!document.querySelector('.main-wrapper[role="main"]');
    const challengeErrorExists = !!document.querySelector('#challenge-error-text');
    const bodyNoJsClass = document.body && document.body.classList ? document.body.classList.contains('no-js') : false;
    const hasCloudflareStyling = document.styleSheets.length > 0 &&
                                (document.documentElement.innerHTML.includes('background-image: url(data:image/svg+xml;base64,') || document.documentElement.innerHTML.includes('challenge'));
    const metaFeatures = metaRefreshExists || robotsNoindexExists;
    const domFeatures = mainWrapperExists || challengeErrorExists || bodyNoJsClass;
    return (titleCheck && metaFeatures) ||
           (titleCheck && domFeatures) ||
           ((domFeatures && ((mainWrapperExists ? 1 : 0) + (challengeErrorExists ? 1 : 0) + (bodyNoJsClass ? 1 : 0) >= 2)) && metaFeatures) ||
           (hasCloudflareStyling && (titleCheck || metaFeatures || domFeatures))
  }
  // 取一个全局自增的 id，作为当前 TAB 的标识
  static nextTabSeq () {
    if (!window.GM_getValue || !window.GM_setValue) { return ++tabIdentity.seq }
    const gID = Number(window.GM_getValue('_global_id_') || 0) + 1;
    window.GM_setValue('_global_id_', gID);
    return gID
  }
  // 取当前 TAB 的 id，供 iframe 判断自己是否与顶层同标签
  static getTabId () {
    return new Promise((resolve, reject) => {
      if (window.GM_getTab instanceof Function) {
        window.GM_getTab(function (obj) {
          if (!obj.tabId) {
            obj.tabId = Utils.nextTabSeq();
            window.GM_saveTab(obj);
          }
          tabIdentity.id = obj.tabId;
          resolve(obj.tabId);
        });
      } else { resolve(Date.now()); }
    })
  }
  // — 函数级：节流、数值步进、参数归一、吞掉浏览器拒绝
  static throttle (fn, interval = 80) {
    let timeout = null;
    return function () {
      if (timeout) return false
      timeout = setTimeout(() => { timeout = null; }, interval);
      fn.apply(this, arguments);
    }
  }
  // 步进量：取正幅值，非数字或 0 时回落到该动作自己的默认步长；向下用 -stepValue(...)
  static stepValue (num, fallback) { return Math.abs(Number(num)) || fallback }
  // 是不是修饰键，ctrl / shift / alt / meta 的左右键名与 capsLock 都算
  static isModifier (key) {
    return [
      'ctrl', 'controlleft', 'controlright',
      'shift', 'shiftleft', 'shiftright',
      'alt', 'altleft', 'altright',
      'meta', 'metaleft', 'metaright',
      'capsLock'].includes(key.toLowerCase())
  }
  // 浏览器会以 Promise 拒绝的形式回应全屏等操作（如站点用 Permissions-Policy 禁止全屏），统一吞掉以免变成未捕获异常
  static swallow (ret, what) { if (ret && typeof ret.then === 'function' && typeof ret.catch === 'function') { ret.catch(e => console.log('[Utils] Promise拒绝吞掉', what, e)); } }
}
// 统一日志出口：不分级、不染色，全部走 console.log；开发期的跟踪日志仍只在开启「调试模式」后输出
