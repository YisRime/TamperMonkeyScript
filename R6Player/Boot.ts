// 启动序列：任务中心的建立、一次性装配、播放器检出与外层重试；本文件只有函数，按序调用它们的是 Entry.ts
import { Utils } from "./Utils";
import { PageBridge, pageBridge } from "./Bridge";
import { configManager, siteDisabled } from "./Config";
import { mediaCore, supportMediaTags, mediaSource } from "./Media";
import { taskCenter, installTasks } from "./Task";
import { activePlayer } from "./Player";
import { MenuControl } from "./Menu";
import { InputControl, input } from "./Input";
// 页面注入的自定义配置只生效一次（幂等守卫在 configManager.hasExternal 里）
const applyExternal = () => {
  const conf = window.unsafeWindow && window.unsafeWindow.__r6PlayerCustomConfiguration__;
  if (conf && !configManager.hasExternal) { configManager.mergeExternal(conf); }
};
// 每检出一次播放器都要走：页面脚本可能晚于启动才注入配置，所以这里再试一次；被 taskCenter 标记禁用的站点不做初始化
const playerDetected = () => {
  applyExternal();
  if (taskCenter.doTask('disable') === true) {
    console.log('[Boot] 任务中心禁用本站检测', location.host);
    return true
  }
  return activePlayer.detectPlayer()
};
// 在一个范围里（整份文档，或某个 shadowRoot）等候媒体标签出现：两条检出路径只差这个范围
export const watchTags = (root?) => supportMediaTags.forEach(tagName => Utils.ready(tagName, () => playerDetected(), root));
// 启动状态：装配守卫与重试计数。同样收成对象，便于测试放开守卫再收回
export const bootState = { runtimeReady: false, initTryCount: 0 };
// 全局只执行一次的运行时装配：所有「往页面/文档上挂东西」的步骤都收在这道守卫里，重试路径再走一遍也不会叠加第二份
export const setupRuntime = () => {
  if (bootState.runtimeReady) return true
  bootState.runtimeReady = true;
  applyExternal();
  if (configManager.get('debug') === true) { window._debugMode_ = true; }
  PageBridge.spoofAgent();
  if (configManager.get('enableHotkeys') !== false) {
    input.bindEvent();
    input.bindRelay();
  } else { console.log('[Boot] 快捷键禁用'); }
  pageBridge.on('videoDetected', (name, oldVal, newVal, remote) => {
    if (newVal.originTab) { input.crossDetected = true; }
    console.log('[Boot] 跨域视频检出', newVal, remote);
  });
  document.addEventListener('visibilitychange', function () { activePlayer.autoPlay(); });
  if (window.unsafeWindow && configManager.getGlobal('enhance.allowExternalCustomConfiguration')) {
    window.unsafeWindow.__setR6PlayerCustomConfiguration__ = (config, tag) => configManager.mergeExternal(config, tag);
  }
  watchTags();
  document.addEventListener('addShadowRoot', e => watchTags(e.detail.shadowRoot));
  // 启动跨 Tab 的两件事：轮询画中画信息、绑按键让位
  pageBridge.pollPicture();
  pageBridge.bindYield();
  if (Utils.inFrame()) { console.log('[Boot] 启动完成, in iframe:'); } else { console.log('[Boot] 启动完成'); }
  if (Utils.crossSite()) { console.log('[Boot] 跨域iframe受限', window.location.href); }
  if (configManager.get('mouse.enable')) { InputControl.register(); }
  return true
};
// 启动增强逻辑：黑名单与人机验证页判定在前，随后装任务中心、媒体检测与页面劫持，最后跑一次性装配
export const initEnhance = () => {
  try {
    if (Utils.isChallenge()) {
      console.log('[Boot] 人机验证页暂停', location.href);
      return false
    }
  } catch (e) { console.log('[Boot] 页面判定异常', e); }
  const isEnabled = configManager.get('enable');
  const blackUrlList = configManager.get('blacklist.urls') || [];
  const isInBlackList = blackUrlList.includes(location.href) || siteDisabled();
  const isEnhanceOn = !!isEnabled && !isInBlackList;
  if (isInBlackList) { console.log('[Boot] 黑名单禁用本站', location.href, '如需开启请在配置 blacklist 中移除该地址'); }
  installTasks(isEnhanceOn);
  try {
    if (isEnhanceOn) {
      mediaCore.init(function (mediaElement) { playerDetected(); });
      if (configManager.get('enhance.allowExperimentFeatures') && configManager.get('download.enable')) {
        mediaSource.init();
        console.log('[Boot] 实验功能开启警示');
        console.log('[Boot] 媒体流捕获启用');
      }
      PageBridge.hackDefine();
      PageBridge.openShadow();
      PageBridge.proxyEvents();
    }
  } catch (e) { console.log('[Boot] 页面劫持异常', e); }
  MenuControl.init();
  if (!isEnhanceOn) {
    console.log('[Boot] 配置禁用本站', location.host);
    return false
  }
  try { setupRuntime(); } catch (e) { console.log('[Boot] 装配失败', e); }
}
// 启动入口：等 documentElement 就绪（最多重试 200 次）后交给 initEnhance
export const startUp = (retryCount = 0) => {
  if (!window.document || !window.document.documentElement) {
    setTimeout(() => {
      if (retryCount < 200) { startUp(retryCount + 1); } else { console.log('[Boot] documentElement缺失', window); }
    }, 10);
    return false
  } else if (retryCount > 0) { console.log('[Boot] documentElement就绪', retryCount, window); }
  initEnhance();
}
