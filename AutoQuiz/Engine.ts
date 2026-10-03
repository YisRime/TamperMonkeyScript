// 引擎域：双游标主循环、翻页推进与事件派发
import { ModelSource, AnswerHub, AnswerResolver, DEFAULT_SEPARATORS, AnswerWriter, CacheSource, CaptureSource, PageSource, QuestionScanner, BankSource } from "./Solve.ts";
import { PatrolShield, RiskGate, SubmitController } from "./Guard.ts";
import { FontDecoder, ImageReader } from "./Image.ts";
import { FrameProbe, TextSanitizer } from "./Probe.ts";
import { NetworkCapture } from "./Capture.ts";
import { QuestionType, HAS_DOM, PAGE_WINDOW, jitter, random, sleep, withTimeout } from "./Utils.ts";
import { SessionLock, VueProbe } from "./Addon.ts";

// 双游标：并发取串行答
export class QuizEngine {
  declare log: any;
  declare sessionId: any;
  declare settings: any;
  declare state: any;
  declare win: any;

  declare abort: any;
  declare capture: any;
  declare decoder: any;
  declare doc: any;
  declare hub: any;
  declare listeners: any;
  declare lock: any;
  declare ocr: any;
  declare ocrMisses: any;
  declare onEvent: any;
  declare pauseReason: any;
  declare questions: any;
  declare results: any;
  declare scanner: any;
  declare seenPages: any;
  declare spec: any;
  declare startedAt: any;
  declare store: any;
  declare submit: any;
  declare vueHooked: any;
  declare writer: any;

  constructor(options) {
    this.spec = options.spec;
    this.settings = options.settings;
    this.store = options.store;
    this.log = options.log;
    this.onEvent = options.onEvent || function () {};
    this.startedAt = 0;
    this.vueHooked = false;
    this.scanner = new QuestionScanner(this.spec, this.log);
    this.rebuildSources();
    this.writer = new AnswerWriter(this.spec, { settings: this.settings, log: this.log });
    this.submit = new SubmitController(this.spec, {
      settings: this.settings,
      log: this.log,
      requestPause: (why) => this.pause(why)
    });
    this.state = 'idle';
    this.questions = [];
    this.results = [];
    this.doc = null;
    this.win = null;
    this.abort = false;
    this.pauseReason = '';
    this.listeners = [];
    this.decoder = null;
    this.seenPages = new Set();
    this.ocr = null;
    this.ocrMisses = 0;
    this.sessionId = 'qa-' + Date.now().toString(36) + '-' + Math.floor(Math.random() * 1e6).toString(36);
    this.lock = null;
  }

  // 订阅事件
  subscribe(handler) {
    this.listeners.push(handler);
    return () => {
      const at = this.listeners.indexOf(handler);
      if (at >= 0) this.listeners.splice(at, 1);
    };
  }

  // 钩子只装一次
  ensureCapture() {
    if (!this.spec.capture) return null;
    if (!this.capture) this.capture = new NetworkCapture(this.spec, { log: this.log, settings: this.settings });
    if (this.settings.jsonCapture && this.settings.jsonCapture !== 'off') this.capture.install();
    else this.capture.uninstall();
    return this.capture;
  }

  // 重建源链
  rebuildSources() {
    const context = { settings: this.settings, store: this.store, log: this.log };
    this.hub = new AnswerHub();
    this.ensureCapture();
    this.applyProbe();
    Object.assign(context, { capture: this.capture });
    this.hub.register(new CaptureSource(context));
    this.hub.register(new PageSource(context));
    this.hub.register(new CacheSource(context));
    this.hub.register(new BankSource(context));
    this.hub.register(new ModelSource(context));
    return this.hub;
  }

  // 采集前先还原题干
  async applyFont() {
    if (!(this.settings.enableFontDecode && this.spec.font)) {
      if (this.decoder && this.decoder.observer) this.decoder.observer.disconnect();
      this.decoder = null;
      return false;
    }
    if (this.decoder) return true;
    this.decoder = new FontDecoder(this.spec, { log: this.log });
    return this.decoder.install(this.doc || (HAS_DOM ? document : null));
  }

  // 关档要还原页面
  applyShield() {
    if (!HAS_DOM) return false;
    const want = Number(this.settings.antiPatrolLevel) || 0;
    const current = Number(PAGE_WINDOW.__AUTOQUIZ_PATROL_LEVEL__) || 0;
    if (want === current) return want > 0;
    if (current) PatrolShield.uninstall({ win: PAGE_WINDOW });
    if (!want) {
      this.log.info('防巡查已关闭，页面被改过的方法已还原');
      return false;
    }
    PatrolShield.install(want, { win: PAGE_WINDOW, page: document, log: this.log });
    return true;
  }

  // 有接口才装钩子
  applyProbe() {
    const useful = !!this.spec.capture;
    if (!this.settings.useVueProbe || !useful) {
      if (this.vueHooked) {
        VueProbe.uninstall();
        this.vueHooked = false;
      }
      if (this.settings.useVueProbe && !useful) this.log.warn('该平台没有接口形态，Vue 取题无处可用（不装全局钩子）');
      return false;
    }
    if (this.vueHooked) return true;
    this.vueHooked = VueProbe.install(PAGE_WINDOW);
    if (this.vueHooked) this.log.info('已注入 Vue 全局 mixin，组件私有数据将并入接口采集');
    return this.vueHooked;
  }

  // Vue 组件补题源
  harvestVue() {
    if (!this.vueHooked || !this.capture) return 0;
    let added = 0;
    const seen = new Set();
    const collected = [];
    for (const vm of PAGE_WINDOW[VueProbe.LIST] || []) {
      if (collected.length >= 400) break;
      const data = vm && (vm._data || vm.$data);
      if (!data || typeof data !== 'object' || seen.has(data)) continue;
      seen.add(data);
      collected.push(data);
    }
    for (const data of collected) {
      try {
        added += this.capture.ingest(data);
      } catch (e) {}
    }
    return added;
  }

  // worker 要复用
  ensureOcr() {
    if (!this.ocr) this.ocr = new ImageReader({ settings: this.settings, log: this.log, store: this.store, win: this.win || PAGE_WINDOW });
    return this.ocr;
  }

  // 释放识图引擎
  disposeOcr() {
    const reader = this.ocr;
    this.ocr = null;
    if (reader && reader.worker && reader.worker.terminate) {
      try {
        reader.worker.terminate();
      } catch (e) {}
    }
  }

  // 识图文本并回题面
  writeOcr(question, text) {
    const literals = (String(question.stem == null ? '' : question.stem).match(/<img[^>]*>/gi) || []).join(' ');
    const parts = [question.plainStem, text].filter(Boolean);
    question.ocrText = text;
    question.stem = parts.join(' ') + (literals ? ' ' + literals : '');
  }

  // 识图补题干
  async enrichOcr(question) {
    if (!this.settings.useOcr || !HAS_DOM || !question || !question.root) return false;
    if (question.ocrText) return true;
    if (TextSanitizer.normalize(question.plainStem).length >= (this.settings.ocrMinStemChars || 6)) return false;
    const node = ImageReader.pickImage(question.root, this.settings);
    const url = ImageReader.urlOf(node);
    if (!url) return false;
    const cached = this.store.ocrGet(url);
    if (cached) {
      this.writeOcr(question, cached);
      return true;
    }
    if (this.ocrMisses >= 2) return false;
    let text = '';
    try {
      const image = await ImageReader.toInline(url, this.settings, this.win || PAGE_WINDOW);
      text = await this.ensureOcr().recognize(image);
    } catch (e) {
      this.log.warn('识图取图失败: ' + e.message);
    }
    if (!text) {
      this.ocrMisses += 1;
      return false;
    }
    this.writeOcr(question, text);
    this.store.ocrPut(url, text);
    this.log.info(`识图补全题干：${text.slice(0, 30)}`);
    return true;
  }

  // 重扫题目
  rescan() {
    if (this.capture) this.capture.drain();
    const fromVue = this.harvestVue();
    if (fromVue) this.log.info('从 Vue 组件数据补到 ' + fromVue + ' 题');
    const located = this.scanner.scan();
    this.questions = located.questions;
    this.doc = located.doc;
    this.win = located.win;
    this.results = new Array(this.questions.length).fill(null);
    this.seenPages = new Set();
    this.onEvent('scan', this.summary());
    return this.questions;
  }

  // 派发事件
  emit(type, payload) {
    if (this.onEvent) {
      try {
        this.onEvent(type, payload);
      } catch (e) {}
    }
    for (const listener of this.listeners) {
      try {
        listener(type, payload);
      } catch (e) {}
    }
  }

  // 席位键按域名
  sessionHost() {
    const win = this.win || PAGE_WINDOW;
    try {
      return (win && win.location && win.location.hostname) || (HAS_DOM ? location.hostname : '') || 'local';
    } catch (e) {
      return 'local';
    }
  }

  // 多开互斥
  acquireLock() {
    if (!this.settings.useSingleTab || !HAS_DOM) return false;
    if (!this.lock) {
      this.lock = new SessionLock({
        win: this.win || PAGE_WINDOW,
        sessionId: this.sessionId,
        log: this.log,
        onConflict: () => this.pause('同站已有另一个标签页在作答')
      });
    }
    return this.lock.acquire(this.sessionHost());
  }

  // 开始作答
  start() {
    if (this.state === 'running') return;
    this.store.set('stop', false);
    if (!this.questions.length) this.rescan();
    if (!this.questions.length) {
      this.emit('notice', '没有采集到题目');
      return;
    }
    this.abort = false;
    this.state = 'running';
    this.startedAt = Date.now();
    this.applyShield();
    this.acquireLock();
    this.submit.install(this.win || PAGE_WINDOW);
    this.emit('state', this.state);
    this.run().catch((e) => {
      this.state = 'error';
      this.log.error('主循环异常: ' + e.message);
      this.emit('state', this.state);
    });
  }

  // 暂停
  pause(reason) {
    if (this.state !== 'running') return;
    this.state = 'paused';
    this.pauseReason = reason || '';
    this.store.set('stop', true);
    this.emit('state', this.state);
    if (reason) this.log.warn('已暂停: ' + reason);
  }

  // 继续
  resume() {
    this.pauseReason = '';
    this.store.set('stop', false);
    if (this.state === 'paused') {
      this.state = 'running';
      this.emit('state', this.state);
    }
  }

  // 停止
  stop() {
    this.abort = true;
    this.state = 'idle';
    this.store.set('stop', true);
    this.submit.uninstall();
    if (this.lock) {
      this.lock.release(this.sessionHost());
      this.lock = null;
    }
    this.disposeOcr();
    this.emit('state', this.state);
  }

  // 取一题答案（含识图补干与重试）
  async fetchFor(index) {
    const question = this.questions[index];
    await this.enrichOcr(question);
    let attempt = 0;
    let payload = { candidates: [] };
    const maxRetry = Math.max(0, this.settings.maxRetry || 0);
    do {
      attempt += 1;
      try {
        payload = await this.hub.fetch(question);
      } catch (e) {
        this.log.warn(`第${index + 1}题取答案失败: ${e.message}`);
        payload = { candidates: [] };
      }
      if (payload.candidates.length) break;
      if (attempt <= maxRetry) {
        this.log.info(`第${index + 1}题无结果，第 ${attempt} 次重试`);
        await jitter([1200, 2600]);
      }
    } while (attempt <= maxRetry);
    return payload;
  }

  // 解析候选
  resolve(question, payload) {
    if (!payload || !payload.candidates.length) return { finish: false, reason: 'no-answer' };
    return AnswerResolver.resolveFor(question.type, payload.candidates, question.options, {
      singleThreshold: this.settings.singleThreshold,
      multipleThreshold: this.settings.multipleThreshold,
      answerSeparators: this.settings.answerSeparators || DEFAULT_SEPARATORS,
      joinBlanks: this.settings.joinBlanks,
      slots: question.slots || [],
      blankCount: question.blankCount || (question.blanks.length || 0)
    });
  }

  // 先解析后投票
  async answerOne(index, payload, offset) {
    const question = this.questions[index];
    if (this.capture && question.captured === undefined) question.captured = this.capture.match(question);
    if (question.type === QuestionType.UNKNOWN && question.captured && question.captured.typeLabel != null && question.captured.typeLabel !== '') {
      const fromApi = this.scanner.parseLabel(question.captured.typeLabel);
      if (fromApi) question.type = fromApi;
    }
    let result = this.resolve(question, payload);
    if (!result.finish && this.hub.sources.filter((source) => {
      try {
        return source.enabled();
      } catch (e) {
        return false;
      }
    }).some((source) => source.tier() === 'fallback')) {
      const extra = await this.hub.fetch(question, true);
      if (extra.candidates.length) {
        payload = { candidates: payload.candidates.concat(extra.candidates) };
        result = this.resolve(question, payload);
      }
    }
    if (!result.finish && this.settings.fillUnmatched) {
      if (question.type !== QuestionType.COMPLETION && question.options.length) {
        const picked = [Math.floor(random(0, question.options.length))];
        result = { finish: false, forced: true, indices: picked, texts: picked.map((i) => AnswerResolver.optionText(question.options[i])), matched: 'random' };
      } else if (question.blanks.length) {
        const texts = this.settings.unmatchedTexts && this.settings.unmatchedTexts.length ? this.settings.unmatchedTexts : ['不会'];
        const picked = question.blanks.map(() => texts[Math.floor(random(0, texts.length))]);
        result = { finish: false, forced: true, texts: picked, matched: 'random-text' };
      }
    }
    const record: any = {
      index: (offset || 0) + index,
      type: question.type,
      stem: question.stem,
      id: question.id,
      candidates: payload.candidates.length,
      node: question.root || null,
      candidateTexts: payload.candidates.slice(0, 4).map((entry) => entry.from + ':' + (entry.answers || []).join(',')),
      finish: !!result.finish,
      forced: !!result.forced,
      from: result.from || '',
      matched: result.matched || result.reason || '',
      texts: result.texts || []
    };
    if (!result.finish && !result.forced) {
      this.log.info(`${question.label()} 未命中（${record.matched}）`);
      this.emit('question', record);
      return record;
    }
    const writeReport = await this.writer.apply(question, result);
    record.written = writeReport.written;
    record.skipped = writeReport.skipped;
    record.failed = writeReport.failed;
    if (result.finish && !result.forced && this.settings.useCache && record.from !== 'cache') {
      const group = payload.candidates.find((c) => c.from === record.from);
      this.store.cachePut({
        key: question.cacheKey,
        stem: question.stem,
        answer: group ? group.answers : [String(result.texts.join(' '))],
        type: question.type,
        from: record.from
      });
    }
    this.log.info(`${question.label()} → ${result.texts.join(' / ') || (result.indices || []).join(',')} [${record.from || '-'}/${record.matched}] 写入${writeReport.written}`);
    this.emit('question', record);
    return record;
  }

  // 汇总进度
  summary() {
    const results = this.results.filter(Boolean);
    const total = this.results.length;
    const answered = results.filter((entry) => entry.finish).length;
    return {
      state: this.state,
      total,
      done: results.length,
      answered,
      rate: total ? (answered / total) * 100 : 0,
      pending: total - results.length
    };
  }

  // 已答过则跳过
  skipDone(question) {
    const marker = (this.spec.question || {}).doneMarker;
    if (!marker || !question.root || !question.root.querySelector) return false;
    try {
      return !!question.root.querySelector(marker);
    } catch (e) {
      return false;
    }
  }

  // 跑一页题目
  async runPage(offset) {
    const lanes = Math.max(1, this.settings.lanes || 2);
    const total = this.questions.length;
    const pending = new Map();
    let produced = 0;
    let consumed = 0;
    const produce = () => {
      while (produced < total && pending.size < lanes) {
        const index = produced++;
        const question = this.questions[index];
        if (this.settings.skipDone && this.skipDone(question)) {
          this.results[offset + index] = { index: offset + index, type: question.type, finish: false, matched: 'already-done', stem: question.stem, candidates: 0 };
          this.emit('question', this.results[offset + index]);
          continue;
        }
        pending.set(index, this.fetchFor(index));
      }
    };
    produce();
    while (consumed < total) {
      if (this.abort) break;
      if (!!this.store.get('stop', false)) this.state = 'paused';
      // 等暂停结束
      while (!this.abort && (this.state === 'paused' || !!this.store.get('stop', false))) {
        if (this.state !== 'paused') this.state = 'running';
        await sleep(500);
      }
      if (this.abort) break;
      if (!(await RiskGate.wait(this.doc || (HAS_DOM ? document : null), { log: this.log, aborted: () => this.abort }))) {
        this.pause('等待人工验证超时');
        break;
      }
      const task = pending.get(consumed);
      let payload = { candidates: [] };
      if (task) {
        const outcome = await withTimeout(task, this.settings.searchTimeoutMs + 4000, '取答案');
        payload = outcome.ok ? outcome.value : { candidates: [] };
        pending.delete(consumed);
      }
      try {
        this.results[offset + consumed] = await this.answerOne(consumed, payload, offset);
      } catch (e) {
        this.log.error(`${this.questions[consumed].label()} 作答异常: ${e.message}`);
        this.results[offset + consumed] = { index: offset + consumed, finish: false, matched: 'exception', candidates: 0 };
      }
      consumed += 1;
      produce();
      this.emit('progress', this.summary());
      await jitter(this.settings.questionDelay);
    }
  }

  // 页面签名
  static signatureOf(questions) {
    return (questions || []).map((question) => question.id || TextSanitizer.key(question.stem).slice(0, 12)).join('|');
  }

  // 翻下一页
  async advancePage() {
    const pager = this.spec.pager;
    if (!pager || !this.doc) return false;
    const before = QuizEngine.signatureOf(this.questions);
    const target = FrameProbe.pick(pager.next, this.doc);
    if (!target) return false;
    this.writer.click(target);
    const deadline = Date.now() + (pager.timeoutMs || 6000);
    let scanned = null;
    for (;;) {
      const page = this.scanner.scan();
      if (page.questions.length && QuizEngine.signatureOf(page.questions) !== before) {
        scanned = page;
        break;
      }
      if (Date.now() > deadline) break;
      await sleep(200);
    }
    if (!scanned) return false;
    this.questions = scanned.questions;
    this.doc = scanned.doc;
    this.win = scanned.win;
    this.results = this.results.concat(new Array(this.questions.length).fill(null));
    const signature = QuizEngine.signatureOf(this.questions);
    if (this.seenPages.has(signature)) {
      this.log.warn('翻页回到已作答过的同一页，停止推进');
      return false;
    }
    this.seenPages.add(signature);
    this.emit('page', this.summary());
    return true;
  }

  // 主循环
  async run() {
    // 先回第一题
    const firstCard = (this.spec.submit || {}).firstCard;
    if (firstCard && this.doc) {
      const first = FrameProbe.queryAll(firstCard, this.doc)[0];
      if (first) this.writer.click(first);
    }
    const maxPages = this.spec.pager ? Math.max(1, this.settings.maxPages || 80) : 1;
    for (let page = 0; page < maxPages; page++) {
      if (this.abort) break;
      this.seenPages.add(QuizEngine.signatureOf(this.questions));
      await this.runPage(this.results.length - this.questions.length);
      if (this.abort || !this.spec.pager) break;
      if (page + 1 >= maxPages) {
        this.log.info(`已达翻页上限 ${maxPages} 页，停止继续推进`);
        break;
      }
      if (!(await this.advancePage())) break;
    }
    if (!this.abort) {
      const actionLabels = {
        none: '按要求未做提交动作',
        manual: '该平台未接提交入口，请自行核对后交卷',
        'save-failed': '保存失败，请手动保存',
        'submit-failed': '交卷失败，请手动交卷',
        blocked: '页面正在要求验证，已暂停提交，请人工完成验证'
      };
      this.state = 'done';
      // 回扫答题卡
      const submitConfig = this.spec.submit || {};
      if (submitConfig.answerCard && this.doc && this.results.filter(Boolean).length) {
        const items = FrameProbe.queryAll(submitConfig.answerCard, this.doc);
        for (let i = 0; i < items.length; i++) {
          if (this.abort) break;
          if (!await RiskGate.wait(this.doc, { log: this.log, timeoutMs: 60000, aborted: () => this.abort })) break;
          this.writer.click(items[i]);
          await sleep(500);
          if (submitConfig.answerCardNext) {
            FrameProbe.queryAll(submitConfig.answerCardNext, this.doc).forEach((node) => this.writer.click(node));
          }
          await sleep(1000);
        }
        if (items.length) this.log.info('答题卡已回扫 ' + items.length + ' 题（逐题触发保存）');
      }
      const summary = this.summary();
      const submitReport = await this.submit.finish(this.win || PAGE_WINDOW, this.results.filter(Boolean), { elapsedMs: Date.now() - (this.startedAt || Date.now()) });
      this.log.info(`完成：${summary.answered}/${summary.total} 题命中，${actionLabels[submitReport.action] || submitReport.action}`);
      this.emit('finish', Object.assign({ submit: submitReport }, summary));
    } else {
      this.state = 'idle';
      this.emit('state', this.state);
    }
    return this.summary();
  }
}
