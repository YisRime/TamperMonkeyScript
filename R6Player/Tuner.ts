// TunerControl：倍速、音量、进度三件事共用同一套「读取—设定—锁定—步进」的节奏三个受控属性只差一个名字：锁定到期时间与最近一次设值记在哪个对象上，由这张表给出唯一答案。键用 DOM 属性名，增强 API 的方法名后缀由 Utils.firstUpper 派生；锁定动作在单例之后生成到原型上
import { Utils, original } from "./Utils";
import { mediaCore, Amplifier } from "./Media";
import { activePlayer } from "./Player";
import { configManager, blocksSet } from "./Config";
import { taskCenter } from "./Task";
import { menu } from "./Menu";
// 按 DOM 属性名取到该属性当前的 info
export const mediaProps = { playbackRate: () => tuner.playbackRateInfo, volume: () => tuner.volumeInfo, currentTime: () => tuner.timeInfo() };
// 进度表的键：同一页面地址 + 同一时长算同一条进度，写与读必须拼得一模一样
export const progressKey = duration => window.location.href + duration;
// 恢复进度开关是按站点的：键名也只有一个来源
const restoreKey = () => 'media.allowRestorePlayProgress.' + location.host;
// 这一项是不是被站点自己接管了：任务配置中心的 blockSetXxx 任务，或用户打开的接管开关
export const takenOver = api => taskCenter.doTask('blockSet' + api) || blocksSet(api);
export class TunerControl {
  playbackRate: any;
  lastPlaybackRate: any;
  playbackRateInfo: any;
  boostInfo: any;
  _setPlaybackRateDuplicate_: any;
  _setPlaybackRateDuplicate2_: any;
  volume: any;
  volumeInfo: any;
  skipStep: any;
  fps: any;
  followBuffer: any;
  _firstProgressRecord_: any;
  _hasRestorePlayProgress_: any;
  constructor () {
    this.playbackRate = configManager.get('media.playbackRate');
    this.lastPlaybackRate = configManager.get('media.lastPlaybackRate');
    this.playbackRateInfo = { lockTimeout: Date.now() - 1, time: Date.now(), value: -1 };
    this.boostInfo = null;
    this._setPlaybackRateDuplicate_ = null;
    this._setPlaybackRateDuplicate2_ = null;
    this.volume = configManager.get('media.volume');
    this.volumeInfo = { lockTimeout: Date.now() - 1, time: Date.now(), value: -1 };
    this.skipStep = 5;
    this.fps = 30;
    this.followBuffer = false;
    this._firstProgressRecord_ = null;
    this._hasRestorePlayProgress_ = null;
  }
  // 取当前倍速：iframe 里优先用全局层的值，统一保留一位小数
  getSpeed () {
    let playbackRate = configManager.get('media.playbackRate') || tuner.playbackRate;
    if (Utils.inFrame()) {
      const globalPlaybackRate = configManager.getGlobal('media.playbackRate');
      if (globalPlaybackRate) { playbackRate = globalPlaybackRate; }
    }
    return Number(Number(playbackRate).toFixed(1))
  }
  // 倍速、音量、进度的锁是同一套动作：有增强 API 交给 API，否则写进各自的 info.lockTimeout
  lock (prop, timeout = 200) {
    const api = Utils.firstUpper(prop);
    if (activePlayer.enhancer) {
      if (blocksSet(api)) { timeout = 1000 * 60 * 60 * 24 * 365}
      activePlayer.enhancer['lock' + api](timeout);
      return true
    }
    const info = mediaProps[prop]();
    if (info) { info.lockTimeout = Date.now() + timeout }
  }
  // 解锁：有增强 API 就调它，否则把 info.lockTimeout 拨到过去，立刻失效
  unlock (prop) {
    if (activePlayer.enhancer) { activePlayer.enhancer['unlock' + Utils.firstUpper(prop)](); return true }
    const info = mediaProps[prop]();
    if (info) { info.lockTimeout = Date.now() - 1 }
  }
  // 查这个属性是否还在锁定期：有增强 API 问它，否则看 info.lockTimeout 有没有到期
  locked (prop) {
    if (activePlayer.enhancer) { return activePlayer.enhancer['locked' + Utils.firstUpper(prop)]() }
    const info = mediaProps[prop]();
    return !!(info && info.lockTimeout) && Date.now() - info.lockTimeout < 0
  }
  // 把媒体元素的原生属性接管到实例上：以原型描述符为底装给定的读写，三个属性只差描述符内容
  proxyProp (player, name, describe) {
    try {
      const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, name);
      original.Object.defineProperty.call(Object, player, name, Object.assign({ configurable: true }, describe(native)));
    } catch (e) { console.log('[Tuner] 属性接管失败', name, e); }
  }
  // 写媒体属性的两条路：增强 API 在位时转交给它，否则直写实例并接管该属性
  plusSet (prop, value) {
    if (!activePlayer.enhancer) { return false }
    activePlayer.enhancer['set' + Utils.firstUpper(prop)](value);
    return true
  }
  // 直写之前先删掉实例上的同名属性：站点可能在那里装了拦截器，删掉才轮得到原型
  directSet (player, prop, value, describe) {
    delete player[prop];
    player[prop] = value;
    const info = mediaProps[prop]();
    if (info) { info.time = Date.now(); info.value = value; }
    tuner.proxyProp(player, prop, describe);
  }
  // 用户主动调速的统一走法：先解上一轮的锁再设值，设完立刻锁回去，否则会被站点的调速逻辑改回；num 为 null 表示按当前记录值重设
  applyRate (num, notips, lockTime) { return tuner.applyProp('playbackRate', num, lockTime || 1000, notips) }
  // 解决高低倍速频繁切换后，音画不同步的问题
  fixSpeed (oldSpeed) { if (Math.abs(tuner.getSpeed() - oldSpeed) > 1) { tuner.seekForward(0.1, true); } }
  // 三个属性共用的那一套：先解开上一轮的锁再设值，设完立刻锁回去（倍速的设值器叫 setSpeed，其余按属性名派生）
  applyProp (prop, value, lockTime, notips) {
    const api = Utils.firstUpper(prop);
    tuner['unlock' + api]();
    const suc = tuner[prop === 'playbackRate' ? 'setSpeed' : 'set' + api](value, notips);
    tuner['lock' + api](lockTime || 500);
    return suc
  }
  // 设置播放速度
  setSpeed (num, notips, duplicate, skipLock) {
    const player = activePlayer.player();
    if (!skipLock && tuner.lockedPlaybackRate()) {
      console.log('[Tuner] 调速已锁定');
      return false
    }
    if (taskCenter.doTask('playbackRate')) { return }
    if (!player) return
    const oldSpeed = tuner.getSpeed();
    let curPlaybackRate = oldSpeed;
    if (num) {
      num = Number(num);
      if (Number.isNaN(num)) {
        console.log('[Tuner] 速度转换失败');
        return false
      }
      if (num <= 0) { num = 0.1; } else if (num > 16) { num = 16; }
      num = Number(num.toFixed(1));
      curPlaybackRate = num;
    }
    tuner.playbackRate = curPlaybackRate;
    configManager.persistMedia('media.playbackRate', curPlaybackRate);
    const changed = Boolean(num) || curPlaybackRate !== 1;
    if (tuner.plusSet('playbackRate', curPlaybackRate)) { mediaCore.eachOther(player, api => api.setPlaybackRate(curPlaybackRate)); } else {
      tuner.directSet(player, 'playbackRate', curPlaybackRate, native => ({
        get: function () { return curPlaybackRate || native.get.apply(player, arguments) },
        set: function (val) {
          if (typeof val !== 'number') { return false }
          !Number.isInteger(player._blockSetPlaybackRateTips_) && (player._blockSetPlaybackRateTips_ = 0);
          if (taskCenter.doTask('blockSetPlaybackRate')) {
            player._blockSetPlaybackRateTips_++;
            player._blockSetPlaybackRateTips_ < 3 && console.log('[Tuner] 调速任务接管');
            return false
          }
          if (blocksSet('PlaybackRate')) {
            player._blockSetPlaybackRateTips_++;
            player._blockSetPlaybackRateTips_ < 3 && console.log('[Tuner] 调速开关锁定');
            return false
          } else { tuner.setSpeed(val); }
        }
      }));
      player._setPlaybackRate_ = { time: Date.now(), value: curPlaybackRate };
      if (changed && !duplicate && blocksSet('PlaybackRate')) {
        clearTimeout(tuner._setPlaybackRateDuplicate_);
        clearTimeout(tuner._setPlaybackRateDuplicate2_);
        const duplicatePlaybackRate = () => {
          tuner.unlockPlaybackRate();
          tuner.setSpeed(curPlaybackRate, true, true);
          tuner.lockPlaybackRate(1000);
        };
        tuner._setPlaybackRateDuplicate_ = setTimeout(duplicatePlaybackRate, 600);
        tuner._setPlaybackRateDuplicate2_ = setTimeout(duplicatePlaybackRate, 1200);
      }
    }
    changed && !notips && menu.tips('播放速度：' + player.playbackRate);
    tuner.fixSpeed(oldSpeed);
    return true
  }
  // 加强版调速：短时间内设同一个值就叠加放大，用于广告快进、片头片尾速看
  boost (num) {
    num = Number(num);
    if (!num) { return false }
    tuner.boostInfo = tuner.boostInfo || {};
    tuner.boostInfo[num] = tuner.boostInfo[num] || { time: Date.now() - 1000, value: num };
    if (Date.now() - tuner.boostInfo[num].time < 300) { tuner.boostInfo[num].value = tuner.boostInfo[num].value + num; } else { tuner.boostInfo[num].value = num }
    tuner.boostInfo[num].time = Date.now();
    return tuner.applyRate(tuner.boostInfo[num].value)
  }
  // 恢复播放速度，还原到1倍速度、或恢复到上次的倍速
  resetSpeed (player) {
    player = player || activePlayer.player();
    tuner.unlockPlaybackRate();
    const oldSpeed = Number(player.playbackRate);
    const playbackRate = oldSpeed === 1 ? tuner.lastPlaybackRate : 1;
    if (oldSpeed !== 1) {
      tuner.lastPlaybackRate = oldSpeed;
      configManager.setLocal('media.lastPlaybackRate', oldSpeed);
    }
    return tuner.applyRate(playbackRate)
  }
  // 把当前设定的倍速重新同步给播放器，并短暂锁定避免被外部逻辑改回去
  resync (notips) { return tuner.applyRate(null, notips) }
  // 在当前倍速上步进一格，并短暂锁定避免外部调速逻辑干扰
  stepSpeed (delta) {
    const player = activePlayer.player(); if (!player) return
    return tuner.applyRate(player.playbackRate + delta)
  }
  // 提升播放速率
  speedUp (num) { tuner.stepSpeed(Utils.stepValue(num, 0.1)); }
  // 降低播放速率
  slowDown (num) { tuner.stepSpeed(-Utils.stepValue(num, 0.1)); }
  // 取当前音量：iframe 里、或站点接管音量时优先用全局层的值，保留两位小数
  getVolume () {
    let volume = configManager.get('media.volume');
    if (Utils.inFrame() || blocksSet('Volume')) {
      const globalVolume = configManager.getGlobal('media.volume');
      if (globalVolume !== null) { volume = globalVolume; }
    }
    return Number(Number(volume).toFixed(2))
  }
  // 设置声音大小
  setVolume (num, notips, outerCall) {
    const player = activePlayer.player();
    if (tuner.lockedVolume()) { return false }
    if (!num && num !== 0) { num = tuner.getVolume(); }
    num = Number(Number(num).toFixed(2));
    if (num < 0) { num = 0; }
    if (num > 1 && configManager.get('enhance.allowAcousticGain')) {
      num = Math.ceil(num);
      try { player._amp_ = player._amp_ || new Amplifier(player); } catch (e) {
        num = 1;
        console.log('[Tuner] 响度增益异常', e);
      }
      if (num > 6) { num = 6; }
      if (!player._amp_ || !player._amp_.setLoudness) { num = 1; }
    } else if (num > 1) { num = 1; }
    tuner.volume = num;
    if (num > 1 && player._amp_ && player._amp_.setLoudness) {
      player._amp_.setLoudness(num);
      if (!outerCall) { player.muted = false; }
      !notips && menu.tips('音量：' + parseInt(String(num * 100)) + '%');
      return true
    }
    configManager.persistMedia('media.volume', num, blocksSet('Volume'));
    if (tuner.plusSet('volume', num)) { mediaCore.eachOther(player, api => api.setVolume(num)); } else {
      tuner.directSet(player, 'volume', num, native => ({
        get: function () { return native.get.apply(player, arguments) },
        set: function (val) {
          if (typeof val !== 'number' || val < 0) { return false }
          if (takenOver('Volume')) { return false } else { tuner.setVolume(val, false, true); }
        }
      }));
    }
    if (!outerCall) { player.muted = false; }
    !notips && menu.tips('音量：' + parseInt(String(player.volume * 100)) + '%');
  }
  // 在当前音量上步进一格：超过 1 倍的是响度增益值，步进要基于增益值
  stepVolume (delta) {
    const player = activePlayer.player(); if (!player) return
    let target = player.volume + delta;
    if (tuner.volume > 1 && player._amp_) {
      target = Number(tuner.volume) + delta;
      if (delta < 0) { target = Math.floor(target) }
    }
    return tuner.applyProp('volume', target, 500)
  }
  // 提高音量，没给步长就按 20% 走
  volumeUp (num) { tuner.stepVolume(Utils.stepValue(num, 0.2)); }
  // 降低音量，没给步长就按 20% 走
  volumeDown (num) { tuner.stepVolume(-Utils.stepValue(num, 0.2)); }
  // 进度相关状态在实例上的落脚点：没有增强 API 时靠它记下锁定到期时间与最近一次设值
  timeInfo () {
    const player = activePlayer.player(); if (!player) return null
    player.timeInfo = player.timeInfo || {};
    return player.timeInfo
  }
  // 设置播放进度
  setCurrentTime (num) {
    if (!num && num !== 0) return
    num = Number(num);
    const _num = Math.abs(Number(num.toFixed(1)));
    const player = activePlayer.player();
    if (tuner.lockedCurrentTime()) { return false }
    if (taskCenter.doTask('currentTime')) { return }
    if (tuner.plusSet('currentTime', _num)) { return true }
    tuner.directSet(player, 'currentTime', _num, native => ({
      enumerable: true,
      get: function () { return native.get.apply(player, arguments) },
      set: function (val) {
        if (typeof val !== 'number' || takenOver('CurrentTime')) { return false }
        if (tuner.lockedCurrentTime()) { return false }
        player.timeInfo.time = Date.now();
        player.timeInfo.value = val;
        return native.set.apply(player, arguments)
      }
    }));
  }
  // 在当前进度上步进 delta 秒，delta 为负即后退
  seekBy (delta, hideTips) {
    const player = activePlayer.player(); if (!player) return
    let target = player.currentTime + delta;
    if (target < 1) { target = 0 }
    tuner.applyProp('currentTime', target, 500);
    !hideTips && menu.tips((delta > 0 ? '前进：' : '后退：') + Math.abs(delta) + '秒');
  }
  // 前进：任务配置中心接管了就不动，否则按给定秒数或默认步长跳
  seekForward (num, hideTips) {
    if (taskCenter.doTask('addCurrentTime')) { return }
    tuner.seekBy(Utils.stepValue(num, tuner.skipStep), hideTips);
  }
  // 后退：任务配置中心接管了就不动，否则按给定秒数或默认步长退
  seekBack (num) {
    if (taskCenter.doTask('subtractCurrentTime')) { return }
    tuner.seekBy(-Utils.stepValue(num, tuner.skipStep));
  }
  // 定格帧画面：perFps 为 1 定格到下一帧、-1 到上一帧
  freezeFrame (perFps) {
    perFps = perFps || 1;
    const player = activePlayer.player();
    player.currentTime += Number(perFps / tuner.fps);
    if (!player.paused) player.pause();
    player._hangUp_ && player._hangUp_('play', 400);
    if (perFps === 1) { menu.tips('定位：下一帧'); } else if (perFps === -1) { menu.tips('定位：上一帧'); } else { menu.tips('定格帧画面：' + perFps); }
  }
  // 切换「自动跟随跳转到缓冲区时间」开关，并提示当前状态
  toggleBuffered () {
    tuner.followBuffer = !tuner.followBuffer;
    menu.tips(tuner.followBuffer ? '自动跟随跳转到缓冲区时间' : '禁用自动跟随跳转到缓冲区时间');
  }
  // 本站是否允许自动恢复播放进度：没写过这一项就算允许
  allowRestore () {
    const allowRestoreVal = configManager.get(restoreKey());
    return allowRestoreVal === null || allowRestoreVal
  }
  // 切换自动恢复播放进度的状态
  toggleRestore () {
    const allowRestore = Utils.crossSite() ? false : !tuner.allowRestore();
    configManager.set(restoreKey(), allowRestore);
    if (allowRestore) {
      menu.tips('允许自动恢复播放进度');
      tuner.restoreProgress(activePlayer.player());
    } else { menu.tips('禁止自动恢复播放进度'); }
  }
  // 取播放进度（不传 player 就返回整张进度表）
  getProgress (player) {
    const progressMap = configManager.get('media.progress') || {};
    if (!player) { return progressMap }
    const keyName = progressKey(player.duration);
    if (!progressMap[keyName] || Number.isNaN(Number(player.duration)) || Number(progressMap[keyName].duration) !== Number(player.duration)) { return player.currentTime }
    return progressMap[keyName].progress
  }
  // 进度表超限就按记录时间淘汰最早的那一批（并列一起淘汰，与原实现一致）
  trimProgress (progressMap) {
    const keys = Object.keys(progressMap);
    if (keys.length <= 10) { return progressMap }
    const oldest = Math.min(...keys.map(k => (progressMap[k] || {}).t).filter(Boolean));
    keys.forEach(k => { if (progressMap[k] && progressMap[k].t === oldest) { delete progressMap[k] } });
    return progressMap
  }
  // 播放进度记录器
  recordProgress (player) {
    clearTimeout(player._playProgressTimer_);
    // 每 2 秒记一次进度：没开启恢复、片子太短、或已离开页面就只续下一轮
    function recorder (player) {
      player._playProgressTimer_ = setTimeout(function () {
        const isToShort = !player.duration || Number.isNaN(Number(player.duration)) || player.duration < 120;
        const isLeave = document.visibilityState !== 'visible' && player.paused;
        if (!tuner.allowRestore() || isToShort || isLeave) {
          recorder(player);
          return true
        }
        const progressMap = tuner.getProgress();
        const keyName = progressKey(player.duration);
        if (!progressMap[keyName]) {
          tuner._firstProgressRecord_ = keyName;
          tuner._hasRestorePlayProgress_ = keyName;
        }
        tuner.trimProgress(progressMap);
        progressMap[keyName] = { progress: player.currentTime, duration: player.duration, t: new Date().getTime() };
        configManager.setLocal('media.progress', progressMap);
        recorder(player);
      }, 1000 * 2);
    }
    recorder(player);
  }
  // 设置播放进度
  restoreProgress (player) {
    if (!player || !player.duration || Number.isNaN(player.duration)) return
    const curTime = Number(tuner.getProgress(player));
    if (!curTime || Number.isNaN(curTime) || curTime < 10 || curTime >= player.duration) return
    if (Math.abs(curTime - player.currentTime) < 2) { return false }
    const keyName = progressKey(player.duration);
    tuner._hasRestorePlayProgress_ = tuner._hasRestorePlayProgress_ || '';
    if (tuner._hasRestorePlayProgress_ === keyName || tuner._firstProgressRecord_ === keyName) {
      if (tuner._hasRestorePlayProgress_ === keyName) { tuner._firstProgressRecord_ = ''; }
      return false
    }
    if (tuner.allowRestore()) {
      player.currentTime = curTime - 1.5;
      tuner._hasRestorePlayProgress_ = keyName;
      menu.tips('为你恢复上次播放进度');
    } else { menu.tips('恢复播放进度功能已禁用，可通过菜单或 SHIFT+R 开启该功能'); }
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let tuner = null;
// 建出单例并交出引用
export const createTuner = () => { tuner = new TunerControl(); return tuner };
// 按 mediaProps 生成九个锁定动作到原型上，快捷键派发表照旧从原型推导
Object.keys(mediaProps).forEach(prop => {
  const api = Utils.firstUpper(prop);
  TunerControl.prototype['lock' + api] = (timeout = 200) => tuner.lock(prop, timeout);
  TunerControl.prototype['unlock' + api] = () => tuner.unlock(prop);
  TunerControl.prototype['locked' + api] = () => tuner.locked(prop);
});