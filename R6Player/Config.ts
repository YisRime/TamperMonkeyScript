// 配置域的全部：默认表、两层存储的读写列出清除、外部注入的合并，以及菜单与快捷键共用的配置动作
import { Utils } from "./Utils";
import { taskCenter, taskConf } from "./Task";
import { runCommand } from "./Input";
import { menu } from "./Menu";
// 默认配置：菜单与按键能改的就是这张表，用户自定义配置永远叠在它之上
export const defaultConfiguration = {
  prefix: '_r6player_',
  config: {
    enable: true,
    media: { autoPlay: false, playbackRate: 1, volume: 1, lastPlaybackRate: 1.5, progress: {} },
    enableHotkeys: true,
    hotkeys: [
      { desc: '网页全屏', key: 'shift+enter', command: 'webMaximize', disabled: false },
      { desc: '全屏', key: 'enter', command: 'maximize' },
      { desc: '切换画中画模式', key: 'shift+p', command: 'togglePicture' },
      { desc: '视频截图', key: 'shift+s', command: 'capture' },
      { desc: '启用或禁止自动恢复播放进度功能', key: 'shift+r', command: 'toggleRestore' },
      { desc: '垂直镜像翻转', key: 'shift+m', command: 'setMirror', args: [true] },
      { desc: '水平镜像翻转', key: 'm', command: 'setMirror' },
      { desc: '下载音视频文件（实验性功能）', key: 'shift+d', command: 'mediaDownload' },
      { desc: '缩小视频画面 -0.05', key: 'shift+x', command: 'zoomOut', args: -0.05 },
      { desc: '放大视频画面 +0.05', key: 'shift+c', command: 'zoomIn', args: 0.05 },
      { desc: '恢复视频画面', key: 'shift+z', command: 'resetTransform' },
      { desc: '画面向右移动10px', key: 'shift+arrowright', command: 'moveRight', args: 10 },
      { desc: '画面向左移动10px', key: 'shift+arrowleft', command: 'moveLeft', args: -10 },
      { desc: '画面向上移动10px', key: 'shift+arrowup', command: 'moveUp', args: 10 },
      { desc: '画面向下移动10px', key: 'shift+arrowdown', command: 'moveDown', args: -10 },
      { desc: '前进5秒', key: 'arrowright', command: 'seekForward', args: 5 },
      { desc: '后退5秒', key: 'arrowleft', command: 'seekBack', args: -5 },
      { desc: '前进30秒', key: 'ctrl+arrowright', command: 'seekForward', args: [30] },
      { desc: '后退30秒', key: 'ctrl+arrowleft', command: 'seekBack', args: [-30] },
      { desc: '音量升高 5%', key: 'arrowup', command: 'volumeUp', args: [0.05] },
      { desc: '音量降低 5%', key: 'arrowdown', command: 'volumeDown', args: [-0.05] },
      { desc: '音量升高 20%', key: 'ctrl+arrowup', command: 'volumeUp', args: [0.2] },
      { desc: '音量降低 20%', key: 'ctrl+arrowdown', command: 'volumeDown', args: [-0.2] },
      { desc: '切换暂停/播放', key: 'space', command: 'switchPlay' },
      { desc: '减速播放', key: 'x', command: 'slowDown', args: -0.1 },
      { desc: '加速播放', key: 'c', command: 'speedUp', args: 0.1 },
      { desc: '正常速度播放', key: 'z', command: 'resetSpeed' },
      { desc: '设置1x的播放速度', key: 'Digit1', command: 'boost', args: 1 },
      { desc: '设置1x的播放速度', key: 'Numpad1', command: 'boost', args: 1 },
      { desc: '设置2x的播放速度', key: 'Digit2', command: 'boost', args: 2 },
      { desc: '设置2x的播放速度', key: 'Numpad2', command: 'boost', args: 2 },
      { desc: '设置3x的播放速度', key: 'Digit3', command: 'boost', args: 3 },
      { desc: '设置3x的播放速度', key: 'Numpad3', command: 'boost', args: 3 },
      { desc: '设置4x的播放速度', key: 'Digit4', command: 'boost', args: 4 },
      { desc: '设置4x的播放速度', key: 'Numpad4', command: 'boost', args: 4 },
      { desc: '下一帧', key: 'F', command: 'freezeFrame', args: 1 },
      { desc: '上一帧', key: 'D', command: 'freezeFrame', args: -1 },
      { desc: '增加亮度', key: 'E', command: 'brightnessUp' },
      { desc: '减少亮度', key: 'W', command: 'brightnessDown' },
      { desc: '增加对比度', key: 'T', command: 'contrastUp' },
      { desc: '减少对比度', key: 'R', command: 'contrastDown' },
      { desc: '增加饱和度', key: 'U', command: 'saturationUp' },
      { desc: '减少饱和度', key: 'Y', command: 'saturationDown' },
      { desc: '增加色相', key: 'O', command: 'hueUp' },
      { desc: '减少色相', key: 'I', command: 'hueDown' },
      { desc: '模糊增加 1 px', key: 'K', command: 'blurUp' },
      { desc: '模糊减少 1 px', key: 'J', command: 'blurDown' },
      { desc: '图像复位', key: 'Q', command: 'resetPicture' },
      { desc: '画面旋转 90 度', key: 'S', command: 'setRotate' },
      { desc: '播放下一集', key: 'N', command: 'nextVideo' },
      { desc: '插入debugger断点', key: 'ctrl+shift+alt+d', command: 'debuggerNow' }
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
      urls: ['https://www.bilibili.com/'],
      domains: ['challenges.cloudflare.com']
    }
  }
};
// localStorage 的原生读写：可用性只在启动时判一次，三个方法一次装好；不可用时统一降级成一条日志
export const rawLocalStorage = (function getRawLocalStorage () {
  const usable = Utils.storageUsable();
  const raw: any = {};
  ['getItem', 'setItem', 'removeItem'].forEach(apiKey => {
    const native = usable && localStorage[apiKey];
    raw[apiKey] = native ? function () { return native.apply(localStorage, arguments) } : function () { console.log('[Config] localStorage不可用'); };
  });
  return raw
})();
// 两层存储只差四处：原生 API、要不要自己序列化、解析出的形态、不可用时退到哪一层
const storageLayers = {
  local: { label: 'localStorage', usable: Utils.storageUsable, keys: () => Object.keys(localStorage), get: key => rawLocalStorage.getItem(key), set: (key, val) => rawLocalStorage.setItem(key, (Utils.isObj(val) || Utils.isArr(val)) ? JSON.stringify(val) : val), del: key => rawLocalStorage.removeItem(key), encoded: true, fallback: null },
  global: { label: 'globalStorage', usable: () => window.GM_setValue && window.GM_getValue && window.GM_deleteValue && window.GM_listValues instanceof Function, keys: () => window.GM_listValues(), get: key => window.GM_getValue(key), set: (key, val) => window.GM_setValue(key, val), del: key => window.GM_deleteValue(key), encoded: false, fallback: 'local' }
};
export class ConfigManager {
  hasExternal: any;
  opts: any;
  _keyNames: any;
  revision: any;
  _confObjRevision_: any;
  constructor (opts) {
    this.hasExternal = false;
    this.opts = opts;
    this._keyNames = {};
    this.revision = 0;
    this._confObjRevision_ = -1;
  }
  // 吃宿主页面注入的配置并合并进默认表与任务配置：只有开了「允许外部自定义」才生效，推进配置版本号并打上标记
  mergeExternal (config, tag = 'Default') {
    if (!config || !this.getGlobal('enhance.allowExternalCustomConfiguration')) return false
    const configuration = Utils.mergeObj(this.opts.config, config.customConfiguration);
    this.revision++;
    const mergedTaskConf = Utils.mergeObj(taskConf, config.customTaskControlCenter);
    if (taskCenter) { taskCenter.conf = mergedTaskConf; }
    console.log('[Config] 外部配置合并', configuration, mergedTaskConf);
    this.hasExternal = true;
    return true
  }
  // 配置路径转存储键名：加前缀、点号换下划线，结果缓存进 _keyNames
  confKey (confPath = '') { return this._keyNames[confPath] || (this._keyNames[confPath] = this.opts.prefix + confPath.replace(/\./g, '_')) }
  // 存储键名还原成配置路径：去掉前缀、下划线换回点号
  getConfPath (keyName = '') { return (keyName.startsWith(this.opts.prefix) ? keyName.slice(this.opts.prefix.length) : keyName).replace(/_/g, '.') }
  // 读配置：本地层优先，其次全局层，最后落到内存默认表
  get (confPath) {
    if (typeof confPath !== 'string') { return null }
    const localConf = this.getLocal(confPath);
    if (localConf !== null) { return localConf }
    const globalConf = this.getGlobal(confPath);
    if (globalConf !== null) { return globalConf }
    return this.getMemory(confPath)
  }
  // 写配置：先试本地层，写不进再升级到全局层
  set (confPath, val) { return this.setLocal(confPath, val) || this.setGlobal(confPath, val) }
  //   媒体数值的持久化位置：iframe 里的本地存储属于顶层页面，写不进本站，只能升级到全局层；站点自己接管该项时（forceGlobal）同理
  persistMedia (confPath, val, forceGlobal?) { return forceGlobal || Utils.inFrame() ? this.setGlobal(confPath, val) : this.set(confPath, val) }
  // 列出两层已落盘的配置与内存默认表，供导出与诊断
  list () {
    const result = { localConf: this.listLocal(), globalConf: this.listGlobal(), defConfig: this.opts.config };
    return result
  }
  // 清掉两层已落盘的配置
  clear () {
    this.clearLocal();
    this.clearGlobal();
  }
  // 从内存默认表里按路径取值，没有就返回 null
  getMemory (confPath) {
    const val = Utils.getPath(this.getConfObj(), confPath);
    return typeof val === 'undefined' || val === null ? null : val
  }
  // 读一层：这一层不可用就退到它声明的兜底层，读不到键则退到内存里的默认值
  readLayer (layerName, confPath) {
    const layer = storageLayers[layerName];
    if (!layer.usable()) { return layer.fallback ? this.readLayer(layer.fallback, confPath) : null }
    const key = this.confKey(confPath);
    const stored = layer.get(key);
    if (stored === null || typeof stored === 'undefined') { return this.getMemory(confPath) }
    if (!layer.encoded) { return stored }
    try { return JSON.parse(stored) } catch (e) { console.log('[Config] 配置解析异常', key, stored); return stored }
  }
  // 读本地层
  getLocal (confPath) { return this.readLayer('local', confPath) }
  // 读全局层
  getGlobal (confPath) { return this.readLayer('global', confPath) }
  // 写一层：先校验并更新内存快照，再落盘；这层不可用就退到它声明的兜底层
  writeLayer (layerName, confPath, val) {
    const layer = storageLayers[layerName];
    if (typeof confPath !== 'string' || typeof val === 'undefined' || val === null) return false
    Utils.setPath(this.opts.config, confPath, val);
    this.revision++;
    const key = this.confKey(confPath);
    if (!layer.usable()) { return layer.fallback ? this.writeLayer(layer.fallback, confPath, val) : false }
    try {
      layer.set(key, val);
      return true
    } catch (e) {
      console.log('[Config] 配置写入异常', layer.label, key, val, e);
      return false
    }
  }
  // 写本地层
  setLocal (confPath, val) { return this.writeLayer('local', confPath, val) }
  // 写全局层
  setGlobal (confPath, val) { return this.writeLayer('global', confPath, val) }
  // 列出某一层已经落盘的配置：按前缀筛键，值仍走该层自己的读法
  listLayer (layerName) {
    const layer = storageLayers[layerName];
    const result = {};
    if (!layer.usable()) { return result }
    layer.keys().forEach(key => { if (key.startsWith(this.opts.prefix)) { const confPath = this.getConfPath(key); result[confPath] = this.readLayer(layerName, confPath); } });
    return result
  }
  // 列出本地层已落盘的配置
  listLocal () { return this.listLayer('local') }
  // 列出全局层已落盘的配置
  listGlobal () { return this.listLayer('global') }
  // 把两层已落盘的值合进内存配置；枚举 + 逐键 JSON.parse 太贵，按 revision 一个版本只做一次，返回的仍是 opts.config 本体
  getConfObj () {
    if (this._confObjRevision_ === this.revision) { return this.opts.config }
    this._confObjRevision_ = this.revision;
    const confList = this.list();
    Object.keys(confList.globalConf).forEach((confPath) => { Utils.setPath(this.opts.config, confPath, confList.globalConf[confPath]); });
    Object.keys(confList.localConf).forEach((confPath) => { Utils.setPath(this.opts.config, confPath, confList.localConf[confPath]); });
    return this.opts.config
  }
  // 清空一层里带前缀的键，并推进配置版本号
  clearLayer (layerName) {
    const layer = storageLayers[layerName];
    if (!layer.usable()) return
    layer.keys().forEach((key) => { if (key.startsWith(this.opts.prefix)) { layer.del(key); } });
    this.revision++;
  }
  // 清空本地层
  clearLocal () { this.clearLayer('local') }
  // 清空全局层
  clearGlobal () { this.clearLayer('global') }
}
export const configManager = new ConfigManager(defaultConfiguration);
// — 菜单与快捷键共用的配置动作：写哪一层、要不要确认重载、接管判定与开关壳，全项目只这一份
export const downloadState = new Map();
// 配置写在哪一层、这一层的标题后缀、以及“确认完立刻重载”的收尾，全文件只表达一次
export const configScope = layer => (layer === 'site' ? '「仅用于此网站」' : '「全局设置」');
// 按作用域选层写配置：site 写本地层，其余写全局层
export const configSave = (layer, key, val) => (layer === 'site'
  ? configManager.setLocal(key, val)
  : configManager.setGlobal(key, val));
// 应用收尾动作并重载页面，让配置即刻生效（不再弹二次确认，菜单项标题即开关状态）
export const applyReload = (apply?) => {
  if (apply) apply();
  window.location.reload();
  return true
};
// 本站是否被写进域名黑名单——菜单里“禁用脚本”改的就是这份全局列表
export const blacklistedDomains = () => configManager.get('blacklist.domains') || [];
// 本站是否在域名黑名单里，也就是脚本是否被禁用
export const siteDisabled = () => blacklistedDomains().includes(location.host);
// 右键菜单是否启用（这一项实时生效，不靠刷新）
export const menuOn = () => configManager.get('rightClickMenu.enable') !== false;
// 「站点默认调节逻辑是否被接管」的判定：属性名直接拼出配置键，三处判定只剩一份
export const blocksSet = name => configManager.get('enhance.blockSet' + name) === true;
// 布尔型配置项的统一开关：(key, layer, [开启文案, 关闭文案]) —— 读当前值、写指定层、重载生效
export const configSwitch = (key, layer, texts) => {
  const scope = configScope(layer);
  const isTurningOn = () => !configManager.get(key);
  const label = () => texts[isTurningOn() ? 0 : 1];
  return { title: () => `${label()} ${scope}`, fn: () => { applyReload(() => configSave(layer, key, isTurningOn())) } }
}
// 右键菜单「设置/关于」分组里的全局功能项
export const globalFunctional = {
  // 切换脚本的启用或禁用状态：黑名单是全局的一份列表，不是布尔开关
  toggleEnable: {
    title: () => `${siteDisabled() ? '启用脚本' : '禁用脚本'} ${configScope('site')}`,
    fn: () => {
      const turningOn = siteDisabled();
      applyReload(() => {
        const list = blacklistedDomains();
        configSave('global', 'blacklist.domains', turningOn
          ? list.filter(item => item !== location.host)
          : list.concat(location.host));
      });
    }
  },
  // 切换默认播放进度的控制逻辑
  toggleCurrentTime: configSwitch('enhance.blockSetCurrentTime', 'site',['允许默认播放进度控制逻辑', '禁用默认播放进度控制逻辑']),
  toggleVolume: configSwitch('enhance.blockSetVolume', 'site',['允许默认音量控制逻辑', '禁用默认音量控制逻辑']),
  // 倍速参数只能全局设置，本站覆盖会互相打架
  togglePlaybackRate: configSwitch('enhance.blockSetPlaybackRate', 'global',['允许默认速度调节逻辑', '禁用默认速度调节逻辑']),
  toggleGain: configSwitch('enhance.allowAcousticGain', 'global',['开启音量增益能力', '禁用音量增益能力']),
  toggleCrossControl: configSwitch('enhance.allowCrossOriginControl', 'global',['开启跨域控制能力', '禁用跨域控制能力']),
  toggleExperiment: configSwitch('enhance.allowExperimentFeatures', 'global', ['开启实验性功能', '禁用实验性功能']),
  toggleExternal: configSwitch('enhance.allowExternalCustomConfiguration', 'global',['开启外部自定义能力', '关闭外部自定义能力']),
  toggleDebug: configSwitch('debug', 'global', ['开启调试模式', '关闭调试模式']),
  // 还原全局的默认配置
  restoreDefault: {
    title: '还原全局的默认配置',
    fn: () => {
      configManager.clear();
      applyReload();
    }
  },
    openFrame: { title: '单独打开跨域的页面', fn: () => { Utils.openTab(location.href); } },
  // 切换视频右键菜单的启用或禁用状态（实时生效，无需刷新）
  toggleMenu: {
    title: () => `${menuOn() ? '禁用' : '启用'}视频右键菜单 ${configScope('global')}`,
    fn: () => {
      const isEnable = menuOn();
      configSave('global', 'rightClickMenu.enable', !isEnable);
      menu.close();
    }
  },
  toggleHotkeys: configSwitch('enableHotkeys', 'global', ['启用快捷键', '禁用快捷键']),
  siteHotkeys: configSwitch('enableHotkeys', 'site', ['启用快捷键', '禁用快捷键']),
  toggleMouse: configSwitch('mouse.enable', 'global', ['启用鼠标控制', '禁用鼠标控制']),
  siteMouse: configSwitch('mouse.enable', 'site', ['启用鼠标控制', '禁用鼠标控制']),
  setLongPress: {
    title: () => `长按多久响应鼠标长按事件 ${configScope('global')}`,
    fn: () => {
      const typed = prompt(`长按多久响应鼠标长按事件 ${configScope('global')}`, configManager.get('mouse.longPressTime') || 600);
      if (!typed) { return }
      configSave('global', 'mouse.longPressTime', Number(typed));
      window.location.reload();
    }
  },
  toggleDownload: configSwitch('download.enable', 'global', ['开启媒体下载', '关闭媒体下载']),
  siteDownload: configSwitch('download.enable', 'site', ['开启媒体下载', '关闭媒体下载'])
};
// 菜单叶子：只声明「命令名 + 参数」，派发交给 runCommand；节点保留 command/args 供测试核对可派发性
export const menuCmd = (title, command, ...args) => ({ title, command, args, fn: () => runCommand(command, args) });
// 「⚙️ 设置」子菜单：这里列的就是菜单顺序，数组之间自动插一条分隔线
export const menuGroups = [
  ['toggleMenu', 'toggleEnable'],
  ['togglePlaybackRate', 'toggleCurrentTime', 'toggleVolume', 'toggleGain', 'toggleCrossControl', 'toggleExperiment', 'toggleExternal'],
  ['toggleHotkeys', 'siteHotkeys', 'toggleMouse', 'siteMouse', 'setLongPress', 'toggleDownload', 'siteDownload'],
  ['toggleDebug', 'restoreDefault', 'openFrame']
];
// 把菜单分组展开成菜单项数组，组与组之间插一条分隔线
export const menuItems = () => menuGroups.map(group => group.map(key => globalFunctional[key])).reduce((all, items, i) => all.concat(i ? { divider: true } : [], items), []);
