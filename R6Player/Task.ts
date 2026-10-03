// 任务域：站点任务表（taskConf 与各公共外壳）与任务配置中心（TaskControl / taskCenter / installTasks）
import { Utils } from "./Utils";
import { activePlayer } from "./Player";
import { tuner } from "./Tuner";
// 站点任务表：键名是一级域名或 host；可复用的实现就是本文件里表前面那批壳——建表时就要调用它们，同模块才谈得上求值顺序站点任务的公共外壳：多家站点只差选择器或按钮标题，重复的那几件小事各收成一处站点任务脚本自己的临时状态，过去借组合根存放，如今有明确的归属
export const taskScratch: any = {};
// 多个站点重复的几件小事，各收成一处：任务表里只写“用哪一个”
export const allowCross = () => { activePlayer.player().setAttribute('crossOrigin', 'anonymous'); };
export const xgplayerTask = { fullScreen: '.xgplayer-fullscreen', webFullScreen: '.xgplayer-page-full-screen', next: ['.xgplayer-playswitch-next'] };
// “按 Esc 做一件事”的外壳：注册键与取 event 由这里统一管，站点只写真正不同的那一段
export const escapeTask = body => ({ register: ['escape'], callback: (taskConf, data) => { const { event } = data; if (event.keyCode === 27) { body(taskConf, data) } } });
// 藏水印的站点只差选择器：延迟把元素透明度置 0（缺省 5 秒），动作同一个
export const watermarkTask = (...selectors) => () => { selectors.forEach(sel => setTimeout(() => { const dom = document.querySelector(sel); if (dom) { dom.style.opacity = 0; } }, 1000 * 5)); };
// facebook 的视频卡片只有一排按钮，全屏与网页全屏点的都是倒数第二个
export const facebookTask = () => {
  const actionBtn = activePlayer.player().parentNode.querySelectorAll('button');
  if (actionBtn && actionBtn.length > 3) { actionBtn[actionBtn.length - 2].click(); return true }
};
// 斗鱼的全屏与网页全屏只差状态位和两个按钮标题：按当前状态点其中一个，再把状态翻回去
export const douyuScreen = (flag, enter, exit) => () => {
  const player = activePlayer.player();
  const container = player._fullScreen_.getContainer();
  container.querySelector(`div[title="${player[flag] ? exit : enter}"]`).click();
  player[flag] = !player[flag];
  return true
};
// 标题要等鼠标移到卡片上才拿得着，两家共用的外壳负责：找包裹节点、听一次 mouseover、再补一次延时尝试
export const hoverTitle = (wrapSelector, delay, readTitle) => (taskConf) => {
  const player = activePlayer.player();
  const wrapEl = player && player.closest(wrapSelector);
  if (!wrapEl) return
  const run = () => {
    if (wrapEl.getAttribute('data-title')) { return }
    if (readTitle(player, wrapEl)) { wrapEl.removeEventListener('mouseover', run) }
  };
  wrapEl.addEventListener('mouseover', run);
  setTimeout(run, delay);
};
// 抖音标题任务：套 hoverTitle 外壳，从卡片里取「标题 - 账号名」写进 document.title
export const douyinTitle = hoverTitle('div[data-e2e="feed-item"]', 1200, (player, wrapEl) => {
  const videoInfo = wrapEl.querySelector('.video-info-detail');
  if (!videoInfo) { return false }
  const accountName = videoInfo.querySelector('.account-name').innerText.replace(/^@*/, '');
  const titleText = videoInfo.querySelector('.title').innerText.trim();
  document.title = Utils.setTitle(player, wrapEl, `${titleText} - ${accountName}`);
  return true
});
// 站点任务表本体：键是 host 或一级域名，值是任务名到实现 / 选择器的映射
export const taskConf = {
  'youtube.com': {
    init: function (taskConf) {
      if (taskScratch.hasBindSkipAdEvents) { return }
      const startTime = new Date().getTime();
      let skipCount = 0;
      const skipHandler = (element) => {
        const endTime = new Date().getTime();
        const time = endTime - startTime;
        if (time < 3000) { return false }
        if (document.hidden) { return false }
        element.click();
        skipCount++;
        console.log('[Task] 广告跳过', skipCount);
      };
      Utils.ready('.ytp-ad-skip-button', function (element) { skipHandler(element); });
      Utils.ready('.ytp-ad-skip-button-modern', function (element) { skipHandler(element); });
      setInterval(function () {
        const adSkipBtn = document.querySelector('.ytp-ad-skip-button');
        const adSkipBtnModern = document.querySelector('.ytp-ad-skip-button-modern');
        adSkipBtn && skipHandler(adSkipBtn);
        adSkipBtnModern && skipHandler(adSkipBtnModern);
      }, 1000);
      taskScratch.hasBindSkipAdEvents = true;
    },
    webFullScreen: 'button.ytp-size-button',
    fullScreen: 'button.ytp-fullscreen-button',
    next: '.ytp-next-button',
    afterPlay: function (taskConf) {
      setTimeout(() => { tuner.seekForward(0.01, true); }, 0);
      const player = activePlayer.player();
      const playerwWrap = player.closest('.html5-video-player');
      if (!playerwWrap) { return }
      playerwWrap.classList.add('ytp-autohide', 'playing-mode');
      clearTimeout(playerwWrap.autohideTimer);
      playerwWrap.autohideTimer = setTimeout(() => { playerwWrap.classList.add('ytp-autohide', 'playing-mode'); }, 1000);
      if (!playerwWrap.hasBindCustomEvents) {
        const mousemoveHander = (event?) => {
          playerwWrap.classList.remove('ytp-autohide', 'ytp-hide-info-bar');
          clearTimeout(playerwWrap.mousemoveTimer);
          playerwWrap.mousemoveTimer = setTimeout(() => { if (!player.paused) { playerwWrap.classList.add('ytp-autohide', 'ytp-hide-info-bar'); } }, 1000 * 2);
        };
        const clickHander = (event) => {
          activePlayer.switchPlay();
          mousemoveHander();
        };
        player.addEventListener('mousemove', mousemoveHander);
        player.addEventListener('click', clickHander);
        playerwWrap.hasBindCustomEvents = true;
      }
      const spinner = playerwWrap.querySelector('.ytp-spinner');
      if (spinner) {
        const hiddenSpinner = () => { spinner && (spinner.style.visibility = 'hidden'); };
        const visibleSpinner = () => { spinner && (spinner.style.visibility = 'visible'); };
        hiddenSpinner();
        clearTimeout(playerwWrap.spinnerTimer);
        playerwWrap.spinnerTimer = setTimeout(() => {
          spinner.style.display = 'none';
          visibleSpinner();
        }, 1000);
      }
    },
    afterPause: function (taskConf) {
      const player = activePlayer.player();
      const playerwWrap = player.closest('.html5-video-player');
      if (!playerwWrap) return
      playerwWrap.classList.remove('ytp-autohide', 'playing-mode');
      playerwWrap.classList.add('paused-mode');
      clearTimeout(playerwWrap.autohideTimer);
    },
    // 按 Esc 取消播放下一个推荐的视频
    shortcuts: escapeTask(() => { if (document.querySelector('.ytp-upnext').style.display !== 'none') { document.querySelector('.ytp-upnext-cancel-button').click() } })
  },
  'netflix.com': {
    fullScreen: 'button.button-nfplayerFullscreen',
    addCurrentTime: 'button.button-nfplayerFastForward',
    subtractCurrentTime: 'button.button-nfplayerBackTen',
    // 使用netflix自身的调速，因为目前插件没法解决调速导致的服务中断问题
    playbackRate: true,
        shortcuts: { register: ['f'], callback: function (taskConf, data) { return true } }
  },
  'bilibili.com': {
    fullScreen: function () {
      const fullScreen = Utils.q('.bpx-player-ctrl-full') || Utils.q('.squirtle-video-fullscreen') || Utils.q('.bilibili-player-video-btn-fullscreen');
      if (fullScreen) {
        fullScreen.click();
        return true
      }
    },
    webFullScreen: function () {
      const oldWebFullscreen = Utils.q('.bilibili-player-video-web-fullscreen');
      const webFullscreenEnter = Utils.q('.bpx-player-ctrl-web-enter') || Utils.q('.squirtle-pagefullscreen-inactive');
      const webFullscreenLeave = Utils.q('.bpx-player-ctrl-web-leave') || Utils.q('.squirtle-pagefullscreen-active');
      if (oldWebFullscreen || (webFullscreenEnter && webFullscreenLeave)) {
        const webFullscreen = oldWebFullscreen || (getComputedStyle(webFullscreenLeave).display === 'none' ? webFullscreenEnter : webFullscreenLeave);
        webFullscreen.click();
        setTimeout(function () {
          const danmaku = Utils.q('.bpx-player-dm-input') || Utils.q('.bilibili-player-video-danmaku-input');
          danmaku && danmaku.blur();
        }, 1000 * 0.1);
        return true
      }
    },
    autoPlay: ['.bpx-player-ctrl-play', '.squirtle-video-start', '.bilibili-player-video-btn-start'],
    switchPlay: ['.bpx-player-ctrl-play', '.squirtle-video-start', '.bilibili-player-video-btn-start'],
    next: ['.bpx-player-ctrl-next', '.squirtle-video-next', '.bilibili-player-video-btn-next', '.bpx-player-ctrl-btn[aria-label="下一个"]'],
    // 按 Esc 退出网页全屏
    shortcuts: escapeTask(() => {
      const oldWebFullscreen = Utils.q('.bilibili-player-video-web-fullscreen');
      if (oldWebFullscreen && oldWebFullscreen.classList.contains('closed')) { oldWebFullscreen.click(); } else {
        const webFullscreenLeave = Utils.q('.bpx-player-ctrl-web-leave') || Utils.q('.squirtle-pagefullscreen-active');
        if (webFullscreenLeave && getComputedStyle(webFullscreenLeave).display !== 'none') { webFullscreenLeave.click(); }
      }
    })
  },
  't.bilibili.com': { fullScreen: 'button[name="fullscreen-button"]' },
  'live.bilibili.com': {
    init: function () {
      if (!JSON._stringifySource_) {
        JSON._stringifySource_ = JSON.stringify;
        JSON.stringify = function (arg1) {
          try { return JSON._stringifySource_.apply(this, arguments) } catch (e) { console.log('[Task] JSON序列化异常', e, arg1); }
        };
      }
    },
    fullScreen: '.bilibili-live-player-video-controller-fullscreen-btn button',
    webFullScreen: '.bilibili-live-player-video-controller-web-fullscreen-btn button',
    switchPlay: '.bilibili-live-player-video-controller-start-btn button'
  },
  'acfun.cn': {
    fullScreen: '[data-bind-key="screenTip"]',
    webFullScreen: '[data-bind-key="webTip"]',
    switchPlay: function () {
      const player = activePlayer.player();
      const status = player.paused;
      setTimeout(function () {
        if (status === player.paused) {
          if (player.paused) { player.play(); } else { player.pause(); }
        }
      }, 200);
    }
  },
  'ixigua.com': {
    fullScreen: ['xg-fullscreen.xgplayer-fullscreen', '.xgplayer-control-item__entry[aria-label="全屏"]', '.xgplayer-control-item__entry[aria-label="退出全屏"]'],
    webFullScreen: ['xg-cssfullscreen.xgplayer-cssfullscreen', '.xgplayer-control-item__entry[aria-label="剧场模式"]', '.xgplayer-control-item__entry[aria-label="退出剧场模式"]']
  },
    'tv.sohu.com': { fullScreen: 'button[data-title="网页全屏"]', webFullScreen: 'button[data-title="全屏"]' },
  'iqiyi.com': {
    fullScreen: '.iqp-btn-fullscreen',
    webFullScreen: '.iqp-btn-webscreen',
    next: '.iqp-btn-next',
    init: function (taskConf) {
      watermarkTask('.iqp-logo-box')();
      window.GM_addStyle(`
          div[templatetype="common_pause"]{ display:none }
          .iqp-logo-box{ display:none !important }
      `);
    }
  },
  'youku.com': { fullScreen: '.control-fullscreen-icon', next: '.control-next-video', init: watermarkTask('.youku-layer-logo') },
  'ted.com': { fullScreen: 'button.Fullscreen' },
  'qq.com': {
    pause: '.container_inner .txp-shadow-mod',
    play: '.container_inner .txp-shadow-mod',
    shortcuts: {
      register: ['c', 'x', 'z', '1', '2', '3', '4'],
      callback: function (taskConf, data) {
        const { event } = data;
        const key = event.key.toLowerCase();
        const keyName = 'customShortcuts_' + key;
        if (!taskScratch[keyName]) {
                    taskScratch[keyName] = { time: Date.now(), playbackRate: tuner.playbackRate };
          return false
        } else {
          if (Date.now() - taskScratch[keyName].time < 200) { return false }
          if (taskScratch[keyName] === tuner.playbackRate || taskScratch[keyName] === true) {
            if (window.sessionStorage.playbackRate && /(c|x|z|1|2|3|4)/.test(key)) {
              const curSpeed = Number(window.sessionStorage.playbackRate);
              const perSpeed = curSpeed - 0.1 >= 0 ? curSpeed - 0.1 : 0.1;
              const nextSpeed = curSpeed + 0.1 <= 4 ? curSpeed + 0.1 : 4;
              let targetSpeed = curSpeed;
              switch (key) {
                case 'z' :
                  targetSpeed = 1;
                  break
                case 'c' :
                  targetSpeed = nextSpeed;
                  break
                case 'x' :
                  targetSpeed = perSpeed;
                  break
                default :
                  targetSpeed = Number(key);
                  break
              }
              window.sessionStorage.playbackRate = targetSpeed;
              tuner.seekForward(0.01, true);
              tuner.setSpeed(targetSpeed, true);
              return true
            }
            taskScratch[keyName] = true;
          } else { taskScratch[keyName] = false; }
        }
      }
    },
    fullScreen: 'txpdiv[data-report="window-fullscreen"]',
    webFullScreen: 'txpdiv[data-report="browser-fullscreen"]',
    next: 'txpdiv[data-report="play-next"]',
    init: watermarkTask('.txp-watermark', '.txp-watermark-action'),
    include: /(v.qq|sports.qq)/
  },
  'pan.baidu.com': { fullScreen: function (taskConf) { activePlayer.player().parentNode.querySelector('.vjs-fullscreen-control').click(); } },
  'facebook.com': {
    fullScreen: facebookTask,
    webFullScreen: facebookTask,
    // 在视频模式下按esc键，自动返回上一层界面
    shortcuts: escapeTask(() => {
      Utils.eachParent(activePlayer.player(), function (parentNode) {
        if (parentNode.getAttribute('data-fullscreen-container') === 'true') {
          const goBackBtn = parentNode.parentNode.querySelector('div>a>i>u');
          if (goBackBtn) { goBackBtn.parentNode.parentNode.click(); }
          return true
        }
      });
    })
  },
  'douyu.com': { fullScreen: douyuScreen('_isFullScreen_', '窗口全屏', '退出窗口全屏'), webFullScreen: douyuScreen('_isWebFullScreen_', '网页全屏', '退出网页全屏') },
  'open.163.com': {
    init: function (taskConf) {
      const player = activePlayer.player();
      player.setAttribute('crossOrigin', 'anonymous');
    }
  },
  'agefans.tv': { init: allowCross },
  'chaoxing.com': { fullScreen: '.vjs-fullscreen-control' },
  'yixi.tv': { init: allowCross },
  'douyin.com': { ...xgplayerTask, init: (taskConf) => { allowCross(); douyinTitle(taskConf); } },
  'live.douyin.com': { ...xgplayerTask, init: allowCross },
  'zhihu.com': {
    fullScreen: ['button[aria-label="全屏"]', 'button[aria-label="退出全屏"]'],
    play: function (taskConf, data) {
      const player = activePlayer.player();
      if (player && player.parentNode && player.parentNode.parentNode) {
        const maskWrap = player.parentNode.parentNode.querySelector('div~div:nth-child(3)');
        if (maskWrap) {
          const mask = maskWrap.querySelector('div');
          if (mask && mask.innerText === '') { mask.click(); }
        }
      }
    },
    init: allowCross
  },
    'weibo.com': { fullScreen: ['button.wbpv-fullscreen-control'], webFullScreen: ['div.wbpv-open-layer-button'] },
  'twitter.com': {
    init: hoverTitle('article[data-testid="tweet"]', 600, (player, wrapEl) => {
      const titleEl = wrapEl.querySelector('div[data-testid="tweetText"]');
      if (!titleEl) { return false }
      Utils.setTitle(player, wrapEl, titleEl.innerText.trim());
      return true
    })
  }
};
// 任务配置中心：类 + 唯一实例 + 唯一安装口都在这一份文件里，用于配置无法通用处理的站点任务（如各家不同的全屏方式）
export class TaskControl {
  conf: any;
  doTaskFunc: any;
  constructor (taskConf, doTaskFunc) {
    this.conf = taskConf || {};
    this.doTaskFunc = doTaskFunc instanceof Function ? doTaskFunc : function () {};
  }
  // 取当前主域名：子域多于两段时去掉最左一段（www.a.com → a.com）
  getDomain () {
    const host = window.location.host;
    let domain = host;
    const tmpArr = host.split('.');
    if (tmpArr.length > 2) {
      tmpArr.shift();
      domain = tmpArr.join('.');
    }
    return domain
  }
  // 任务配置的 include / exclude 正则是否命中当前地址，exclude 命中即否决
  isMatch (taskConf) {
    const url = window.location.href;
    let isMatch = false;
    if (!taskConf.include && !taskConf.exclude) { isMatch = true; } else {
      if (taskConf.include && taskConf.include.test(url)) { isMatch = true; }
      if (taskConf.exclude && taskConf.exclude.test(url)) { isMatch = false; }
    }
    return isMatch
  }
  // 取本站任务表：host 优先、主域名兜底，再按 include / exclude 过滤
  siteConf () {
    const domain = this.getDomain();
    const taskConf = this.conf[window.location.host] || this.conf[domain];
    if (taskConf && this.isMatch(taskConf)) { return taskConf }
    return {}
  }
  // 按任务名派发：站点没配任务表、或表里没这个任务名，都返回 false
  doTask (taskName, data) {
    if (!taskName) return false
    const taskConf = this.siteConf();
    if (!Utils.isObj(taskConf) || !taskConf[taskName]) return false
    return this.doTaskFunc(taskName, taskConf, data)
  }
  // 造一个真 TaskControl：派发函数按任务值的形态分四路——shortcuts 回调、函数、布尔、选择器
  static create () {
    return new TaskControl(taskConf, function (taskName, taskConf, data) {
      try {
        const task = taskConf[taskName];
        if (taskName === 'shortcuts') { if (Utils.isObj(task) && task.callback instanceof Function) { return task.callback(taskConf, data) } } else if (task instanceof Function) {
          try { return task(taskConf, data) } catch (e) {
            console.log('[Task] 自定义函数失败', taskName, taskConf, data, e);
            return false
          }
        } else if (typeof task === 'boolean') { return task } else {
          const roots = [activePlayer.getWrap(), document];
          const selectorList = Array.isArray(task) ? task : [task];
          for (const selector of selectorList) {
            for (const root of roots) {
              const target = root && root.querySelector(selector);
              if (target) { target.click(); return true }
            }
          }
        }
      } catch (e) {
        console.log('[Task] 自定义任务失败', taskName, taskConf, data, e);
        return false
      }
    })
  }
}
// 任务配置中心的唯一实例：启用给全量表，禁用或黑名单给空表，两者都是真的 TaskControl
export let taskCenter = null;
// 任务中心唯一的安装口：启用给全量站点表，禁用或黑名单给空表——空表也得是真的 TaskControl，右键菜单才触达得到
export const installTasks = isEnhanceOn => { taskCenter = isEnhanceOn ? TaskControl.create() : new TaskControl({}, function () {}) };
