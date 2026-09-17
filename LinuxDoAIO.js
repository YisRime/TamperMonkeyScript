// ==UserScript==
// @name         Linux Do All In One
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.2
// @author       YisRime
// @description  Linux Do 小助手：直接跳转外链、只看楼主、去除样式、AI 总结，并可查询升级指标与积分资产，甚至支持自动阅读与点赞回复。
// @match        https://linux.do/*
// @match        https://idcflare.com/*
// @icon         https://www.google.com/s2/favicons?domain=linux.do
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @connect      *
// @connect      credit.linux.do
// @connect      connect.linux.do
// @connect      linux.do
// @run-at       document-idle
// @license      AGPLv3
// ==/UserScript==
(function () {
    'use strict';
    const env = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
    if (env.booted) return;
    env.booted = true;

    const Prompts = {
        summary: '根据本贴以下内容，总结本贴内容，600字以内。需要包含：1、主贴核心内容。2、主要观点倾向。3、核心共识/分歧。4、代表性回复。5、其它值得补充的内容。',
        reply: '根据本贴以下内容，撰写一条回复，简明扼要。需要以个人身份进行口语化的回复，可以参考其它用户的回复，从而引导用户之间的交流与互动。'
    };

    const Logger = {
        element: null,
        setup(element) {
            this.element = element;
            this.draw();
        },
        retrieve() {
            try {
                return JSON.parse(sessionStorage.getItem('lda_logs') || '[]');
            } catch {
                return [];
            }
        },
        write(message) {
            const item = { time: new Date().toTimeString().split(' ')[0], text: String(message) };
            const list = this.retrieve();
            if (list.push(item) > 64) list.shift();
            try {
                sessionStorage.setItem('lda_logs', JSON.stringify(list));
            } catch {}
            if (this.element) {
                this.element.insertAdjacentHTML(
                    'beforeend',
                    `<div class="lda-log-line"><span class="lda-log-time">[${item.time}]</span><span class="lda-log-text">${item.text}</span></div>`
                );
                this.element.scrollTop = this.element.scrollHeight;
            }
        },
        draw() {
            if (!this.element) return;
            this.element.innerHTML = this.retrieve()
                .map(item => `<div class="lda-log-line"><span class="lda-log-time">[${item.time}]</span><span class="lda-log-text">${item.text}</span></div>`)
                .join('');
            this.element.scrollTop = this.element.scrollHeight;
        },
        clear() {
            sessionStorage.removeItem('lda_logs');
            if (this.element) this.element.innerHTML = '';
        }
    };

    const Tool = {
        random: (min, max) => Math.floor(Math.random() * (max - min + 1)) + min,
        wait: async (milliseconds, runner) => {
            const destination = milliseconds ?? Tool.random(500, 2000), start = Date.now();
            while (Date.now() - start < destination) {
                if (runner && !runner.active) return false;
                await new Promise(resolve => setTimeout(resolve, Math.min(500, destination - (Date.now() - start))));
            }
            return true;
        },
        poll: async (condition, timeout = 5000, step = 500) => {
            const start = Date.now();
            while (Date.now() - start < timeout) {
                const result = condition();
                if (result) return result;
                await new Promise(resolve => setTimeout(resolve, step));
            }
            return null;
        },
        bottom: () => Math.ceil((window.scrollY || document.documentElement.scrollTop) + (window.innerHeight || document.documentElement.clientHeight)) >= Math.max(document.body.scrollHeight, document.documentElement.scrollHeight) - 256,
        ready: () => !document.querySelector('.loading, .infinite-scroll'),
        identity: (url = location.href) => url.match(/\/t\/.*?\/(\d+)/)?.[1] || null,
        title: () => document.querySelector('#topic-title h1 a, #topic-title .fancy-title')?.innerText?.trim(),
        unread: () => document.querySelector('.read-state:not(.read)'),
        cloudflare: () => !document.querySelector('#main-outlet, #topic-title, .topic-list') && (document.title.includes('Just a moment...') || Boolean(document.querySelector('#challenge-stage, #challenge-running'))),
        measure: (element) => {
            const text = element?.querySelector?.('.cooked');
            return text ? (text.textContent?.length || 0) + (text.querySelectorAll('img, video, iframe').length * 64) : 0;
        },
        parse: (string) => {
            string = String(string || '').trim().toLowerCase();
            const number = parseFloat(string);
            if (isNaN(number)) return 0;
            return string.endsWith('k') ? Math.round(number * 1000) : (string.endsWith('w') ? Math.round(number * 10000) : Math.round(number));
        },
        corpus: () => {
            let result = `话题：${Tool.title() || ''}\n`;
            for (const [index, element] of Array.from(document.querySelectorAll('.topic-post')).entries()) {
                const text = element.querySelector('.cooked')?.innerText?.trim();
                if (text) {
                    const number = element.dataset.postNumber || (index + 1);
                    const name = element.querySelector('.names .first a')?.innerText?.trim() || '用户';
                    const line = `[${number}] ${name}：${text}\n`;
                    if ((result + line).length > 65536) break;
                    result += line;
                }
            }
            return result.trim();
        },
        ask: async (messages, stream) => {
            const url = GM_getValue('lda_ai_url', ''), key = GM_getValue('lda_ai_key', ''), model = GM_getValue('lda_ai_model', '');
            return new Promise((resolve, reject) => {
                const fail = (message = '网络出错') => reject(new Error(message));
                let index = 0, buffer = '', text = '';
                const process = (chunk) => {
                    buffer += chunk.slice(index);
                    index = chunk.length;
                    const lines = buffer.split('\n');
                    buffer = lines.pop() || '';
                    for (const raw of lines) {
                        const line = raw.trim();
                        if (!line || !line.startsWith('data:')) continue;
                        const data = line.replace(/^data:\s*/, '').trim();
                        if (data === '[DONE]') continue;
                        try {
                            const delta = JSON.parse(data).choices?.[0]?.delta?.content || '';
                            if (delta) { text += delta; if (stream) stream(delta, text); }
                        } catch {}
                    }
                };
                GM_xmlhttpRequest({
                    method: 'POST',
                    url,
                    timeout: 60000,
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}`, 'Accept': 'text/event-stream' },
                    data: JSON.stringify({ model, messages, stream: true }),
                    onprogress: (response) => { if (response.responseText) process(response.responseText); },
                    onload: (response) => {
                        try {
                            if (response.status >= 200 && response.status < 300) {
                                if (response.responseText && response.responseText.length > index) process(response.responseText + '\n');
                                if (!text) {
                                    text = JSON.parse(response.responseText).choices?.[0]?.message?.content?.trim() || '';
                                    if (stream && text) stream(text, text);
                                }
                                resolve(text.trim());
                            } else {
                                let message = `HTTP ${response.status}`;
                                try { const data = JSON.parse(response.responseText); if (data.error?.message) message = data.error.message; } catch {}
                                reject(new Error(message));
                            }
                        } catch {
                            reject(new Error('解析出错'));
                        }
                    },
                    ontimeout: () => fail('请求超时'),
                    onerror: () => fail('网络出错')
                });
            });
        },
        speech: async (stream) => {
            const systemPrompt = GM_getValue('lda_ai_reply', Prompts.reply);
            const messages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
            messages.push({ role: 'user', content: Tool.corpus() });
            const response = await Tool.ask(messages, stream);
            return (response || '').replace(/^["'“]+|["'”]+$/g, '').trim();
        }
    };

    const Stealth = {
        audio: null,
        timer: null,
        poke() {
            try {
                const target = Tool.identity();
                if (!target) return;
                const model = env.Discourse?.__container__?.lookup?.('controller:topic')?.model;
                if (!model?.id || String(model.id) !== String(target)) return;
                const track = env.Discourse.__container__.lookup('service:screen-track');
                if (track && track.topicId !== Number(model.id)) track.start?.(Number(model.id), model);
                track?.scrolled?.();
            } catch {}
        },
        keep() {
            try {
                if (!this.audio && (window.AudioContext || window.webkitAudioContext)) {
                    this.audio = new (window.AudioContext || window.webkitAudioContext)();
                    const oscillator = this.audio.createOscillator(), gain = this.audio.createGain();
                    gain.gain.value = 0.00001;
                    oscillator.connect(gain);
                    gain.connect(this.audio.destination);
                    oscillator.start();
                }
                if (this.audio?.state === 'suspended') this.audio.resume();
            } catch {}
            if (!this.timer) {
                this.poke();
                this.timer = setInterval(() => this.poke(), 30000);
            }
        },
        suspend() {
            try { if (this.audio?.state === 'running') this.audio.suspend(); } catch {}
            if (this.timer) {
                clearInterval(this.timer);
                this.timer = null;
            }
        }
    };

    const Interceptor = {
        view: null,
        runner: null,
        close() {
            setTimeout(() => {
                const button = document.querySelector('.dialog-footer .btn-primary, .d-modal__footer .btn-primary');
                if (button) button.click();
                else document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
            }, Tool.random(500, 2000));
        },
        handle(mode, url, code, response = null, data = null, reactive = false) {
            Logger.write(`请求出错：${(mode || 'GET').toUpperCase()} ${String(url).replace(location.origin, '').split('?')[0]} ${code || 'ERR'}`);
            if (code === 429) {
                let seconds = parseInt(response?.headers?.get?.('Retry-After') || data?.extras?.wait_seconds, 10) || 300;
                if (reactive) {
                    GM_setValue('lda_cooldown', Date.now() + seconds * 1000);
                    this.view?.cooldown();
                    this.close();
                }
                this.runner?.pause(seconds);
            }
        },
        setup(view) {
            this.view = view;
            const originalFetch = env.fetch;
            env.fetch = async function (...args) {
                const url = String(args[0]?.url || args[0]);
                if (/challenges\.cloudflare\.com|cdn-cgi\/challenge-platform|turnstile/.test(url)) {
                    return originalFetch.apply(this, args);
                }
                const mode = String(args[1]?.method || args[0]?.method || 'GET').toUpperCase();
                const reactive = /toggle\.json|custom-reactions|discourse-reactions|post_actions/.test(url);
                let response;
                try {
                    response = await originalFetch.apply(this, args);
                } catch (error) {
                    Interceptor.handle(mode, url, 0, null, null, reactive);
                    throw error;
                }
                if (!response.ok) {
                    let data = null;
                    try { data = await response.clone().json(); } catch {}
                    Interceptor.handle(mode, url, response.status, response, data, reactive);
                } else if (reactive) {
                    try {
                        const data = await response.clone().json();
                        if (data?.error_type || data?.errors) Interceptor.handle(mode, url, response.status, response, data, true);
                    } catch {}
                }
                return response;
            };
        }
    };

    const Patch = {
        watcher: null,
        bound: false,
        splash(state) {
            const key = 'linuxdo-kill-splash-style';
            let element = document.getElementById(key);
            if (state) {
                if (!element) {
                    element = document.createElement('style');
                    element.id = key;
                    element.textContent = `#d-splash { display: none !important; opacity: 0 !important; pointer-events: none !important; }`;
                    document.head.appendChild(element);
                }
                document.getElementById('d-splash')?.remove();
            } else if (element) {
                element.remove();
            }
        },
        space(text) {
            if (!text || typeof text !== 'string') return text;
            return text
                .replace(/([\u4e00-\u9fa5\u3040-\u30FF])([a-zA-Z0-9_\+\=\@\$\%\^\&\*\-\+\/\\])/g, '$1 $2')
                .replace(/([a-zA-Z0-9_\+\=\@\$\%\^\&\*\-\+\/\\])([\u4e00-\u9fa5\u3040-\u30FF])/g, '$1 $2')
                .replace(/([\u4e00-\u9fa5\u3040-\u30FF])([(\[<])/g, '$1 $2')
                .replace(/([)\]>])([\u4e00-\u9fa5\u3040-\u30FF])/g, '$1 $2');
        },
        typeset(node) {
            if (!node || node.dataset.pangu === 'true') return;
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT, {
                acceptNode: (item) => ['script', 'style', 'code', 'pre', 'textarea'].includes(item.parentNode?.tagName?.toLowerCase()) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT
            });
            const nodes = [];
            while (walker.nextNode()) nodes.push(walker.currentNode);
            for (const item of nodes) {
                const fix = this.space(item.nodeValue);
                if (fix !== item.nodeValue) item.nodeValue = fix;
            }
            node.dataset.pangu = 'true';
        },
        editor() {
            const box = document.querySelector('.d-editor-input');
            if (!box) return;
            const raw = box.value, fix = this.space(raw);
            if (raw === fix) return;
            box.focus();
            if (!document.execCommand('insertText', false, fix)) {
                box.setRangeText(fix, 0, box.value.length, 'end');
                box.dispatchEvent(new Event('input', { bubbles: true }));
            }
        },
        async draft(button) {
            const box = document.querySelector('.d-editor-input');
            if (!box) return;
            button.disabled = true;
            try {
                const words = await Tool.speech((delta, text) => {
                    box.focus();
                    box.value = text.replace(/^["'“]+|["'”]+$/g, '').trimStart();
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                    box.scrollTop = box.scrollHeight;
                });
                if (words) {
                    box.focus();
                    box.value = words;
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                }
            } catch (error) {
                Logger.write(`操作出错：${error.message}`);
            } finally {
                button.disabled = false;
            }
        },
        button() {
            const base = document.querySelector('.save-or-cancel .cancel, .save-or-cancel .create');
            if (!base) return;
            const attach = (key, className, title, text, action) => {
                const exist = document.querySelector(`.${className}`);
                if (!GM_getValue(`lda_opt_${key}`, true)) {
                    exist?.remove();
                    return;
                }
                if (exist) return;
                const button = document.createElement('button');
                button.className = `btn discard-button btn-transparent ${className}`;
                button.type = 'button';
                button.title = title;
                button.innerHTML = `<span class="d-button-label">${text}</span>`;
                button.onclick = (event) => {
                    event.preventDefault();
                    action(button);
                };
                base.parentNode.insertBefore(button, base.nextSibling);
            };
            attach('typeset', 'pangutext', '格式化', '格式化', () => Patch.editor());
            attach('draft', 'lda-draft-btn', 'AI回复', 'AI回复', (button) => Patch.draft(button));
        },
        format(timestamp) {
            const date = new Date(timestamp), now = new Date(), zero = (number) => String(number).padStart(2, '0');
            const hours = zero(date.getHours()), minutes = zero(date.getMinutes());
            if (now.toDateString() === date.toDateString()) return `${hours}:${minutes}`;
            const month = zero(date.getMonth() + 1), day = zero(date.getDate());
            return `${now.getFullYear() === date.getFullYear() ? '' : date.getFullYear() + '/'}${month}/${day} ${hours}:${minutes}`;
        },
        stamp(node) {
            if (!node || node.dataset.stamped) return;
            const element = node.querySelector('.relative-date'), timestamp = element ? Number(element.dataset.time) : null;
            if (!timestamp) return;
            const difference = Date.now() - timestamp, day = 86400000;
            const text = document.createElement('span');
            text.className = 'linuxtime';
            text.style.color = difference < day ? '#34d399' : (difference < day * 7 ? '#10b981' : (difference < day * 30 ? '#047857' : '#94a3b8'));
            text.textContent = `（${this.format(timestamp)}）`;
            (node.querySelector('.post-activity') || node).appendChild(text);
            node.dataset.stamped = 'true';
        },
        inject(style) {
            const key = 'linuxdo-scripts-custom-css';
            let element = document.getElementById(key);
            if (!style) {
                element?.remove();
                return;
            }
            if (!element) {
                element = document.createElement('style');
                element.id = key;
                document.head.appendChild(element);
            }
            element.textContent = style;
        },
        freeze(image) {
            if (!image || image.dataset.frozen) return;
            const path = image.getAttribute('src');
            if (!path || !path.toLowerCase().includes('.gif')) return;
            image.dataset.frozen = 'true';
            const clone = new Image();
            clone.crossOrigin = 'anonymous';
            clone.src = path;
            clone.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    canvas.width = clone.naturalWidth || image.width || 45;
                    canvas.height = clone.naturalHeight || image.height || 45;
                    canvas.getContext('2d').drawImage(clone, 0, 0, canvas.width, canvas.height);
                    image.src = canvas.toDataURL('image/png');
                } catch {}
            };
        },
        purge() {
            if (!GM_getValue('lda_opt_purge', true)) return;
            const welfare = /welfare|36/.test(location.pathname) || Boolean(document.querySelector('.category-breadcrumb .badge-category__name')?.textContent?.includes('福利羊毛'));
            document.querySelectorAll('.topic-list-item').forEach(element => {
                if (!(welfare || Boolean(element.querySelector('.badge-category__name')?.textContent?.includes('福利羊毛')))) return;
                const title = element.querySelector('a.title, .raw-topic-link')?.textContent || '';
                if (element.classList.contains('closed') || element.querySelector('.d-icon-lock') || /已?(?:无|完|出|送|关|结)/.test(title)) {
                    element.style.setProperty('display', 'none', 'important');
                }
            });
        },
        mute(element) {
            if (element.dataset.muted) return;
            if (element.tagName === 'VIDEO') {
                element.autoplay = false;
                element.removeAttribute('autoplay');
                element.pause();
                element.dataset.muted = 'true';
            } else if (element.tagName === 'IFRAME') {
                const source = element.getAttribute('src');
                if (!source) return;
                try {
                    const url = new URL(source, location.origin);
                    if (url.searchParams.get('autoplay') !== 'false' && url.searchParams.get('autoplay') !== '0') {
                        url.searchParams.set('autoplay', 'false');
                        element.src = url.toString();
                    }
                    element.dataset.muted = 'true';
                } catch {}
            }
        },
        clarify(state) {
            const key = 'linuxdo-filter-spoiler-style';
            let element = document.getElementById(key);
            if (state) {
                if (!element) {
                    element = document.createElement('style');
                    element.id = key;
                    element.textContent = `.spoiled, .spoiled *, .spoiler, .spoiler * { filter: none !important; opacity: 1 !important; }`;
                    document.head.appendChild(element);
                }
            } else {
                element?.remove();
            }
        },
        async floors(button) {
            const identity = Tool.identity();
            const name = env.Discourse?.User?.current()?.username || env.Discourse?.__container__?.lookup?.('service:current-user')?.username;
            if (!identity || !name) return;
            const existing = button.parentElement?.querySelectorAll('.lda-floor-btn');
            if (existing?.length) return existing.forEach(element => element.remove());
            button.disabled = true;
            try {
                const response = await fetch(`/t/${identity}.json?username_filters[]=${encodeURIComponent(name)}`);
                if (!response.ok) return;
                const stream = (await response.json()).post_stream || {};
                let list = (stream.posts || []).filter(post => post.username?.toLowerCase() === name.toLowerCase());

                const remain = (stream.stream || []).filter(id => !list.some(post => post.id === id));
                if (remain.length) {
                    const extra = await fetch(`/t/${identity}/post_stream.json?${remain.map(id => `post_ids[]=${id}`).join('&')}`);
                    if (extra.ok) list = list.concat((await extra.json()).post_stream?.posts || []);
                }

                const items = [...new Set(list.map(post => post.post_number).filter(num => num > 1))].sort((a, b) => a - b);
                let base = button;
                items.forEach(number => {
                    const node = document.createElement('button');
                    node.className = 'btn btn-default no-text lda-floor-btn';
                    node.type = 'button';
                    node.title = `前往 ${number} 楼`;
                    node.innerHTML = `<span class="d-button-label">#${number}</span>`;
                    node.onclick = (event) => {
                        event.preventDefault();
                        const post = document.querySelector(`.topic-post[data-post-number="${number}"], #post_${number}`);
                        if (post) post.scrollIntoView({ behavior: 'smooth' });
                        else env.Discourse?.__container__?.lookup?.('service:router')?.transitionTo(`/t/-/${identity}/${number}`) || (location.href = `/t/-/${identity}/${number}`);
                    };
                    base.after(node);
                    base = node;
                });
            } catch (error) {
                Logger.write(`操作出错：${error.message}`);
            } finally {
                button.disabled = false;
            }
        },
        async digest(button) {
            const wrapper = document.querySelector('.timeline-container'), identity = Tool.identity();
            if (!wrapper || !identity) return;
            let card = document.getElementById('lda-digest-card');
            if (card && card.dataset.tid === identity) {
                if (card.style.display !== 'none') { card.style.display = 'none'; return; }
                if (card.dataset.done === 'true') { card.style.display = 'flex'; return; }
            }
            if (!card) {
                card = document.createElement('div');
                card.id = 'lda-digest-card';
                card.innerHTML = `<div class="lda-digest-head"><span>AI 话题总结</span><button type="button" class="lda-modal-close" title="关闭">&times;</button></div><div class="lda-digest-body"></div>`;
                card.querySelector('.lda-modal-close').onclick = (event) => { event.stopPropagation(); card.style.display = 'none'; };
                wrapper.appendChild(card);
            }
            card.dataset.tid = identity;
            card.dataset.done = 'false';
            card.style.display = 'flex';
            const body = card.querySelector('.lda-digest-body');
            try {
                body.textContent = '正在总结...';
                button.disabled = true;
                const systemPrompt = GM_getValue('lda_ai_summary', Prompts.summary);
                const messages = systemPrompt ? [{ role: 'system', content: systemPrompt }] : [];
                messages.push({ role: 'user', content: Tool.corpus() });
                const response = await Tool.ask(messages, (_, text) => { body.textContent = text; body.scrollTop = body.scrollHeight; });
                body.textContent = response || '暂无总结';
                card.dataset.done = 'true';
            } catch (error) {
                Logger.write(`操作出错：${error.message}`);
            } finally {
                button.disabled = false;
            }
        },
        control() {
            const box = document.querySelector('.timeline-controls');
            if (!box) return;
            const attach = (key, className, title, svg, action) => {
                const exist = document.querySelector(`.${className}`);
                if (!GM_getValue(`lda_opt_${key}`, true)) {
                    exist?.remove();
                    return;
                }
                if (exist) return;
                const button = document.createElement('button');
                button.className = `btn no-text btn-icon icon btn-default ${className}`;
                button.type = 'button';
                button.title = title;
                button.innerHTML = svg;
                button.onclick = () => action(button);
                box.appendChild(button);
            };
            attach('digest', 'lda-digest-btn', '智能总结本贴', `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83"></path></svg>`, (button) => Patch.digest(button));
            attach('floors', 'lda-ownreply-btn', '查询我的回复', `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>`, (button) => Patch.floors(button));
            const digestBtn = box.querySelector('.lda-digest-btn');
            const floorsBtn = box.querySelector('.lda-ownreply-btn');
            if (digestBtn && floorsBtn && floorsBtn.compareDocumentPosition(digestBtn) & Node.DOCUMENT_POSITION_FOLLOWING) {
                box.insertBefore(digestBtn, floorsBtn);
            }
        },
        bypass(event) {
            if (!GM_getValue('lda_opt_bypass', true)) return;
            const anchor = event?.target?.closest?.('a[href]');
            if (!anchor) return;
            try {
                const url = new URL(anchor.href, location.origin);
                if (url.protocol.startsWith('http') && url.host !== location.host) event.stopPropagation();
            } catch {}
        },
        setup() {
            const options = {
                typeset: GM_getValue('lda_opt_typeset', true),
                stamp: GM_getValue('lda_opt_stamp', true),
                freeze: GM_getValue('lda_opt_freeze', true),
                purge: GM_getValue('lda_opt_purge', true),
                mute: GM_getValue('lda_opt_mute', true),
                clarify: GM_getValue('lda_opt_clarify', true),
                splash: GM_getValue('lda_opt_splash', true),
                style: GM_getValue('lda_opt_style', '')
            };
            this.inject(options.style);
            this.clarify(options.clarify);
            this.splash(options.splash);
            if (!this.bound) {
                window.addEventListener('click', (event) => this.bypass(event), true);
                this.bound = true;
            }
            if (options.typeset) document.querySelectorAll('.cooked, #topic-title h1').forEach(element => this.typeset(element));
            this.button();
            if (options.stamp) document.querySelectorAll('.topic-list .age').forEach(element => this.stamp(element));
            if (options.freeze) document.querySelectorAll('.post-avatar .avatar, .avatar-flair-preview .avatar, img.avatar').forEach(element => this.freeze(element));
            if (options.purge) this.purge();
            if (options.mute) document.querySelectorAll('.cooked video, .cooked iframe').forEach(element => this.mute(element));
            this.control();
            if (this.watcher) this.watcher.disconnect();
            this.watcher = new MutationObserver((mutations) => {
                const configuration = {
                    typeset: GM_getValue('lda_opt_typeset', true),
                    stamp: GM_getValue('lda_opt_stamp', true),
                    freeze: GM_getValue('lda_opt_freeze', true),
                    purge: GM_getValue('lda_opt_purge', true),
                    mute: GM_getValue('lda_opt_mute', true),
                    splash: GM_getValue('lda_opt_splash', true)
                };
                if (configuration.splash) document.getElementById('d-splash')?.remove();
                if (configuration.purge) this.purge();
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType !== Node.ELEMENT_NODE) continue;
                        if (configuration.typeset) { if (node.classList?.contains('cooked')) this.typeset(node); else node.querySelectorAll?.('.cooked').forEach(element => this.typeset(element)); }
                        if (configuration.stamp) { if (node.classList?.contains('age')) this.stamp(node); else node.querySelectorAll?.('.topic-list .age:not([data-stamped])').forEach(element => this.stamp(element)); }
                        if (configuration.freeze) { if (node.matches?.('.avatar')) this.freeze(node); else node.querySelectorAll?.('.avatar').forEach(element => this.freeze(element)); }
                        if (configuration.mute) { if (node.matches?.('video, iframe')) this.mute(node); else node.querySelectorAll?.('video, iframe').forEach(element => this.mute(element)); }
                    }
                }
                this.button();
                this.control();
            });
            this.watcher.observe(document.body, { childList: true, subtree: true });
        }
    };

    class Liker {
        constructor(view) {
            this.view = view;
            this.history = new Set();
        }
        reset() {
            this.history.clear();
        }
        cooling() {
            return GM_getValue('lda_cooldown', 0) > Date.now();
        }
        async execute(runner) {
            if (this.cooling()) {
                this.view.cooldown();
                return;
            }
            for (const post of document.querySelectorAll('.topic-post')) {
                if (this.cooling() || !runner.active) return;
                const identity = post.dataset.postNumber;
                if (!identity || this.history.has(identity)) continue;
                const bounds = post.getBoundingClientRect();
                if (bounds.top >= window.innerHeight - 64 || bounds.bottom <= 64) continue;
                if (post.querySelector('.has-used-main-reaction')) {
                    this.history.add(identity);
                    continue;
                }
                const count = post.querySelector('.discourse-reactions-counter');
                const score = count ? Tool.parse(count.innerText || count.getAttribute('aria-label')) : 0;
                if (this.view.thresh > 0 && score < this.view.thresh) continue;
                const button = post.querySelector('.btn-toggle-reaction-like');
                if (!button) continue;
                this.history.add(identity);
                button.click();
                Logger.write(`自动点赞：第 ${identity} 楼`);
                if (!(await Tool.wait(Tool.random(500, 2000), runner))) return;
            }
        }
    }

    class Runner {
        constructor(liker, view) {
            this.liker = liker;
            this.view = view;
            this.moving = false;
            this.url = location.href;
            this.records = new Set();
            this.replied = new Set();
            this.pacing();

            const pushState = history.pushState, replaceState = history.replaceState;
            history.pushState = function () {
                const result = pushState.apply(this, arguments);
                window.dispatchEvent(new Event('lda_route_change'));
                return result;
            };
            history.replaceState = function () {
                const result = replaceState.apply(this, arguments);
                window.dispatchEvent(new Event('lda_route_change'));
                return result;
            };
            window.addEventListener('popstate', () => window.dispatchEvent(new Event('lda_route_change')));
            window.addEventListener('lda_route_change', () => {
                if (this.url !== location.href) {
                    const previous = Tool.identity(this.url), current = Tool.identity(location.href);
                    this.url = location.href;
                    if (previous && current && previous === current) return;
                    if (this.active) {
                        this.moving = false;
                        this.liker.reset();
                        this.pacing();
                        this.resume();
                    }
                }
            });

            const pause = parseInt(sessionStorage.getItem('lda_pause_until') || '0', 10);
            if (pause > Date.now()) {
                this.view.status('暂停');
                setTimeout(() => {
                    sessionStorage.removeItem('lda_pause_until');
                    this.start();
                }, pause - Date.now());
            } else if (this.active) {
                if (!sessionStorage.getItem('lda_start_time')) sessionStorage.setItem('lda_start_time', String(Date.now()));
                if (this.view.keep) Stealth.keep();
                this.view.status('运行');
                this.resume();
            }
        }

        get active() { return sessionStorage.getItem('lda_active') === 'true'; }
        set active(value) { sessionStorage.setItem('lda_active', value); }
        get count() { return parseInt(sessionStorage.getItem('lda_count') || '0', 10); }
        set count(value) { sessionStorage.setItem('lda_count', value); }

        pacing() {
            this.records.clear();
            this.scrolls = 0;
            this.chars = 0;
            this.flips = Tool.random(3, 6);
            this.words = Tool.random(500, 2000);
        }

        timeout() {
            const start = parseInt(sessionStorage.getItem('lda_start_time') || '0', 10);
            if (this.view.duration > 0 && start > 0 && Date.now() - start >= this.view.duration * 60000) {
                this.stop(`达到限时 ${this.view.duration} 分钟`);
                return true;
            }
            return false;
        }

        navigate(url) {
            const router = env.Discourse?.__container__?.lookup('service:router');
            if (router) router.transitionTo(url);
            else location.href = url;
        }

        start() {
            this.moving = false;
            sessionStorage.removeItem('lda_pause_until');
            sessionStorage.setItem('lda_start_time', String(Date.now()));
            if (this.view.keep) Stealth.keep();
            this.active = true;
            this.count = 0;
            this.view.status('运行');
            this.liker.reset();
            this.pacing();
            this.resume();
        }

        stop(reason = '') {
            this.active = false;
            this.moving = false;
            this.liker.reset();
            this.pacing();
            sessionStorage.removeItem('lda_pause_until');
            sessionStorage.removeItem('lda_start_time');
            this.view.status('停止');
            Stealth.suspend();
            if (reason) Logger.write(`停止运行：${reason}`);
        }

        pause(seconds) {
            this.active = false;
            this.moving = false;
            this.liker.reset();
            this.pacing();
            sessionStorage.setItem('lda_pause_until', String(Date.now() + seconds * 1000));
            this.view.status('暂停');
            Stealth.suspend();
            Logger.write(`暂停运行：${Math.round(seconds / 60) || seconds}${seconds >= 60 ? '分钟' : '秒'}`);
            setTimeout(() => {
                if (parseInt(sessionStorage.getItem('lda_pause_until') || '0', 10) <= Date.now()) {
                    sessionStorage.removeItem('lda_pause_until');
                    this.start();
                }
            }, seconds * 1000);
        }

        async resume() {
            if (!this.active || this.timeout()) return;
            if (Tool.cloudflare() && !(await Tool.poll(() => !Tool.cloudflare(), 5000, 500))) return;
            if (Tool.identity()) await this.browse();
            else await this.forward();
        }

        async finish() {
            this.count++;
            this.view.update(this.count);
            this.liker.reset();
            this.pacing();
            this.moving = false;
            if (this.view.limit > 0 && this.count >= this.view.limit) {
                this.stop(`达到限额 ${this.view.limit} 篇`);
                return;
            }
            if (this.timeout()) return;
            await this.forward();
        }

        async reply() {
            try {
                const words = await Tool.speech();
                if (!words) return;
                const button = document.querySelector('#topic-footer-buttons .create.btn-primary') || document.getElementById('topic-footer-buttons')?.querySelector('.topic-footer-main-buttons button');
                if (!button) return;
                button.click();
                const box = await Tool.poll(() => document.querySelector('.d-editor-input'), 5000, 500);
                if (!box) return;
                box.focus();
                if (!document.execCommand('insertText', false, words)) {
                    box.setRangeText(words, 0, box.value.length, 'end');
                    box.dispatchEvent(new Event('input', { bubbles: true }));
                }
                if (!(await Tool.wait(Tool.random(2000, 5000), this))) return;
                const submit = document.querySelector('.save-or-cancel .create');
                if (submit && !submit.disabled) {
                    submit.click();
                    Logger.write(`自动回复：${words}`);
                    await Tool.wait(2000, this);
                }
            } catch (error) {
                Logger.write(`操作出错：${error.message}`);
            }
        }

        async browse() {
            if (this.moving || this.timeout()) return;
            this.moving = true;
            this.pacing();
            let title = '';

            const ready = await Tool.poll(() => {
                const identity = Tool.identity(), post = document.querySelector('.topic-post'), model = env.Discourse?.__container__?.lookup?.('controller:topic')?.model;
                if (identity && post && model?.id && String(model.id) === String(identity)) {
                    title = model.title || Tool.title();
                    return Boolean(title);
                }
                return false;
            }, 5000, 500);

            if (!ready) {
                this.moving = false;
                await this.forward();
                return;
            }
            if (this.view.max > 0 && (env.Discourse?.__container__?.lookup('controller:topic')?.model?.posts_count || 0) > this.view.max) {
                await this.finish();
                return;
            }

            Logger.write(`开始阅读：${title}`);
            await this.liker.execute(this);

            const identity = Tool.identity();
            if (this.view.reply && identity && !this.replied.has(identity)) {
                this.replied.add(identity);
                await this.reply();
            }
            if (!(await Tool.wait(Tool.random(2000, 5000), this))) {
                this.moving = false;
                return;
            }

            let previous = -1, stuck = 0;
            const maxout = Tool.random(60000, 300000), start = Date.now();
            while (this.active && this.moving) {
                if (this.timeout()) { await this.finish(); return; }
                if (!this.view.full && Date.now() - start >= maxout) {
                    this.moving = false;
                    this.navigate('/latest');
                    await Tool.poll(() => document.querySelector('.topic-list-item'), 5000, 500);
                    await this.forward();
                    return;
                }
                await Tool.poll(() => Tool.ready(), 5000, 500);

                const indicator = Tool.unread();
                const destination = indicator ? (indicator.closest('.topic-post') || indicator).getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.25 : 0;
                const step = Math.floor((window.innerHeight || 800) * 0.5);
                window.scrollTo({
                    top: Math.min(Math.max(0, document.documentElement.scrollHeight - window.innerHeight), Math.max(window.scrollY + (Tool.bottom() ? 0 : step), destination)),
                    behavior: document.hidden ? 'instant' : 'smooth'
                });

                await this.liker.execute(this);
                this.scrolls++;
                document.querySelectorAll('.topic-post').forEach(post => {
                    if (post.dataset.postNumber && !this.records.has(post.dataset.postNumber)) {
                        this.records.add(post.dataset.postNumber);
                        this.chars += Tool.measure(post);
                    }
                });

                let delay = Tool.random(500, 2000);
                if (this.scrolls >= this.flips || this.chars >= this.words) {
                    delay = Tool.random(2000, 5000);
                    this.scrolls = 0;
                    this.chars = 0;
                    this.flips = Tool.random(3, 6);
                    this.words = Tool.random(500, 2000);
                }

                await Tool.poll(() => !Tool.unread(), 5000, 500);
                if (!(await Tool.wait(delay, this))) { this.moving = false; return; }

                const position = window.scrollY || document.documentElement.scrollTop;
                stuck = (Tool.bottom() || (previous === position && position > 0)) ? stuck + 1 : 0;
                previous = position;
                if (stuck >= 2 && Tool.ready() && Tool.bottom()) {
                    await this.finish();
                    return;
                }
            }
            this.moving = false;
        }

        async forward() {
            if (!this.active || this.timeout()) return;
            this.moving = true;
            this.liker.reset();
            this.pacing();
            let clicked = false;

            if (Tool.identity()) {
                const query = this.view.skip ? '.more-topics__container .topic-list-item.unseen-topic' : '.more-topics__container .topic-list-item';
                const suggestions = document.querySelectorAll(query);
                for (const row of suggestions) {
                    const link = row.querySelector('a.title');
                    if (!link) continue;
                    if (this.view.max > 0) {
                        const count = row.querySelector('td.topic-likes-replies-data span.number');
                        if (count && Tool.parse(count.textContent) > this.view.max) continue;
                    }
                    clicked = true;
                    this.moving = false;
                    link.click();
                    return;
                }
            }

            if (!clicked) {
                if (Tool.identity() || !/^\/(latest|top|new|unread)?$/.test(location.pathname)) {
                    this.navigate('/latest');
                    await Tool.poll(() => document.querySelector('.topic-list-item'), 5000, 500);
                }
            }

            while (this.active) {
                if (this.timeout()) { this.moving = false; return; }
                const query = this.view.skip ? '.topic-list-item.unseen-topic' : '.topic-list-item';
                const items = document.querySelectorAll(query);
                if (!items.length) {
                    if (!(await Tool.wait(500, this))) return;
                    this.navigate('/latest');
                    await Tool.poll(() => document.querySelector('.topic-list-item'), 5000, 500);
                    continue;
                }

                let target = null;
                for (const row of items) {
                    const link = row.querySelector('a.title');
                    if (!link) continue;
                    if (this.view.max > 0 && (row.querySelector('td.topic-likes-replies-data span.number') ? Tool.parse(row.querySelector('td.topic-likes-replies-data span.number').textContent) : 0) > this.view.max) continue;
                    target = link;
                    break;
                }
                if (target) {
                    this.moving = false;
                    target.click();
                    return;
                }

                const previous = items.length;
                window.scrollBy({ top: window.innerHeight * 0.75, behavior: document.hidden ? 'instant' : 'smooth' });
                const timestamp = Date.now();
                while (this.active && Date.now() - timestamp < 5000) {
                    if (!(await Tool.wait(500, this))) return;
                    if (document.querySelectorAll(query).length > previous || Tool.bottom()) break;
                }
                if (Tool.bottom()) {
                    this.navigate('/latest');
                    await Tool.poll(() => document.querySelector('.topic-list-item'), 5000, 500);
                }
            }
            this.moving = false;
        }
    }

    class View {
        constructor() {
            this.styles();
            this.construct();
            this.events();
            this.cooldown();
        }

        get limit() { return parseInt(document.getElementById('lda-limit').value, 10); }
        get duration() { return parseInt(document.getElementById('lda-duration').value, 10) || 0; }
        get max() { return parseInt(document.getElementById('lda-maximum').value, 10) || 0; }
        get thresh() { return parseInt(document.getElementById('lda-threshold').value, 10); }
        get skip() { return document.getElementById('lda-skip').checked; }
        get full() { return document.getElementById('lda-full').checked; }
        get keep() { return document.getElementById('lda-keep').checked; }
        get reply() { return document.getElementById('lda-reply')?.checked || false; }

        styles() {
            GM_addStyle(`
                :root { --bg: #ffffff; --card: #f0fdfa; --border: #ccfbf1; --text: #1e293b; --sub: #0f766e; --meta: #94a3b8; --main: #0d9488; --shadow: 0 4px 16px rgba(13,148,136,.18); }
                @media (prefers-color-scheme: dark) { :root { --bg: #1e293b; --card: #0f172a; --border: #334155; --text: #f1f5f9; --sub: #2dd4bf; --meta: #64748b; --main: #14b8a6; --shadow: 0 4px 20px rgba(0,0,0,.45); } }
                html.dark, html.theme-dark, body.dark-theme { --bg: #1e293b; --card: #0f172a; --border: #334155; --text: #f1f5f9; --sub: #2dd4bf; --meta: #64748b; --main: #14b8a6; --shadow: 0 4px 20px rgba(0,0,0,.45); }
                
                #lda-box, #lda-quick-actions .lda-quick-btn, #lda-digest-card, .lda-modal-wrap { background: var(--bg); box-shadow: var(--shadow); border: 1px solid var(--border); box-sizing: border-box; }
                #lda-box.expanded #lda-gear, .lda-grid-content, #lda-log-box, .lda-q-set, .lda-action-btn, #lda-digest-card .lda-digest-body { background: var(--card); border: 1px solid var(--border); border-radius: 8px; }
                .lda-inp, input.lda-inp, .lda-modal-wrap textarea, textarea#lda-cfg-summary, textarea#lda-cfg-reply { background: var(--card) !important; border: 1px solid var(--border) !important; color: var(--sub) !important; border-radius: 8px !important; outline: none !important; box-shadow: none !important; }
                
                #lda-box { position: fixed; right: 16px; bottom: 20px; width: 56px; height: 56px; border-radius: 28px; z-index: 99999; overflow: hidden; transition: all .25s; display: flex; flex-direction: column; padding: 11px; }
                #lda-box.expanded { width: 265px; height: auto; border-radius: 16px; padding: 12px; max-height: 92vh; overflow-y: auto; }
                #lda-box.active-run { border-color: #5eead4; box-shadow: 0 0 14px rgba(20,184,166,.4); }
                
                #lda-panel-content { display: flex; flex-direction: column; gap: 8px; font-family: -apple-system, BlinkMacSystemFont, sans-serif; width: 100%; }
                #lda-header { display: flex; justify-content: center; align-items: center; font-size: 11px; height: 16px; padding: 0 2px; text-align: center; }
                #lda-header a { font-weight: 600; color: var(--sub); text-decoration: none; }
                #lda-bottom-bar { display: flex; align-items: center; justify-content: flex-end; gap: 8px; width: 100%; height: 32px; }
                #lda-gear { width: 32px; height: 32px; color: var(--main); cursor: pointer; background: transparent; border: none; border-radius: 8px; display: flex; align-items: center; justify-content: center; }
                #lda-box .lda-icon-close, #lda-box.expanded .lda-icon-gear { display: none; }
                #lda-box.expanded .lda-icon-close { display: block; }
                
                #lda-box:not(.expanded) #lda-panel-content { gap: 0; }
                #lda-box:not(.expanded) #lda-bottom-bar { width: 32px; height: 32px; margin: 0 auto; }
                #lda-box:not(.expanded) #lda-header, #lda-box:not(.expanded) .lda-group, #lda-box:not(.expanded) .lda-extra-group, #lda-box:not(.expanded) #lda-quick-settings { display: none !important; }
                
                .lda-group, .lda-extra-group { display: flex; flex-direction: column; gap: 6px; width: 100%; }
                .lda-row { display: flex !important; justify-content: space-between !important; align-items: center !important; flex-wrap: nowrap !important; font-size: 13px; color: var(--text); height: 26px; }
                .lda-ctrl { display: flex; align-items: center; justify-content: flex-end; width: 64px; flex-shrink: 0; }
                
                .lda-inp, input.lda-inp { padding: 0 4px !important; font-size: 12px !important; text-align: center !important; width: 64px; height: 24px; }
                .lda-checkbox { cursor: pointer; width: 16px; height: 16px; accent-color: var(--main); margin: 0; }
                
                #lda-threshold-label, #lda-box details summary { cursor: pointer; outline: none; list-style: none; }
                #lda-box details summary::-webkit-details-marker, #lda-box details summary::marker { display: none !important; }
                #lda-box details summary.lda-row { display: flex !important; justify-content: space-between !important; align-items: center !important; flex-wrap: nowrap !important; width: 100% !important; height: 26px !important; margin: 0 !important; padding: 0 !important; }
                
                .lda-action-btn { color: var(--sub); padding: 0 8px; font-size: 11px; height: 22px; cursor: pointer; line-height: 20px; outline: none; white-space: nowrap; }
                .lda-action-btn.stop, .lda-action-btn.pause { color: #fff; border: none; line-height: 22px; }
                .lda-action-btn.stop { background: linear-gradient(135deg, var(--main), #10b981); }
                .lda-action-btn.pause { background: linear-gradient(135deg, #f59e0b, #d97706); }
                
                .lda-grid-content, #lda-log-box { padding: 6px 8px; }
                .lda-grid-content { display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; margin-top: 4px; }
                .lda-grid-item { display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: var(--text); }
                .lda-grid-item .lda-val { font-weight: 600; color: var(--sub); margin-left: 4px; }
                
                .lda-empty-tip { grid-column: span 2; text-align: center; color: var(--meta); font-size: 11px; padding: 4px 0; }
                
                #lda-log-box { height: 120px; overflow-y: auto; font-size: 11px; color: var(--text); font-family: ui-monospace, monospace; display: flex; flex-direction: column; gap: 3px; word-break: break-all; }
                .lda-log-time { color: var(--meta); margin-right: 4px; } 
                .lda-log-text { color: var(--text); }
                
                .lda-q-set { display: flex; align-items: center; gap: 6px; cursor: pointer; color: var(--main); margin: 0; height: 32px; padding: 0 8px; box-sizing: border-box; }
                #lda-quick-actions { position: fixed; right: 22px; bottom: 85px; display: flex; flex-direction: column; gap: 8px; z-index: 99998; }
                .lda-quick-btn { width: 42px; height: 42px; border-radius: 21px; display: flex; align-items: center; justify-content: center; color: var(--main); cursor: pointer; transition: all .2s; user-select: none; }
                .lda-quick-btn:hover { background: var(--card); transform: translateY(-2px); }
                .lda-quick-btn:active { transform: translateY(0); }
                .lda-quick-btn.act { background: linear-gradient(135deg, var(--main), #059669) !important; color: #fff !important; border: none; box-shadow: 0 4px 12px rgba(5,150,105,.3); }
                
                .post-stream.lookopwrapactive .topic-post { display: none !important; }
                .post-stream.lookopwrapactive .topic-post.topic-owner { display: block !important; }
                .timeline-controls .lda-floor-btn { width: var(--d-button-size-regular, 36px) !important; height: var(--d-button-size-regular, 36px) !important; min-width: var(--d-button-size-regular, 36px) !important; padding: 0 !important; font-size: 11px !important; font-weight: 600; line-height: 1 !important; display: inline-flex !important; align-items: center; justify-content: center; border-radius: 50% !important; box-sizing: border-box; }
                
                .timeline-container { position: relative !important; }
                #lda-digest-card { position: absolute; top: 100%; right: 0; margin-top: 10px; width: 320px; max-height: 480px; border-radius: 12px; display: flex; flex-direction: column; padding: 12px; gap: 8px; z-index: 1000; }
                #lda-digest-card .lda-digest-head, .lda-modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 600; color: var(--sub); }
                #lda-digest-card .lda-digest-body { width: 100%; max-height: 400px; box-sizing: border-box; font-size: 12px; line-height: 1.6; padding: 8px 10px; outline: none; overflow-y: auto; color: var(--sub); white-space: pre-wrap; word-break: break-word; }
                #lda-digest-card .lda-digest-body::-webkit-scrollbar { width: 4px; }
                #lda-digest-card .lda-digest-body::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }
                
                .lda-modal-mask { position: fixed; inset: 0; background: rgba(15,23,42,0.55); z-index: 100000; display: flex; align-items: center; justify-content: center; backdrop-filter: blur(3px); }
                .lda-modal-wrap { border-radius: 12px; width: 92%; max-width: 540px; display: flex; flex-direction: column; padding: 14px; gap: 8px; }
                .lda-modal-close { cursor: pointer; background: transparent; border: none; color: var(--meta); display: flex; align-items: center; justify-content: center; padding: 2px; border-radius: 4px; font-size: 18px; line-height: 1; }
                .lda-modal-close:hover { color: var(--sub); }
                .lda-modal-wrap textarea, textarea#lda-cfg-summary, textarea#lda-cfg-reply { width: 100%; height: 260px; box-sizing: border-box; font-family: ui-monospace, monospace; padding: 8px; resize: vertical; }
                
                .lda-form-row { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--text); }
                .lda-form-row label { font-weight: 500; color: var(--sub); }
                .lda-form-row textarea { height: 75px !important; }
                
                #lda-box, #lda-log-box { scrollbar-width: none; -ms-overflow-style: none; }
                #lda-box::-webkit-scrollbar, #lda-log-box::-webkit-scrollbar { display: none; width: 0; height: 0; }
            `);
        }

        construct() {
            this.box = document.createElement('div');
            this.box.id = 'lda-box';
            this.box.innerHTML = `
                <div id="lda-panel-content">
                    <div id="lda-header">
                        <a id="lda-header-title" href="https://github.com/YisRime/LinuxDo-AIO" target="_blank">Linux Do AIO | 1.0.1 | Yis_Rime</a>
                    </div>
                    <div class="lda-group">
                        <div id="lda-log-box"></div>
                        <details style="width:100%" id="lda-user-detail">
                            <summary class="lda-row" title="展开/收起">
                                <span>用户信息</span>
                                <div class="lda-ctrl"><button class="lda-action-btn" id="lda-fetch-user">刷新</button></div>
                            </summary>
                            <div class="lda-grid-content" id="lda-user-list"><div class="lda-empty-tip">正在获取</div></div>
                        </details>
                        <details style="width:100%" id="lda-credit-detail">
                            <summary class="lda-row" title="展开/收起">
                                <span>用户 LDC</span>
                                <div class="lda-ctrl"><button class="lda-action-btn" id="lda-fetch-credit">刷新</button></div>
                            </summary>
                            <div class="lda-grid-content" id="lda-credit-list"><div class="lda-empty-tip">正在获取</div></div>
                        </details>
                        <details style="width:100%" id="lda-custom-detail">
                            <summary class="lda-row" title="展开/收起">
                                <span>功能配置</span>
                                <div class="lda-ctrl"><button class="lda-action-btn" id="lda-btn-custom-style">样式</button></div>
                            </summary>
                            <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
                                <div class="lda-row" title="彻底移除页面加载过渡动画"><span>移除加载动画</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-splash"></div></div>
                                <div class="lda-row" title="智能排版添加中英字符间隙"><span>中英混排优化</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-typeset"></div></div>
                                <div class="lda-row" title="对列表中话题显示创建时间"><span>创建时间显示</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-stamp"></div></div>
                                <div class="lda-row" title="修改动态头像改为静态显示"><span>动态转静态图</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-freeze"></div></div>
                                <div class="lda-row" title="自动过滤羊毛区已结束主题"><span>隐藏已领福利</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-purge"></div></div>
                                <div class="lda-row" title="关闭媒体资源后台自动播放"><span>禁止自动播放</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-mute"></div></div>
                                <div class="lda-row" title="直接显示帖子中的模糊文字"><span>移除文字模糊</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-clarify"></div></div>
                                <div class="lda-row" title="查询当前话题统计自身发言"><span>查看个人回复</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-floors"></div></div>
                                <div class="lda-row" title="点击外部链接跳过确认弹窗"><span>跳过外链确认</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-bypass"></div></div>
                            </div>
                        </details>
                        <details style="width:100%" id="lda-agent-detail">
                            <summary class="lda-row" title="展开/收起">
                                <span>AI 配置</span>
                                <div class="lda-ctrl"><button class="lda-action-btn" id="lda-btn-agent-prompt">提示词</button></div>
                            </summary>
                            <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
                                <div class="lda-row" title="使用模型总结本贴所有内容"><span>总结本贴</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-digest"></div></div>
                                <div class="lda-row" title="使用模型生成内容以便回复"><span>智能回复</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-opt-draft"></div></div>
                                <div class="lda-row" title="设置接口地址"><span>API Url</span><div class="lda-ctrl" style="width:120px"><input type="text" class="lda-inp" style="width:120px;text-align:left" id="lda-ai_url"></div></div>
                                <div class="lda-row" title="设置接口密钥"><span>API Key</span><div class="lda-ctrl" style="width:120px"><input type="password" class="lda-inp" style="width:120px;text-align:left" id="lda-ai_key"></div></div>
                                <div class="lda-row" title="设置模型名称"><span>Model</span><div class="lda-ctrl" style="width:120px"><input type="text" class="lda-inp" style="width:120px;text-align:left" id="lda-ai_model"></div></div>
                            </div>
                        </details>
                        <details style="width:100%">
                            <summary class="lda-row" title="展开/收起">
                                <span>自动阅读</span>
                                <div class="lda-ctrl"><button class="lda-action-btn" id="lda-execute">开始</button></div>
                            </summary>
                            <div style="display:flex;flex-direction:column;gap:6px;padding-top:4px">
                                <div class="lda-row" title="手动进行 CF 验证"><span>CF 验证</span><div class="lda-ctrl"><button id="lda-cf-btn" class="lda-inp" style="cursor:pointer">验证</button></div></div>
                                <div class="lda-row" title="自动跳过已经阅读过的话题"><span>跳过已读</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-skip"></div></div>
                                <div class="lda-row" title="开启时完整阅读全篇才跳转，忽略单贴时限"><span>完整阅读</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-full"></div></div>
                                <div class="lda-row" title="保持不被浏览器休眠"><span>后台保活</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-keep" checked></div></div>
                                <div class="lda-row" title="阅读话题自动生成回帖内容"><span>自动回复</span><div class="lda-ctrl"><input type="checkbox" class="lda-checkbox" id="lda-reply"></div></div>
                                <div class="lda-row" title="设置本次阅读话题数量上限"><span>阅读限额</span><div class="lda-ctrl"><input type="number" class="lda-inp" id="lda-limit" min="0"></div></div>
                                <div class="lda-row" title="设置本次阅读话题时长上限"><span>阅读限时</span><div class="lda-ctrl"><input type="number" class="lda-inp" id="lda-duration" min="0"></div></div>
                                <div class="lda-row" title="阅读总数少于设定值的话题"><span>最大楼层</span><div class="lda-ctrl"><input type="number" class="lda-inp" id="lda-maximum" min="0"></div></div>
                                <div class="lda-row" title="自动点赞的赞数阈值 | 点击文字可重置冷却"><span id="lda-threshold-label">点赞阈值</span><div class="lda-ctrl"><input type="number" class="lda-inp" id="lda-threshold" min="-1"></div></div>
                            </div>
                        </details>
                    </div>
                    <div id="lda-bottom-bar">
                        <div id="lda-quick-settings" style="display:flex;gap:8px;align-items:center;flex:1;">
                            <label title="只看楼主" class="lda-q-set"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg><input type="checkbox" id="lda-show-lookop" class="lda-checkbox"></label>
                            <label title="回复话题" class="lda-q-set"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9L5 14L10 19"></path><path d="M5 14H14C17.3137 14 20 11.3137 20 8V5"></path></svg><input type="checkbox" id="lda-show-reply" class="lda-checkbox"></label>
                            <label title="直达一楼" class="lda-q-set"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg><input type="checkbox" id="lda-show-floor" class="lda-checkbox"></label>
                        </div>
                        <div id="lda-gear" title="展开/收起">
                            <svg class="lda-icon-gear" viewBox="0 0 24 24" width="20" height="20" fill="currentColor"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.485.485 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
                            <svg class="lda-icon-close" viewBox="0 0 24 24" width="22" height="22" fill="currentColor"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
                        </div>
                    </div>
                </div>`;
            document.body.appendChild(this.box);
            Logger.setup(document.getElementById('lda-log-box'));

            this.actions = document.createElement('div');
            this.actions.id = 'lda-quick-actions';
            this.actions.innerHTML = `
                <div id="lda-btn-lookop" class="lda-quick-btn" title="只看楼主"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg></div>
                <div id="lda-btn-reply" class="lda-quick-btn" title="回复话题"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 9L5 14L10 19"></path><path d="M5 14H14C17.3137 14 20 11.3137 20 8V5"></path></svg></div>
                <div id="lda-btn-floor" class="lda-quick-btn" title="直达一楼"><svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg></div>
            `;
            document.body.appendChild(this.actions);
        }

        events() {
            this.box.onclick = () => { if (!this.box.classList.contains('expanded')) this.box.classList.add('expanded'); };
            document.getElementById('lda-gear').onclick = (event) => { event.stopPropagation(); this.box.classList.toggle('expanded'); };

            const toggler = (key, id, defaultState) => {
                const box = document.getElementById(`lda-show-${key}`), button = document.getElementById(id), show = GM_getValue(`lda_show_${key}`, defaultState);
                box.checked = show;
                button.style.display = show ? 'flex' : 'none';
                box.onchange = (event) => {
                    const checked = event.target.checked;
                    GM_setValue(`lda_show_${key}`, checked);
                    button.style.display = checked ? 'flex' : 'none';
                };
            };
            toggler('lookop', 'lda-btn-lookop', true);
            toggler('reply', 'lda-btn-reply', true);
            toggler('floor', 'lda-btn-floor', true);

            document.getElementById('lda-btn-lookop').onclick = (event) => {
                event.stopPropagation();
                document.getElementById('lda-btn-lookop').classList.toggle('act');
                document.querySelector('.post-stream')?.classList.toggle('lookopwrapactive');
            };
            document.getElementById('lda-btn-reply').onclick = (event) => {
                event.stopPropagation();
                document.getElementById('topic-footer-buttons')?.querySelector('.topic-footer-main-buttons button')?.click();
            };
            document.getElementById('lda-btn-floor').onclick = (event) => {
                event.stopPropagation();
                const match = location.href.match(/^(https?:\/\/[^\/]+\/t\/[^\/]+\/\d+)/);
                if (match) {
                    const url = match[1];
                    if (location.href !== url) {
                        const router = env.Discourse?.__container__?.lookup('service:router');
                        if (router) router.transitionTo(new URL(url).pathname);
                        else location.href = url;
                    } else {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                    }
                } else if (document.querySelector('h1.header-title a')) {
                    location.href = document.querySelector('h1.header-title a').href;
                } else {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                }
            };

            [
                ['limit', 0, false],
                ['duration', 0, false],
                ['maximum', 128, false],
                ['threshold', 5, false],
                ['skip', true, true],
                ['full', false, true],
                ['reply', false, true],
                ['ai_url', '', false],
                ['ai_key', '', false],
                ['ai_model', '', false]
            ].forEach(([key, fallback, boolean]) => {
                const element = document.getElementById(`lda-${key}`), store = `lda_${key}`;
                if (!element) return;
                if (boolean) {
                    element.checked = GM_getValue(store, fallback);
                    element.onchange = event => GM_setValue(store, event.target.checked);
                } else {
                    element.value = GM_getValue(store, fallback);
                    element.onchange = event => GM_setValue(store, event.target.value.trim());
                }
            });

            ['splash', 'typeset', 'stamp', 'freeze', 'purge', 'mute', 'clarify', 'floors', 'bypass', 'digest', 'draft'].forEach(key => {
                const element = document.getElementById(`lda-opt-${key}`);
                if (!element) return;
                element.checked = GM_getValue(`lda_opt_${key}`, true);
                element.onchange = (event) => {
                    GM_setValue(`lda_opt_${key}`, event.target.checked);
                    Patch.setup();
                };
            });

            const setupModal = (buttonId, modalId, title, content, initialize, save) => {
                const button = document.getElementById(buttonId);
                if (!button) return;
                button.onclick = (event) => {
                    event.stopPropagation();
                    let modal = document.getElementById(modalId);
                    if (!modal) {
                        modal = document.createElement('div');
                        modal.id = modalId;
                        modal.className = 'lda-modal-mask';
                        modal.innerHTML = `<div class="lda-modal-wrap"><div class="lda-modal-head"><span>${title}</span><button type="button" class="lda-modal-close">&times;</button></div>${content}</div>`;
                        document.body.appendChild(modal);
                        modal.querySelector('.lda-modal-wrap').onclick = (e) => e.stopPropagation();
                        const closer = () => { modal.style.display = 'none'; };
                        modal.querySelector('.lda-modal-close').onclick = closer;
                        modal.onclick = closer;
                        save(modal);
                    }
                    initialize(modal);
                    modal.style.display = 'flex';
                };
            };

            setupModal(
                'lda-btn-custom-style',
                'lda-style-modal',
                '自定义 CSS 样式',
                '<textarea></textarea>',
                modal => modal.querySelector('textarea').value = GM_getValue('lda_opt_style', ''),
                modal => modal.querySelector('textarea').oninput = event => {
                    GM_setValue('lda_opt_style', event.target.value);
                    Patch.inject(event.target.value);
                }
            );

            setupModal(
                'lda-btn-agent-prompt',
                'lda-prompt-modal',
                'AI 提示词配置',
                '<div class="lda-form-row"><label>话题总结提示词</label><textarea id="lda-cfg-summary"></textarea></div><div class="lda-form-row"><label>生成回复提示词</label><textarea id="lda-cfg-reply"></textarea></div>',
                modal => ['summary', 'reply'].forEach(key => modal.querySelector(`#lda-cfg-${key}`).value = GM_getValue(`lda_ai_${key}`, Prompts[key])),
                modal => ['summary', 'reply'].forEach(key => modal.querySelector(`#lda-cfg-${key}`).oninput = event => GM_setValue(`lda_ai_${key}`, event.target.value))
            );

            const keep = document.getElementById('lda-keep');
            keep.checked = GM_getValue('lda_keep', true);
            keep.onchange = event => {
                GM_setValue('lda_keep', event.target.checked);
                if (event.target.checked && this.button.classList.contains('stop')) Stealth.keep();
                else Stealth.suspend();
            };

            document.getElementById('lda-cf-btn').onclick = (event) => {
                event.stopPropagation();
                const activeStatus = runner.active;
                if (activeStatus) {
                    runner.active = false;
                    runner.moving = false;
                    this.status('暂停');
                    Logger.write('暂停运行：等待 CF 验证');
                }
                const button = document.getElementById('lda-cf-btn');
                button.disabled = true;
                button.innerText = '验证中';
                const windowReference = window.open('https://linux.do/challenge', 'cf_win', 'width=480,height=600');
                const timer = setInterval(() => {
                    if (!windowReference || windowReference.closed) {
                        clearInterval(timer);
                        button.disabled = false;
                        button.innerText = '验证';
                        if (activeStatus) {
                            runner.active = true;
                            this.status('运行');
                            runner.resume();
                        }
                    }
                }, 500);
            };

            this.button = document.getElementById('lda-execute');
            document.getElementById('lda-threshold-label').onclick = (event) => {
                event.stopPropagation();
                GM_setValue('lda_cooldown', 0);
                this.cooldown();
                if (runner.active) this.status('运行');
            };

            const bind = (name, loader) => {
                const detail = document.getElementById(`lda-${name}-detail`);
                detail.addEventListener('toggle', event => { if (event.target.open) loader(); });
                document.getElementById(`lda-fetch-${name}`).onclick = (event) => {
                    event.stopPropagation();
                    if (!detail.open) detail.open = true;
                    loader();
                };
            };
            bind('user', () => this.user());
            bind('credit', () => this.credit());
        }

        async user() {
            const button = document.getElementById('lda-fetch-user'), list = document.getElementById('lda-user-list');
            button.disabled = true;
            try {
                const user = await Tool.poll(() => env.Discourse?.__container__?.lookup?.('service:current-user'), 5000, 500);
                if (!user?.username) throw new Error('未登录');
                const [info, extra] = await Promise.all([
                    fetch(`/u/${encodeURIComponent(user.username)}/summary.json`).then(response => response.ok ? response.json() : null),
                    new Promise(resolve => {
                        GM_xmlhttpRequest({
                            method: 'GET',
                            url: 'https://connect.linux.do/',
                            timeout: 5000,
                            onload: response => {
                                if (response.status !== 200) return resolve(null);
                                const documentHTML = new DOMParser().parseFromString(response.responseText, 'text/html'), data = {};
                                documentHTML.querySelectorAll('.tl3-bar-item').forEach(element => {
                                    const text = element.querySelector('.tl3-bar-label')?.textContent.trim() || '';
                                    const nums = element.querySelector('.tl3-bar-nums')?.textContent.trim() || '';
                                    if (text.includes('获赞天数')) data.days = nums;
                                    if (text.includes('用户') || text.includes('不同用户')) data.users = nums;
                                });
                                documentHTML.querySelectorAll('.tl3-quota-card').forEach(element => {
                                    const text = element.querySelector('.tl3-quota-label')?.textContent.trim() || '';
                                    const nums = element.querySelector('.tl3-quota-nums')?.textContent.trim() || '';
                                    if (text.includes('被举报')) data.flagged = nums;
                                    else if (text.includes('举报用户')) data.reporters = nums;
                                });
                                documentHTML.querySelectorAll('.tl3-veto-item').forEach(element => {
                                    const text = element.querySelector('.tl3-veto-label')?.textContent.trim() || '';
                                    const values = element.querySelectorAll('.tl3-veto-value');
                                    const val = element.classList.contains('met') ? (values[0]?.textContent.trim() || '0') : (values[values.length - 1]?.textContent.trim() || '0');
                                    if (text.includes('禁言')) data.silenced = val;
                                    if (text.includes('封禁')) data.suspended = val;
                                });
                                resolve(data);
                            },
                            onerror: () => resolve(null)
                        });
                    })
                ]);

                const stats = info?.user_summary || {};
                const formatNumber = (value) => String(value || '').replace(/\s+/g, '');
                const verify = (string) => {
                    if (!string || !string.includes('/')) return null;
                    const [current, required] = string.split('/').map(value => parseFloat(value));
                    return (!isNaN(current) && !isNaN(required)) ? current >= required : null;
                };

                const days = formatNumber(extra?.days) || '-';
                const users = formatNumber(extra?.users) || '-';
                const flagged = formatNumber(extra?.flagged) || '0/5';
                const reporters = formatNumber(extra?.reporters) || '0/5';
                const silenced = formatNumber(extra?.silenced) || '0';
                const suspended = formatNumber(extra?.suspended) || '0';

                list.innerHTML = [
                    ['等级', `Lv${user.trust_level ?? stats.trust_level ?? '-'}`],
                    ['时长', `${Math.floor((stats.time_read || 0) / 60)}分`],
                    ['访问天数', stats.days_visited || 0],
                    ['浏览帖子', stats.posts_read_count || 0],
                    ['浏览话题', stats.topics_entered || 0],
                    ['点赞', stats.likes_given || 0],
                    ['获赞', stats.likes_received || 0],
                    ['回复话题', stats.post_count || user.post_count || 0],
                    ['获赞天数', days, verify(days) === false ? 'color:#f59e0b' : ''],
                    ['获赞用户', users, verify(users) === false ? 'color:#f59e0b' : ''],
                    ['被举报帖子', flagged, parseInt(flagged, 10) > 0 ? 'color:#ef4444' : ''],
                    ['举报用户', reporters, parseInt(reporters, 10) > 0 ? 'color:#ef4444' : ''],
                    ['被禁言', silenced, parseInt(silenced, 10) > 0 ? 'color:#ef4444' : ''],
                    ['被封禁', suspended, parseInt(suspended, 10) > 0 ? 'color:#ef4444' : '']
                ].map(([title, value, style]) => `<div class="lda-grid-item"><span>${title}</span><span class="lda-val" ${style ? `style="${style}"` : ''}>${value}</span></div>`).join('');
                button.innerText = '刷新';
            } catch (error) {
                list.innerHTML = `<div class="lda-empty-tip" style="color:#ef4444">获取出错</div>`;
                button.innerText = '重试';
                Logger.write(`操作出错：${error.message}`);
            } finally {
                button.disabled = false;
            }
        }

        credit() {
            const button = document.getElementById('lda-fetch-credit'), list = document.getElementById('lda-credit-list');
            button.disabled = true;
            const fail = (message = '网络出错') => {
                button.disabled = false;
                list.innerHTML = `<div class="lda-empty-tip" style="color:#ef4444">获取出错</div>`;
                button.innerText = '重试';
                Logger.write(`操作出错：${message}`);
            };

            GM_xmlhttpRequest({
                method: 'GET',
                url: 'https://credit.linux.do/api/v1/oauth/user-info',
                timeout: 5000,
                responseType: 'json',
                onload: (response) => {
                    button.disabled = false;
                    const data = response.response?.data;
                    if (response.status === 200 && data) {
                        list.innerHTML = [
                            ['可用积分', data.available_balance || 0, 'color:var(--main)'],
                            ['社区积分', data.community_balance || 0],
                            ['累计收入', `+${data.total_receive || 0}`],
                            ['累计支出', `-${data.total_payment || 0}`]
                        ].map(([title, value, style]) => `<div class="lda-grid-item"><span>${title}</span><span class="lda-val" ${style ? `style="${style}"` : ''}>${value}</span></div>`).join('');
                        button.innerText = '刷新';
                    } else {
                        fail(`HTTP ${response.status}`);
                    }
                },
                onerror: () => fail('网络出错'),
                ontimeout: () => fail('请求超时')
            });
        }

        status(state) {
            const activeStatus = state === '运行', paused = state.includes('暂停');
            this.box.classList.toggle('active-run', activeStatus);
            this.button.className = `lda-action-btn ${activeStatus ? 'stop' : (paused ? 'pause' : 'start')}`;
            this.button.innerText = paused ? '暂停' : (activeStatus ? `已读: ${sessionStorage.getItem('lda_count') || 0}` : '开始');
        }

        cooldown() {
            const element = document.getElementById('lda-threshold-label');
            if (element) {
                const cool = GM_getValue('lda_cooldown', 0) > Date.now();
                element.style.color = cool ? '#ef4444' : '';
                element.innerText = cool ? '点赞上限' : '点赞阈值';
            }
        }

        update(count) {
            if (this.button.classList.contains('stop') && !this.button.classList.contains('pause')) {
                this.button.innerText = `已读: ${count}`;
            }
        }
    }

    const view = new View();
    Interceptor.setup(view);
    const runner = new Runner(new Liker(view), view);
    Interceptor.runner = runner;
    Patch.setup();
    window.addEventListener('lda_route_change', () => Patch.setup());
    window.addEventListener('scroll', () => Patch.purge(), { passive: true });

    view.button.onclick = (event) => {
        event.stopPropagation();
        if (runner.active || parseInt(sessionStorage.getItem('lda_pause_until') || '0', 10) > Date.now()) {
            return runner.stop('手动停止');
        }
        runner.start();
    };
})();