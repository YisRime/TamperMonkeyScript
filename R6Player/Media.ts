// 媒体域：媒体标签检测与增强 API（MediaCore）、MediaSource 流记录与合并下载（SourceControl）、响度增益（Amplifier）
import { Utils, original } from "./Utils";
import { activePlayer } from "./Player";
// 媒体标签检测：video、audio，以及标签名被站点改造过的媒体元素（如 B 站的 bwp-video）页面上认作“媒体标签”的名字，含被站点改造过标签名的视频
export const supportMediaTags = ['video', 'bwp-video'];
export class MediaCore {
  inited: any;
  proxied: any;
  originDescriptors: any;
  originMethods: any;
  mediaElementList: any;
  mediaElementHandler: any;
  mediaMap: any;
  plusProps: any;
  plusMethods: any;
  constructor () {
    this.inited = false;
    this.proxied = false;
    this.originDescriptors = {};
    this.originMethods = {};
    this.mediaElementList = [];
    this.mediaElementHandler = [];
    this.mediaMap = new original.Map();
    this.plusProps = ['playbackRate', 'volume', 'currentTime'];
    this.plusMethods = ['play', 'pause'];
  }
  // 是不是原生 HTMLMediaElement，用启动时的快照判，站点后打的补丁改不动它
  isNative (el) { return el instanceof original.HTMLMediaElement }
  // 为一个媒体元素建增强 API：按 plusProps/plusMethods 生成 lock/unlock/locked/get/set/apply 的派生方法
  mediaPlus (mediaElement) {
    if (!mediaCore.isNative(mediaElement)) { return false }
    let enhancer = original.map.get.call(mediaCore.mediaMap, mediaElement);
    if (enhancer) { return enhancer }
    const mediaPlusBaseApi = {
      // 锁住某个属性：带时长就到期自动解锁，不带就一锁到底
      lock (keyName, duration) {
        const infoKey = `__${keyName}_info__`;
        enhancer[infoKey] = enhancer[infoKey] || {};
        enhancer[infoKey].lock = true;
        duration = Number(duration);
        if (!Number.isNaN(duration) && duration > 0) { enhancer[infoKey].unlockTime = Date.now() + duration; }
      },
      // 解锁某个属性，到期时间回拨到过去
      unlock (keyName) {
        const infoKey = `__${keyName}_info__`;
        enhancer[infoKey] = enhancer[infoKey] || {};
        enhancer[infoKey].lock = false;
        enhancer[infoKey].unlockTime = Date.now() - 100;
      },
      // 某个属性当前是否被锁：有到期时间按时间判，没有就看标记
      locked (keyName) {
        const info = enhancer[`__${keyName}_info__`] || {};
        return info.unlockTime ? Date.now() < info.unlockTime : !!info.lock
      },
      // 读原型上的取值器，只对已被代理的属性走这条路
      get (keyName) { if (mediaCore.originDescriptors[keyName] && mediaCore.originDescriptors[keyName].get && !mediaCore.originMethods[keyName]) { return mediaCore.originDescriptors[keyName].get.apply(mediaElement) } },
      // 写原型上的设值器，只对已被代理的属性走这条路
      set (keyName, val) {
        if (mediaCore.originDescriptors[keyName] && mediaCore.originDescriptors[keyName].set && !mediaCore.originMethods[keyName] && typeof val !== 'undefined') { return mediaCore.originDescriptors[keyName].set.apply(mediaElement, [val]) }
      },
      // 调原型上的方法（play / pause 这类），第一个参数是方法名
      apply (keyName) {
        if (mediaCore.originMethods[keyName] instanceof Function) {
          const args = Array.from(arguments);
          args.shift();
          return mediaCore.originMethods[keyName].apply(mediaElement, args)
        }
      }
    };
    enhancer = { ...mediaPlusBaseApi };
    const extApiKeys = mediaCore.plusProps.concat(mediaCore.plusMethods);
    const baseApiKeys = Object.keys(mediaPlusBaseApi);
    extApiKeys.forEach(key => {
      const isMethod = mediaCore.originMethods[key] instanceof Function;
      baseApiKeys.forEach(baseKey => {
        if (isMethod ? (baseKey === 'get' || baseKey === 'set') : baseKey === 'apply') { return }
        enhancer[`${baseKey}${Utils.firstUpper(key)}`] = function () { return mediaPlusBaseApi[baseKey].apply(null, [key, ...arguments]) };
      });
    });
    original.map.set.call(mediaCore.mediaMap, mediaElement, enhancer);
    return enhancer
  }
  // 认领一个媒体元素：进全局列表、建增强 API、再逐个通知检测回调
  admit (ctx) {
    if (mediaCore.isNative(ctx) && !mediaCore.mediaElementList.includes(ctx)) {
      mediaCore.mediaElementList.push(ctx);
      mediaCore.mediaPlus(ctx);
      try { mediaCore.mediaElementHandler.forEach(handler => { (handler instanceof Function) && handler(ctx); }); } catch (e) { console.log('[Media] 检出回调异常', e); }
    }
  }
  // 给原型方法套代理：先认领调用者，被锁住的方法直接拦掉
  proxyMethod (element, methodName) {
    const originFunc = element && element.prototype[methodName];
    if (!originFunc) return
    element.prototype[methodName] = new original.Proxy(originFunc, {
      // 方法代理的入口：先认领 ctx，命中锁定就返回，否则转给原方法
      apply (target, ctx, args) {
        mediaCore.admit(ctx);
        if (mediaCore.plusMethods.includes(methodName)) {
          const enhancer = mediaCore.mediaPlus(ctx);
          if (enhancer && enhancer.locked(methodName)) { return }
        }
        return target.apply(ctx, args)
      }
    });
  }
  // 劫持原型属性：读时被锁按属性回缺省值，写时被锁直接吞掉，src 赋值顺带触发检出
  hijackProp (element, property) {
    if (!element || !element.prototype || !mediaCore.originDescriptors[property]) { return false }
    original.Object.defineProperty.call(Object, element.prototype, property, {
      configurable: true,
      enumerable: true,
      get: function () {
        const val = mediaCore.originDescriptors[property].get.apply(this, arguments);
        const enhancer = mediaCore.mediaPlus(this);
        if (enhancer && enhancer.locked(property)) { if (property === 'playbackRate') { return 1}}
        return val
      },
      set: function (value) {
        if (property === 'src') { mediaCore.admit(this); }
        if (mediaCore.plusProps.includes(property)) {
          const enhancer = mediaCore.mediaPlus(this);
          if (enhancer && enhancer.locked(property)) { return }
        }
        return mediaCore.originDescriptors[property].set.apply(this, arguments)
      }
    });
  }
  // 把一项设置同步到页面上的其它媒体元素，当前实例由调用方自己处理
  eachOther (except, apply) {
    activePlayer.listPlayers().forEach(media => {
      if (media === except) return
      const api = mediaCore.mediaPlus(media);
      if (api) { apply(api) }
    });
  }
  // 装媒体元素代理：play / pause / load / addEventListener 与四个属性各劫持一次，只装一次
  mediaProxy () {
    if (!mediaCore.proxied) {
      const proxyMethods = ['play', 'pause', 'load', 'addEventListener'];
      proxyMethods.forEach(methodName => { mediaCore.proxyMethod(HTMLMediaElement, methodName); });
      mediaCore.plusProps.concat(['src']).forEach(property => { mediaCore.hijackProp(HTMLMediaElement, property); });
      mediaCore.proxied = true;
    }
    return mediaCore.proxied
  }
  // 登记检测回调并保证代理已装好，返回当前实例列表
  mediaChecker (handler) {
    if (!(handler instanceof Function) || mediaCore.mediaElementHandler.includes(handler)) { return mediaCore.mediaElementList } else { mediaCore.mediaElementHandler.push(handler); }
    if (!mediaCore.proxied) { mediaCore.mediaProxy(); }
    return mediaCore.mediaElementList
  }
  // 初始化媒体核心：先留原型描述符与方法快照，再装代理与检测回调，只初始化一次
  init (mediaCheckerHandler) {
    if (mediaCore.inited) { return false }
    mediaCore.originDescriptors = Object.getOwnPropertyDescriptors(HTMLMediaElement.prototype);
    Utils.snapMethods(HTMLMediaElement.prototype, mediaCore.originMethods);
    mediaCheckerHandler = mediaCheckerHandler instanceof Function ? mediaCheckerHandler : function () {};
    mediaCore.mediaChecker(mediaCheckerHandler);
    mediaCore.inited = true;
    return true
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let mediaCore = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createMedia = () => { mediaCore = new MediaCore(); return mediaCore };
// MediaSource 媒体流的记录与合并下载（实验性功能）
export class SourceControl {
  hasMediaSourceInit: any;
  originMethods: any;
  urlMethods: any;
  sourceMap: any;
  urlMap: any;
  constructor () {
    this.hasMediaSourceInit = false;
    this.originMethods = {};
    this.urlMethods = {};
    this.sourceMap = new original.Map();
    this.urlMap = new original.Map();
  }
  // 把媒体元素认领到它的 MediaSource 记录上，按 objectURL 对上号
  bindElement (mediaEl) {
    const curSrc = mediaEl.currentSrc || mediaEl.src;
    if (!curSrc) { return false }
    mediaSource.sourceMap.forEach(mediaSourceInfo => { if (mediaSourceInfo.mediaSource.__objURL__ && curSrc === mediaSourceInfo.mediaSource.__objURL__) { mediaSourceInfo.mediaElement = mediaEl; } });
  }
  // 关联的媒体元素已脱文档或不可见时，清掉缓冲数据与元素引用并从两张表里摘除，减少内存占用
  prune () {
    mediaSource.sourceMap.forEach((mediaSourceInfo) => {
      const mediaElement = mediaSourceInfo.mediaElement;
      if (!(mediaElement instanceof HTMLMediaElement) || Utils.invisible(mediaElement)) {
        if (mediaSourceInfo.sourceBuffer && mediaSourceInfo.sourceBuffer.length) {
          mediaSourceInfo.sourceBuffer.forEach(sourceBufferItem => {
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
  proxySource () {
    if (!mediaSource.originMethods.addSourceBuffer || !mediaSource.originMethods.endOfStream) { return false }
    mediaSource.urlMethods.createObjectURL = mediaSource.urlMethods.createObjectURL || URL.prototype.constructor.createObjectURL;
    URL.prototype.constructor.createObjectURL = new original.Proxy(mediaSource.urlMethods.createObjectURL, {
      // 记下 objectURL 与 MediaSource 的对应关系
      apply (target, ctx, args) {
        const object = args[0];
        const objectURL = target.apply(ctx, args);
        if (object instanceof MediaSource && !original.map.has.call(mediaSource.urlMap, object)) {
          object.__objURL__ = objectURL;
          original.map.set.call(mediaSource.urlMap, object, objectURL);
        }
        return objectURL
      }
    });
    MediaSource.prototype.addSourceBuffer = new original.Proxy(mediaSource.originMethods.addSourceBuffer, {
      // 新开一条记录，并把 sourceBuffer 的 appendBuffer 也换成代理来攒数据
      apply (target, ctx, args) {
        if (!original.map.has.call(mediaSource.sourceMap, ctx)) { original.map.set.call(mediaSource.sourceMap, ctx, { mediaSource: ctx, createTime: Date.now(), sourceBuffer: [], endOfStream: false }) }
        const mediaSourceInfo = original.map.get.call(mediaSource.sourceMap, ctx);
        const mimeCodecs = args[0] || '';
        const sourceBuffer = target.apply(ctx, args);
        const sourceBufferItem = { mimeCodecs, originAppendBuffer: sourceBuffer.appendBuffer, bufferData: [], mediaInfo: {} as any };
        try {
          const mediaInfo = sourceBufferItem.mediaInfo;
          const tmpArr = sourceBufferItem.mimeCodecs.split(';');
          mediaInfo.type = tmpArr[0].split('/')[0];
          mediaInfo.format = tmpArr[0].split('/')[1];
          mediaInfo.codecs = tmpArr[1].trim().replace('codecs=', '').replace(/["']/g, '');
        } catch (e) { console.log('[Media] 媒体信息解析异常', sourceBufferItem, e); }
        mediaSourceInfo.sourceBuffer.push(sourceBufferItem);
        sourceBuffer.appendBuffer = new original.Proxy(sourceBufferItem.originAppendBuffer, {
          // 缓存这一段流数据
          apply (bufTarget, bufCtx, bufArgs) {
            if (!mediaSourceInfo.endOfStream) { sourceBufferItem.bufferData.push(bufArgs[0]); }
            return bufTarget.apply(bufCtx, bufArgs)
          }
        });
        return sourceBuffer
      }
    });
    MediaSource.prototype.endOfStream = new original.Proxy(mediaSource.originMethods.endOfStream, {
      // 流结束：标记完成
      apply (target, ctx, args) {
        const mediaSourceInfo = original.map.get.call(mediaSource.sourceMap, ctx);
        if (mediaSourceInfo) { mediaSourceInfo.endOfStream = true; }
        return target.apply(ctx, args)
      }
    });
  }
  // 下载由 MediaSource 管理的媒体文件：不再弹确认与命名框，未就绪也直接下已缓冲的部分
  downloadStream (mediaEl, title) {
    const curSrc = mediaEl.currentSrc || mediaEl.src;
    if (!curSrc) {
      console.log('[Media] 下载地址缺失');
      return false
    }
    let hasFindMediaSource = false;
    mediaSource.sourceMap.forEach(mediaSourceInfo => {
      const source = mediaSourceInfo.mediaSource;
      if (!source.__objURL__) {
        console.log('[Media] objectURL缺失', source, mediaSourceInfo);
        return false
      }
      if (curSrc !== source.__objURL__) { return false }
      hasFindMediaSource = true;
      mediaSourceInfo.mediaElement = mediaEl;
      let mediaSourceTitle = null;
      mediaSourceInfo.sourceBuffer.forEach(sourceBufferItem => {
        if (!sourceBufferItem.mimeCodecs || sourceBufferItem.mimeCodecs.toString().indexOf(';') === -1) {
          console.log('[Media] 流信息异常无法下载', sourceBufferItem);
          return false
        }
        try {
          const mediaTitle = `${mediaSourceTitle || sourceBufferItem.mediaInfo.title || title || mediaEl.getAttribute('data-title') || document.title || Date.now()}`;
          mediaSourceTitle = mediaTitle;
          const fileName = `${mediaTitle}_${sourceBufferItem.mediaInfo.type}.${sourceBufferItem.mediaInfo.format}`;
          const a = document.createElement('a');
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
          console.log('[Media] 流下载异常', e);
        }
      });
    });
    if (!hasFindMediaSource) { console.log('[Media] 媒体流未找到', curSrc); }
  }
  // MediaSource 相关代理是否已装好
  hasInit () { return mediaSource.hasMediaSourceInit }
  // 装 MediaSource 代理：先留一份原型方法快照，再逐个套代理，只装一次
  init () {
    if (mediaSource.hasMediaSourceInit) { return false }
    if (!window.MediaSource) { return false }
    Utils.snapMethods(MediaSource.prototype, mediaSource.originMethods);
    mediaSource.proxySource();
    mediaSource.hasMediaSourceInit = true;
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let mediaSource = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createSource = () => { mediaSource = new SourceControl(); return mediaSource };
// 媒体声音响度增益：开启「音量增益能力」后按需实例化，外部只用得上 setLoudness
// @license Copyright 2017 - Chris West - MIT Licensed · https://cwestblog.com/2017/08/22/web-audio-api-controlling-audio-video-loudness/
export class Amplifier {
  _source: any;
  _gain: any;
  constructor (mediaElem) {
    const context = new (window.AudioContext || window.webkitAudioContext)();
    this._source = context.createMediaElementSource(mediaElem);
    this._source.connect(this._gain = context.createGain());
    this._gain.connect(context.destination);
  }
  // 响度 → 分贝 → 增益倍数两条换算一步到位（每 10 分贝翻一倍）
  setLoudness (value) { this._gain.gain.value = Math.pow(10, 10 * Math.log2(value) / 20) }
}
