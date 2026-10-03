// 图像域：混淆字体还原、识图取文与划选搜题
import { FrameProbe, TextSanitizer } from "./Probe.ts";
import { Http, md5Hex, HAS_DOM, Logger, PAGE_WINDOW, toBase64, withTimeout, QuestionType, unique } from "./Utils.ts";
import { Question } from "./Solve.ts";

// 轮廓指纹还原
export class FontDecoder {
  static tables = new Map();

  declare log: any;
  declare mapCache: any;
  declare observer: any;
  declare spec: any;
  declare tablePromise: any;

  constructor(spec, context) {
    this.spec = spec;
    this.log = (context && context.log) || null;
    this.mapCache = new Map();
    this.observer = null;
    this.tablePromise = null;
  }

  // 字体 spec
  get fontSpec() {
    return this.spec.font || null;
  }

  // 解析字体
  static parseFont(buffer) {
    const readU16 = (at) => (buffer[at] << 8) | buffer[at + 1];
    const readS16 = (at) => {
      const value = readU16(at);
      return value & 32768 ? value - 65536 : value;
    };
    const readU32 = (at) => ((buffer[at] << 24) | (buffer[at + 1] << 16) | (buffer[at + 2] << 8) | buffer[at + 3]) >>> 0;

    const numTables = readU16(4);
    let cursor = 12;
    const tables: any = {};
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
            glyph = (ch + delta) & 65535;
          } else {
            const raw = readU16(rangeOff + s * 2 + range + (ch - startCode) * 2);
            glyph = raw === 0 ? 0 : (raw + delta) & 65535;
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
    const glyph: any = { contours: readS16(cursor) };
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
      glyph.xs = FontDecoder.readDeltas(font, glyph, pointCount, cursor, true);
      cursor = glyph.afterX;
      glyph.ys = FontDecoder.readDeltas(font, glyph, pointCount, cursor, false);
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
          first = (buffer[cursor] << 24) >> 24;
          cursor += 1;
          second = (buffer[cursor] << 24) >> 24;
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
  static buildPath(font, glyphIndex, path?) {
    const target = path || { cmds: [], crds: [] };
    const glyph = FontDecoder.parseGlyf(font, glyphIndex);
    if (!glyph) return target;
    if (glyph.contours > 0) {
      FontDecoder.simplePath(glyph, target);
      return target;
    }
    for (const part of glyph.parts || []) {
      const child = FontDecoder.buildPath(font, part.glyphIndex);
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
              path.cmds.push('M');
              path.crds.push(glyph.xs[prev], glyph.ys[prev]);
            } else {
              path.cmds.push('M');
              path.crds.push(x, y);
              continue;
            }
          } else if (prevOn) {
            path.cmds.push('M');
            path.crds.push(glyph.xs[prev], glyph.ys[prev]);
          } else {
            path.cmds.push('M');
            path.crds.push(Math.floor((glyph.xs[prev] + x) * 0.5), Math.floor((glyph.ys[prev] + y) * 0.5));
          }
        }
        if (onCurve) {
          if (prevOn) {
            path.cmds.push('L');
            path.crds.push(x, y);
          }
        } else if (nextOn) {
          path.cmds.push('Q');
          path.crds.push(x, y, glyph.xs[next], glyph.ys[next]);
        } else {
          path.cmds.push('Q');
          path.crds.push(x, y, Math.floor((x + glyph.xs[next]) * 0.5), Math.floor((y + glyph.ys[next]) * 0.5));
        }
      }
      path.cmds.push('Z');
    }
  }

  // 拉对照表
  async loadTable() {
    if (FontDecoder.tables.has(this.spec.key) && FontDecoder.tables.get(this.spec.key)) {
      return FontDecoder.tables.get(this.spec.key);
    }
    if (this.tablePromise) return this.tablePromise;
    const font = this.fontSpec;
    this.tablePromise = (async () => {
      let raw = null;
      if (font.resource && typeof GM_getResourceText === 'function') {
        try {
          raw = GM_getResourceText(font.resource);
        } catch (e) {
          raw = null;
        }
      }
      if (!raw && font.url) {
        const response: any = await Http.request({ method: 'get', url: font.url, timeout: 30000 });
        raw = typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
      }
      if (!raw) throw new Error('字体指纹对照表不可用');
      const table = typeof raw === 'string' ? JSON.parse(raw) : raw;
      FontDecoder.tables.set(this.spec.key, table);
      if (this.log) this.log.info('字体指纹表已载入，覆盖 ' + Object.keys(table).length + ' 个轮廓');
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
    const children: any[] = node.childNodes ? Array.from(node.childNodes) : [];
    for (const child of children) {
      const isText = child.nodeType === 3 || String(child.tagName || '').toUpperCase() === '#TEXT';
      if (isText) {
        const source = child.nodeValue != null ? child.nodeValue : String(child.textContent || '');
        let out = '';
        let hit = false;
        for (let i = 0; i < source.length; i++) {
          const code = source.charCodeAt(i);
          if (map[code] !== undefined) {
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
        if (FontDecoder.rewriteText(child, map)) changed = true;
      }
    }
    return changed;
  }

  // 常驻补解：捞内联字体 → 建映射（字体只算一次）→ 就地还原并摘类
  async install(doc) {
    const font = this.fontSpec;
    if (!font || !(font.url || font.resource) || !doc) return false;
    const selector = '.' + (font.cssClass || 'font-cxsecret');
    const run = async () => {
      if (!FrameProbe.queryAll(selector, doc).length) return 0;
      const fonts = [];
      for (const style of FrameProbe.queryAll('style', doc)) {
        const css = style.textContent || '';
        if (!css.includes(font.cssClass || 'font-cxsecret')) continue;
        const match = css.match(/base64,([A-Za-z0-9+/=]+)/);
        if (match && fonts.indexOf(match[1]) < 0) fonts.push(match[1]);
      }
      if (!fonts.length) return 0;
      let table;
      try {
        table = await this.loadTable();
      } catch (e) {
        if (this.log) this.log.warn('字体指纹表不可用，乱码题干将无法命中: ' + e.message);
        return 0;
      }
      const maps = fonts.map((base64) => {
        if (this.mapCache.has(base64)) return this.mapCache.get(base64);
        let map = null;
        try {
          if (typeof atob !== 'function') throw new Error('缺少 atob，无法解码字体');
          const binary = atob(base64);
          const buffer = new Uint8Array(binary.length);
          for (let i = 0; i < binary.length; i++) buffer[i] = binary.charCodeAt(i);
          const parsed = FontDecoder.parseFont(buffer);
          if (parsed) {
            map = {};
            for (const codeText of Object.keys(parsed.map)) {
              const code = Number(codeText);
              const real = table[md5Hex(JSON.stringify(FontDecoder.buildPath(parsed, parsed.map[code]))).slice(24)];
              if (real) map[code] = String.fromCharCode(real);
            }
          }
        } catch (e) {
          if (this.log) this.log.warn('字体解析失败: ' + e.message);
          map = null;
        }
        this.mapCache.set(base64, map);
        return map;
      }).filter(Boolean);
      const merged = Object.assign({}, ...maps);
      if (!Object.keys(merged).length) return 0;
      let count = 0;
      for (const node of FrameProbe.queryAll(selector, doc)) {
        if (FontDecoder.rewriteText(node, merged)) count += 1;
        if (node.classList && node.classList.remove) node.classList.remove(font.cssClass || 'font-cxsecret');
      }
      return count;
    };
    const first = await run();
    if (HAS_DOM && typeof MutationObserver === 'function' && doc.body && !this.observer) {
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
    if (this.log) this.log.info('混淆字体解码' + (first ? `：已还原 ${first} 处` : '：已就位，等待字体节点'));
    return true;
  }
}

// 识图三段一条链
export class ImageReader {
  declare context: any;
  declare lib: any;
  declare loading: any;
  declare log: any;
  declare settings: any;
  declare worker: any;

  constructor(context) {
    this.context = context || {};
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
        reject(new Error('无 DOM 环境'));
        return;
      }
      const el = page.createElement('script');
      el.src = url;
      el.async = true;
      let settled = false;
      let timer = null;
      const settle = (then, drop?) => () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (drop && el.remove) el.remove();
        then();
      };
      timer = setTimeout(settle(() => reject(new Error('加载超时')), true), Math.max(1000, timeoutMs | 0));
      el.onload = settle(resolve);
      el.onerror = settle(() => reject(new Error('脚本加载失败')), true);
      (page.head || page.documentElement || page.body).appendChild(el);
    });
  }

  // 加载引擎
  async load() {
    if (this.lib) return this.lib;
    if (this.loading) return this.loading;
    const win = this.context.win || PAGE_WINDOW;
    const hostLib = win && win.Tesseract;
    const existing = hostLib && typeof hostLib.createWorker === 'function' ? hostLib : null;
    if (existing) {
      this.lib = existing;
      return existing;
    }
    const self = this;
    const builtin = [
      'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
      'https://unpkg.com/tesseract.js@5/dist/tesseract.min.js',
      'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.min.js'
    ];
    const raw = this.settings.ocrCdn;
    const configured = (Array.isArray(raw) ? raw : String(raw || '').split(',')).map((url) => String(url).trim()).filter((url) => /^https?:\/\//i.test(url));
    const urls = configured.length ? configured : builtin.slice();
    this.loading = (async () => {
      for (const url of urls) {
        const loadTimeout = self.settings.ocrLoadTimeoutMs;
        const outcome = await withTimeout(ImageReader.injectScript(win, url, loadTimeout), loadTimeout, url);
        if (!outcome.ok) {
          self.log.warn('OCR 引擎加载失败(' + url + '): ' + outcome.error);
          continue;
        }
        const ready = win && win.Tesseract;
        const lib = ready && typeof ready.createWorker === 'function' ? ready : null;
        if (lib) {
          self.log.info('OCR 引擎已就绪');
          self.lib = lib;
          return lib;
        }
      }
      self.log.warn('OCR 引擎不可用：请检查网络或自配 ocrCdn');
      return null;
    })();
    return this.loading;
  }

  // 识别图片（worker 要复用）
  async recognize(image) {
    if (!this.worker) {
      const lib = await this.load();
      if (!lib) return '';
      const options: any = {};
      if (this.settings.ocrLangPath) options.langPath = this.settings.ocrLangPath;
      this.worker = await lib.createWorker(this.settings.ocrLangs || 'chi_sim+eng', 1, options);
    }
    const worker = this.worker;
    const outcome = await withTimeout(worker.recognize(image), this.settings.ocrTimeoutMs);
    if (!outcome.ok) {
      this.log.warn('识图失败: ' + outcome.error);
      return '';
    }
    const data = outcome.value && outcome.value.data ? outcome.value.data : outcome.value;
    // 压成紧凑文本
    const wide = '\\u4e00-\\u9fff\\u3000-\\u303f\\uff00-\\uffef';
    let text = String(data && data.text ? data.text : '').replace(/\r/g, '\n').replace(/[\t\u00a0\u3000]+/g, ' ');
    text = text.replace(new RegExp(' (?=[' + wide + '])', 'g'), '');
    text = text.replace(new RegExp('([' + wide + ']) ', 'g'), '$1');
    text = text.replace(/ {2,}/g, ' ');
    text = text.replace(/\n{2,}/g, '\n');
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
    if (!node) return '';
    const read = (name) => (node.getAttribute ? node.getAttribute(name) || '' : '');
    return String(read('data-src') || read('data-original') || read('data-original-src') || read('data-echo')
      || node.currentSrc || node.src || read('src') || read('original')).trim();
  }

  // 挑最大题图
  static pickImage(root, settings) {
    if (!root || !root.querySelectorAll) return null;
    const declared = (settings && settings.ocrImageSelector) || '';
    let nodes = declared ? FrameProbe.queryAll(declared, root) : [];
    if (!nodes.length) nodes = FrameProbe.queryAll('img', root);
    const minEdge = (settings && settings.ocrMinImageEdge) || 64;
    let best = null;
    let bestArea = -1;
    nodes.forEach((node) => {
      const read = (name) => Number(node.getAttribute ? node.getAttribute(name) : 0) || 0;
      const width = node.naturalWidth || node.width || read('width');
      const height = node.naturalHeight || node.height || read('height');
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
      const bytes = await Http.request({ url, timeout: settings.ocrFetchTimeoutMs, responseType: 'arraybuffer' });
      const data: any = bytes instanceof Uint8Array ? bytes : new Uint8Array((bytes as any) || []);
      let mime = 'image/png';
      if (data.length > 3 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4e && data[3] === 0x47) mime = 'image/png';
      else if (data.length > 1 && data[0] === 0xff && data[1] === 0xd8) mime = 'image/jpeg';
      else if (data.length > 2 && data[0] === 0x47 && data[1] === 0x49 && data[2] === 0x46) mime = 'image/gif';
      else if (data.length > 1 && data[0] === 0x42 && data[1] === 0x4d) mime = 'image/bmp';
      else if (data.length > 11 && String.fromCharCode(data[8], data[9], data[10], data[11]) === 'WEBP') mime = 'image/webp';
      dataUrl = 'data:' + mime + ';base64,' + toBase64(data);
    }
    // 按需缩放
    const scaled: any = await ImageReader.loadImage(win, dataUrl).catch(() => null);
    if (!scaled) return dataUrl;
    const width = scaled.naturalWidth || scaled.width;
    const height = scaled.naturalHeight || scaled.height;
    const fit = ImageReader.fitSize(width, height, settings.ocrMaxEdge);
    if (fit.scale >= 1) return dataUrl;
    return ImageReader.draw(win, scaled, { x: 0, y: 0, width, height }, fit.width, fit.height) || dataUrl;
  }

  // 解位图
  static loadImage(win, url) {
    return new Promise((resolve, reject) => {
      const ImageClass = win && win.Image;
      if (!ImageClass) {
        reject(new Error('无 Image 构造器，无法裁帧'));
        return;
      }
      const image = new ImageClass();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('截屏帧解码失败'));
      image.src = url;
    });
  }

  // 画到 canvas
  static draw(win, source, crop, outWidth, outHeight) {
    const canvas = win.document.createElement('canvas');
    canvas.width = outWidth;
    canvas.height = outHeight;
    const context = canvas.getContext && canvas.getContext('2d');
    if (!context || !context.drawImage) return '';
    context.drawImage(source, crop.x, crop.y, crop.width, crop.height, 0, 0, outWidth, outHeight);
    return canvas.toDataURL ? canvas.toDataURL('image/png') : '';
  }
}

// 屏幕划选搜题
export class ScreenSearch {
  declare busy: any;
  declare card: any;
  declare engine: any;
  declare log: any;
  declare settings: any;
  declare store: any;

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
    const layout = ScreenSearch.fitViewport(imageSize.width, imageSize.height, viewport.width, viewport.height);
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
    if (!devices || !devices.getDisplayMedia) throw new Error('当前环境不支持屏幕捕获');
    const stream = await devices.getDisplayMedia({ video: { frameRate: 1 }, audio: false });
    try {
      const video = win.document.createElement('video');
      video.muted = true;
      video.srcObject = stream;
      // 等帧可读
      await new Promise<void>((resolve, reject) => {
        if (video.readyState >= 2) {
          resolve();
          return;
        }
        const timer = setTimeout(() => reject(new Error('截屏帧读取超时')), Math.max(500, settings.ocrFetchTimeoutMs | 0));
        video.addEventListener('loadeddata', () => {
          clearTimeout(timer);
          resolve();
        });
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error('截屏帧解码失败'));
        };
      });
      const width = video.videoWidth;
      const height = video.videoHeight;
      if (!width || !height) throw new Error('截屏帧尺寸为空');
      const url = ImageReader.draw(win, video, { x: 0, y: 0, width, height }, width, height);
      if (!url) throw new Error('截屏帧画不出位图');
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
      } catch (e) {}
      const page = host.document;
      const viewport = { width: host.innerWidth || frame.width, height: host.innerHeight || frame.height };
      const layout = ScreenSearch.fitViewport(frame.width, frame.height, viewport.width, viewport.height);
      const layer = page.createElement('div');
      layer.setAttribute('style', 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:2147483000;background:rgba(0,0,0,.6);cursor:crosshair');
      const image = page.createElement('img');
      image.setAttribute('style', 'position:absolute;image-rendering:auto;box-shadow:0 0 0 1px #000'
        + `;left:${layout.offsetX}px;top:${layout.offsetY}px;width:${layout.width}px;height:${layout.height}px`);
      image.src = frame.url;
      const box = page.createElement('div');
      box.setAttribute('style', 'position:absolute;border:1px solid #4ea1ff;background:rgba(78,161,255,.2);display:none');
      const tip = page.createElement('div');
      tip.setAttribute('style', 'position:absolute;left:12px;top:12px;padding:4px 10px;border-radius:4px;background:rgba(0,0,0,.6);color:#fff;font:12px/1.6 system-ui');
      tip.textContent = '拖动框选要搜的题目，Esc 取消';
      layer.appendChild(image);
      layer.appendChild(box);
      layer.appendChild(tip);
      (page.body || page.documentElement).appendChild(layer);

      let from = null;
      let to = null;
      const teardown = () => {
        layer.removeEventListener('mousemove', onMove);
        layer.removeEventListener('mouseup', onUp);
        if (host.removeEventListener) host.removeEventListener('keydown', keyHandler);
        if (layer.remove) layer.remove();
        else if (layer.parentNode && layer.parentNode.removeChild) layer.parentNode.removeChild(layer);
      };
      const paint = () => {
        const region = ScreenSearch.imageRect(from, to, viewport, { width: frame.width, height: frame.height }, 0);
        const left = region ? region.x * layout.scale + layout.offsetX : 0;
        const top = region ? region.y * layout.scale + layout.offsetY : 0;
        box.setAttribute('style', 'position:absolute;border:1px solid #4ea1ff;background:rgba(78,161,255,.2)'
          + `;left:${left}px;top:${top}px;width:${region ? region.width * layout.scale : 0}px;height:${region ? region.height * layout.scale : 0}px`);
      };
      const onMove = (event) => {
        if (!from) return;
        to = { x: event.clientX, y: event.clientY };
        paint();
      };
      const onUp = (event) => {
        if (!from) return;
        to = { x: event.clientX, y: event.clientY };
        const region = ScreenSearch.imageRect(from, to, viewport, { width: frame.width, height: frame.height }, 12);
        teardown();
        resolve(region);
      };
      const onDown = (event) => {
        from = { x: event.clientX, y: event.clientY };
        to = from;
        layer.addEventListener('mousemove', onMove);
        layer.addEventListener('mouseup', onUp);
      };
      const keyHandler = (event) => {
        if (event.key !== 'Escape') return;
        teardown();
        resolve(null);
      };
      layer.addEventListener('mousedown', onDown);
      if (host.addEventListener) host.addEventListener('keydown', keyHandler);
    });
  }

  constructor(context) {
    this.engine = context.engine;
    this.store = context.store;
    this.log = context.log;
    this.settings = context.settings;
    this.busy = false;
    this.card = null;
  }

  // 截屏搜题
  async run() {
    if (this.busy) {
      this.log.info('上一次搜题还没结束');
      return null;
    }
    this.busy = true;
    const win = this.engine.win || PAGE_WINDOW;
    try {
      const frame = await ScreenSearch.frame(win, this.settings);
      const region: any = await ScreenSearch.pick(win, frame);
      if (!region) {
        this.log.info('已取消划选（Esc 或选区太小）');
        return null;
      }
      // 裁选区再缩边
      const image0 = await ImageReader.loadImage(win, frame.url);
      const fit = ImageReader.fitSize(region.width, region.height, this.settings.ocrMaxEdge);
      const image = ImageReader.draw(win, image0, region, fit.width, fit.height);
      if (!image) {
        this.log.warn('选区裁剪失败');
        return null;
      }
      let text = this.store.ocrGet(image);
      if (!text) {
        text = await this.engine.ensureOcr().recognize(image);
        if (text) this.store.ocrPut(image, text);
      }
      if (!text) {
        this.log.warn('选区里没识别到文字');
        return null;
      }
      const answers = await this.search(text);
      this.show(text, answers);
      return { text, answers };
    } catch (e) {
      this.log.warn('划选搜题失败: ' + e.message);
      return null;
    } finally {
      this.busy = false;
    }
  }

  // 文本版入口
  async runText(text) {
    const stem = TextSanitizer.collapse(String(text == null ? '' : text));
    if (stem.length < 4) {
      this.log.warn('题面太短，先在页面上划选文字或把题目粘进搜索框');
      return null;
    }
    const answers = await this.search(stem);
    this.show(stem, answers);
    return { text: stem, answers };
  }

  // 搜选中文字
  async runSelection() {
    let selected = '';
    try {
      const win = this.engine.win || PAGE_WINDOW;
      const page = win && win.document;
      const selection = (page && page.getSelection && page.getSelection()) || (win && win.getSelection && win.getSelection());
      selected = selection ? String(selection.toString() || '') : '';
    } catch (e) {
      selected = '';
    }
    return this.runText(selected);
  }

  // 答案写回缓存
  async search(text) {
    const question = new Question({ index: 0, type: QuestionType.UNKNOWN, stem: text, options: [], blanks: [] });
    const payload = await this.engine.hub.fetch(question, !!this.settings.useAi);
    const out = unique(payload.candidates.reduce((acc, candidate) => acc.concat(candidate.answers), [])
      .map((answer) => String(answer == null ? '' : answer).trim()).filter(Boolean));
    if (out.length && this.settings.useCache) {
      this.store.cachePut({ key: TextSanitizer.key(text), stem: text, answer: out.slice(0, 3), type: QuestionType.UNKNOWN, from: 'search' });
    }
    return out.slice(0, 5);
  }

  // 弹结果卡
  show(text, answers) {
    const page = this.engine.doc || (HAS_DOM ? document : null);
    if (!page || !page.createElement) return null;
    this.dismiss();
    const element = (tag, style?, content?) => {
      const node = page.createElement(tag);
      if (style) node.setAttribute('style', style);
      if (content != null) node.textContent = content;
      return node;
    };
    const known = !!(answers && answers.length);
    const body = element('div');
    (known ? answers : ['没有搜到答案']).forEach((answer, index) => {
      body.appendChild(element('div', null, (known ? index + 1 + '. ' : '') + answer));
    });
    const close = element('button', 'margin-top:8px', '关闭');
    close.addEventListener('click', () => this.dismiss());
    const card = element('div', 'position:fixed;right:16px;bottom:16px;z-index:2147483001;max-width:420px;'
      + 'padding:12px 14px;border-radius:8px;background:#1f2430;color:#e8ecf5;font:13px/1.7 system-ui;box-shadow:0 8px 28px rgba(0,0,0,.35)');
    [element('div', 'font-weight:600;margin-bottom:4px', '划选搜题'),
      element('div', 'color:#b9c2d0;margin-bottom:8px;white-space:pre-wrap', text), body, close]
      .forEach((node) => card.appendChild(node));
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
}
