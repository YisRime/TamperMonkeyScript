// ==UserScript==
// @name         超星学习通一键通
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  学习通小助手：绕过人脸识别、解除右键限制、拦截鼠标检测。
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
                    if (context.UE && context.UE.EventBase && context.UE.EventBase.prototype) {
                        context.UE.EventBase.prototype.fireEvent = function () { return null; };
                    }
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
})();