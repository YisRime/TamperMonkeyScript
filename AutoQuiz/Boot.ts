// 启动序列：识别平台、建引擎、挂面板的轮询安排；本文件只有函数，按序调用它们的是 Entry.ts
import { AddonLoop, shareContext } from "./Addon.ts";
import { ControlPanel } from "./Panel.ts";
import { Logger, NAMESPACE, unique } from "./Utils.ts";
import { Store } from "./Config.ts";
import { PlatformRegistry } from "./Spec.ts";
import { QuizEngine } from "./Engine.ts";

let INSTANCE = null;

// 安排启动：识别平台 → 建引擎 → 挂面板
export function scheduleBoot() {
  let tries = 0;
  let timer = null;
  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };
  const attempt = () => {
    tries += 1;
    Promise.resolve()
      .then(async () => {
        if (INSTANCE) return INSTANCE;
        const store = new Store(NAMESPACE);
        const settings = store.settings();
        if (!settings.enabled) return null;
        const spec = PlatformRegistry.detect(location.href, document);
        if (!spec) return null;
        INSTANCE = true;
        try {
          const log = new Logger();
          const engine = new QuizEngine({ spec, settings, store, log });
          await engine.applyFont();
          const questions = engine.rescan();
          if (!questions.length) {
            INSTANCE = null;
            return null;
          }
          let panel = null;
          if (settings.showPanel) {
            panel = new ControlPanel(engine, { store, log, settings });
            panel.mount(engine.doc || document);
          }
          log.info(`已识别平台「${spec.name}」，采集到 ${questions.length} 题（${unique(questions.map((q) => q.type)).join('/')}）`);
          INSTANCE = { engine, panel, spec, store, log, settings };
          shareContext({ settings, log });
          if (settings.autoStart) engine.start();
          return INSTANCE;
        } catch (e) {
          INSTANCE = null;
          throw e;
        }
      })
      .then((instance) => {
        if (instance) stop();
      })
      .catch((e) => console.warn('[autoquiz] 启动失败:', e && e.message));
    try {
      AddonLoop.obtain(document);
    } catch (e) {}
    if (tries > 40) stop();
  };
  timer = setInterval(attempt, 3000);
  attempt();
}
