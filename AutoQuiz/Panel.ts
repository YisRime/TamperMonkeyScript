// 面板域：控制面板的界面、设置联动与日志视图
import { AddonLoop, syncHooks, ForumPoster } from "./Addon.ts";
import { VERSION } from "./Utils.ts";
import { ScreenSearch } from "./Image.ts";
import { DEFAULT_ENDPOINTS } from "./Spec.ts";

// 控制面板
export class ControlPanel {
  declare doc: any;
  declare engine: any;
  declare host: any;
  declare log: any;
  declare refs: any;
  declare rows: any;
  declare screenSearch: any;
  declare settings: any;
  declare store: any;

  constructor(engine, context) {
    this.engine = engine;
    this.store = context.store;
    this.log = context.log;
    this.settings = context.settings;
    this.host = null;
    this.refs = {};
  }

  // 建节点
  create(tag, attributes, children?) {
    const node = this.doc.createElement(tag);
    Object.keys(attributes || {}).forEach((key) => {
      if (key === 'text') node.textContent = attributes[key];
      else if (key === 'style') node.setAttribute('style', attributes[key]);
      else if (key.indexOf('on') === 0) node.addEventListener(key.slice(2).toLowerCase(), attributes[key]);
      else node.setAttribute(key, attributes[key]);
    });
    (children || []).forEach((child) => child && node.appendChild(child));
    return node;
  }

  // 挂载面板
  mount(container) {
    if (!container || !container.body) return null;
    this.doc = container;
    this.host = this.create('div', { id: 'autoquiz-host' });
    const shadow = this.host.attachShadow ? this.host.attachShadow({ mode: 'closed' }) : this.host;
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
    const style = this.create('style', { text: css });
    const wrap = this.buildUi();
    shadow.appendChild(style);
    shadow.appendChild(wrap);
    container.body.appendChild(this.host);
    // 恢复位置
    const position = this.store.get('panelPos', null);
    if (position && typeof position === 'object') {
      wrap.style.left = position.left + 'px';
      wrap.style.top = position.top + 'px';
      wrap.style.right = 'auto';
    }
    this.makeDraggable(wrap);
    // 快捷键
    this.doc.addEventListener('keydown', (event) => {
      if (!event.altKey) return;
      const key = String(event.key).toUpperCase();
      if (key === 'S') { this.engine.start(); event.preventDefault(); }
      else if (key === 'P') { this.engine.pause('手动暂停'); event.preventDefault(); }
      else if (key === 'X') { this.engine.stop(); event.preventDefault(); }
    });
    this.refresh(this.engine.summary());
    // 引擎事件
    this.engine.subscribe((type, payload) => {
      if (type === 'question' && payload) this.upsertRow(payload);
      if (type === 'scan') {
        const box = this.refs.results;
        if (box && box.removeChild) {
          while (box.firstChild) box.removeChild(box.firstChild);
          this.rows = new Map();
        }
      }
      if (type === 'question' || type === 'progress' || type === 'scan' || type === 'finish') this.refresh(this.engine.summary());
    });
    this.log.subscribe((record) => this.appendLog(record));
    this.log.records.slice(-12).forEach((record) => this.appendLog(record));
    return this.host;
  }

  // 构建界面
  buildUi() {
    const refs = this.refs;
    const state = this.create('span', { class: 'st', text: 'idle' });
    refs.state = state;
    const header = this.create('div', { class: 'hd' }, [
      this.create('b', { text: '刷题 ' + VERSION }),
      state,
      this.create('button', { class: 'mini', text: '—', onclick: () => wrap.classList.toggle('collapsed') })
    ]);

    const button = (text, cls, handler?) => this.create('button', { text, class: cls || '', onclick: handler });
    const checkbox = (label, key, onChange?) => {
      const box = this.create('input', { type: 'checkbox' });
      box.checked = !!this.settings[key];
      box.addEventListener('change', () => this.patch({ [key]: box.checked }, onChange));
      return this.create('label', {}, [box, this.create('span', { text: label })]);
    };
    const number = (key, min, max, onChange?) => {
      const input = this.create('input', { type: 'number', value: String(this.settings[key]), min, max, step: '0.25', style: 'width:58px' });
      input.addEventListener('change', () => {
        const value = Number(input.value);
        if (!Number.isNaN(value)) this.patch({ [key]: value }, onChange);
      });
      return input;
    };

    refs.progress = this.create('b', { text: '0/0' });
    refs.rate = this.create('b', { text: '0%' });
    refs.cacheCount = this.create('b', { text: '0' });

    const modeSelect = this.create('select', { name: 'submitMode' });
    [['save', '只保存'], ['gate', '达标才交卷'], ['submit', '直接交卷'], ['none', '不动']].forEach(([value, label]) => {
      const option = this.create('option', { value, text: label });
      if (this.settings.submitMode === value) option.selected = true;
      modeSelect.appendChild(option);
    });
    modeSelect.addEventListener('change', () => this.patch({ submitMode: modeSelect.value }));

    refs.token = this.create('input', { type: 'text', value: String(this.settings.tikuToken || ''), style: 'flex:1' });
    refs.endpoints = this.create('textarea', {
      text: JSON.stringify(this.settings.tikuEndpoints || DEFAULT_ENDPOINTS, null, 1)
    });

    const captureSelect = this.create('select', { name: 'jsonCapture' });
    [['off', '接口拦截·关'], ['xhr', '仅 XHR'], ['all', '+全局 parse']].forEach(([value, label]) => {
      const option = this.create('option', { value, text: label });
      if ((this.settings.jsonCapture || 'off') === value) option.selected = true;
      captureSelect.appendChild(option);
    });
    captureSelect.addEventListener('change', () => this.patch({ jsonCapture: captureSelect.value }, () => {
      this.engine.ensureCapture();
      this.engine.rebuildSources();
    }));

    const patrolSelect = this.create('select', { name: 'antiPatrolLevel' });
    [['0', '关闭'], ['1', '解禁复制'], ['2', '+切屏广播'], ['3', '+调用栈']].forEach(([value, label]) => {
      const option = this.create('option', { value, text: label });
      if (String(this.settings.antiPatrolLevel) === value) option.selected = true;
      patrolSelect.appendChild(option);
    });
    patrolSelect.addEventListener('change', () => {
      this.patch({ antiPatrolLevel: Number(patrolSelect.value) }, () => this.engine.applyShield());
    });

    const modelInputs = [];
    const modelField = (key, placeholder, width?) => {
      const input = this.create('input', { type: 'text', value: String(this.settings[key] || ''), placeholder, style: width ? 'width:' + width : 'flex:1' });
      modelInputs.push(input);
      return input;
    };
    refs.modelBase = modelField('aiBaseUrl', 'https://api…/v1');
    refs.modelKey = modelField('aiApiKey', 'API Key');
    refs.modelName = modelField('aiModel', '模型', '92px');
    refs.ocrLangs = this.create('input', { type: 'text', value: String(this.settings.ocrLangs || ''), placeholder: 'chi_sim+eng', style: 'width:92px' });
    refs.ocrLangs.addEventListener('change', () => this.patch({ ocrLangs: refs.ocrLangs.value.trim() }, () => this.engine.disposeOcr()));
    refs.forumTexts = this.create('input', { type: 'text', value: String(this.settings.forumTexts || ''), placeholder: '讨论区文案，逗号分隔', style: 'flex:1' });
    refs.forumTexts.addEventListener('change', () => this.patch({ forumTexts: refs.forumTexts.value.trim() }, () => this.aux()));
    refs.manualSearch = this.create('input', { type: 'text', placeholder: '粘题目进来搜', style: 'flex:1' });
    modelInputs.forEach((input) => input.addEventListener('change', () => this.patch(
      { aiBaseUrl: refs.modelBase.value.trim(), aiApiKey: refs.modelKey.value.trim(), aiModel: refs.modelName.value.trim() },
      () => this.engine.rebuildSources()
    )));

    const logBox = this.create('pre', { class: 'log' });
    refs.log = logBox;
    const resultsBox = this.create('div', {
      class: 'results',
      style: 'max-height:160px;overflow:auto;margin-top:6px;border-top:1px solid #2c3240'
    });
    refs.results = resultsBox;

    const wrap = this.create('div', { class: 'wrap' }, [
      header,
      this.create('div', { class: 'bd' }, [
        this.create('div', { class: 'row' }, [
          button('开始', '', () => this.engine.start()),
          button('暂停', 'ghost', () => this.engine.pause('手动暂停')),
          button('继续', 'ghost', () => this.engine.resume()),
          button('停止', 'ghost', () => this.engine.stop()),
          button('重扫', 'ghost', () => { this.engine.rescan(); this.refresh(this.engine.summary()); })
        ]),
        this.create('div', { class: 'row kv' }, [
          this.create('span', { text: '进度 ' }), refs.progress,
          this.create('span', { text: ' 命中 ' }), refs.rate,
          this.create('span', { text: ' 缓存 ' }), refs.cacheCount
        ]),
        this.create('div', { class: 'row' }, [this.create('span', { class: 'kv', text: '交卷' }), modeSelect]),
        this.create('div', { class: 'row' }, [this.create('span', { class: 'kv', text: '正确率闸门 %' }), number('submitRateGate', 0, 100)]),
        this.create('div', { class: 'row' }, [
          checkbox('题库缓存', 'useCache'),
          checkbox('在线题库', 'useTiku'),
          checkbox('跳过已答', 'skipDone')
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('随机兜底', 'fillUnmatched'),
          checkbox('指针事件链', 'usePointerChain')
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('混淆字体解码', 'enableFontDecode', () => {
            this.engine.applyFont().then(() => {
              this.engine.rescan();
              this.refresh(this.engine.summary());
            });
          }),
          this.create('span', { class: 'kv', text: '防巡查' }),
          patrolSelect
        ]),
        this.create('div', { class: 'row' }, [
          this.create('span', { class: 'kv', text: '接口拦截' }),
          captureSelect
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('AI 兜底答题', 'useAi', () => this.engine.rebuildSources()),
          refs.modelName
        ]),
        this.create('div', { class: 'row' }, [refs.modelBase]),
        this.create('div', { class: 'row' }, [refs.modelKey]),
        this.create('div', { class: 'row' }, [
          checkbox('图片题识图', 'useOcr', () => this.engine.disposeOcr()),
          this.create('span', { class: 'kv', text: '语言' }),
          refs.ocrLangs,
          button('划选搜题', 'ghost', () => this.screen().run()),
          button('清识别缓存', 'ghost', () => { this.store.set('ocr', {}); this.log.info('识图缓存已清空'); })
        ]),
        this.create('div', { class: 'row' }, [
          refs.manualSearch,
          button('搜题', 'ghost', () => this.screen().runText(refs.manualSearch.value)),
          button('搜选中文字', 'ghost', () => this.screen().runSelection())
        ]),
        this.create('div', { class: 'row' }, [this.create('span', { class: 'kv', text: 'token' }), refs.token]),
        refs.endpoints,
        this.create('div', { class: 'row' }, [
          // 应用题库配置
          button('应用题库配置', '', () => {
            const patchValues: any = { tikuToken: refs.token.value.trim() };
            try {
              const parsed = JSON.parse(refs.endpoints.value);
              if (!Array.isArray(parsed)) throw new Error('端点表必须是数组');
              parsed.forEach((endpoint) => { if (!endpoint || !endpoint.url) throw new Error('每个端点必须有 url 字段'); });
              patchValues.tikuEndpoints = parsed;
            } catch (e) {
              this.log.error('题库配置无效: ' + e.message);
              return;
            }
            this.patch(patchValues, () => this.engine.rebuildSources());
            this.log.info('题库配置已应用');
          }),
          button('清空缓存', 'ghost', () => { this.store.set('cache', []); this.refresh(this.engine.summary()); this.log.info('缓存已清空'); }),
          // 导出缓存
          button('导出缓存', 'ghost', () => {
            const json = JSON.stringify(this.store.cacheList(), null, 1);
            const copied = this.doc.defaultView && this.doc.defaultView.navigator && this.doc.defaultView.navigator.clipboard;
            if (copied) {
              copied.writeText(json).then(() => this.log.info('缓存 JSON 已复制到剪贴板'), () => window.prompt('缓存 JSON：', json));
            } else {
              window.prompt('缓存 JSON：', json);
            }
          })
        ]),
        this.create('div', { class: 'row kv', text: '—— 附加能力（与刷题无关，默认关）——' }),
        this.create('div', { class: 'row' }, [
          checkbox('视频倍速', 'useVideoRate', () => this.aux()),
          number('videoRate', 0.25, 16, () => this.aux()),
          checkbox('被暂停就续播', 'videoKeepPlaying', () => this.aux())
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('讨论水帖', 'useForum', () => this.aux()),
          refs.forumTexts,
          // 发一条水帖
          button('发一条', 'ghost', () => {
            const texts = ForumPoster.texts(this.settings.forumTexts);
            if (!texts.length) {
              this.log.warn('先填讨论区文案（逗号分隔）');
              return;
            }
            const loop = AddonLoop.obtain(this.engine.doc || document);
            const done = loop.poster.post(this.engine.doc || document, { texts });
            if (done.action === 'posted') loop.posted = true;
            this.log[done.action === 'posted' ? 'info' : 'warn'](done.action === 'posted' ? '已提交一条讨论' : '讨论没发出去：' + done.action);
          })
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('Vue 组件取题', 'useVueProbe', () => this.aux(true)),
          checkbox('压掉视频弹题', 'useResponseTamper', () => this.aux(false))
        ]),
        this.create('div', { class: 'row' }, [
          checkbox('静音音频保活', 'useKeepAlive', () => this.aux()),
          checkbox('多开时让位', 'useSingleTab', () => this.engine.acquireLock())
        ]),
        resultsBox,
        logBox
      ])
    ]);
    return wrap;
  }

  // 附加能力入口
  aux(resharvest?) {
    syncHooks(this.settings, this.log);
    this.engine.applyProbe();
    if (resharvest && this.engine.harvestVue()) {
      this.engine.rescan();
      this.refresh(this.engine.summary());
    }
    if (this.settings.useResponseTamper) this.log.warn('响应改写已开启，需刷新页面才能盖住本页已发出的弹题请求');
    AddonLoop.obtain(this.engine.doc || document);
  }

  // 按需建搜题
  screen() {
    if (!this.screenSearch) this.screenSearch = new ScreenSearch({ engine: this.engine, store: this.store, log: this.log, settings: this.settings });
    return this.screenSearch;
  }

  // 改设置并落盘
  patch(values, after?) {
    Object.assign(this.settings, values);
    this.store.set('settings', Object.assign({}, this.store.get('settings', {}), values));
    if (after) after();
  }

  // 拖拽
  makeDraggable(wrap) {
    const header = wrap.querySelector('.hd');
    let dragging = null;
    const onMove = (event) => {
      if (!dragging) return;
      const point = event.touches ? event.touches[0] : event;
      wrap.style.left = point.clientX - dragging.dx + 'px';
      wrap.style.top = point.clientY - dragging.dy + 'px';
      wrap.style.right = 'auto';
    };
    const onUp = () => {
      if (!dragging) return;
      dragging = null;
      this.store.set('panelPos', { left: parseInt(wrap.style.left, 10) || 0, top: parseInt(wrap.style.top, 10) || 0 });
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    const onDown = (event) => {
      const point = event.touches ? event.touches[0] : event;
      const bounds = wrap.getBoundingClientRect();
      dragging = { dx: point.clientX - bounds.left, dy: point.clientY - bounds.top };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
      event.preventDefault();
    };
    if (header) {
      header.addEventListener('mousedown', onDown);
      header.addEventListener('touchstart', onDown, { passive: true });
    }
  }

  // 追加日志
  appendLog(record) {
    const box = this.refs.log;
    if (!box) return;
    const line = this.create('div', { class: record.level === 'error' ? 'error' : record.level === 'warn' ? 'warn' : '', text: record.text });
    box.appendChild(line);
    while (box.childNodes.length > 80) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  // 一题一行
  upsertRow(record) {
    const box = this.refs.results;
    if (!box) return null;
    this.rows = this.rows || new Map();
    let row = this.rows.get(record.index);
    if (!row) {
      row = this.create('div', { class: 'qrow' });
      row.cells = [this.create('span', { class: 'c-no' }), this.create('span', { class: 'c-stem' }), this.create('span', { class: 'c-ans' }), this.create('span', { class: 'c-from' })];
      row.cells.forEach((cell) => row.appendChild(cell));
      box.appendChild(row);
      this.rows.set(record.index, row);
    }
    const answered = !!record.finish;
    const answer = (record.texts || []).join(' / ') || (answered ? '已作答' : '未命中');
    const detail = answered ? '' : (record.candidateTexts || []).join(' ｜ ') || record.matched || '';
    row.cells[0].textContent = String(record.index + 1);
    row.cells[1].textContent = String(record.stem || '').slice(0, 24);
    row.cells[2].textContent = answer;
    row.cells[3].textContent = answered ? record.from || '-' : record.matched || '-';
    row.setAttribute('class', 'qrow ' + (answered ? 'ok' : 'miss'));
    row.setAttribute('title', detail || answer);
    if (record.node && record.node.scrollIntoView) {
      row.style.cursor = 'pointer';
      row.onclick = () => {
        try {
          record.node.scrollIntoView({ block: 'center', behavior: 'smooth' });
        } catch (e) {}
      };
    }
    return row;
  }

  // 刷新状态
  refresh(summary) {
    if (!this.refs.state) return;
    const labels = { idle: '未开始', running: '进行中', paused: '已暂停', done: '已完成', error: '出错' };
    this.refs.state.textContent = labels[summary.state] || summary.state;
    this.refs.state.className = 'st ' + summary.state;
    this.refs.progress.textContent = summary.done + '/' + summary.total;
    this.refs.rate.textContent = summary.rate.toFixed(0) + '%';
    this.refs.cacheCount.textContent = String(this.store.cacheList().length);
  }
}
