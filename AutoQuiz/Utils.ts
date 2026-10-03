// Utils：全脚本共用的常量、通用工具、日志、HTTP 出口与题型词表
export const VERSION = '1.0.0';

export const NAMESPACE = 'autoquiz';

export const HAS_DOM = typeof window !== 'undefined' && typeof document !== 'undefined';

export const PAGE_WINDOW = HAS_DOM && typeof unsafeWindow !== 'undefined' ? unsafeWindow : HAS_DOM ? window : globalThis;

const MEMORY_FALLBACK = new Map();

export const GM = {
  getValue: typeof GM_getValue === 'function' ? GM_getValue : (k, d) => (MEMORY_FALLBACK.has(k) ? MEMORY_FALLBACK.get(k) : d),
  setValue: typeof GM_setValue === 'function' ? GM_setValue : (k, v) => void MEMORY_FALLBACK.set(k, v),
  xmlHttp: typeof GM_xmlhttpRequest === 'function' ? GM_xmlhttpRequest : null
};

// 随机数
export const random = (min, max) => min + Math.random() * (max - min);

// 睡眠
export const sleep = (duration) => new Promise((resolve) => setTimeout(resolve, Math.max(0, duration | 0)));

// 分块转字符串
export function toBase64(bytes) {
  if (!(bytes instanceof Uint8Array)) bytes = new Uint8Array(bytes || []);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  if (typeof btoa === 'function') return btoa(binary);
  if (typeof Buffer !== 'undefined') return Buffer.from(bytes).toString('base64');
  throw new Error('无 base64 环境');
}

// 抖动延迟
export const jitter = (range) => {
  const pair = Array.isArray(range) ? range : [range, range];
  return sleep(random(pair[0], pair[1]));
};

// 统一 IO 出口
export function withTimeout(promise, budget, label?): Promise<{ ok: boolean; value?: any; error?: any }> {
  return Promise.race([
    Promise.resolve(promise).then(
      (value) => ({ ok: true, value }),
      (e) => ({ ok: false, error: e && e.message ? e.message : String(e) })
    ),
    sleep(Math.max(1, budget | 0)).then(() => ({ ok: false, error: label || 'timeout' }))
  ]);
}

// 稳定去重
export function unique(list) {
  const seen = new Set();
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

const MD5_SHIFT = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
];

const MD5_K = (() => {
  const table = [];
  for (let i = 0; i < 64; i++) table.push(Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) | 0);
  return table;
})();

// MD5 摘要
export function md5Hex(input) {
  const text = String(input);
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let code = text.charCodeAt(i);
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
    } else if (code >= 0xd800 && code < 0xdc00 && i + 1 < text.length && text.charCodeAt(i + 1) >= 0xdc00 && text.charCodeAt(i + 1) < 0xe000) {
      code = 0x10000 + (((code & 0x3ff) << 10) | (text.charCodeAt(i + 1) & 0x3ff));
      i += 1;
      bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 63), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    } else {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 63), 0x80 | (code & 63));
    }
  }
  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const low = bitLength % 4294967296;
  const high = Math.floor(bitLength / 4294967296);
  bytes.push(low & 255, (low >>> 8) & 255, (low >>> 16) & 255, (low >>> 24) & 255, high & 255, (high >>> 8) & 255, (high >>> 16) & 255, (high >>> 24) & 255);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  const words = new Array(16);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) {
      const p = offset + i * 4;
      words[i] = bytes[p] | (bytes[p + 1] << 8) | (bytes[p + 2] << 16) | (bytes[p + 3] << 24);
    }
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + MD5_K[i] + words[g]) | 0;
      A = D;
      D = C;
      C = B;
      const shifted = (F << MD5_SHIFT[i]) | (F >>> (32 - MD5_SHIFT[i]));
      B = (B + shifted) | 0;
    }
    a0 = (a0 + A) | 0;
    b0 = (b0 + B) | 0;
    c0 = (c0 + C) | 0;
    d0 = (d0 + D) | 0;
  }
  let hex = '';
  for (const word of [a0, b0, c0, d0]) {
    for (let i = 0; i < 4; i++) hex += (((word >>> (i * 8)) & 255) + 0x100).toString(16).slice(1);
  }
  return hex;
}

// 短指纹缓存键
export function shortHash(input) {
  return md5Hex(String(input || '')).slice(0, 16);
}

// 日志
export class Logger {
  declare limit: any;
  declare listeners: any;
  declare mirror: any;
  declare records: any;

  constructor(options: any = {}) {
    this.limit = options.limit || 300;
    this.mirror = options.mirror !== false;
    this.records = [];
    this.listeners = new Set();
  }

  // 订阅
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  // 写一条
  push(level, args) {
    const text = Array.from(args)
      .map((a) => {
        if (typeof a === 'string') return a;
        try {
          return JSON.stringify(a);
        } catch (e) {
          return String(a);
        }
      })
      .join(' ');
    const record = { at: Date.now(), level, text };
    this.records.push(record);
    if (this.records.length > this.limit) this.records.splice(0, this.records.length - this.limit);
    if (this.mirror && HAS_DOM && console) {
      const print = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
      if (print) print.call(console, '[' + NAMESPACE + '] ' + text);
    }
    for (const listener of this.listeners) {
      try {
        listener(record);
      } catch (e) {}
    }
    return record;
  }

  // 变参包装
  log(...args: any[]) { return this.push('log', args); }
  // 信息级
  info(...args: any[]) { return this.push('info', args); }
  // 警告级
  warn(...args: any[]) { return this.push('warn', args); }
  // 错误级
  error(...args: any[]) { return this.push('error', args); }
}

// HTTP 出口
export class Http {
  // 状态码说人话
  static statusHint(status) {
    const hints = {
      403: '403 禁止访问（可能被网关或代理拦截）',
      404: '404 接口不存在（检查端点 URL）',
      415: '415 内容类型不被接受（检查 contentType）',
      429: '429 请求过于频繁（调低并发或稍后再试）',
      444: '444 连接被服务端关闭（疑似封 IP）'
    };
    if (hints[status]) return hints[status];
    if (status >= 500) return status + ' 服务端错误';
    return 'HTTP ' + status;
  }

  // 统一发送口
  static request(details) {
    const asBinary = !!details.responseType;
    return new Promise((resolve, reject) => {
      if (!GM.xmlHttp) {
        reject(new Error('缺少 GM_xmlhttpRequest 权限'));
        return;
      }
      GM.xmlHttp(
        Object.assign({}, details, {
          timeout: details.timeout || (asBinary ? 20000 : 15000),
          onload: (response) => {
            if (response.status < 200 || response.status >= 300) {
              reject(new Error(asBinary ? 'HTTP ' + response.status : Http.statusHint(response.status)));
              return;
            }
            if (asBinary) {
              resolve(response.response || response.responseText);
              return;
            }
            let data = response.responseJSON !== undefined ? response.responseJSON : response.response;
            if (data === undefined || data === null) data = response.responseText;
            if (typeof data === 'string') {
              try {
                data = JSON.parse(data);
              } catch (e) {}
            }
            resolve({ data, raw: response.responseText, status: response.status, headers: response.responseHeaders });
          },
          onerror: (response) => reject(new Error(response && response.status ? Http.statusHint(response.status) : '网络错误')),
          ontimeout: () => reject(new Error('请求超时'))
        })
      );
    });
  }
}

export const QuestionType = {
  SINGLE: 'single',
  MULTIPLE: 'multiple',
  JUDGEMENT: 'judgement',
  COMPLETION: 'completion',
  MATCH: 'match',
  UNKNOWN: 'unknown'
};

export const TYPE_LABELS = {
  单选题: QuestionType.SINGLE, 单选: QuestionType.SINGLE, 单项选择题: QuestionType.SINGLE, 单项选择: QuestionType.SINGLE, singlechoice: QuestionType.SINGLE,
  多选题: QuestionType.MULTIPLE, 多选: QuestionType.MULTIPLE, 多项选择题: QuestionType.MULTIPLE, 多项选择: QuestionType.MULTIPLE, 不定项选择: QuestionType.MULTIPLE,
  multichoice: QuestionType.MULTIPLE, 案例分析: QuestionType.MULTIPLE,
  判断题: QuestionType.JUDGEMENT, 判断: QuestionType.JUDGEMENT, 对错: QuestionType.JUDGEMENT, 对错题: QuestionType.JUDGEMENT, 判断正误: QuestionType.JUDGEMENT,
  judgement: QuestionType.JUDGEMENT, bijudgement: QuestionType.JUDGEMENT,
  填空题: QuestionType.COMPLETION, 填空: QuestionType.COMPLETION, 主观填空: QuestionType.COMPLETION,
  简答题: QuestionType.COMPLETION, 问答题: QuestionType.COMPLETION, 主观题: QuestionType.COMPLETION, 名词解释: QuestionType.COMPLETION,
  论述题: QuestionType.COMPLETION, 计算题: QuestionType.COMPLETION, 分录题: QuestionType.COMPLETION, 资料题: QuestionType.COMPLETION,
  阅读理解: QuestionType.MATCH, 选词填空: QuestionType.MATCH, 匹配题: QuestionType.MATCH, 连线题: QuestionType.MATCH, 连线: QuestionType.MATCH,
  完形填空: QuestionType.MATCH, 完型填空: QuestionType.MATCH
};
