// 采集域：站点回包的声明式抽取
import { JsonWatch } from "./Spec.ts";
import { HAS_DOM, PAGE_WINDOW } from "./Utils.ts";
import { TextSanitizer } from "./Probe.ts";

// 回包声明式抽取
export class NetworkCapture {
  declare batch: any;
  declare captures: any;
  declare cursor: any;
  declare installed: any;
  declare keys: any;
  declare log: any;
  declare noticed: any;
  declare records: any;
  declare restore: any;
  declare settings: any;

  constructor(spec, context) {
    this.log = context.log;
    this.settings = context.settings;
    this.captures = spec && spec.capture ? (Array.isArray(spec.capture) ? spec.capture : [spec.capture]) : [];
    this.records = [];
    this.batch = [];
    this.keys = new Map();
    this.cursor = 0;
    this.installed = null;
    this.restore = null;
  }

  // 路径逐项下钻
  static pluck(payload, path) {
    const segments = String(path || '').split('.').filter(Boolean);
    let bags = [payload];
    for (const raw of segments) {
      const expand = raw.endsWith('[]');
      const key = expand ? raw.slice(0, -2) : raw;
      const next = [];
      for (const bag of bags) {
        const value = bag == null ? undefined : bag[key];
        if (value == null) continue;
        if (expand) {
          if (Array.isArray(value)) next.push(...value);
          continue;
        }
        next.push(value);
      }
      bags = next;
      if (!bags.length) return expand ? [] : undefined;
    }
    return bags.length === 1 ? bags[0] : bags;
  }

  // 字段抽取规则（支持数组轮替、字符串路径与对象规则）
  static resolveField(item, rule) {
    if (rule == null) return undefined;
    if (Array.isArray(rule)) {
      for (const alt of rule) {
        const value = NetworkCapture.resolveField(item, alt);
        if (value !== undefined) return value;
      }
      return undefined;
    }
    if (typeof rule === 'string') return NetworkCapture.pluck(item, rule);
    try {
      let list = NetworkCapture.pluck(item, rule.from);
      if (list == null) return undefined;
      if (rule.json && typeof list === 'string') list = JSON.parse(list);
      list = Array.isArray(list) ? list : [list];
      if (rule.where) {
        const key = rule.where[0];
        const want = rule.where[1];
        list = list.filter((entry) => entry && String(entry[key]) === String(want));
      }
      const values = rule.each
        ? list.map((entry) => NetworkCapture.pluck(entry, rule.each)).filter((value) => value != null && value !== '')
        : list;
      const mapped = rule.map
        ? values.map((value) => {
          const hit = rule.map[String(value == null ? '' : value).trim()];
          return hit === undefined ? value : hit;
        })
        : values;
      if (rule.split && mapped.length === 1 && typeof mapped[0] === 'string') {
        return mapped[0].split(rule.split).map((part) => part.trim()).filter(Boolean);
      }
      return mapped;
    } catch (e) {
      return undefined;
    }
  }

  // 形态是否启用
  usable(entry) {
    const level = this.settings.jsonCapture || 'off';
    if (level === 'off') return false;
    const source = (entry && entry.source) || 'xhr';
    return level === 'all' || source === 'xhr';
  }

  // 批对最近回包
  ingest(payload) {
    const capture = this.captures.find((entry) => {
      if (!this.usable(entry)) return false;
      if (!payload || typeof payload !== 'object') return false;
      return (entry.shape || []).every((path) => NetworkCapture.pluck(payload, path.replace(/\[\]$/, '')) !== undefined);
    });
    if (!capture) return 0;
    let list = NetworkCapture.pluck(payload, capture.list);
    if (capture.listJson) {
      let decoded = list;
      for (let i = 0; i < 2 && typeof decoded === 'string'; i += 1) {
        try {
          decoded = JSON.parse(decoded);
        } catch (e) {
          return 0;
        }
      }
      list = capture.listJson === true || capture.listJson === 'true'
        ? decoded
        : NetworkCapture.pluck(decoded, capture.listJson);
    }
    const items = Array.isArray(list) ? list : list ? [list] : [];
    if (!items.length) return 0;
    const entries = [];
    if (!capture.children) {
      items.forEach((item) => entries.push({ item, parent: null }));
    } else {
      items.forEach((item) => {
        const kids = NetworkCapture.pluck(item, capture.children);
        const children = Array.isArray(kids) ? kids.filter(Boolean) : [];
        if (children.length) children.forEach((kid) => entries.push({ item: kid, parent: item }));
        else entries.push({ item, parent: null });
      });
    }
    const parsed = entries.map(({ item, parent }) => {
      const record: any = {};
      for (const key of Object.keys(capture.fields)) {
        let value = NetworkCapture.resolveField(item, capture.fields[key]);
        if (value === undefined && parent) value = NetworkCapture.resolveField(parent, capture.fields[key]);
        if (value === undefined) continue;
        record[key] = value;
      }
      if (Array.isArray(record.options)) record.options = record.options.map((option) => String(option == null ? '' : option).trim()).filter(Boolean);
      if (record.answer != null && !Array.isArray(record.answer)) record.answer = [String(record.answer)];
      return record;
    });
    const batch = [];
    let fresh = 0;
    parsed.forEach((record) => {
      if (capture.answerIndex) {
        const rule = capture.answerIndex;
        const options = record[rule.options || 'options'];
        if (Array.isArray(options) && options.length && Array.isArray(record.answer)) {
          const base = rule.base || 0;
          record.answer = record.answer.map((item) => {
            const text = String(item == null ? '' : item).trim();
            if (!/^\d+$/.test(text)) return item;
            const at = Number(text) - base;
            return options[at] == null ? item : String(options[at]);
          });
        }
      }
      const key = String(record.id || record.qid || '') + '|' + TextSanitizer.key(record.question || '');
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
      this.log.info('已拦截站点接口数据 ' + this.records.length + ' 题（按 id 优先匹配题面）');
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
    if (usable.some((entry) => entry.source === 'xhr')) {
      const Raw = win.XMLHttpRequest;
      if (!Raw) return false;
      const rawSend = Raw.prototype.send;
      const rawOpen = Raw.prototype.open;
      Raw.prototype.open = function (method, url, ...rest) {
        this.__autoquizUrl = String(url || '');
        return rawOpen.call(this, method, url, ...rest);
      };
      Raw.prototype.send = function (...args) {
        const markers = usable.map((entry) => entry.marker).filter(Boolean);
        this.addEventListener('load', function () {
          try {
            const text = this.responseText;
            if (!text || (markers.length && !markers.some((marker) => text.includes(marker)))) return;
            self.ingest(JSON.parse(text));
          } catch (e) {}
        });
        return rawSend.apply(this, args);
      };
      this.installed = 'xhr';
      this.restore = () => { Raw.prototype.send = rawSend; Raw.prototype.open = rawOpen; };
    }
    if (usable.some((entry) => entry.source === 'jsonparse')) {
      JsonWatch.install(win);
      JsonWatch.subscribe(this);
      this.drain();
      this.installed = this.installed || 'jsonparse';
      const previous = this.restore;
      this.restore = () => {
        if (previous) previous();
        JsonWatch.unsubscribe(this);
        JsonWatch.release();
      };
      this.log.warn('已启用全局 JSON.parse 拦截（介意改全局请设为 xhr 或关闭）');
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
      } catch (e) {}
    });
    return fresh.length;
  }

  // 卸钩还原全局
  uninstall() {
    if (this.restore) this.restore();
    this.restore = null;
    this.installed = null;
  }
}
