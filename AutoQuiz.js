// ==UserScript==
// @name         AutoQuiz 大学生不再刷网课 | 106 平台支持（超星/智慧树/职教云/云班课/青书/MOOC/国开/moodle/问卷星/在浙学/优学院)
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  自动刷题、自动刷课，还支持视频倍速、自动水帖、智能取题、静音保活、同站多开等高级功能，让你轻松应对大学网课、问卷、考试、作业等各种场景。
// @author       YisRime
// @match        *://*/*
// @grant        unsafeWindow
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_xmlhttpRequest
// @grant        GM_getResourceText
// @resource     cxfont https://cdn.jsdelivr.net/npm/tiku-static-assets@1.0.0/cx_table.json
// @connect      *
// @run-at       document-start
// @license      AGPLv3
// ==/UserScript==
(() => {
  // Utils.ts
  var VERSION = "1.0.0";
  var NAMESPACE = "autoquiz";
  var HAS_DOM = typeof window !== "undefined" && typeof document !== "undefined";
  var PAGE_WINDOW = HAS_DOM && typeof unsafeWindow !== "undefined" ? unsafeWindow : HAS_DOM ? window : globalThis;
  var MEMORY_FALLBACK = /* @__PURE__ */ new Map();
  var GM = {
    getValue: typeof GM_getValue === "function" ? GM_getValue : (k, d) => MEMORY_FALLBACK.has(k) ? MEMORY_FALLBACK.get(k) : d,
    setValue: typeof GM_setValue === "function" ? GM_setValue : (k, v) => void MEMORY_FALLBACK.set(k, v),
    xmlHttp: typeof GM_xmlhttpRequest === "function" ? GM_xmlhttpRequest : null
  };
  var random = (min, max) => min + Math.random() * (max - min);
  var sleep = (duration) => new Promise((resolve) => setTimeout(resolve, Math.max(0, duration | 0)));
  function toBase64(bytes) {
    if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes || []);
    let binary = "";
    const CHUNK = 32768;
    for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
    if (typeof btoa === "function") return btoa(binary);
    if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
    throw new Error("无 base64 环境");
  }
  var jitter = (range) => {
    const pair = Array.isArray(range) ? range : [range, range];
    return sleep(random(pair[0], pair[1]));
  };
  function withTimeout(promise, budget, label) {
    return Promise.race([
      Promise.resolve(promise).then(
        (value) => ({ ok: true, value }),
        (e) => ({ ok: false, error: e && e.message ? e.message : String(e) })
      ),
      sleep(Math.max(1, budget | 0)).then(() => ({ ok: false, error: label || "timeout" }))
    ]);
  }
  function unique(list) {
    const seen = /* @__PURE__ */ new Set();
    const out = [];
    for (const item of list) {
      const key = String(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  }
  var MD5_SHIFT = [
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    7,
    12,
    17,
    22,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    5,
    9,
    14,
    20,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    4,
    11,
    16,
    23,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21,
    6,
    10,
    15,
    21
  ];
  var MD5_K = (() => {
    const table = [];
    for (let i = 0; i < 64; i++) table.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
    return table;
  })();
  function md5Hex(input) {
    const text = String(input);
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      let code = text.charCodeAt(i);
      if (code < 128) {
        bytes.push(code);
      } else if (code < 2048) {
        bytes.push(192 | code >> 6, 128 | code & 63);
      } else if (code >= 55296 && code < 56320 && i + 1 < text.length && text.charCodeAt(i + 1) >= 56320 && text.charCodeAt(i + 1) < 57344) {
        code = 65536 + ((code & 1023) << 10 | text.charCodeAt(i + 1) & 1023);
        i += 1;
        bytes.push(240 | code >> 18, 128 | code >> 12 & 63, 128 | code >> 6 & 63, 128 | code & 63);
      } else {
        bytes.push(224 | code >> 12, 128 | code >> 6 & 63, 128 | code & 63);
      }
    }
    const bitLength = bytes.length * 8;
    bytes.push(128);
    while (bytes.length % 64 !== 56) bytes.push(0);
    const low = bitLength % 4294967296;
    const high = Math.floor(bitLength / 4294967296);
    bytes.push(low & 255, low >>> 8 & 255, low >>> 16 & 255, low >>> 24 & 255, high & 255, high >>> 8 & 255, high >>> 16 & 255, high >>> 24 & 255);
    let a0 = 1732584193;
    let b0 = 4023233417;
    let c0 = 2562383102;
    let d0 = 271733878;
    const words = new Array(16);
    for (let offset = 0; offset < bytes.length; offset += 64) {
      for (let i = 0; i < 16; i++) {
        const p = offset + i * 4;
        words[i] = bytes[p] | bytes[p + 1] << 8 | bytes[p + 2] << 16 | bytes[p + 3] << 24;
      }
      let A = a0;
      let B = b0;
      let C = c0;
      let D = d0;
      for (let i = 0; i < 64; i++) {
        let F;
        let g;
        if (i < 16) {
          F = B & C | ~B & D;
          g = i;
        } else if (i < 32) {
          F = D & B | ~D & C;
          g = (5 * i + 1) % 16;
        } else if (i < 48) {
          F = B ^ C ^ D;
          g = (3 * i + 5) % 16;
        } else {
          F = C ^ (B | ~D);
          g = 7 * i % 16;
        }
        F = F + A + MD5_K[i] + words[g] | 0;
        A = D;
        D = C;
        C = B;
        const shifted = F << MD5_SHIFT[i] | F >>> 32 - MD5_SHIFT[i];
        B = B + shifted | 0;
      }
      a0 = a0 + A | 0;
      b0 = b0 + B | 0;
      c0 = c0 + C | 0;
      d0 = d0 + D | 0;
    }
    let hex = "";
    for (const word of [a0, b0, c0, d0]) {
      for (let i = 0; i < 4; i++) hex += ((word >>> i * 8 & 255) + 256).toString(16).slice(1);
    }
    return hex;
  }
  function shortHash(input) {
    return md5Hex(String(input || "")).slice(0, 16);
  }
  var Logger = class {
    constructor(options = {}) {
      this.limit = options.limit || 300;
      this.mirror = options.mirror !== false;
      this.records = [];
      this.listeners = /* @__PURE__ */ new Set();
    }
    // 订阅
    subscribe(listener) {
      this.listeners.add(listener);
      return () => this.listeners.delete(listener);
    }
    // 写一条
    push(level, args) {
      const text = Array.from(args).map((a) => {
        if (typeof a === "string") return a;
        try {
          return JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      }).join(" ");
      const record = { at: Date.now(), level, text };
      this.records.push(record);
      if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit);
      if (this.mirror && HAS_DOM && console) {
        const print = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
        if (print) print.call(console, "[" + NAMESPACE + "] " + text);
      }
      for (const listener of this.listeners) {
        try {
          listener(record);
        } catch (e) {
        }
      }
      return record;
    }
    // 变参包装
    log(...args) {
      return this.push("log", args);
    }
    // 信息级
    info(...args) {
      return this.push("info", args);
    }
    // 警告级
    warn(...args) {
      return this.push("warn", args);
    }
    // 错误级
    error(...args) {
      return this.push("error", args);
    }
  };
  var Http = class _Http {
    // 状态码说人话
    static statusHint(status) {
      const hints = {
        403: "403 禁止访问（可能被网关或代理拦截）",
        404: "404 接口不存在（检查端点 URL）",
        415: "415 内容类型不被接受（检查 contentType）",
        429: "429 请求过于频繁（调低并发或稍后再试）",
        444: "444 连接被服务端关闭（疑似封 IP）"
      };
      if (hints[status]) return hints[status];
      if (status >= 500) return status + " 服务端错误";
      return "HTTP " + status;
    }
    // 统一发送口
    static request(details) {
      const asBinary = !!details.responseType;
      return new Promise((resolve, reject) => {
        if (!GM.xmlHttp) {
          reject(new Error("缺少 GM_xmlhttpRequest 权限"));
          return;
        }
        GM.xmlHttp(
          Object.assign({}, details, {
            timeout: details.timeout || (asBinary ? 2e4 : 15e3),
            onload: (response) => {
              if (response.status < 200 || response.status >= 300) {
                reject(new Error(asBinary ? "HTTP " + response.status : _Http.statusHint(response.status)));
                return;
              }
              if (asBinary) {
                resolve(response.response || response.responseText);
                return;
              }
              let data = response.responseJSON !== void 0 ? response.responseJSON : response.response;
              if (data === void 0 || data === null) data = response.responseText;
              if (typeof data === "string") {
                try {
                  data = JSON.parse(data);
                } catch (e) {
                }
              }
              resolve({ data, raw: response.responseText, status: response.status, headers: response.responseHeaders });
            },
            onerror: (response) => reject(new Error(response && response.status ? _Http.statusHint(response.status) : "网络错误")),
            ontimeout: () => reject(new Error("请求超时"))
          })
        );
      });
    }
  };
  var QuestionType = {
    SINGLE: "single",
    MULTIPLE: "multiple",
    JUDGEMENT: "judgement",
    COMPLETION: "completion",
    MATCH: "match",
    UNKNOWN: "unknown"
  };
  var TYPE_LABELS = {
    单选题: QuestionType.SINGLE,
    单选: QuestionType.SINGLE,
    单项选择题: QuestionType.SINGLE,
    单项选择: QuestionType.SINGLE,
    singlechoice: QuestionType.SINGLE,
    多选题: QuestionType.MULTIPLE,
    多选: QuestionType.MULTIPLE,
    多项选择题: QuestionType.MULTIPLE,
    多项选择: QuestionType.MULTIPLE,
    不定项选择: QuestionType.MULTIPLE,
    multichoice: QuestionType.MULTIPLE,
    案例分析: QuestionType.MULTIPLE,
    判断题: QuestionType.JUDGEMENT,
    判断: QuestionType.JUDGEMENT,
    对错: QuestionType.JUDGEMENT,
    对错题: QuestionType.JUDGEMENT,
    判断正误: QuestionType.JUDGEMENT,
    judgement: QuestionType.JUDGEMENT,
    bijudgement: QuestionType.JUDGEMENT,
    填空题: QuestionType.COMPLETION,
    填空: QuestionType.COMPLETION,
    主观填空: QuestionType.COMPLETION,
    简答题: QuestionType.COMPLETION,
    问答题: QuestionType.COMPLETION,
    主观题: QuestionType.COMPLETION,
    名词解释: QuestionType.COMPLETION,
    论述题: QuestionType.COMPLETION,
    计算题: QuestionType.COMPLETION,
    分录题: QuestionType.COMPLETION,
    资料题: QuestionType.COMPLETION,
    阅读理解: QuestionType.MATCH,
    选词填空: QuestionType.MATCH,
    匹配题: QuestionType.MATCH,
    连线题: QuestionType.MATCH,
    连线: QuestionType.MATCH,
    完形填空: QuestionType.MATCH,
    完型填空: QuestionType.MATCH
  };

  // Config.ts
  var DEFAULT_SETTINGS = {
    enabled: true,
    autoStart: false,
    lanes: 2,
    questionDelay: [800, 1800],
    optionDelay: [120, 260],
    searchTimeoutMs: 12e3,
    singleThreshold: 0.65,
    multipleThreshold: 0.6,
    cacheFuzzyThreshold: 0.92,
    cacheMaxEntries: 300,
    answerSeparators: ["===", "###", "#", "---", "|", ";", "；", "\n"],
    joinBlanks: " ",
    maxPages: 80,
    useCache: true,
    usePageAnswer: true,
    useTiku: true,
    skipDone: true,
    fillUnmatched: false,
    unmatchedTexts: ["不会", "不知道", "不清楚", "不懂", "不会写"],
    usePointerChain: false,
    jsonCapture: "off",
    enableFontDecode: true,
    antiPatrolLevel: 0,
    tikuToken: "111",
    tikuEndpoints: null,
    useAi: false,
    aiBaseUrl: "",
    aiApiKey: "",
    aiModel: "",
    aiEndpoints: null,
    aiTimeoutMs: 2e4,
    useOcr: false,
    ocrLangs: "chi_sim+eng",
    ocrLangPath: "",
    ocrCdn: null,
    ocrImageSelector: "",
    ocrMinImageEdge: 64,
    ocrMinStemChars: 6,
    ocrMaxEdge: 1600,
    ocrLoadTimeoutMs: 2e4,
    ocrFetchTimeoutMs: 2e4,
    ocrTimeoutMs: 45e3,
    maxRetry: 2,
    submitMode: "save",
    submitRateGate: 80,
    submitMinSecondsPerQuestion: 4,
    useVideoRate: false,
    videoRate: 1.5,
    videoKeepPlaying: false,
    useForum: false,
    forumTexts: "",
    useVueProbe: false,
    useResponseTamper: false,
    useKeepAlive: false,
    useSingleTab: true,
    showPanel: true
  };
  var Store = class {
    constructor(namespace) {
      this.prefix = (namespace || NAMESPACE) + ".";
      this.memo = /* @__PURE__ */ new Map();
    }
    // 读
    get(name, fallback) {
      const isHeavy = name === "cache" || name === "ocr";
      const raw = isHeavy && this.memo.has(name) ? this.memo.get(name) : GM.getValue(this.prefix + name, void 0);
      if (isHeavy) this.memo.set(name, raw === void 0 ? "" : raw);
      if (raw === void 0 || raw === null || raw === "") return fallback;
      if (fallback !== null && typeof fallback !== typeof raw && typeof fallback === "object" && fallback !== null) {
        try {
          return Object.assign(Array.isArray(fallback) ? [] : {}, fallback, typeof raw === "string" ? JSON.parse(raw) : raw);
        } catch (e) {
          return fallback;
        }
      }
      return raw;
    }
    // 写
    set(name, value) {
      GM.setValue(this.prefix + name, value);
      if (name === "cache" || name === "ocr") this.memo.set(name, value);
      return value;
    }
    // 合并配置
    settings(overrides) {
      const base = Object.assign({}, DEFAULT_SETTINGS, overrides || {});
      const saved = this.get("settings", {});
      const merged = Object.assign({}, base);
      for (const name of Object.keys(base)) {
        if (saved && Object.prototype.hasOwnProperty.call(saved, name) && saved[name] !== void 0) merged[name] = saved[name];
      }
      return merged;
    }
    // 答案缓存表
    cacheList() {
      const list = this.get("cache", []);
      return Array.isArray(list) ? list : [];
    }
    // 写缓存
    cachePut(entry) {
      if (!entry || !entry.key) return false;
      const list = this.cacheList();
      const at = list.findIndex((item) => item && item.key === entry.key);
      if (at >= 0) list.splice(at, 1);
      list.unshift(Object.assign({ at: Date.now() }, entry));
      const limit = this.settings().cacheMaxEntries || 300;
      if (list.length > limit) list.length = limit;
      this.set("cache", list);
      return true;
    }
    // 识图缓存表
    ocrGet(url) {
      const map = this.get("ocr", {});
      const hit = map[shortHash(url)];
      return typeof hit === "string" ? hit : "";
    }
    // 写识图
    ocrPut(url, text) {
      if (!url || !text) return false;
      const map = Object.assign({}, this.get("ocr", {}));
      map[shortHash(url)] = String(text);
      const names = Object.keys(map);
      if (names.length > 200) names.slice(200).forEach((name) => delete map[name]);
      this.set("ocr", map);
      return true;
    }
  };

  // Probe.ts
  var BLANK_SPACE_IMAGE = /blankspace\d*\.gif/i;
  var OPTION_ATTRIBUTES = ["aria-label", "data-label", "data-content", "data-value", "title", "alt"];
  var TextSanitizer = class _TextSanitizer {
    static NOT_TEXT = /[^\u4e00-\u9fa5a-z0-9]/g;
    static NORMALIZED = /* @__PURE__ */ new Map();
    static FOLD = /* @__PURE__ */ new Map([
      ["　", " "],
      ["“", '"'],
      ["”", '"'],
      ["〝", '"'],
      ["‘", "'"],
      ["’", "'"],
      ["〔", "["],
      ["〕", "]"],
      ["。", "."],
      ["、", ","]
    ]);
    // 全角转半角（单趟）
    static fold(text) {
      return String(text == null ? "" : text).replace(/[\uff01-\uff5e\u3000“”〝‘’〔〕。、]/g, (ch) => {
        const code = ch.charCodeAt(0);
        return code >= 65281 ? String.fromCharCode(code - 65248) : _TextSanitizer.FOLD.get(ch);
      });
    }
    // 去空白
    static collapse(text) {
      return String(text == null ? "" : text).replace(/\s+/g, "");
    }
    // 归一化带缓存（fold 的符号映射会被 NOT_TEXT 剥掉，只留全角转半角）
    static normalize(text) {
      const raw = String(text == null ? "" : text);
      const cache = _TextSanitizer.NORMALIZED;
      if (cache.has(raw)) return cache.get(raw);
      const out = raw.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248)).replace(/\s+/g, "").toLowerCase().replace(_TextSanitizer.NOT_TEXT, "");
      if (cache.size > 4e3) cache.clear();
      cache.set(raw, out);
      return out;
    }
    // 缓存键截断
    static key(text) {
      const normalized = _TextSanitizer.normalize(text);
      return normalized.length > 240 ? normalized.slice(0, 120) + "#" + normalized.slice(-100) : normalized;
    }
    // 剥选项字母
    static stripPrefix(text) {
      let out = String(text == null ? "" : text).trim();
      const before = out;
      out = out.replace(/^\s*(?:[（(]\s*)?[A-Ha-h]\s*(?:[)）]\s*)?[.．、:：)）]\s*/, "");
      if (out === before) out = out.replace(/^\s*[A-Ha-h]\s*(?=['"“‘]?(?:[\u4e00-\u9fa5]))/, "");
      return out.trim();
    }
    // 节点转纯文本（去标签、还原实体、图片占位）
    static nodeText(element) {
      if (!element) return "";
      if (element.textContent != null && !element.querySelectorAll) return String(element.textContent);
      const clone = element.cloneNode(true);
      clone.querySelectorAll("img").forEach((img) => {
        const source = img.src || img.getAttribute("data-src") || "";
        if (BLANK_SPACE_IMAGE.test(source)) {
          img.replaceWith(document.createTextNode(" "));
          return;
        }
        img.replaceWith(document.createTextNode(' <img src="' + source + '"> '));
      });
      clone.querySelectorAll("iframe").forEach((iframe) => {
        const source = iframe.getAttribute("src") || iframe.getAttribute("_src") || iframe.getAttribute("objectid") || "";
        iframe.replaceWith(document.createTextNode(' <iframe src="' + source + '"> '));
      });
      return String(String(clone.innerHTML || clone.textContent || "").replace(/<(?:br|p|div|li|tr|hr)[^>]*>/gi, " ").replace(/<[^>]*>/g, "")).replace(/&nbsp;/gi, " ").replace(/&quot;/gi, '"').replace(/&#0?39;|&apos;|&#8217;/gi, "'").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&amp;/gi, "&").replace(/&#(\d+);/g, (_, code) => {
        try {
          return String.fromCodePoint(Number(code));
        } catch (e) {
          return "";
        }
      }).replace(/\s+/g, " ").trim();
    }
    // 选项属性兜底
    static option(element) {
      const text = _TextSanitizer.stripPrefix(_TextSanitizer.nodeText(element));
      if (text) return text;
      return _TextSanitizer.pickAttribute(element, OPTION_ATTRIBUTES);
    }
    // 按序取非空
    static pickAttribute(element, names) {
      if (!element || !element.getAttribute) return "";
      for (const name of names || OPTION_ATTRIBUTES) {
        const value = element.getAttribute(name);
        if (value && String(value).trim()) return String(value).trim();
      }
      return "";
    }
  };
  var FrameProbe = class _FrameProbe {
    static PARSED = /* @__PURE__ */ new Map();
    // 同源框广度遍历
    static documents(root, maxDepth) {
      const limit = maxDepth == null ? 3 : maxDepth;
      const out = [];
      if (!HAS_DOM && !root) return out;
      const ownDocument = root && root.document ? root.document : typeof document !== "undefined" ? document : null;
      const ownWindow = root && root.document ? root : typeof window !== "undefined" ? window : null;
      if (!ownDocument) return out;
      out.push({ win: ownWindow, doc: ownDocument, depth: 0 });
      const queue = [{ win: ownWindow, doc: ownDocument, depth: 0 }];
      while (queue.length) {
        const current = queue.shift();
        if (current.depth >= limit) continue;
        let frames = [];
        try {
          frames = Array.from(current.doc.querySelectorAll("iframe, frame"));
        } catch (e) {
          frames = [];
        }
        for (const frame of frames) {
          let childWindow = null;
          try {
            childWindow = frame.contentWindow;
          } catch (e) {
            childWindow = null;
          }
          let accessible = false;
          try {
            accessible = !!(childWindow && childWindow.document && childWindow.document.documentElement);
          } catch (e) {
          }
          if (!accessible) continue;
          if (out.some((entry) => entry.win === childWindow)) continue;
          out.push({ win: childWindow, doc: childWindow.document, depth: current.depth + 1 });
          queue.push({ win: childWindow, doc: childWindow.document, depth: current.depth + 1 });
        }
      }
      return out;
    }
    // jQuery 伪类
    static splitFilter(selector) {
      const match = /:(first|last|eq\((-?\d+)\))$/i.exec(selector);
      if (!match) return { base: selector, at: null };
      const tail = match[1].toLowerCase();
      if (tail === "first") return { base: selector.slice(0, match.index), at: 0 };
      if (tail === "last") return { base: selector.slice(0, match.index), at: -1 };
      return { base: selector.slice(0, match.index), at: Number(match[2]) };
    }
    // 选择器两种形态
    static candidates(selector) {
      if (!selector) return [];
      if (Array.isArray(selector)) return selector.filter(Boolean);
      return String(selector).split(",").map((s) => s.trim()).filter(Boolean);
    }
    // 选择器解析缓存
    static parsed(selector) {
      const cache = _FrameProbe.PARSED;
      if (cache.has(selector)) return cache.get(selector);
      const list = _FrameProbe.candidates(selector).map((single) => _FrameProbe.splitFilter(single));
      if (cache.size > 400) cache.clear();
      cache.set(selector, list);
      return list;
    }
    // 查全部
    static queryAll(selector, scope) {
      if (!scope || !scope.querySelectorAll) return [];
      for (const entry of _FrameProbe.parsed(selector)) {
        let found = [];
        try {
          found = Array.from(scope.querySelectorAll(entry.base));
        } catch (e) {
          found = [];
        }
        if (!found.length) continue;
        if (entry.at !== null) {
          const picked = entry.at < 0 ? found[found.length + entry.at] : found[entry.at];
          found = picked ? [picked] : [];
        }
        if (found.length) return found;
      }
      return [];
    }
    // 串与对象两种
    static scoped(root, target) {
      if (!target || !root) return null;
      if (typeof target === "string") return _FrameProbe.queryAll(target, root)[0] || null;
      let node = root;
      for (let i = target.up || 0; i > 0 && node; i -= 1) node = node.parentElement;
      if (!node) return null;
      const at = target.at || (target.within ? "closest" : "parent");
      let scope = null;
      if (at === "self") scope = node;
      else if (at === "page") scope = node.ownerDocument || (HAS_DOM ? document : null);
      else if (at === "closest") {
        if (!target.within) scope = node;
        else {
          while (node) {
            if (node.matches && node.matches(target.within)) {
              scope = node;
              break;
            }
            node = node.parentElement;
          }
        }
      } else {
        const anchor = target.within && node.closest ? node.closest(target.within) : node;
        if (anchor) {
          if (at === "prev") {
            let sibling = anchor.previousElementSibling;
            while (sibling && target.match && !(sibling.matches && sibling.matches(target.match))) {
              sibling = sibling.previousElementSibling;
            }
            scope = sibling || null;
          } else scope = anchor.parentElement;
        }
      }
      if (!scope) return null;
      return target.find ? _FrameProbe.queryAll(target.find, scope)[0] || null : scope;
    }
    // 取作用域文本
    static scopedText(root, target) {
      const node = _FrameProbe.scoped(root, target);
      return node ? TextSanitizer.nodeText(node) : "";
    }
    // 只认可见节点
    static visible(node) {
      if (!node) return false;
      const style = node.getAttribute ? node.getAttribute("style") || "" : "";
      if (/display\s*:\s*none/i.test(style)) return false;
      if (node.classList && node.classList.contains && node.classList.contains("hide")) return false;
      return true;
    }
    // 按文案再过滤
    static byText(selector, texts, scope) {
      const nodes = _FrameProbe.queryAll(selector, scope);
      if (!texts || !texts.length) return nodes;
      return nodes.filter((node) => {
        const text = TextSanitizer.collapse(node.textContent || "");
        return texts.some((needle) => text.includes(TextSanitizer.collapse(needle)));
      });
    }
    // 定位统一入口
    static pick(target, scope) {
      if (!target) return null;
      if (typeof target === "string") return _FrameProbe.queryAll(target, scope)[0] || null;
      const matched = _FrameProbe.byText(target.selector, target.text, scope);
      return matched.length ? matched[0] : null;
    }
  };

  // Spec.ts
  var DEFAULT_ENDPOINTS = [
    {
      name: "icodef-超星",
      url: "https://cx.icodef.com/wyn-nb?v=4",
      method: "post",
      contentType: "form",
      headers: { Authorization: "${token}" },
      data: { question: "${title}", type: "${typeCode}", id: "${id}" },
      resultPath: "data",
      enabled: true
    },
    {
      name: "TikuAdapter",
      url: "http://127.0.0.1:8085/adapter-service/search",
      method: "post",
      contentType: "json",
      headers: {},
      data: {
        question: "${title}",
        options: "${optionTexts}",
        type: "${adapterType}"
      },
      resultPath: "answer.allAnswer",
      blankJoin: "#",
      enabled: false
    }
  ];
  var ZHS_BASE = {
    hosts: ["zhihuishu.com"],
    write: { target: "label, input, .node_detail", selectedClass: ["onChecked", "is-checked", "checked", "active"] },
    poison: [{ marker: "richvideo/initdatawithviewer", with: "[]" }]
  };
  var ICVE_ZJY2_FIELDS = {
    qid: "id",
    options: { from: "dataJson", each: "Content", json: true },
    answer: { from: "dataJson", each: "Content", json: true, where: ["IsAnswer", true] }
  };
  var ICVE_BASE = {
    hosts: ["icve.com.cn", "courshare.cn", "webtrn.cn"],
    write: { target: "label, input, div", selectedClass: ["checkbox_on", "is-checked", "checked"] },
    typeCodes: { A1A2题: QuestionType.MULTIPLE, 单选题: QuestionType.SINGLE, 多选题: QuestionType.MULTIPLE, 判断题: QuestionType.JUDGEMENT, 填空题: QuestionType.COMPLETION, 主观题: QuestionType.COMPLETION, 组合题: QuestionType.COMPLETION }
  };
  var CHAOXING_BASE = {
    hosts: [
      "chaoxing.com",
      "xueyinonline.com",
      "hnsyu.net",
      "qutjxjy.cn",
      "ynny.cn",
      "hnvist.cn",
      "fjlecb.cn",
      "gdhkmooc.com",
      "cugbonline.cn",
      "zjelib.cn",
      "cqrspx.cn",
      "neauce.com",
      "zhihui-yun.com",
      "cqie.cn",
      "ccqmxx.com",
      "jxgmxy.com",
      "jnzyjsxy.cn",
      "sslibrary.com",
      "xuexi365.com"
    ],
    iframe: { depth: 3 },
    typeCodes: {
      0: QuestionType.SINGLE,
      1: QuestionType.MULTIPLE,
      2: QuestionType.COMPLETION,
      3: QuestionType.JUDGEMENT,
      4: QuestionType.COMPLETION,
      5: QuestionType.COMPLETION,
      6: QuestionType.COMPLETION,
      7: QuestionType.COMPLETION,
      8: QuestionType.COMPLETION,
      9: QuestionType.COMPLETION,
      10: QuestionType.COMPLETION,
      14: QuestionType.MATCH,
      15: QuestionType.MATCH,
      11: QuestionType.MATCH
    },
    noise: {
      stemBlock: ["章节测验", "创建空卷", "从题库组卷", "已完卷", "未开始", "展开本卡片", "收起本卡片"]
    },
    font: {
      cssClass: "font-cxsecret",
      resource: "cxfont",
      url: "https://cdn.jsdelivr.net/npm/tiku-static-assets@1.0.0/cx_table.json"
    },
    write: {
      target: "a, label, input[type], .after",
      checked: ["input:checked"],
      judgementRightIcon: ".ri",
      blankSaveButton: '[onclick*="saveQuestion"]',
      matchDisplay: ".chosen-single span"
    }
  };
  var SPECS = [
    Object.assign({}, CHAOXING_BASE, {
      key: "chaoxing-review",
      name: "超星作业查看 / 已批阅测验",
      presence: false,
      exclude: [/dowork/i, /doHomeWorkNew/i, /reVersionTestStartNew/i],
      match: [/mooc2\/work\/view/i, /\/work\/view/i, /selectWorkQuestionYiPiYue/i, /anys\/exam\/testView/i],
      question: {
        root: ".questionLi, .TiMu.singleQuesId, .TiMu",
        stem: "h3.mark_name .qtContent, .Zy_TItle .clearfix, h3",
        typeText: "h3.mark_name .colorShallow, .Zy_ulTop .qtInfo",
        options: "ul.mark_letter li, ul li .after, ul li label:not(.before)",
        answer: ".rightAnswerContent, .correctAnswer .answerCon, .Py_answer span, .correctAnswerBx .correctAnswer.marTop16 p",
        idFrom: "[data], .singleQuesId"
      },
      submit: { globals: [], saveGlobals: [] }
    }),
    Object.assign({}, CHAOXING_BASE, {
      key: "chaoxing-work",
      name: "超星作业 / 考试",
      exclude: [/work\/phone\//i],
      match: [/mooc2\/work\/dowork/i, /work\/doHomeWorkNew/i, /mooc2\/exam\/preview/i, /exam-ans\/exam\/test\/reVersionTestStartNew/i, /mooc-ans\/exam\/test\/reVersionTestStartNew/i, /mooc2-ans\/work\//i],
      question: {
        root: ".questionLi",
        stem: "h3 .color4, h3 .mark_name, h3, .stem_h3 .stem-content, .mark_name, .colorShallow",
        options: ".stem_answer .answerBg .answer_p, .answerContent, .textDIV, .eidtDiv, ul li .after",
        typeInput: 'input[id^="answertype"], input[name^="type"]',
        idFrom: 'input[id^="answertype"], input[name^="answer"], li[id]',
        idPattern: "(\\d+)",
        blanks: ".filling_answer textarea, .editing textarea, .eidtDiv textarea",
        matchSlots: ".line_answer_ct .selectBox, .reading_answer, .filling_answer",
        matchItems: "li[data], span.saveSingleSelect[data]",
        doneMarker: '[class*="check_answer"]'
      },
      pager: { next: '[onclick="getTheNextQuestion(1)"]', timeoutMs: 6e3 },
      submit: {
        globals: ["submitCheckTimes", "escapeBlank", "submitAction"],
        saveGlobals: ["noSubmit"],
        button: '#submit, .submitBtn, .btnBlue, a[onclick*="submit"]',
        saveButton: '.saveBtn, #save, a[onclick*="save"]'
      }
    }),
    Object.assign({}, CHAOXING_BASE, {
      key: "chaoxing-chapter",
      name: "超星章节测验",
      match: [/mycourse\/studentstudy/i, /anys\/exam\/test/i, /exam\/test\/reVersionTest/i],
      question: {
        root: ".TiMu",
        stem: ".Zy_TItle .clearfix, .qtContent .newZy_TItle, .Zy_TItle, .firstUlList, .secondUlList",
        options: "ul li .after, ul li label:not(.before), ul li textarea",
        optionItem: "ul li",
        typeInput: 'input[id^="answertype"]',
        idFrom: 'input[id^="answertype"]',
        idPattern: "(\\d+)",
        blanks: ".ulChild textarea, ul li textarea",
        matchSlots: ".thirdUlList .dept_select",
        matchItems: "option",
        matchKey: "value",
        doneMarker: ".testTit_status_complete"
      },
      submit: {
        globals: ["btnBlueSubmit", "submitCheckTimes"],
        saveGlobals: ["noSubmit"],
        button: "#btnBlueSubmit, .testBtn .btnBlue, .nextChapter",
        confirm: "#workpop"
      }
    }),
    Object.assign({}, CHAOXING_BASE, {
      key: "chaoxing-phone",
      name: "超星手机版作业",
      match: [/work\/phone\/doHomeWork/i, /work\/phone\/selectWorkQuestion/i],
      question: {
        root: ".Py-mian1",
        stem: ".Py-m1-title, .m1-title",
        options: ".answerList > li",
        optionItem: ".answerList > li",
        typeInput: 'input[id^="answertype"]',
        idFrom: "li[id], em[id]",
        idPattern: "(\\d+)",
        blanks: ".filling_answer textarea, textarea"
      },
      submit: {
        globals: ["submitAction", "escapeBlank", "submitCheckTimes"],
        saveGlobals: ["noSubmit"],
        button: "#submit, .submit"
      }
    })
  ];
  var B1_SPECS = [
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-exam",
      name: "智慧树作业 / 考试",
      exclude: [/checkHomework/i],
      match: [/stuExamWeb\.html/i, /\/webExamList\/dohomework\//i, /\/webExamList\/doexamination\//i],
      capture: [{
        source: "xhr",
        marker: "workExamParts",
        shape: ["rt.examBase.workExamParts"],
        list: "rt.examBase.workExamParts[].questionDtos[]",
        children: "questionChildrens",
        fields: { qid: "id", question: "name", typeLabel: "questionType.name", options: "questionOptions[].content", optionsId: "questionOptions[].id" }
      }],
      question: {
        root: ".examPaper_subject",
        stem: ".subject_describe div, .smallStem_describe p",
        options: ".subject_node .nodeLab .node_detail",
        typeText: ".subject_type span",
        blanks: ".subject_node textarea, .subject_node .edui-body-container"
      },
      submit: {
        answerCard: ".answerCard_list ul li",
        answerCardNext: "div.examPaper_box > div.switch-btn-box > button:nth-child(2)"
      }
    }),
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-credit-homework",
      name: "智慧树学分课作业",
      match: [/atHomeworkExam\/stu\/homeworkQ\/exerciseList/i, /atHomeworkExam\/stu\/examQ\/examexercise/i],
      question: {
        root: ".questionBox",
        stem: ".questionContent",
        options: ".optionUl label .el-radio__label, .optionUl .el-checkbox__label",
        clickables: ".optionUl label",
        typeText: ".questionTit",
        blanks: ".questionBox textarea"
      },
      pager: { next: { selector: ".Topicswitchingbtn", text: ["下一题"] }, timeoutMs: 5e3 }
    }),
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-exam-h5",
      name: "智慧树学分课考试",
      match: [/studentexambaseh5\.zhihuishu\.com/i],
      question: {
        root: ".ques-detail",
        stem: ".questionName .centent-pre",
        options: ".radio-view li .preStyle, .checkbox-views label .preStyle",
        clickables: ".radio-view li, .checkbox-views label",
        typeText: ".letterSortNum",
        blanks: ".ques-detail textarea"
      },
      pager: { next: { selector: ".next-topic", text: ["下一题"] }, timeoutMs: 5e3 }
    }),
    Object.assign({}, ICVE_BASE, {
      key: "icve-exam",
      name: "职教云考试",
      match: [/\/exam\/examflow_index\.action/i],
      question: {
        root: ".q_content",
        stem: ".divQuestionTitle",
        options: ".questionOptions .q_option",
        clickables: ".questionOptions .q_option div",
        typeInput: "[answertype]",
        typeAttribute: "answertype",
        blanks: "div[id^=_baidu_editor_], textarea"
      },
      pager: { next: ".paging_next", timeoutMs: 6e3 },
      submit: {
        firstCard: ".sheet_nums [id*='sheetSeq']"
      }
    }),
    Object.assign({}, ICVE_BASE, {
      key: "icve-directory",
      name: "职教云章节测验",
      match: [/\/study\/directory\/dir_course\.html/i],
      question: {
        root: ".panel_item .panel_item",
        stem: ".preview_cm .preview_stem",
        options: ".preview_cm ul li span:last-child",
        clickables: ".preview_cm ul li input",
        typeText: ".panel_title",
        blanks: ".preview_cm textarea"
      }
    }),
    Object.assign({}, ICVE_BASE, {
      key: "icve-mooc",
      name: "职教云 MOOC / 安徽继续教育 / 上海开大",
      hosts: ["icve.com.cn", "jxjyxy.com", "shanghai-open.com", "ouchoa.cn"],
      match: [/\/study\/homework\/do\.html/i, /\/study\/workExam\/testWork\/preview\.html/i, /\/study\/onlineExam\/preview\.html/i, /\/study\/workExam\/homeWork\/preview\.html/i, /\/study\/workExam\/onlineExam\/preview\.html/i, /\/study\/html\/content\/(studying|tkOnline|sxsk|bkExam)\//i, /\/study\/assignment\/(preview|continuation)\.aspx/i],
      question: {
        root: ".e-q, .e-q-r",
        stem: ".e-q-q .ErichText",
        options: ".e-a-g li",
        typeText: ".quiz-type, .topic_type",
        blanks: ".e-q-r textarea"
      }
    }),
    Object.assign({}, ICVE_BASE, {
      key: "icve-library",
      name: "智慧职教 / 资源库 作业 考试",
      match: [/icve-study\/(coursePreview\/)?(jobTest|keepTest|test)\b/i, /\/study\/spoc(keep|job)?Test\b/i, /\/study\/courseteaching\/test\/homeWork/i, /zjy2\.icve\.com\.cn/i, /\/study\/(works\/works|exam\/exam)\.html/i],
      capture: [
        { source: "jsonparse", shape: ["paper"], list: "paper.PaperQuestions[]", fields: { id: "Id", question: "ContentText", options: "Selects", answer: "Answers", typeLabel: "ACHType.QuestionTypeName" } },
        { source: "jsonparse", shape: ["array"], list: "array[].Questions[]", fields: { id: "Id", question: "ContentText", options: "Selects", answer: "Answers", typeLabel: "ACHType.QuestionTypeName" } },
        { source: "jsonparse", shape: ["name", "questions", "totalScore"], list: "questions", fields: ICVE_ZJY2_FIELDS },
        { source: "jsonparse", shape: ["data.questions"], list: "data.questions", fields: ICVE_ZJY2_FIELDS }
      ],
      question: {
        root: ".subjectDet, .questions",
        stem: "h5, h2, h3, h4, h6, .titleTest span:not(.xvhao), .titleT .htmlP, .preview_stem, .questionContent",
        options: ".optionList .el-radio__label, .optionList .el-checkbox__label, .optionList label, li .preview_cont",
        clickables: ".optionList input, li input",
        typeText: ".title, .titleTwo, .titleTest .xvhao, .quiz-type",
        typeInput: "input[type=hidden]",
        blanks: ".fillblank_answer textarea, textarea"
      }
    }),
    {
      key: "yunbanke",
      name: "云班课",
      hosts: ["mosoteach.cn"],
      match: [[/\/web\/index\.php/i, /[?&]m=reply/]],
      write: { target: ".el-radio__input, .el-checkbox__input, label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".topic-item",
        stem: ".t-con .t-subject",
        options: ".t-option label .option-content, .option-content",
        clickables: ".el-radio__input, .el-checkbox__input",
        typeText: ".t-info .t-type",
        blanks: ".topic-item textarea, .topic-item input[type=text]"
      }
    },
    {
      key: "qingshuxuetang",
      name: "青书学堂 考试 / 测验",
      hosts: ["qingshuxuetang.com"],
      match: [/\/Student\/MakeupExamPaper/i, /Student\/ExamPaper/i, /\/Student\/ExercisePaper/i, /\/Student\/SimulationExercise/i, /quiz\.qingshuxuetang\.com/i],
      write: { target: "label, input" },
      question: {
        root: ".question-detail-container",
        stem: ".question-detail-description .detail-description-content, .question-detail-description span",
        options: ".question-detail-options label .option-description",
        clickables: ".question-detail-options label input, .question-detail-options label",
        typeText: ".question-detail-type-desc, .question-detail-type",
        blanks: "div[id^=cke_editor], .question-detail-solution-textarea"
      }
    },
    {
      key: "ouchn-exam",
      name: "国家开放大学 考试",
      hosts: ["ouchn.cn", "hblll.com"],
      match: [[/lms\.ouchn\.cn|lms\.cjzx\.hblll\.com/i, /\/exam\//i]],
      write: { target: "label, .left, input", selectedClass: ["ng-not-empty", "is-checked"] },
      question: {
        root: ".single_selection, .multiple_selection, .true_or_false, .short_answer",
        stem: ".summary-title .subject-description",
        options: ".subject-options li .option-content",
        clickables: ".subject-options label .left, .subject-options label",
        typeText: ".summary-sub-title span",
        blanks: ".short_answer textarea, .short_answer input"
      },
      capture: [{
        source: "jsonparse",
        marker: "subjects_data",
        shape: ["subjects_data.subjects"],
        list: "subjects_data.subjects",
        fields: {
          id: "id",
          question: "description",
          typeLabel: "type",
          options: { from: "options", json: true, each: "content" },
          answer: { from: "options", json: true, each: "content", where: ["is_answer", true] }
        }
      }]
    },
    {
      key: "renwei-mooc",
      name: "人卫慕课测验",
      match: [/\/memberFront\/paper\.zhtml/i],
      write: { target: "label, input" },
      question: {
        root: ".quesinfo",
        stem: "dl dt",
        options: "dd label",
        clickables: "dd input",
        blanks: ".quesinfo textarea"
      }
    }
  ];
  var B2_SPECS = [
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-hike-work",
      name: "智慧树 AI 课程作业",
      hosts: ["zhihuishu.com", "polymas.com"],
      match: [/\/stu-hike\/stuHomeworkDo/i],
      write: {
        target: ".el-radio__input:not(.is-checked), .el-checkbox__input:not(.is-checked), label, input",
        selectedClass: ["onChecked", "is-checked", "checked", "active"]
      },
      question: { root: ".q_main", stem: ".question-topic", options: "label", typeText: ".question_score" },
      pager: { next: ".check_btn:not(.is-disabled)", timeoutMs: 6e3 }
    }),
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-hike-homework",
      name: "智慧树 AI 课程题目作业",
      hosts: ["zhihuishu.com", "polymas.com"],
      match: [/\/stu\/answer-homework/i, /\/stu-exam\/answer-exam/i],
      question: {
        root: ".question-item",
        stem: ".qeustion-content, .combination-content",
        options: ".option-item, .vditor-content",
        typeText: ".title-box, .combination-title",
        blanks: ".vditor-reset"
      }
    }),
    Object.assign({}, ZHS_BASE, {
      key: "zhihuishu-smart-exam",
      name: "智慧树新形态考试",
      match: [/examloop\.zhihuishu\.com\/exam/i],
      write: { checked: ["div.bg-mainBg"], selectedClass: ["onChecked", "is-checked"] },
      question: {
        root: ".question-area-content",
        stem: "div.flex-1 .mb-\\[32px\\] .text-mainText.font-medium",
        options: "label.user-select, div.real-editor",
        typeText: "div.flex.items-center.mb-\\[16px\\]",
        blanks: "div.real-editor, input"
      },
      pager: { next: { selector: "button", text: ["下一题"] }, timeoutMs: 6e3 }
    }),
    Object.assign({}, ICVE_BASE, {
      key: "icve-ai-work",
      name: "智慧职教 AI 作业",
      match: [/ai\.icve\.com\.cn\/preview-exam/i],
      write: { target: "label, input", checked: [".ivu-radio-checked"], selectedClass: ["ivu-radio-checked", "checked"] },
      question: {
        root: ".content-item, .paper-content .questions",
        stem: ".questions-content [class*=title-content], .single-title-content, .multiple-title-content, .judge-title",
        options: "label[class*=group-item], .ivu-input-wrapper input, .single-item-xxnr, .multiple-item-xxnr, .judge-item-xxnr",
        typeText: ".single-title-num, .multiple-title-num, .judge-title-num",
        blanks: ".ivu-input-wrapper input"
      },
      pager: { next: "div.center_btn > button:nth-child(2), .ivu-btn", timeoutMs: 6e3 }
    }),
    {
      key: "icourse-work",
      name: "中国大学MOOC 作业 / 考试",
      hosts: ["icourse163.org"],
      match: [/icourse163\.org\/learn/i, /icourse163\.org\/spoc\/learn/i, /\/mooc\/main\/newExam/i],
      exclude: [/learn\/quizscore/i, /examObjectScore/i],
      write: { target: "input, .f-richEditorText, .richEditor-text", judgementRightIcon: ".u-icon-correct" },
      question: {
        root: ".u-questionItem, [class*=questionBody]",
        stem: ".j-title .j-richTxt, [class*=questionInfo]",
        options: ".choices li, .inputArea, [class*=index-module__optionBody]",
        clickables: "input",
        blanks: ".inputArea textarea"
      },
      submit: { button: ".j-submit" }
    },
    {
      key: "jijiaool-exam",
      name: "继教网 / 教师教育 在线考试",
      hosts: ["jijiaool.com", "courshare.cn", "jsnu.edu.cn", "nwnu.jijiaool.com", "cj-edu.com", "hnscen.cn", "ycjy.lut.edu.cn", "beihua.peishenjy.com", "cj1026-kfkc.webtrn.cn"],
      match: [/\/learnspace\/course\/test/i, /\/Student\/ExamManage\/CourseOnlineExamination/i, [/cj-edu\.com|hnscen\.cn|jijiaool\.com|lut\.edu\.cn|peishenjy\.com|webtrn\.cn/i, /\/Exam(Info|ination)/i]],
      write: { target: "label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".test_item",
        stem: ".test_item_tit",
        options: ".test_item_theme label .zdh_op_con, .test_item_theme label",
        clickables: ".test_item_theme label input, label input",
        typeText: ".test_item_type"
      }
    },
    {
      key: "jsou-exam",
      name: "江苏开放 / 河开 学习平台作业",
      hosts: ["jsou.cn", "open.ha.cn"],
      match: [/\/jxpt-web\/student\/(new)?Homework\/showHomeworkByStatus/i],
      write: { target: ".numberCover, label, input", selectedClass: ["answer-title"] },
      question: {
        root: ".insert",
        stem: ".window-title",
        options: ".questionId-option .option-title div, ul li div:last-child",
        clickables: ".questionId-option .option-title .numberCover, ul li .numberCover",
        typeInput: ".question-type",
        typeCodes: { 1: QuestionType.SINGLE, 2: QuestionType.MULTIPLE, 7: QuestionType.JUDGEMENT }
      }
    },
    {
      key: "wencai-exam",
      name: "柠檬文才 作业 / 考试",
      hosts: ["wencaischool.net", "zk211.com", "wuxuejiaoyu.cn"],
      match: [/\/separation\/exam\//i, /\/(hb|xbsf|open|jx|shandong)learning\/exam\//i, /\/exam\/index\.html#\/exam\?studentId/i],
      write: { target: "label, input" },
      question: {
        root: ".paperWrapper .tmList",
        stem: ".tmTitleTxt",
        options: ".ansbox .opCont",
        clickables: ".ansbox input"
      }
    },
    {
      key: "zjooc-exam",
      name: "在浙学 / 浙江开放大学",
      hosts: ["zjooc.cn"],
      match: [[/zjooc\.cn/i, /\/(homework|test|exam|singleQuestion\/do)\//i]],
      write: { target: "label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".questiono-item, .question_content",
        stem: ".question_title, h6 .processing_img",
        options: ".questiono-main label .el-radio__label, .el-checkbox__label, .radio_content div",
        clickables: ".questiono-main label, .question_content label",
        typeText: ".topic_type"
      }
    },
    {
      key: "ulearning-exam",
      name: "优学院 / UMOOC",
      hosts: ["ulearning.cn", "umooc.com.cn"],
      match: [/\/learnCourse\/learnCourse\.html/i, /\/quiz\/pc\.html/i, /\/umooc\/learner\/homework\.do/i, /utest\.ulearning\.cn/i],
      write: { target: "label, input, .iconfont", selectedClass: ["selected", "is-checked", "checkbox-checked"] },
      question: {
        root: ".question-item, .split-screen-wrapper, .multiple-choices, .judge",
        stem: ".question-title, .question-title-html, h5 .position-rltv span",
        options: "ul label .choice-title, .choice-list .content-wrapper .text, .choice-list label .rich-text, ul label span",
        clickables: "ul label input, .choice-list .checkbox, .choice-list label, .radios .radio input",
        typeText: ".title, .question-type-tag, .typeName, .base-question .title .tip"
      }
    },
    {
      key: "moodle-ouchn",
      name: "国开系 moodle 测验（广开 / 北京开大 / 湖北青开）",
      hosts: ["moodle.syxy.ouchn.cn", "xczxzdbf.moodle.qwbx.ouchn.cn", "elearning.bjou.edu.cn", "course.ougd.cn", "study.ouchn.cn", "whkpc.hnqtyq.cn"],
      match: [/\/mod\/quiz\/attempt\.php/i],
      write: { target: "label, input", checked: ["input:checked"] },
      question: {
        root: ".que",
        stem: ".qtext",
        options: ".answer div label, .flex-fill",
        clickables: ".answer div input",
        blanks: "input[id$=_answer]"
      },
      submit: { button: ".submitbtns .btn-primary" }
    },
    {
      key: "wenjuan-exam",
      name: "问卷星 考试",
      hosts: ["wenjuan.com"],
      match: [/\/exam\/ExamRd\/Answer/i],
      write: { target: "label, .xuanxiang", selectedClass: ["checked", "ichecked", "is-checked"] },
      question: {
        root: ".g-mn",
        stem: ".m-question .tigan",
        options: ".question-block .xuanxiang",
        clickables: ".question-block .xuanxiang",
        typeText: ".tixing"
      },
      pager: { next: { selector: ".u-btn-next", text: ["下一题"] }, timeoutMs: 6e3 }
    },
    {
      key: "yinghua-exam",
      name: "英华学堂 作业 / 考试",
      hosts: ["mooc.kdcnu.com", "mooc.yncjxy.com", "mooc.cdcas.com", "mooc.cqcst.edu.cn", "mooc.kmcc.edu.cn", "mooc.wuhues.com"],
      match: [/\/user\/(work|exam)/i],
      write: { target: "label, .exam-inp", checked: ["input:checked"], selectedClass: ["checked", "active"] },
      question: {
        root: ".courseexamcon-main",
        stem: ".name",
        options: ".list li .txt",
        clickables: ".list li .exam-inp",
        typeText: ".type"
      },
      pager: { next: ".next_exam", timeoutMs: 6e3 }
    }
  ];
  var B3_SPECS = [
    {
      key: "chaoxing-inclass-quiz",
      name: "超星随堂测验",
      match: [/\/page\/quiz\/stu\/answerQuestion/i],
      question: { root: ".question-item", stem: ".topic-txt", options: ".topic-option-list", clickables: ".topic-option-list input", typeInput: "input[class^=que-type]" }
    },
    {
      key: "examcloud-exam",
      name: "广东开大 exam-cloud 考试系统",
      hosts: ["gdrtvu.exam-cloud.cn"],
      match: [[/gdrtvu\.exam-cloud\.cn/i, /examRecordData/i]],
      question: {
        root: ".question-container",
        stem: ".question-body",
        options: ".option .question-options",
        clickables: ".option input",
        typeText: ".question-header .container",
        stemSplit: "[A-G]\\.",
        stemNumber: { items: ".item", current: ".current-question", label: "【第${n}小题】" },
        stemExtra: ".right .question-view .question-body"
      }
    },
    {
      key: "cug-exam",
      name: "中国地质大学 在线考试",
      match: [/\/Exam\/OnlineExamV2\//i],
      question: {
        root: ".stViewItem",
        stem: ".stViewHead div",
        options: ".stViewCont .stViewOption a",
        clickables: ".stViewCont .stViewOption a, input",
        typeText: { at: "prev", up: 2, find: ".E_E_L_I_C_R_C_T_SubType" }
      }
    },
    {
      key: "wanxue-exam",
      name: "万学 N2014 学习系统",
      match: [/\/sls\/N2014_StudyController\/next/i],
      question: { root: ".question", stem: "tr .nm2", options: ".grey td p", clickables: ".option li label", typeText: "tr .nm2" }
    },
    {
      key: "xueqi-test",
      name: "学起（职教云 oxer）测试",
      match: [/\/oxer\/page\/ots\/UniversityStart\.html/i],
      write: { target: "label, input", selectedClass: ["lichecked"] },
      question: {
        root: ".uniQueItem",
        stem: ".QueStem",
        options: "ul li span",
        clickables: "ul li",
        typeText: { at: "closest", within: ".uniQueList", find: ".fir" }
      }
    },
    {
      key: "goldgame-test",
      name: "金牌学堂 测评",
      hosts: ["www.goldgame.com.cn"],
      match: [[/www\.goldgame\.com\.cn/i, /\/TestPage/i]],
      question: { root: ".test-type-box ul .white-bg", stem: ".position-relative h3", options: ".test-option label p:last-child", clickables: ".test-option label input", typeText: { at: "self", up: 2, find: ".test-type-tips" } },
      pager: { next: ".answer-sheet li", timeoutMs: 6e3 }
    },
    {
      key: "qdouchn-exam",
      name: "青岛开放大学 考试",
      match: [/\/pages\/exam\/exam\.html/i],
      question: { root: ".exam-content-block .exam-content-topic", stem: ".exam-topic-title", options: ".exam-topic-answer .layui-unselect span", clickables: ".exam-topic-answer .layui-unselect", typeText: { at: "parent", find: ".exam-content-title .exam-content-num" } }
    },
    {
      key: "bsmy-exam",
      name: "警官学院 考试",
      match: [/\/bsmytest\/startTi\.do/i],
      question: { root: ".wrapper > div", stem: ".dx", options: "p", clickables: "p input", typeText: { at: "parent", find: "h2" } }
    },
    {
      key: "euibe2-exam",
      name: "对外经贸 exam2 考试",
      hosts: ["exam2.euibe.com"],
      match: [[/exam2\.euibe\.com/i, /\/KaoShi\/ShiTiYe\.aspx/i]],
      question: { root: ".question", stem: ".wenti", options: "li label span", clickables: "li label", typeText: { at: "page", find: ".question_head" } },
      pager: { next: ".paginationjs-next", timeoutMs: 6e3 }
    },
    {
      key: "zzx-ouchn-exam",
      name: "中央电中 zzx 学习平台考试",
      hosts: ["zzx.ouchn.edu.cn"],
      match: [[/zzx\.ouchn\.edu\.cn/i, /\/edu\/public\/student\//i]],
      question: { root: ".subject", stem: ".question span", options: ".answer>span>p:first-child" }
    },
    {
      key: "havust-exam",
      name: "华科航天 hnscen 考试",
      hosts: ["havust.hnscen.cn"],
      match: [[/havust\.hnscen\.cn/i, /\/stuExam\/examing\//i]],
      question: { root: ".main .mt_2 > div", stem: ".flex_row+div", options: ".flex_row+div+div .el-radio__label, .el-checkbox__label", typeText: ".flex_row .mr_2" }
    },
    {
      key: "mhtall-exam",
      name: "mhtall 学习平台 练习",
      hosts: ["learning.mhtall.com"],
      match: [[/learning\.mhtall\.com/i, /\/rest\/course\/exercise\/item/i]],
      question: { root: "#div_item", stem: ".item_title", options: ".opt div label", clickables: ".opt div input:not(.button_short)", typeText: "h4" }
    },
    {
      key: "wang168-test",
      name: "168网校 测验",
      hosts: ["168wangxiao.com"],
      match: [[/168wangxiao\.com/i, /\/web\/learningCenter\/details\//i]],
      question: { root: ".question-item-container", stem: ".title-content", options: ".options .opt-content", clickables: ".options label", typeText: ".top .type" }
    },
    {
      key: "wang168-exam",
      name: "168网校 考试",
      hosts: ["168wangxiao.com"],
      match: [[/168wangxiao\.com/i, /\/web\/examination\/answer/i]],
      question: { root: ".Answer-area", stem: ".listTit", options: ".el-radio__label span:last-child, .el-checkbox__label span:last-child", clickables: ".el-radio__input, .el-checkbox__input input, .ql-editor p" },
      pager: { next: { selector: ".ctrl .el-button", text: ["下一题"] }, timeoutMs: 6e3 }
    },
    {
      key: "faxuan-exam",
      name: "法宣在线 考试",
      hosts: ["faxuanyun.com"],
      match: [[/faxuanyun\.com/i, /\/bps\/examination/i]],
      question: { root: "#timucontent", stem: "h2", options: "ul li", clickables: "ul input" },
      pager: { next: "#nextButton", timeoutMs: 6e3 }
    },
    {
      key: "hexuezx-exam",
      name: "和学在线 考试",
      hosts: ["student.hexuezx", "student.jxjyzx"],
      match: [/student\.hexuezx|student\.jxjyzx/i],
      question: { root: ".el-card__body", stem: ".stem", options: ".el-radio__label, .el-checkbox__label span", clickables: ".el-radio__input, .el-checkbox__input input" }
    },
    {
      key: "cqooc-exam",
      name: "高教在线（cqooc）考试 / 测验",
      hosts: ["www.cqooc.com"],
      match: [[/www\.cqooc\.com/i, /\/learn\/mooc\/exam\/do/i], [/www\.cqooc\.com/i, /\/learn\/mooc\/testing\/do/i]],
      question: { root: "#test-form .cat", stem: ".stem", options: ".option label", clickables: ".option input" }
    },
    {
      key: "qnzzxy-exam",
      name: "qnzzxy 考试平台",
      match: [/\/kaoshi_qnzzxy\/kaoshi\.html/i],
      question: { root: ".form-group", stem: ".row-fluid", options: ".option", clickables: ".option input", typeText: { at: "parent", find: "div:first" } }
    },
    {
      key: "wencai-alone-exam",
      name: "柠檬文才 独立考试",
      hosts: ["exam.wencaischool.net"],
      match: [[/exam\.wencaischool\.net/i, /\/exam\?studentId/i]],
      question: { root: ".paperWrapper .tmList .tmc", stem: ".tmTitleTxt", options: ".ansbox .opCont", clickables: ".ansbox input" }
    },
    {
      key: "fjnu-neo-exam",
      name: "福建师范大学 neo 平台",
      hosts: ["neo.fjnu.cn"],
      match: [[/neo\.fjnu\.cn/i, /\/resource\/index/i]],
      question: { root: ".content", stem: ".title", options: "label .el-radio__label, .el-checkbox__label", clickables: "label input" }
    },
    {
      key: "youkexuetang-exam",
      name: "优课学堂 考试",
      hosts: ["youkexuetang.cn"],
      match: [[/youkexuetang\.cn/i, /\/student\//i]],
      question: { root: ".paperItemBox", stem: ".stem", options: ".el-radio__label, .el-checkbox__label", clickables: ".el-radio__input, .el-checkbox__input input" }
    },
    {
      key: "kaoshixing-exam",
      name: "考试星（单题模式）",
      hosts: ["exam.kaoshixing.com"],
      match: [[/exam\.kaoshixing\.com/i, /\/exam\/exam_start/i]],
      question: { root: ".questions .questions-content", stem: ".question-name", options: ".answers label .words", clickables: ".answers label" },
      pager: { next: { selector: "#nextQuestions", text: ["下一题"] }, timeoutMs: 6e3 }
    },
    {
      key: "beeouc-exam",
      name: "易考云 考试",
      hosts: ["exam.beeouc.com"],
      match: [[/exam\.beeouc\.com/i, /\/client/i]],
      question: { root: ".question-body", stem: ".question-stem", options: ".question-option label", clickables: ".question-option input", typeText: ".question-type" },
      pager: { next: { selector: ".question-footer button", text: ["下一题"] }, timeoutMs: 6e3 }
    },
    {
      key: "ylsf-exam",
      name: "伊犁师范成人教育 考试",
      match: [/\/learn\/NewExam/i, /\/\/GeneralTestPaper\/Testing\//i, /\/\/GeneralTestPaper\/SNTesting/i],
      question: { root: ".topic", stem: ".qsctt", options: ".xuan li", clickables: ".choice input" }
    },
    {
      key: "ytccr-work",
      name: "绎通云课堂 作业",
      hosts: ["ytccr.com"],
      match: [[/ytccr\.com/i, /#\/learning-work/i], [/ytccr\.com/i, /#\/learning-details/i]],
      question: { root: ".border-item", stem: ".qa-title", options: "label .opt-title-cnt", clickables: "label input" }
    },
    {
      key: "cqu5any-work",
      name: "重庆大学网络教育学院 作业",
      hosts: ["exercise.5any.com"],
      match: [[/exercise\.5any\.com/i, /\/Exercise\/WebUI\/Test\/Answer/i]],
      question: { root: ".subject .font-16", stem: ".stem .richtextcontent", options: ".option .richtextcontent", clickables: ".option label input" }
    },
    {
      key: "bjyz-exam",
      name: "毕节幼儿师范 考试",
      hosts: ["px.gzbjyzjxjy.cn", "px.ggcjxjy.cn"],
      match: [[/px\.gzbjyzjxjy\.cn|px\.ggcjxjy\.cn/i, /\/exam\/shiti\/dopapers/i]],
      question: { root: ".panel-body>div", stem: ".testpaper-question-stem", options: ".testpaper-question-choices li", clickables: ".testpaper-question-footer input" }
    },
    {
      key: "gzjxjy-exam",
      name: "贵州继续教育 考试",
      hosts: ["www.gzjxjy.gzsrs.cn"],
      match: [[/www\.gzjxjy\.gzsrs\.cn/i, /\/personback\//i]],
      question: { root: ".question-title", stem: ".show-text", options: "label", clickables: "label input" }
    },
    {
      key: "hexuezikao-exam",
      name: "和学自考 考试",
      hosts: ["zkpt.qdu.edu.cn"],
      match: [[/zkpt\.qdu\.edu\.cn/i, /\/examStu\/exam\/examPaper/i]],
      question: { root: ".ant-row", stem: { at: "prev", up: 2 }, options: "label", clickables: "label input" }
    },
    {
      key: "zgzjzj-exam",
      name: "专技天下 考试",
      hosts: ["zgzjzj.com"],
      match: [[/zgzjzj\.com/i, /\/examination\/perpar\.html/i]],
      write: { target: "label, input", selectedClass: ["active"] },
      question: { root: ".question_index", stem: "p", options: ".options li p, li>span:last-child", clickables: ".options li", typeText: "p span" }
    },
    {
      key: "euibe-exam",
      name: "对外经贸 exam 考试",
      hosts: ["exam.euibe.com"],
      match: [[/exam\.euibe\.com/i, /\/KaoShi\/ShiTiYe\.aspx/i]],
      question: {
        root: ".question",
        stem: ".wenti .stem",
        options: "label span",
        clickables: "label input",
        typeText: { at: "closest", within: ".question_list", find: ".question_head" }
      },
      pager: { next: ".paginationjs-next", timeoutMs: 6e3 }
    },
    {
      key: "xuehui-exam",
      name: "学晖教育 题库刷题",
      hosts: ["xhjy.ldzxjy.com"],
      match: [[/xhjy\.ldzxjy\.com/i, /tikuUserBatch\/keepTopic/i]],
      question: { root: ".radio", stem: ".issueTitle", options: "ul li span", clickables: "ul li", typeText: ".issueTypes" },
      pager: { next: { selector: ".next", text: ["下一题"] }, timeoutMs: 6e3 }
    },
    {
      key: "edufe-exam",
      name: "东财在线 练习 / 作业",
      hosts: ["classroom.edufe.com.cn"],
      match: [[/classroom\.edufe\.com\.cn/i, /\/PracticePaper/i], [/classroom\.edufe\.com\.cn/i, /\/HomeWorkPaper/i]],
      write: { target: "label, input", selectedClass: ["_CheckBox_checked"] },
      question: { root: ".CBTPaperMain-trunk", stem: ".CBTPaperMain-divInline", options: "ul li label" }
    },
    {
      key: "lidapoly-exam",
      name: "上海立达学院 考试",
      hosts: ["kkzxsx.lidapoly.edu.cn"],
      match: [[/kkzxsx\.lidapoly\.edu\.cn/i, /\/exam\//i]],
      write: { target: "label, input", selectedClass: ["is-checked"] },
      question: { root: ".main .item", stem: ".text", options: ".options label .el-radio__label, .el-checkbox__label", clickables: ".options label", typeText: { at: "parent", find: ".text" } }
    },
    {
      key: "sjztkj-exam",
      name: "石家庄科技继续教育 考试",
      hosts: ["kc.jxjypt.cn"],
      match: [[/kc\.jxjypt\.cn/i, /\/paper\/start/i]],
      write: { target: "label, input", selectedClass: ["cho-this"] },
      question: { root: ".sub-content", stem: ".sub-dotitle", options: ".sub-answer dd", clickables: ".sub-answer dd, .mater-respond textarea", typeText: ".sub-dotitle i" }
    },
    {
      key: "jundun-exam",
      name: "国开军盾 考试",
      hosts: ["s.jundunxueyuan.com"],
      match: [[/s\.jundunxueyuan\.com/i, /#\/exam\//i]],
      question: {
        root: ".section-item-question-item",
        stem: ".question-tit",
        options: ".el-radio-group label, .el-checkbox-group label",
        clickables: ".el-radio-group input, .el-checkbox-group input",
        typeText: { at: "closest", within: ".section-item", find: ".section-item-tit" }
      }
    },
    {
      key: "bossyun-exam",
      name: "博学 bossyun 考试",
      hosts: ["bx.bossyun.com"],
      match: [[/bx\.bossyun\.com/i, /\/bx\/study\/examine/i]],
      question: { root: ".question-list", stem: ".title", options: ".ant-radio-group label, .ant-checkbox-group label", clickables: ".ant-radio-group input, .ant-checkbox-group input", typeText: ".tag" }
    },
    {
      key: "oldzzx-exam",
      name: "电中在线（old-zzx）考试",
      hosts: ["old-zzx.ouchn.edu.cn"],
      match: [[/old-zzx\.ouchn\.edu\.cn/i, /\/edu\/public\/student\//i]],
      question: { root: ".subject", stem: ".question", options: ".answer .option-name", clickables: ".answer" }
    },
    {
      key: "ixuejiao-exam",
      name: "爱学（ztbu / 51ixuejiao）考试",
      hosts: ["ai.ztbu.edu.cn", "www.51ixuejiao.com"],
      match: [[/ai\.ztbu\.edu\.cn|www\.51ixuejiao\.com/i, /\/Web\/Test\/doing/i]],
      question: { root: ".exam dd", stem: "card-title", options: ".ans_area div", typeText: "info" }
    },
    {
      key: "ipmph-exam",
      name: "人卫智网 校内考试",
      hosts: ["exam.ipmph.com"],
      match: [[/exam\.ipmph\.com/i, /\/front\/myschool\/index\.html/i]],
      question: { root: ".body", stem: ".fch2 font", options: ".selet .el-radio__label", clickables: ".selet input" },
      pager: { next: "#next_btn", timeoutMs: 6e3 }
    },
    {
      key: "zbwsrc-exam",
      name: "卫生人力资源系统（vgos）考试",
      hosts: ["vgos.zbwsrc.cn"],
      match: [[/vgos\.zbwsrc\.cn/i, /\/TESExamClient\//i]],
      question: { root: ".testitem", stem: ".stem", options: ".inputitem li", clickables: ".inputitem input" }
    },
    {
      key: "peixun-exam",
      name: "培训系统 考试（ShowItemView）",
      match: [/ShowItemView/i],
      question: { root: ".choice-interaction", stem: ".select-clickstyle span", options: ".text-simple-choice .text", clickables: ".text-simple-choice input", typeText: { at: "prev", up: 1, match: ".item-content" } }
    },
    {
      key: "chuanmei-exam",
      name: "传媒 考试（ShiTiYe）",
      match: [/\/Exam\/onlineTest\/ShiTiYe\.aspx/i],
      question: { root: ".ShiTi", stem: ".Paper_ParentQuestionDesc", options: ".Paper_Answer li", clickables: ".Paper_Answer input", typeText: { at: "closest", within: "#ContentText", find: "#ExamFrameQuesDesc" } }
    },
    {
      key: "hui-exam",
      name: "慧考试",
      match: [/\/examSystemPCInner\//i],
      question: { root: ".question-list-box > div", stem: ".topic-title", options: ".option_list", typeText: ".question-type-name" }
    },
    {
      key: "zikao365-exam",
      name: "自考365 模拟考试",
      hosts: ["member.zikao365.com"],
      match: [[/member\.zikao365\.com/i, /generaltest\/exam\.shtm/i]],
      question: { root: ".timu", stem: ".timu-tit", options: ".timu-list .list", clickables: ".timu-list input" }
    },
    {
      key: "moycp-exam",
      name: "幕享（moycp）在线学习",
      hosts: ["web.moycp.com"],
      match: [[/web\.moycp\.com/i, /\/study/i]],
      question: { root: ".question-list", stem: ".question-title", options: ".answer-option label", clickables: ".answer-option input", typeText: ".singleflag" },
      pager: { next: ".next-submit .next", timeoutMs: 6e3 }
    },
    {
      key: "maineng-exam",
      name: "麦能 LMS 在线考试",
      match: [/\/lms\/web\/onlineexam\/exambegin/i],
      question: { root: ".sdiv", stem: ".eptimu_name", options: ".ansdiv div", clickables: ".ansdiv input", typeText: ".eptimu_title" }
    },
    {
      key: "tianshi-exam",
      name: "天使在线 测评 / 考试",
      match: [/\/pages_jsp\/mobile\/courseSimulate\.html/i, /\/pages_jsp\/mobile\/coursExamView\.html/i, /\/pages_jsp\/mobile\/courseAnswer\.html/i],
      question: { root: ".neixunExamQuestionHead", stem: "#title", options: ".option", typeText: ".tag" }
    },
    {
      key: "jxyy-exam",
      name: "江西应用 考试作答",
      match: [/examinationAnswer/i],
      question: { root: ".answer-subject-details", stem: ".answer-subject", options: "ul li p", clickables: "ul li", typeText: ".answer-subject-top" }
    },
    {
      key: "netdig-exam",
      name: "在线学习平台（edu.netdig.cn）试卷",
      hosts: ["edu.netdig.cn"],
      match: [[/edu\.netdig\.cn/i, /\/paper\.html/i]],
      question: { root: ".position-relative", stem: ".tmtitle-p", options: "label .span-inline", clickables: "label input", typeText: ".customtktype" }
    },
    {
      key: "eduwest-exam",
      name: "含弘（zuoye.eduwest.com）考试记录",
      hosts: ["zuoye.eduwest.com"],
      match: [[/zuoye\.eduwest\.com/i, /\/examinationrecord/i]],
      question: { root: "tr td table:has(a)", stem: "td", options: "a", clickables: "input" }
    },
    {
      key: "huashen-exam",
      name: "华莘学堂 考试",
      hosts: ["huashenxt.com"],
      match: [[/huashenxt\.com/i, /\/mgr\.html/i]],
      write: { target: "label, input", selectedClass: ["selected"] },
      question: { root: ".question-item", stem: ".question_title .text", options: ".choice_item .text, .judge_item label", clickables: ".choice_item .choice_option, .judge_item input", typeText: ".question_type" }
    },
    {
      key: "xljk-exam",
      name: "心理健康（zgxlwsxh）考试",
      hosts: ["zgxlwsxh.oxcoder.com.cn"],
      match: [/zgxlwsxh\.oxcoder\.com\.cn/i],
      question: { root: ".question-container", stem: ".question-box .ques-desc-content", options: ".question-box label", clickables: ".question-box label input", typeText: ".directory-title" },
      pager: { next: ".ant-btn-circle", timeoutMs: 6e3 }
    },
    {
      key: "xjtu-dlc-exam",
      name: "西安交通大学继续教育 考试",
      hosts: ["kj.xjtudlc.com"],
      match: [/kj\.xjtudlc\.com/i],
      write: { target: "label, input", selectedClass: ["layui-checkcard-checked"] },
      question: { root: ".swiper-slide", stem: ".layui-space-item .question", options: ".layui-checkcard-desc", typeText: ".layui-space-item" }
    },
    {
      key: "hebhjy-exam",
      name: "石家庄科技信息职业学院 考试",
      hosts: ["www.hebhjyc.cn"],
      match: [[/www\.hebhjyc\.cn/i, /exam/i]],
      question: { root: ".question-item", stem: ".question-header .q-title", options: ".options .opt-text", clickables: ".options .option-item", typeText: { at: "closest", within: ".question-type-section", find: "h3" } }
    },
    {
      key: "bdjxjy-exam",
      name: "保定继续教育 答题页",
      match: [/\/exam\/answer\.html/i],
      question: { root: ".stem-container", stem: ".stem span", options: ".option div .optStem", clickables: ".option div input", typeText: { at: "self", up: 2, find: ".description" } }
    },
    {
      key: "afstudy-exam",
      name: "noNi 自测（app-afstudy）",
      match: [/\/app-afstudy\/self_test\.html/i],
      question: { root: ".lineClass .b-papp-root", stem: ".b-exam-top .b-exam-tit", options: ".b-exam-box li label", clickables: ".b-exam-box li input", typeText: ".b-exam-top .b-exam-type" }
    },
    {
      key: "ui-question-exam",
      name: "华侨 / 唐山继续教育 考试",
      match: [/\/exam\/student\/exam\//i],
      write: { target: "label, input", selectedClass: ["ui-option-selected"] },
      question: { root: ".ui-question-group .ui-question", stem: ".ui-question-title div", options: ".ui-question-options div", clickables: ".ui-question-options .ui-question-options-order, .ui-question-content-wrapper, .ke-container", typeText: { at: "parent", find: "h2" } }
    },
    {
      key: "fjjxjy-work",
      name: "福建继续教育 测验 / 作业",
      match: [/\/Web_Study\/Student\/Center\/MyWorkOnView/i, /\/Web_Study\/Student\/Center\/MyExamOnView/i],
      write: { target: "label, input", selectedClass: ["correct"] },
      question: { root: ".topic-cont", stem: "p", options: ".options li span", clickables: ".options li" }
    },
    {
      key: "hnjxjy-exam",
      name: "湖南继续教育 考试",
      hosts: ["ls365.net", "ls365.com", "www.jwstudy.cn", "hdjt.wuxuekeji.com", "csjs.ynlhxy.com"],
      match: [[/ls365\.net|ls365\.com|www\.jwstudy\.cn|hdjt\.wuxuekeji\.com|csjs\.ynlhxy\.com/i, /\/User\/Student\/myhomework\.aspx/i], [/ls365\.net|ls365\.com|www\.jwstudy\.cn|hdjt\.wuxuekeji\.com|csjs\.ynlhxy\.com/i, /\/examing\.aspx/i]],
      write: { target: "label, input", selectedClass: ["cur"] },
      question: { root: ".exam_question", stem: ".exam_question_title div", options: ".question_select .select_detail", clickables: ".question_select li", typeText: ".exam_question_title div strong" }
    },
    {
      key: "deyang-exam",
      name: "德阳继续教育 考试",
      match: [/\/dypx\/OnlineExam\/Exam\.aspx/i],
      question: { root: "#divProblemArea", stem: "#ulProblems li:first", options: "#ulProblems .answer", clickables: "#ulProblems .answer input" }
    },
    {
      key: "zibo-exam",
      name: "淄博继续教育 练习",
      match: [/\/practice\/start/i],
      write: { target: "label, input", selectedClass: ["active"] },
      question: { root: ".header-left .trueorfalse .sub", stem: ".mb10", options: ".options li", typeText: { at: "prev", up: 1 } }
    },
    {
      key: "hebjxjy-exam",
      name: "河北继续教育 考试",
      match: [/paperid/i],
      write: { target: "label, input", selectedClass: ["cur"] },
      question: {
        root: ".examItem",
        stem: ".examItemRight .question",
        options: ".examItemRight ul li span",
        clickables: ".examItemRight ul li",
        typeText: { at: "parent", find: ".questTitle b" }
      }
    },
    {
      key: "olex-exam",
      name: "保定继续教育（olex_exam 系）",
      match: [/\/cuggw\/rs\/olex_exam/i, /\/hebic\/rs\/olex_exam/i, /\/sjzkjxy\/rs\/olex_exam/i, /\/hbfsh\/rs\/olex_exam/i, /\/jxycu\/rs\/olex_exam/i, /\/jlufe\/rs\/olex_exam/i, /\/hbun\/rs\/olex_exam/i],
      question: { root: ".item_li", stem: ".item_title", options: "ul li label", clickables: "ul li input" }
    },
    {
      key: "zygbxxpt-exam",
      name: "干部在线学习平台（zygbxxpt）考试",
      hosts: ["www.zygbxxpt.com"],
      match: [[/www\.zygbxxpt\.com/i, /\/exam/i]],
      question: { root: ".Body", stem: ".QName", options: ".QuestinXuanXiang p:not(:empty)", typeText: ".QName span" }
    },
    {
      key: "pbaqks-exam",
      name: "平坝安监 pbaqks 在线学习测试",
      hosts: ["www.pbaqks.com"],
      match: [[/www\.pbaqks\.com/i, /\/P_ExamDetail\/OnlineStuday/i]],
      question: { root: ".main-container .single-box", stem: ".single-main:first", options: ".choose-box label", typeText: ".single-container .font-title" }
    },
    {
      key: "dalian-exam",
      name: "大连 / 九江 在线学堂考试",
      match: [/\/onlineclass\/exam\//i],
      write: { target: "label, input", selectedClass: ["ant-checkbox-checked"] },
      question: {
        root: ".single_excer_item___lFMCm, .single_excer_item___2lGB8",
        stem: ".title_content___1Qagx .title_content_text___27NIL, .title_content___24J6D .title_content_text___8ruL4",
        options: ".options_content___nXSwG label .option_text___udjiE, .options_content___2YgyG label .option_text___1mfcu",
        clickables: ".options_content___nXSwG label input, .options_content___2YgyG label input"
      }
    },
    {
      key: "yxbyun-exam",
      name: "亿学宝云 考试 / 测验",
      hosts: ["yxbyun.com"],
      match: [[/yxbyun\.com/i, /\/exam/i], [/yxbyun\.com/i, /#\/testPaper/i]],
      write: { target: "label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".danxuan, .test",
        stem: ".tm, .type",
        options: ".xuanxiang .xxnr, .el-radio-group label, .el-checkbox-group label",
        clickables: ".xuanxiang .xxbh, .el-radio__input, .el-checkbox__input input",
        typeText: ".tx, .el-tag"
      },
      capture: [
        {
          source: "jsonparse",
          marker: "sjDtSaveReqVOS",
          shape: ["data.sjSjRespDto.sjDtSaveReqVOS"],
          list: "data.sjSjRespDto.sjDtSaveReqVOS[]",
          children: "sjSjstSaveReqVOS",
          fields: {
            question: "tg",
            typeLabel: "dtmc",
            options: { from: "tkStxxSaveReqVOS", each: "xxnr" },
            answer: [{ from: "dxpdtda", split: "," }, { from: "dxtda", split: "," }]
          }
        },
        {
          source: "jsonparse",
          marker: "bigContent",
          shape: ["data.bigContent"],
          list: "data.bigContent[]",
          children: "smallContent",
          fields: {
            question: ["question.questionTitle", "content"],
            typeLabel: "bigName",
            options: { from: "question.optionList", each: "questionContent" },
            answer: ["question.questionAnswer", "answer"]
          }
        }
      ]
    },
    {
      key: "zhihuishu-smart-work",
      name: "智慧树 新形态课程 作业 / 掌握度",
      hosts: ["zhihuishu.com"],
      match: [[/zhihuishu\.com/i, /ReviewExam|studentReviewTestOrExam/i]],
      write: { target: "label, .el-checkbox__input, .iconfont, input" },
      question: {
        root: ".questionContent",
        stem: ".questionName .centent-pre",
        options: ".radio-view li.clearfix, .checkbox-views label.el-checkbox",
        clickables: ".el-checkbox__input:not(.is-checked), i.iconfont:not(.checkedIcon)",
        blanks: ".fillAnswer"
      },
      pager: { next: ".next-topic.next-t", timeoutMs: 6e3 }
    },
    {
      key: "zhihuishu-fusion-exam",
      name: "智慧树 AI 助教 / 学伴 掌握度",
      hosts: ["zhihuishu.com"],
      match: [[/fusioncourseh5\.zhihuishu\.com|studywisdomh5\.zhihuishu\.com|wisdom-mooc\.zhihuishu\.com/i, /\/exam/i]],
      write: { target: "label, .el-radio__input, .el-checkbox__input", selectedClass: ["is-checked"] },
      question: {
        root: ".exam-item",
        stem: ".quest-title .option-name",
        options: "label",
        clickables: ".el-radio__input:not(.is-checked), .el-checkbox__input:not(.is-checked)",
        typeText: ".quest-type"
      }
    },
    {
      key: "danwei-exam",
      name: "单位内部考试系统（vant 移动端）",
      hosts: ["61.183.163.9:8089", "zjpt.nnjjtgs.com:8081"],
      match: [/ksnr|lxnr/i],
      write: { target: ".van-radio, .van-checkbox, label, input" },
      question: {
        root: ".tm",
        stem: ".tmnrbj span:last-child",
        options: ".van-radio-group .dxt .van-radio__label, .van-checkbox__label",
        clickables: ".van-radio__input, .van-checkbox__input",
        typeText: ".tmnrbj span",
        blanks: ".van-field__control"
      },
      capture: [{
        source: "jsonparse",
        marker: "topicList",
        shape: ["topicList"],
        list: "topicList[]",
        fields: {
          question: "ttop011",
          typeLabel: "ttop010",
          options: { from: "ttop018", split: "$$" },
          answer: ["ttop022", { from: "ttop021", split: "$$" }]
        }
      }]
    },
    {
      key: "ttcdw-exam",
      name: "新疆继续教育（ttcdw）考试",
      hosts: ["www.ttcdw.cn"],
      match: [[/www\.ttcdw\.cn/i, /\/p\/uExam\/goExam\//i]],
      write: { target: "label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".question-item",
        stem: ".question-item-title span",
        options: ".question-item-option label .el-checkbox__label, .el-radio__label",
        clickables: ".question-item-option label"
      },
      typeCodes: { 0: QuestionType.SINGLE, 1: QuestionType.MULTIPLE, 2: QuestionType.JUDGEMENT, 3: QuestionType.COMPLETION },
      capture: [{
        source: "jsonparse",
        marker: "assessList",
        shape: ["data.exam"],
        list: "data.exam.assessList[].questionList[]",
        fields: {
          question: "name",
          typeLabel: "types",
          options: "answers[].name",
          answer: { from: "answers", each: "name", where: ["isAnswer", "0"] }
        }
      }]
    },
    {
      key: "hnzkw-test",
      name: "湖南造价（hnzkw）测验",
      hosts: ["hnzkw.org.cn"],
      match: [/hnzkw\.org\.cn/i],
      write: { target: ".el-radio, .el-checkbox, label, input", selectedClass: ["is-checked"] },
      question: {
        root: ".examList",
        stem: ".text",
        options: ".el-radio-group label, .el-checkbox-group label",
        clickables: ".el-radio-group input, .el-checkbox-group input",
        typeText: ".status"
      },
      typeCodes: { 0: QuestionType.SINGLE, 1: QuestionType.COMPLETION, 3: QuestionType.JUDGEMENT, 4: QuestionType.MULTIPLE },
      capture: [{
        source: "jsonparse",
        marker: "bookdatas",
        shape: ["data.bookdatas"],
        list: "data.bookdatas[]",
        fields: {
          question: "content",
          typeLabel: "flag",
          options: [{ from: "optionss" }, { from: "selectOption" }],
          answer: "answer"
        }
      }]
    },
    {
      key: "yiban-exam",
      name: "易班 考试",
      hosts: ["exam.yooc.me"],
      match: [[/exam\.yooc\.me/i, /\/group/i]],
      question: { root: "main:last", stem: "h3 div", options: ".mb ul li .flex-auto", clickables: ".mb ul li", typeText: ".mb-s" }
    },
    {
      key: "dianmo-exam",
      name: "点墨 考试",
      match: [/\/Exam\/StartExam/i],
      question: {
        root: "#question div div:first",
        stem: "div:first",
        options: "div:not(:first-child)",
        clickables: "div:not(:first-child) input",
        typeText: { at: "page", find: ".alert #groupNameSpan" }
      }
    },
    {
      key: "ruixue-exam",
      name: "睿学 补考",
      hosts: ["ks.hustsnde.com"],
      match: [[/ks\.hustsnde\.com/i, /exam-app-exam-paper/i]],
      question: {
        root: "#paper .content-box",
        stem: "ul li:first-child .desc",
        options: "ul li:nth-child(2)",
        clickables: "ul label input",
        typeText: ".title",
        optionsSplit: ["\\[[A-Z]:?\\]", "\\(?[A-Z.?]\\)?"],
        judgementOptions: ["正确", "错误"]
      }
    },
    {
      key: "tianze-exam",
      name: "石家庄理工职业学院 考试",
      hosts: ["edu.tianzerencai.com"],
      match: [[/edu\.tianzerencai\.com/i, /\/examinationDetail/i]],
      write: { target: "label, input", selectedClass: ["cho-this"] },
      question: {
        root: ".topic",
        stem: ".title",
        options: ".main",
        clickables: ".main",
        typeText: ".title",
        optionsByType: {
          [QuestionType.SINGLE]: { options: ".radio .option_text", clickables: ".radio button" },
          [QuestionType.MULTIPLE]: { options: ".checkbox .option_text", clickables: ".checkbox button" },
          [QuestionType.JUDGEMENT]: { options: ".judge button", clickables: ".judge button", judgementOptions: ["正确", "错误"] }
        }
      }
    },
    {
      key: "sinopec-exam",
      name: "中国石化网络学院 考试",
      hosts: ["sia.sinopec.com"],
      match: [[/sia\.sinopec\.com/i, /\/exam/i]],
      question: {
        root: ".queston-item>div:has([topisshow='0'])",
        stem: "h6",
        options: ".el-radio,.el-checkbox label",
        clickables: ".el-radio,.el-checkbox input",
        indexFrom: "a"
      },
      capture: {
        source: "jsonparse",
        marker: "partitions",
        shape: ["responseData.partitions"],
        list: "responseData.partitions",
        listJson: "partitions",
        children: "questions",
        answerIndex: { base: 0 },
        fields: {
          question: "stem",
          typeLabel: "queTypeName",
          options: { from: "options", each: "optInfo" },
          answer: { from: "answer", split: ",", map: { Y: "对", N: "错" } }
        }
      }
    }
  ].map((spec) => Object.assign({ write: { target: "label, input" } }, spec));
  var HOST_LABEL = "[a-z0-9](?:[a-z0-9_-]*[a-z0-9])?";
  var COMPLETE_HOST = new RegExp("^" + HOST_LABEL + "(?:\\." + HOST_LABEL + ")+$", "i");
  var HOST_PLANS = /* @__PURE__ */ new Map();
  var HOST_CACHE = /* @__PURE__ */ new Map();
  var PlatformRegistry = class _PlatformRegistry {
    static specs = [].concat(SPECS, B1_SPECS, B2_SPECS, B3_SPECS);
    // 单条判定口径：能看出纯域名就整段比较，否则退回正则
    static hit(pattern, href, host) {
      let domains = HOST_PLANS.get(pattern);
      if (domains === void 0) {
        domains = null;
        const rendered = String(pattern.source == null ? "" : pattern.source).replace(/\\\//g, "/").replace(/\\\./g, ".");
        if (!rendered.includes("/") && !/[()[\]{}+*?]/.test(rendered)) {
          const list = rendered.replace(/^\^+|\$+|[\\^]/g, "").split("|").map((part) => part.trim().replace(/^\.+|\.+$/g, "").toLowerCase()).filter(Boolean);
          if (list.length && list.every((domain) => COMPLETE_HOST.test(domain))) domains = list;
        }
        if (HOST_PLANS.size > 400) HOST_PLANS.clear();
        HOST_PLANS.set(pattern, domains);
      }
      if (domains) return !!host && domains.some((domain) => host === domain || host.endsWith("." + domain));
      try {
        return pattern.test(href);
      } catch (e) {
        return false;
      }
    }
    // match 语义
    static matches(spec, href) {
      const key = String(href == null ? "" : href);
      let host = HOST_CACHE.get(key);
      if (host === void 0) {
        host = "";
        try {
          host = String(new URL(key).hostname).toLowerCase();
        } catch (e) {
        }
        if (HOST_CACHE.size > 200) HOST_CACHE.clear();
        HOST_CACHE.set(key, host);
      }
      if ((spec.exclude || []).some((pattern) => _PlatformRegistry.hit(pattern, href, host))) return false;
      return (spec.match || []).some((entry) => Array.isArray(entry) ? entry.every((pattern) => _PlatformRegistry.hit(pattern, href, host)) : _PlatformRegistry.hit(entry, href, host));
    }
    // URL 优先
    static byHref(href) {
      return _PlatformRegistry.specs.find((spec) => _PlatformRegistry.matches(spec, href)) || null;
    }
    // 兜底要先对域名
    static byPresence(href, page) {
      let host = "";
      try {
        host = String(new URL(href).hostname).toLowerCase();
      } catch (e) {
      }
      if (!host || !page || !page.querySelectorAll) return null;
      return _PlatformRegistry.specs.find((spec) => spec.presence !== false && (spec.hosts || []).some((domain) => {
        const name = String(domain).toLowerCase();
        return host === name || host.endsWith("." + name) || name.includes(".") && !COMPLETE_HOST.test(name) && host.startsWith(name + ".");
      }) && FrameProbe.queryAll((spec.question || {}).root, page).length > 0) || null;
    }
    // 判平台
    static detect(href, page) {
      const url = href == null ? HAS_DOM ? location.href : "" : href;
      const view = page || (HAS_DOM ? document : null);
      return _PlatformRegistry.byHref(url) || _PlatformRegistry.byPresence(url, view);
    }
    // 登记 spec
    static register(spec) {
      if (!spec || !spec.key) throw new Error("spec.key 必填");
      const at = _PlatformRegistry.specs.findIndex((item) => item.key === spec.key);
      if (at >= 0) _PlatformRegistry.specs.splice(at, 1, spec);
      else _PlatformRegistry.specs.push(spec);
      return spec;
    }
  };
  var JsonWatch = {
    limit: 24,
    payloads: [],
    subs: [],
    keys: null,
    restore: null,
    installs: 0,
    subscribe(capture) {
      if (this.subs.indexOf(capture) < 0) this.subs.push(capture);
      capture.cursor = this.length();
    },
    unsubscribe(capture) {
      const at = this.subs.indexOf(capture);
      if (at >= 0) this.subs.splice(at, 1);
    },
    install(win) {
      this.installs += 1;
      if (this.restore || !win || !win.JSON) return !!this.restore;
      const raw = win.JSON.parse;
      const self = this;
      win.JSON.parse = function(...args) {
        const result = raw.apply(this, args);
        try {
          if (result && typeof result === "object" && !Array.isArray(result)) {
            if (!self.keys) {
              const set = /* @__PURE__ */ new Set();
              for (const spec of PlatformRegistry.specs) {
                const list = spec.capture ? Array.isArray(spec.capture) ? spec.capture : [spec.capture] : [];
                for (const entry of list) {
                  for (const shape of entry.shape || []) set.add(String(shape).split(".")[0]);
                }
              }
              self.keys = set;
            }
            if (Object.keys(result).some((key) => self.keys.has(key))) {
              self.payloads.push(result);
              if (self.payloads.length > self.limit) self.payloads.shift();
              for (const capture of self.subs.slice()) {
                try {
                  capture.ingest(result);
                } catch (e) {
                }
              }
            }
          }
        } catch (e) {
        }
        return result;
      };
      this.restore = () => {
        win.JSON.parse = raw;
        this.payloads = [];
      };
      return true;
    },
    release() {
      this.installs = Math.max(0, this.installs - 1);
      if (!this.installs && this.restore) {
        this.restore();
        this.restore = null;
      }
    },
    length() {
      return this.payloads.length;
    },
    since(cursor) {
      return this.payloads.slice(cursor || 0);
    }
  };

  // Addon.ts
  var VueProbe = class _VueProbe {
    static KEY = "__autoquizVue";
    static LIST = "__AUTOQUIZ_VUE_LIST__";
    static installs = 0;
    static restore = null;
    // 装钩
    static install(win) {
      if (!win) return false;
      if (_VueProbe.installs) {
        _VueProbe.installs += 1;
        return true;
      }
      const rawCall = win.Function && win.Function.prototype && win.Function.prototype.call;
      if (!rawCall) return false;
      const isVue = (value) => !!(value && typeof value.mixin === "function" && typeof value.version === "string");
      const mixinInto = (candidate) => {
        const vue = candidate && candidate.default && isVue(candidate.default) ? candidate.default : candidate;
        if (!isVue(vue) || vue.__autoquizMixed) return false;
        vue.__autoquizMixed = 1;
        try {
          vue.mixin({
            mounted() {
              const element = this.$el;
              if (element && !element[_VueProbe.KEY]) {
                try {
                  element[_VueProbe.KEY] = this;
                } catch (e) {
                }
              }
              if (!win[_VueProbe.LIST]) win[_VueProbe.LIST] = [];
              const list = win[_VueProbe.LIST];
              if (list.length < 4e3) list.push(this);
            }
          });
        } catch (e) {
          return false;
        }
        return true;
      };
      win.Function.prototype.call = function(thisArg, ...args) {
        const result = rawCall.apply(this, [thisArg].concat(args));
        if (!_VueProbe.installs) return result;
        mixinInto(thisArg);
        for (let i = 0; i < args.length && i < 3; i++) mixinInto(args[i]);
        return result;
      };
      _VueProbe.installs = 1;
      _VueProbe.restore = () => {
        win.Function.prototype.call = rawCall;
      };
      return true;
    }
    // 卸钩
    static uninstall() {
      if (!_VueProbe.installs) return;
      _VueProbe.installs -= 1;
      if (!_VueProbe.installs && _VueProbe.restore) {
        _VueProbe.restore();
        _VueProbe.restore = null;
      }
    }
  };
  var ResponseTamper = class _ResponseTamper {
    static installs = 0;
    static restore = null;
    // 无声明不装钩
    static install(win, specs) {
      const list = Array.isArray(specs) ? specs : [specs].filter(Boolean);
      if (!win || !list.some((spec) => (spec.poison || []).length)) return false;
      if (_ResponseTamper.installs) {
        _ResponseTamper.installs += 1;
        return true;
      }
      const Raw = win.XMLHttpRequest;
      if (!Raw || !Raw.prototype) return false;
      const rawOpen = Raw.prototype.open;
      Raw.prototype.open = function(method, url, ...rest) {
        const target = String(url || "");
        for (const spec of list) {
          const rules = spec.poison || [];
          for (const rule of rules) {
            if (rule && rule.marker && target.includes(rule.marker)) {
              const body = rule.with == null ? "[]" : String(rule.with);
              this.addEventListener("readystatechange", function() {
                if (this.readyState !== 4) return;
                ["responseText", "response"].forEach((field) => {
                  try {
                    Object.defineProperty(this, field, { configurable: true, get: () => body });
                  } catch (e) {
                  }
                });
              });
              break;
            }
          }
        }
        return rawOpen.apply(this, [method, url].concat(rest));
      };
      _ResponseTamper.installs = 1;
      _ResponseTamper.restore = () => {
        Raw.prototype.open = rawOpen;
      };
      return true;
    }
    // 卸钩
    static release() {
      if (!_ResponseTamper.installs) return;
      _ResponseTamper.installs -= 1;
      if (!_ResponseTamper.installs && _ResponseTamper.restore) {
        _ResponseTamper.restore();
        _ResponseTamper.restore = null;
      }
    }
  };
  var SessionLock = class _SessionLock {
    // 席位按站点分
    static slot(host) {
      return "autoquiz_session:" + String(host || "local");
    }
    constructor(options = {}) {
      this.log = options.log || new Logger({ mirror: false });
      this.win = options.win || null;
      this.sessionId = options.sessionId || "";
      this.listener = null;
      this.onConflict = options.onConflict || null;
    }
    // 取本地存储
    static store(win) {
      try {
        return win && win.localStorage ? win.localStorage : null;
      } catch (e) {
        return null;
      }
    }
    // 抢席位
    acquire(host) {
      const win = this.win;
      const storage = _SessionLock.store(win);
      if (!storage || !win || !this.sessionId) return false;
      const key = _SessionLock.slot(host);
      try {
        storage.setItem(key, this.sessionId);
      } catch (e) {
        return false;
      }
      if (this.listener) return true;
      this.listener = (event) => {
        if (!event || event.key !== key || !event.newValue || event.newValue === this.sessionId) return;
        this.log.warn("检测到另一个标签页在同一站点作答，本实例已暂停");
        if (this.onConflict) this.onConflict(event.newValue);
      };
      win.addEventListener("storage", this.listener);
      return true;
    }
    // 让出席位
    release(host) {
      const storage = _SessionLock.store(this.win);
      if (storage) {
        try {
          if (storage.getItem(_SessionLock.slot(host)) === this.sessionId) storage.removeItem(_SessionLock.slot(host));
        } catch (e) {
        }
      }
      if (this.win && this.listener) {
        try {
          this.win.removeEventListener("storage", this.listener);
        } catch (e) {
        }
      }
      this.listener = null;
    }
  };
  var VideoRate = class _VideoRate {
    constructor(options = {}) {
      this.log = options.log || new Logger({ mirror: false });
      this.timer = null;
      this.observer = null;
      this.watched = /* @__PURE__ */ new WeakSet();
      this.rate = 1;
      this.keepPlaying = false;
    }
    // 校验倍速
    static valid(rate) {
      const value = Number(rate);
      return Number.isFinite(value) && value >= 0.25 && value <= 16 ? value : 0;
    }
    // 只改单个视频
    static apply(video, rate, keepPlaying) {
      const want = _VideoRate.valid(rate);
      if (!want) return false;
      let done = false;
      try {
        if (Number(video.playbackRate) !== want) video.playbackRate = want;
        done = Number(video.playbackRate) === want;
      } catch (e) {
      }
      if (keepPlaying) _VideoRate.resume(video);
      return done;
    }
    // 被暂停续播
    static resume(video) {
      try {
        if (video.ended || !video.paused) return;
        const playing = video.play();
        if (playing && typeof playing.catch === "function") playing.catch(() => {
        });
      } catch (e) {
      }
    }
    // 起倍速
    start(page, rate, keepPlaying) {
      this.stop();
      const want = _VideoRate.valid(rate);
      if (!want || !page || !page.body) return false;
      this.rate = want;
      this.keepPlaying = !!keepPlaying;
      const self = this;
      const sweep = () => {
        Array.from(page.querySelectorAll("video")).forEach((video) => {
          if (!self.watched.has(video)) {
            self.watched.add(video);
            const reassert = () => _VideoRate.apply(video, self.rate, self.keepPlaying);
            ["play", "ratechange", "loadedmetadata", "seeked"].forEach((type) => video.addEventListener(type, reassert));
            if (self.keepPlaying) video.addEventListener("ended", () => _VideoRate.resume(video));
          }
          _VideoRate.apply(video, self.rate, self.keepPlaying);
        });
      };
      sweep();
      if (typeof MutationObserver === "function") {
        try {
          this.observer = new MutationObserver(sweep);
          this.observer.observe(page.body, { childList: true, subtree: true });
        } catch (e) {
          this.log.warn("视频监听挂不上，退回轮询: " + e.message);
        }
      }
      this.timer = setInterval(sweep, 4e3);
      return true;
    }
    // 停倍速
    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      if (this.observer && this.observer.disconnect) this.observer.disconnect();
      this.observer = null;
      this.rate = 0;
      this.keepPlaying = false;
    }
  };
  var KeepAlive = class _KeepAlive {
    constructor(options = {}) {
      this.log = options.log || new Logger({ mirror: false });
      this.audio = null;
      this.listener = null;
      this.page = null;
    }
    // 静音采样值
    static silentWav(samples) {
      const count = samples || 4e3;
      const bytes = new Uint8Array(44 + count);
      const view = new DataView(bytes.buffer);
      const ascii = (at, text) => {
        for (let i = 0; i < text.length; i++) bytes[at + i] = text.charCodeAt(i);
      };
      ascii(0, "RIFF");
      view.setUint32(4, 36 + count, true);
      ascii(8, "WAVE");
      ascii(12, "fmt ");
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, 1, true);
      view.setUint32(24, 8e3, true);
      view.setUint32(28, 8e3, true);
      view.setUint16(32, 1, true);
      view.setUint16(34, 8, true);
      ascii(36, "data");
      view.setUint32(40, count, true);
      bytes.fill(128, 44);
      return "data:audio/wav;base64," + toBase64(bytes);
    }
    // 起保活
    start(win) {
      if (this.audio) return true;
      const page = win && win.document;
      if (!win || !win.Audio || !page) return false;
      try {
        const audio = new win.Audio(_KeepAlive.silentWav());
        audio.loop = true;
        audio.muted = true;
        this.audio = audio;
        this.page = page;
        this.listener = () => this.sync();
        page.addEventListener("visibilitychange", this.listener);
        this.sync();
        return true;
      } catch (e) {
        this.log.warn("静音保活起不来: " + e.message);
        this.audio = null;
        return false;
      }
    }
    // 仅后台播放
    sync() {
      if (!this.audio) return false;
      const hidden = !!(this.page && this.page.hidden);
      if (hidden) {
        const playing = this.audio.play();
        if (playing && typeof playing.catch === "function") playing.catch(() => {
        });
      } else if (!this.audio.paused) {
        try {
          this.audio.pause();
        } catch (e) {
        }
      }
      return hidden;
    }
    // 停保活
    stop() {
      if (this.audio) {
        try {
          this.audio.pause();
          this.audio.src = "";
        } catch (e) {
        }
      }
      if (this.page && this.listener) {
        try {
          this.page.removeEventListener("visibilitychange", this.listener);
        } catch (e) {
        }
      }
      this.audio = null;
      this.listener = null;
      this.page = null;
    }
  };
  var ForumPoster = class _ForumPoster {
    constructor(options = {}) {
      this.log = options.log || new Logger({ mirror: false });
      this.click = typeof options.click === "function" ? options.click : (node) => {
        try {
          node.click();
          return true;
        } catch (e) {
          return false;
        }
      };
      this.fill = typeof options.fill === "function" ? options.fill : null;
    }
    // 切文案
    static texts(raw) {
      return String(raw == null ? "" : raw).split(/[,，、\n]/).map((item) => item.trim()).filter(Boolean);
    }
    // 发帖
    post(page, options) {
      const config = options || {};
      const list = _ForumPoster.texts(config.texts);
      const text = config.text || (list.length ? list[Math.min(list.length - 1, Math.floor((config.random || Math.random)() * list.length))] : "");
      if (!text) return { action: "no-text", text: "" };
      const visible = FrameProbe.queryAll('textarea, [contenteditable="true"], input[type=text]', page).filter((node) => !node.disabled && !node.readOnly && FrameProbe.visible(node));
      const scoreOf = (node) => {
        const scope = [node.placeholder, node.name, node.id, node.className, node.parentElement && node.parentElement.className, node.parentElement && node.parentElement.textContent].map((value) => TextSanitizer.collapse(String(value == null ? "" : value))).join(" ");
        return /讨论|回复|评论|discuss|comment|reply|forum/i.test(scope) ? 2 : 0;
      };
      const box = visible.slice().sort((a, b) => scoreOf(b) - scoreOf(a)).find((node) => scoreOf(node) > 0) || null;
      if (!box) return { action: "no-box", text };
      const container = box.closest && box.closest("[class*=discuss], [class*=comment], [class*=reply], [class*=publish], form") || page;
      const submitSelector = "button, a, .btn, [class*=submit], [class*=publish]";
      const submitTexts = ["发布", "发表", "提交回复", "回复", "POST"];
      const found = FrameProbe.byText(submitSelector, submitTexts, container);
      const button = found.length ? found[0] : container === page ? null : FrameProbe.byText(submitSelector, submitTexts, page)[0] || null;
      if (!button) return { action: "no-submit", text };
      if (box.isContentEditable) {
        box.textContent = text;
      } else {
        box.value = String(text);
      }
      if (this.fill) {
        this.fill(box, text);
      } else {
        const view = box.ownerDocument && box.ownerDocument.defaultView;
        const EventClass = view && view.Event;
        if (EventClass) ["input", "change"].forEach((type) => {
          try {
            box.dispatchEvent(new EventClass(type, { bubbles: true }));
          } catch (e) {
          }
        });
      }
      const clicked = this.click(button);
      this.log.info(clicked ? "已提交讨论帖：" + text.slice(0, 20) : "讨论发布按钮点不动，请手动提交");
      return { action: clicked ? "posted" : "no-submit", text };
    }
  };
  var HOOK_TOKEN = { json: false, tamper: false };
  var context = null;
  function shareContext(shared) {
    context = shared;
  }
  function syncHooks(settings, log) {
    const config = settings || {};
    if (config.jsonCapture === "all" && !HOOK_TOKEN.json) {
      JsonWatch.install(PAGE_WINDOW);
      HOOK_TOKEN.json = true;
    } else if (config.jsonCapture !== "all" && HOOK_TOKEN.json) {
      JsonWatch.release();
      HOOK_TOKEN.json = false;
    }
    if (config.useResponseTamper && !HOOK_TOKEN.tamper) {
      if (!ResponseTamper.install(PAGE_WINDOW, PlatformRegistry.specs) && log) log.warn("没有站点声明要改写的接口，响应改写未启用");
      else HOOK_TOKEN.tamper = true;
    } else if (!config.useResponseTamper && HOOK_TOKEN.tamper) {
      ResponseTamper.release();
      HOOK_TOKEN.tamper = false;
    }
  }
  var AddonLoop = class _AddonLoop {
    static shared = null;
    constructor(options = {}) {
      this.readSettings = options.settings;
      this.log = options.log || new Logger({ mirror: false });
      this.click = options.click || ((node) => {
        try {
          node.click();
          return true;
        } catch (e) {
          return false;
        }
      });
      this.video = new VideoRate({ log: this.log });
      this.poster = new ForumPoster({ log: this.log, click: this.click });
      this.keeper = null;
      this.timer = null;
      this.posted = false;
      this.rated = false;
    }
    // 当前设置
    settings() {
      return this.readSettings() || {};
    }
    // 常驻定时器
    wanted() {
      const config = this.settings();
      return !!config.useVideoRate || !!config.useForum && !!ForumPoster.texts(config.forumTexts).length && !this.posted;
    }
    // 同步附加能力
    sync(page) {
      const config = this.settings();
      const rate = VideoRate.valid(config.videoRate);
      if (config.useVideoRate && rate) {
        if (!this.rated || this.video.rate !== rate || this.video.keepPlaying !== !!config.videoKeepPlaying) {
          this.rated = this.video.start(page, rate, config.videoKeepPlaying);
          if (this.rated) this.log.info(`视频倍速已开启：${rate}x${config.videoKeepPlaying ? " + 自动续播" : ""}（部分平台会检测速率，被检测请改回 1）`);
        }
      } else if (this.rated) {
        this.video.stop();
        this.rated = false;
      }
      if (config.useForum && !this.posted && ForumPoster.texts(config.forumTexts).length) {
        const done = this.poster.post(page, { texts: config.forumTexts });
        if (done.action === "posted") this.posted = true;
        else if (done.action !== "no-box" && done.action !== "no-text") this.log.warn("讨论帖没发出去：" + done.action);
      }
      return { rated: this.rated, posted: this.posted };
    }
    // 起循环
    start(page, intervalMs) {
      if (this.settings().useKeepAlive) {
        if (!this.keeper) {
          const keeper = new KeepAlive({ log: this.log });
          if (keeper.start(PAGE_WINDOW)) this.keeper = keeper;
          else keeper.stop();
        }
      } else if (this.keeper) {
        this.keeper.stop();
        this.keeper = null;
      }
      if (!this.wanted()) {
        if (this.timer) {
          clearInterval(this.timer);
          this.timer = null;
        }
        if (this.rated) {
          this.video.stop();
          this.rated = false;
        }
        return this;
      }
      this.sync(page);
      if (!this.timer) {
        this.timer = setInterval(() => {
          if (!this.wanted()) this.stop();
          else this.sync(page);
        }, intervalMs || 4e3);
      }
      return this;
    }
    // 停循环
    stop() {
      if (this.timer) clearInterval(this.timer);
      this.timer = null;
      this.video.stop();
      this.rated = false;
    }
    // 全站单例入口
    static obtain(page, options) {
      if (!_AddonLoop.shared) {
        const store = new Store(NAMESPACE);
        _AddonLoop.shared = new _AddonLoop({
          settings: () => context ? context.settings : store.settings(),
          log: context && context.log || new Logger()
        });
      }
      return _AddonLoop.shared.start(page, options && options.intervalMs);
    }
  };

  // Capture.ts
  var NetworkCapture = class _NetworkCapture {
    constructor(spec, context2) {
      this.log = context2.log;
      this.settings = context2.settings;
      this.captures = spec && spec.capture ? Array.isArray(spec.capture) ? spec.capture : [spec.capture] : [];
      this.records = [];
      this.batch = [];
      this.keys = /* @__PURE__ */ new Map();
      this.cursor = 0;
      this.installed = null;
      this.restore = null;
    }
    // 路径逐项下钻
    static pluck(payload, path) {
      const segments = String(path || "").split(".").filter(Boolean);
      let bags = [payload];
      for (const raw of segments) {
        const expand = raw.endsWith("[]");
        const key = expand ? raw.slice(0, -2) : raw;
        const next = [];
        for (const bag of bags) {
          const value = bag == null ? void 0 : bag[key];
          if (value == null) continue;
          if (expand) {
            if (Array.isArray(value)) next.push(...value);
            continue;
          }
          next.push(value);
        }
        bags = next;
        if (!bags.length) return expand ? [] : void 0;
      }
      return bags.length === 1 ? bags[0] : bags;
    }
    // 字段抽取规则（支持数组轮替、字符串路径与对象规则）
    static resolveField(item, rule) {
      if (rule == null) return void 0;
      if (Array.isArray(rule)) {
        for (const alt of rule) {
          const value = _NetworkCapture.resolveField(item, alt);
          if (value !== void 0) return value;
        }
        return void 0;
      }
      if (typeof rule === "string") return _NetworkCapture.pluck(item, rule);
      try {
        let list = _NetworkCapture.pluck(item, rule.from);
        if (list == null) return void 0;
        if (rule.json && typeof list === "string") list = JSON.parse(list);
        list = Array.isArray(list) ? list : [list];
        if (rule.where) {
          const key = rule.where[0];
          const want = rule.where[1];
          list = list.filter((entry) => entry && String(entry[key]) === String(want));
        }
        const values = rule.each ? list.map((entry) => _NetworkCapture.pluck(entry, rule.each)).filter((value) => value != null && value !== "") : list;
        const mapped = rule.map ? values.map((value) => {
          const hit = rule.map[String(value == null ? "" : value).trim()];
          return hit === void 0 ? value : hit;
        }) : values;
        if (rule.split && mapped.length === 1 && typeof mapped[0] === "string") {
          return mapped[0].split(rule.split).map((part) => part.trim()).filter(Boolean);
        }
        return mapped;
      } catch (e) {
        return void 0;
      }
    }
    // 形态是否启用
    usable(entry) {
      const level = this.settings.jsonCapture || "off";
      if (level === "off") return false;
      const source = entry && entry.source || "xhr";
      return level === "all" || source === "xhr";
    }
    // 批对最近回包
    ingest(payload) {
      const capture = this.captures.find((entry) => {
        if (!this.usable(entry)) return false;
        if (!payload || typeof payload !== "object") return false;
        return (entry.shape || []).every((path) => _NetworkCapture.pluck(payload, path.replace(/\[\]$/, "")) !== void 0);
      });
      if (!capture) return 0;
      let list = _NetworkCapture.pluck(payload, capture.list);
      if (capture.listJson) {
        let decoded = list;
        for (let i = 0; i < 2 && typeof decoded === "string"; i += 1) {
          try {
            decoded = JSON.parse(decoded);
          } catch (e) {
            return 0;
          }
        }
        list = capture.listJson === true || capture.listJson === "true" ? decoded : _NetworkCapture.pluck(decoded, capture.listJson);
      }
      const items = Array.isArray(list) ? list : list ? [list] : [];
      if (!items.length) return 0;
      const entries = [];
      if (!capture.children) {
        items.forEach((item) => entries.push({ item, parent: null }));
      } else {
        items.forEach((item) => {
          const kids = _NetworkCapture.pluck(item, capture.children);
          const children = Array.isArray(kids) ? kids.filter(Boolean) : [];
          if (children.length) children.forEach((kid) => entries.push({ item: kid, parent: item }));
          else entries.push({ item, parent: null });
        });
      }
      const parsed = entries.map(({ item, parent }) => {
        const record = {};
        for (const key of Object.keys(capture.fields)) {
          let value = _NetworkCapture.resolveField(item, capture.fields[key]);
          if (value === void 0 && parent) value = _NetworkCapture.resolveField(parent, capture.fields[key]);
          if (value === void 0) continue;
          record[key] = value;
        }
        if (Array.isArray(record.options)) record.options = record.options.map((option) => String(option == null ? "" : option).trim()).filter(Boolean);
        if (record.answer != null && !Array.isArray(record.answer)) record.answer = [String(record.answer)];
        return record;
      });
      const batch = [];
      let fresh = 0;
      parsed.forEach((record) => {
        if (capture.answerIndex) {
          const rule = capture.answerIndex;
          const options = record[rule.options || "options"];
          if (Array.isArray(options) && options.length && Array.isArray(record.answer)) {
            const base = rule.base || 0;
            record.answer = record.answer.map((item) => {
              const text = String(item == null ? "" : item).trim();
              if (!/^\d+$/.test(text)) return item;
              const at = Number(text) - base;
              return options[at] == null ? item : String(options[at]);
            });
          }
        }
        const key = String(record.id || record.qid || "") + "|" + TextSanitizer.key(record.question || "");
        const known = this.keys.get(key);
        if (known) {
          if (!known.answer && record.answer) known.answer = record.answer;
          batch.push(known);
          return;
        }
        this.keys.set(key, record);
        this.records.push(record);
        batch.push(record);
        fresh += 1;
      });
      this.batch = batch;
      if (!this.noticed && fresh) {
        this.noticed = true;
        this.log.info("已拦截站点接口数据 " + this.records.length + " 题（按 id 优先匹配题面）");
      }
      return fresh;
    }
    // id 优先命中
    match(question) {
      if (!this.records.length) return null;
      if (question.id) {
        const byId = this.records.find((record) => String(record.id) === String(question.id) || String(record.qid) === String(question.id));
        if (byId) return byId;
      }
      if (question.cardIndex != null && this.batch[question.cardIndex]) return this.batch[question.cardIndex];
      return this.batch[question.index] || null;
    }
    // 装钩
    install() {
      const usable = this.captures.filter((entry) => this.usable(entry));
      if (!HAS_DOM || !usable.length) return false;
      if (this.installed) return true;
      const self = this;
      const win = PAGE_WINDOW;
      if (usable.some((entry) => entry.source === "xhr")) {
        const Raw = win.XMLHttpRequest;
        if (!Raw) return false;
        const rawSend = Raw.prototype.send;
        const rawOpen = Raw.prototype.open;
        Raw.prototype.open = function(method, url, ...rest) {
          this.__autoquizUrl = String(url || "");
          return rawOpen.call(this, method, url, ...rest);
        };
        Raw.prototype.send = function(...args) {
          const markers = usable.map((entry) => entry.marker).filter(Boolean);
          this.addEventListener("load", function() {
            try {
              const text = this.responseText;
              if (!text || markers.length && !markers.some((marker) => text.includes(marker))) return;
              self.ingest(JSON.parse(text));
            } catch (e) {
            }
          });
          return rawSend.apply(this, args);
        };
        this.installed = "xhr";
        this.restore = () => {
          Raw.prototype.send = rawSend;
          Raw.prototype.open = rawOpen;
        };
      }
      if (usable.some((entry) => entry.source === "jsonparse")) {
        JsonWatch.install(win);
        JsonWatch.subscribe(this);
        this.drain();
        this.installed = this.installed || "jsonparse";
        const previous = this.restore;
        this.restore = () => {
          if (previous) previous();
          JsonWatch.unsubscribe(this);
          JsonWatch.release();
        };
        this.log.warn("已启用全局 JSON.parse 拦截（介意改全局请设为 xhr 或关闭）");
      }
      return true;
    }
    // 回捞历史回包
    drain() {
      const fresh = JsonWatch.since(this.cursor);
      this.cursor = JsonWatch.length();
      fresh.forEach((payload) => {
        try {
          this.ingest(payload);
        } catch (e) {
        }
      });
      return fresh.length;
    }
    // 卸钩还原全局
    uninstall() {
      if (this.restore) this.restore();
      this.restore = null;
      this.installed = null;
    }
  };

  // Solve.ts
  var Question = class {
    constructor(fields) {
      this.index = fields.index;
      this.id = fields.id || null;
      this.cardIndex = fields.cardIndex == null ? null : fields.cardIndex;
      this.type = fields.type || QuestionType.UNKNOWN;
      this.stem = fields.stem || "";
      this.options = fields.options || [];
      this.blanks = fields.blanks || [];
      this.slots = fields.slots || [];
      this.rawType = fields.rawType || "";
      this.pageAnswer = fields.pageAnswer || "";
      this.root = fields.root || null;
      this.doc = fields.doc || null;
      this.win = fields.win || null;
      this.ocrText = fields.ocrText || "";
    }
    // 选项文本表
    get optionTexts() {
      return this.options.map((option) => option.text);
    }
    // 图片题取识图文本
    get plainStem() {
      return String(this.stem == null ? "" : this.stem).replace(/<img[^>]*>/gi, " ").trim();
    }
    // 填空槽数
    get blankCount() {
      return this.type === QuestionType.COMPLETION ? Math.max(1, this.blanks.length) : 0;
    }
    // 槽候选拼行
    get slotTexts() {
      return this.slots.map((slot) => slot.choices.map((choice) => choice.text || choice.value).join(" / "));
    }
    // 缓存键
    get cacheKey() {
      return TextSanitizer.key(this.stem);
    }
    // 答案源请求上下文
    get env() {
      const numeric = String(this.rawType || "").match(/\d+/);
      const texts = this.optionTexts;
      return {
        type: this.type,
        title: this.stem,
        options: this.type === QuestionType.COMPLETION ? "" : this.type === QuestionType.MATCH ? this.slotTexts.join("\n") : texts.join("\n"),
        optionTexts: texts,
        id: this.id || "",
        index: this.index,
        blankCount: this.blankCount,
        slotCount: this.type === QuestionType.MATCH ? Math.max(1, this.slots.length) : 0,
        typeCode: numeric ? Number(numeric[0]) : { single: 0, multiple: 1, completion: 2, judgement: 3, match: 11 }[this.type],
        qid: this.captured && this.captured.qid || this.id || "",
        optionsId: this.captured && this.captured.optionsId || "",
        adapterType: { single: 0, multiple: 1, completion: 3, judgement: 4 }[this.type]
      };
    }
    // 调试标签
    label() {
      return `第${this.index + 1}题[${this.type}${this.id ? "#" + this.id : ""}] ${this.stem.slice(0, 24)}`;
    }
  };
  var DEFAULT_SEPARATORS = ["===", "###", "#", "---", "|", ";", "；", "\n"];
  var AnswerResolver = class _AnswerResolver {
    static JUDGE_TRUE = new Set(["正确", "是", "对", "T", "true", "right", "yes", "A", "1", "ri", "对的", "是正确的"].map(TextSanitizer.normalize));
    static JUDGE_FALSE = new Set(["错误", "不是", "否", "错", "X", "F", "false", "wrong", "no", "B", "0", "wr", "错的", "不正确"].map(TextSanitizer.normalize));
    static GRAMS = /* @__PURE__ */ new Map();
    // 逐字集合缓存
    static grams(text) {
      const cache = _AnswerResolver.GRAMS;
      const known = cache.get(text);
      if (known) return known;
      const set = /* @__PURE__ */ new Set();
      for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
      if (cache.size > 4e3) cache.clear();
      cache.set(text, set);
      return set;
    }
    // 二元组相似度
    static bigramScore(a, b) {
      const s = TextSanitizer.normalize(a);
      const t = TextSanitizer.normalize(b);
      if (s === t) return 1;
      if (!s || !t) return 0;
      if (s.length < 2 || t.length < 2) return 0;
      const sSet = _AnswerResolver.grams(s);
      const tSet = _AnswerResolver.grams(t);
      let intersection = 0;
      for (const gram of sSet) if (tSet.has(gram)) intersection += 1;
      return 2 * intersection / (sSet.size + tSet.size);
    }
    // 编辑距离相似度
    static levenshteinScore(a, b) {
      const s = TextSanitizer.normalize(a);
      const t = TextSanitizer.normalize(b);
      if (!s.length || !t.length) return 0;
      let prev = new Array(t.length + 1);
      let curr = new Array(t.length + 1);
      for (let j = 0; j <= t.length; j++) prev[j] = j;
      for (let i = 1; i <= s.length; i++) {
        curr[0] = i;
        for (let j = 1; j <= t.length; j++) {
          curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + (s[i - 1] === t[j - 1] ? 0 : 1));
        }
        const swap = prev;
        prev = curr;
        curr = swap;
      }
      return 1 - prev[t.length] / Math.max(s.length, t.length);
    }
    // 综合相似度（二元组近满分开编辑距离可跳过）
    static similarity(a, b) {
      const score = _AnswerResolver.bigramScore(a, b);
      return score >= 0.98 ? score : Math.max(score, _AnswerResolver.levenshteinScore(a, b) * 0.98);
    }
    // 压平成字符串
    static flatten(answers) {
      const out = [];
      for (const item of answers || []) {
        if (Array.isArray(item)) item.forEach((v) => out.push(String(v == null ? "" : v).trim()));
        else if (item != null) out.push(String(item).trim());
      }
      return unique(out.filter(Boolean));
    }
    // 切答案（代码答案不切分号）
    static splitAnswer(text, separators, blankCount) {
      const raw = String(text == null ? "" : text).trim();
      if (!raw) return [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
      } catch (e) {
      }
      let program = false;
      {
        const signals = ["#include", "int main", "void main", "System.out", "printf(", "scanf(", "public class", "static void", "function(", "def ", "return "];
        let hits = 0;
        for (const token of signals) if (raw.includes(token)) hits += 1;
        if (/[{};]\s*$/.test(raw) && /[(=)]/.test(raw)) hits += 1;
        program = hits >= 2;
      }
      const list = (separators || DEFAULT_SEPARATORS).filter((separator) => !(program && [";", "；", "|"].includes(separator)));
      let fallback = null;
      for (const separator of list) {
        if (!raw.includes(separator)) continue;
        const parts = raw.split(separator).map((p) => String(p).trim()).filter(Boolean);
        if (parts.length < 2) continue;
        if (!blankCount || parts.length === blankCount) return parts;
        if (!fallback) fallback = parts;
      }
      return fallback || [raw];
    }
    // 字母集合答案
    static extractLetters(text) {
      const raw = String(text == null ? "" : text).trim();
      if (!raw || !/^[A-Ha-h](?:[\s,,、;；.．|/()（）]*[A-Ha-h])*$/.test(raw)) return [];
      const codes = Array.from(raw.replace(/[^A-Ha-h]/g, "").toUpperCase()).map((ch) => ch.charCodeAt(0));
      if (codes.length > 1) {
        const ascending = codes.every((code, i) => i === 0 || code > codes[i - 1]);
        const separated = /[,、;；|/\s.．]/.test(raw);
        if (!ascending && !separated) return [];
      }
      return unique(codes.map((code) => code - 65)).filter((i) => i >= 0 && i < 8).sort((a, b) => a - b);
    }
    // 选项两种形态
    static optionText(option) {
      if (option == null) return "";
      return typeof option === "string" ? option : String(option.text == null ? "" : option.text);
    }
    // 选项归一文本
    static optionTexts(options) {
      return (options || []).map((option) => TextSanitizer.normalize(_AnswerResolver.optionText(option)));
    }
    // 字母转下标
    static letterIndex(flatAnswers, options) {
      for (const one of flatAnswers) {
        const indices = _AnswerResolver.extractLetters(one).filter((i) => i < options.length);
        if (indices.length === 1) return indices[0];
      }
      return null;
    }
    // 判极性
    static polarity(text) {
      const symbols = {
        "√": "true",
        "✓": "true",
        "对": "true",
        "正确": "true",
        "是": "true",
        "×": "false",
        "✗": "false",
        "✘": "false",
        "╳": "false",
        "错": "false",
        "错误": "false",
        "否": "false"
      };
      const raw = String(text == null ? "" : text).trim().toLowerCase().replace(/\s+/g, "");
      if (!raw) return null;
      if (symbols[raw]) return symbols[raw];
      const normalized = TextSanitizer.normalize(TextSanitizer.stripPrefix(raw));
      if (!normalized) return null;
      if (_AnswerResolver.JUDGE_FALSE.has(normalized)) return "false";
      if (_AnswerResolver.JUDGE_TRUE.has(normalized)) return "true";
      if (/^(?:错误|不对|不正确|有误|误|false|no)/.test(normalized)) return "false";
      if (/^(?:正确|是对的|对|是|true|yes)/.test(normalized)) return "true";
      return null;
    }
    // 先剥字母前缀
    static optionPolarities(options) {
      return (options || []).map((option) => _AnswerResolver.polarity(_AnswerResolver.optionText(option)));
    }
    // 两极性位兜底
    static judgeIndices(options) {
      const polarities = _AnswerResolver.optionPolarities(options);
      const trueAt = polarities.findIndex((p) => p === "true");
      const falseAt = polarities.findIndex((p) => p === "false");
      if (trueAt >= 0 && falseAt >= 0) return { trueAt, falseAt };
      const other = (known) => options.findIndex((_, i) => i !== known);
      if (trueAt >= 0) return { trueAt, falseAt: other(trueAt) };
      if (falseAt >= 0) return { falseAt, trueAt: other(falseAt) };
      if (options.length >= 2) return { trueAt: 0, falseAt: 1, guessed: true };
      return null;
    }
    // 判断题
    static resolveJudgement(answers, options, context2) {
      const map = _AnswerResolver.judgeIndices(options);
      if (!map) return { finish: false, reason: "no-options" };
      const flat = _AnswerResolver.flatten(answers);
      if (!flat.length) return { finish: false, reason: "empty" };
      let polarity = _AnswerResolver.polarity(flat.join(",")) || null;
      if (!polarity) {
        for (const one of flat) {
          const direct = _AnswerResolver.polarity(one);
          if (direct) {
            polarity = direct;
            break;
          }
        }
      }
      if (!polarity) {
        for (const one of flat) {
          if (_AnswerResolver.similarity(one, "正确") > 0.6 || _AnswerResolver.similarity(one, "对") > 0.7) {
            polarity = "true";
            break;
          }
          if (_AnswerResolver.similarity(one, "错误") > 0.6 || _AnswerResolver.similarity(one, "错") > 0.7) {
            polarity = "false";
            break;
          }
        }
      }
      if (!polarity) {
        const index2 = _AnswerResolver.letterIndex(flat, options);
        if (index2 !== null) polarity = index2 === map.trueAt ? "true" : index2 === map.falseAt ? "false" : null;
      }
      if (!polarity) return { finish: false, reason: "unknown-polarity" };
      const index = polarity === "true" ? map.trueAt : map.falseAt;
      if (index < 0) return { finish: false, reason: "missing-target-option" };
      return {
        finish: true,
        indices: [index],
        texts: [_AnswerResolver.optionText(options[index])],
        polarity,
        matched: map.guessed ? "guessed-order" : "polarity",
        guessed: !!map.guessed
      };
    }
    // 单选题
    static resolveSingle(answers, options, context2) {
      const settings = context2 || {};
      const threshold = settings.singleThreshold == null ? 0.65 : settings.singleThreshold;
      const flat = _AnswerResolver.flatten(answers);
      if (!flat.length || !options.length) return { finish: false, reason: "empty" };
      const normalizedTexts = _AnswerResolver.optionTexts(options);
      const wanted = flat.map((answer) => ({ answer, normalized: TextSanitizer.normalize(answer) })).filter((entry) => entry.normalized);
      for (const entry of wanted) {
        const exact = normalizedTexts.indexOf(entry.normalized);
        if (exact >= 0) return { finish: true, indices: [exact], texts: [_AnswerResolver.optionText(options[exact])], matched: "exact" };
      }
      for (const entry of wanted) {
        if (entry.normalized.length < 2) continue;
        const hits = [];
        normalizedTexts.forEach((option, i) => {
          if (!option || option.length < 2) return;
          if (option.includes(entry.normalized) || entry.normalized.includes(option)) hits.push(i);
        });
        if (hits.length === 1) return { finish: true, indices: hits, texts: [_AnswerResolver.optionText(options[hits[0]])], matched: "contains" };
      }
      let bestIndex = -1;
      let bestScore = 0;
      normalizedTexts.forEach((option, position) => {
        if (!option) return;
        flat.forEach((answer) => {
          const score = _AnswerResolver.similarity(option, answer);
          if (score > bestScore) {
            bestScore = score;
            bestIndex = position;
          }
        });
      });
      if (bestIndex >= 0 && bestScore > threshold) {
        return { finish: true, indices: [bestIndex], texts: [_AnswerResolver.optionText(options[bestIndex])], matched: "similarity", score: bestScore };
      }
      const letter = _AnswerResolver.letterIndex(flat, options);
      if (letter !== null) return { finish: true, indices: [letter], texts: [_AnswerResolver.optionText(options[letter])], matched: "letter" };
      const merged = flat.join("");
      if (merged.length > 1) {
        const mergedNormalized = TextSanitizer.normalize(merged);
        const mergedIndex = normalizedTexts.findIndex((option) => option && (option === mergedNormalized || option.includes(mergedNormalized)));
        if (mergedIndex >= 0) return { finish: true, indices: [mergedIndex], texts: [_AnswerResolver.optionText(options[mergedIndex])], matched: "merged" };
      }
      return { finish: false, reason: "no-match", bestScore };
    }
    // 多选两表择优
    static resolveMultiple(answers, options, context2) {
      const settings = context2 || {};
      const threshold = settings.multipleThreshold == null ? 0.6 : settings.multipleThreshold;
      const flat = _AnswerResolver.flatten(answers);
      if (!flat.length || !options.length) return { finish: false, reason: "empty" };
      const normalizedTexts = _AnswerResolver.optionTexts(options);
      const normalized = /* @__PURE__ */ new Map();
      const rating = /* @__PURE__ */ new Map();
      flat.forEach((answer) => {
        const normalizedAnswer = TextSanitizer.normalize(answer);
        if (!normalizedAnswer) return;
        normalizedTexts.forEach((option, i) => {
          if (!option) return;
          let level = 0;
          if (option === normalizedAnswer) level = 1;
          else if (option.length > 1 && (normalizedAnswer.includes(option) || option.includes(normalizedAnswer))) level = 0.8;
          if (level > (normalized.get(i) || 0)) normalized.set(i, level);
          const score = _AnswerResolver.similarity(option, answer);
          if (score > threshold && score > (rating.get(i) || 0)) rating.set(i, score);
        });
      });
      const letters = /* @__PURE__ */ new Map();
      flat.forEach((answer) => _AnswerResolver.extractLetters(answer).forEach((i) => i < options.length && letters.set(i, 1)));
      const groups = [{ map: normalized, kind: "normalized" }, { map: rating, kind: "rating" }];
      if (letters.size) groups.push({ map: letters, kind: "letter" });
      const scored = groups.map((group) => {
        let sum = 0;
        group.map.forEach((value) => sum += value);
        return { indices: Array.from(group.map.keys()).sort((a, b) => a - b), sum, kind: group.kind };
      }).filter((entry) => entry.indices.length).sort((a, b) => b.indices.length * 100 + b.sum - (a.indices.length * 100 + a.sum));
      if (!scored.length) return { finish: false, reason: "no-match" };
      const kept = unique(scored[0].indices).slice();
      for (let guard = 0; guard < 24 && kept.length > 1; guard++) {
        let dropped = false;
        for (let a = 0; a < kept.length && !dropped; a++) {
          for (let b = a + 1; b < kept.length; b++) {
            const score = _AnswerResolver.similarity(normalizedTexts[kept[a]] || "", normalizedTexts[kept[b]] || "");
            if (score > (threshold || 0.6)) {
              const longer = (normalizedTexts[kept[a]] || "").length >= (normalizedTexts[kept[b]] || "").length ? a : b;
              kept.splice(longer, 1);
              dropped = true;
              break;
            }
          }
        }
        if (!dropped) break;
      }
      const chosen = kept.sort((a, b) => a - b);
      if (!chosen.length) return { finish: false, reason: "消歧后无剩余选项" };
      return {
        finish: true,
        indices: chosen,
        texts: chosen.map((i) => _AnswerResolver.optionText(options[i])),
        matched: scored[0].kind
      };
    }
    // 填空题
    static resolveCompletion(answers, options, context2) {
      const settings = context2 || {};
      const separators = settings.answerSeparators || DEFAULT_SEPARATORS;
      const blankCount = Math.max(1, context2 && context2.blankCount || (options || []).length || 1);
      const groups = [];
      for (const item of answers || []) {
        const parts = (Array.isArray(item) ? item : [item]).map((v) => String(v == null ? "" : v).trim()).filter(Boolean);
        if (!parts.length) continue;
        groups.push(parts.length === 1 ? _AnswerResolver.splitAnswer(parts[0], separators, blankCount) : parts);
      }
      for (const parts of groups) {
        if (parts.length === blankCount) return { finish: true, texts: parts.slice(), blanks: parts.slice(), matched: "exact-blanks" };
      }
      for (const parts of groups) {
        if (blankCount === 1) {
          const joined = parts.join(settings.joinBlanks || " ");
          return { finish: true, texts: [joined], blanks: [joined], matched: "single-blank" };
        }
        if (parts.length > blankCount) {
          const cut = parts.slice(0, blankCount);
          return { finish: true, texts: cut, blanks: cut, matched: "truncated" };
        }
        if (parts.length > 1) {
          const padded = parts.concat(new Array(blankCount - parts.length).fill(""));
          return { finish: true, texts: padded, blanks: padded, matched: "padded", partial: true };
        }
      }
      return { finish: false, reason: "blank-count-mismatch", blankCount };
    }
    // 槽位段数要对齐
    static resolveMatch(answers, slots, context2) {
      if (!slots || !slots.length) return { finish: false, reason: "no-slots" };
      const settings = context2 || {};
      const separators = settings.answerSeparators || DEFAULT_SEPARATORS;
      const threshold = settings.singleThreshold == null ? 0.65 : settings.singleThreshold;
      const groups = [];
      for (const item of answers || []) {
        const raw = Array.isArray(item) ? item : [item];
        const parts = (raw.length === 1 ? _AnswerResolver.splitAnswer(String(raw[0] == null ? "" : raw[0]), separators, slots.length) : raw.map((value) => String(value == null ? "" : value).trim())).map((value) => String(value == null ? "" : value).trim()).filter(Boolean);
        if (parts.length !== slots.length) continue;
        const decision = [];
        let score = 0;
        let ok = true;
        for (let index = 0; index < slots.length; index++) {
          const value = String(parts[index] == null ? "" : parts[index]).trim();
          const choices = slots[index].choices;
          let choice = null;
          if (value && choices && choices.length) {
            const normalized = TextSanitizer.normalize(value);
            const bare = normalized.replace(/^[a-z]?[).、]/, "");
            const byValue = choices.find((candidate) => TextSanitizer.normalize(candidate.value) === normalized);
            if (byValue) {
              choice = Object.assign({}, byValue, { score: 1, via: "value" });
            } else {
              let best = null;
              choices.forEach((candidate) => {
                const text = String(candidate.text || "");
                const rating = Math.max(
                  _AnswerResolver.similarity(value, text),
                  _AnswerResolver.similarity(bare, text),
                  _AnswerResolver.similarity(bare, TextSanitizer.stripPrefix(text))
                );
                if (!best || rating > best.score) best = { choice: candidate, score: rating };
              });
              if (best && best.score >= threshold) choice = Object.assign({}, best.choice, { score: best.score, via: "text" });
            }
            if (!choice) {
              const letter = /^[a-z]$/i.test(value) ? value.toUpperCase().charCodeAt(0) - 65 : -1;
              const byLetter = letter >= 0 && letter < choices.length ? choices[letter] : null;
              if (byLetter) choice = Object.assign({}, byLetter, { score: threshold, via: "letter" });
            }
          }
          if (!choice) {
            ok = false;
            break;
          }
          score += choice.score;
          decision.push({ slot: index, choice: choice.index, value: choice.value, text: choice.text, via: choice.via });
        }
        if (!ok) continue;
        groups.push({
          finish: true,
          slots: decision,
          texts: decision.map((entry) => entry.text || entry.value),
          matched: decision.some((entry) => entry.via === "text") ? "slot-text" : "slot",
          score: score / decision.length
        });
      }
      if (!groups.length) return { finish: false, reason: "slot-count-mismatch", slotCount: slots.length };
      groups.sort((a, b) => b.score - a.score);
      return groups[0];
    }
    // 单题型入口：先逐源裁决，再跨源投票
    static resolveFor(type, candidates, options, context2) {
      const list = (candidates || []).slice().sort((a, b) => (a.priority || 0) - (b.priority || 0));
      const successes = [];
      for (const candidate of list) {
        const answers = candidate.answers == null ? [] : [candidate.answers];
        let result;
        if (type === QuestionType.JUDGEMENT) result = _AnswerResolver.resolveJudgement(answers, options, context2);
        else if (type === QuestionType.MULTIPLE) result = _AnswerResolver.resolveMultiple(answers, options, context2);
        else if (type === QuestionType.COMPLETION) result = _AnswerResolver.resolveCompletion(answers, options, context2);
        else if (type === QuestionType.MATCH) result = _AnswerResolver.resolveMatch(answers, context2 && context2.slots || [], context2);
        else if (type === QuestionType.SINGLE) result = _AnswerResolver.resolveSingle(answers, options, context2);
        else result = { finish: false, reason: "unsupported-type" };
        if (result && result.finish) successes.push(Object.assign({ from: candidate.from, answers: answers[0] || [] }, result));
      }
      if (!successes.length) return { finish: false, reason: "no-candidate-matched", tried: list.length };
      if (successes.length === 1) return successes[0];
      if (type === QuestionType.MULTIPLE) return successes.slice().sort((a, b) => b.indices.length - a.indices.length)[0];
      if (type === QuestionType.COMPLETION) return successes.find((entry) => !entry.partial) || successes[0];
      if (type === QuestionType.MATCH) return successes.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
      const buckets = /* @__PURE__ */ new Map();
      successes.forEach((entry, order) => {
        const key = (entry.indices || []).join(",");
        if (!buckets.has(key)) buckets.set(key, { entry, order, votes: 0 });
        buckets.get(key).votes += 1;
      });
      let winner = null;
      for (const bucket of buckets.values()) {
        if (!winner || bucket.votes > winner.votes || bucket.votes === winner.votes && bucket.order < winner.order) winner = bucket;
      }
      return winner ? winner.entry : successes[0];
    }
  };
  var AnswerWriter = class _AnswerWriter {
    constructor(spec, context2) {
      this.spec = spec;
      this.settings = context2.settings;
      this.log = context2.log;
    }
    // 取 window
    viewOf(node) {
      if (node && node.ownerDocument && node.ownerDocument.defaultView) return node.ownerDocument.defaultView;
      return PAGE_WINDOW;
    }
    // 选中态探测
    isSelected(node) {
      if (!node) return false;
      const write = this.spec.write || {};
      const extra = (write.checked || []).concat((write.selectedClass || []).map((name) => "." + name));
      for (const selector of extra) {
        try {
          if (node.querySelector && node.querySelector(selector)) return true;
          if (node.matches && node.matches(selector)) return true;
        } catch (e) {
        }
      }
      try {
        if (node.checked === true) return true;
        if (node.getAttribute && node.getAttribute("aria-checked") === "true") return true;
        if (node.querySelector && node.querySelector('input:checked,[aria-checked="true"]')) return true;
      } catch (e) {
        return true;
      }
      if (_AnswerWriter.isChosen(node, write.selectedClass)) return true;
      if (node.className && typeof node.className === "string") {
        if (/(^|[\s-])(is-checked|checked|selected|active)([\s-]|$)/i.test(node.className)) return true;
      }
      return false;
    }
    // 点一下：事件绑在 spec.write.target 内层
    click(node) {
      let target = node;
      const selector = (this.spec.write || {}).target;
      if (selector) {
        const inner = FrameProbe.queryAll(selector, node);
        if (inner.length) target = inner[0];
      }
      const view = this.viewOf(target);
      if (this.settings.usePointerChain && target.getBoundingClientRect) {
        const bounds = target.getBoundingClientRect();
        const props = {
          bubbles: true,
          cancelable: true,
          view,
          clientX: bounds.left + bounds.width / 2,
          clientY: bounds.top + bounds.height / 2,
          pointerId: 1,
          pointerType: "mouse",
          isPrimary: true,
          button: 0,
          buttons: 1
        };
        try {
          target.dispatchEvent(new view.PointerEvent("pointerdown", props));
          target.dispatchEvent(new view.MouseEvent("mousedown", props));
          target.dispatchEvent(new view.PointerEvent("pointerup", props));
          target.dispatchEvent(new view.MouseEvent("mouseup", props));
          target.dispatchEvent(new view.MouseEvent("click", props));
          return true;
        } catch (e) {
          this.log.warn(`指针事件链失败，回退 click(): ${e.message}`);
        }
      }
      try {
        target.click();
        return true;
      } catch (e) {
        this.log.warn(`click() 失败: ${e.message}`);
        return false;
      }
    }
    // 写值
    writeValue(node, text) {
      const view = this.viewOf(node);
      const tag = String(node.tagName || "").toUpperCase();
      if (tag === "IFRAME") {
        try {
          const body = node.contentDocument && node.contentDocument.body;
          if (body) {
            body.innerHTML = "<p>" + _AnswerWriter.escapeHtml(text) + "</p>";
            return true;
          }
        } catch (e) {
          this.log.warn(`富文本 iframe 写入失败: ${e.message}`);
        }
        return false;
      }
      if (tag === "TEXTAREA" || tag === "INPUT") {
        const name = tag === "TEXTAREA" ? "HTMLTextAreaElement" : "HTMLInputElement";
        const proto = view && view[name] ? view[name].prototype : null;
        const descriptor = proto && view.Object ? view.Object.getOwnPropertyDescriptor(proto, "value") : null;
        if (descriptor && descriptor.set) descriptor.set.call(node, text);
        else node.value = text;
        _AnswerWriter.dispatchInput(view, node, ["input", "change", "blur"]);
        return true;
      }
      if (node.isContentEditable || node.getAttribute && node.getAttribute("contenteditable") === "true") {
        node.innerHTML = "<p>" + _AnswerWriter.escapeHtml(text) + "</p>";
        _AnswerWriter.dispatchInput(view, node, ["input", "change"]);
        return true;
      }
      node.textContent = text;
      _AnswerWriter.dispatchInput(view, node, ["input"]);
      return true;
    }
    // 派发输入事件
    static dispatchInput(view, node, types) {
      for (const type of types) {
        try {
          node.dispatchEvent(new view.Event(type, { bubbles: true }));
        } catch (e) {
          try {
            const event = node.ownerDocument.createEvent("HTMLEvents");
            event.initEvent(type, true, true);
            node.dispatchEvent(event);
          } catch (e2) {
          }
        }
      }
    }
    // 转义 HTML
    static escapeHtml(text) {
      return String(text == null ? "" : text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
    // 四种富文本宿主
    writeEditor(question, slot, text) {
      const node = slot.node;
      const name = !node ? "" : node.getAttribute ? node.getAttribute("id") || node.getAttribute("name") || node.getAttribute("data-name") || "" : node.id || node.name || "";
      const win = question.win || PAGE_WINDOW;
      if (node.ckeditorInstance && node.ckeditorInstance.data) {
        node.ckeditorInstance.data.set(text);
        return true;
      }
      if (name && win) {
        if (win.UE && win.UE.getEditor) {
          const editor = win.UE.getEditor(name);
          if (editor && typeof editor.setContent === "function") {
            editor.setContent(text);
            return true;
          }
        }
        if (win.CKEDITOR && win.CKEDITOR.instances) {
          const instance = win.CKEDITOR.instances[name] || win.CKEDITOR.instances[name.replace(/^cke_/, "")];
          if (instance && typeof instance.setData === "function") {
            instance.setData(text);
            return true;
          }
        }
        if (win.KindEditor && win.KindEditor.instances) {
          const instance = win.KindEditor.instances[slot.index];
          if (instance && typeof instance.html === "function") {
            instance.html(text);
            return true;
          }
        }
      }
      if (node.classList && node.classList.contains && node.classList.contains("vditor-reset")) {
        node.innerHTML = '<p data-block="0">' + _AnswerWriter.escapeHtml(text) + "</p>";
        _AnswerWriter.dispatchInput(this.viewOf(node), node, ["input"]);
        return true;
      }
      return false;
    }
    // 槽位写入三形态
    async writeSlots(question, result, report) {
      const write = this.spec.write || {};
      const slots = question.slots || [];
      for (const decision of result.slots || []) {
        const slot = slots[decision.slot];
        const choice = slot && slot.choices ? slot.choices[decision.choice] : null;
        if (!choice || !choice.node) {
          report.failed += 1;
          report.detail.push({ slot: decision.slot, ok: false, why: "no-choice" });
          continue;
        }
        let chosen = false;
        if (choice.node.selected === true) chosen = true;
        else {
          try {
            if (choice.node.getAttribute && choice.node.getAttribute("aria-selected") === "true") chosen = true;
          } catch (e) {
          }
          if (!chosen) chosen = _AnswerWriter.isChosen(choice.node);
        }
        if (chosen) {
          report.skipped += 1;
          report.detail.push({ slot: decision.slot, ok: true, skipped: true });
          continue;
        }
        let ok;
        const selectNode = String(slot.node && slot.node.tagName || "").toUpperCase() === "SELECT" ? slot.node : null;
        if (selectNode || String(choice.node.tagName || "").toUpperCase() === "OPTION") {
          const select = selectNode || choice.node.parentElement;
          if (!select) {
            ok = false;
          } else {
            try {
              const list = select.options && select.options.length ? Array.from(select.options) : FrameProbe.queryAll("option", select);
              list.forEach((option) => {
                const target = option === choice.node;
                if (option.selected !== target) option.selected = target;
                if (target) option.setAttribute("selected", "selected");
                else if (option.removeAttribute) option.removeAttribute("selected");
              });
              select.value = choice.value;
              _AnswerWriter.dispatchInput(this.viewOf(slot.node), select, ["change", "input"]);
              ok = true;
            } catch (e) {
              ok = false;
            }
          }
          if (ok && write.matchDisplay && slot.node.parentElement) {
            const display = FrameProbe.queryAll(write.matchDisplay, slot.node.parentElement)[0] || null;
            if (display) display.textContent = choice.text || choice.value;
          }
        } else {
          const inner = FrameProbe.queryAll("a", choice.node)[0];
          this.click(inner || choice.node);
          ok = true;
        }
        report.detail.push({ slot: decision.slot, value: choice.value, text: choice.text, ok });
        if (ok) report.written += 1;
        else report.failed += 1;
        await jitter(this.settings.optionDelay);
      }
      const save = write.blankSaveButton;
      if (save && report.written) {
        FrameProbe.queryAll(save, question.root).forEach((button) => this.click(button));
      }
      return report;
    }
    // 选中类名表
    static isChosen(node, extra) {
      const list = node && node.classList;
      if (!list || !list.contains) return false;
      return ["checked", "is-checked", "active", "selected", "current", "answer-right"].concat(extra || []).some((hint) => list.contains(hint));
    }
    // 落盘作答
    async apply(question, result) {
      const report = { written: 0, skipped: 0, failed: 0, detail: [] };
      if (!result || !result.finish && !result.forced) return report;
      if (question.type === QuestionType.COMPLETION) {
        const texts = result.texts || [];
        const slots = question.blanks.length ? question.blanks : question.options;
        const count = Math.min(texts.length, slots.length);
        for (let i = 0; i < count; i++) {
          const text = String(texts[i] == null ? "" : texts[i]);
          if (!text) {
            report.skipped += 1;
            continue;
          }
          let ok = this.writeEditor(question, slots[i], text);
          if (!ok) ok = this.writeValue(slots[i].node, text);
          report.detail.push({ index: i, text, ok });
          if (ok) report.written += 1;
          else report.failed += 1;
          await jitter(this.settings.optionDelay);
        }
        const blankSave = (this.spec.write || {}).blankSaveButton;
        if (blankSave && report.written) {
          const buttons = FrameProbe.queryAll(blankSave, question.root);
          buttons.forEach((button) => this.click(button));
        }
        return report;
      }
      if (question.type === QuestionType.MATCH) return this.writeSlots(question, result, report);
      const wanted = new Set(result.indices || []);
      const options = question.options;
      for (let i = 0; i < options.length; i++) {
        const want = wanted.has(i);
        if (!want && question.type !== QuestionType.MULTIPLE) continue;
        const node = options[i].node || options[i];
        const before = this.isSelected(node);
        let action = "noop";
        let state = before;
        if (before !== want) {
          this.click(node);
          await jitter(this.settings.optionDelay);
          state = this.isSelected(node);
          action = want ? "check" : "uncheck";
        }
        report.detail.push({ index: i, want, action, state });
        if (action === "noop") report.skipped += 1;
        else if (state === want) report.written += 1;
        else report.failed += 1;
      }
      return report;
    }
  };
  var AnswerSource = class {
    constructor(context2) {
      this.context = context2 || {};
      const meta = this.constructor;
      this.name = meta.NAME || "source";
      this.priority = meta.PRIORITY == null ? 5 : meta.PRIORITY;
      this.timeoutMs = meta.TIMEOUT || 8e3;
      this.shortCircuit = !!meta.SHORT_CIRCUIT;
    }
    // 设置
    get settings() {
      return this.context.settings;
    }
    // 存储
    get store() {
      return this.context.store;
    }
    // 日志
    get log() {
      return this.context.log;
    }
    // 是否启用
    enabled() {
      return false;
    }
    // 取答案
    async fetch(_question) {
      return [];
    }
    // 分层：本地命中即短路 / 兜底源只在允许时参与
    tier() {
      if (this.shortCircuit) return "local";
      return !!this.constructor.FALLBACK ? "fallback" : "primary";
    }
  };
  var AnswerHub = class {
    constructor() {
      this.sources = [];
    }
    // 登记源
    register(source) {
      this.sources.push(source);
      this.sources.sort((a, b) => a.priority - b.priority);
      return this;
    }
    // 本地命中才短路
    async fetch(question, allowFallback) {
      const enabled = this.sources.filter((source) => {
        try {
          return source.enabled();
        } catch (e) {
          return false;
        }
      });
      const runOne = async (source) => {
        const outcome = await withTimeout(Promise.resolve().then(() => source.fetch(question)), source.timeoutMs, source.name);
        return { source, outcome };
      };
      const candidates = [];
      const collect = (item) => {
        if (!item.outcome.ok) return 0;
        const groups = Array.isArray(item.outcome.value) ? item.outcome.value : [];
        let added = 0;
        for (const answers of groups) {
          const normalized = (Array.isArray(answers) ? answers : [answers]).map((v) => String(v)).filter((v) => v.length);
          if (!normalized.length) continue;
          candidates.push({ answers: normalized, from: item.source.name, priority: item.source.priority });
          added += 1;
        }
        return added;
      };
      const remote = [];
      for (const source of enabled) {
        const tier = source.tier();
        if (tier === "local") {
          if (collect(await runOne(source))) return { candidates };
          continue;
        }
        if (tier === "primary" || allowFallback) remote.push(source);
      }
      (await Promise.all(remote.map(runOne))).forEach(collect);
      candidates.sort((a, b) => a.priority - b.priority);
      return { candidates };
    }
  };
  var CaptureSource = class _CaptureSource extends AnswerSource {
    static NAME = "captured";
    static PRIORITY = -2;
    static TIMEOUT = 50;
    static SHORT_CIRCUIT = true;
    // 是否启用
    enabled() {
      return !!this.context.capture && !!this.context.capture.installed;
    }
    // 字母先翻文本
    static expandLetters(answer, options) {
      if (!Array.isArray(options) || options.length < 2) return answer;
      return answer.map((item) => {
        const text = String(item == null ? "" : item).trim();
        if (!/^[A-Za-z]$/.test(text)) return item;
        const at = text.toUpperCase().charCodeAt(0) - 65;
        return at >= 0 && options[at] ? String(options[at]) : item;
      });
    }
    // 取答案
    async fetch(question) {
      const record = this.context.capture.match(question);
      if (!record) return [];
      const answer = record.answer;
      if (!answer) return [];
      return [_CaptureSource.expandLetters(answer.map((item) => String(item)), record.options)];
    }
  };
  var PageSource = class extends AnswerSource {
    static NAME = "page";
    static PRIORITY = -1;
    static TIMEOUT = 100;
    static SHORT_CIRCUIT = true;
    // 是否启用
    enabled() {
      return !!this.settings.usePageAnswer;
    }
    // 取页面答案
    async fetch(question) {
      const raw = String(question.pageAnswer == null ? "" : question.pageAnswer).replace(/^(?:参考答案|正确答案|标准答案|答案)\s*[:：]\s*/, "").trim();
      if (!raw) return [];
      const normalized = question.type === QuestionType.COMPLETION || question.type === QuestionType.MATCH ? raw.replace(/\s*[，,、]\s*/g, "===") : raw;
      return [[normalized]];
    }
  };
  var CacheSource = class extends AnswerSource {
    static NAME = "cache";
    static PRIORITY = 0;
    static TIMEOUT = 500;
    static SHORT_CIRCUIT = true;
    // 是否启用
    enabled() {
      return !!this.settings.useCache;
    }
    // 取答案
    async fetch(question) {
      const list = this.store.cacheList();
      if (!list.length) return [];
      const exact = list.filter((entry) => entry && entry.key === question.cacheKey && Array.isArray(entry.answer) && entry.answer.length);
      if (exact.length) return exact.slice(0, 3).map((entry) => entry.answer);
      const scored = [];
      const threshold = this.settings.cacheFuzzyThreshold || 0;
      const want = TextSanitizer.normalize(question.stem);
      for (const entry of list) {
        if (!entry || !entry.stem || !Array.isArray(entry.answer) || !entry.answer.length) continue;
        const have = TextSanitizer.normalize(entry.stem);
        if (2 * Math.min(have.length, want.length) / (have.length + want.length) < threshold) continue;
        const score = AnswerResolver.bigramScore(entry.stem, question.stem);
        if (score >= threshold) scored.push({ score, answer: entry.answer });
      }
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 3).map((entry) => entry.answer);
    }
  };
  var BankSource = class _BankSource extends AnswerSource {
    static NAME = "tiku";
    static PRIORITY = 1;
    static TIMEOUT = 9e3;
    constructor(context2) {
      super(context2);
      const raw = context2.settings.tikuEndpoints;
      const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_ENDPOINTS;
      this.endpoints = list.filter((endpoint) => endpoint && endpoint.url && endpoint.enabled !== false);
    }
    // 是否启用
    enabled() {
      return !!this.settings.useTiku && this.endpoints.length > 0;
    }
    // 整串保留原类型
    static renderValue(value, context2) {
      if (Array.isArray(value)) return value.map((item) => _BankSource.renderValue(item, context2));
      if (value && typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value)) out[key] = _BankSource.renderValue(value[key], context2);
        return out;
      }
      if (typeof value !== "string") return value;
      const whole = value.match(/^\$\{(\w+)\}$/);
      if (whole) return context2[whole[1]];
      return value.replace(/\$\{(\w+)\}/g, (_, name) => context2[name] == null ? "" : String(context2[name]));
    }
    // 收三种回包形态
    static toCandidates(value, endpoint) {
      const join = endpoint.blankJoin || "#";
      const groups = [];
      const add = (item) => {
        if (item == null) return;
        if (typeof item === "string") {
          const text2 = item.trim();
          if (text2 && (text2[0] === "[" || text2[0] === "{")) {
            try {
              const parsed = JSON.parse(text2);
              if (parsed && typeof parsed === "object") {
                add(parsed);
                return;
              }
            } catch (e) {
            }
          }
        }
        if (Array.isArray(item)) {
          const inner = item.map((v) => v && typeof v === "object" ? JSON.stringify(v) : String(v == null ? "" : v).trim()).filter(Boolean);
          if (inner.length) groups.push(inner);
          return;
        }
        if (typeof item === "object") {
          add(item.answer != null ? item.answer : item.content != null ? item.content : item.value);
          return;
        }
        const text = String(item).trim();
        if (!text) return;
        const parts = text.split(join).map((part) => part.trim()).filter(Boolean);
        groups.push(parts.length > 1 ? parts : [text]);
      };
      if (Array.isArray(value)) value.forEach(add);
      else add(value);
      const seen = /* @__PURE__ */ new Set();
      return groups.filter((group) => {
        const fingerprint = JSON.stringify(group);
        if (seen.has(fingerprint)) return false;
        seen.add(fingerprint);
        return true;
      }).slice(0, 5);
    }
    // 拼请求
    buildRequest(endpoint, context2) {
      const method = String(endpoint.method || "post").toLowerCase();
      const contentType = endpoint.contentType || "json";
      let url = _BankSource.renderValue(endpoint.url, context2);
      const data = _BankSource.renderValue(endpoint.data || {}, context2);
      const headers = Object.assign({}, _BankSource.renderValue(endpoint.headers || {}, context2));
      let body;
      if (method === "get") {
        const query = Object.keys(data).filter((key) => data[key] != null).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(String(data[key]))).join("&");
        if (query) url += (url.includes("?") ? "&" : "?") + query;
      } else if (contentType === "form") {
        headers["Content-Type"] = headers["Content-Type"] || "application/x-www-form-urlencoded";
        body = Object.keys(data).filter((key) => data[key] != null).map((key) => encodeURIComponent(key) + "=" + encodeURIComponent(String(typeof data[key] === "object" ? JSON.stringify(data[key]) : data[key]))).join("&");
      } else {
        headers["Content-Type"] = headers["Content-Type"] || "application/json;charset=utf-8";
        body = JSON.stringify(data);
      }
      return { method, url, headers, body };
    }
    // 并发问题库
    async fetch(question) {
      const context2 = Object.assign({}, question.env, { token: this.settings.tikuToken || "", version: VERSION });
      const settled = await Promise.all(
        this.endpoints.map(async (endpoint) => {
          try {
            const request = this.buildRequest(endpoint, context2);
            const response = await Http.request({
              method: request.method,
              url: request.url,
              headers: request.headers,
              data: request.body,
              timeout: endpoint.timeoutMs || this.settings.searchTimeoutMs
            });
            return _BankSource.toCandidates(NetworkCapture.pluck(response.data, endpoint.resultPath), endpoint);
          } catch (e) {
            this.log.warn(`题库[${endpoint.name || endpoint.url}]请求失败: ${e.message}`);
            return [];
          }
        })
      );
      return settled.flat();
    }
  };
  var ModelSource = class extends AnswerSource {
    static NAME = "ai";
    static PRIORITY = 3;
    static TIMEOUT = 22e3;
    static FALLBACK = true;
    constructor(context2) {
      super(context2);
      const raw = context2.settings.aiEndpoints;
      let list = raw;
      if (!Array.isArray(list) || !list.length) {
        list = context2.settings.aiBaseUrl ? [{ name: context2.settings.aiModel || "AI", baseUrl: context2.settings.aiBaseUrl, apiKey: context2.settings.aiApiKey || "", model: context2.settings.aiModel || "", enabled: true }] : [];
      }
      this.endpoints = list.filter((item) => item && item.baseUrl && item.model && item.enabled !== false);
    }
    // 是否启用
    enabled() {
      return !!this.settings.useAi && this.endpoints.length > 0;
    }
    // 问端点并只取 A: 之后
    async fetch(question) {
      const systemPrompt = [
        "你是答题引擎。只输出答案，不要解释、不要 Markdown、不要复述题干。",
        "规则：",
        "单选题只输出一个选项字母，例如 A；",
        "多选题输出全部正确选项字母并连写，例如 AC，不加空格与标点；",
        "判断题只输出 对 或 错；",
        "填空题按空序输出，多个空之间用 === 分隔；",
        "答案文字要尽量与选项原文一致；",
        "完全无法判断时输出 ?"
      ].join("\n");
      const typeName = { single: "单选", multiple: "多选", judgement: "判断", completion: "填空", match: "连线/选词填空", unknown: "未知" };
      const lines = ["#" + (question.index + 1) + " [" + typeName[question.type] + "]"];
      if (question.type === QuestionType.COMPLETION) {
        lines.push("空数：" + Math.max(1, question.blankCount));
      } else if (question.type === QuestionType.MATCH) {
        lines.push("槽位候选：");
        (question.slotTexts || []).forEach((text, index) => {
          lines.push("槽" + (index + 1) + ": " + text);
        });
      } else {
        lines.push("选项：");
        (question.options || []).forEach((option, index) => {
          lines.push(String.fromCharCode(65 + index) + ". " + (option.text || ""));
        });
      }
      const prompt = lines.join("\n") + "\n\n题干：" + question.stem;
      const answers = [];
      for (const endpoint of this.endpoints) {
        try {
          const body = {
            model: endpoint.model,
            temperature: endpoint.temperature == null ? 0 : endpoint.temperature,
            stream: false,
            messages: [
              { role: "system", content: endpoint.system || systemPrompt },
              { role: "user", content: prompt }
            ]
          };
          const headers = { "Content-Type": "application/json;charset=utf-8" };
          if (endpoint.apiKey) headers.Authorization = "Bearer " + endpoint.apiKey;
          const base = String(endpoint.baseUrl).replace(/\/+$/, "");
          const response = await Http.request({
            method: "post",
            url: /\/chat\/completions$/.test(base) ? base : base + "/chat/completions",
            headers,
            data: JSON.stringify(body),
            timeout: endpoint.timeoutMs || this.settings.aiTimeoutMs || 2e4
          });
          const payload = response.data || {};
          const message = payload.choices && payload.choices[0] && (payload.choices[0].message || payload.choices[0].delta) || {};
          const text = typeof message.content === "string" ? message.content : "";
          if (!text) throw new Error("模型返回空内容");
          const raw = String(text).replace(/```[\w-]*\n?/g, "").trim();
          let answer = "";
          if (raw) {
            const match = raw.match(/^\s*(?:#\d+\s*\S*\s*\n+)?[AＡ][：:]\s*(.+?)[。.\s]*$/m);
            const candidate = (match ? match[1] : raw).trim();
            if (candidate && !/^\?$/.test(candidate) && !/^(不知道|无法确定|无法判断)[？?]?$/.test(candidate)) answer = candidate;
          }
          if (answer) {
            answers.push([answer]);
            break;
          }
        } catch (e) {
          this.log.warn(`AI[${endpoint.name || endpoint.model}]失败: ${e.message}`);
        }
      }
      if (!answers.length) this.log.warn("AI 未给出可用答案（模型回 ? 或内容为空）");
      return answers;
    }
  };
  var QuestionScanner = class _QuestionScanner {
    static TYPE_LABELS = Object.keys(TYPE_LABELS).map((label) => ({ lower: label.toLowerCase(), label, type: TYPE_LABELS[label] })).sort((a, b) => b.label.length - a.label.length);
    constructor(spec, log) {
      this.spec = spec;
      this.log = log || new Logger({ mirror: false });
    }
    // 切分规则按串缓存
    splitRules(patterns, label) {
      if (!this.splitRe) this.splitRe = /* @__PURE__ */ new Map();
      const cache = this.splitRe;
      if (cache.has(patterns)) return cache.get(patterns);
      const list = (Array.isArray(patterns) ? patterns : [patterns]).map((pattern) => {
        try {
          return { re: new RegExp(pattern, "g"), head: new RegExp("^(?:" + pattern + ")") };
        } catch (e) {
          this.log.warn(label + "规则不是合法正则: " + pattern);
          return null;
        }
      });
      if (cache.size > 200) cache.clear();
      cache.set(patterns, list);
      return list;
    }
    // 题型数字原码
    readType(root, config) {
      if (!config.typeInput) return "";
      const input = FrameProbe.scoped(root, config.typeInput) || (typeof config.typeInput === "string" && root.parentElement ? FrameProbe.queryAll(config.typeInput, root.parentElement)[0] || null : null);
      if (!input) return "";
      const attribute = config.typeAttribute || "value";
      return String(input.getAttribute && input.getAttribute(attribute) || (attribute === "value" ? input.value : "") || (input.textContent || "").trim());
    }
    // 标签转归一题型
    parseLabel(raw) {
      const codes = this.spec.typeCodes || {};
      const cleaned = TextSanitizer.collapse(String(raw == null ? "" : raw)).replace(/[【】()（）[\]．.、,，]/g, "");
      if (!cleaned) return null;
      const numeric = /^\d+$/.test(cleaned) ? codes[cleaned] : null;
      if (numeric) return numeric;
      const direct = codes[cleaned] || TYPE_LABELS[cleaned] || TYPE_LABELS[cleaned.toLowerCase()];
      if (direct) return direct;
      const lower = cleaned.toLowerCase();
      for (const entry of _QuestionScanner.TYPE_LABELS) {
        if (lower.includes(entry.lower)) return codes[entry.label] || entry.type;
      }
      return null;
    }
    // 题型判定优先级（末位按结构推断；raw 由调用方传入避免重复读 DOM）
    detectType(root, config, options, stem, slots, raw) {
      const codes = this.spec.typeCodes || {};
      if (raw) {
        const numeric = raw.match(/\d+/);
        const byCode = numeric ? codes[numeric[0]] : null;
        if (byCode) return byCode;
        const fromLabel = this.parseLabel(raw);
        if (fromLabel) return fromLabel;
      }
      if (config.typeText) {
        const fromLabel = this.parseLabel(FrameProbe.scopedText(root, config.typeText));
        if (fromLabel) return fromLabel;
      }
      const stemLabel = String(stem || "").match(/^\s*[【\[]\s*([^\]】]{1,6}题)/);
      if (stemLabel && TYPE_LABELS[stemLabel[1]]) return TYPE_LABELS[stemLabel[1]];
      const checkboxes = FrameProbe.queryAll('input[type="checkbox"]', root);
      if (checkboxes.length) return QuestionType.MULTIPLE;
      const radios = FrameProbe.queryAll('input[type="radio"]', root);
      if (radios.length === 2) return QuestionType.JUDGEMENT;
      if (radios.length > 2) return QuestionType.SINGLE;
      const textareas = FrameProbe.queryAll("textarea", root);
      if (!textareas.length && (slots || []).length >= 2) return QuestionType.MATCH;
      if (textareas.length) return QuestionType.COMPLETION;
      if (options.length === 2) {
        const polarities = AnswerResolver.optionPolarities(options.map((option) => option.text));
        if (polarities.indexOf("true") >= 0 && polarities.indexOf("false") >= 0) return QuestionType.JUDGEMENT;
      }
      return QuestionType.UNKNOWN;
    }
    // 整串选项切开
    splitOptions(root, options, config) {
      if (!config.optionsSplit || options.length !== 1) return options;
      const source = options[0].text;
      let parts = [];
      for (const rule of this.splitRules(config.optionsSplit, "选项切分")) {
        if (!rule) continue;
        const head = rule.head.test(String(source).trim());
        const pieces = String(source).split(rule.re);
        parts = pieces.slice(head ? 1 : 0).map((part) => String(part).trim()).filter(Boolean);
        if (parts.length > 1) break;
      }
      if (parts.length < 2) return options;
      const targets = config.clickables ? FrameProbe.queryAll(config.clickables, root) : [];
      if (targets.length && targets.length !== parts.length) return options;
      return parts.map((text, i) => ({
        index: i,
        letter: String.fromCharCode(65 + i),
        node: targets.length ? targets[i] : options[0].node,
        textNode: options[0].textNode,
        text: TextSanitizer.stripPrefix(text),
        value: ""
      }));
    }
    // 单容器采集
    build(root, index) {
      const config = this.spec.question || {};
      let rawType = this.readType(root, config);
      let view = config;
      if (config.optionsByType) {
        const keys = [];
        if (rawType) {
          const digits = String(rawType).match(/\d+/);
          if (digits) keys.push(digits[0]);
          keys.push(TextSanitizer.collapse(rawType));
        }
        const label = TextSanitizer.collapse(FrameProbe.scopedText(root, config.typeText));
        if (label) {
          keys.push(label);
          const typed = this.parseLabel(label);
          if (typed) keys.push(typed);
        }
        for (const key of keys) {
          const override = config.optionsByType[key];
          if (override) {
            view = Object.assign({}, config, override);
            break;
          }
        }
      }
      const stemNode = FrameProbe.scoped(root, view.stem) || root;
      if (stemNode && stemNode.querySelectorAll) {
        stemNode.querySelectorAll("img").forEach((img) => {
          const parent = img.parentElement;
          if (!parent || parent.querySelector("span[data-autoquiz-img]")) return;
          const source = img.src || img.getAttribute("data-src") || img.getAttribute("original") || "";
          if (!source || /blankspace\d*\.gif/i.test(source)) return;
          const span = document.createElement("span");
          span.setAttribute("data-autoquiz-img", "1");
          span.style.cssText = "font-size:0;width:0;height:0;overflow:hidden;display:inline-block";
          span.textContent = ' <img src="' + source + '"> ';
          img.after(span);
        });
      }
      let stem = TextSanitizer.nodeText(stemNode).replace(/^\s*[(（]\s*\d{1,2}\s*[)）]\s*/, "").replace(/^\s*第\s*\d+\s*题\s*[).、．:：]?\s*/i, "").replace(/^\s*[【\[]\s*[^\]】]{0,8}题\s*[】\]]\s*/, "").replace(/^\s*[(（]\s*\d+(?:\.\d+)?\s*分\s*[)）]\s*/, "").replace(/^\s*[[(【（]\s*(?:单选|多选|判断|填空|简答|计算|名词解释|论述|问答|案例分析|完形填空|阅读理解)\s*题?\s*[)\]】）]\s*/, "").replace(/[[(【（](?:单选题|多选题|判断题|填空题|简答|名词解释|完形填空|阅读理解)[)\]】）]/g, "").replace(/[(（]\s*\d+(?:\.\d+)?\s*分\s*[)）]/g, "").replace(/^\s*\d+\s*[。、.．,，]\s*/, "");
      const blockWords = this.spec.noise && this.spec.noise.stemBlock;
      if (Array.isArray(blockWords) && blockWords.length) {
        const pattern = new RegExp("(" + blockWords.filter(Boolean).map((word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
        stem = stem.replace(pattern, "");
      }
      stem = stem.replace(/^[\s.。,，、;；:：]+/, "").trim();
      let nodes = FrameProbe.queryAll(view.options, root);
      if (view.optionItem && nodes.length === 1) {
        const inner = FrameProbe.queryAll(view.optionItem, nodes[0]);
        if (inner.length > 1) nodes = inner;
      }
      const clickables = view.clickables ? FrameProbe.queryAll(view.clickables, root) : [];
      const parallel = clickables.length > 0 && clickables.length === nodes.length;
      const options = this.splitOptions(root, nodes.map((node, i) => {
        const target = parallel ? clickables[i] : node;
        return {
          index: i,
          letter: String.fromCharCode(65 + i),
          node: target,
          textNode: node,
          text: TextSanitizer.option(node),
          value: target.getAttribute ? target.getAttribute("value") || target.getAttribute("data-value") || "" : ""
        };
      }), view);
      const blanks = view.blanks ? FrameProbe.queryAll(view.blanks, root).map((node, i) => ({ index: i, node })) : [];
      const slots = [];
      if (view.matchSlots) {
        const itemSelector = view.matchItems || "[data]";
        const keyAttribute = view.matchKey || "data";
        FrameProbe.queryAll(view.matchSlots, root).forEach((node) => {
          const choices = FrameProbe.queryAll(itemSelector, node).map((choice, order) => {
            const named = choice.getAttribute ? choice.getAttribute(keyAttribute) : null;
            const valued = choice.getAttribute ? choice.getAttribute("value") : null;
            return {
              index: order,
              node: choice,
              value: named != null && String(named) !== "" ? String(named) : valued != null && String(valued) !== "" ? String(valued) : String(choice.value == null ? "" : choice.value),
              text: TextSanitizer.option(choice).trim()
            };
          }).filter((choice) => choice.value !== "" || choice.text);
          if (choices.length < 2) return;
          slots.push({ index: slots.length, node, choices });
        });
      }
      if (!stem && !options.length && !slots.length) return null;
      let split = null;
      if (config.stemSplit && stem) {
        const rule = this.splitRules(config.stemSplit, "题干切分")[0];
        if (rule) {
          const parts = String(stem).split(rule.re).map((part) => String(part).trim()).filter(Boolean);
          if (parts.length >= 2 && parts.length === options.length + 1) split = { stem: parts[0], optionTexts: parts.slice(1) };
        }
      }
      let finalStem = split ? split.stem : stem;
      if (config.stemNumber || config.stemExtra) {
        let scope = root;
        while (scope && scope.parentElement) scope = scope.parentElement;
        if (scope && scope.querySelectorAll) {
          let prefix = "";
          if (config.stemNumber) {
            const items = FrameProbe.queryAll(config.stemNumber.items, scope);
            const at = items.findIndex((node) => node.matches && node.matches(config.stemNumber.current));
            if (at >= 0) prefix += String(config.stemNumber.label || "【第${n}题】").replace(/\$\{n\}/g, String(at + 1));
          }
          if (config.stemExtra) {
            const extra = FrameProbe.queryAll(config.stemExtra, scope)[0] || null;
            if (extra) prefix += TextSanitizer.nodeText(extra).trim();
          }
          if (prefix) finalStem = prefix + finalStem;
        }
      }
      const finalOptions = split ? options.map((option, i) => Object.assign({}, option, { text: split.optionTexts[i] })) : options;
      if (view !== config) rawType = this.readType(root, view);
      const type = this.detectType(root, view, finalOptions, finalStem, slots, rawType);
      const finalType = type === QuestionType.MATCH && !slots.length ? QuestionType.COMPLETION : type;
      let id = null;
      if (config.idFrom) {
        const holder = FrameProbe.queryAll(config.idFrom, root)[0] || null;
        if (holder) {
          const raw = holder.getAttribute && (holder.getAttribute("name") || holder.getAttribute("id") || holder.getAttribute("value")) || holder.value || "";
          const match = String(raw).match(new RegExp(config.idPattern || "(\\d+)"));
          id = match ? match[1] : String(raw) || String(index);
        }
      }
      let cardIndex = null;
      if (config.indexFrom && root.getAttribute) {
        const digits = String(root.getAttribute(config.indexFrom) || "").match(/\d+/);
        cardIndex = digits ? Number(digits[0]) : null;
      }
      let pageAnswer = "";
      if (view.answer) {
        const answerAttributes = ["data-answer", "data-answers", "aria-label", "title"];
        pageAnswer = FrameProbe.queryAll(view.answer, root).map((node) => (node.value || "").trim() || TextSanitizer.nodeText(node).trim() || TextSanitizer.pickAttribute(node, answerAttributes)).filter(Boolean).join(" ");
      }
      let judged = finalOptions;
      if (finalType === QuestionType.JUDGEMENT) {
        const words = view.judgementOptions;
        if (words && words.length === 2 && AnswerResolver.optionPolarities(judged.map((option) => option.text)).indexOf("true") < 0) {
          const labelNodes = judged.length === 2 ? judged.map((option) => option.node || option.textNode) : view.clickables ? FrameProbe.queryAll(view.clickables, root) : [];
          if (labelNodes.length === 2 && labelNodes.every((node) => !!node)) {
            judged = labelNodes.map((node, i) => ({ index: i, letter: String.fromCharCode(65 + i), node, textNode: node, text: words[i], value: "" }));
          }
        }
        const icon = (this.spec.write || {}).judgementRightIcon;
        if (icon && judged.length === 2) {
          const polarities = AnswerResolver.optionPolarities(judged.map((option) => option.text));
          if (polarities.indexOf("true") < 0 && polarities.indexOf("false") < 0) {
            const hasIcon = judged.map((option) => {
              const scope = option.node || option.textNode;
              if (!scope) return false;
              try {
                return scope.querySelector && !!scope.querySelector(icon) || scope.matches && scope.matches(icon);
              } catch (e) {
                return false;
              }
            });
            if (hasIcon[0] !== hasIcon[1]) {
              judged = judged.map((option, position) => Object.assign({}, option, { text: option.text + (hasIcon[position] ? " √" : " ×") }));
            }
          }
        }
      }
      return new Question({
        index,
        id,
        cardIndex,
        type: finalType,
        stem: finalStem,
        options: judged,
        blanks,
        slots,
        rawType,
        pageAnswer,
        root,
        doc: null,
        win: null
      });
    }
    // 扫全部题卡
    scan() {
      const spec = this.spec;
      const rootSelector = (spec.question || {}).root;
      const follow = !!(spec.iframe && spec.iframe.follow);
      const ownDocument = typeof document !== "undefined" ? document : null;
      const scopes = follow ? FrameProbe.documents(PAGE_WINDOW, spec.iframe.depth == null ? 3 : spec.iframe.depth) : [{ win: PAGE_WINDOW, doc: ownDocument }];
      let best = { doc: null, win: null, nodes: [] };
      for (const entry of scopes) {
        if (!entry.doc) continue;
        const nodes = FrameProbe.queryAll(rootSelector, entry.doc);
        if (nodes.length > best.nodes.length) best = { doc: entry.doc, win: entry.win, nodes };
      }
      if (!best.doc || !best.nodes.length) return { questions: [], doc: null, win: null };
      const questions = [];
      best.nodes.forEach((root, index) => {
        try {
          const question = this.build(root, index);
          if (question) {
            question.doc = best.doc;
            question.win = best.win;
            questions.push(question);
          }
        } catch (e) {
          this.log.warn(`第${index + 1}题采集失败: ${e.message}`);
        }
      });
      return { questions, doc: best.doc, win: best.win };
    }
  };

  // Image.ts
  var FontDecoder = class _FontDecoder {
    static tables = /* @__PURE__ */ new Map();
    constructor(spec, context2) {
      this.spec = spec;
      this.log = context2 && context2.log || null;
      this.mapCache = /* @__PURE__ */ new Map();
      this.observer = null;
      this.tablePromise = null;
    }
    // 字体 spec
    get fontSpec() {
      return this.spec.font || null;
    }
    // 解析字体
    static parseFont(buffer) {
      const readU16 = (at) => buffer[at] << 8 | buffer[at + 1];
      const readS16 = (at) => {
        const value = readU16(at);
        return value & 32768 ? value - 65536 : value;
      };
      const readU32 = (at) => (buffer[at] << 24 | buffer[at + 1] << 16 | buffer[at + 2] << 8 | buffer[at + 3]) >>> 0;
      const numTables = readU16(4);
      let cursor = 12;
      const tables = {};
      for (let i = 0; i < numTables; i++) {
        const tag = String.fromCharCode(buffer[cursor], buffer[cursor + 1], buffer[cursor + 2], buffer[cursor + 3]);
        tables[tag] = { off: readU32(cursor + 8), len: readU32(cursor + 12) };
        cursor += 16;
      }
      if (!tables.glyf || !tables.loca || !tables.maxp || !tables.head || !tables.cmap) return null;
      const numGlyphs = readU16(tables.maxp.off + 4);
      const longLoca = readS16(tables.head.off + 50) !== 0;
      const loca = [];
      const locaBase = tables.loca.off;
      for (let i = 0; i <= numGlyphs; i++) loca.push(longLoca ? readU32(locaBase + i * 4) : readU16(locaBase + i * 2) * 2);
      const cmapBase = tables.cmap.off;
      const subtables = readU16(cmapBase + 2);
      let format4 = -1;
      for (let i = 0; i < subtables; i++) {
        const offset = readU32(cmapBase + 4 + i * 8 + 4);
        if (readU16(cmapBase + offset) === 4) {
          format4 = cmapBase + offset;
          break;
        }
      }
      const map = {};
      if (format4 >= 0) {
        const segX2 = readU16(format4 + 6);
        const segCount = segX2 / 2;
        const endOff = format4 + 14;
        const startOff = endOff + segX2 + 2;
        const deltaOff = startOff + segX2;
        const rangeOff = deltaOff + segX2;
        for (let s = 0; s < segCount; s++) {
          const endCode = readU16(endOff + s * 2);
          const startCode = readU16(startOff + s * 2);
          const delta = readU16(deltaOff + s * 2);
          const range = readU16(rangeOff + s * 2);
          if (startCode === 65535) continue;
          for (let ch = startCode; ch <= endCode; ch++) {
            let glyph;
            if (range === 0) {
              glyph = ch + delta & 65535;
            } else {
              const raw = readU16(rangeOff + s * 2 + range + (ch - startCode) * 2);
              glyph = raw === 0 ? 0 : raw + delta & 65535;
            }
            if (glyph) map[ch] = glyph;
          }
        }
      }
      return { buffer, readU16, readS16, tables, loca, numGlyphs, map };
    }
    // 读字形轮廓
    static parseGlyf(font, glyphIndex) {
      const { buffer, readU16, readS16, tables, loca } = font;
      if (loca[glyphIndex] === loca[glyphIndex + 1]) return null;
      let cursor = tables.glyf.off + loca[glyphIndex];
      const glyph = { contours: readS16(cursor) };
      cursor += 2;
      glyph.xMin = readS16(cursor);
      cursor += 2;
      glyph.yMin = readS16(cursor);
      cursor += 2;
      glyph.xMax = readS16(cursor);
      cursor += 2;
      glyph.yMax = readS16(cursor);
      cursor += 2;
      if (glyph.xMin >= glyph.xMax || glyph.yMin >= glyph.yMax) return null;
      if (glyph.contours > 0) {
        glyph.ends = [];
        for (let i = 0; i < glyph.contours; i++) {
          glyph.ends.push(readU16(cursor));
          cursor += 2;
        }
        const instructionLength = readU16(cursor);
        cursor += 2;
        if (buffer.length - cursor < instructionLength) return null;
        cursor += instructionLength;
        const pointCount = glyph.ends[glyph.contours - 1] + 1;
        glyph.flags = [];
        for (let i = 0; i < pointCount; i++) {
          const flag = buffer[cursor++];
          glyph.flags.push(flag);
          if (flag & 8) {
            let repeat = buffer[cursor++];
            while (repeat-- > 0) {
              glyph.flags.push(flag);
              i += 1;
            }
          }
        }
        glyph.xs = _FontDecoder.readDeltas(font, glyph, pointCount, cursor, true);
        cursor = glyph.afterX;
        glyph.ys = _FontDecoder.readDeltas(font, glyph, pointCount, cursor, false);
        let x = 0;
        let y = 0;
        for (let i = 0; i < pointCount; i++) {
          x += glyph.xs[i];
          y += glyph.ys[i];
          glyph.xs[i] = x;
          glyph.ys[i] = y;
        }
      } else {
        glyph.parts = [];
        let flags;
        do {
          flags = readU16(cursor);
          cursor += 2;
          const part = { m: { a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, glyphIndex: readU16(cursor) };
          cursor += 2;
          let first;
          let second;
          if (flags & 1) {
            first = readS16(cursor);
            cursor += 2;
            second = readS16(cursor);
            cursor += 2;
          } else {
            first = buffer[cursor] << 24 >> 24;
            cursor += 1;
            second = buffer[cursor] << 24 >> 24;
            cursor += 1;
          }
          if (flags & 2) {
            part.m.tx = first;
            part.m.ty = second;
          }
          const scaled = (offset) => readS16(offset) / 16384;
          if (flags & 8) {
            part.m.a = part.m.d = scaled(cursor);
            cursor += 2;
          } else if (flags & 64) {
            part.m.a = scaled(cursor);
            cursor += 2;
            part.m.d = scaled(cursor);
            cursor += 2;
          } else if (flags & 128) {
            part.m.a = scaled(cursor);
            cursor += 2;
            part.m.b = scaled(cursor);
            cursor += 2;
            part.m.c = scaled(cursor);
            cursor += 2;
            part.m.d = scaled(cursor);
            cursor += 2;
          }
          glyph.parts.push(part);
        } while (flags & 32);
      }
      return glyph;
    }
    // 坐标增量位
    static readDeltas(font, glyph, count, start, isX) {
      const { buffer, readS16 } = font;
      const out = [];
      let cursor = start;
      for (let i = 0; i < count; i++) {
        const flag = glyph.flags[i];
        const singleByte = isX ? (flag & 2) !== 0 : (flag & 4) !== 0;
        const sameOrZero = isX ? (flag & 16) !== 0 : (flag & 32) !== 0;
        if (singleByte) {
          out.push(sameOrZero ? buffer[cursor] : -buffer[cursor]);
          cursor += 1;
        } else if (sameOrZero) {
          out.push(0);
        } else {
          out.push(readS16(cursor));
          cursor += 2;
        }
      }
      if (isX) glyph.afterX = cursor;
      return out;
    }
    // 展开成路径（复合字形递归展开）
    static buildPath(font, glyphIndex, path) {
      const target = path || { cmds: [], crds: [] };
      const glyph = _FontDecoder.parseGlyf(font, glyphIndex);
      if (!glyph) return target;
      if (glyph.contours > 0) {
        _FontDecoder.simplePath(glyph, target);
        return target;
      }
      for (const part of glyph.parts || []) {
        const child = _FontDecoder.buildPath(font, part.glyphIndex);
        const matrix = part.m;
        for (let i = 0; i < child.crds.length; i += 2) {
          const x = child.crds[i];
          const y = child.crds[i + 1];
          target.crds.push(x * matrix.a + y * matrix.b + matrix.tx, x * matrix.c + y * matrix.d + matrix.ty);
        }
        for (const cmd of child.cmds) target.cmds.push(cmd);
      }
      return target;
    }
    // 简单字形路径
    static simplePath(glyph, path) {
      for (let contour = 0; contour < glyph.contours; contour++) {
        const first = contour === 0 ? 0 : glyph.ends[contour - 1] + 1;
        const last = glyph.ends[contour];
        for (let i = first; i <= last; i++) {
          const prev = i === first ? last : i - 1;
          const next = i === last ? first : i + 1;
          const onCurve = (glyph.flags[i] & 1) !== 0;
          const prevOn = (glyph.flags[prev] & 1) !== 0;
          const nextOn = (glyph.flags[next] & 1) !== 0;
          const x = glyph.xs[i];
          const y = glyph.ys[i];
          if (i === first) {
            if (onCurve) {
              if (prevOn) {
                path.cmds.push("M");
                path.crds.push(glyph.xs[prev], glyph.ys[prev]);
              } else {
                path.cmds.push("M");
                path.crds.push(x, y);
                continue;
              }
            } else if (prevOn) {
              path.cmds.push("M");
              path.crds.push(glyph.xs[prev], glyph.ys[prev]);
            } else {
              path.cmds.push("M");
              path.crds.push(Math.floor((glyph.xs[prev] + x) * 0.5), Math.floor((glyph.ys[prev] + y) * 0.5));
            }
          }
          if (onCurve) {
            if (prevOn) {
              path.cmds.push("L");
              path.crds.push(x, y);
            }
          } else if (nextOn) {
            path.cmds.push("Q");
            path.crds.push(x, y, glyph.xs[next], glyph.ys[next]);
          } else {
            path.cmds.push("Q");
            path.crds.push(x, y, Math.floor((x + glyph.xs[next]) * 0.5), Math.floor((y + glyph.ys[next]) * 0.5));
          }
        }
        path.cmds.push("Z");
      }
    }
    // 拉对照表
    async loadTable() {
      if (_FontDecoder.tables.has(this.spec.key) && _FontDecoder.tables.get(this.spec.key)) {
        return _FontDecoder.tables.get(this.spec.key);
      }
      if (this.tablePromise) return this.tablePromise;
      const font = this.fontSpec;
      this.tablePromise = (async () => {
        let raw = null;
        if (font.resource && typeof GM_getResourceText === "function") {
          try {
            raw = GM_getResourceText(font.resource);
          } catch (e) {
            raw = null;
          }
        }
        if (!raw && font.url) {
          const response = await Http.request({ method: "get", url: font.url, timeout: 3e4 });
          raw = typeof response.data === "string" ? response.data : JSON.stringify(response.data);
        }
        if (!raw) throw new Error("字体指纹对照表不可用");
        const table = typeof raw === "string" ? JSON.parse(raw) : raw;
        _FontDecoder.tables.set(this.spec.key, table);
        if (this.log) this.log.info("字体指纹表已载入，覆盖 " + Object.keys(table).length + " 个轮廓");
        return table;
      })().catch((e) => {
        this.tablePromise = null;
        throw e;
      });
      return this.tablePromise;
    }
    // 改写文本
    static rewriteText(node, map) {
      let changed = false;
      const children = node.childNodes ? Array.from(node.childNodes) : [];
      for (const child of children) {
        const isText = child.nodeType === 3 || String(child.tagName || "").toUpperCase() === "#TEXT";
        if (isText) {
          const source = child.nodeValue != null ? child.nodeValue : String(child.textContent || "");
          let out = "";
          let hit = false;
          for (let i = 0; i < source.length; i++) {
            const code = source.charCodeAt(i);
            if (map[code] !== void 0) {
              out += map[code];
              hit = true;
            } else {
              out += source[i];
            }
          }
          if (hit) {
            if (child.nodeValue != null) child.nodeValue = out;
            else child.textContent = out;
            changed = true;
          }
        } else if (child.childNodes && child.childNodes.length) {
          if (_FontDecoder.rewriteText(child, map)) changed = true;
        }
      }
      return changed;
    }
    // 常驻补解：捞内联字体 → 建映射（字体只算一次）→ 就地还原并摘类
    async install(doc) {
      const font = this.fontSpec;
      if (!font || !(font.url || font.resource) || !doc) return false;
      const selector = "." + (font.cssClass || "font-cxsecret");
      const run = async () => {
        if (!FrameProbe.queryAll(selector, doc).length) return 0;
        const fonts = [];
        for (const style of FrameProbe.queryAll("style", doc)) {
          const css = style.textContent || "";
          if (!css.includes(font.cssClass || "font-cxsecret")) continue;
          const match = css.match(/base64,([A-Za-z0-9+/=]+)/);
          if (match && fonts.indexOf(match[1]) < 0) fonts.push(match[1]);
        }
        if (!fonts.length) return 0;
        let table;
        try {
          table = await this.loadTable();
        } catch (e) {
          if (this.log) this.log.warn("字体指纹表不可用，乱码题干将无法命中: " + e.message);
          return 0;
        }
        const maps = fonts.map((base64) => {
          if (this.mapCache.has(base64)) return this.mapCache.get(base64);
          let map = null;
          try {
            if (typeof atob !== "function") throw new Error("缺少 atob，无法解码字体");
            const binary = atob(base64);
            const buffer = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
            const parsed = _FontDecoder.parseFont(buffer);
            if (parsed) {
              map = {};
              for (const codeText of Object.keys(parsed.map)) {
                const code = Number(codeText);
                const real = table[md5Hex(JSON.stringify(_FontDecoder.buildPath(parsed, parsed.map[code]))).slice(24)];
                if (real) map[code] = String.fromCharCode(real);
              }
            }
          } catch (e) {
            if (this.log) this.log.warn("字体解析失败: " + e.message);
            map = null;
          }
          this.mapCache.set(base64, map);
          return map;
        }).filter(Boolean);
        const merged = Object.assign({}, ...maps);
        if (!Object.keys(merged).length) return 0;
        let count = 0;
        for (const node of FrameProbe.queryAll(selector, doc)) {
          if (_FontDecoder.rewriteText(node, merged)) count += 1;
          if (node.classList && node.classList.remove) node.classList.remove(font.cssClass || "font-cxsecret");
        }
        return count;
      };
      const first = await run();
      if (HAS_DOM && typeof MutationObserver === "function" && doc.body && !this.observer) {
        let debounce = null;
        this.observer = new MutationObserver(() => {
          clearTimeout(debounce);
          debounce = setTimeout(() => {
            run().catch(() => {
            });
          }, 200);
        });
        this.observer.observe(doc.body, { childList: true, subtree: true });
      }
      if (this.log) this.log.info("混淆字体解码" + (first ? `：已还原 ${first} 处` : "：已就位，等待字体节点"));
      return true;
    }
  };
  var ImageReader = class _ImageReader {
    constructor(context2) {
      this.context = context2 || {};
      this.settings = this.context.settings || {};
      this.log = this.context.log || new Logger({ mirror: false });
      this.lib = null;
      this.loading = null;
      this.worker = null;
    }
    // 注入脚本等加载
    static injectScript(win, url, timeoutMs) {
      return new Promise((resolve, reject) => {
        const page = win && win.document;
        if (!page || !page.createElement) {
          reject(new Error("无 DOM 环境"));
          return;
        }
        const el = page.createElement("script");
        el.src = url;
        el.async = true;
        let settled = false;
        let timer = null;
        const settle = (then, drop) => () => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (drop && el.remove) el.remove();
          then();
        };
        timer = setTimeout(settle(() => reject(new Error("加载超时")), true), Math.max(1e3, timeoutMs | 0));
        el.onload = settle(resolve);
        el.onerror = settle(() => reject(new Error("脚本加载失败")), true);
        (page.head || page.documentElement || page.body).appendChild(el);
      });
    }
    // 加载引擎
    async load() {
      if (this.lib) return this.lib;
      if (this.loading) return this.loading;
      const win = this.context.win || PAGE_WINDOW;
      const hostLib = win && win.Tesseract;
      const existing = hostLib && typeof hostLib.createWorker === "function" ? hostLib : null;
      if (existing) {
        this.lib = existing;
        return existing;
      }
      const self = this;
      const builtin = [
        "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js",
        "https://unpkg.com/tesseract.js@5/dist/tesseract.min.js",
        "https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js"
      ];
      const raw = this.settings.ocrCdn;
      const configured = (Array.isArray(raw) ? raw : String(raw || "").split(",")).map((url) => String(url).trim()).filter((url) => /^https?:\/\//i.test(url));
      const urls = configured.length ? configured : builtin.slice();
      this.loading = (async () => {
        for (const url of urls) {
          const loadTimeout = self.settings.ocrLoadTimeoutMs;
          const outcome = await withTimeout(_ImageReader.injectScript(win, url, loadTimeout), loadTimeout, url);
          if (!outcome.ok) {
            self.log.warn("OCR 引擎加载失败(" + url + "): " + outcome.error);
            continue;
          }
          const ready = win && win.Tesseract;
          const lib = ready && typeof ready.createWorker === "function" ? ready : null;
          if (lib) {
            self.log.info("OCR 引擎已就绪");
            self.lib = lib;
            return lib;
          }
        }
        self.log.warn("OCR 引擎不可用：请检查网络或自配 ocrCdn");
        return null;
      })();
      return this.loading;
    }
    // 识别图片（worker 要复用）
    async recognize(image) {
      if (!this.worker) {
        const lib = await this.load();
        if (!lib) return "";
        const options = {};
        if (this.settings.ocrLangPath) options.langPath = this.settings.ocrLangPath;
        this.worker = await lib.createWorker(this.settings.ocrLangs || "chi_sim+eng", 1, options);
      }
      const worker = this.worker;
      const outcome = await withTimeout(worker.recognize(image), this.settings.ocrTimeoutMs);
      if (!outcome.ok) {
        this.log.warn("识图失败: " + outcome.error);
        return "";
      }
      const data = outcome.value && outcome.value.data ? outcome.value.data : outcome.value;
      const wide = "\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef";
      let text = String(data && data.text ? data.text : "").replace(/\r/g, "\n").replace(/[\t\u00a0\u3000]+/g, " ");
      text = text.replace(new RegExp(" (?=[" + wide + "])", "g"), "");
      text = text.replace(new RegExp("([" + wide + "]) ", "g"), "$1");
      text = text.replace(/ {2,}/g, " ");
      text = text.replace(/\n{2,}/g, "\n");
      return text.trim();
    }
    // 等比缩到上限
    static fitSize(width, height, maxEdge) {
      const w = Math.max(0, width | 0);
      const h = Math.max(0, height | 0);
      const edge = Math.max(w, h);
      if (!edge || !maxEdge || edge <= maxEdge) return { width: w, height: h, scale: 1 };
      const scale = maxEdge / edge;
      return { width: Math.max(1, Math.round(w * scale)), height: Math.max(1, Math.round(h * scale)), scale };
    }
    // 懒加载真实地址
    static urlOf(node) {
      if (!node) return "";
      const read = (name) => node.getAttribute ? node.getAttribute(name) || "" : "";
      return String(read("data-src") || read("data-original") || read("data-original-src") || read("data-echo") || node.currentSrc || node.src || read("src") || read("original")).trim();
    }
    // 挑最大题图
    static pickImage(root, settings) {
      if (!root || !root.querySelectorAll) return null;
      const declared = settings && settings.ocrImageSelector || "";
      let nodes = declared ? FrameProbe.queryAll(declared, root) : [];
      if (!nodes.length) nodes = FrameProbe.queryAll("img", root);
      const minEdge = settings && settings.ocrMinImageEdge || 64;
      let best = null;
      let bestArea = -1;
      nodes.forEach((node) => {
        const read = (name) => Number(node.getAttribute ? node.getAttribute(name) : 0) || 0;
        const width = node.naturalWidth || node.width || read("width");
        const height = node.naturalHeight || node.height || read("height");
        const shortEdge = Math.min(width, height);
        if (shortEdge && shortEdge < minEdge) return;
        const area = width * height;
        if (area > bestArea) {
          best = node;
          bestArea = area;
        }
      });
      return best;
    }
    // 取回并降采样（按魔数判类型）
    static async toInline(url, settings, win) {
      let dataUrl = url;
      if (!/^data:/i.test(url)) {
        const bytes = await Http.request({ url, timeout: settings.ocrFetchTimeoutMs, responseType: "arraybuffer" });
        const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
        let mime = "image/png";
        if (data.length > 3 && data[0] === 137 && data[1] === 80 && data[2] === 78 && data[3] === 71) mime = "image/png";
        else if (data.length > 1 && data[0] === 255 && data[1] === 216) mime = "image/jpeg";
        else if (data.length > 2 && data[0] === 71 && data[1] === 73 && data[2] === 70) mime = "image/gif";
        else if (data.length > 1 && data[0] === 66 && data[1] === 77) mime = "image/bmp";
        else if (data.length > 11 && String.fromCharCode(data[8], data[9], data[10], data[11]) === "WEBP") mime = "image/webp";
        dataUrl = "data:" + mime + ";base64," + toBase64(data);
      }
      const scaled = await _ImageReader.loadImage(win, dataUrl).catch(() => null);
      if (!scaled) return dataUrl;
      const width = scaled.naturalWidth || scaled.width;
      const height = scaled.naturalHeight || scaled.height;
      const fit = _ImageReader.fitSize(width, height, settings.ocrMaxEdge);
      if (fit.scale >= 1) return dataUrl;
      return _ImageReader.draw(win, scaled, { x: 0, y: 0, width, height }, fit.width, fit.height) || dataUrl;
    }
    // 解位图
    static loadImage(win, url) {
      return new Promise((resolve, reject) => {
        const ImageClass = win && win.Image;
        if (!ImageClass) {
          reject(new Error("无 Image 构造器，无法裁帧"));
          return;
        }
        const image = new ImageClass();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("截屏帧解码失败"));
        image.src = url;
      });
    }
    // 画到 canvas
    static draw(win, source, crop, outWidth, outHeight) {
      const canvas = win.document.createElement("canvas");
      canvas.width = outWidth;
      canvas.height = outHeight;
      const context2 = canvas.getContext && canvas.getContext("2d");
      if (!context2 || !context2.drawImage) return "";
      context2.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, outWidth, outHeight);
      return canvas.toDataURL ? canvas.toDataURL("image/png") : "";
    }
  };
  var ScreenSearch = class _ScreenSearch {
    // 底图等比摆放
    static fitViewport(imageWidth, imageHeight, viewWidth, viewHeight) {
      const iw = Math.max(1, imageWidth | 0);
      const ih = Math.max(1, imageHeight | 0);
      const vw = Math.max(1, viewWidth | 0);
      const vh = Math.max(1, viewHeight | 0);
      const scale = Math.min(vw / iw, vh / ih);
      const width = iw * scale;
      const height = ih * scale;
      return { scale, width, height, offsetX: (vw - width) / 2, offsetY: (vh - height) / 2 };
    }
    // 拖框转像素矩形
    static imageRect(from, to, viewport, imageSize, minEdge) {
      const layout = _ScreenSearch.fitViewport(imageSize.width, imageSize.height, viewport.width, viewport.height);
      const toImage = (point) => ({
        x: (point.x - layout.offsetX) / layout.scale,
        y: (point.y - layout.offsetY) / layout.scale
      });
      const a = toImage(from);
      const b = toImage(to);
      const gate = minEdge == null ? 12 : minEdge;
      const clampX = (value) => Math.max(0, Math.min(value, imageSize.width));
      const clampY = (value) => Math.max(0, Math.min(value, imageSize.height));
      const left = clampX(Math.min(a.x, b.x));
      const right = clampX(Math.max(a.x, b.x));
      const top = clampY(Math.min(a.y, b.y));
      const bottom = clampY(Math.max(a.y, b.y));
      const x = Math.floor(left);
      const y = Math.floor(top);
      const width = Math.ceil(right) - x;
      const height = Math.ceil(bottom) - y;
      if (width < gate || height < gate) return null;
      return { x, y, width, height };
    }
    // 截一帧就停共享
    static async frame(win, settings) {
      const devices = win.navigator && win.navigator.mediaDevices;
      if (!devices || !devices.getDisplayMedia) throw new Error("当前环境不支持屏幕捕获");
      const stream = await devices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
      try {
        const video = win.document.createElement("video");
        video.muted = true;
        video.srcObject = stream;
        await new Promise((resolve, reject) => {
          if (video.readyState >= 2) {
            resolve();
            return;
          }
          const timer = setTimeout(() => reject(new Error("截屏帧读取超时")), Math.max(500, settings.ocrFetchTimeoutMs | 0));
          video.addEventListener("loadeddata", () => {
            clearTimeout(timer);
            resolve();
          });
          video.onerror = () => {
            clearTimeout(timer);
            reject(new Error("截屏帧解码失败"));
          };
        });
        const width = video.videoWidth;
        const height = video.videoHeight;
        if (!width || !height) throw new Error("截屏帧尺寸为空");
        const url = ImageReader.draw(win, video, { x: 0, y: 0, width, height }, width, height);
        if (!url) throw new Error("截屏帧画不出位图");
        return { url, width, height };
      } finally {
        (stream.getTracks ? stream.getTracks() : []).forEach((track) => track && track.stop && track.stop());
      }
    }
    // 底图与裁切同源
    static pick(win, frame) {
      return new Promise((resolve) => {
        let host = win;
        try {
          if (win.top && win.top !== win && win.top.document) host = win.top;
        } catch (e) {
        }
        const page = host.document;
        const viewport = { width: host.innerWidth || frame.width, height: host.innerHeight || frame.height };
        const layout = _ScreenSearch.fitViewport(frame.width, frame.height, viewport.width, viewport.height);
        const layer = page.createElement("div");
        layer.setAttribute("style", "position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:rgba(0,0,0,.6);cursor:crosshair");
        const image = page.createElement("img");
        image.setAttribute("style", `position:absolute;image-rendering:auto;box-shadow:0 0 0 1px #000;left:${layout.offsetX}px;top:${layout.offsetY}px;width:${layout.width}px;height:${layout.height}px`);
        image.src = frame.url;
        const box = page.createElement("div");
        box.setAttribute("style", "position:absolute;border:1px solid #4ea1ff;background:rgba(78,161,255,.2);display:none");
        const tip = page.createElement("div");
        tip.setAttribute("style", "position:absolute;left:12px;top:12px;padding:4px 10px;border-radius:4px;background:rgba(0,0,0,.6);color:#fff;font:12px/1.6 system-ui");
        tip.textContent = "拖动框选要搜的题目，Esc 取消";
        layer.appendChild(image);
        layer.appendChild(box);
        layer.appendChild(tip);
        (page.body || page.documentElement).appendChild(layer);
        let from = null;
        let to = null;
        const teardown = () => {
          layer.removeEventListener("mousemove", onMove);
          layer.removeEventListener("mouseup", onUp);
          if (host.removeEventListener) host.removeEventListener("keydown", keyHandler);
          if (layer.remove) layer.remove();
          else if (layer.parentNode && layer.parentNode.removeChild) layer.parentNode.removeChild(layer);
        };
        const paint = () => {
          const region = _ScreenSearch.imageRect(from, to, viewport, { width: frame.width, height: frame.height }, 0);
          const left = region ? region.x * layout.scale + layout.offsetX : 0;
          const top = region ? region.y * layout.scale + layout.offsetY : 0;
          box.setAttribute("style", `position:absolute;border:1px solid #4ea1ff;background:rgba(78,161,255,.2);left:${left}px;top:${top}px;width:${region ? region.width * layout.scale : 0}px;height:${region ? region.height * layout.scale : 0}px`);
        };
        const onMove = (event) => {
          if (!from) return;
          to = { x: event.clientX, y: event.clientY };
          paint();
        };
        const onUp = (event) => {
          if (!from) return;
          to = { x: event.clientX, y: event.clientY };
          const region = _ScreenSearch.imageRect(from, to, viewport, { width: frame.width, height: frame.height }, 12);
          teardown();
          resolve(region);
        };
        const onDown = (event) => {
          from = { x: event.clientX, y: event.clientY };
          to = from;
          layer.addEventListener("mousemove", onMove);
          layer.addEventListener("mouseup", onUp);
        };
        const keyHandler = (event) => {
          if (event.key !== "Escape") return;
          teardown();
          resolve(null);
        };
        layer.addEventListener("mousedown", onDown);
        if (host.addEventListener) host.addEventListener("keydown", keyHandler);
      });
    }
    constructor(context2) {
      this.engine = context2.engine;
      this.store = context2.store;
      this.log = context2.log;
      this.settings = context2.settings;
      this.busy = false;
      this.card = null;
    }
    // 截屏搜题
    async run() {
      if (this.busy) {
        this.log.info("上一次搜题还没结束");
        return null;
      }
      this.busy = true;
      const win = this.engine.win || PAGE_WINDOW;
      try {
        const frame = await _ScreenSearch.frame(win, this.settings);
        const region = await _ScreenSearch.pick(win, frame);
        if (!region) {
          this.log.info("已取消划选（Esc 或选区太小）");
          return null;
        }
        const image0 = await ImageReader.loadImage(win, frame.url);
        const fit = ImageReader.fitSize(region.width, region.height, this.settings.ocrMaxEdge);
        const image = ImageReader.draw(win, image0, region, fit.width, fit.height);
        if (!image) {
          this.log.warn("选区裁剪失败");
          return null;
        }
        let text = this.store.ocrGet(image);
        if (!text) {
          text = await this.engine.ensureOcr().recognize(image);
          if (text) this.store.ocrPut(image, text);
        }
        if (!text) {
          this.log.warn("选区里没识别到文字");
          return null;
        }
        const answers = await this.search(text);
        this.show(text, answers);
        return { text, answers };
      } catch (e) {
        this.log.warn("划选搜题失败: " + e.message);
        return null;
      } finally {
        this.busy = false;
      }
    }
    // 文本版入口
    async runText(text) {
      const stem = TextSanitizer.collapse(String(text == null ? "" : text));
      if (stem.length < 4) {
        this.log.warn("题面太短，先在页面上划选文字或把题目粘进搜索框");
        return null;
      }
      const answers = await this.search(stem);
      this.show(stem, answers);
      return { text: stem, answers };
    }
    // 搜选中文字
    async runSelection() {
      let selected = "";
      try {
        const win = this.engine.win || PAGE_WINDOW;
        const page = win && win.document;
        const selection = page && page.getSelection && page.getSelection() || win && win.getSelection && win.getSelection();
        selected = selection ? String(selection.toString() || "") : "";
      } catch (e) {
        selected = "";
      }
      return this.runText(selected);
    }
    // 答案写回缓存
    async search(text) {
      const question = new Question({ index: 0, type: QuestionType.UNKNOWN, stem: text, options: [], blanks: [] });
      const payload = await this.engine.hub.fetch(question, !!this.settings.useAi);
      const out = unique(payload.candidates.reduce((acc, candidate) => acc.concat(candidate.answers), []).map((answer) => String(answer == null ? "" : answer).trim()).filter(Boolean));
      if (out.length && this.settings.useCache) {
        this.store.cachePut({ key: TextSanitizer.key(text), stem: text, answer: out.slice(0, 3), type: QuestionType.UNKNOWN, from: "search" });
      }
      return out.slice(0, 5);
    }
    // 弹结果卡
    show(text, answers) {
      const page = this.engine.doc || (HAS_DOM ? document : null);
      if (!page || !page.createElement) return null;
      this.dismiss();
      const element = (tag, style, content) => {
        const node = page.createElement(tag);
        if (style) node.setAttribute("style", style);
        if (content != null) node.textContent = content;
        return node;
      };
      const known = !!(answers && answers.length);
      const body = element("div");
      (known ? answers : ["没有搜到答案"]).forEach((answer, index) => {
        body.appendChild(element("div", null, (known ? index + 1 + ". " : "") + answer));
      });
      const close = element("button", "margin-top:8px", "关闭");
      close.addEventListener("click", () => this.dismiss());
      const card = element("div", "position:fixed;right:16px;bottom:16px;z-index:2147483001;max-width:420px;padding:12px 14px;border-radius:8px;background:#1f2430;color:#e8ecf5;font:13px/1.7 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35)");
      [
        element("div", "font-weight:600;margin-bottom:4px", "划选搜题"),
        element("div", "color:#b9c2d0;margin-bottom:8px;white-space:pre-wrap", text),
        body,
        close
      ].forEach((node) => card.appendChild(node));
      (page.body || page.documentElement).appendChild(card);
      this.card = card;
      return card;
    }
    // 关结果卡
    dismiss() {
      const card = this.card;
      this.card = null;
      if (!card) return false;
      if (card.remove) card.remove();
      else if (card.parentNode && card.parentNode.removeChild) card.parentNode.removeChild(card);
      return true;
    }
  };

  // Panel.ts
  var ControlPanel = class {
    constructor(engine, context2) {
      this.engine = engine;
      this.store = context2.store;
      this.log = context2.log;
      this.settings = context2.settings;
      this.host = null;
      this.refs = {};
    }
    // 建节点
    create(tag, attributes, children) {
      const node = this.doc.createElement(tag);
      Object.keys(attributes || {}).forEach((key) => {
        if (key === "text") node.textContent = attributes[key];
        else if (key === "style") node.setAttribute("style", attributes[key]);
        else if (key.indexOf("on") === 0) node.addEventListener(key.slice(2).toLowerCase(), attributes[key]);
        else node.setAttribute(key, attributes[key]);
      });
      (children || []).forEach((child) => child && node.appendChild(child));
      return node;
    }
    // 挂载面板
    mount(container) {
      if (!container || !container.body) return null;
      this.doc = container;
      this.host = this.create("div", { id: "autoquiz-host" });
      const shadow = this.host.attachShadow ? this.host.attachShadow({ mode: "closed" }) : this.host;
      const css = `
:host{all:initial}
*{box-sizing:border-box;font:12px/1.5 -apple-system,"Microsoft YaHei",sans-serif}
.wrap{position:fixed;right:14px;top:78px;width:272px;background:#1f2430;color:#e8ecf3;border:1px solid #3a4457;border-radius:8px;box-shadow:0 8px 26px rgba(0,0,0,.45);z-index:2147483647;overflow:hidden}
.hd{display:flex;align-items:center;gap:6px;padding:7px 9px;background:#2b3242;cursor:move;user-select:none}
.hd b{font-weight:600}
.hd .st{margin-left:auto;font-size:11px;color:#8fd18f}
.hd .st.paused{color:#f0c674}
.hd .st.error{color:#ef6b6b}
.mini{background:none;border:none;color:#c8d2e0;cursor:pointer;font-size:14px;padding:0 2px}
.bd{padding:8px 9px;display:flex;flex-direction:column;gap:7px;max-height:60vh;overflow:auto}
.row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
button{background:#3b6ef0;border:none;color:#fff;border-radius:4px;padding:4px 8px;cursor:pointer}
button.ghost{background:#39414f}
input[type=text],input[type=number],select,textarea{background:#151a23;color:#e8ecf3;border:1px solid #3a4457;border-radius:4px;padding:3px 5px;font:12px/1.4 Consolas,monospace}
textarea{width:100%;height:64px;resize:vertical}
label{display:flex;align-items:center;gap:3px}
.kv{color:#9fb0c8}
.kv b{color:#e8ecf3}
.results{max-height:170px;overflow:auto;border-top:1px solid #2c3240;margin:6px 0 2px}
.qrow{display:flex;gap:6px;font-size:11px;line-height:1.7;border-bottom:1px dashed #242a36}
.qrow .c-no{width:18px;color:#8b94a6;flex:none}
.qrow .c-stem{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qrow .c-ans{width:96px;flex:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.qrow .c-from{width:52px;flex:none;color:#8b94a6;text-align:right}
.qrow.miss .c-ans,.qrow.miss .c-from{color:#e6a23c}
.log{background:#12161d;color:#9fd0a6;border-radius:4px;padding:5px;height:96px;overflow:auto;white-space:pre-wrap;word-break:break-all;font:11px/1.45 Consolas,monospace;margin:0}
.log .warn{color:#f0c674}.log .error{color:#ef6b6b}
.collapsed .bd{display:none}
`;
      const style = this.create("style", { text: css });
      const wrap = this.buildUi();
      shadow.appendChild(style);
      shadow.appendChild(wrap);
      container.body.appendChild(this.host);
      const position = this.store.get("panelPos", null);
      if (position && typeof position === "object") {
        wrap.style.left = position.left + "px";
        wrap.style.top = position.top + "px";
        wrap.style.right = "auto";
      }
      this.makeDraggable(wrap);
      this.doc.addEventListener("keydown", (event) => {
        if (!event.altKey) return;
        const key = String(event.key).toUpperCase();
        if (key === "S") {
          this.engine.start();
          event.preventDefault();
        } else if (key === "P") {
          this.engine.pause("手动暂停");
          event.preventDefault();
        } else if (key === "X") {
          this.engine.stop();
          event.preventDefault();
        }
      });
      this.refresh(this.engine.summary());
      this.engine.subscribe((type, payload) => {
        if (type === "question" && payload) this.upsertRow(payload);
        if (type === "scan") {
          const box = this.refs.results;
          if (box && box.removeChild) {
            while (box.firstChild) box.removeChild(box.firstChild);
            this.rows = /* @__PURE__ */ new Map();
          }
        }
        if (type === "question" || type === "progress" || type === "scan" || type === "finish") this.refresh(this.engine.summary());
      });
      this.log.subscribe((record) => this.appendLog(record));
      this.log.records.slice(-12).forEach((record) => this.appendLog(record));
      return this.host;
    }
    // 构建界面
    buildUi() {
      const refs = this.refs;
      const state = this.create("span", { class: "st", text: "idle" });
      refs.state = state;
      const header = this.create("div", { class: "hd" }, [
        this.create("b", { text: "刷题 " + VERSION }),
        state,
        this.create("button", { class: "mini", text: "—", onclick: () => wrap.classList.toggle("collapsed") })
      ]);
      const button = (text, cls, handler) => this.create("button", { text, class: cls || "", onclick: handler });
      const checkbox = (label, key, onChange) => {
        const box = this.create("input", { type: "checkbox" });
        box.checked = !!this.settings[key];
        box.addEventListener("change", () => this.patch({ [key]: box.checked }, onChange));
        return this.create("label", {}, [box, this.create("span", { text: label })]);
      };
      const number = (key, min, max, onChange) => {
        const input = this.create("input", { type: "number", value: String(this.settings[key]), min, max, step: "0.25", style: "width:58px" });
        input.addEventListener("change", () => {
          const value = Number(input.value);
          if (!Number.isNaN(value)) this.patch({ [key]: value }, onChange);
        });
        return input;
      };
      refs.progress = this.create("b", { text: "0/0" });
      refs.rate = this.create("b", { text: "0%" });
      refs.cacheCount = this.create("b", { text: "0" });
      const modeSelect = this.create("select", { name: "submitMode" });
      [["save", "只保存"], ["gate", "达标才交卷"], ["submit", "直接交卷"], ["none", "不动"]].forEach(([value, label]) => {
        const option = this.create("option", { value, text: label });
        if (this.settings.submitMode === value) option.selected = true;
        modeSelect.appendChild(option);
      });
      modeSelect.addEventListener("change", () => this.patch({ submitMode: modeSelect.value }));
      refs.token = this.create("input", { type: "text", value: String(this.settings.tikuToken || ""), style: "flex:1" });
      refs.endpoints = this.create("textarea", {
        text: JSON.stringify(this.settings.tikuEndpoints || DEFAULT_ENDPOINTS, null, 1)
      });
      const captureSelect = this.create("select", { name: "jsonCapture" });
      [["off", "接口拦截·关"], ["xhr", "仅 XHR"], ["all", "+全局 parse"]].forEach(([value, label]) => {
        const option = this.create("option", { value, text: label });
        if ((this.settings.jsonCapture || "off") === value) option.selected = true;
        captureSelect.appendChild(option);
      });
      captureSelect.addEventListener("change", () => this.patch({ jsonCapture: captureSelect.value }, () => {
        this.engine.ensureCapture();
        this.engine.rebuildSources();
      }));
      const patrolSelect = this.create("select", { name: "antiPatrolLevel" });
      [["0", "关闭"], ["1", "解禁复制"], ["2", "+切屏广播"], ["3", "+调用栈"]].forEach(([value, label]) => {
        const option = this.create("option", { value, text: label });
        if (String(this.settings.antiPatrolLevel) === value) option.selected = true;
        patrolSelect.appendChild(option);
      });
      patrolSelect.addEventListener("change", () => {
        this.patch({ antiPatrolLevel: Number(patrolSelect.value) }, () => this.engine.applyShield());
      });
      const modelInputs = [];
      const modelField = (key, placeholder, width) => {
        const input = this.create("input", { type: "text", value: String(this.settings[key] || ""), placeholder, style: width ? "width:" + width : "flex:1" });
        modelInputs.push(input);
        return input;
      };
      refs.modelBase = modelField("aiBaseUrl", "https://api…/v1");
      refs.modelKey = modelField("aiApiKey", "API Key");
      refs.modelName = modelField("aiModel", "模型", "92px");
      refs.ocrLangs = this.create("input", { type: "text", value: String(this.settings.ocrLangs || ""), placeholder: "chi_sim+eng", style: "width:92px" });
      refs.ocrLangs.addEventListener("change", () => this.patch({ ocrLangs: refs.ocrLangs.value.trim() }, () => this.engine.disposeOcr()));
      refs.forumTexts = this.create("input", { type: "text", value: String(this.settings.forumTexts || ""), placeholder: "讨论区文案，逗号分隔", style: "flex:1" });
      refs.forumTexts.addEventListener("change", () => this.patch({ forumTexts: refs.forumTexts.value.trim() }, () => this.aux()));
      refs.manualSearch = this.create("input", { type: "text", placeholder: "粘题目进来搜", style: "flex:1" });
      modelInputs.forEach((input) => input.addEventListener("change", () => this.patch(
        { aiBaseUrl: refs.modelBase.value.trim(), aiApiKey: refs.modelKey.value.trim(), aiModel: refs.modelName.value.trim() },
        () => this.engine.rebuildSources()
      )));
      const logBox = this.create("pre", { class: "log" });
      refs.log = logBox;
      const resultsBox = this.create("div", {
        class: "results",
        style: "max-height:160px;overflow:auto;margin-top:6px;border-top:1px solid #2c3240"
      });
      refs.results = resultsBox;
      const wrap = this.create("div", { class: "wrap" }, [
        header,
        this.create("div", { class: "bd" }, [
          this.create("div", { class: "row" }, [
            button("开始", "", () => this.engine.start()),
            button("暂停", "ghost", () => this.engine.pause("手动暂停")),
            button("继续", "ghost", () => this.engine.resume()),
            button("停止", "ghost", () => this.engine.stop()),
            button("重扫", "ghost", () => {
              this.engine.rescan();
              this.refresh(this.engine.summary());
            })
          ]),
          this.create("div", { class: "row kv" }, [
            this.create("span", { text: "进度 " }),
            refs.progress,
            this.create("span", { text: " 命中 " }),
            refs.rate,
            this.create("span", { text: " 缓存 " }),
            refs.cacheCount
          ]),
          this.create("div", { class: "row" }, [this.create("span", { class: "kv", text: "交卷" }), modeSelect]),
          this.create("div", { class: "row" }, [this.create("span", { class: "kv", text: "正确率闸门 %" }), number("submitRateGate", 0, 100)]),
          this.create("div", { class: "row" }, [
            checkbox("题库缓存", "useCache"),
            checkbox("在线题库", "useTiku"),
            checkbox("跳过已答", "skipDone")
          ]),
          this.create("div", { class: "row" }, [
            checkbox("随机兜底", "fillUnmatched"),
            checkbox("指针事件链", "usePointerChain")
          ]),
          this.create("div", { class: "row" }, [
            checkbox("混淆字体解码", "enableFontDecode", () => {
              this.engine.applyFont().then(() => {
                this.engine.rescan();
                this.refresh(this.engine.summary());
              });
            }),
            this.create("span", { class: "kv", text: "防巡查" }),
            patrolSelect
          ]),
          this.create("div", { class: "row" }, [
            this.create("span", { class: "kv", text: "接口拦截" }),
            captureSelect
          ]),
          this.create("div", { class: "row" }, [
            checkbox("AI 兜底答题", "useAi", () => this.engine.rebuildSources()),
            refs.modelName
          ]),
          this.create("div", { class: "row" }, [refs.modelBase]),
          this.create("div", { class: "row" }, [refs.modelKey]),
          this.create("div", { class: "row" }, [
            checkbox("图片题识图", "useOcr", () => this.engine.disposeOcr()),
            this.create("span", { class: "kv", text: "语言" }),
            refs.ocrLangs,
            button("划选搜题", "ghost", () => this.screen().run()),
            button("清识别缓存", "ghost", () => {
              this.store.set("ocr", {});
              this.log.info("识图缓存已清空");
            })
          ]),
          this.create("div", { class: "row" }, [
            refs.manualSearch,
            button("搜题", "ghost", () => this.screen().runText(refs.manualSearch.value)),
            button("搜选中文字", "ghost", () => this.screen().runSelection())
          ]),
          this.create("div", { class: "row" }, [this.create("span", { class: "kv", text: "token" }), refs.token]),
          refs.endpoints,
          this.create("div", { class: "row" }, [
            // 应用题库配置
            button("应用题库配置", "", () => {
              const patchValues = { tikuToken: refs.token.value.trim() };
              try {
                const parsed = JSON.parse(refs.endpoints.value);
                if (!Array.isArray(parsed)) throw new Error("端点表必须是数组");
                parsed.forEach((endpoint) => {
                  if (!endpoint || !endpoint.url) throw new Error("每个端点必须有 url 字段");
                });
                patchValues.tikuEndpoints = parsed;
              } catch (e) {
                this.log.error("题库配置无效: " + e.message);
                return;
              }
              this.patch(patchValues, () => this.engine.rebuildSources());
              this.log.info("题库配置已应用");
            }),
            button("清空缓存", "ghost", () => {
              this.store.set("cache", []);
              this.refresh(this.engine.summary());
              this.log.info("缓存已清空");
            }),
            // 导出缓存
            button("导出缓存", "ghost", () => {
              const json = JSON.stringify(this.store.cacheList(), null, 1);
              const copied = this.doc.defaultView && this.doc.defaultView.navigator && this.doc.defaultView.navigator.clipboard;
              if (copied) {
                copied.writeText(json).then(() => this.log.info("缓存 JSON 已复制到剪贴板"), () => window.prompt("缓存 JSON：", json));
              } else {
                window.prompt("缓存 JSON：", json);
              }
            })
          ]),
          this.create("div", { class: "row kv", text: "—— 附加能力（与刷题无关，默认关）——" }),
          this.create("div", { class: "row" }, [
            checkbox("视频倍速", "useVideoRate", () => this.aux()),
            number("videoRate", 0.25, 16, () => this.aux()),
            checkbox("被暂停就续播", "videoKeepPlaying", () => this.aux())
          ]),
          this.create("div", { class: "row" }, [
            checkbox("讨论水帖", "useForum", () => this.aux()),
            refs.forumTexts,
            // 发一条水帖
            button("发一条", "ghost", () => {
              const texts = ForumPoster.texts(this.settings.forumTexts);
              if (!texts.length) {
                this.log.warn("先填讨论区文案（逗号分隔）");
                return;
              }
              const loop = AddonLoop.obtain(this.engine.doc || document);
              const done = loop.poster.post(this.engine.doc || document, { texts });
              if (done.action === "posted") loop.posted = true;
              this.log[done.action === "posted" ? "info" : "warn"](done.action === "posted" ? "已提交一条讨论" : "讨论没发出去：" + done.action);
            })
          ]),
          this.create("div", { class: "row" }, [
            checkbox("Vue 组件取题", "useVueProbe", () => this.aux(true)),
            checkbox("压掉视频弹题", "useResponseTamper", () => this.aux(false))
          ]),
          this.create("div", { class: "row" }, [
            checkbox("静音音频保活", "useKeepAlive", () => this.aux()),
            checkbox("多开时让位", "useSingleTab", () => this.engine.acquireLock())
          ]),
          resultsBox,
          logBox
        ])
      ]);
      return wrap;
    }
    // 附加能力入口
    aux(resharvest) {
      syncHooks(this.settings, this.log);
      this.engine.applyProbe();
      if (resharvest && this.engine.harvestVue()) {
        this.engine.rescan();
        this.refresh(this.engine.summary());
      }
      if (this.settings.useResponseTamper) this.log.warn("响应改写已开启，需刷新页面才能盖住本页已发出的弹题请求");
      AddonLoop.obtain(this.engine.doc || document);
    }
    // 按需建搜题
    screen() {
      if (!this.screenSearch) this.screenSearch = new ScreenSearch({ engine: this.engine, store: this.store, log: this.log, settings: this.settings });
      return this.screenSearch;
    }
    // 改设置并落盘
    patch(values, after) {
      Object.assign(this.settings, values);
      this.store.set("settings", Object.assign({}, this.store.get("settings", {}), values));
      if (after) after();
    }
    // 拖拽
    makeDraggable(wrap) {
      const header = wrap.querySelector(".hd");
      let dragging = null;
      const onMove = (event) => {
        if (!dragging) return;
        const point = event.touches ? event.touches[0] : event;
        wrap.style.left = point.clientX - dragging.dx + "px";
        wrap.style.top = point.clientY - dragging.dy + "px";
        wrap.style.right = "auto";
      };
      const onUp = () => {
        if (!dragging) return;
        dragging = null;
        this.store.set("panelPos", { left: parseInt(wrap.style.left, 10) || 0, top: parseInt(wrap.style.top, 10) || 0 });
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      const onDown = (event) => {
        const point = event.touches ? event.touches[0] : event;
        const bounds = wrap.getBoundingClientRect();
        dragging = { dx: point.clientX - bounds.left, dy: point.clientY - bounds.top };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
        event.preventDefault();
      };
      if (header) {
        header.addEventListener("mousedown", onDown);
        header.addEventListener("touchstart", onDown, { passive: true });
      }
    }
    // 追加日志
    appendLog(record) {
      const box = this.refs.log;
      if (!box) return;
      const line = this.create("div", { class: record.level === "error" ? "error" : record.level === "warn" ? "warn" : "", text: record.text });
      box.appendChild(line);
      while (box.childNodes.length > 80) box.removeChild(box.firstChild);
      box.scrollTop = box.scrollHeight;
    }
    // 一题一行
    upsertRow(record) {
      const box = this.refs.results;
      if (!box) return null;
      this.rows = this.rows || /* @__PURE__ */ new Map();
      let row = this.rows.get(record.index);
      if (!row) {
        row = this.create("div", { class: "qrow" });
        row.cells = [this.create("span", { class: "c-no" }), this.create("span", { class: "c-stem" }), this.create("span", { class: "c-ans" }), this.create("span", { class: "c-from" })];
        row.cells.forEach((cell) => row.appendChild(cell));
        box.appendChild(row);
        this.rows.set(record.index, row);
      }
      const answered = !!record.finish;
      const answer = (record.texts || []).join(" / ") || (answered ? "已作答" : "未命中");
      const detail = answered ? "" : (record.candidateTexts || []).join(" ｜ ") || record.matched || "";
      row.cells[0].textContent = String(record.index + 1);
      row.cells[1].textContent = String(record.stem || "").slice(0, 24);
      row.cells[2].textContent = answer;
      row.cells[3].textContent = answered ? record.from || "-" : record.matched || "-";
      row.setAttribute("class", "qrow " + (answered ? "ok" : "miss"));
      row.setAttribute("title", detail || answer);
      if (record.node && record.node.scrollIntoView) {
        row.style.cursor = "pointer";
        row.onclick = () => {
          try {
            record.node.scrollIntoView({ block: "center", behavior: "smooth" });
          } catch (e) {
          }
        };
      }
      return row;
    }
    // 刷新状态
    refresh(summary) {
      if (!this.refs.state) return;
      const labels = { idle: "未开始", running: "进行中", paused: "已暂停", done: "已完成", error: "出错" };
      this.refs.state.textContent = labels[summary.state] || summary.state;
      this.refs.state.className = "st " + summary.state;
      this.refs.progress.textContent = summary.done + "/" + summary.total;
      this.refs.rate.textContent = summary.rate.toFixed(0) + "%";
      this.refs.cacheCount.textContent = String(this.store.cacheList().length);
    }
  };

  // Guard.ts
  var RiskGate = class _RiskGate {
    static MARKERS = [".yidun_popup--light", ".yidun_panel", "#fcqrimg", ".chapterVideoFaceMaskDiv", ".verify-box"];
    // 是否被拦
    static blocking(page) {
      if (!page || !page.querySelectorAll) return null;
      for (const selector of _RiskGate.MARKERS) {
        const hit = FrameProbe.queryAll(selector, page).find((node) => FrameProbe.visible(node));
        if (hit) return selector;
      }
      return null;
    }
    // 等到放行或超时
    static async wait(page, options) {
      const config = options || {};
      const log = config.log || null;
      const timeout = config.timeoutMs == null ? 12e4 : config.timeoutMs;
      const started = Date.now();
      let blocked = _RiskGate.blocking(page);
      if (!blocked) return true;
      if (log) log.warn("检测到风控弹层（" + blocked + "），请手动完成验证后自动继续");
      while (blocked && Date.now() - started < timeout) {
        if (config.aborted && config.aborted()) {
          if (log) log.warn("等待验证期间已停止");
          return false;
        }
        await sleep(1e3);
        blocked = _RiskGate.blocking(page);
      }
      if (blocked) {
        if (log) log.error("等待验证超时，本轮作答中止：请完成验证后重新点开始");
        return false;
      }
      if (log) log.info("验证已通过，继续作答");
      return true;
    }
  };
  var RESTRICTED_EVENTS = ["selectstart", "select", "copy", "cut", "paste", "contextmenu", "dragstart", "drag", "drop", "blur", "focus"];
  var PatrolShield = class _PatrolShield {
    static restores = [];
    static sweepTimer = null;
    // 三档语义：解禁复制 / 切屏广播 / 掐检测定时器
    static install(level, context2) {
      const options = context2 || {};
      if (!HAS_DOM || !level) return { installed: [] };
      const win = options.win || PAGE_WINDOW;
      const page = options.page || win.document;
      const log = options.log || null;
      if (win.__AUTOQUIZ_PATROL_LEVEL__ >= level) return { installed: [], already: win.__AUTOQUIZ_PATROL_LEVEL__ };
      win.__AUTOQUIZ_PATROL_LEVEL__ = level;
      const installed = [];
      for (const event of RESTRICTED_EVENTS) {
        const key = "on" + event;
        if (page[key] && !page["__autoquiz_" + key]) page["__autoquiz_" + key] = page[key];
        page[key] = () => true;
      }
      if (win.getSelection) {
        try {
          const selection = win.getSelection();
          if (selection) {
            const rawRemove = selection.removeAllRanges;
            const rawEmpty = selection.empty;
            selection.removeAllRanges = () => {
            };
            if (selection.empty) selection.empty = () => {
            };
            _PatrolShield.restores.push(() => {
              if (rawRemove) selection.removeAllRanges = rawRemove;
              if (rawEmpty) selection.empty = rawEmpty;
            });
          }
        } catch (e) {
        }
      }
      if (!page.getElementById("autoquiz-unlock")) {
        const style = page.createElement("style");
        style.id = "autoquiz-unlock";
        style.textContent = "*{user-select:text !important;-webkit-user-select:text !important}";
        (page.head || page.documentElement).appendChild(style);
      }
      const sweep = () => {
        const roots = FrameProbe.documents(win).map((entry) => entry.doc);
        let cleared = 0;
        for (const root of roots) {
          for (const node of Array.from(root.getElementsByTagName("*"))) {
            for (const event of RESTRICTED_EVENTS) {
              const key = "on" + event;
              if (node[key]) {
                node["__autoquiz_" + key] = node[key];
                node[key] = null;
                cleared += 1;
              }
            }
          }
        }
        return cleared;
      };
      sweep();
      if (_PatrolShield.sweepTimer) clearInterval(_PatrolShield.sweepTimer);
      _PatrolShield.sweepTimer = setInterval(sweep, 1e4);
      installed.push("unlock");
      if (level >= 2) {
        if (!win.__AUTOQUIZ_POSTMESSAGE_HOOKED__) {
          win.__AUTOQUIZ_POSTMESSAGE_HOOKED__ = 1;
          const raw = win.postMessage;
          win.postMessage = function(message, targetOrigin, transfer) {
            let payload = message;
            if (typeof payload === "string" && payload.includes('"toggle":true')) {
              payload = payload.replace(/"toggle"\s*:\s*true/g, '"toggle":false');
            }
            return raw.call(this, payload, targetOrigin, transfer);
          };
          _PatrolShield.restores.push(() => {
            win.postMessage = raw;
            win.__AUTOQUIZ_POSTMESSAGE_HOOKED__ = 0;
          });
        }
        try {
          if (!page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__) {
            page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__ = 1;
            page.__AUTOQUIZ_RAW_HAS_FOCUS__ = page.hasFocus;
            page.hasFocus = () => true;
            _PatrolShield.restores.push(() => {
              page.hasFocus = page.__AUTOQUIZ_RAW_HAS_FOCUS__;
              page.__AUTOQUIZ_HAS_FOCUS_SPOOFED__ = 0;
            });
          }
        } catch (e) {
        }
        installed.push("postMessage + hasFocus");
      }
      if (level >= 3) {
        const signatures = options.signatures || ["checkoutNotTrustScript"];
        if (!win.__AUTOQUIZ_TIMER_HOOKED__) {
          win.__AUTOQUIZ_TIMER_HOOKED__ = 1;
          const originalInterval = win.setInterval;
          const originalTimeout = win.setTimeout;
          const suspicious = (stack) => signatures.some((signature) => stack && stack.includes(signature));
          win.setInterval = function(handler, delay, ...args) {
            if (suspicious(new Error().stack)) return -1;
            return originalInterval.call(this, handler, delay, ...args);
          };
          win.setTimeout = function(handler, delay, ...args) {
            if (suspicious(new Error().stack)) return -1;
            return originalTimeout.call(this, handler, delay, ...args);
          };
          _PatrolShield.restores.push(() => {
            win.setInterval = originalInterval;
            win.setTimeout = originalTimeout;
            win.__AUTOQUIZ_TIMER_HOOKED__ = 0;
          });
        }
        installed.push("timerGuard");
      }
      if (log) log.info("防巡查已开启到第 " + level + " 档（" + installed.join(" / ") + "）");
      return { installed };
    }
    // 降档要还原
    static uninstall(context2) {
      const win = (context2 || {}).win || PAGE_WINDOW;
      if (!HAS_DOM || !win) return false;
      if (_PatrolShield.sweepTimer) {
        clearInterval(_PatrolShield.sweepTimer);
        _PatrolShield.sweepTimer = null;
      }
      const page = win.document;
      if (page) {
        for (const event of RESTRICTED_EVENTS) {
          const key = "on" + event;
          if (page["__autoquiz_" + key]) {
            page[key] = page["__autoquiz_" + key];
            try {
              delete page["__autoquiz_" + key];
            } catch (e) {
              page["__autoquiz_" + key] = null;
            }
          } else if (page[key]) page[key] = null;
        }
        const style = page.getElementById && page.getElementById("autoquiz-unlock");
        if (style && style.remove) style.remove();
      }
      while (_PatrolShield.restores.length) {
        try {
          _PatrolShield.restores.pop()();
        } catch (e) {
        }
      }
      win.__AUTOQUIZ_PATROL_LEVEL__ = 0;
      return true;
    }
  };
  var SubmitController = class {
    constructor(spec, context2) {
      this.spec = spec;
      this.context = context2;
      this.log = context2.log;
      this.settings = context2.settings;
      this.patched = null;
      this.native = {};
    }
    // 自动过确认框
    install(win) {
      if (!win || win.__AUTOQUIZ_DIALOG_PATCHED__) return;
      try {
        win.__AUTOQUIZ_DIALOG_PATCHED__ = 1;
        this.patched = win;
        this.native = { alert: win.alert, confirm: win.confirm };
        win.confirm = () => true;
        win.alert = (message) => {
          const text = String(message == null ? "" : message);
          this.log.info("页面提示: " + text);
          if (/验证码|滑块|登录失效|请先登录|风险/.test(text)) {
            this.context.requestPause && this.context.requestPause("页面出现风控提示: " + text);
          }
        };
      } catch (e) {
        this.log.warn("对话框接管失败: " + e.message);
      }
    }
    // 撤走要还回原函数
    uninstall() {
      const win = this.patched;
      if (!win) return false;
      this.patched = null;
      ["alert", "confirm"].forEach((name) => {
        const original = this.native[name];
        if (typeof original === "function") win[name] = original;
        else delete win[name];
      });
      delete win.__AUTOQUIZ_DIALOG_PATCHED__;
      return true;
    }
    // 调站点全局函数
    callGlobals(names, win) {
      const list = names || [];
      const called = [];
      for (const name of list) {
        if (typeof win[name] === "function") {
          try {
            win[name]();
            called.push(name);
          } catch (e) {
            this.log.warn(`调用站点函数 ${name}() 失败: ${e.message}`);
          }
        }
      }
      return called;
    }
    // 点按钮
    clickButton(target, win) {
      const page = win && win.document;
      if (!target || !page) return false;
      const button = FrameProbe.pick(target, page);
      if (!button) return false;
      try {
        button.click();
        return true;
      } catch (e) {
        return false;
      }
    }
    // 保存
    async save(win) {
      const submit = this.spec.submit || {};
      const called = this.callGlobals(submit.saveGlobals, win);
      if (called.length) return { ok: true, via: called.join(",") };
      if (this.clickButton(submit.saveButton, win)) return { ok: true, via: "saveButton" };
      return { ok: false, via: "none" };
    }
    // 提交
    async submit(win) {
      const submit = this.spec.submit || {};
      const called = this.callGlobals(submit.globals, win);
      if (called.length) return { ok: true, via: called.join(",") };
      if (this.clickButton(submit.button, win)) return { ok: true, via: "button" };
      return { ok: false, via: "none" };
    }
    // 清交卷确认层
    dismissConfirm(win) {
      const selector = (this.spec.submit || {}).confirm;
      if (!selector) return false;
      const page = win && win.document || (HAS_DOM ? document : null);
      const layer = FrameProbe.queryAll(selector, page)[0] || null;
      if (!layer || !FrameProbe.visible(layer)) return false;
      const confirmButton = FrameProbe.byText("button, a, .btn, [class*=btn]", ["确定", "确认", "提交", "是的"], layer)[0];
      if (confirmButton) {
        try {
          confirmButton.click();
        } catch (e) {
        }
      }
      if (FrameProbe.visible(layer)) {
        try {
          layer.style.display = "none";
        } catch (e) {
        }
      }
      return true;
    }
    // 收尾交卷
    async finish(win, results, info) {
      const mode = this.settings.submitMode;
      const total = results.length;
      const resolved = results.filter((entry) => entry && entry.finish).length;
      const rate = total ? resolved / total * 100 : 0;
      const report = { rate, mode, action: "none" };
      if (mode === "none") return report;
      const guardPage = win && win.document || (HAS_DOM ? document : null);
      if (RiskGate.blocking(guardPage)) {
        report.action = "blocked";
        return report;
      }
      const submit = this.spec.submit || {};
      const wired = !!(submit.globals || []).length || !!(submit.saveGlobals || []).length || !!submit.button || !!submit.saveButton;
      if (!wired) {
        report.action = "manual";
        return report;
      }
      if (mode === "submit" || mode === "gate" && rate >= this.settings.submitRateGate) {
        await jitter([500, 1200]);
        const per = this.settings.submitMinSecondsPerQuestion || 0;
        const elapsed = (info || {}).elapsedMs;
        if (per && results.length && elapsed != null) {
          const need = results.length * per * 1e3 - elapsed;
          if (need > 0) {
            this.log.info(`按平台习惯还需停留 ${Math.ceil(need / 1e3)} 秒才能交卷`);
            await sleep(need);
          }
        }
        const outcome = await this.submit(win);
        report.action = outcome.ok ? "submit:" + outcome.via : "submit-failed";
        if (outcome.ok) {
          await sleep(600);
          report.confirm = this.dismissConfirm(win);
        } else {
          const fallback = await this.save(win);
          report.action = fallback.ok ? "save-fallback" : "nothing";
        }
        return report;
      }
      const saved = await this.save(win);
      report.action = saved.ok ? "save:" + saved.via : "save-failed";
      return report;
    }
  };

  // Engine.ts
  var QuizEngine = class _QuizEngine {
    constructor(options) {
      this.spec = options.spec;
      this.settings = options.settings;
      this.store = options.store;
      this.log = options.log;
      this.onEvent = options.onEvent || function() {
      };
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
      this.state = "idle";
      this.questions = [];
      this.results = [];
      this.doc = null;
      this.win = null;
      this.abort = false;
      this.pauseReason = "";
      this.listeners = [];
      this.decoder = null;
      this.seenPages = /* @__PURE__ */ new Set();
      this.ocr = null;
      this.ocrMisses = 0;
      this.sessionId = "qa-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 1e6).toString(36);
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
      if (this.settings.jsonCapture && this.settings.jsonCapture !== "off") this.capture.install();
      else this.capture.uninstall();
      return this.capture;
    }
    // 重建源链
    rebuildSources() {
      const context2 = { settings: this.settings, store: this.store, log: this.log };
      this.hub = new AnswerHub();
      this.ensureCapture();
      this.applyProbe();
      Object.assign(context2, { capture: this.capture });
      this.hub.register(new CaptureSource(context2));
      this.hub.register(new PageSource(context2));
      this.hub.register(new CacheSource(context2));
      this.hub.register(new BankSource(context2));
      this.hub.register(new ModelSource(context2));
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
        this.log.info("防巡查已关闭，页面被改过的方法已还原");
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
        if (this.settings.useVueProbe && !useful) this.log.warn("该平台没有接口形态，Vue 取题无处可用（不装全局钩子）");
        return false;
      }
      if (this.vueHooked) return true;
      this.vueHooked = VueProbe.install(PAGE_WINDOW);
      if (this.vueHooked) this.log.info("已注入 Vue 全局 mixin，组件私有数据将并入接口采集");
      return this.vueHooked;
    }
    // Vue 组件补题源
    harvestVue() {
      if (!this.vueHooked || !this.capture) return 0;
      let added = 0;
      const seen = /* @__PURE__ */ new Set();
      const collected = [];
      for (const vm of PAGE_WINDOW[VueProbe.LIST] || []) {
        if (collected.length >= 400) break;
        const data = vm && (vm._data || vm.$data);
        if (!data || typeof data !== "object" || seen.has(data)) continue;
        seen.add(data);
        collected.push(data);
      }
      for (const data of collected) {
        try {
          added += this.capture.ingest(data);
        } catch (e) {
        }
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
        } catch (e) {
        }
      }
    }
    // 识图文本并回题面
    writeOcr(question, text) {
      const literals = (String(question.stem == null ? "" : question.stem).match(/<img[^>]*>/gi) || []).join(" ");
      const parts = [question.plainStem, text].filter(Boolean);
      question.ocrText = text;
      question.stem = parts.join(" ") + (literals ? " " + literals : "");
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
      let text = "";
      try {
        const image = await ImageReader.toInline(url, this.settings, this.win || PAGE_WINDOW);
        text = await this.ensureOcr().recognize(image);
      } catch (e) {
        this.log.warn("识图取图失败: " + e.message);
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
      if (fromVue) this.log.info("从 Vue 组件数据补到 " + fromVue + " 题");
      const located = this.scanner.scan();
      this.questions = located.questions;
      this.doc = located.doc;
      this.win = located.win;
      this.results = new Array(this.questions.length).fill(null);
      this.seenPages = /* @__PURE__ */ new Set();
      this.onEvent("scan", this.summary());
      return this.questions;
    }
    // 派发事件
    emit(type, payload) {
      if (this.onEvent) {
        try {
          this.onEvent(type, payload);
        } catch (e) {
        }
      }
      for (const listener of this.listeners) {
        try {
          listener(type, payload);
        } catch (e) {
        }
      }
    }
    // 席位键按域名
    sessionHost() {
      const win = this.win || PAGE_WINDOW;
      try {
        return win && win.location && win.location.hostname || (HAS_DOM ? location.hostname : "") || "local";
      } catch (e) {
        return "local";
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
          onConflict: () => this.pause("同站已有另一个标签页在作答")
        });
      }
      return this.lock.acquire(this.sessionHost());
    }
    // 开始作答
    start() {
      if (this.state === "running") return;
      this.store.set("stop", false);
      if (!this.questions.length) this.rescan();
      if (!this.questions.length) {
        this.emit("notice", "没有采集到题目");
        return;
      }
      this.abort = false;
      this.state = "running";
      this.startedAt = Date.now();
      this.applyShield();
      this.acquireLock();
      this.submit.install(this.win || PAGE_WINDOW);
      this.emit("state", this.state);
      this.run().catch((e) => {
        this.state = "error";
        this.log.error("主循环异常: " + e.message);
        this.emit("state", this.state);
      });
    }
    // 暂停
    pause(reason) {
      if (this.state !== "running") return;
      this.state = "paused";
      this.pauseReason = reason || "";
      this.store.set("stop", true);
      this.emit("state", this.state);
      if (reason) this.log.warn("已暂停: " + reason);
    }
    // 继续
    resume() {
      this.pauseReason = "";
      this.store.set("stop", false);
      if (this.state === "paused") {
        this.state = "running";
        this.emit("state", this.state);
      }
    }
    // 停止
    stop() {
      this.abort = true;
      this.state = "idle";
      this.store.set("stop", true);
      this.submit.uninstall();
      if (this.lock) {
        this.lock.release(this.sessionHost());
        this.lock = null;
      }
      this.disposeOcr();
      this.emit("state", this.state);
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
      if (!payload || !payload.candidates.length) return { finish: false, reason: "no-answer" };
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
      if (this.capture && question.captured === void 0) question.captured = this.capture.match(question);
      if (question.type === QuestionType.UNKNOWN && question.captured && question.captured.typeLabel != null && question.captured.typeLabel !== "") {
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
      }).some((source) => source.tier() === "fallback")) {
        const extra = await this.hub.fetch(question, true);
        if (extra.candidates.length) {
          payload = { candidates: payload.candidates.concat(extra.candidates) };
          result = this.resolve(question, payload);
        }
      }
      if (!result.finish && this.settings.fillUnmatched) {
        if (question.type !== QuestionType.COMPLETION && question.options.length) {
          const picked = [Math.floor(random(0, question.options.length))];
          result = { finish: false, forced: true, indices: picked, texts: picked.map((i) => AnswerResolver.optionText(question.options[i])), matched: "random" };
        } else if (question.blanks.length) {
          const texts = this.settings.unmatchedTexts && this.settings.unmatchedTexts.length ? this.settings.unmatchedTexts : ["不会"];
          const picked = question.blanks.map(() => texts[Math.floor(random(0, texts.length))]);
          result = { finish: false, forced: true, texts: picked, matched: "random-text" };
        }
      }
      const record = {
        index: (offset || 0) + index,
        type: question.type,
        stem: question.stem,
        id: question.id,
        candidates: payload.candidates.length,
        node: question.root || null,
        candidateTexts: payload.candidates.slice(0, 4).map((entry) => entry.from + ":" + (entry.answers || []).join(",")),
        finish: !!result.finish,
        forced: !!result.forced,
        from: result.from || "",
        matched: result.matched || result.reason || "",
        texts: result.texts || []
      };
      if (!result.finish && !result.forced) {
        this.log.info(`${question.label()} 未命中（${record.matched}）`);
        this.emit("question", record);
        return record;
      }
      const writeReport = await this.writer.apply(question, result);
      record.written = writeReport.written;
      record.skipped = writeReport.skipped;
      record.failed = writeReport.failed;
      if (result.finish && !result.forced && this.settings.useCache && record.from !== "cache") {
        const group = payload.candidates.find((c) => c.from === record.from);
        this.store.cachePut({
          key: question.cacheKey,
          stem: question.stem,
          answer: group ? group.answers : [String(result.texts.join(" "))],
          type: question.type,
          from: record.from
        });
      }
      this.log.info(`${question.label()} → ${result.texts.join(" / ") || (result.indices || []).join(",")} [${record.from || "-"}/${record.matched}] 写入${writeReport.written}`);
      this.emit("question", record);
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
        rate: total ? answered / total * 100 : 0,
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
      const pending = /* @__PURE__ */ new Map();
      let produced = 0;
      let consumed = 0;
      const produce = () => {
        while (produced < total && pending.size < lanes) {
          const index = produced++;
          const question = this.questions[index];
          if (this.settings.skipDone && this.skipDone(question)) {
            this.results[offset + index] = { index: offset + index, type: question.type, finish: false, matched: "already-done", stem: question.stem, candidates: 0 };
            this.emit("question", this.results[offset + index]);
            continue;
          }
          pending.set(index, this.fetchFor(index));
        }
      };
      produce();
      while (consumed < total) {
        if (this.abort) break;
        if (!!this.store.get("stop", false)) this.state = "paused";
        while (!this.abort && (this.state === "paused" || !!this.store.get("stop", false))) {
          if (this.state !== "paused") this.state = "running";
          await sleep(500);
        }
        if (this.abort) break;
        if (!await RiskGate.wait(this.doc || (HAS_DOM ? document : null), { log: this.log, aborted: () => this.abort })) {
          this.pause("等待人工验证超时");
          break;
        }
        const task = pending.get(consumed);
        let payload = { candidates: [] };
        if (task) {
          const outcome = await withTimeout(task, this.settings.searchTimeoutMs + 4e3, "取答案");
          payload = outcome.ok ? outcome.value : { candidates: [] };
          pending.delete(consumed);
        }
        try {
          this.results[offset + consumed] = await this.answerOne(consumed, payload, offset);
        } catch (e) {
          this.log.error(`${this.questions[consumed].label()} 作答异常: ${e.message}`);
          this.results[offset + consumed] = { index: offset + consumed, finish: false, matched: "exception", candidates: 0 };
        }
        consumed += 1;
        produce();
        this.emit("progress", this.summary());
        await jitter(this.settings.questionDelay);
      }
    }
    // 页面签名
    static signatureOf(questions) {
      return (questions || []).map((question) => question.id || TextSanitizer.key(question.stem).slice(0, 12)).join("|");
    }
    // 翻下一页
    async advancePage() {
      const pager = this.spec.pager;
      if (!pager || !this.doc) return false;
      const before = _QuizEngine.signatureOf(this.questions);
      const target = FrameProbe.pick(pager.next, this.doc);
      if (!target) return false;
      this.writer.click(target);
      const deadline = Date.now() + (pager.timeoutMs || 6e3);
      let scanned = null;
      for (; ; ) {
        const page = this.scanner.scan();
        if (page.questions.length && _QuizEngine.signatureOf(page.questions) !== before) {
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
      const signature = _QuizEngine.signatureOf(this.questions);
      if (this.seenPages.has(signature)) {
        this.log.warn("翻页回到已作答过的同一页，停止推进");
        return false;
      }
      this.seenPages.add(signature);
      this.emit("page", this.summary());
      return true;
    }
    // 主循环
    async run() {
      const firstCard = (this.spec.submit || {}).firstCard;
      if (firstCard && this.doc) {
        const first = FrameProbe.queryAll(firstCard, this.doc)[0];
        if (first) this.writer.click(first);
      }
      const maxPages = this.spec.pager ? Math.max(1, this.settings.maxPages || 80) : 1;
      for (let page = 0; page < maxPages; page++) {
        if (this.abort) break;
        this.seenPages.add(_QuizEngine.signatureOf(this.questions));
        await this.runPage(this.results.length - this.questions.length);
        if (this.abort || !this.spec.pager) break;
        if (page + 1 >= maxPages) {
          this.log.info(`已达翻页上限 ${maxPages} 页，停止继续推进`);
          break;
        }
        if (!await this.advancePage()) break;
      }
      if (!this.abort) {
        const actionLabels = {
          none: "按要求未做提交动作",
          manual: "该平台未接提交入口，请自行核对后交卷",
          "save-failed": "保存失败，请手动保存",
          "submit-failed": "交卷失败，请手动交卷",
          blocked: "页面正在要求验证，已暂停提交，请人工完成验证"
        };
        this.state = "done";
        const submitConfig = this.spec.submit || {};
        if (submitConfig.answerCard && this.doc && this.results.filter(Boolean).length) {
          const items = FrameProbe.queryAll(submitConfig.answerCard, this.doc);
          for (let i = 0; i < items.length; i++) {
            if (this.abort) break;
            if (!await RiskGate.wait(this.doc, { log: this.log, timeoutMs: 6e4, aborted: () => this.abort })) break;
            this.writer.click(items[i]);
            await sleep(500);
            if (submitConfig.answerCardNext) {
              FrameProbe.queryAll(submitConfig.answerCardNext, this.doc).forEach((node) => this.writer.click(node));
            }
            await sleep(1e3);
          }
          if (items.length) this.log.info("答题卡已回扫 " + items.length + " 题（逐题触发保存）");
        }
        const summary = this.summary();
        const submitReport = await this.submit.finish(this.win || PAGE_WINDOW, this.results.filter(Boolean), { elapsedMs: Date.now() - (this.startedAt || Date.now()) });
        this.log.info(`完成：${summary.answered}/${summary.total} 题命中，${actionLabels[submitReport.action] || submitReport.action}`);
        this.emit("finish", Object.assign({ submit: submitReport }, summary));
      } else {
        this.state = "idle";
        this.emit("state", this.state);
      }
      return this.summary();
    }
  };

  // Boot.ts
  var INSTANCE = null;
  function scheduleBoot() {
    let tries = 0;
    let timer = null;
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const attempt = () => {
      tries += 1;
      Promise.resolve().then(async () => {
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
          log.info(`已识别平台「${spec.name}」，采集到 ${questions.length} 题（${unique(questions.map((q) => q.type)).join("/")}）`);
          INSTANCE = { engine, panel, spec, store, log, settings };
          shareContext({ settings, log });
          if (settings.autoStart) engine.start();
          return INSTANCE;
        } catch (e) {
          INSTANCE = null;
          throw e;
        }
      }).then((instance) => {
        if (instance) stop();
      }).catch((e) => console.warn("[autoquiz] 启动失败:", e && e.message));
      try {
        AddonLoop.obtain(document);
      } catch (e) {
      }
      if (tries > 40) stop();
    };
    timer = setInterval(attempt, 3e3);
    attempt();
  }

  // Entry.ts
  if (HAS_DOM) {
    try {
      syncHooks(new Store(NAMESPACE).settings());
    } catch (e) {
    }
  }
  if (HAS_DOM && !PAGE_WINDOW.__AUTOQUIZ_LOADED__) {
    PAGE_WINDOW.__AUTOQUIZ_LOADED__ = VERSION;
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", scheduleBoot);
    else scheduleBoot();
  }
})();
