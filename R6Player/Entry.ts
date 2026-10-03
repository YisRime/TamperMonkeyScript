// 入口：打包从这里出发，也是唯一的生命周期声明处，内部对象清单也挂在本文件；import 只负责把模块拉进图里，书写顺序不携带语义
import { Utils } from "./Utils";
import * as UtilsModule from "./Utils";
import * as bootModule from "./Boot";
import * as bridgeModule from "./Bridge";
import * as configModule from "./Config";
import * as inputModule from "./Input";
import * as mediaModule from "./Media";
import * as menuModule from "./Menu";
import * as pictureModule from "./Picture";
import * as playerModule from "./Player";
import * as taskModule from "./Task";
import * as tunerModule from "./Tuner";
import { createMedia, createSource } from "./Media";
import { createPlayer } from "./Player";
import { createMenu } from "./Menu";
import { createTuner } from "./Tuner";
import { createPicture } from "./Picture";
import { createInput, buildCommands } from "./Input";
import { bootState, startUp } from "./Boot";
// 内部对象清单 window.__playerInternals：名单由各模块导出面自动拼出，加一个导出就自动可寻址；取值走活绑定名单的次序即同名导出的归属次序：入口的置换门会打乱 import 行的书写顺序，所以重名必须当场报，不许靠次序蒙对
const MODULES = [
  bootModule, configModule, mediaModule, bridgeModule, UtilsModule,
  inputModule, pictureModule, playerModule, tunerModule, menuModule, taskModule];
export const internals = {};
// 把各模块的导出面摊成 window.__playerInternals：同名导出当场报错，属性用 getter 保持活绑定
export const exposeInternals = () => {
  const seen = new Set();
  MODULES.forEach(ns => {
    Object.keys(ns).forEach(name => {
      if (seen.has(name)) { throw new Error('内部清单里名字重复：' + name) }
      seen.add(name);
      Object.defineProperty(internals, name, { enumerable: true, get: () => ns[name] });
    });
  });
  window.__playerInternals = internals;
  return internals
};
// 五个能力控制器的构造次序＝派发表里同名方法的归属次序，所以这份名单只此一份
const CAPABILITY_CONTROLLERS = [createPlayer, createMenu, createTuner, createPicture, createInput];
// 寻址面先就位：启动失败走重试路径时，测试与控制台也要能拿到内部对象
exposeInternals();
// 跨Tab的消息通道要先有自己的身份，pageBridge 与按键转发都按它过滤自己
Utils.getTabId();
// 两个支撑能力与五个控制器同一套时机：构造器只读字面量，不在求值期碰别处的绑定
createMedia();
createSource();
CAPABILITY_CONTROLLERS.forEach(create => create());
buildCommands();
// 某些极端情况下连访问 window 都会报错（如 www.icourse163.org），所以整个 init 都 try 起来
try { startUp(0); } catch (e) {
  setTimeout(() => {
    if (bootState.initTryCount < 200) {
      bootState.initTryCount++;
      startUp(0);
      console.log('[Entry] 启动重试', bootState.initTryCount, e);
    }
  }, 10);
}
