// 播放器域：实例认领、检出与增强动作（PlayerControl），原生全屏与网页全屏（FullScreen）
import { Utils, original } from "./Utils";
import { pageBridge, pictureKey } from "./Bridge";
import { mediaCore, supportMediaTags, mediaSource } from "./Media";
import { configManager, blocksSet, configSave, applyReload, downloadState } from "./Config";
import { taskCenter } from "./Task";
import { menu } from "./Menu";
import { tuner } from "./Tuner";
import { input } from "./Input";
export class PlayerControl {
  enhancer: any;
  playerInstance: any;
  intersectionObserver: any;
  exitTime: any;
  autoPlayed: any;
  constructor () {
    this.enhancer = null;
    this.playerInstance = null;
    this.intersectionObserver = new IntersectionObserver(entries => activePlayer.onIntersect(entries), { threshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] });
    this.exitTime = null;
    this.autoPlayed = false;
  }
  // 获取当前播放器的实例
  player () {
    if (!activePlayer.playerInstance) {
      const mediaList = activePlayer.listPlayers();
      if (mediaList.length) { activePlayer.takeInstance(mediaList[mediaList.length - 1]) }
    }
    const playerInstance = activePlayer.playerInstance;
    if (playerInstance && !activePlayer.enhancer) { activePlayer.enhancer = mediaCore.mediaPlus(playerInstance) }
    return playerInstance
  }
  // 当前认领的实例是不是音频元素
  isAudioInstance () { return Utils.isAudio(activePlayer.player()) }
  // 每个网页可能存在的多个video播放器
  listPlayers () {
    const list = mediaCore.mediaElementList;
    // 在整份文档里按受支持的标签名找媒体元素，补进全局实例列表
    function findPlayer (context) {
      supportMediaTags.forEach(tagName => {
        context.querySelectorAll(tagName).forEach(function (player) {
          if (player.tagName.toLowerCase() === 'bwp-video') { player.HTMLVideoElement = true; }
          if (Utils.isMedia(player) && !list.includes(player)) { list.push(player); }
        });
      });
    }
    findPlayer(document);
    if (window._shadowDomList_) { window._shadowDomList_.forEach(function (shadowRoot) { findPlayer(shadowRoot); }); }
    return list
  }
  // 沿父链找与播放器等宽等高的包裹节点，找不到返回 null
  getWrap () {
    const player = activePlayer.player(); if (!player) return
    let wrapDom = null;
    const playerBox = player.getBoundingClientRect();
    Utils.eachParent(player, function (parent) {
      if (parent === document || !parent.getBoundingClientRect) return
      const parentBox = parent.getBoundingClientRect();
      if (parentBox.width && parentBox.height && parentBox.width === playerBox.width && parentBox.height === playerBox.height) { wrapDom = parent; }
    });
    return wrapDom
  }
  // 初始化播放器实例：每次认领都重做的同步在门外，事件监听与全屏对象由一面旗管住，同一元素只装一次
  initInstance () {
    const player = activePlayer.playerInstance; if (!player) return
    activePlayer.enhancer = mediaCore.mediaPlus(player);
    tuner.playbackRate = tuner.getSpeed();
    input.isFocus();
    activePlayer.proxyPlay(player);
    tuner.resync();
    input.mountRunner();
    if (taskCenter.siteConf().init) { taskCenter.doTask('init', player); }
    activePlayer.once(player, '__wired__', () => {
      player._fullScreen_ = new FullScreen(player);
      player._fullPageScreen_ = new FullScreen(player, true);
      player.addEventListener('canplay', () => activePlayer.autoPlay(player));
      let setPlaybackRateOnPlayingCount = 0;
      player.addEventListener('playing', function (event) {
        tuner.resync(setPlaybackRateOnPlayingCount > 0);
        if (blocksSet('Volume') && event.target.muted === false) { tuner.setVolume(configManager.getGlobal('media.volume'), true); }
        if (blocksSet('CurrentTime')) { tuner.lockCurrentTime(); }
        tuner.restoreProgress(player);
        if (setPlaybackRateOnPlayingCount++ === 0) { setTimeout(() => { tuner.recordProgress(player); }, 2000); }
      });
      ['enterpictureinpicture', 'leavepictureinpicture'].forEach(name => {
        player.addEventListener(name, () => {
          const usePictureInPicture = name === 'enterpictureinpicture';
          if (!usePictureInPicture) { activePlayer.exitTime = Date.now(); }
          pageBridge.send(pictureKey, { usePictureInPicture });
          console.log('[Player] 画中画切换', name, player);
        });
      });
      // 把当前地址记进 srcList，留下换源历史供下载与排查用
      function srcRecord (player) {
        const src = player.currentSrc || player.src;
        if (!src) { return }
        player.srcList = player.srcList || [src];
        if (!player.srcList.includes(src)) { player.srcList.push(src); }
      }
      // 记下已缓冲到的位置；开了自动追缓冲且进度落后时把播放头顶过去
      function updateBufferedTime (player) {
        if (player.buffered.length > 0) {
          const bufferedTime = player.buffered.end(player.buffered.length - 1);
          player.bufferedTime = bufferedTime;
        }
        if (tuner.followBuffer && player.bufferedTime && activePlayer.player() === player && player.bufferedTime < player.duration - 1 && player.currentTime < player.bufferedTime - 1) {
          tuner.setCurrentTime(player.bufferedTime);
        }
      }
      const srcLogArgs = { loadeddata: () => [`${player.src} video duration: ${player.duration} video dom:`, player], durationchange: () => [`${player.duration}`], loadstart: () => [player.currentSrc, player.src] };
      Object.keys(srcLogArgs).forEach(name => { player.addEventListener(name, () => { console.log('[Player] 媒体事件', name, ...srcLogArgs[name]()); srcRecord(player); }); });
      let lastCleanMediaSourceDataTime = Date.now();
      const syncMediaSource = () => { mediaSource.bindElement(player); };
      player.addEventListener('timeupdate', () => { srcRecord(player); syncMediaSource(); });
      player.addEventListener('progress', () => {
        updateBufferedTime(player); syncMediaSource();
        if (Date.now() - lastCleanMediaSourceDataTime > 1000 * 10) { lastCleanMediaSourceDataTime = Date.now(); mediaSource.prune(); }
      });
    });
  }
  // 同一个实例上同一件事只做一次：标记位写在实例上，做过直接跳过
  once (player, flag, action) {
    if (player[flag]) { return false }
    player[flag] = true;
    action();
    return true
  }
  // 「同一类监听只装一次」的常用写法
  onceOn (player, flag, event, handler) { return activePlayer.once(player, flag, () => player.addEventListener(event, handler)) }
  // 刚关闭画中画不久，此段时间内允许跨TAB控制
  justExited () { return activePlayer.exitTime && (Date.now() - activePlayer.exitTime < 1000 * 10) }
  // 对播放器实例的 play/pause 做代理，顺带实现 _hangUp_ 挂起
  proxyPlay (player) {
    if (!player) return
    ['play','pause'].forEach(key => {
      const originKey = 'origin_' + key;
      if (Reflect.has(player, key) && !Reflect.has(player, originKey)) {
        player[originKey] = player[key];
        const proxy = new original.Proxy(player[key], {
          // play / pause 的代理：命中挂起窗口就拦掉这次调用，其余照原样转给实例
          apply (target, ctx, args) {
            const hangUpDetail = (player._hangUpInfo_ || {})[key];
            if (hangUpDetail && hangUpDetail.timeout >= Date.now()) { console.log('[Player] 调用挂起', key); return false }
            return target.apply(ctx || player, args)
          }
        });
        player[key] = proxy;
      }
    });
    if (!player._hangUp_) {
      player._hangUpInfo_ = {};
      player._hangUp_ = function (name, timeout) {
        timeout = Number(timeout) || 200;
        player._hangUpInfo_[name] = { timeout: Date.now() + timeout };
      };
      player._unHangUp_ = function (name) { if (player._hangUpInfo_ && player._hangUpInfo_[name]) { player._hangUpInfo_[name].timeout = Date.now() - 1; } };
    }
  }
  // 把当前实例、换源历史与运行环境打到调试日志
  printInfo (p) {
    const player = p || activePlayer.player();
    const info = { curPlayer: player, srcList: player.srcList, mediaSource, window };
    console.log('[Player] 实例信息', info);
  }
  // 认下当前实例：换实例就得把它重新接一遍线
  takeInstance (el) { activePlayer.playerInstance = el; activePlayer.initInstance(); }
  // 视口观察回调：一轮 entries 里只认「可见比例最大且超过 0.4」的那个元素
  onIntersect (entries) {
    let tmpIntersectionRatio = 0;
    entries.forEach(entrie => {
      entrie.target._intersectionInfo_ = entrie;
      if (entrie.intersectionRatio > tmpIntersectionRatio && entrie.intersectionRatio > 0.4) {
        tmpIntersectionRatio = entrie.intersectionRatio;
        const oldPlayer = activePlayer.player();
        if (oldPlayer && oldPlayer._intersectionInfo_ && tmpIntersectionRatio < oldPlayer._intersectionInfo_.intersectionRatio) { return }
        const toggleResult = activePlayer.claim(entrie.target);
        toggleResult && console.log('[Player] 实例切换', entrie);
      }
    });
  }
  // 判定要不要把这个元素认领为当前实例：视频看尺寸够不够大，音频只在原本就是音频、或原实例已脱离文档时才换
  claim (el) {
    if (!el || !el.getBoundingClientRect) { return false }
    if (activePlayer.player() === el) { return false }
    if (!activePlayer.playerInstance && Utils.isMedia(el)) { activePlayer.takeInstance(el); return true }
    if (Utils.isVideo(el)) {
      const container = menu.tipsHost(el);
      const elInfo = el.getBoundingClientRect();
      const parentElInfo = container && container.getBoundingClientRect();
      if (elInfo && elInfo.width > 200 && parentElInfo && parentElInfo.width > 200) { activePlayer.takeInstance(el) }
    } else if (Utils.isAudio(el)) {
      const cur = activePlayer.playerInstance;
      if (Utils.isAudio(cur) || (Utils.isVideo(cur) && !cur.isConnected)) { activePlayer.takeInstance(el) }
    }
  }
  // 检出页面上可接管的播放器实例
  detectPlayer () {
    const playerList = activePlayer.listPlayers();
    if (playerList.length) {
      if (playerList.length === 1) { activePlayer.takeInstance(playerList[0]) }
      playerList.forEach(function (player) {
        activePlayer.onceOn(player, '_hasMouseRedirectEvent_', 'mouseenter', event => activePlayer.claim(event.target));
        activePlayer.onceOn(player, '_hasPlayingRedirectEvent_', 'playing', event => {
          const media = event.target;
          if (media.duration && media.duration < 8) { return false }
          activePlayer.claim(media);
        });
        activePlayer.once(player, '_hasIntersectionObserver_', () => activePlayer.intersectionObserver.observe(player));
      });
      if (Utils.crossSite()) {
        const curPlayer = activePlayer.playerInstance;
        if (curPlayer) { pageBridge.send('videoDetected', { src: curPlayer.src }); }
      }
    }
  }
  // 自动播放：只有站点任务表配了 autoPlay 才走，按钮未就绪时轮询重试
  autoPlay (p) {
    const player = p || activePlayer.player();
    const taskConf = taskCenter.siteConf();
    if (taskConf.autoPlay && configManager.getLocal('media.autoPlay') === null) { configManager.setLocal('media.autoPlay', true); }
    if (!configManager.get('media.autoPlay') || (!p && activePlayer.autoPlayed) || !player || (p && p !== activePlayer.player()) || document.hidden) { return false }
    if (!Utils.inView(player) || Utils.inFrame()) { return false }
    if (!taskConf.autoPlay) { return false }
    activePlayer.autoPlayed = true;
    if (!player.paused) { return }
    taskCenter.doTask('autoPlay');
    if (!player.paused) { return }
    player._initAutoPlayCount_ = (player._initAutoPlayCount_ || 0) + 1;
    if (player._initAutoPlayCount_ >= 10) { return false }
    setTimeout(function () { activePlayer.autoPlay(player); }, 200);
  }
  // 全屏与网页全屏只差一个站点任务和一种包裹实例，其余逻辑同构
  toggleScreen (task, screenKey) {
    const player = activePlayer.player();
    if (!taskCenter.doTask(task) && player && player[screenKey]) { player[screenKey].toggle(); }
  }
  // 设置视频全屏
  maximize () { return activePlayer.toggleScreen('fullScreen', '_fullScreen_') }
  // 设置页面全屏
  webMaximize () { return activePlayer.toggleScreen('webFullScreen', '_fullPageScreen_') }
  // 切换画中画
  togglePicture () {
    const player = activePlayer.player();
    const exiting = window._isPictureInPicture_ && document.pictureInPictureElement;
    const task = exiting ? document.exitPictureInPicture() : player && player.requestPictureInPicture && player.requestPictureInPicture();
    if (!task) { return }
    const settle = state => () => { window._isPictureInPicture_ = state; };
    const failed = e => { window._isPictureInPicture_ = null; console.log('[Player] 画中画切换异常', e); };
    task.then(settle(exiting ? null : true)).catch(failed);
  }
  // 播放下一个视频，默认是没有这个功能的，只有在任务中心里配置了next字段才会有该功能
  nextVideo () {
    const isDo = taskCenter.doTask('next');
    if (!isDo) { console.log('[Player] 下一集不支持'); }
  }
  // 切换播放状态
  switchPlay () {
    const player = activePlayer.player();
    if (taskCenter.doTask('switchPlay')) { return }
    const isPlay = player.paused;
    const action = isPlay ? 'play' : 'pause';
    const other = isPlay ? 'pause' : 'play';
    const api = activePlayer.enhancer;
    if (!taskCenter.doTask(action)) {
      if (api && api.applyPlay && api.applyPause) {
        isPlay ? api.lockPause(400) : api.lockPlay(400);
        Utils.swallow(isPlay ? api.applyPlay() : api.applyPause(), '切换播放状态');
      } else {
        if (player._hangUp_) { player._hangUp_(other, 400); player._unHangUp_(action); }
        Utils.swallow(isPlay ? player.play() : player.pause(), '切换播放状态');
      }
      menu.tips(isPlay ? '播放' : '暂停');
    }
    taskCenter.doTask(isPlay ? 'afterPlay' : 'afterPause');
  }
  // 菜单里的下载入口：没开实验性功能就直接开启并重载
  mediaDownload () {
    if (!configManager.get('enhance.allowExperimentFeatures')) {
      applyReload(() => configSave('global', 'enhance.allowExperimentFeatures', true));
      return
    }
    console.log('[Player] 流下载启用');
    PlayerControl.downloadMedia(activePlayer.player());
  }
  // 截图入口：抓不到画面就提示；后台页里先冻帧再截
  capture () {
    const player = activePlayer.player();
    const canvas = activePlayer.grabCanvas(player, true);
    if (!canvas) {
      menu.tips('当前没有可截取的画面，请稍后再试');
      return
    }
    if (!player.paused && !document.pictureInPictureElement && document.visibilityState !== 'visible') { tuner.freezeFrame(); }
  }
  // 把截图写进剪贴板：无权限、没有用户手势、剪贴板API不可用都是正常情况，不该变成未捕获拒绝
  static async setClipboard (blob) {
    try {
      if (!navigator.clipboard) {
        console.log('[Player] 剪贴板不可用', 'https://developer.mozilla.org/en-US/docs/Web/API/Clipboard');
        return false
      }
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
      console.log('[Player] 剪贴板写入成功', blob.type);
      return true
    } catch (e) {
      console.log('[Player] 剪贴板写入失败', blob && blob.type, e);
      return false
    }
  }
  // 截图：把当前帧画进 canvas，download 为真则落盘，否则开预览页
  grabCanvas (video, download, title) {
    if (!video) return false
    const currentTime = `${Math.floor(video.currentTime / 60)}'${(video.currentTime % 60).toFixed(3)}''`;
    const captureTitle = title || `${document.title}_${currentTime}`;
    video.setAttribute('crossorigin', 'anonymous');
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    if (!canvas.width || !canvas.height) {
      console.log('[Player] 截图画面缺失');
      return false
    }
    const context = canvas.getContext('2d');
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (download) { activePlayer.saveCanvas(canvas, captureTitle, video); } else { activePlayer.previe(canvas, captureTitle); }
    return canvas
  }
  // 预览截图
  previe (canvas, title) {
    canvas.style = 'max-width:100%';
    const previewPage = window.open('', '_blank');
    previewPage.document.title = `capture previe - ${title || 'Untitled'}`;
    previewPage.document.body.style.textAlign = 'center';
    previewPage.document.body.style.background = '#000';
    previewPage.document.body.appendChild(canvas);
  }
  // canvas 下载截图：先复制到剪贴板再下载，避免下载导致页面失焦
  saveCanvas (canvas, title, video) {
    title = title || 'videoCapturer_' + Date.now();
    // blob 是否可用，不可用即说明画布导出被 CORS 限制
    function isUsable (blob, action) {
      if (blob) return true
      console.log('[Player] 画布导出失败', action, video);
      return false
    }
    try {
      canvas.toBlob(function (blob) {
        if (!isUsable(blob, '复制到剪贴板')) { return }
        PlayerControl.setClipboard(blob);
      }, 'image/png', 0.99);
    } catch (e) { console.log('[Player] 剪贴板复制失败', e); }
    try {
      canvas.toBlob(function (blob) {
        if (!isUsable(blob, '下载截图')) { return activePlayer.previe(canvas, title) }
        const el = document.createElement('a');
        el.download = `${title}.jpg`;
        el.href = URL.createObjectURL(blob);
        el.click();
      }, 'image/jpeg', 0.99);
    } catch (e) {
      activePlayer.previe(canvas, title);
      console.log('[Player] 截图下载受限', video, e, 'https://developer.mozilla.org/en-US/docs/Web/HTTP/CORS');
    }
  }
  // 造一个 a 标签触发浏览器下载
  static saveFile (url, title) {
    const downloadEl = document.createElement('a');
    downloadEl.href = url;
    downloadEl.target = '_blank';
    downloadEl.download = title;
    downloadEl.click();
  }
  // 下载媒体：blob 与短视频走 fetch 再落盘，长视频直接交回浏览器；重复下载按状态逐级确认
  static downloadMedia (mediaEl, title?, downloadType?) {
    const mediaUrl = mediaEl.src || mediaEl.currentSrc;
    const mediaState = downloadState.get(mediaUrl) || {};
    if (mediaUrl && !mediaUrl.startsWith('blob:')) {
      const isVideo = mediaEl instanceof HTMLVideoElement;
      const mediaInfo = { type: isVideo ? 'video' : 'audio', format: isVideo ? 'mp4' : 'mp3' };
      let mediaTitle = `${title || mediaEl.getAttribute('data-title') || document.title || Date.now()}_${mediaInfo.type}.${mediaInfo.format}`;
      if (downloadType === 'blob' || mediaEl.duration < 60 * 5) {
        if (mediaState.downloading && Date.now() - mediaState.downloading < 1000 * 1) { return false }
        if (!mediaTitle.endsWith(mediaInfo.format)) { mediaTitle = mediaTitle + '.' + mediaInfo.format; }
        let fetchUrl = mediaUrl;
        if (mediaUrl.startsWith('http://') && location.href.startsWith('https://')) { fetchUrl = mediaUrl.replace('http://', 'https://'); }
        const mark = patch => { Object.assign(mediaState, patch); downloadState.set(mediaUrl, mediaState); };
        mark({ downloading: Date.now() });
        fetch(fetchUrl).then(res => res.blob()).then(blob => {
          const blobUrl = window.URL.createObjectURL(blob);
          activePlayer.saveFile(blobUrl, mediaTitle);
          mark({ downloading: undefined, hasDownload: true });
          window.URL.revokeObjectURL(blobUrl);
        }).catch(err => {
          console.log('[Player] fetch下载失败', err);
          activePlayer.saveFile(mediaUrl, mediaTitle);
          mark({ downloading: undefined, hasDownload: true });
        });
      } else { activePlayer.saveFile(mediaUrl, mediaTitle); }
    } else if (mediaSource.hasInit()) { mediaSource.downloadStream(mediaEl, title); } else { console.log('[Player] 下载通道缺失', mediaEl); }
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let activePlayer = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createPlayer = () => { activePlayer = new PlayerControl(); return activePlayer };
// 页面里所有 FullScreen 实例，按登记顺序接收 Esc
export const fullScreenInstances = [];
// 全屏样式只往全局页面注入一次：标记留在本模块，不再挂到 window 上
let fullPageStyleInjected = false;
window.addEventListener('keyup', event => {
  if (event.key && event.key.toLowerCase() === 'escape') { fullScreenInstances.forEach(inst => inst.onEscape()); }
}, true);
export class FullScreen {
  dom: any;
  shadowRoot: any;
  fullStatus: any;
  pageMode: any;
  _container_: any;
  constructor (dom, pageMode?) {
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
      Utils.addStyle(fullPageStyle, 'fullPageStyle', shadowRoot);
    }
    fullScreenInstances.push(this);
    this.getContainer();
  }
  // 按 Esc：先退页面全屏，再退浏览器原生全屏，与原实现每个实例各自的判断一致
  onEscape () {
    if (this.isFull()) { this.exit(); } else if (this.isFullScreen()) { this.exitFullScreen(); }
  }
  // 沿父链找包裹容器：第一个比画面小的父节点就是它，标记后缓存下来
  getContainer () {
    if (this._container_) return this._container_
    const d = this.dom;
    const domBox = d.getBoundingClientRect();
    let container = d;
    Utils.eachParent(d, parentNode => {
      const noParentNode = !parentNode || !parentNode.getBoundingClientRect;
      if (noParentNode || parentNode.getAttribute('data-fullscreen-container')) {
        container = parentNode;
        return true
      }
      const parentBox = parentNode.getBoundingClientRect();
      const isInsideTheBox = parentBox.width <= domBox.width && parentBox.height <= domBox.height;
      if (isInsideTheBox) { container = parentNode; } else { return true }
    }, true);
    container.setAttribute('data-fullscreen-container', 'true');
    this._container_ = container;
    return container
  }
  // 当前是否处于「网页全屏」——脚本自己铺的样式，或本实例的状态位
  isFull () { return this.dom.classList.contains('_webfullscreen_') || this.fullStatus }
  // 浏览器原生全屏是否生效（跨前缀各查一遍）
  isFullScreen () {
    return !!(document.fullscreen || document.webkitIsFullScreen || document.mozFullScreen || document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement)
  }
  // 在包裹容器上请求浏览器原生全屏，跨前缀挑一个可用方法
  enterFullScreen () {
    const container = this.getContainer();
    const enterFn = container.requestFullscreen || container.webkitRequestFullScreen || container.mozRequestFullScreen || container.msRequestFullScreen;
    Utils.swallow(enterFn && enterFn.call(container), '进入全屏');
  }
  // 进入网页全屏：沿父链铺全屏样式、容器那层起提层级；页面模式不碰原生全屏
  enter () {
    if (this.isFull()) return
    const container = this.getContainer();
    let needSetIndex = this.dom === container;
    const addFullscreenStyleToParentNode = node => Utils.eachParent(node, parentNode => {
      parentNode.classList.add('_webfullscreen_');
      if (container === parentNode || needSetIndex) {
        needSetIndex = true;
        parentNode.classList.add('_webfullscreen_zindex_');
      }
    }, true);
    addFullscreenStyleToParentNode(this.dom);
    if (this.dom.parentNode) {
      const domBox = this.dom.getBoundingClientRect();
      const domParentBox = this.dom.parentNode.getBoundingClientRect();
      if (domParentBox.width - domBox.width >= 5) { this.dom.classList.add('_webfullscreen_'); }
      if (this.shadowRoot && this.shadowRoot._shadowHost) {
        const shadowHost = this.shadowRoot._shadowHost;
        const shadowHostBox = shadowHost.getBoundingClientRect();
        if (shadowHostBox.width <= domBox.width) {
          shadowHost.classList.add('_webfullscreen_');
          addFullscreenStyleToParentNode(shadowHost);
        }
      }
    }
    if (!this.pageMode) { this.enterFullScreen(); }
    this.fullStatus = true;
  }
  // 退出浏览器原生全屏，跨前缀挑一个可用方法
  exitFullScreen () {
    const exitFn = document.exitFullscreen || document.webkitExitFullscreen || document.mozCancelFullScreen || document.msExitFullscreen;
    Utils.swallow(exitFn && exitFn.call(document), '退出全屏');
  }
  // 退出网页全屏：摘掉沿父链铺的样式与层级；页面模式只在原生全屏生效时才退
  exit () {
    const removeFullscreenStyleToParentNode = node => Utils.eachParent(node, parentNode => {
      parentNode.classList.remove('_webfullscreen_');
      parentNode.classList.remove('_webfullscreen_zindex_');
    }, true);
    removeFullscreenStyleToParentNode(this.dom);
    this.dom.classList.remove('_webfullscreen_');
    if (this.shadowRoot && this.shadowRoot._shadowHost) {
      const shadowHost = this.shadowRoot._shadowHost;
      shadowHost.classList.remove('_webfullscreen_');
      removeFullscreenStyleToParentNode(shadowHost);
    }
    if (!this.pageMode || this.isFullScreen()) { this.exitFullScreen(); }
    this.fullStatus = false;
  }
  // 按当前状态在进 / 退之间翻转
  toggle () { this.isFull() ? this.exit() : this.enter(); }
}
