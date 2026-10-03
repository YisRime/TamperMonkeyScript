// 配置域的全部：默认设置表、GM 存储的读写与答案/识图缓存表
import { GM, NAMESPACE, shortHash } from "./Utils.ts";

export const DEFAULT_SETTINGS = {
  enabled: true,
  autoStart: false,
  lanes: 2,
  questionDelay: [800, 1800],
  optionDelay: [120, 260],
  searchTimeoutMs: 12000,
  singleThreshold: 0.65,
  multipleThreshold: 0.6,
  cacheFuzzyThreshold: 0.92,
  cacheMaxEntries: 300,
  answerSeparators: ['===', '###', '#', '---', '|', ';', '；', '\n'],
  joinBlanks: ' ',
  maxPages: 80,
  useCache: true,
  usePageAnswer: true,
  useTiku: true,
  skipDone: true,
  fillUnmatched: false,
  unmatchedTexts: ['不会', '不知道', '不清楚', '不懂', '不会写'],
  usePointerChain: false,
  jsonCapture: 'off',
  enableFontDecode: true,
  antiPatrolLevel: 0,
  tikuToken: '111',
  tikuEndpoints: null,
  useAi: false,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  aiEndpoints: null,
  aiTimeoutMs: 20000,
  useOcr: false,
  ocrLangs: 'chi_sim+eng',
  ocrLangPath: '',
  ocrCdn: null,
  ocrImageSelector: '',
  ocrMinImageEdge: 64,
  ocrMinStemChars: 6,
  ocrMaxEdge: 1600,
  ocrLoadTimeoutMs: 20000,
  ocrFetchTimeoutMs: 20000,
  ocrTimeoutMs: 45000,
  maxRetry: 2,
  submitMode: 'save',
  submitRateGate: 80,
  submitMinSecondsPerQuestion: 4,
  useVideoRate: false,
  videoRate: 1.5,
  videoKeepPlaying: false,
  useForum: false,
  forumTexts: '',
  useVueProbe: false,
  useResponseTamper: false,
  useKeepAlive: false,
  useSingleTab: true,
  showPanel: true
};

// 存储
export class Store {
  declare memo: any;
  declare prefix: any;

  constructor(namespace) {
    this.prefix = (namespace || NAMESPACE) + '.';
    this.memo = new Map();
  }

  // 读
  get(name, fallback) {
    const isHeavy = name === 'cache' || name === 'ocr';
    const raw = isHeavy && this.memo.has(name) ? this.memo.get(name) : GM.getValue(this.prefix + name, undefined);
    if (isHeavy) this.memo.set(name, raw === undefined ? '' : raw);
    if (raw === undefined || raw === null || raw === '') return fallback;
    if (fallback !== null && typeof fallback !== typeof raw && typeof fallback === 'object' && fallback !== null) {
      try {
        return Object.assign(Array.isArray(fallback) ? [] : {}, fallback, typeof raw === 'string' ? JSON.parse(raw) : raw);
      } catch (e) {
        return fallback;
      }
    }
    return raw;
  }

  // 写
  set(name, value) {
    GM.setValue(this.prefix + name, value);
    if (name === 'cache' || name === 'ocr') this.memo.set(name, value);
    return value;
  }

  // 合并配置
  settings(overrides?) {
    const base = Object.assign({}, DEFAULT_SETTINGS, overrides || {});
    const saved = this.get('settings', {});
    const merged = Object.assign({}, base);
    for (const name of Object.keys(base)) {
      if (saved && Object.prototype.hasOwnProperty.call(saved, name) && saved[name] !== undefined) merged[name] = saved[name];
    }
    return merged;
  }

  // 答案缓存表
  cacheList() {
    const list = this.get('cache', []);
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
    this.set('cache', list);
    return true;
  }

  // 识图缓存表
  ocrGet(url) {
    const map = this.get('ocr', {});
    const hit = map[shortHash(url)];
    return typeof hit === 'string' ? hit : '';
  }

  // 写识图
  ocrPut(url, text) {
    if (!url || !text) return false;
    const map = Object.assign({}, this.get('ocr', {}));
    map[shortHash(url)] = String(text);
    const names = Object.keys(map);
    if (names.length > 200) names.slice(200).forEach((name) => delete map[name]);
    this.set('ocr', map);
    return true;
  }
}
