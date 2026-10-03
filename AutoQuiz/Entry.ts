// 入口：唯一的生命周期声明处，钩子同步、装载守卫与启动排程都在这里；import 只负责把模块拉进图里
import { HAS_DOM, NAMESPACE, PAGE_WINDOW, VERSION } from "./Utils.ts";
import { Store } from "./Config.ts";
import { syncHooks } from "./Addon.ts";
import { scheduleBoot } from "./Boot.ts";

if (HAS_DOM) {
  try {
    syncHooks(new Store(NAMESPACE).settings());
  } catch (e) {}
}

if (HAS_DOM && !PAGE_WINDOW.__AUTOQUIZ_LOADED__) {
  PAGE_WINDOW.__AUTOQUIZ_LOADED__ = VERSION;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', scheduleBoot);
  else scheduleBoot();
}
