// ==UserScript==
// @name         BiliBili 关注管理
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  B站关注管理，支持批量取关、分组管理、信息同步等功能，适用于批量管理关注列表。
// @author       苡淞
// @match        https://space.bilibili.com/*/relation/follow*
// @match        https://space.bilibili.com/*/fans/follow*
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @connect      api.bilibili.com
// @license      AGPLv3
// ==/UserScript==

(function () {
    "use strict";

    // MD5 & WBI
    const md5=function(){var n={};!function(n){"use strict";function d(n,t){var r=(65535&n)+(65535&t);return(n>>16)+(t>>16)+(r>>16)<<16|65535&r}function f(n,t,r,e,o,u){return d((u=d(d(t,n),d(e,u)))<<o|u>>>32-o,r)}function l(n,t,r,e,o,u,c){return f(t&r|~t&e,n,t,o,u,c)}function g(n,t,r,e,o,u,c){return f(t&e|r&~e,n,t,o,u,c)}function v(n,t,r,e,o,u,c){return f(t^r^e,n,t,o,u,c)}function m(n,t,r,e,o,u,c){return f(r^(t|~e),n,t,o,u,c)}function c(n,t){var r,e,o,u;n[t>>5]|=128<<t%32,n[14+(t+64>>>9<<4)]=t;for(var c=1732584193,f=-271733879,i=-1732584194,a=271733878,h=0;h<n.length;h+=16)c=l(r=c,e=f,o=i,u=a,n[h],7,-680876936),a=l(a,c,f,i,n[h+1],12,-389564586),i=l(i,a,c,f,n[h+2],17,606105819),f=l(f,i,a,c,n[h+3],22,-1044525330),c=l(c,f,i,a,n[h+4],7,-176418897),a=l(a,c,f,i,n[h+5],12,1200080426),i=l(i,a,c,f,n[h+6],17,-1473231341),f=l(f,i,a,c,n[h+7],22,-45705983),c=l(c,f,i,a,n[h+8],7,1770035416),a=l(a,c,f,i,n[h+9],12,-1958414417),i=l(i,a,c,f,n[h+10],17,-42063),f=l(f,i,a,c,n[h+11],22,-1990404162),c=l(c,f,i,a,n[h+12],7,1804603682),a=l(a,c,f,i,n[h+13],12,-40341101),i=l(i,a,c,f,n[h+14],17,-1502002290),c=g(c,f=l(f,i,a,c,n[h+15],22,1236535329),i,a,n[h+1],5,-165796510),a=g(a,c,f,i,n[h+6],9,-1069501632),i=g(i,a,c,f,n[h+11],14,643717713),f=g(f,i,a,c,n[h],20,-373897302),c=g(c,f,i,a,n[h+5],5,-701558691),a=g(a,c,f,i,n[h+10],9,38016083),i=g(i,a,c,f,n[h+15],14,-660478335),f=g(f,i,a,c,n[h+4],20,-405537848),c=g(c,f,i,a,n[h+9],5,568446438),a=g(a,c,f,i,n[h+14],9,-1019803690),i=g(i,a,c,f,n[h+3],14,-187363961),f=g(f,i,a,c,n[h+8],20,1163531501),c=g(c,f,i,a,n[h+13],5,-1444681467),a=g(a,c,f,i,n[h+2],9,-51403784),i=g(i,a,c,f,n[h+7],14,1735328473),c=v(c,f=g(f,i,a,c,n[h+12],20,-1926607734),i,a,n[h+5],4,-378558),a=v(a,c,f,i,n[h+8],11,-2022574463),i=v(i,a,c,f,n[h+11],16,1839030562),f=v(f,i,a,c,n[h+14],23,-35309556),c=v(c,f,i,a,n[h+1],4,-1530992060),a=v(a,c,f,i,n[h+4],11,1272893353),i=v(i,a,c,f,n[h+7],16,-155497632),f=v(f,i,a,c,n[h+10],23,-1094730640),c=v(c,f,i,a,n[h+13],4,681279174),a=v(a,c,f,i,n[h],11,-358537222),i=v(i,a,c,f,n[h+3],16,-722521979),f=v(f,i,a,c,n[h+6],23,76029189),c=v(c,f,i,a,n[h+9],4,-640364487),a=v(a,c,f,i,n[h+12],11,-421815835),i=v(i,a,c,f,n[h+15],16,530742520),c=m(c,f=v(f,i,a,c,n[h+2],23,-995338651),i,a,n[h],6,-198630844),a=m(a,c,f,i,n[h+7],10,1126891415),i=m(i,a,c,f,n[h+14],15,-1416354905),f=m(f,i,a,c,n[h+5],21,-57434055),c=m(c,f,i,a,n[h+12],6,1700485571),a=m(a,c,f,i,n[h+3],10,-1894986606),i=m(i,a,c,f,n[h+10],15,-1051523),f=m(f,i,a,c,n[h+1],21,-2054922799),c=m(c,f,i,a,n[h+8],6,1873313359),a=m(a,c,f,i,n[h+15],10,-30611744),i=m(i,a,c,f,n[h+6],15,-1560198380),f=m(f,i,a,c,n[h+13],21,1309151649),c=m(c,f,i,a,n[h+4],6,-145523070),a=m(a,c,f,i,n[h+11],10,-1120210379),i=m(i,a,c,f,n[h+2],15,718787259),f=m(f,i,a,c,n[h+9],21,-343485551),c=d(c,r),f=d(f,e),i=d(i,o),a=d(a,u);return[c,f,i,a]}function i(n){for(var t="",r=32*n.length,e=0;e<r;e+=8)t+=String.fromCharCode(n[e>>5]>>>e%32&255);return t}function a(n){var t=[];for(t[(n.length>>2)-1]=void 0,e=0;e<t.length;e+=1)t[e]=0;for(var r=8*n.length,e=0;e<r;e+=8)t[e>>5]|=(255&n.charCodeAt(e/8))<<e%32;return t}function e(n){for(var t,r="0123456789abcdef",e="",o=0;o<n.length;o+=1)t=n.charCodeAt(o),e+=r.charAt(t>>>4&15)+r.charAt(15&t);return e}function r(n){return unescape(encodeURIComponent(n))}function o(n){return i(c(a(n=r(n)),8*n.length))}function u(n,t){return function(n,t){var r,e=a(n),o=[],u=[];for(o[15]=u[15]=void 0,16<e.length&&(e=c(e,8*n.length)),r=0;r<16;r+=1)o[r]=909522486^e[r],u[r]=1549556828^e[r];return t=c(o.concat(a(t)),512+8*t.length),i(c(u.concat(t),640))}(r(n),r(t))}function t(n,t,r){return t?r?u(t,n):e(u(t,n)):r?o(n):e(o(n))}"function"==typeof define&&define.amd?define(function(){return t}):"object"==typeof module&&module.exports?module.exports=t:n.md5=t}(n);return n.md5;}();
    const WBI_MIXIN=[46,47,18,2,53,8,23,32,15,50,10,31,58,3,45,35,27,43,5,49,33,9,42,19,29,28,14,39,12,38,41,13,37,48,7,16,24,55,40,61,26,17,0,1,60,51,30,4,22,25,54,21,56,59,6,63,57,62,11,36,20,34,44,52];
    const encWbi=(p,ik,sk)=>{
        const mk=WBI_MIXIN.map(n=>(ik+sk)[n]).join('').slice(0,32), wt=Math.round(Date.now()/1000);
        const q=Object.entries({...p,wts:wt}).sort(([a],[b])=>a<b?-1:1).map(([k,v])=>`${encodeURIComponent(k)}=${encodeURIComponent(v.toString().replace(/[!'()*]/g,''))}`).join('&');
        return q+'&w_rid='+md5(q+mk);
    };

    GM_addStyle(`
        :root{--b-blue:#00aeec;--b-blue-hover:#00a1d6;--b-red:#ff4d4f;--b-bg-body:#ffffff;--b-bg-hover:#e3f5ff;--b-border:#e3e5e7;--b-radius:6px;}
        .bm-btn-entry{position:fixed;top:160px;right:20px;z-index:999;background:var(--b-blue);color:#fff;padding:8px 16px;border-radius:8px;border:none;cursor:pointer;box-shadow:0 4px 12px rgba(0,174,236,0.3);font-size:14px;transition:all .2s}
        .bm-btn-entry:hover{transform:translateY(-2px);background:var(--b-blue-hover)}
        .bm-overlay{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;justify-content:center;align-items:center;backdrop-filter:blur(2px)}
        .bm-win{width:95vw;max-width:1400px;height:90vh;background:var(--b-bg-body);border-radius:12px;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.08);font-family:-apple-system,sans-serif;color:#18191c}
        .bm-main-content{flex:1;display:flex;flex-direction:column;overflow:hidden;width:100%}
        .bm-top-bar, .bm-sub-bar, .bm-cond-bar{flex-shrink:0;display:flex;align-items:center;gap:8px;padding:8px 20px;border-bottom:1px solid var(--b-border);background:var(--b-bg-body);overflow-x:auto;white-space:nowrap;}
        .bm-top-bar{padding:10px 20px;}
        .bm-cond-bar{flex-wrap:wrap;padding:6px 20px;}
        .bm-filter-controls{display:flex;gap:10px;align-items:center;}
        .bm-action-bar-inline{display:flex;align-items:center;gap:8px;}
        .bm-body{flex:1;overflow-y:auto;scrollbar-width:thin;background:var(--b-bg-body)}
        .bm-input,.bm-select{height:32px;box-sizing:border-box;border:1px solid var(--b-border);border-radius:var(--b-radius);padding:0 10px;font-size:13px;color:#18191c;outline:none;background:var(--b-bg-body)}
        .bm-input:focus,.bm-select:focus{border-color:var(--b-blue)}
        .bm-select{min-width:70px;cursor:pointer}
        .bm-group{display:flex;align-items:center}
        .bm-group>*{border-radius:0;margin-left:-1px}
        .bm-group>*:first-child{border-radius:var(--b-radius) 0 0 var(--b-radius);margin-left:0}
        .bm-group>*:last-child{border-radius:0 var(--b-radius) var(--b-radius) 0}
        .bm-group .bm-toggle{height:32px;padding:0 10px;background:#fafafa;border:1px solid var(--b-border);font-size:12px;color:#61666d;cursor:pointer;display:flex;align-items:center;justify-content:center;user-select:none;flex-shrink:0}
        .bm-group .bm-toggle:hover{background:#eee;color:#18191c;z-index:1}
        .bm-group .bm-btn-add{height:32px;width:32px;padding:0;border:1px solid var(--b-border);background:var(--b-bg-body);color:var(--b-blue);font-size:18px;font-weight:700;display:flex;align-items:center;justify-content:center;cursor:pointer;line-height:1;flex-shrink:0}
        .bm-group .bm-btn-add:hover{background:var(--b-bg-hover);border-color:var(--b-blue);z-index:1}
        .bm-btn{height:32px;padding:0 14px;border-radius:var(--b-radius);border:1px solid var(--b-border);background:var(--b-bg-body);color:#18191c;font-size:13px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;transition:all .2s;white-space:nowrap;font-weight:500}
        .bm-btn:hover:not(:disabled){border-color:var(--b-blue);color:var(--b-blue);background:var(--b-bg-hover)}
        .bm-btn:disabled{opacity:.6;cursor:not-allowed;background:#f4f4f4;color:#9499a0}
        .bm-btn.processing{border-color:#fa8c16;color:#fa8c16;background:#fff7e6}
        .bm-v-divider{width:1px;height:20px;background:var(--b-border);margin:0 4px}
        .bm-lbl{font-size:13px;color:#61666d;}
        .bm-filter-tag{display:flex;align-items:center;gap:6px;background:#e6f7ff;border:1px solid #91d5ff;color:#096dd9;padding:0 8px;height:24px;border-radius:4px;font-size:12px;animation:fadeIn .2s}
        .bm-filter-tag .rm{cursor:pointer;font-weight:700;opacity:.6;font-size:14px}
        .bm-filter-tag:hover .rm{opacity:1;color:var(--b-red)}
        @keyframes fadeIn{from{opacity:0;transform:translateY(2px)}to{opacity:1;transform:translateY(0)}}
        .bm-status-text{color:#61666d;font-size:13px;white-space:nowrap;margin-right:8px;display:flex;align-items:center;}
        .bm-status-num{font-weight:700;color:#18191c;margin:0 4px;font-size:14px}
        .bm-close{font-size:20px;color:#9499a0;cursor:pointer;margin-left:8px;transition:color .2s}
        .bm-close:hover{color:#18191c}
        .bm-table{width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed;}
        .bm-table th{position:sticky;top:0;background:#fafafa;z-index:10;padding:12px 10px;border-bottom:1px solid var(--b-border);color:#61666d;text-align:left;font-weight:600;white-space:nowrap;user-select:none;cursor:pointer}
        .bm-table th:hover{background:#f0f0f0;color:#18191c}
        .bm-table th.active{color:var(--b-blue);background:#e6f7ff}
        .bm-table td{padding:8px 10px;border-bottom:1px solid #f4f4f4;height:54px;box-sizing:border-box;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#18191c}
        .bm-table tr:hover{background:#fafafa}
        .bm-table tr.sel{background:var(--b-bg-hover)!important}
        .bm-user-cell{display:flex;align-items:center;gap:10px}
        .bm-face{width:38px;height:38px;border-radius:50%;object-fit:cover;border:1px solid var(--b-border)}
        .bm-u-info{display:flex;flex-direction:column;justify-content:center;overflow:hidden}
        .bm-u-row1{display:flex;align-items:center;gap:6px}
        .bm-name{font-weight:500;color:#18191c;text-decoration:none;font-size:14px}
        .bm-name:hover{color:var(--b-blue)}
        .bm-sign{font-size:12px;color:#9499a0;margin-top:3px;overflow:hidden;text-overflow:ellipsis}
        .bm-tag{font-size:11px;padding:0 6px;height:18px;border-radius:4px;display:inline-flex;align-items:center;justify-content:center;border:1px solid;line-height:1;flex-shrink:0;font-weight:400;margin-left:2px}
        .t-vip{color:#d6249f;background:#fdf2f8;border-color:#fbcfe8}.t-org{color:#0066ff;background:#e6f0ff;border-color:#b3d1ff}.t-per{color:#ff6b00;background:#fff4e6;border-color:#ffd8a8}.t-group{color:#10b981;background:#ecfdf5;border-color:#a7f3d0}.t-special{color:#e63946;background:#ffe5e5;border-color:#ffadad}.t-mutual{color:#8b5cf6;background:#f5f3ff;border-color:#c4b5fd}.t-other{color:#b45309;background:#fffbeb;border-color:#fde68a}.t-none{color:#9ca3af;background:#f9fafb;border-color:#e5e7eb}
        .bm-toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:rgba(0,0,0,0.75);color:#fff;padding:8px 16px;border-radius:4px;z-index:20000;font-size:13px;pointer-events:none;opacity:0;transition:opacity .3s}
        .bm-toast.show{opacity:1}
        .bm-arrow{margin-left:2px;color:#9499a0;font-weight:normal}
        .active .bm-arrow{color:var(--b-blue)}
        .bm-btn-inv{cursor:pointer;color:var(--b-blue);margin-left:8px;font-size:12px;user-select:none;font-weight:normal}
        .bm-btn-inv:hover{text-decoration:underline}
        .bm-btn-clr{cursor:pointer;color:var(--b-red);margin-left:8px;font-size:12px;user-select:none;font-weight:normal}
        .bm-btn-clr:hover{text-decoration:underline}
    `);

    const Q = (sel, p = document) => p.querySelector(sel);
    const CE = (tag, cls = '') => { const e = document.createElement(tag); if(cls) e.className = cls; return e; };

    class App {
        constructor() {
            this.state = {
                list: [], groups: {}, wbi: null, busy: false, stop: false,
                sort: { k: null, d: 0 },
                filter: { fans: '>=', date: '<=', dateType: 'mtime' },
                conds: [], selected: new Set()
            };
            this.settings = { shortDelay: 300, longDelay: 5000, autoDeselect: true };
            this.uid = window.location.pathname.match(/space\/(\d+)/)?.[1] || document.cookie.match(/DedeUserID=(\d+)/)?.[1];
            this.db = null;
            const btn = CE('button', 'bm-btn-entry');
            btn.textContent = '关注管理';
            btn.onclick = () => this.show();
            document.body.appendChild(btn);
            this.initDB();
            this.loadSettings();
        }

        initDB() {
            return new Promise((res, rej) => {
                const r = indexedDB.open('BiliFollowManageDB', 2);
                r.onupgradeneeded = e => {
                    const db = e.target.result;
                    if (!db.objectStoreNames.contains('follows')) db.createObjectStore('follows', { keyPath: 'uid' });
                };
                r.onsuccess = e => { this.db = e.target.result; res(); };
                r.onerror = rej;
            });
        }
        
        loadSettings() {
            try {
                const s = JSON.parse(localStorage.getItem('BiliFollowManageSettings'));
                if (s && typeof s === 'object') this.settings = { ...this.settings, ...s };
            } catch {}
        }

        saveSettings() {
            localStorage.setItem('BiliFollowManageSettings', JSON.stringify(this.settings));
        }

        async clearCache() {
            if (!this.db || !confirm('确定清空所有关注数据？')) return;
            return new Promise((res, rej) => {
                const r = this.db.transaction('follows', 'readwrite').objectStore('follows').clear();
                r.onsuccess = () => {
                    this.state.list = []; this.state.selected.clear();
                    this.render(); res();
                };
                r.onerror = rej;
            });
        }

        async loadDB() {
            if (!this.db) await this.initDB();
            return new Promise(res => {
                const r = this.db.transaction('follows', 'readonly').objectStore('follows').getAll();
                r.onsuccess = () => {
                    if (r.result?.length) {
                        this.state.list = r.result;
                        this.render();
                    }
                    res();
                };
                r.onerror = res;
            });
        }

        async saveDB() {
            if (!this.db) await this.initDB();
            return new Promise(res => {
                const tx = this.db.transaction('follows', 'readwrite');
                const st = tx.objectStore('follows');
                st.clear().onsuccess = () => {
                    if (!this.state.list.length) return res();
                    this.state.list.forEach(i => st.put(i));
                    tx.oncomplete = () => { res(); };
                };
            });
        }

        async updateDBItem(item) {
            if (!this.db) await this.initDB();
            return new Promise((res, rej) => {
                const tx = this.db.transaction('follows', 'readwrite');
                tx.objectStore('follows').put(item);
                tx.oncomplete = res;
                tx.onerror = rej;
            });
        }
        
        async removeDBItem(uid) {
            if (!this.db) await this.initDB();
            return new Promise((res, rej) => {
                const tx = this.db.transaction('follows', 'readwrite');
                tx.objectStore('follows').delete(uid);
                tx.oncomplete = res;
                tx.onerror = rej;
            });
        }

        toast(msg) {
            if (!this.toastEl) { this.toastEl = CE('div', 'bm-toast'); document.body.appendChild(this.toastEl); }
            this.toastEl.textContent = msg; this.toastEl.classList.add('show');
            clearTimeout(this.tt); this.tt = setTimeout(() => this.toastEl.classList.remove('show'), 2000);
        }

        req(url, method = 'GET', data = null) {
            return new Promise((res, rej) => {
                GM_xmlhttpRequest({
                    method, url, data,
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': document.cookie },
                    onload: r => { try { const j = JSON.parse(r.responseText); (j.code === 0 || j.code === 22003) ? res(j) : rej(j); } catch { rej({ message: 'JSON Error' }); } },
                    onerror: () => rej({ message: 'Net Error' })
                });
            });
        }

        async getWbi() {
            if (this.state.wbi) return this.state.wbi;
            try {
                const { data: { wbi_img: { img_url, sub_url } } } = await this.req('https://api.bilibili.com/x/web-interface/nav');
                return this.state.wbi = {
                    ik: img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.')),
                    sk: sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'))
                };
            } catch { return { ik: '', sk: '' }; }
        }

        initUI() {
            if (this.ui) return;
            this.ui = CE('div', 'bm-overlay'); this.ui.style.display = 'none';
            this.ui.innerHTML = `
            <div class="bm-win">
                <div class="bm-main-content">
                    <div class="bm-top-bar">
                        <div class="bm-filter-controls">
                            <div class="bm-group">
                                <input type="number" id="bm-f-v" class="bm-input" placeholder="粉丝数" style="width:80px">
                                <div class="bm-toggle" id="bm-f-op">≥</div>
                                <button class="bm-btn-add" id="bm-add-f">+</button>
                            </div>
                            <div class="bm-group">
                                <div class="bm-toggle" id="bm-d-k" style="width:20px">关注</div>
                                <input type="date" id="bm-d-v" class="bm-input" style="width:100px">
                                <div class="bm-toggle" id="bm-d-op">早于</div>
                                <button class="bm-btn-add" id="bm-add-d">+</button>
                            </div>
                            <div class="bm-group">
                                <select id="bm-s-vip" class="bm-select" style="width:40px"><option value="">会员</option><option value="hundred">百年</option><option value="ten">十年</option><option value="2">年度</option><option value="1">月度</option><option value="0">无</option></select>
                                <div class="bm-toggle" id="bm-s-vip-op">是</div>
                            </div>
                            <div class="bm-group">
                                <select id="bm-s-ver" class="bm-select" style="width:40px"><option value="">认证</option><option value="1">组织</option><option value="0">个人</option><option value="-1">无</option></select>
                                <div class="bm-toggle" id="bm-s-ver-op">是</div>
                            </div>
                            <div class="bm-group">
                                <select id="bm-s-stat" class="bm-select" style="width:40px"><option value="">状态</option><option value="mutual">互关</option><option value="special">特别</option><option value="contract">老粉</option><option value="die">已注销</option></select>
                                <div class="bm-toggle" id="bm-s-stat-op">是</div>
                            </div>
                            <div class="bm-group">
                                <select id="bm-s-grp" class="bm-select" style="width:40px"><option value="">分组</option><option value="-10">特别关注</option><option value="0">默认分组</option></select>
                                <div class="bm-toggle" id="bm-s-grp-op">是</div>
                            </div>
                        </div>
                        <div style="flex:1"></div>
                        <div class="bm-action-bar-inline">
                            <div class="bm-status-text" id="bm-st"></div>
                            <button class="bm-btn" id="bm-btn-fetch-fans">粉丝</button>
                            <button class="bm-btn" id="bm-btn-fetch-dyn">动态</button>
                            <div class="bm-v-divider"></div>
                            <button class="bm-btn" id="bm-btn-unf" disabled>取关</button>
                            <button class="bm-btn" id="bm-btn-fol" disabled>关注</button>
                            <div class="bm-close" id="bm-cls">✕</div>
                        </div>
                    </div>
                    <div class="bm-sub-bar">
                        <select id="bm-s-tg" class="bm-select"><option value="">目标分组</option></select>
                        <button class="bm-btn" id="bm-btn-g-add" disabled>添加</button>
                        <button class="bm-btn" id="bm-btn-g-cpy" disabled>复制</button>
                        <button class="bm-btn" id="bm-btn-g-mov" disabled>移动</button>
                        <div class="bm-v-divider"></div>
                        <button class="bm-btn" id="bm-btn-imp">导入</button>
                        <button class="bm-btn" id="bm-btn-exp">导出</button>
                        <div class="bm-v-divider"></div>
                        <button class="bm-btn" id="bm-btn-clear-cache">清空缓存</button>
                        <span class="bm-lbl">间隔</span>
                        <input type="number" id="bm-set-short-delay" class="bm-input" step="50" style="width:60px" title="取关/分组/分页/粉丝数">
                        <input type="number" id="bm-set-long-delay" class="bm-input" step="100" style="width:60px" title="批量关注/动态投稿获取">
                        <label class="bm-lbl" style="cursor:pointer;display:flex;align-items:center;gap:4px">
                           <input type="checkbox" id="bm-set-auto-deselect"> 自动取消选中
                        </label>
                        <div style="flex:1"></div>
                        <input id="bm-k" class="bm-input" placeholder="搜索..." style="width:240px;">
                    </div>
                    <div class="bm-cond-bar" id="bm-conds" style="display:none;"></div>
                    <div class="bm-body">
                        <table class="bm-table">
                            <thead><tr>
                                <th width="65" data-s="sel"><input type="checkbox" id="bm-all"> <span class="bm-arrow">↕</span></th>
                                <th data-s="u">用户 <span class="bm-arrow">↕</span></th>
                                <th width="100" data-s="f">粉丝数 <span class="bm-arrow">↕</span></th>
                                <th width="100" data-s="d">最新动态 <span class="bm-arrow">↕</span></th>
                                <th width="100" data-s="v">最新投稿 <span class="bm-arrow">↕</span></th>
                                <th width="100" data-s="t">关注时间 <span class="bm-arrow">↕</span></th>
                                <th width="60" data-s="vip">会员 <span class="bm-arrow">↕</span></th>
                                <th width="60" data-s="ver">认证 <span class="bm-arrow">↕</span></th>
                            </tr></thead>
                            <tbody id="bm-list"></tbody>
                        </table>
                    </div>
                </div>
            </div>`;
            document.body.appendChild(this.ui);
            this.bind();
        }

        bind() {
            Q('#bm-cls', this.ui).onclick = () => this.hide();
            Q('#bm-all', this.ui).onchange = e => this.toggleAll(e.target.checked);
            let tm;
            Q('#bm-k', this.ui).oninput = () => { 
                clearTimeout(tm); 
                tm = setTimeout(() => {
                    if (this.settings.autoDeselect) this.state.selected.clear();
                    this.render(); 
                }, 300); 
            };
            const tog = (id, f, a, b) => { Q(id).onclick = e => { const v = e.target.textContent===a; e.target.textContent = v?b:a; this.state.filter[f] = v?'>':'<='; if(f==='fans') this.state.filter[f]=v?'<':'>='; }; };
            tog('#bm-f-op', 'fans', '≥', '<');
            Q('#bm-d-op').onclick = e => { const v = e.target.textContent==='早于'; this.state.filter.date = v?'>':'<='; e.target.textContent = v?'晚于':'早于'; };
            Q('#bm-d-k').onclick = e => {
                const m = { mtime: '关注', last_video_ts: '投稿', last_dynamic_ts: '动态' }, k = Object.keys(m), n = k[(k.indexOf(this.state.filter.dateType)+1)%3];
                this.state.filter.dateType = n; e.target.textContent = m[n];
            };
            Q('#bm-add-f').onclick = () => this.addCond('fans');
            Q('#bm-add-d').onclick = () => this.addCond('date');
            const setupToggle = (id, textA, textB) => { Q(id).onclick = e => { e.target.textContent = e.target.textContent === textA ? textB : textA; }; };
            setupToggle('#bm-s-vip-op', '是', '非');
            setupToggle('#bm-s-ver-op', '是', '非');
            setupToggle('#bm-s-stat-op', '是', '非');
            setupToggle('#bm-s-grp-op', '是', '非');
            const addCondOnChange = (type) => Q(`#bm-s-${type}`, this.ui).onchange = e => { if (e.target.value) this.addCond(type); };
            addCondOnChange('vip');
            addCondOnChange('ver');
            addCondOnChange('stat');
            addCondOnChange('grp');
            ['bm-btn-fol', 'bm-btn-unf', 'bm-btn-g-add', 'bm-btn-g-cpy', 'bm-btn-g-mov'].forEach(id => Q('#'+id).onclick = () => this.act(id.split('-').pop(), id.includes('unf')?2:1));
            Q('#bm-btn-fetch-fans').onclick = () => this.act('fetch-fans');
            Q('#bm-btn-fetch-dyn').onclick = () => this.act('fetch-dyn');
            Q('#bm-btn-imp').onclick = () => this.act('imp');
            Q('#bm-btn-exp').onclick = () => this.act('exp');
            const shortDelayIn = Q('#bm-set-short-delay', this.ui);
            shortDelayIn.value = this.settings.shortDelay;
            shortDelayIn.onchange = e => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 50) { this.settings.shortDelay = val; this.saveSettings(); }
            };
            const longDelayIn = Q('#bm-set-long-delay', this.ui);
            longDelayIn.value = this.settings.longDelay;
            longDelayIn.onchange = e => {
                const val = parseInt(e.target.value);
                if (!isNaN(val) && val >= 500) { this.settings.longDelay = val; this.saveSettings(); }
            };
            const autoDesCheck = Q('#bm-set-auto-deselect', this.ui);
            autoDesCheck.checked = this.settings.autoDeselect;
            autoDesCheck.onchange = e => {
                this.settings.autoDeselect = e.target.checked;
                this.saveSettings();
            };
            Q('#bm-btn-clear-cache').onclick = async () => {
                await this.clearCache();
            };
            this.ui.querySelectorAll('th[data-s]').forEach(th => th.onclick = (e) => {
                if(e.target.tagName === 'INPUT') return;
                this.sort(th.dataset.s);
            });
            Q('#bm-list').onclick = e => {
                const tr = e.target.closest('tr'); if (!tr || e.target.tagName === 'A') return;
                const mid = parseInt(tr.dataset.mid), c = tr.querySelector('.bm-chk');
                if (e.target.type !== 'checkbox') c.checked = !c.checked;
                c.checked ? this.state.selected.add(mid) : this.state.selected.delete(mid);
                this.updateUI();
            };
            Q('#bm-st').onclick = e => {
                if (e.target.id === 'bm-btn-inv') this.toggleInvert();
                if (e.target.id === 'bm-btn-clr') { this.state.selected.clear(); this.render(); }
            };
        }

        async show() {
            if (!this.ui) this.initUI();
            this.ui.style.display = 'flex';
            await this.loadDB();
            this.loadGroups();
            this.syncData();
        }
        hide() { if (this.ui) this.ui.style.display = 'none'; this.state.stop = true; }

        async loadGroups() {
            try {
                const { data } = await this.req('https://api.bilibili.com/x/relation/tags');
                this.state.groups = {};
                const s1 = Q('#bm-s-grp'), s2 = Q('#bm-s-tg');
                s2.innerHTML = '<option value="">目标分组</option>';
                s1.innerHTML = '<option value="">分组</option><option value="-10">特别关注</option><option value="0">默认分组</option>';
                data.forEach(g => {
                    this.state.groups[g.tagid] = g.name;
                    if (g.tagid !== 0 && g.tagid !== -10) { s1.add(new Option(g.name, g.tagid)); s2.add(new Option(g.name, g.tagid)); }
                });
                s2.add(new Option('特别关注', -10));
            } catch {}
        }

        async syncData() {
            if (!this.uid) return alert('请先登录');
            const map = new Map(); this.state.list.forEach(u => map.set(u.uid, u));
            let pn = 1, fresh = [];
            const st = Q('#bm-st');
            try {
                while (this.ui.style.display !== 'none') {
                    const res = await this.req(`https://api.bilibili.com/x/relation/followings?vmid=${this.uid}&pn=${pn}&ps=50&order=desc&order_type=attention`).catch(()=>null);
                    const list = res?.data?.list || [];
                    if (!list.length) break;
                    list.forEach(r => {
                        const u = this.parse(r), old = map.get(u.uid);
                        if (old) { u.fans = old.fans||0; u.videoTime = old.videoTime||0; u.dynamicTime = old.dynamicTime||0; }
                        fresh.push(u);
                    });
                    st.innerHTML = `同步中... <span class="bm-status-num">${fresh.length}</span> / ${res.data.total}`;
                    if (list.length < 50) break;
                    pn++; if (pn % 5 === 0) await new Promise(r => setTimeout(r, this.settings.shortDelay));
                }
                this.state.list = fresh;
                this.render();
                this.saveDB();
            } catch (e) { st.textContent = '同步出错'; console.error(e); }
        }

        parse(u) {
            if (u.uid && u.mutual !== undefined) return u;
            let v = "";
            if (u.vip?.vipStatus === 1) {
                const t = u.vip.label?.text || "";
                v = t.includes("百年")?"百年":(t.includes("十年")?"十年":(u.vip.vipType===2?"年度":"月度"));
            }
            return {
                uid: u.mid, name: u.uname, face: (u.face||'').replace('http:', ''), sign: u.sign || '',
                fans: u.follower || 0, followTime: u.mtime || 0, videoTime: u.last_video_ts || 0, dynamicTime: u.last_dynamic_ts || 0,
                groups: u.tag || [], mutual: u.attribute === 6, special: u.special === 1,
                contract: u.contract_info?.is_contract, org: u.official_verify?.type === 1, desc: u.official_verify?.desc, vip: v
            };
        }

        addCond(t) {
            const push = (c) => { 
                if (this.settings.autoDeselect) this.state.selected.clear();
                this.state.conds.push(c); 
                this.renderConds(); 
                this.render(); 
            };
            if (['vip', 'ver', 'stat', 'grp'].includes(t)) {
                const el = Q(`#bm-s-${t}`);
                if (!el.value) return;
                const opEl = Q(`#bm-s-${t}-op`);
                const op = opEl.textContent === '是';
                const label = `${el.options[0].text} ${opEl.textContent} ${el.options[el.selectedIndex].text}`;
                push({ t, v: el.value, op, l: label });
                el.value = "";
            } else {
                const iv = Q(t==='fans'?'#bm-f-v':'#bm-d-v'), v = iv.value;
                if (!v) return;
                const op = this.state.filter[t], ts = t==='date'?new Date(v).getTime()/1000:parseInt(v);
                if (t==='fans' && isNaN(ts)) return;
                const lb = t==='fans' ? `粉丝数 ${Q('#bm-f-op').textContent} ${ts}` : `${Q('#bm-d-k').textContent} ${Q('#bm-d-op').textContent} ${v}`;
                push({ t, s: this.state.filter.dateType, op, v: ts, l: lb });
                iv.value = '';
            }
        }

        renderConds() {
            const c = Q('#bm-conds'); 
            c.innerHTML = '';
            if (this.state.conds.length === 0) {
                c.style.display = 'none';
                return;
            }
            c.style.display = 'flex';
            this.state.conds.forEach((o, i) => {
                const t = CE('div', 'bm-filter-tag'); t.innerHTML = `<span>${o.l}</span><span class="rm">✕</span>`;
                t.querySelector('.rm').onclick = () => { 
                    if (this.settings.autoDeselect) this.state.selected.clear();
                    this.state.conds.splice(i, 1); 
                    this.renderConds(); 
                    this.render(); 
                };
                c.appendChild(t);
            });
            if (this.state.conds.length > 1) {
                const clr = CE('div', 'bm-filter-tag');
                clr.innerHTML = `<span style="cursor:pointer;color:var(--b-red);font-weight:bold;">清空</span>`;
                clr.style.background = '#fff0f6';
                clr.style.borderColor = '#ffadd2';
                clr.onclick = () => {
                    if (this.settings.autoDeselect) this.state.selected.clear();
                    this.state.conds = [];
                    this.renderConds();
                    this.render();
                };
                c.appendChild(clr);
            }
        }

        render() {
            const k = Q('#bm-k').value.toLowerCase();
            this.view = this.state.list.filter(u => {
                if (k && !u.name.toLowerCase().includes(k) && !String(u.uid).includes(k)) return false;
                for (let c of this.state.conds) {
                    if (c.t === 'fans') { if ((c.op==='>=' && u.fans<c.v) || (c.op==='<' && u.fans>=c.v)) return false; }
                    else if (c.t === 'date') {
                        let t = c.s==='mtime'?u.followTime:(c.s==='last_video_ts'?u.videoTime:u.dynamicTime);
                        if ((c.op==='<=' && t>c.v) || (c.op==='>' && t<c.v)) return false;
                    } else {
                        let is_match = false;
                        if (c.t === 'ver') {
                            is_match = (c.v === "1" && u.org) || (c.v === "0" && !u.org && !!u.desc) || (c.v === "-1" && !u.desc);
                        } else if (c.t === 'vip') {
                            is_match = (c.v === "0" && !u.vip) || (c.v === "2" && ["年度", "百年", "十年"].includes(u.vip)) ||
                                       (c.v === "1" && u.vip === "月度") || (c.v === "hundred" && u.vip === "百年") || (c.v === "ten" && u.vip === "十年");
                        } else if (c.t === 'stat') {
                            is_match = (c.v === "mutual" && u.mutual) || (c.v === "special" && (u.special || u.groups?.includes(-10))) ||
                                       (c.v === "contract" && u.contract) || (c.v === "die" && u.name === "账号已注销");
                        } else if (c.t === 'grp') {
                            const gid = parseInt(c.v);
                            is_match = (gid === 0 && !u.groups?.some(g => g !== 0)) || (gid !== 0 && u.groups?.includes(gid));
                        }
                        if (is_match !== c.op) return false;
                    }
                }
                return true;
            });

            const { k: sk, d: sd } = this.state.sort;
            if (sk && sd) {
                this.view.sort((a, b) => {
                    let va, vb;
                    if (sk==='u') return a.name.localeCompare(b.name, 'zh') * sd;
                    if (sk==='f') { va=a.fans; vb=b.fans; }
                    else if (sk==='t') { va=a.followTime; vb=b.followTime; }
                    else if (sk==='v') { va=a.videoTime; vb=b.videoTime; }
                    else if (sk==='d') { va=a.dynamicTime; vb=b.dynamicTime; }
                    else if (sk==='sel') { va = this.state.selected.has(a.uid) ? 1 : 0; vb = this.state.selected.has(b.uid) ? 1 : 0; return (vb - va) * sd; }
                    else if (sk==='ver') { va=a.org?2:(a.desc?1:0); vb=b.org?2:(b.desc?1:0); }
                    else if (sk==='vip') { const s=u=>u.vip==="百年"?100:(u.vip==="十年"?50:(u.vip==="年度"?10:(u.vip==="月度"?5:0))); va=s(a); vb=s(b); }
                    return (va - vb) * sd;
                });
            }

            const tb = Q('#bm-list'), f = document.createDocumentFragment();
            tb.innerHTML = '';
            const dt = ts => ts ? new Date(ts*1000).toISOString().split('T')[0] : '-';
            this.view.forEach(u => {
                const tr = CE('tr'), sel = this.state.selected.has(u.uid);
                tr.dataset.mid = u.uid; if(sel) tr.className = 'sel';
                const tag = (c, t) => `<span class="bm-tag ${c}">${t}</span>`;
                let ts = [];
                if(u.mutual) ts.push(tag('t-mutual','互相关注'));
                if(u.contract) ts.push(tag('t-other','原始粉丝'));
                u.groups?.forEach(g => g===-10?ts.push(tag('t-special','特别关注')):(g!==0&&this.state.groups[g]&&ts.push(tag('t-group',this.state.groups[g]))));
                tr.innerHTML = `<td><input type="checkbox" class="bm-chk" ${sel?'checked':''}></td>
                    <td><div class="bm-user-cell"><a href="//space.bilibili.com/${u.uid}" target="_blank"><img src="${u.face}" class="bm-face" loading="lazy"></a>
                    <div class="bm-u-info"><div class="bm-u-row1"><a href="//space.bilibili.com/${u.uid}" target="_blank" class="bm-name" title="${u.name}">${u.name}</a>${ts.join('')}</div><span class="bm-sign" title="${u.sign}">${u.sign||'-'}</span></div></div></td>
                    <td>${u.fans?.toLocaleString()||'-'}</td><td style="color:#888">${dt(u.dynamicTime)}</td><td style="color:#888">${dt(u.videoTime)}</td><td style="color:#888">${dt(u.followTime)}</td>
                    <td>${u.vip?tag('t-vip',u.vip):tag('t-none','无')}</td><td>${u.org?tag('t-org','组织'):(u.desc?tag('t-per','个人'):tag('t-none','无'))}</td>`;
                f.appendChild(tr);
            });
            tb.appendChild(f);
            this.updateUI();
        }

        updateUI() {
            const tot = this.state.list.length, vis = this.view.length, sel = this.state.selected.size;
            const invBtn = `<span id="bm-btn-inv" class="bm-btn-inv">[反选]</span>`;
            const clrBtn = `<span id="bm-btn-clr" class="bm-btn-clr">[清空选中]</span>`;
            Q('#bm-st').innerHTML = `共 <span class="bm-status-num">${tot}</span> 人${vis!==tot?` | 筛选 <span class="bm-status-num">${vis}</span>`:''}${sel?` | 已选 <span class="bm-status-num" style="color:var(--b-blue)">${sel}</span>${invBtn}${clrBtn}`:''}`;
            const all = Q('#bm-all'); all.checked = vis>0 && sel===vis; all.indeterminate = sel>0 && sel<vis;
            ['bm-btn-fol', 'bm-btn-unf', 'bm-btn-g-add', 'bm-btn-g-cpy', 'bm-btn-g-mov'].forEach(id => Q('#'+id).disabled = !sel);
        }

        toggleAll(chk) {
            this.view.forEach(u => chk ? this.state.selected.add(u.uid) : this.state.selected.delete(u.uid));
            this.render();
        }

        toggleInvert() {
            this.view.forEach(u => {
                if (this.state.selected.has(u.uid)) this.state.selected.delete(u.uid);
                else this.state.selected.add(u.uid);
            });
            this.render();
        }

        sort(k) {
            const s = this.state.sort;
            if (s.k !== k) { s.k = k; s.d = 1; } else { s.d = s.d === 1 ? -1 : (s.d === -1 ? 0 : 1); if(!s.d) s.k = null; }
            this.ui.querySelectorAll('th[data-s]').forEach(th => {
                const isActive = th.dataset.s === s.k && s.d !== 0;
                th.classList.toggle('active', isActive);
                const arrow = th.querySelector('.bm-arrow');
                if (arrow) arrow.textContent = isActive ? (s.d === 1 ? ' ↑' : ' ↓') : ' ↕';
            });
            this.render();
        }

        async act(t, op) {
            if (['fetch-fans', 'fetch-dyn'].includes(t)) return this.fetchInfo(t.split('-')[1]);
            if (this.state.busy) return;
            if (t === 'exp') {
                const s = this.state.selected.size ? Array.from(this.state.selected).map(m => this.state.list.find(x => x.uid===m)).filter(x=>x) : this.state.list;
                const a = CE('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], {type: 'application/json'}));
                a.download = `BiliFollows_${new Date().toISOString().slice(0,10)}.json`; a.click(); return;
            }
            if (t === 'imp') {
                const i = CE('input'); i.type = 'file'; i.accept = '.json';
                i.onchange = e => {
                    const r = new FileReader();
                    r.onload = ev => {
                        try {
                            const d = JSON.parse(ev.target.result);
                            if (!Array.isArray(d)) throw 0;
                            const map = new Map(); this.state.list.forEach(u => map.set(u.uid, u));
                            let n = 0;
                            d.forEach(raw => {
                                const u = this.parse(raw);
                                if (map.has(u.uid)) Object.assign(map.get(u.uid), u);
                                else { this.state.list.unshift(u); map.set(u.uid, u); n++; }
                            });
                            this.render(); this.saveDB(); alert(`导入完成，新增 ${n} 人`);
                        } catch { alert('文件格式错误'); }
                    };
                    r.readAsText(e.target.files[0]);
                };
                i.click(); return;
            }
            const items = Array.from(this.state.selected).map(m => this.state.list.find(x => x.uid===m)).filter(x=>x);
            if (!items.length) return alert('请先选择');
            if (['add', 'cpy', 'mov'].includes(t)) {
                const gid = Q('#bm-s-tg').value; if (!gid) return alert('选择目标分组');
                const gn = this.state.groups[gid] || '特殊';
                let sg = 0; 
                if (t === 'mov') {
                    sg = (this.state.conds.find(c => c.t==='grp')||{}).v || 0;
                    if (sg==0 && !confirm("未选择具体分组，从[默认分组]移动？")) return;
                }
                if (!confirm(`${t==='mov'?'移动':(t==='cpy'?'复制':'添加')} ${items.length} 人到 ${gn}?`)) return;
                await this.modGroup(items, t, gid, sg);
            }
            else {
                if (!confirm(`确定${op===1?'关注':'取关'} ${items.length} 人?`)) return;
                this.state.busy = true;
                await this.modRel(items, op);
                this.state.busy = false;
            }
        }

        async fetchInfo(type) {
            if (this.state.busy) { this.state.stop = true; return; }
            let items = Array.from(this.state.selected).map(m => this.state.list.find(x => x.uid === m)).filter(x => x);
            if (!items.length) items = this.view;
            if (!items.length) return alert('列表为空');
            this.state.busy = true; this.state.stop = false;
            const delayMs = type === 'fans' ? this.settings.shortDelay : this.settings.longDelay;
            const b = Q(type === 'fans' ? '#bm-btn-fetch-fans' : '#bm-btn-fetch-dyn');
            const originalText = b.textContent;
            b.textContent = '停止'; b.classList.add('processing');
            const st = Q('#bm-st');
            let completed = 0;
            await this.getWbi();
            const updateProgress = () => {
                completed++;
                st.innerHTML = `更新中... <span class="bm-status-num">${completed} / ${items.length}</span>`;
            };
            const tasks = items.map(u => async () => {
                if (this.state.stop || this.ui.style.display === 'none' || !this.state.list.includes(u)) return;
                try {
                    if (type === 'fans') {
                        const { data } = await this.req(`https://api.bilibili.com/x/relation/stat?vmid=${u.uid}`);
                        u.fans = data.follower;
                        const c = Q(`tr[data-mid="${u.uid}"]`)?.cells[2];
                        if (c) c.textContent = u.fans.toLocaleString();
                    } else if (type === 'dyn') {
                        const q = encWbi({ mid: u.uid, ps: 1, pn: 1 }, this.state.wbi.ik, this.state.wbi.sk);
                        const [videoRes, dynRes] = await Promise.all([
                            this.req(`https://api.bilibili.com/x/space/wbi/arc/search?${q}`).catch(()=>({data:{list:{vlist:[]}}})),
                            this.req(`https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${u.uid}&offset=`).catch(()=>({data:{items:[]}}))
                        ]);
        
                        u.videoTime = videoRes.data?.list?.vlist?.[0]?.created || u.videoTime || 0;
                        const c_v = Q(`tr[data-mid="${u.uid}"]`)?.cells[4];
                        if (c_v) c_v.textContent = u.videoTime ? new Date(u.videoTime * 1000).toISOString().split('T')[0] : '-';
        
                        u.dynamicTime = dynRes.data?.items?.reduce((max, x) => Math.max(max, x?.modules?.module_author?.pub_ts || 0), 0) || u.dynamicTime || 0;
                        const c_d = Q(`tr[data-mid="${u.uid}"]`)?.cells[3];
                        if (c_d) c_d.textContent = u.dynamicTime ? new Date(u.dynamicTime * 1000).toISOString().split('T')[0] : '-';
                    }
                    await this.updateDBItem(u);
                } catch (e) { console.error(`Failed to fetch info for ${u.uid}`, e); }
                updateProgress();
            });    
            const queue = [...tasks];
            const executing = new Set();
            while (queue.length > 0 && !this.state.stop) {
                while (executing.size < 5 && queue.length > 0 && !this.state.stop) {
                    const task = queue.shift();
                    const promise = task().finally(() => executing.delete(promise));
                    executing.add(promise);
                    if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs));
                }
                if (executing.size > 0) await Promise.race(executing);
            }
            await Promise.all(executing);

            const isStopped = this.state.stop;
            this.state.busy = false; this.state.stop = false;
            b.textContent = originalText;
            b.classList.remove('processing');
            st.textContent = isStopped ? '已停止' : `更新完成 ${completed} 人`;
            if (this.settings.autoDeselect) this.state.selected.clear();
            this.render();
        }

        async modRel(items, act) {
            const st = Q('#bm-st'), csrf = document.cookie.match(/bili_jct=([^;]+)/)?.[1];
            if (act === 2) {
                for (let i = 0; i < items.length; i++) {
                    if (this.ui.style.display === 'none') break;
                    st.innerHTML = `取关 <span class="bm-status-num">${i+1}/${items.length}</span>`;
                    const uid = items[i].uid;
                    try {
                        await this.req('https://api.bilibili.com/x/relation/modify', 'POST', `fid=${uid}&act=2&re_src=11&csrf=${csrf}`);
                        this.state.list = this.state.list.filter(x => x.uid !== uid);
                        this.state.selected.delete(uid);
                        await this.removeDBItem(uid);
                    } catch {}
                    await new Promise(r => setTimeout(r, this.settings.shortDelay));
                }
            } else {
                for (let i = 0; i < items.length; i += 50) {
                    if (this.ui.style.display === 'none') break;
                    const chk = items.slice(i, i + 50);
                    st.innerHTML = `关注 <span class="bm-status-num">${Math.min(i+50,items.length)}/${items.length}</span>`;
                    try {
                        await this.req('https://api.bilibili.com/x/relation/batch/modify', 'POST', `fids=${chk.map(u=>u.uid).join(',')}&act=1&re_src=11&csrf=${csrf}`);
                    } catch {}
                    await new Promise(r => setTimeout(r, this.settings.longDelay));
                }
                if (this.settings.autoDeselect) this.state.selected.clear();
            }
            st.textContent = '完成'; 
            this.render();
        }

        async modGroup(items, mode, tid, sid) {
            const st = Q('#bm-st'), csrf = document.cookie.match(/bili_jct=([^;]+)/)?.[1];
            const uri = `https://api.bilibili.com/x/relation/tags/${mode==='mov'?'moveUsers':(mode==='cpy'?'copyUsers':'addUsers')}`;
            for (let i = 0; i < items.length; i += 50) {
                if (this.ui.style.display === 'none') break;
                const chk = items.slice(i, i + 50);
                st.innerHTML = `处理 <span class="bm-status-num">${Math.min(i+50,items.length)}/${items.length}</span>`;
                let d = `fids=${chk.map(u=>u.uid).join(',')}&csrf=${csrf}`;
                if (mode === 'mov') d += `&beforeTagids=${sid}&afterTagids=${tid}`; else d += `&tagids=${tid}`;
                try {
                    await this.req(uri, 'POST', d);
                    const g = parseInt(tid);
                    for(const u of chk){
                        if(!u.groups) u.groups=[]; 
                        if(mode==='mov') u.groups=u.groups.filter(t=>t!=sid); 
                        if(!u.groups.includes(g)) u.groups.push(g);
                        await this.updateDBItem(u);
                    }
                } catch {}
                await new Promise(r => setTimeout(r, this.settings.shortDelay));
            }
            if (this.settings.autoDeselect) this.state.selected.clear();
            st.textContent = '完成'; this.render();
        }
    }
    new App();
})();