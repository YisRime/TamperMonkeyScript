// 探针域：文本清洗与 DOM 选择器探针
import { HAS_DOM } from "./Utils.ts";

const BLANK_SPACE_IMAGE = /blankspace\d*\.gif/i;

const OPTION_ATTRIBUTES = ['aria-label', 'data-label', 'data-content', 'data-value', 'title', 'alt'];

// 文本清洗
export class TextSanitizer {
  static NOT_TEXT = /[^\u4e00-\u9fa5a-z0-9]/g;

  static NORMALIZED = new Map();

  static FOLD = new Map([
    ['\u3000', ' '], ['“', '"'], ['”', '"'], ['〝', '"'], ['‘', "'"], ['’', "'"],
    ['〔', '['], ['〕', ']'], ['。', '.'], ['、', ',']
  ]);

  // 全角转半角（单趟）
  static fold(text) {
    return String(text == null ? '' : text).replace(/[\uff01-\uff5e\u3000“”〝‘’〔〕。、]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0xff01 ? String.fromCharCode(code - 65248) : TextSanitizer.FOLD.get(ch);
    });
  }

  // 去空白
  static collapse(text) {
    return String(text == null ? '' : text).replace(/\s+/g, '');
  }

  // 归一化带缓存（fold 的符号映射会被 NOT_TEXT 剥掉，只留全角转半角）
  static normalize(text) {
    const raw = String(text == null ? '' : text);
    const cache = TextSanitizer.NORMALIZED;
    if (cache.has(raw)) return cache.get(raw);
    const out = raw.replace(/[\uff01-\uff5e]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 65248))
      .replace(/\s+/g, '').toLowerCase().replace(TextSanitizer.NOT_TEXT, '');
    if (cache.size > 4000) cache.clear();
    cache.set(raw, out);
    return out;
  }

  // 缓存键截断
  static key(text) {
    const normalized = TextSanitizer.normalize(text);
    return normalized.length > 240 ? normalized.slice(0, 120) + '#' + normalized.slice(-100) : normalized;
  }

  // 剥选项字母
  static stripPrefix(text) {
    let out = String(text == null ? '' : text).trim();
    const before = out;
    out = out.replace(/^\s*(?:[（(]\s*)?[A-Ha-h]\s*(?:[)）]\s*)?[.．、:：)）]\s*/, '');
    if (out === before) out = out.replace(/^\s*[A-Ha-h]\s*(?=['"“‘]?(?:[\u4e00-\u9fa5]))/, '');
    return out.trim();
  }

  // 节点转纯文本（去标签、还原实体、图片占位）
  static nodeText(element) {
    if (!element) return '';
    if (element.textContent != null && !element.querySelectorAll) return String(element.textContent);
    const clone = element.cloneNode(true);
    clone.querySelectorAll('img').forEach((img) => {
      const source = img.src || img.getAttribute('data-src') || '';
      if (BLANK_SPACE_IMAGE.test(source)) {
        img.replaceWith(document.createTextNode(' '));
        return;
      }
      img.replaceWith(document.createTextNode(' <img src="' + source + '"> '));
    });
    clone.querySelectorAll('iframe').forEach((iframe) => {
      const source = iframe.getAttribute('src') || iframe.getAttribute('_src') || iframe.getAttribute('objectid') || '';
      iframe.replaceWith(document.createTextNode(' <iframe src="' + source + '"> '));
    });
    return String(String(clone.innerHTML || clone.textContent || '')
      .replace(/<(?:br|p|div|li|tr|hr)[^>]*>/gi, ' ')
      .replace(/<[^>]*>/g, ''))
      .replace(/&nbsp;/gi, ' ')
      .replace(/&quot;/gi, '"')
      .replace(/&#0?39;|&apos;|&#8217;/gi, "'")
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&amp;/gi, '&')
      .replace(/&#(\d+);/g, (_, code) => {
        try {
          return String.fromCodePoint(Number(code));
        } catch (e) {
          return '';
        }
      })
      .replace(/\s+/g, ' ').trim();
  }

  // 选项属性兜底
  static option(element) {
    const text = TextSanitizer.stripPrefix(TextSanitizer.nodeText(element));
    if (text) return text;
    return TextSanitizer.pickAttribute(element, OPTION_ATTRIBUTES);
  }

  // 按序取非空
  static pickAttribute(element, names) {
    if (!element || !element.getAttribute) return '';
    for (const name of names || OPTION_ATTRIBUTES) {
      const value = element.getAttribute(name);
      if (value && String(value).trim()) return String(value).trim();
    }
    return '';
  }
}

// DOM 探针
export class FrameProbe {
  static PARSED = new Map();

  // 同源框广度遍历
  static documents(root, maxDepth?) {
    const limit = maxDepth == null ? 3 : maxDepth;
    const out = [];
    if (!HAS_DOM && !root) return out;
    const ownDocument = root && root.document ? root.document : typeof document !== 'undefined' ? document : null;
    const ownWindow = root && root.document ? root : typeof window !== 'undefined' ? window : null;
    if (!ownDocument) return out;
    out.push({ win: ownWindow, doc: ownDocument, depth: 0 });
    const queue = [{ win: ownWindow, doc: ownDocument, depth: 0 }];
    while (queue.length) {
      const current = queue.shift();
      if (current.depth >= limit) continue;
      let frames = [];
      try {
        frames = Array.from(current.doc.querySelectorAll('iframe, frame'));
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
        } catch (e) {}
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
    if (tail === 'first') return { base: selector.slice(0, match.index), at: 0 };
    if (tail === 'last') return { base: selector.slice(0, match.index), at: -1 };
    return { base: selector.slice(0, match.index), at: Number(match[2]) };
  }

  // 选择器两种形态
  static candidates(selector) {
    if (!selector) return [];
    if (Array.isArray(selector)) return selector.filter(Boolean);
    return String(selector).split(',').map((s) => s.trim()).filter(Boolean);
  }

  // 选择器解析缓存
  static parsed(selector) {
    const cache = FrameProbe.PARSED;
    if (cache.has(selector)) return cache.get(selector);
    const list = FrameProbe.candidates(selector).map((single) => FrameProbe.splitFilter(single));
    if (cache.size > 400) cache.clear();
    cache.set(selector, list);
    return list;
  }

  // 查全部
  static queryAll(selector, scope) {
    if (!scope || !scope.querySelectorAll) return [];
    for (const entry of FrameProbe.parsed(selector)) {
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
    if (typeof target === 'string') return FrameProbe.queryAll(target, root)[0] || null;
    let node = root;
    for (let i = target.up || 0; i > 0 && node; i -= 1) node = node.parentElement;
    if (!node) return null;
    const at = target.at || (target.within ? 'closest' : 'parent');
    let scope = null;
    if (at === 'self') scope = node;
    else if (at === 'page') scope = node.ownerDocument || (HAS_DOM ? document : null);
    else if (at === 'closest') {
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
        if (at === 'prev') {
          let sibling = anchor.previousElementSibling;
          while (sibling && target.match && !(sibling.matches && sibling.matches(target.match))) {
            sibling = sibling.previousElementSibling;
          }
          scope = sibling || null;
        } else scope = anchor.parentElement;
      }
    }
    if (!scope) return null;
    return target.find ? FrameProbe.queryAll(target.find, scope)[0] || null : scope;
  }

  // 取作用域文本
  static scopedText(root, target) {
    const node = FrameProbe.scoped(root, target);
    return node ? TextSanitizer.nodeText(node) : '';
  }

  // 只认可见节点
  static visible(node) {
    if (!node) return false;
    const style = node.getAttribute ? node.getAttribute('style') || '' : '';
    if (/display\s*:\s*none/i.test(style)) return false;
    if (node.classList && node.classList.contains && node.classList.contains('hide')) return false;
    return true;
  }

  // 按文案再过滤
  static byText(selector, texts, scope) {
    const nodes = FrameProbe.queryAll(selector, scope);
    if (!texts || !texts.length) return nodes;
    return nodes.filter((node) => {
      const text = TextSanitizer.collapse(node.textContent || '');
      return texts.some((needle) => text.includes(TextSanitizer.collapse(needle)));
    });
  }

  // 定位统一入口
  static pick(target, scope) {
    if (!target) return null;
    if (typeof target === 'string') return FrameProbe.queryAll(target, scope)[0] || null;
    const matched = FrameProbe.byText(target.selector, target.text, scope);
    return matched.length ? matched[0] : null;
  }
}
