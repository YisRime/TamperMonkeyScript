// ==UserScript==
// @name         Let Me Copy
// @description  为什么不让我复制？默认解除复制 / 右键 / 键盘限制，可在菜单中进行配置。
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @author       YisRime
// @match        *://*/*
// @noframes
// @run-at       document-start
// @license      AGPLv3
// @grant        GM_registerMenuCommand
// @grant        GM_unregisterMenuCommand
// @grant        GM_setValue
// @grant        GM_getValue
// ==/UserScript==

(function () {
    'use strict';

    const PREFIX = 'copy-currency--' + (location.hostname || 'file') + '::';
    const stop = (event) => event.stopImmediatePropagation();
    const stopCopyKey = (event) => (event.ctrlKey || event.metaKey) && (event.key || '').toUpperCase() === 'C' && stop(event);

    const FEATURES = [
        {
            key: 'selectstart-and-copy',
            label: '解除复制限制',
            css:
                'html, body, body *:not(input):not(textarea):not(select){user-select:auto !important;-webkit-user-select:auto !important;}' +
                ':not(input):not(textarea)::selection{color:inherit !important;background-color:highlight !important;}' +
                '@media print{body{display:block !important;}}',
            listeners: [['selectstart', stop], ['touchstart', stop], ['copy', stop], ['keydown', stopCopyKey]],
        },
        { key: 'contextmenu', label: '解除右键限制', css: '', listeners: [['contextmenu', stop]] },
        { key: 'keydown', label: '解除键盘限制', css: '', listeners: [['keydown', stop]] },
    ];

    const style = Object.assign(document.createElement('style'), { id: '__copy-currency-style__' });
    (document.head || document.documentElement).appendChild(style);

    function refresh() {
        let css = '';
        for (const feature of FEATURES) {
            const on = GM_getValue(PREFIX + feature.key, true) !== false;
            for (const [type, handler] of feature.listeners) window[on ? 'addEventListener' : 'removeEventListener'](type, handler, true);
            if (on) css += feature.css;
            if (feature.command) GM_unregisterMenuCommand(feature.command);
            feature.command = GM_registerMenuCommand((on ? '✅ ' : '❌ ') + feature.label, () => {
                GM_setValue(PREFIX + feature.key, !on);
                refresh();
            });
        }
        style.textContent = css;
    }

    refresh();
})();
