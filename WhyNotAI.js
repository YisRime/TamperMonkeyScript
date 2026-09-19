// ==UserScript==
// @name         为什么不问问 AI 呢？
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  划词后一键询问指定 AI。支持 ChatGPT、DeepSeek、智谱清言、Z.ai、通义千问、Qwen Chat、元宝、豆包、Kimi、Gemini、Grok 等。
// @author       YisRime
// @match        *://*/*
// @noframes
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        GM_openInTab
// @grant        GM_registerMenuCommand
// @run-at       document-idle
// @license      AGPLv3
// ==/UserScript==

(function () {
    'use strict';

    const SEND = true;
    const POPUP = false;

    const SITES = [
        { name: 'ChatGPT', url: ['https://chatgpt.com/', 'https://chat.openai.com/'], input: ['#prompt-textarea', '#mobile-composer-prompt', 'textarea'] },
        // { name: 'Claude', url: ['https://claude.ai/new', 'https://claude.com/'], input: ['.ProseMirror'] },
        { name: 'DeepSeek', url: ['https://chat.deepseek.com/'], input: ['textarea#chat-input'] },
        { name: '智谱清言', url: ['https://chatglm.cn/'], input: ['textarea.scroll-display-none'] },
        { name: 'Z.ai', url: ['https://chat.z.ai/'], input: ['textarea#chat-input'] },
        { name: '通义千问', url: ['https://www.qianwen.com/', 'https://tongyi.aliyun.com/'], input: ['[role="textbox"]'] },
        { name: 'Qwen Chat', url: ['https://chat.qwen.ai/'], input: ['.message-input-textarea'] },
        { name: '元宝', url: ['https://yuanbao.tencent.com/chat/'], input: ['.ql-editor'] },
        { name: '豆包', url: ['https://www.doubao.com/chat/'], input: ['.tiptap'] },
        { name: 'Kimi', url: ['https://www.kimi.com/', 'https://kimi.moonshot.cn/'], input: ['.chat-input-editor'] },
        // { name: '文心一言', url: ['https://wenxin.baidu.com/'], input: ['textarea.ci-textarea'] },
        { name: 'Gemini', url: ['https://gemini.google.com/app'], input: ['.ql-editor'] },
        { name: 'Grok', url: ['https://grok.com/'], input: ['textarea'] },
        // { name: 'Perplexity', url: ['https://www.perplexity.ai/'], input: ['#ask-input', 'textarea'] },
        // { name: 'Copilot', url: ['https://copilot.microsoft.com/'], input: ['textarea#userInput', 'textarea'] },
        // { name: '天工 AI', url: ['https://www.tiangong.cn/'], input: ['.ProseMirror'] },
        // { name: '纳米 AI', url: ['https://www.n.cn/'], input: ['.prompt-helper'] },
        // { name: '商量', url: ['https://chat.sensetime.com/'], input: ['textarea'] },
    ];

    const main = async () => {
        SITES.forEach(site => GM_registerMenuCommand(site.name, () => {
            const text = String(window.getSelection() || '').trim();
            if (text) {
                const queue = (GM_getValue('queue') || []).filter(item => Date.now() - item.ts < 60000);
                GM_setValue('queue', [...queue, { site: site.name, text, ts: Date.now() }]);
            }
            if (!(POPUP && window.open(site.url[0], 'AIAskOnSelect', 'popup=yes,width=560,height=800'))) {
                GM_openInTab(site.url[0], { active: true, insert: true });
            }
        }));

        const host = location.hostname;
        const site = SITES.find(item => item.url.some(url => {
            const name = url.slice(url.indexOf('//') + 2).split('/')[0].replace(/^www\./, '');
            return host === name || host.endsWith('.' + name);
        }));
        if (!site) return;
        const task = (GM_getValue('queue') || []).find(item => item.site === site.name && Date.now() - item.ts < 60000);
        if (!task) return;

        const input = await new Promise(resolve => {
            const deadline = Date.now() + 60000;
            const sized = box => box.offsetWidth > 20 && box.offsetHeight > 8;
            const check = () => {
                const element = site.input.map(s => [...document.querySelectorAll(s)].find(sized)).find(Boolean);
                if (element || Date.now() > deadline) {
                    clearInterval(timer);
                    resolve(element || null);
                }
            };
            const timer = setInterval(check, 500);
            check();
        });
        if (!input) return;

        input.focus();
        if (input.isContentEditable) {
            const range = document.createRange();
            range.selectNodeContents(input);
            const selection = window.getSelection();
            selection.removeAllRanges();
            selection.addRange(range);
            if (!document.execCommand('insertText', false, task.text)) input.textContent = task.text;
        } else {
            const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
            Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, task.text);
            input.dispatchEvent(new Event('input', { bubbles: true }));
        }

        GM_setValue('queue', (GM_getValue('queue') || []).filter(item => !(item.site === site.name && item.ts === task.ts && item.text === task.text)));
        if (SEND) {
            for (const type of ['keydown', 'keypress', 'keyup']) {
                input.dispatchEvent(new KeyboardEvent(type, { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
            }
        }
    };

    main();
})();
