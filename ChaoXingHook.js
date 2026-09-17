// ==UserScript==
// @name         超星学习通一键通
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.1
// @description  学习通小助手：绕过人脸识别、解除右键限制、拦截鼠标检测、绕过下载限制。
// @author       YisRime
// @run-at       document-start
// @match        *://*.chaoxing.com/*
// @match        *://*.edu.cn/*
// @match        *://*/*mycourse/studentstudy*
// @match        *://*/*nodedetailcontroller/*
// @match        *://*/*mycourse/teacherstudy*
// @icon         http://pan-yz.chaoxing.com/favicon.ico
// @grant        unsafeWindow
// @grant        GM_xmlhttpRequest
// @connect      mooc1-api.chaoxing.com
// @license      AGPLv3
// ==/UserScript==

(function () {
    'use strict';
    var context = unsafeWindow;

    // 绕过人脸识别
    if (/stucoursemiddle|studentstudy/.test(location.href)) {
        var alphabet = "abcdefttguhhniafunrivvalaffxafcekyu2345678";
        var value = function (identity) { return (document.getElementById(identity) || {}).value || ""; };
        setInterval(function () {
            var token = value("uuid");
            if (!token) { return; }
            var random = Array.from({ length: 32 }, function () { return alphabet[Math.random() * alphabet.length | 0]; }).join('');
            var params = "clazzId=" + value("fcclazzId") +
                "&courseId=" + value("fccourseId") + "&uuid=" + token +
                "&qrcEnc=" + value("qrcEnc") + "&objectId=" + random;
            if (document.querySelector(".faceCollectQrPop, .faceCollectQrPopVideo")) {
                var failure = document.querySelector(".faceVideoCheckFailCount");
                var count = failure ? failure.textContent.trim() : "0";
                GM_xmlhttpRequest({
                    method: 'POST', url: 'https://mooc1-api.chaoxing.com/qr/updateqrstatus',
                    data: params + "&failCount=" + count + "&compareResult=0",
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            } else if (document.querySelector(".popDiv.wid640") && document.getElementById("fcqrimg")) {
                GM_xmlhttpRequest({
                    method: 'POST', url: 'https://mooc1-api.chaoxing.com/knowledge/uploadInfo',
                    data: params + "&knowledgeId=" + (value("chapterIdid") || "0"),
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
                });
            }
        }, 5000);
    }

    // 解除右键限制
    if (location.href.includes('/exam/')) {
        var unlock = function () {
            setTimeout(function () {
                try {
                    ['selectstart', 'copy', 'cut', 'paste', 'contextmenu'].forEach(function (event) { document.body.removeAttribute('on' + event); });
                    document.documentElement.style.userSelect = 'unset';
                    document.body.style.userSelect = 'unset';
                    if (context.UE && context.UE.EventBase && context.UE.EventBase.prototype) context.UE.EventBase.prototype.fireEvent = function () { return null; };
                } catch (error) {}
            }, 1000);
        };
        if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', unlock, { once: true }); }
        else { unlock(); }
    }

    // 拦截鼠标检测
    if (/^mooc1\./.test(location.hostname)) {
        ['addEventListener', 'removeEventListener'].forEach(function (method) {
            var original = EventTarget.prototype[method];
            EventTarget.prototype[method] = function (type, listener, options) {
                if (type === 'mouseout') { return; }
                return original.call(this, type, listener, options);
            };
        });
    }

    // 绕过下载限制
    class download {
        static save(doc, url, name) {
            const a = Object.assign(doc.createElement('a'), { style: 'display:none', href: url, download: name });
            doc.body.appendChild(a);
            a.click();
            a.remove();
        }
        static getMeta(targetDoc, targetWin) {
            const items = (targetWin.mArg || targetWin.AttachmentSetting)?.attachments || [];
            for (const item of items) {
                const prop = typeof item.property === 'string' ? JSON.parse(item.property) : (item.property || {});
                const id = prop.objectid || item.objectId || item.jobid;
                const name = (prop.name || prop.title || prop.filename || item.name || item.title || item.customtitle || '').trim();
                if (id && name) return { id, name };
            }
            const subDoc = targetDoc.querySelector('iframe')?.contentDocument;
            const link = subDoc?.querySelector('#downloadUrl:not(#cx_btn), .downLoad a') || targetDoc.querySelector('#downloadUrl:not(#cx_btn), .downLoad a');
            const id = link?.href?.match(/\/download\/([a-zA-Z0-9]+)/i)?.[1] || targetDoc.location?.href?.match(/[?&]objectid=([^&]+)/i)?.[1] || targetDoc.querySelector('[objectid]')?.getAttribute('objectid');
            let name = (link?.getAttribute('download') || link?.getAttribute('title') || (subDoc?.title !== 'PDF.js viewer' ? subDoc?.title : '') || '').trim();
            if (!name) {
                const nav = document.querySelector('.posCatalog_select, .catalog_selected, .currents, .active, .prev_title') || targetDoc.querySelector('h2, .prev_title');
                name = (nav?.textContent?.replace(/\s+/g, ' ') || '').trim();
            }
            if (!id || !name) return null;
            return { id, name };
        }
        static mount() {
            const cardFrame = document.getElementById('iframe');
            const targetDoc = cardFrame?.contentDocument || document;
            const targetWin = cardFrame?.contentWindow || window;
            if (!targetDoc?.body) return;
            const data = this.getMeta(targetDoc, targetWin);
            if (!data?.name) return;
            const old = targetDoc.getElementById('cx_btn');
            if (old) {
                if (old.dataset.id === data.id && old.innerText === data.name) return;
                old.remove();
            }
            const btn = targetDoc.createElement('button');
            btn.id = 'cx_btn';
            btn.dataset.id = data.id;
            btn.innerText = data.name;
            btn.title = data.name;
            btn.style.cssText = 'position:fixed!important;bottom:55px!important;right:280px!important;z-index:2147483647!important;background:rgba(0,0,0,0.7)!important;color:#fff!important;font:12px/16px sans-serif!important;padding:4px 10px!important;border:none!important;border-radius:12px!important;cursor:pointer!important;max-width:200px!important;overflow:hidden!important;text-overflow:ellipsis!important;white-space:nowrap!important;outline:none!important;backdrop-filter:blur(4px)!important;box-shadow:0 2px 6px rgba(0,0,0,0.15)!important;';
            btn.onclick = async (e) => {
                e.preventDefault();
                e.stopPropagation();
                const link = targetDoc.querySelector('iframe')?.contentDocument?.querySelector('#downloadUrl:not(#cx_btn), .downLoad a') || targetDoc.querySelector('#downloadUrl:not(#cx_btn), .downLoad a');
                let url = link?.href?.startsWith('http') ? link.href : '';
                if (!url) {
                    const host = location.href.includes('xueyinonline') ? 'xueyinonline' : 'chaoxing';
                    const res = await fetch(`https://mooc1.${host}.com/ananas/status/${data.id}?flag=normal`);
                    const json = await res.json();
                    data.name = json.filename || data.name;
                    url = json.download || json.http || json.mp4 || json.pdf;
                }
                if (url) this.save(targetDoc, url, data.name);
            };
            targetDoc.body.appendChild(btn);
            targetDoc.querySelectorAll('iframe').forEach(frame => {
                if (!frame.__cx_bound) {
                    frame.__cx_bound = true;
                    frame.addEventListener('load', () => setTimeout(() => this.mount(), 500));
                }
            });
        }
        static start() {
            const init = () => {
                const cardFrame = document.getElementById('iframe');
                if (cardFrame) {
                    cardFrame.addEventListener('load', () => setTimeout(() => this.mount(), 500));
                    cardFrame.contentDocument?.addEventListener('click', () => setTimeout(() => this.mount(), 500));
                }
                this.mount();
            };
            document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', init, { once: true }) : init();
        }
    }
    download.start();
})();