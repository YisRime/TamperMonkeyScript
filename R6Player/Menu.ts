// 右键菜单的接管只装一次：状态留在本模块，不再往页面的 window 上打标记
import { Utils } from "./Utils";
import { menuOn, menuCmd, menuItems } from "./Config";
import { activePlayer } from "./Player";
import { input } from "./Input";
import { filterDefs } from "./Picture";
// 右键菜单与提示浮层的样式表：注入 Shadow DOM 隔离站点样式，只有 MenuControl 用
export const menuStyle = `
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
let contextMenuInited = false;
// 播放器画面上的即时提示浮层
export class MenuControl {
  fontSize: any;
  tipsClassName: any;
  timers: any;
  host: any;
  shadow: any;
  isOpen: any;
  menuStack: any;
  closeBound: any;
  constructor () {
    this.fontSize = 12;
    this.tipsClassName = 'html_player_enhance_tips';
    this.timers = new Array(3);
    this.host = null;
    this.shadow = null;
    this.isOpen = false;
    this.menuStack = [];
    this.closeBound = false;
  }
  // 取提示浮层的挂载容器：播放器的父节点，父节点没有布局盒时再上退一层
  tipsHost (videoEl) {
    const player = videoEl || activePlayer.player();
    let tispContainer = player.parentNode || player;
    const containerBox = tispContainer.getBoundingClientRect();
    if ((!containerBox.width || !containerBox.height) && tispContainer.parentNode) { tispContainer = tispContainer.parentNode; }
    return tispContainer
  }
  // 在画面上弹一条即时提示，先备份容器行内样式，两秒后还原
  tips (str) {
    const player = activePlayer.player();
    if (!player) {
      console.log('[Menu] 提示无实例落空', str);
      return true
    }
    const isAudio = activePlayer.isAudioInstance();
    const parentNode = menu.tipsMount();
    if (parentNode === player) {
      console.log('[Menu] 提示容器异常', player, str);
      return false
    }
    let backupStyle = '';
    if (!isAudio) {
      const defStyle = parentNode.getAttribute('style') || '';
      backupStyle = parentNode.getAttribute('style-backup') || '';
      if (!backupStyle) {
        let backupSty = defStyle || 'style-backup: none';
        const backupStyObj: any = {};
        backupSty.split(';').forEach(item => { const parts = item.split(':'); if (parts.length === 2) { backupStyObj[parts[0].trim()] = parts[1].trim(); } });
        if (backupStyObj.opacity === '0') { backupStyObj.opacity = '1'; }
        if (backupStyObj.visibility === 'hidden') { backupStyObj.visibility = 'visible'; }
        backupSty = Object.keys(backupStyObj).map(key => `${key}: ${backupStyObj[key]}`).join('; ');
        parentNode.setAttribute('style-backup', backupSty);
        backupStyle = defStyle;
      } else if (defStyle && !defStyle.includes('style-backup')) { backupStyle = defStyle; }
      const newStyleArr = backupStyle.split(';');
      const oldPosition = parentNode.getAttribute('def-position') || window.getComputedStyle(parentNode).position;
      if (parentNode.getAttribute('def-position') === null) { parentNode.setAttribute('def-position', oldPosition || ''); }
      if (['static', 'inherit', 'initial', 'unset', ''].includes(oldPosition)) { newStyleArr.push('position: relative'); }
      const playerBox = player.getBoundingClientRect();
      const parentNodeBox = parentNode.getBoundingClientRect();
      if (!parentNodeBox.width || !parentNodeBox.height) {
        newStyleArr.push('min-width:' + playerBox.width + 'px');
        newStyleArr.push('min-height:' + playerBox.height + 'px');
      }
      parentNode.setAttribute('style', newStyleArr.join(';'));
      const newPlayerBox = player.getBoundingClientRect();
      if (Math.abs(newPlayerBox.height - playerBox.height) > 50) { parentNode.setAttribute('style', backupStyle); }
    }
    const tipsSelector = '.' + menu.tipsClassName;
    const tipsList = document.querySelectorAll(tipsSelector);
    if (tipsList.length > 1) { tipsList.forEach(tipsItem => { tipsItem.remove(); }); }
    let tipsDom = parentNode.querySelector(tipsSelector);
    if (!tipsDom) {
      menu.initTips();
      tipsDom = parentNode.querySelector(tipsSelector);
      if (!tipsDom) {
        console.log('[Menu] 提示节点缺失');
        return false
      }
    }
    const style = tipsDom.style;
    tipsDom.innerText = str;
    for (let i = 0; i < 3; i++) { if (menu.timers[i]) clearTimeout(menu.timers[i]); }
    // 提示的显示序列：先 display 再下一帧上透明度，两秒后隐藏并还原容器样式
    function showTips () {
      style.display = 'block';
      menu.timers[0] = setTimeout(function () { style.opacity = 1; }, 50);
      menu.timers[1] = setTimeout(function () {
        style.opacity = 0;
        style.display = 'none';
        if (backupStyle) { parentNode.setAttribute('style', backupStyle); }
      }, 2000);
    }
    if (style.display === 'block') {
      style.display = 'none';
      clearTimeout(menu.timers[2]);
      menu.timers[2] = setTimeout(function () { showTips(); }, 100);
    } else { showTips(); }
  }
  // 提示节点的挂载容器：音频实例没有可用的画面包裹层，直接挂在 body 上
  tipsMount () { return activePlayer.isAudioInstance() ? document.body : menu.tipsHost() }
  // 设置提示DOM的样式
  initTips () {
    const isAudio = activePlayer.isAudioInstance();
    const parentNode = menu.tipsMount();
    if (parentNode.querySelector('.' + menu.tipsClassName)) return
    const tipsStyle = `
      position: ${isAudio ? 'fixed' : 'absolute'};
      z-index: 999999;
      font-size: ${menu.fontSize || 16}px;
      padding: 5px 10px;
      background: rgba(0,0,0,0.4);
      color:white;
      ${isAudio ? 'bottom: 0; right: 0;' : 'top: 0; left: 0;'}
      transition: all 500ms ease;
      opacity: 0;
      border-${isAudio ? 'top-left' : 'bottom-right'}-radius: 5px;
      display: none;
      -webkit-font-smoothing: subpixel-antialiased;
      font-family: 'microsoft yahei', Verdana, Geneva, sans-serif;
      -webkit-user-select: none;
    `;
    const tips = document.createElement('div');
    tips.setAttribute('style', tipsStyle);
    tips.setAttribute('class', menu.tipsClassName);
    parentNode.appendChild(tips);
  }
  // 将菜单浮层定位到指定坐标，并确保完整显示在视口内
  placeMenu (menuEl, x, y) {
    menuEl.style.left = '0px';
    menuEl.style.top = '0px';
    const rect = menuEl.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    let left = x;
    if (left + rect.width > vw - 8) { left = vw - rect.width - 8; }
    if (left < 8) { left = 8; }
    let top = y;
    if (top + rect.height > vh - 8) { top = vh - rect.height - 8; }
    if (top < 8) { top = 8; }
    menuEl.style.left = left + 'px';
    menuEl.style.top = top + 'px';
  }
  // 关闭第level层及更深的菜单浮层
  closeFrom (level) {
    for (let i = menu.menuStack.length - 1; i >= level; i--) {
      const el = menu.menuStack[i];
      el && el.remove();
      menu.menuStack.splice(i, 1);
    }
  }
  // 关掉整个菜单栈并清掉打开标记
  close () {
    menu.closeFrom(0);
    menu.isOpen = false;
  }
  //   渲染一层菜单浮层：nodes 结构 {title, fn, children, divider}，level 为层级，(x, y) 为期望坐标全屏时要挂到全屏元素内部，否则菜单会被 top layer 遮挡
  renderNodes (nodes, level, x, y) {
    const mountRoot = document.fullscreenElement || document.documentElement;
    if (!(menu.host && menu.host.isConnected && menu.host.parentNode === mountRoot && menu.shadow)) {
      if (menu.host && menu.host.isConnected) { menu.host.parentNode.removeChild(menu.host); }
      menu.host = document.createElement('div');
      menu.host.style.cssText = 'position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647;';
      mountRoot.appendChild(menu.host);
      if (menu.host.attachShadow) { menu.shadow = menu.host.attachShadow({ mode: 'open' }); } else { menu.shadow = menu.host; }
      const style = document.createElement('style');
      style.textContent = menuStyle;
      menu.shadow.appendChild(style);
    }
    const menuEl = Utils.el('div', 'r6pcm-menu');
    nodes.forEach(node => {
      if (node.divider) {
        const divider = Utils.el('div', 'r6pcm-divider');
        menuEl.appendChild(divider);
        return
      }
      const row = Utils.el('div', 'r6pcm-item');
      const label = Utils.el('span', 'r6pcm-item__label');
      label.textContent = typeof node.title === 'function' ? node.title() : (node.title || '');
      row.appendChild(label);
      if (Array.isArray(node.children) && node.children.length) {
        const arrow = Utils.el('span', 'r6pcm-item__arrow');
        arrow.textContent = '▸';
        row.appendChild(arrow);
        row.addEventListener('mouseenter', () => {
          menu.closeFrom(level + 1);
          const rowRect = row.getBoundingClientRect();
          const subEl = menu.renderNodes(node.children, level + 1, rowRect.right + 2, rowRect.top - 6);
          const subRect = subEl.getBoundingClientRect();
          if (subRect.right > window.innerWidth - 8) { menu.placeMenu(subEl, rowRect.left - subRect.width - 2, rowRect.top - 6); }
        });
      } else {
        row.addEventListener('mouseenter', () => { menu.closeFrom(level + 1); });
        if (node.fn instanceof Function) {
          row.addEventListener('click', (event) => {
            event.stopPropagation();
            menu.close();
            setTimeout(() => {
              try { node.fn() } catch (err) { console.log('[Menu] 菜单动作异常', err) }
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
    return menuEl
  }
  // 在 (x, y) 处打开菜单：先清旧栈，再渲染功能树第一层；全局关闭事件（点外部 / Esc / 滚动 / 缩放 / 全屏切换 / 失焦）只挂一次
  open (x, y) {
    menu.close();
    menu.renderNodes(MenuControl.buildTree(), 0, x, y);
    if (menu.closeBound) return
    menu.closeBound = true;
    window.addEventListener('mousedown', (event) => {
      if (!menu.isOpen) return
      if (!Utils.eventPath(event).includes(menu.host)) { menu.close() }
    }, true);
    window.addEventListener('keydown', (event) => { if (menu.isOpen && event.key === 'Escape') { menu.close() } }, true);
    window.addEventListener('scroll', () => { menu.isOpen && menu.close() }, true);
    window.addEventListener('resize', () => { menu.isOpen && menu.close() });
    document.addEventListener('fullscreenchange', () => { menu.isOpen && menu.close() });
    window.addEventListener('blur', () => { menu.isOpen && menu.close() });
  }
  // 功能树（单一数据源）：视频右键的多级增强菜单直接渲染该树
  static buildTree () {
    return [
      {
        title: '▶ 播放控制',
        children: [
          menuCmd('⏯ 播放 / 暂停', 'switchPlay'),
          menuCmd('⏩ 快进 5 秒', 'seekForward'),
          menuCmd('⏭ 快进 30 秒', 'seekForward', 30),
          menuCmd('⏪ 后退 5 秒', 'seekBack'),
          menuCmd('⏮ 后退 30 秒', 'seekBack', -30),
          { divider: true },
          menuCmd('▶| 下一帧', 'freezeFrame', 1),
          menuCmd('|◀ 上一帧', 'freezeFrame', -1),
          menuCmd('⏭ 播放下一集（需网站支持）', 'nextVideo')
        ]
      },
      {
        title: '🎚 倍速',
        children: [
          menuCmd('🐢 减速播放 -0.1', 'slowDown'),
          menuCmd('🐇 加速播放 +0.1', 'speedUp'),
          menuCmd('↩️ 恢复正常速度（1x / 上次倍速）', 'resetSpeed'),
          { divider: true },
          ...['0.5', '0.75', '1.0', '1.25', '1.5', '2.0', '3.0', '4.0', '8.0', '16.0'].map(r => menuCmd(r + 'x', 'applyRate', Number(r))),
          { divider: true },
          ...['1', '2', '3', '4'].map(n => menuCmd('🚀 快速跳速 ' + n + 'x（连按叠加）', 'boost', Number(n)))
        ]
      },
      {
        title: '🔊 音量',
        children: [menuCmd('🔊 音量 +20%', 'volumeUp', 0.2), menuCmd('🔉 音量 -20%', 'volumeDown', -0.2), menuCmd('🔊 音量 +5%', 'volumeUp', 0.05), menuCmd('🔉 音量 -5%', 'volumeDown', -0.05)]
      },
      {
        title: '🖼 画面',
        children: [
          menuCmd('📷 截图（复制到剪贴板并下载）', 'capture'),
          menuCmd('📺 画中画', 'togglePicture'),
          menuCmd('⛶ 全屏', 'maximize'),
          menuCmd('🖥 网页全屏', 'webMaximize'),
          { divider: true },
          menuCmd('🔄 画面旋转 90°', 'setRotate'),
          menuCmd('↔️ 画面水平镜像翻转', 'setMirror'),
          menuCmd('↕️ 画面垂直镜像翻转', 'setMirror', true),
          { divider: true },
          menuCmd('🔍 放大画面 +0.05', 'zoomIn'),
          menuCmd('🔍 缩小画面 -0.05', 'zoomOut'),
          menuCmd('🎯 恢复画面（缩放位移复位）', 'resetTransform'),
          { divider: true },
          ...[['➡️', '右', 'Right'], ['⬅️', '左', 'Left'], ['⬆️', '上', 'Up'], ['⬇️', '下', 'Down']].map(([icon, name, dir]) => menuCmd(icon + ' 画面' + name + '移 10px', 'move' + dir))
        ]
      },
      {
        title: '🎨 滤镜',
        children: [
          ...filterDefs.flatMap(def => [menuCmd(def.up + ' 增加' + def.noun, def.name + 'Up'), menuCmd(def.down + ' 减少' + def.noun, def.name + 'Down')]),
          { divider: true },
          menuCmd('♻️ 图像复位（滤镜+画面）', 'resetPicture')
        ]
      },
      { title: '⬇️ 下载与进度', children: [menuCmd('⬇️ 下载音视频（实验性功能）', 'mediaDownload'), { divider: true }, menuCmd('启用/禁用：自动跟随跳转到缓冲区时间', 'toggleBuffered'), menuCmd('🔁 允许/禁止自动恢复播放进度', 'toggleRestore')] },
      { title: '⌨️ 快捷键', children: [menuCmd(() => `${input.keysPaused ? '启用快捷键' : '禁用快捷键'}（临时）`, 'toggleHotkeys'), menuCmd(() => `${input.enable ? '禁用' : '启用'} r6Player 增强（Ctrl+空格）`, 'toggleEnhance')] },
      { title: '⚙️ 设置', children: menuItems() },
      { title: 'ℹ️ 关于', children: [menuCmd('🖨 打印播放器信息（调试）', 'printInfo')] }
    ]
  }
  // 初始化视频右键菜单：window 捕获阶段接管 contextmenu，先于网站自身处理
  static init () {
    if (contextMenuInited) return
    contextMenuInited = true;
    window.addEventListener('contextmenu', (event) => {
      if (!menuOn()) {
        menu.close();
        return
      }
      const mediaEl = Utils.eventPath(event).find(node => node && Utils.isMedia(node));
      const selection = window.getSelection && window.getSelection();
      if (!mediaEl || !Utils.onMedia(mediaEl, event.clientX, event.clientY) || (selection && !selection.isCollapsed)) {
        menu.close();
        return
      }
      if (activePlayer.player() !== mediaEl) { activePlayer.claim(mediaEl); }
      event.preventDefault();
      event.stopPropagation();
      menu.open(event.clientX, event.clientY);
    }, true);
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let menu = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createMenu = () => { menu = new MenuControl(); return menu };