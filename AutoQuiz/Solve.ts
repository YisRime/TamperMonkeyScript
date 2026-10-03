// 求解域：题目模型与采集、答案源与裁决、答案写入
import { QuestionType, unique, PAGE_WINDOW, jitter, withTimeout, Http, VERSION, Logger, TYPE_LABELS } from "./Utils.ts";
import { TextSanitizer, FrameProbe } from "./Probe.ts";
import { NetworkCapture } from "./Capture.ts";
import { DEFAULT_ENDPOINTS } from "./Spec.ts";

// 题目模型
export class Question {
  declare id: any;
  declare index: any;
  declare options: any;
  declare type: any;

  declare blanks: any;
  declare cardIndex: any;
  declare captured: any;
  declare doc: any;
  declare ocrText: any;
  declare pageAnswer: any;
  declare rawType: any;
  declare root: any;
  declare slots: any;
  declare stem: any;
  declare win: any;

  constructor(fields) {
    this.index = fields.index;
    this.id = fields.id || null;
    this.cardIndex = fields.cardIndex == null ? null : fields.cardIndex;
    this.type = fields.type || QuestionType.UNKNOWN;
    this.stem = fields.stem || '';
    this.options = fields.options || [];
    this.blanks = fields.blanks || [];
    this.slots = fields.slots || [];
    this.rawType = fields.rawType || '';
    this.pageAnswer = fields.pageAnswer || '';
    this.root = fields.root || null;
    this.doc = fields.doc || null;
    this.win = fields.win || null;
    this.ocrText = fields.ocrText || '';
  }

  // 选项文本表
  get optionTexts() {
    return this.options.map((option) => option.text);
  }

  // 图片题取识图文本
  get plainStem() {
    return String(this.stem == null ? '' : this.stem).replace(/<img[^>]*>/gi, ' ').trim();
  }

  // 填空槽数
  get blankCount() {
    return this.type === QuestionType.COMPLETION ? Math.max(1, this.blanks.length) : 0;
  }

  // 槽候选拼行
  get slotTexts() {
    return this.slots.map((slot) => slot.choices.map((choice) => choice.text || choice.value).join(' / '));
  }

  // 缓存键
  get cacheKey() {
    return TextSanitizer.key(this.stem);
  }

  // 答案源请求上下文
  get env() {
    const numeric = String(this.rawType || '').match(/\d+/);
    const texts = this.optionTexts;
    return {
      type: this.type,
      title: this.stem,
      options: this.type === QuestionType.COMPLETION ? '' : this.type === QuestionType.MATCH ? this.slotTexts.join('\n') : texts.join('\n'),
      optionTexts: texts,
      id: this.id || '',
      index: this.index,
      blankCount: this.blankCount,
      slotCount: this.type === QuestionType.MATCH ? Math.max(1, this.slots.length) : 0,
      typeCode: numeric ? Number(numeric[0]) : { single: 0, multiple: 1, completion: 2, judgement: 3, match: 11 }[this.type],
      qid: (this.captured && this.captured.qid) || this.id || '',
      optionsId: (this.captured && this.captured.optionsId) || '',
      adapterType: { single: 0, multiple: 1, completion: 3, judgement: 4 }[this.type]
    };
  }

  // 调试标签
  label() {
    return `第${this.index + 1}题[${this.type}${this.id ? '#' + this.id : ''}] ${this.stem.slice(0, 24)}`;
  }
}

export const DEFAULT_SEPARATORS = ['===', '###', '#', '---', '|', ';', '；', '\n'];

// 答案裁决
export class AnswerResolver {
  static JUDGE_TRUE = new Set(['正确', '是', '对', 'T', 'true', 'right', 'yes', 'A', '1', 'ri', '对的', '是正确的'].map(TextSanitizer.normalize));

  static JUDGE_FALSE = new Set(['错误', '不是', '否', '错', 'X', 'F', 'false', 'wrong', 'no', 'B', '0', 'wr', '错的', '不正确'].map(TextSanitizer.normalize));

  static GRAMS = new Map();

  // 逐字集合缓存
  static grams(text) {
    const cache = AnswerResolver.GRAMS;
    const known = cache.get(text);
    if (known) return known;
    const set = new Set();
    for (let i = 0; i < text.length - 1; i++) set.add(text.slice(i, i + 2));
    if (cache.size > 4000) cache.clear();
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
    const sSet = AnswerResolver.grams(s);
    const tSet = AnswerResolver.grams(t);
    let intersection = 0;
    for (const gram of sSet) if (tSet.has(gram)) intersection += 1;
    return (2 * intersection) / (sSet.size + tSet.size);
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
    const score = AnswerResolver.bigramScore(a, b);
    return score >= 0.98 ? score : Math.max(score, AnswerResolver.levenshteinScore(a, b) * 0.98);
  }

  // 压平成字符串
  static flatten(answers) {
    const out = [];
    for (const item of answers || []) {
      if (Array.isArray(item)) item.forEach((v) => out.push(String(v == null ? '' : v).trim()));
      else if (item != null) out.push(String(item).trim());
    }
    return unique(out.filter(Boolean));
  }

  // 切答案（代码答案不切分号）
  static splitAnswer(text, separators, blankCount) {
    const raw = String(text == null ? '' : text).trim();
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map((v) => String(v).trim()).filter(Boolean);
    } catch (e) {}
    let program = false;
    {
      const signals = ['#include', 'int main', 'void main', 'System.out', 'printf(', 'scanf(', 'public class', 'static void', 'function(', 'def ', 'return '];
      let hits = 0;
      for (const token of signals) if (raw.includes(token)) hits += 1;
      if (/[{};]\s*$/.test(raw) && /[(=)]/.test(raw)) hits += 1;
      program = hits >= 2;
    }
    const list = (separators || DEFAULT_SEPARATORS).filter((separator) => !(program && [';', '；', '|'].includes(separator)));
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
    const raw = String(text == null ? '' : text).trim();
    if (!raw || !/^[A-Ha-h](?:[\s,,、;；.．|/()（）]*[A-Ha-h])*$/.test(raw)) return [];
    const codes = Array.from(raw.replace(/[^A-Ha-h]/g, '').toUpperCase()).map((ch) => ch.charCodeAt(0));
    if (codes.length > 1) {
      const ascending = codes.every((code, i) => i === 0 || code > codes[i - 1]);
      const separated = /[,、;；|/\s.．]/.test(raw);
      if (!ascending && !separated) return [];
    }
    return unique(codes.map((code) => code - 65)).filter((i) => i >= 0 && i < 8).sort((a, b) => a - b);
  }

  // 选项两种形态
  static optionText(option) {
    if (option == null) return '';
    return typeof option === 'string' ? option : String(option.text == null ? '' : option.text);
  }

  // 选项归一文本
  static optionTexts(options) {
    return (options || []).map((option) => TextSanitizer.normalize(AnswerResolver.optionText(option)));
  }

  // 字母转下标
  static letterIndex(flatAnswers, options) {
    for (const one of flatAnswers) {
      const indices = AnswerResolver.extractLetters(one).filter((i) => i < options.length);
      if (indices.length === 1) return indices[0];
    }
    return null;
  }

  // 判极性
  static polarity(text) {
    const symbols = {
      '√': 'true', '✓': 'true', '对': 'true', '正确': 'true', '是': 'true',
      '×': 'false', '✗': 'false', '✘': 'false', '╳': 'false', '错': 'false', '错误': 'false', '否': 'false'
    };
    const raw = String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
    if (!raw) return null;
    if (symbols[raw]) return symbols[raw];
    const normalized = TextSanitizer.normalize(TextSanitizer.stripPrefix(raw));
    if (!normalized) return null;
    if (AnswerResolver.JUDGE_FALSE.has(normalized)) return 'false';
    if (AnswerResolver.JUDGE_TRUE.has(normalized)) return 'true';
    if (/^(?:错误|不对|不正确|有误|误|false|no)/.test(normalized)) return 'false';
    if (/^(?:正确|是对的|对|是|true|yes)/.test(normalized)) return 'true';
    return null;
  }

  // 先剥字母前缀
  static optionPolarities(options) {
    return (options || []).map((option) => AnswerResolver.polarity(AnswerResolver.optionText(option)));
  }

  // 两极性位兜底
  static judgeIndices(options) {
    const polarities = AnswerResolver.optionPolarities(options);
    const trueAt = polarities.findIndex((p) => p === 'true');
    const falseAt = polarities.findIndex((p) => p === 'false');
    if (trueAt >= 0 && falseAt >= 0) return { trueAt, falseAt };
    const other = (known) => options.findIndex((_, i) => i !== known);
    if (trueAt >= 0) return { trueAt, falseAt: other(trueAt) };
    if (falseAt >= 0) return { falseAt, trueAt: other(falseAt) };
    if (options.length >= 2) return { trueAt: 0, falseAt: 1, guessed: true };
    return null;
  }

  // 判断题
  static resolveJudgement(answers, options, context) {
    const map = AnswerResolver.judgeIndices(options);
    if (!map) return { finish: false, reason: 'no-options' };
    const flat = AnswerResolver.flatten(answers);
    if (!flat.length) return { finish: false, reason: 'empty' };
    let polarity = AnswerResolver.polarity(flat.join(',')) || null;
    if (!polarity) {
      for (const one of flat) {
        const direct = AnswerResolver.polarity(one);
        if (direct) {
          polarity = direct;
          break;
        }
      }
    }
    if (!polarity) {
      for (const one of flat) {
        if (AnswerResolver.similarity(one, '正确') > 0.6 || AnswerResolver.similarity(one, '对') > 0.7) { polarity = 'true'; break; }
        if (AnswerResolver.similarity(one, '错误') > 0.6 || AnswerResolver.similarity(one, '错') > 0.7) { polarity = 'false'; break; }
      }
    }
    if (!polarity) {
      const index = AnswerResolver.letterIndex(flat, options);
      if (index !== null) polarity = index === map.trueAt ? 'true' : index === map.falseAt ? 'false' : null;
    }
    if (!polarity) return { finish: false, reason: 'unknown-polarity' };
    const index = polarity === 'true' ? map.trueAt : map.falseAt;
    if (index < 0) return { finish: false, reason: 'missing-target-option' };
    return {
      finish: true,
      indices: [index],
      texts: [AnswerResolver.optionText(options[index])],
      polarity,
      matched: map.guessed ? 'guessed-order' : 'polarity',
      guessed: !!map.guessed
    };
  }

  // 单选题
  static resolveSingle(answers, options, context) {
    const settings = context || {};
    const threshold = settings.singleThreshold == null ? 0.65 : settings.singleThreshold;
    const flat = AnswerResolver.flatten(answers);
    if (!flat.length || !options.length) return { finish: false, reason: 'empty' };
    const normalizedTexts = AnswerResolver.optionTexts(options);
    const wanted = flat.map((answer) => ({ answer, normalized: TextSanitizer.normalize(answer) })).filter((entry) => entry.normalized);

    for (const entry of wanted) {
      const exact = normalizedTexts.indexOf(entry.normalized);
      if (exact >= 0) return { finish: true, indices: [exact], texts: [AnswerResolver.optionText(options[exact])], matched: 'exact' };
    }
    for (const entry of wanted) {
      if (entry.normalized.length < 2) continue;
      const hits = [];
      normalizedTexts.forEach((option, i) => {
        if (!option || option.length < 2) return;
        if (option.includes(entry.normalized) || entry.normalized.includes(option)) hits.push(i);
      });
      if (hits.length === 1) return { finish: true, indices: hits, texts: [AnswerResolver.optionText(options[hits[0]])], matched: 'contains' };
    }

    let bestIndex = -1;
    let bestScore = 0;
    normalizedTexts.forEach((option, position) => {
      if (!option) return;
      flat.forEach((answer) => {
        const score = AnswerResolver.similarity(option, answer);
        if (score > bestScore) {
          bestScore = score;
          bestIndex = position;
        }
      });
    });
    if (bestIndex >= 0 && bestScore > threshold) {
      return { finish: true, indices: [bestIndex], texts: [AnswerResolver.optionText(options[bestIndex])], matched: 'similarity', score: bestScore };
    }

    const letter = AnswerResolver.letterIndex(flat, options);
    if (letter !== null) return { finish: true, indices: [letter], texts: [AnswerResolver.optionText(options[letter])], matched: 'letter' };

    const merged = flat.join('');
    if (merged.length > 1) {
      const mergedNormalized = TextSanitizer.normalize(merged);
      const mergedIndex = normalizedTexts.findIndex((option) => option && (option === mergedNormalized || option.includes(mergedNormalized)));
      if (mergedIndex >= 0) return { finish: true, indices: [mergedIndex], texts: [AnswerResolver.optionText(options[mergedIndex])], matched: 'merged' };
    }
    return { finish: false, reason: 'no-match', bestScore: bestScore };
  }

  // 多选两表择优
  static resolveMultiple(answers, options, context) {
    const settings = context || {};
    const threshold = settings.multipleThreshold == null ? 0.6 : settings.multipleThreshold;
    const flat = AnswerResolver.flatten(answers);
    if (!flat.length || !options.length) return { finish: false, reason: 'empty' };
    const normalizedTexts = AnswerResolver.optionTexts(options);
    const normalized = new Map();
    const rating = new Map();

    flat.forEach((answer) => {
      const normalizedAnswer = TextSanitizer.normalize(answer);
      if (!normalizedAnswer) return;
      normalizedTexts.forEach((option, i) => {
        if (!option) return;
        let level = 0;
        if (option === normalizedAnswer) level = 1;
        else if (option.length > 1 && (normalizedAnswer.includes(option) || option.includes(normalizedAnswer))) level = 0.8;
        if (level > (normalized.get(i) || 0)) normalized.set(i, level);
        const score = AnswerResolver.similarity(option, answer);
        if (score > threshold && score > (rating.get(i) || 0)) rating.set(i, score);
      });
    });

    const letters = new Map();
    flat.forEach((answer) => AnswerResolver.extractLetters(answer).forEach((i) => i < options.length && letters.set(i, 1)));

    const groups = [{ map: normalized, kind: 'normalized' }, { map: rating, kind: 'rating' }];
    if (letters.size) groups.push({ map: letters, kind: 'letter' });

    const scored = groups
      .map((group) => {
        let sum = 0;
        group.map.forEach((value) => (sum += value));
        return { indices: Array.from(group.map.keys()).sort((a, b) => a - b), sum, kind: group.kind };
      })
      .filter((entry) => entry.indices.length)
      .sort((a, b) => b.indices.length * 100 + b.sum - (a.indices.length * 100 + a.sum));

    if (!scored.length) return { finish: false, reason: 'no-match' };

    // 近义互斥消歧：长文本优先保留
    const kept = unique(scored[0].indices).slice();
    for (let guard = 0; guard < 24 && kept.length > 1; guard++) {
      let dropped = false;
      for (let a = 0; a < kept.length && !dropped; a++) {
        for (let b = a + 1; b < kept.length; b++) {
          const score = AnswerResolver.similarity(normalizedTexts[kept[a]] || '', normalizedTexts[kept[b]] || '');
          if (score > (threshold || 0.6)) {
            const longer = (normalizedTexts[kept[a]] || '').length >= (normalizedTexts[kept[b]] || '').length ? a : b;
            kept.splice(longer, 1);
            dropped = true;
            break;
          }
        }
      }
      if (!dropped) break;
    }
    const chosen = kept.sort((a, b) => a - b);
    if (!chosen.length) return { finish: false, reason: '消歧后无剩余选项' };
    return {
      finish: true,
      indices: chosen,
      texts: chosen.map((i) => AnswerResolver.optionText(options[i])),
      matched: scored[0].kind
    };
  }

  // 填空题
  static resolveCompletion(answers, options, context) {
    const settings = context || {};
    const separators = settings.answerSeparators || DEFAULT_SEPARATORS;
    const blankCount = Math.max(1, (context && context.blankCount) || (options || []).length || 1);
    const groups = [];
    for (const item of answers || []) {
      const parts = (Array.isArray(item) ? item : [item]).map((v) => String(v == null ? '' : v).trim()).filter(Boolean);
      if (!parts.length) continue;
      groups.push(parts.length === 1 ? AnswerResolver.splitAnswer(parts[0], separators, blankCount) : parts);
    }
    for (const parts of groups) {
      if (parts.length === blankCount) return { finish: true, texts: parts.slice(), blanks: parts.slice(), matched: 'exact-blanks' };
    }
    for (const parts of groups) {
      if (blankCount === 1) {
        const joined = parts.join(settings.joinBlanks || ' ');
        return { finish: true, texts: [joined], blanks: [joined], matched: 'single-blank' };
      }
      if (parts.length > blankCount) {
        const cut = parts.slice(0, blankCount);
        return { finish: true, texts: cut, blanks: cut, matched: 'truncated' };
      }
      if (parts.length > 1) {
        const padded = parts.concat(new Array(blankCount - parts.length).fill(''));
        return { finish: true, texts: padded, blanks: padded, matched: 'padded', partial: true };
      }
    }
    return { finish: false, reason: 'blank-count-mismatch', blankCount };
  }

  // 槽位段数要对齐
  static resolveMatch(answers, slots, context) {
    if (!slots || !slots.length) return { finish: false, reason: 'no-slots' };
    const settings = context || {};
    const separators = settings.answerSeparators || DEFAULT_SEPARATORS;
    const threshold = settings.singleThreshold == null ? 0.65 : settings.singleThreshold;
    const groups = [];
    for (const item of answers || []) {
      const raw = Array.isArray(item) ? item : [item];
      const parts = (raw.length === 1
        ? AnswerResolver.splitAnswer(String(raw[0] == null ? '' : raw[0]), separators, slots.length)
        : raw.map((value) => String(value == null ? '' : value).trim())
      ).map((value) => String(value == null ? '' : value).trim()).filter(Boolean);
      if (parts.length !== slots.length) continue;
      const decision = [];
      let score = 0;
      let ok = true;
      for (let index = 0; index < slots.length; index++) {
        // 槽内挑候选：值等价 > 文本相似 > 单字母位
        const value = String(parts[index] == null ? '' : parts[index]).trim();
        const choices = slots[index].choices;
        let choice = null;
        if (value && choices && choices.length) {
          const normalized = TextSanitizer.normalize(value);
          const bare = normalized.replace(/^[a-z]?[).、]/, '');
          const byValue = choices.find((candidate) => TextSanitizer.normalize(candidate.value) === normalized);
          if (byValue) {
            choice = Object.assign({}, byValue, { score: 1, via: 'value' });
          } else {
            let best = null;
            choices.forEach((candidate) => {
              const text = String(candidate.text || '');
              const rating = Math.max(
                AnswerResolver.similarity(value, text),
                AnswerResolver.similarity(bare, text),
                AnswerResolver.similarity(bare, TextSanitizer.stripPrefix(text))
              );
              if (!best || rating > best.score) best = { choice: candidate, score: rating };
            });
            if (best && best.score >= threshold) choice = Object.assign({}, best.choice, { score: best.score, via: 'text' });
          }
          if (!choice) {
            const letter = /^[a-z]$/i.test(value) ? value.toUpperCase().charCodeAt(0) - 65 : -1;
            const byLetter = letter >= 0 && letter < choices.length ? choices[letter] : null;
            if (byLetter) choice = Object.assign({}, byLetter, { score: threshold, via: 'letter' });
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
        matched: decision.some((entry) => entry.via === 'text') ? 'slot-text' : 'slot',
        score: score / decision.length
      });
    }
    if (!groups.length) return { finish: false, reason: 'slot-count-mismatch', slotCount: slots.length };
    groups.sort((a, b) => b.score - a.score);
    return groups[0];
  }

  // 单题型入口：先逐源裁决，再跨源投票
  static resolveFor(type, candidates, options, context) {
    const list = (candidates || []).slice().sort((a, b) => (a.priority || 0) - (b.priority || 0));
    const successes = [];
    for (const candidate of list) {
      const answers = candidate.answers == null ? [] : [candidate.answers];
      let result;
      if (type === QuestionType.JUDGEMENT) result = AnswerResolver.resolveJudgement(answers, options, context);
      else if (type === QuestionType.MULTIPLE) result = AnswerResolver.resolveMultiple(answers, options, context);
      else if (type === QuestionType.COMPLETION) result = AnswerResolver.resolveCompletion(answers, options, context);
      else if (type === QuestionType.MATCH) result = AnswerResolver.resolveMatch(answers, (context && context.slots) || [], context);
      else if (type === QuestionType.SINGLE) result = AnswerResolver.resolveSingle(answers, options, context);
      else result = { finish: false, reason: 'unsupported-type' };
      if (result && result.finish) successes.push(Object.assign({ from: candidate.from, answers: answers[0] || [] }, result));
    }
    if (!successes.length) return { finish: false, reason: 'no-candidate-matched', tried: list.length };
    if (successes.length === 1) return successes[0];
    if (type === QuestionType.MULTIPLE) return successes.slice().sort((a, b) => b.indices.length - a.indices.length)[0];
    if (type === QuestionType.COMPLETION) return successes.find((entry) => !entry.partial) || successes[0];
    if (type === QuestionType.MATCH) return successes.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0];
    const buckets = new Map();
    successes.forEach((entry, order) => {
      const key = (entry.indices || []).join(',');
      if (!buckets.has(key)) buckets.set(key, { entry, order, votes: 0 });
      buckets.get(key).votes += 1;
    });
    let winner = null;
    for (const bucket of buckets.values()) {
      if (!winner || bucket.votes > winner.votes || (bucket.votes === winner.votes && bucket.order < winner.order)) winner = bucket;
    }
    return winner ? winner.entry : successes[0];
  }
}

// 答案写入
export class AnswerWriter {
  declare log: any;
  declare settings: any;
  declare spec: any;

  constructor(spec, context) {
    this.spec = spec;
    this.settings = context.settings;
    this.log = context.log;
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
    const extra = (write.checked || []).concat((write.selectedClass || []).map((name) => '.' + name));
    for (const selector of extra) {
      try {
        if (node.querySelector && node.querySelector(selector)) return true;
        if (node.matches && node.matches(selector)) return true;
      } catch (e) {}
    }
    try {
      if (node.checked === true) return true;
      if (node.getAttribute && node.getAttribute('aria-checked') === 'true') return true;
      if (node.querySelector && node.querySelector('input:checked,[aria-checked="true"]')) return true;
    } catch (e) {
      return true;
    }
    if (AnswerWriter.isChosen(node, write.selectedClass)) return true;
    if (node.className && typeof node.className === 'string') {
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
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1
      };
      try {
        target.dispatchEvent(new view.PointerEvent('pointerdown', props));
        target.dispatchEvent(new view.MouseEvent('mousedown', props));
        target.dispatchEvent(new view.PointerEvent('pointerup', props));
        target.dispatchEvent(new view.MouseEvent('mouseup', props));
        target.dispatchEvent(new view.MouseEvent('click', props));
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
    const tag = String(node.tagName || '').toUpperCase();
    if (tag === 'IFRAME') {
      try {
        const body = node.contentDocument && node.contentDocument.body;
        if (body) {
          body.innerHTML = '<p>' + AnswerWriter.escapeHtml(text) + '</p>';
          return true;
        }
      } catch (e) {
        this.log.warn(`富文本 iframe 写入失败: ${e.message}`);
      }
      return false;
    }
    if (tag === 'TEXTAREA' || tag === 'INPUT') {
      const name = tag === 'TEXTAREA' ? 'HTMLTextAreaElement' : 'HTMLInputElement';
      const proto = view && view[name] ? view[name].prototype : null;
      const descriptor = proto && view.Object ? view.Object.getOwnPropertyDescriptor(proto, 'value') : null;
      if (descriptor && descriptor.set) descriptor.set.call(node, text);
      else node.value = text;
      AnswerWriter.dispatchInput(view, node, ['input', 'change', 'blur']);
      return true;
    }
    if (node.isContentEditable || (node.getAttribute && node.getAttribute('contenteditable') === 'true')) {
      node.innerHTML = '<p>' + AnswerWriter.escapeHtml(text) + '</p>';
      AnswerWriter.dispatchInput(view, node, ['input', 'change']);
      return true;
    }
    node.textContent = text;
    AnswerWriter.dispatchInput(view, node, ['input']);
    return true;
  }

  // 派发输入事件
  static dispatchInput(view, node, types) {
    for (const type of types) {
      try {
        node.dispatchEvent(new view.Event(type, { bubbles: true }));
      } catch (e) {
        try {
          const event = node.ownerDocument.createEvent('HTMLEvents');
          event.initEvent(type, true, true);
          node.dispatchEvent(event);
        } catch (e2) {}
      }
    }
  }

  // 转义 HTML
  static escapeHtml(text) {
    return String(text == null ? '' : text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // 四种富文本宿主
  writeEditor(question, slot, text) {
    const node = slot.node;
    const name = !node ? '' : (node.getAttribute
      ? node.getAttribute('id') || node.getAttribute('name') || node.getAttribute('data-name') || ''
      : node.id || node.name || '');
    const win = question.win || PAGE_WINDOW;
    if (node.ckeditorInstance && node.ckeditorInstance.data) {
      node.ckeditorInstance.data.set(text);
      return true;
    }
    if (name && win) {
      if (win.UE && win.UE.getEditor) {
        const editor = win.UE.getEditor(name);
        if (editor && typeof editor.setContent === 'function') {
          editor.setContent(text);
          return true;
        }
      }
      if (win.CKEDITOR && win.CKEDITOR.instances) {
        const instance = win.CKEDITOR.instances[name] || win.CKEDITOR.instances[name.replace(/^cke_/, '')];
        if (instance && typeof instance.setData === 'function') {
          instance.setData(text);
          return true;
        }
      }
      if (win.KindEditor && win.KindEditor.instances) {
        const instance = win.KindEditor.instances[slot.index];
        if (instance && typeof instance.html === 'function') {
          instance.html(text);
          return true;
        }
      }
    }
    if (node.classList && node.classList.contains && node.classList.contains('vditor-reset')) {
      node.innerHTML = '<p data-block="0">' + AnswerWriter.escapeHtml(text) + '</p>';
      AnswerWriter.dispatchInput(this.viewOf(node), node, ['input']);
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
        report.detail.push({ slot: decision.slot, ok: false, why: 'no-choice' });
        continue;
      }
      // 候选选中态
      let chosen = false;
      if (choice.node.selected === true) chosen = true;
      else {
        try {
          if (choice.node.getAttribute && choice.node.getAttribute('aria-selected') === 'true') chosen = true;
        } catch (e) {}
        if (!chosen) chosen = AnswerWriter.isChosen(choice.node);
      }
      if (chosen) {
        report.skipped += 1;
        report.detail.push({ slot: decision.slot, ok: true, skipped: true });
        continue;
      }
      // 写候选：select 原生 / 显示层 / 普通点击
      let ok;
      const selectNode = String((slot.node && slot.node.tagName) || '').toUpperCase() === 'SELECT' ? slot.node : null;
      if (selectNode || String(choice.node.tagName || '').toUpperCase() === 'OPTION') {
        const select = selectNode || choice.node.parentElement;
        if (!select) {
          ok = false;
        } else {
          try {
            const list = select.options && select.options.length ? Array.from(select.options) : FrameProbe.queryAll('option', select);
            list.forEach((option) => {
              const target = option === choice.node;
              if (option.selected !== target) option.selected = target;
              if (target) option.setAttribute('selected', 'selected');
              else if (option.removeAttribute) option.removeAttribute('selected');
            });
            select.value = choice.value;
            AnswerWriter.dispatchInput(this.viewOf(slot.node), select, ['change', 'input']);
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
        const inner = FrameProbe.queryAll('a', choice.node)[0];
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
  static isChosen(node, extra?) {
    const list = node && node.classList;
    if (!list || !list.contains) return false;
    return ['checked', 'is-checked', 'active', 'selected', 'current', 'answer-right'].concat(extra || []).some((hint) => list.contains(hint));
  }

  // 落盘作答
  async apply(question, result) {
    const report = { written: 0, skipped: 0, failed: 0, detail: [] };
    if (!result || (!result.finish && !result.forced)) return report;
    if (question.type === QuestionType.COMPLETION) {
      const texts = result.texts || [];
      const slots = question.blanks.length ? question.blanks : question.options;
      const count = Math.min(texts.length, slots.length);
      for (let i = 0; i < count; i++) {
        const text = String(texts[i] == null ? '' : texts[i]);
        if (!text) { report.skipped += 1; continue; }
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
      // 异或才点
      const node = options[i].node || options[i];
      const before = this.isSelected(node);
      let action = 'noop';
      let state = before;
      if (before !== want) {
        this.click(node);
        await jitter(this.settings.optionDelay);
        state = this.isSelected(node);
        action = want ? 'check' : 'uncheck';
      }
      report.detail.push({ index: i, want, action, state });
      if (action === 'noop') report.skipped += 1;
      else if (state === want) report.written += 1;
      else report.failed += 1;
    }
    return report;
  }
}

// 答案源契约
class AnswerSource {
  declare context: any;
  declare name: any;
  declare priority: any;
  declare shortCircuit: any;
  declare timeoutMs: any;

  constructor(context) {
    this.context = context || {};
    const meta: any = this.constructor;
    this.name = meta.NAME || 'source';
    this.priority = meta.PRIORITY == null ? 5 : meta.PRIORITY;
    this.timeoutMs = meta.TIMEOUT || 8000;
    this.shortCircuit = !!meta.SHORT_CIRCUIT;
  }

  // 设置
  get settings() { return this.context.settings; }
  // 存储
  get store() { return this.context.store; }
  // 日志
  get log() { return this.context.log; }

  // 是否启用
  enabled() { return false; }
  // 取答案
  async fetch(_question): Promise<any[]> { return []; }

  // 分层：本地命中即短路 / 兜底源只在允许时参与
  tier(): string {
    if (this.shortCircuit) return 'local';
    return !!(this.constructor as any).FALLBACK ? 'fallback' : 'primary';
  }
}

// 并发拉源
export class AnswerHub {
  declare sources: any;

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
      if (tier === 'local') {
        if (collect(await runOne(source))) return { candidates };
        continue;
      }
      if (tier === 'primary' || allowFallback) remote.push(source);
    }
    (await Promise.all(remote.map(runOne))).forEach(collect);
    candidates.sort((a, b) => a.priority - b.priority);
    return { candidates };
  }
}

// 拦截答案最权威
export class CaptureSource extends AnswerSource {
  static NAME = 'captured';
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
      const text = String(item == null ? '' : item).trim();
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
    return [CaptureSource.expandLetters(answer.map((item) => String(item)), record.options)];
  }
}

// 页面已印答案
export class PageSource extends AnswerSource {
  static NAME = 'page';
  static PRIORITY = -1;
  static TIMEOUT = 100;
  static SHORT_CIRCUIT = true;

  // 是否启用
  enabled() {
    return !!this.settings.usePageAnswer;
  }

  // 取页面答案
  async fetch(question) {
    const raw = String(question.pageAnswer == null ? '' : question.pageAnswer)
      .replace(/^(?:参考答案|正确答案|标准答案|答案)\s*[:：]\s*/, '')
      .trim();
    if (!raw) return [];
    const normalized = question.type === QuestionType.COMPLETION || question.type === QuestionType.MATCH ? raw.replace(/\s*[，,、]\s*/g, '===') : raw;
    return [[normalized]];
  }
}

// 缓存源
export class CacheSource extends AnswerSource {
  static NAME = 'cache';
  static PRIORITY = 0;
  static TIMEOUT = 500;
  static SHORT_CIRCUIT = true;

  // 是否启用
  enabled() { return !!this.settings.useCache; }

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
      if ((2 * Math.min(have.length, want.length)) / (have.length + want.length) < threshold) continue;
      const score = AnswerResolver.bigramScore(entry.stem, question.stem);
      if (score >= threshold) scored.push({ score, answer: entry.answer });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, 3).map((entry) => entry.answer);
  }
}

// 题库接口源
export class BankSource extends AnswerSource {
  static NAME = 'tiku';
  static PRIORITY = 1;
  static TIMEOUT = 9000;

  declare endpoints: any;

  constructor(context) {
    super(context);
    const raw = context.settings.tikuEndpoints;
    const list = Array.isArray(raw) && raw.length ? raw : DEFAULT_ENDPOINTS;
    this.endpoints = list.filter((endpoint) => endpoint && endpoint.url && endpoint.enabled !== false);
  }

  // 是否启用
  enabled() { return !!this.settings.useTiku && this.endpoints.length > 0; }

  // 整串保留原类型
  static renderValue(value, context) {
    if (Array.isArray(value)) return value.map((item) => BankSource.renderValue(item, context));
    if (value && typeof value === 'object') {
      const out = {};
      for (const key of Object.keys(value)) out[key] = BankSource.renderValue(value[key], context);
      return out;
    }
    if (typeof value !== 'string') return value;
    const whole = value.match(/^\$\{(\w+)\}$/);
    if (whole) return context[whole[1]];
    return value.replace(/\$\{(\w+)\}/g, (_, name) => (context[name] == null ? '' : String(context[name])));
  }

  // 收三种回包形态
  static toCandidates(value, endpoint) {
    const join = endpoint.blankJoin || '#';
    const groups = [];
    const add = (item) => {
      if (item == null) return;
      if (typeof item === 'string') {
        const text = item.trim();
        if (text && (text[0] === '[' || text[0] === '{')) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && typeof parsed === 'object') {
              add(parsed);
              return;
            }
          } catch (e) {}
        }
      }
      if (Array.isArray(item)) {
        const inner = item
          .map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v == null ? '' : v).trim()))
          .filter(Boolean);
        if (inner.length) groups.push(inner);
        return;
      }
      if (typeof item === 'object') {
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
    const seen = new Set();
    return groups.filter((group) => {
      const fingerprint = JSON.stringify(group);
      if (seen.has(fingerprint)) return false;
      seen.add(fingerprint);
      return true;
    }).slice(0, 5);
  }

  // 拼请求
  buildRequest(endpoint, context) {
    const method = String(endpoint.method || 'post').toLowerCase();
    const contentType = endpoint.contentType || 'json';
    let url = BankSource.renderValue(endpoint.url, context);
    const data = BankSource.renderValue(endpoint.data || {}, context);
    const headers = Object.assign({}, BankSource.renderValue(endpoint.headers || {}, context));
    let body;
    if (method === 'get') {
      const query = Object.keys(data)
        .filter((key) => data[key] != null)
        .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(String(data[key])))
        .join('&');
      if (query) url += (url.includes('?') ? '&' : '?') + query;
    } else if (contentType === 'form') {
      headers['Content-Type'] = headers['Content-Type'] || 'application/x-www-form-urlencoded';
      body = Object.keys(data)
        .filter((key) => data[key] != null)
        .map((key) => encodeURIComponent(key) + '=' + encodeURIComponent(String(typeof data[key] === 'object' ? JSON.stringify(data[key]) : data[key])))
        .join('&');
    } else {
      headers['Content-Type'] = headers['Content-Type'] || 'application/json;charset=utf-8';
      body = JSON.stringify(data);
    }
    return { method, url, headers, body };
  }

  // 并发问题库
  async fetch(question) {
    const context = Object.assign({}, question.env, { token: this.settings.tikuToken || '', version: VERSION });
    const settled = await Promise.all(
      this.endpoints.map(async (endpoint) => {
        try {
          const request = this.buildRequest(endpoint, context);
          const response: any = await Http.request({
            method: request.method,
            url: request.url,
            headers: request.headers,
            data: request.body,
            timeout: endpoint.timeoutMs || this.settings.searchTimeoutMs
          });
          return BankSource.toCandidates(NetworkCapture.pluck(response.data, endpoint.resultPath), endpoint);
        } catch (e) {
          this.log.warn(`题库[${endpoint.name || endpoint.url}]请求失败: ${e.message}`);
          return [];
        }
      })
    );
    return settled.flat();
  }
}

// AI 兜底源
export class ModelSource extends AnswerSource {
  static NAME = 'ai';
  static PRIORITY = 3;
  static TIMEOUT = 22000;
  static FALLBACK = true;

  declare endpoints: any;

  constructor(context) {
    super(context);
    const raw = context.settings.aiEndpoints;
    let list = raw;
    if (!Array.isArray(list) || !list.length) {
      list = context.settings.aiBaseUrl
        ? [{ name: context.settings.aiModel || 'AI', baseUrl: context.settings.aiBaseUrl, apiKey: context.settings.aiApiKey || '', model: context.settings.aiModel || '', enabled: true }]
        : [];
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
      '你是答题引擎。只输出答案，不要解释、不要 Markdown、不要复述题干。',
      '规则：',
      '单选题只输出一个选项字母，例如 A；',
      '多选题输出全部正确选项字母并连写，例如 AC，不加空格与标点；',
      '判断题只输出 对 或 错；',
      '填空题按空序输出，多个空之间用 === 分隔；',
      '答案文字要尽量与选项原文一致；',
      '完全无法判断时输出 ?'
    ].join('\n');
    const typeName = { single: '单选', multiple: '多选', judgement: '判断', completion: '填空', match: '连线/选词填空', unknown: '未知' };
    const lines = ['#' + (question.index + 1) + ' [' + typeName[question.type] + ']'];
    if (question.type === QuestionType.COMPLETION) {
      lines.push('空数：' + Math.max(1, question.blankCount));
    } else if (question.type === QuestionType.MATCH) {
      lines.push('槽位候选：');
      (question.slotTexts || []).forEach((text, index) => {
        lines.push('槽' + (index + 1) + ': ' + text);
      });
    } else {
      lines.push('选项：');
      (question.options || []).forEach((option, index) => {
        lines.push(String.fromCharCode(65 + index) + '. ' + (option.text || ''));
      });
    }
    const prompt = lines.join('\n') + '\n\n题干：' + question.stem;

    const answers = [];
    for (const endpoint of this.endpoints) {
      try {
        const body = {
          model: endpoint.model,
          temperature: endpoint.temperature == null ? 0 : endpoint.temperature,
          stream: false,
          messages: [
            { role: 'system', content: endpoint.system || systemPrompt },
            { role: 'user', content: prompt }
          ]
        };
        const headers: any = { 'Content-Type': 'application/json;charset=utf-8' };
        if (endpoint.apiKey) headers.Authorization = 'Bearer ' + endpoint.apiKey;
        const base = String(endpoint.baseUrl).replace(/\/+$/, '');
        const response: any = await Http.request({
          method: 'post',
          url: /\/chat\/completions$/.test(base) ? base : base + '/chat/completions',
          headers,
          data: JSON.stringify(body),
          timeout: endpoint.timeoutMs || this.settings.aiTimeoutMs || 20000
        });
        const payload = response.data || {};
        const message = (payload.choices && payload.choices[0] && (payload.choices[0].message || payload.choices[0].delta)) || {};
        const text = typeof message.content === 'string' ? message.content : '';
        if (!text) throw new Error('模型返回空内容');
        const raw = String(text).replace(/```[\w-]*\n?/g, '').trim();
        let answer = '';
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
    if (!answers.length) this.log.warn('AI 未给出可用答案（模型回 ? 或内容为空）');
    return answers;
  }
}

// 题目采集器
export class QuestionScanner {
  static TYPE_LABELS = Object.keys(TYPE_LABELS)
    .map((label) => ({ lower: label.toLowerCase(), label, type: TYPE_LABELS[label] }))
    .sort((a, b) => b.label.length - a.label.length);

  declare log: any;
  declare spec: any;
  declare splitRe: any;

  constructor(spec, log) {
    this.spec = spec;
    this.log = log || new Logger({ mirror: false });
  }

  // 切分规则按串缓存
  splitRules(patterns, label) {
    if (!this.splitRe) this.splitRe = new Map();
    const cache = this.splitRe;
    if (cache.has(patterns)) return cache.get(patterns);
    const list = (Array.isArray(patterns) ? patterns : [patterns]).map((pattern) => {
      try {
        return { re: new RegExp(pattern, 'g'), head: new RegExp('^(?:' + pattern + ')') };
      } catch (e) {
        this.log.warn(label + '规则不是合法正则: ' + pattern);
        return null;
      }
    });
    if (cache.size > 200) cache.clear();
    cache.set(patterns, list);
    return list;
  }

  // 题型数字原码
  readType(root, config) {
    if (!config.typeInput) return '';
    const input = FrameProbe.scoped(root, config.typeInput)
      || (typeof config.typeInput === 'string' && root.parentElement ? (FrameProbe.queryAll(config.typeInput, root.parentElement)[0] || null) : null);
    if (!input) return '';
    const attribute = config.typeAttribute || 'value';
    return String((input.getAttribute && input.getAttribute(attribute)) || (attribute === 'value' ? input.value : '') || (input.textContent || '').trim());
  }

  // 标签转归一题型
  parseLabel(raw) {
    const codes = this.spec.typeCodes || {};
    const cleaned = TextSanitizer.collapse(String(raw == null ? '' : raw)).replace(/[【】()（）[\]．.、,，]/g, '');
    if (!cleaned) return null;
    const numeric = /^\d+$/.test(cleaned) ? codes[cleaned] : null;
    if (numeric) return numeric;
    const direct = codes[cleaned] || TYPE_LABELS[cleaned] || TYPE_LABELS[cleaned.toLowerCase()];
    if (direct) return direct;
    const lower = cleaned.toLowerCase();
    for (const entry of QuestionScanner.TYPE_LABELS) {
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
    const stemLabel = String(stem || '').match(/^\s*[【\[]\s*([^\]】]{1,6}题)/);
    if (stemLabel && TYPE_LABELS[stemLabel[1]]) return TYPE_LABELS[stemLabel[1]];

    const checkboxes = FrameProbe.queryAll('input[type="checkbox"]', root);
    if (checkboxes.length) return QuestionType.MULTIPLE;
    const radios = FrameProbe.queryAll('input[type="radio"]', root);
    if (radios.length === 2) return QuestionType.JUDGEMENT;
    if (radios.length > 2) return QuestionType.SINGLE;
    const textareas = FrameProbe.queryAll('textarea', root);
    if (!textareas.length && (slots || []).length >= 2) return QuestionType.MATCH;
    if (textareas.length) return QuestionType.COMPLETION;
    if (options.length === 2) {
      const polarities = AnswerResolver.optionPolarities(options.map((option) => option.text));
      if (polarities.indexOf('true') >= 0 && polarities.indexOf('false') >= 0) return QuestionType.JUDGEMENT;
    }
    return QuestionType.UNKNOWN;
  }

  // 整串选项切开
  splitOptions(root, options, config) {
    if (!config.optionsSplit || options.length !== 1) return options;
    const source = options[0].text;
    let parts = [];
    for (const rule of this.splitRules(config.optionsSplit, '选项切分')) {
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
      value: ''
    }));
  }

  // 单容器采集
  build(root, index) {
    const config = this.spec.question || {};
    // 题型原码只读一次；生效视图按题型码 / 文案查 optionsByType 换选择器
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

    // 题干：内联图片后剥噪
    const stemNode = FrameProbe.scoped(root, view.stem) || root;
    if (stemNode && stemNode.querySelectorAll) {
      stemNode.querySelectorAll('img').forEach((img) => {
        const parent = img.parentElement;
        if (!parent || parent.querySelector('span[data-autoquiz-img]')) return;
        const source = img.src || img.getAttribute('data-src') || img.getAttribute('original') || '';
        if (!source || /blankspace\d*\.gif/i.test(source)) return;
        const span = document.createElement('span');
        span.setAttribute('data-autoquiz-img', '1');
        span.style.cssText = 'font-size:0;width:0;height:0;overflow:hidden;display:inline-block';
        span.textContent = ' <img src="' + source + '"> ';
        img.after(span);
      });
    }
    let stem = TextSanitizer.nodeText(stemNode)
      .replace(/^\s*[(（]\s*\d{1,2}\s*[)）]\s*/, '')
      .replace(/^\s*第\s*\d+\s*题\s*[).、．:：]?\s*/i, '')
      .replace(/^\s*[【\[]\s*[^\]】]{0,8}题\s*[】\]]\s*/, '')
      .replace(/^\s*[(（]\s*\d+(?:\.\d+)?\s*分\s*[)）]\s*/, '')
      .replace(/^\s*[[(【（]\s*(?:单选|多选|判断|填空|简答|计算|名词解释|论述|问答|案例分析|完形填空|阅读理解)\s*题?\s*[)\]】）]\s*/, '')
      .replace(/[[(【（](?:单选题|多选题|判断题|填空题|简答|名词解释|完形填空|阅读理解)[)\]】）]/g, '')
      .replace(/[(（]\s*\d+(?:\.\d+)?\s*分\s*[)）]/g, '')
      .replace(/^\s*\d+\s*[。、.．,，]\s*/, '');
    const blockWords = this.spec.noise && this.spec.noise.stemBlock;
    if (Array.isArray(blockWords) && blockWords.length) {
      const pattern = new RegExp('(' + blockWords.filter(Boolean).map((word) => String(word).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'g');
      stem = stem.replace(pattern, '');
    }
    stem = stem.replace(/^[\s.。,，、;；:：]+/, '').trim();

    // 选项节点一一对应
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
        value: target.getAttribute ? target.getAttribute('value') || target.getAttribute('data-value') || '' : ''
      };
    }), view);

    // 填空槽
    const blanks = view.blanks ? FrameProbe.queryAll(view.blanks, root).map((node, i) => ({ index: i, node })) : [];

    // 槽位选题
    const slots = [];
    if (view.matchSlots) {
      const itemSelector = view.matchItems || '[data]';
      const keyAttribute = view.matchKey || 'data';
      FrameProbe.queryAll(view.matchSlots, root).forEach((node) => {
        const choices = FrameProbe.queryAll(itemSelector, node)
          .map((choice, order) => {
            const named = choice.getAttribute ? choice.getAttribute(keyAttribute) : null;
            const valued = choice.getAttribute ? choice.getAttribute('value') : null;
            return {
              index: order,
              node: choice,
              value: named != null && String(named) !== '' ? String(named)
                : valued != null && String(valued) !== '' ? String(valued)
                : String(choice.value == null ? '' : choice.value),
              text: TextSanitizer.option(choice).trim()
            };
          })
          .filter((choice) => choice.value !== '' || choice.text);
        if (choices.length < 2) return;
        slots.push({ index: slots.length, node, choices });
      });
    }
    if (!stem && !options.length && !slots.length) return null;

    // 题干内藏选项
    let split = null;
    if (config.stemSplit && stem) {
      const rule = this.splitRules(config.stemSplit, '题干切分')[0];
      if (rule) {
        const parts = String(stem).split(rule.re).map((part) => String(part).trim()).filter(Boolean);
        if (parts.length >= 2 && parts.length === options.length + 1) split = { stem: parts[0], optionTexts: parts.slice(1) };
      }
    }

    // 共页小题加前缀
    let finalStem = split ? split.stem : stem;
    if (config.stemNumber || config.stemExtra) {
      let scope = root;
      while (scope && scope.parentElement) scope = scope.parentElement;
      if (scope && scope.querySelectorAll) {
        let prefix = '';
        if (config.stemNumber) {
          const items = FrameProbe.queryAll(config.stemNumber.items, scope);
          const at = items.findIndex((node) => node.matches && node.matches(config.stemNumber.current));
          if (at >= 0) prefix += String(config.stemNumber.label || '【第${n}题】').replace(/\$\{n\}/g, String(at + 1));
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

    // 读题目 id
    let id = null;
    if (config.idFrom) {
      const holder = FrameProbe.queryAll(config.idFrom, root)[0] || null;
      if (holder) {
        const raw = (holder.getAttribute && (holder.getAttribute('name') || holder.getAttribute('id') || holder.getAttribute('value'))) || holder.value || '';
        const match = String(raw).match(new RegExp(config.idPattern || '(\\d+)'));
        id = match ? match[1] : (String(raw) || String(index));
      }
    }

    // 卡片属性下标
    let cardIndex = null;
    if (config.indexFrom && root.getAttribute) {
      const digits = String(root.getAttribute(config.indexFrom) || '').match(/\d+/);
      cardIndex = digits ? Number(digits[0]) : null;
    }

    // 背题页答案在题面
    let pageAnswer = '';
    if (view.answer) {
      const answerAttributes = ['data-answer', 'data-answers', 'aria-label', 'title'];
      pageAnswer = FrameProbe.queryAll(view.answer, root)
        .map((node) => (node.value || '').trim() || TextSanitizer.nodeText(node).trim() || TextSanitizer.pickAttribute(node, answerAttributes))
        .filter(Boolean).join(' ');
    }

    // 判断题：先补极性文案，再按图标补符号
    let judged = finalOptions;
    if (finalType === QuestionType.JUDGEMENT) {
      const words = view.judgementOptions;
      if (words && words.length === 2 && AnswerResolver.optionPolarities(judged.map((option) => option.text)).indexOf('true') < 0) {
        const labelNodes = judged.length === 2
          ? judged.map((option) => option.node || option.textNode)
          : (view.clickables ? FrameProbe.queryAll(view.clickables, root) : []);
        if (labelNodes.length === 2 && labelNodes.every((node) => !!node)) {
          judged = labelNodes.map((node, i) => ({ index: i, letter: String.fromCharCode(65 + i), node, textNode: node, text: words[i], value: '' }));
        }
      }
      const icon = (this.spec.write || {}).judgementRightIcon;
      if (icon && judged.length === 2) {
        const polarities = AnswerResolver.optionPolarities(judged.map((option) => option.text));
        if (polarities.indexOf('true') < 0 && polarities.indexOf('false') < 0) {
          const hasIcon = judged.map((option) => {
            const scope = option.node || option.textNode;
            if (!scope) return false;
            try {
              return (scope.querySelector && !!scope.querySelector(icon)) || (scope.matches && scope.matches(icon));
            } catch (e) {
              return false;
            }
          });
          if (hasIcon[0] !== hasIcon[1]) {
            judged = judged.map((option, position) => Object.assign({}, option, { text: option.text + (hasIcon[position] ? ' √' : ' ×') }));
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
    // 不穿透 iframe，选题根最多的文档
    const spec = this.spec;
    const rootSelector = (spec.question || {}).root;
    const follow = !!(spec.iframe && spec.iframe.follow);
    const ownDocument = typeof document !== 'undefined' ? document : null;
    const scopes = follow
      ? FrameProbe.documents(PAGE_WINDOW, spec.iframe.depth == null ? 3 : spec.iframe.depth)
      : [{ win: PAGE_WINDOW, doc: ownDocument }];
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
}
