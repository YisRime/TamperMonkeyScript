import { Utils } from "./Utils";
import { activePlayer } from "./Player";
import { menu } from "./Menu";
// 五个滤镜的定义表：命令名直接由 name 派生（brightness / brightnessUp / brightnessDown），步进量与显示换算只在这里写一次
export const filterDefs = [
  { name: 'brightness', noun: '亮度', up: '☀️', down: '🌙', label: '图像亮度：', scale: 100, unit: '%', base: 1, step: 0.1 },
  { name: 'contrast', noun: '对比度', up: '◐', down: '◑', label: '图像对比度：', scale: 100, unit: '%', base: 1, step: 0.1 },
  { name: 'saturation', noun: '饱和度', up: '🌈', down: '🌫️', label: '图像饱和度：', scale: 100, unit: '%', base: 1, step: 0.1 },
  // 色相是角度、模糊是像素，按原值展示，不能像比例值那样乘上100；色相是唯一可以取负的一组
  { name: 'hue', noun: '色相', up: '🎨', down: '🎨', label: '图像色相：', scale: 1, unit: '°', base: 0, step: 1, negative: true },
  { name: 'blur', noun: '模糊度', up: '💨', down: '💨', label: '图像模糊度：', scale: 1, unit: 'px', base: 0, step: 1 }
];
// 五个滤镜的缺省值，顺序与 filterDefs 一致，复位与取值都从它出发
const filterDefaults = filterDefs.map(def => def.base);
export class PictureControl {
  defaultTransform: any;
  scale: any;
  translate: any;
  rotate: any;
  rotateY: any;
  rotateX: any;
  historyTransform: any;
  transformGuard: any;
  _transformStyle: any;
  filter: any;
  key: any;
  setup: any;
  constructor () {
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
      setup: function () { activePlayer.player().style.filter = `brightness(${this.key[0]}) contrast(${this.key[1]}) saturate(${this.key[2]}) hue-rotate(${this.key[3]}deg) blur(${this.key[4]}px)`; },
      reset: function () { this.key = filterDefaults.slice(); this.setup(); }
    };
  }
  // 画面样式由定时守护负责维持：值没变、也没被人改掉时不要重复赋值，避免持续触发样式重算
  writeTransform (player, transform) {
    const cache = picture._transformStyle;
    if (cache.wanted === transform && player.style.transform === cache.actual) { return }
    player.style.transform = transform;
    cache.wanted = transform;
    cache.actual = player.style.transform;
  }
  // 逐键比较当前值与缺省值（translate 有两个子键），有差异就把 (键, 子键, 当前值) 交给回调
  eachDiff (handler) {
    Object.keys(picture.defaultTransform).forEach(key => {
      const def = picture.defaultTransform[key];
      if (Utils.isObj(def)) { Object.keys(def).forEach(subKey => { if (Number(picture[key][subKey]) !== def[subKey]) { handler(key, subKey, picture[key][subKey]) } }); } else if (Number(picture[key]) !== def) { handler(key, null, picture[key]) }
    });
  }
  // 设置视频画面的缩放与位移
  setTransform (notTips) {
    const player = activePlayer.player();
    const scale = picture.scale = Number(Number(picture.scale).toFixed(2));
    const translate = picture.translate;
    const mirror = picture.rotateX === 180 ? `rotateX(${picture.rotateX}deg)` : (picture.rotateY === 180 ? `rotateY(${picture.rotateY}deg)` : '');
    const transform = `scale(${scale.toFixed(2)}) translate(${translate.x}px, ${translate.y}px) rotate(${picture.rotate}deg) ${mirror}`;
    picture.writeTransform(player, transform);
    let tipsMsg = '视频缩放率：' + `${(scale * 100).toFixed(0)}%`;
    if (translate.x) { tipsMsg += ` 水平位移：${picture.translate.x}px`; }
    if (translate.y) { tipsMsg += ` 垂直位移：${picture.translate.y}px`; }
    if (notTips !== true) {
      picture.eachDiff((key, subKey, val) => { if (subKey) { picture.historyTransform[key] = picture.historyTransform[key] || {}; picture.historyTransform[key][subKey] = val; } else { picture.historyTransform[key] = val; } });
      menu.tips(tipsMsg);
    }
    if (!picture.transformGuard) { picture.transformGuard = setInterval(() => { picture.setTransform(true); }, 300); }
  }
  // 视频画面旋转 90 度
  setRotate () {
    picture.rotate += 90;
    if (picture.rotate % 360 === 0) picture.rotate = 0;
    picture.setTransform(true);
    menu.tips('画面旋转：' + picture.rotate + '°');
  }
  // 镜像就是绕对应那根轴翻到 180 再翻回来，两个方向只差一个字段名
  setMirror (vertical = false) {
    const axis = vertical ? 'rotateX' : 'rotateY';
    picture[axis] = picture[axis] === 0 ? 180 : 0;
    picture.setTransform(true);
    menu.tips(` ${vertical ? '垂直' : '水平'}镜像 ${picture[axis]}deg`)
  }
  // 缩放视频画面：菜单与用户自定的快捷键都可能把字符串递进来，先收成数字再落状态
  setScale (num) {
    num = Number(num);
    picture.scale = Number.isNaN(num) ? 1 : num;
    picture.setTransform();
  }
  // 缩放一档：放大与缩小只差一个符号
  scaleStep (num, sign) { picture.setScale(picture.scale + sign * Utils.stepValue(num, 0.05)); }
  // 视频放大
  zoomIn (num) { picture.scaleStep(num, 1) }
  // 视频缩小
  zoomOut (num) { picture.scaleStep(num, -1) }
  // 设置视频画面的位移属性
  setTranslate (x, y) {
    if (typeof x === 'number') { picture.translate.x = x; }
    if (typeof y === 'number') { picture.translate.y = y; }
    picture.setTransform();
  }
  // 沿一个轴平移一步，四个方向只差符号；命令名要留给默认快捷键配置，所以各留一层壳
  translateStep (axis, sign, num) {
    const step = sign * Utils.stepValue(num, 10);
    picture.setTranslate(axis === 'x' ? picture.translate.x + step : null, axis === 'y' ? picture.translate.y + step : null);
  }
  // 视频画面向右平移
  moveRight (num) { return picture.translateStep('x', 1, num) }
  // 视频画面向左平移
  moveLeft (num) { return picture.translateStep('x', -1, num) }
  // 视频画面向上平移
  moveUp (num) { return picture.translateStep('y', -1, num) }
  // 视频画面向下平移
  moveDown (num) { return picture.translateStep('y', 1, num) }
  // 复位画面变换：已到缺省值就退回上一次的历史值，否则回到出厂缺省
  resetTransform (notTips) {
    let diff = false;
    picture.eachDiff(() => { diff = true; });
    if (!diff && Object.keys(picture.historyTransform).length) {
      Object.keys(picture.historyTransform).forEach(key => {
        if (Utils.isObj(picture.historyTransform[key])) {
          Object.keys(picture.historyTransform[key]).forEach(subKey => { picture[key][subKey] = picture.historyTransform[key][subKey]; });
        } else { picture[key] = picture.historyTransform[key]; }
      });
    } else {
      const defaultTransform = Utils.clone(picture.defaultTransform);
      Object.keys(defaultTransform).forEach(key => { picture[key] = defaultTransform[key]; });
    }
    picture.setTransform(notTips);
  }
  // — 图像滤镜：亮度/对比度/饱和度/色相/模糊（原 FilterControl 全部并入此处）
  setFilter (item, num, isDown) {
    const def = filterDefs[item];
    if (!def || typeof num !== 'number') {
      console.log('[Picture] 滤镜参数错误', item, num);
      return false
    }
    if (isDown === true && num > 0) { num = -num; }
    const key = picture.filter.key;
    key[item] = Number((key[item] + num).toFixed(2));
    if (key[item] < 0 && !def.negative) { key[item] = 0 }
    picture.filter.setup();
    menu.tips(def.label + parseInt(String(key[item] * def.scale)) + def.unit)
  }
  // 五个滤镜的 15 个动作（brightnessUp / hueDown …）按 filterDefs 生成到原型上
  resetPicture () {
    picture.resetTransform(true);
    picture.filter.reset();
    menu.tips('图像属性：复位');
  }
}
// 单例由入口按序构造（见入口 Entry）：模块求值期不读别处的绑定
export let picture = null;
// 入口用的工厂：造出唯一实例并回填模块绑定
export const createPicture = () => { picture = new PictureControl(); return picture };
// 五个滤镜的 15 个动作（brightness / brightnessUp / brightnessDown …）按 filterDefs 生成到原型上，快捷键派发表照旧从原型推导
filterDefs.forEach((def, item) => {
  PictureControl.prototype[def.name] = num => picture.setFilter(item, num);
  PictureControl.prototype[def.name + 'Up'] = num => picture.setFilter(item, num || def.step);
  PictureControl.prototype[def.name + 'Down'] = num => picture.setFilter(item, num || -def.step, true);
});
