// ==UserScript==
// @name         网易云音乐解限下载
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @author       YisRime
// @description  解除歌单限制，下载歌词、翻译、封面、MV 等资源，支持批量下载。
// @match        *://music.163.com/*
// @grant        GM.xmlHttpRequest
// @grant        GM_xmlhttpRequest
// @grant        unsafeWindow
// @run-at       document-start
// @connect      126.net
// @connect      163.com
// @connect      172.*
// @connect      *
// @license      AGPLv3
// @require      https://cdn.staticfile.org/jquery/3.5.1/jquery.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/crypto-js/3.1.9-1/crypto-js.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
// @require      https://cdnjs.cloudflare.com/ajax/libs/FileSaver.js/2.0.5/FileSaver.min.js
// ==/UserScript==

(function () {
    'use strict';

    const xhr = typeof GM_xmlhttpRequest !== 'undefined' ? GM_xmlhttpRequest : GM.xmlHttpRequest;
    const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;

    // 状态提示
    const tip = (text = '', box = null) => {
        const root = box || document.querySelector('#content-operation') || document.querySelector('#j-op') || document.body;
        let node = root.querySelector('.wyy-tip');
        if (!node) {
            node = document.createElement('span');
            node.className = 'wyy-tip';
            node.style.cssText = 'display:none;margin:6px 0;padding:2px 10px;border-radius:12px;font-size:12px;line-height:18px;vertical-align:middle;transition:all .2s;';
            root.appendChild(node);
        }
        clearTimeout(node.timer);
        if (!text) return (node.style.display = 'none');
        const fail = /失败|受限/.test(text);
        node.style.cssText += `display:inline-block;background:${fail ? '#fff2f2' : '#f7f7f7'};color:${fail ? '#c20c0c' : '#666'};border:1px solid ${fail ? '#ffd6d6' : '#e3e3e3'};`;
        node.innerText = text;
        node.timer = setTimeout(() => { node.style.display = 'none'; node.innerText = ''; }, 500);
    };

    // 网络服务
    class Net {
        static mod = '00e0b509f6259df8642dbc35662901477df22677ec152b5ff68ace615bb7b725152b3ab17a876aea8a5aa76d2e417629ec4ee341f56135fccf695280104e0312ecbda92557c93870114af6c9d05c4f7f0c3685b7a46bee255932575cce10b424d813cfe4875d3e82047b97ddef52741d546b8e289dc6935b3ece0462db0a22b8e7';

        static weapi(obj) {
            const seed = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 16);
            const aes = (text, key) => CryptoJS.AES.encrypt(CryptoJS.enc.Utf8.parse(text), CryptoJS.enc.Utf8.parse(key), { iv: CryptoJS.enc.Utf8.parse('0102030405060708'), mode: CryptoJS.mode.CBC }).toString();
            const rsa = (text, key, pub) => {
                let base = BigInt(0);
                for (let i = text.length - 1; i >= 0; i--) base = (base << BigInt(8)) + BigInt(text.charCodeAt(i));
                let exp = BigInt('0x' + key), mod = BigInt('0x' + pub), res = BigInt(1);
                while (exp > BigInt(0)) {
                    if (exp & BigInt(1)) res = (res * base) % mod;
                    base = (base * base) % mod;
                    exp >>= BigInt(1);
                }
                return res.toString(16).padStart(256, '0');
            };
            return `params=${encodeURIComponent(aes(aes(JSON.stringify(obj), '0CoJUm6Qyw8W8jud'), seed))}&encSecKey=${encodeURIComponent(rsa(seed, '010001', Net.mod))}`;
        }

        static req = (url, data = null, method = 'POST') => new Promise(res => xhr({
            method, url: url.startsWith('http') ? url : `https://music.163.com${url}`,
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cookie': 'os=osx', 'Referer': 'http://music.163.com/' },
            data, onload: r => { try { res(JSON.parse(r.responseText)); } catch (_) { res(r.response); } }, onerror: () => res(null)
        }));

        static we = (path, data) => Net.req(path, Net.weapi(data));
        static urls = ids => Net.we('/weapi/song/enhance/player/url', { ids, br: 999000 }).then(d => d?.data || []);
        static lyric = id => Net.we('/weapi/song/lyric', { os: 'osx', id, lv: -1, kv: -1, tv: -1 });
        static album = id => Net.we(`/weapi/v1/album/${id}`, {});
        static playlist = id => Net.we('/weapi/v3/playlist/detail', { id, total: 'true', limit: 1000, n: 1000, offest: 0 }).then(d => d?.playlist);
        static mv = id => Net.req(`/api/mv/detail?id=${id}&type=mp4`, null, 'GET').then(d => d?.data);
        static clean = (text = '') => text.replace(/[\/:*?"<>|]/g, '').trim();
        static name = (list, song) => Net.clean(`${(list || []).map(a => a.name).filter(Boolean).join(' & ')} - ${song}`);

        static blob = (url, prog) => new Promise(res => xhr({
            method: 'GET', url, overrideMimeType: 'text/plain;charset=x-user-defined',
            onprogress: prog, onload: r => res(r.status === 200 ? new Blob([Uint8Array.from(r.response, c => c.charCodeAt(0) & 255)]) : null), onerror: () => res(null)
        }));

        static bind(node) {
            node.addEventListener('click', e => {
                const match = /([\w\s]+)(\.\w)(\?.*)?$/i.exec(node.href || '');
                const name = node.download || (match ? match[1] + (match[2] || '') : '');
                if (!name || !node.href || node.busy) return;
                e.preventDefault();
                node.busy = true;
                tip(`正在下载：${name}`);
                Net.blob(node.href, r => { if (r.lengthComputable) tip(`正在下载：${name} (${(r.loaded * 100 / r.total).toFixed(1)}%)`); }).then(data => {
                    if (data) { saveAs(data, name); tip(''); } else tip('下载失败');
                    node.busy = false;
                    if (node.id === 'tmp') { node.previousElementSibling?.remove(); node.remove(); }
                });
            }, true);
        }

        static async pack(title, tracks, audio = false, box = null) {
            const zip = new JSZip(), map = audio ? Object.fromEntries((await Net.urls(tracks.map(s => s.id))).map(u => [u.id, u])) : {};
            for (let i = 0; i < tracks.length; i++) {
                const s = tracks[i], name = Net.name(s.ar, s.name);
                tip(`正在打包：${name} (${i + 1}/${tracks.length})`, box);
                if (audio && map[s.id]?.url) {
                    const buf = await Net.blob(map[s.id].url);
                    if (buf) zip.file(`songs/${name}.${map[s.id].type}`, buf);
                }
                const lyr = await Net.lyric(s.id);
                if (lyr?.lrc?.lyric) zip.file(`lyrics/${name}.lrc`, lyr.lrc.lyric.replace(/\[(\d\d.\d\d.\d\d)\d\]/g, '[$1]'));
                if (lyr?.tlyric?.lyric) zip.file(`lyrics/${name}.trans.lrc`, lyr.tlyric.lyric.replace(/\[(\d\d.\d\d.\d\d)\d\]/g, '[$1]'));
                if (s.al?.picUrl) {
                    const pic = await Net.blob(s.al.picUrl);
                    if (pic) zip.file(`pics/${name}.jpg`, pic);
                }
            }
            saveAs(await zip.generateAsync({ type: 'blob' }), `${Net.clean(title)}.zip`);
            tip('', box);
        }
    }

    // 解除限制
    const cache = win.COMPLETE_PLAYLIST_CACHE = { '18': {}, '13': {} };
    const clone = e => { const c = new e.constructor(e.type, e); Object.defineProperty(c, 'target', { value: e.target }); return c; };
    const escape = (text = '') => String(text).replace(/[&<>'"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[c] || c);
    const dur = time => `${String(Math.floor((time || 0) / 60000)).padStart(2, '0')}:${String(Math.floor(((time || 0) % 60000) / 1000)).padStart(2, '0')}`;

    const norm = song => {
        const item = { ...song, ...song.privilege };
        return {
            ...item,
            album: item.al || item.album,
            alias: item.alia || item.ala || [],
            artists: item.ar || item.artists || [],
            commentThreadId: `R_SO_4_${item.id}`,
            copyrightId: item.cp,
            duration: item.dt || item.duration,
            mvid: item.mv || item.mvid,
            position: item.no,
            ringtone: item.rt,
            status: item.st,
            pstatus: item.pst,
            version: item.v,
            songType: item.t,
            score: item.pop,
            transNames: item.tns || [],
            privilege: item.privilege
        };
    };

    const find = (obj, reg) => {
        for (const k in obj) {
            if (!Object.prototype.hasOwnProperty.call(obj, k) || !obj[k]) continue;
            if (typeof obj[k] === 'function' && String(obj[k]).match(reg)) return [k];
            if (typeof obj[k] === 'object') { const path = find(obj[k], reg); if (path) return [k].concat(path); }
        }
    };

    const hook = (ctx = win) => {
        if (!ctx || ctx.hooked || !ctx.nej) return;
        try {
            const path = find(ctx.nej, '\\.replace\\("api","weapi');
            if (!path) return;
            let ptr = ctx.nej;
            const last = path.pop();
            path.forEach(k => ptr = ptr[k]);
            const orig = ptr[last];
            ctx.hooked = true;
            ptr[last] = function (url, opt) {
                if (/\/playlist\/detail/.test(url) && opt && opt.onload) {
                    const hookload = opt.onload;
                    opt.onload = async function (data) {
                        try {
                            const ids = data.playlist?.trackIds || [];
                            const tracks = data.playlist?.tracks || [];
                            if (ids.length > tracks.length) {
                                const miss = ids.slice(tracks.length), size = 1000;
                                const list = await Promise.all(Array(Math.ceil(miss.length / size)).fill().map((_, i) => Net.req('/api/v3/song/detail', `c=${encodeURIComponent(JSON.stringify(miss.slice(i * size, (i + 1) * size).map(({ id })) ))}`)));
                                const songs = {}, privs = {};
                                list.forEach(r => { r?.songs?.forEach(s => songs[s.id] = s); r?.privileges?.forEach(p => privs[p.id] = p); });
                                const add = miss.map(({ id }) => ({ ...songs[id], privilege: privs[id] }));
                                data.playlist.tracks = tracks.concat(add);
                                data.privileges = (data.privileges || []).concat(add.map(({ id }) => privs[id]));
                            }
                        } catch (_) {}
                        return hookload.apply(this, arguments);
                    };
                }
                return orig.apply(this, arguments);
            };
        } catch (_) {}
    };

    // 页面功能
    const Page = {
        playlist: async (doc, id, target = win) => {
            hook(target);
            const btn = doc.querySelector('.u-btni-dl');
            if (btn && !btn.hooked) {
                btn.hooked = true;
                btn.childNodes[0].innerText = '下载';
                btn.onclick = async () => {
                    const pl = (await Net.playlist(id)) || cache['13'][id];
                    if (!pl?.tracks?.length) return tip('获取失败');
                    Net.pack(`${pl.name} - 歌词封面`, pl.tracks, false, doc.querySelector('#content-operation'));
                };
            }

            let pl = await Net.playlist(id);
            const ids = pl?.trackIds || [], tracks = pl?.tracks || [];
            if (ids.length > tracks.length) {
                const miss = ids.slice(tracks.length), size = 1000;
                const list = await Promise.all(Array(Math.ceil(miss.length / size)).fill().map((_, i) => Net.req('/api/v3/song/detail', `c=${encodeURIComponent(JSON.stringify(miss.slice(i * size, (i + 1) * size).map(({ id: mid })) ))}`)));
                const songs = {}, privs = {};
                list.forEach(res => { res?.songs?.forEach(item => songs[item.id] = item); res?.privileges?.forEach(item => privs[item.id] = item); });
                pl.tracks = tracks.concat(miss.map(({ id: mid }) => ({ ...songs[mid], privilege: privs[mid] })));
            }

            const body = doc.querySelector('table tbody');
            if (!pl || !body) return;

            cache['13'][pl.id] = pl.tracks.map(s => cache['18'][s.id] = norm(s));
            body.innerHTML = pl.tracks.map((s, i) => {
                const item = norm(s);
                const song = escape(item.name), note = escape(item.transNames[0] || item.alias[0] || '');
                const author = item.artists.map(a => escape(a.name)).join('/'), alname = escape(item.album?.name || '');
                const alpath = item.album?.id ? `<a href="#/album?id=${item.album.id}" title="${alname}">${alname}</a>` : '';
                const artists = item.artists.map(a => `<a href="#/artist?id=${a.id}">${escape(a.name)}</a>`).join('/');
                const del = win.top?.GUser?.userId === pl.creator?.userId;
                return `<tr id="${item.id}${Date.now()}" class="${i % 2 ? '' : 'even'} ${item.status < 0 ? 'js-dis' : ''}"><td class="left"><div class="hd"><span data-res-id="${item.id}" data-res-type="18" data-res-action="play" data-res-from="13" data-res-data="${pl.id}" class="ply">&nbsp;</span><span class="num">${i + 1}</span></div></td>` +
                    `<td><div class="f-cb"><div class="tt"><div class="ttc"><span class="txt"><a href="#/song?id=${item.id}"><b title="${song}${note ? ` - (${note})` : ''}">${song}</b></a>${note ? `<span title="${note}" class="s-fc8"> - (${note})</span>` : ''}${item.mvid ? `<a href="#/mv?id=${item.mvid}" class="mv">MV</a>` : ''}</span></div></div></div></td>` +
                    `<td class="s-fc3"><span class="u-dur candel">${dur(item.duration)}</span><div class="opt hshow">` +
                    `<a class="u-icn u-icn-81 icn-add" href="javascript:;" title="添加到播放列表" data-res-type="18" data-res-id="${item.id}" data-res-action="addto" data-res-data="${pl.id}"></a>` +
                    `<span data-res-id="${item.id}" data-res-type="18" data-res-action="fav" class="icn icn-fav" title="收藏"></span>` +
                    `<span data-res-id="${item.id}" data-res-type="18" data-res-action="share" data-res-name="${alname}" data-res-author="${author}" data-res-pic="${item.album?.picUrl || ''}" class="icn icn-share" title="分享"></span>` +
                    `<span data-res-id="${item.id}" data-res-type="18" data-res-action="download" class="icn icn-dl" title="下载"></span>` +
                    (del ? `<span data-res-id="${item.id}" data-res-type="18" data-res-action="delete" class="icn icn-del" title="删除"></span>` : '') +
                    `</div></td><td><div class="text" title="${author}">${artists}</div></td><td><div class="text">${alpath}</div></td></tr>`;
            }).join('');

            const click = e => {
                const act = e.target.getAttribute('data-res-action');
                const sid = e.target.getAttribute('data-res-id');
                const stype = e.target.getAttribute('data-res-type');
                const sdata = e.target.getAttribute('data-res-data');
                const item = (cache[stype] || {})[sid];
                if (!item) return;
                e.stopPropagation();
                if (!['play', 'addto'].includes(act)) return void doc.body.dispatchEvent(clone(e));
                const list = (Array.isArray(item) ? item : [item]).map(song => ({ ...song, source: { fdata: Number(sdata || sid), fid: 13, link: `/playlist?id=${sdata || sid}&_hash=songlist-${song.id}`, title: '歌单' } }));
                win.top?.player?.addTo(list, act === 'play' && stype === '13', act === 'play');
            };
            doc.querySelector('table tbody')?.addEventListener('click', click);
            doc.querySelector('#content-operation .u-btni-addply')?.addEventListener('click', click);
            doc.querySelector('#content-operation .u-btni-add')?.addEventListener('click', click);
            doc.querySelector('.m-playlist-see-more')?.remove();
        },

        song: async (doc, id) => {
            const bar = doc.querySelector('#content-operation'), tit = doc.querySelector('.tit'), row = doc.querySelectorAll('p.des.s-fc4')[1];
            if (!bar || !tit || !row || doc.querySelector('#wyyyydda')) return;

            const ar = Array.from(tit.parentNode.nextElementSibling?.querySelectorAll('.s-fc7') || []).map(e => e.innerText).join(',');
            const base = `${ar} - ${tit.querySelector('.f-ff2')?.innerText || ''}.`;
            const btn = doc.querySelector('.u-btni-dl'), audio = document.createElement('audio');
            audio.id = 'wyyyydda';
            audio.style.marginTop = '10px';
            audio.oncanplay = () => {
                if (btn) { btn.href = audio.src; btn.setAttribute('download', base + (audio.src.includes('.flac') ? 'flac' : 'mp3')); }
            };
            if (btn) { btn.href = 'javascript:;'; Net.bind(btn); }

            const panel = document.createElement('p');
            panel.className = 'desc s-fc4';
            panel.style.margin = '10px 0';

            const make = (txt, fn) => {
                const a = document.createElement('a');
                a.className = 's-fc7';
                a.style.marginRight = '12px';
                a.href = 'javascript:;';
                a.innerText = txt;
                if (fn) a.onclick = fn;
                return a;
            };

            const direct = make('直链');
            direct.target = '_blank';
            const play = make('试听', () => { audio.controls = true; audio.play(); });
            const lrc = make('歌词'), trans = make('翻译'), cover = make('封面');
            lrc.download = base + 'lrc'; trans.download = base + 'lrc'; cover.download = base + 'jpg';

            const pic = doc.querySelector('.u-cover img');
            if (pic) cover.href = pic.getAttribute('data-src') || pic.src;
            Net.bind(cover);

            Net.urls([id]).then(d => {
                const url = d?.[0]?.url;
                if (url) { direct.href = url; audio.src = url; audio.setAttribute('data-br', d[0].br); }
                else { direct.style.color = 'gray'; tip('资源受限', panel); }
            });

            Net.lyric(id).then(r => {
                if (r?.lrc?.lyric) lrc.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(r.lrc.lyric); else lrc.style.color = 'gray';
                if (r?.tlyric?.lyric) trans.href = 'data:text/plain;charset=utf-8,' + encodeURIComponent(r.tlyric.lyric); else trans.style.color = 'gray';
            });

            panel.append(direct, play, lrc, trans, cover);
            const mvel = doc.querySelector('a[title="播放mv"]');
            if (mvel) {
                const mvbtn = make('MV'), mvid = mvel.href.split('=')[1];
                mvbtn.download = base + 'mp4';
                Net.mv(mvid).then(d => {
                    const br = [1080, 720, 480, 240].find(x => d?.brs?.[x]);
                    if (br) { mvbtn.href = d.brs[br]; Net.bind(mvbtn); }
                });
                panel.appendChild(mvbtn);
            }

            panel.append(document.createElement('br'), audio);
            row.parentNode.insertBefore(panel, row.nextElementSibling);
        },

        album: async (doc, id) => {
            const btn = doc.querySelector('.u-btni-dl');
            if (!btn || btn.hooked) return;
            btn.hooked = true;
            btn.childNodes[0].innerText = '下载';
            btn.onclick = async () => {
                const d = await Net.album(id);
                if (!d?.songs?.length) return tip('获取失败');
                Net.pack(`${d.album.artist.name} - ${d.album.name}`, d.songs, true, doc.querySelector('#content-operation'));
            };
            Page.list(doc);
        },

        media: async (doc, id, mv) => {
            const bar = doc.querySelector('#j-op');
            if (!bar || bar.querySelector('.u-btni-direct-link')) return;
            const play = mv
                ? await Net.mv(id).then(d => { const b = [1080, 720, 480, 240].find(x => d?.brs?.[x]); return b ? d.brs[b] : null; })
                : await Net.req(`/api/cloudvideo/playurl?ids=%5B%22${id}%22%5D&resolution=1080`, null, 'GET').then(d => d?.urls?.[0]?.url);
            if (play) {
                const btn = document.createElement('a');
                btn.className = 'u-btn2 u-btn2-2 u-btni-addply u-btni-direct-link f-fl';
                btn.setAttribute('hidefocus', 'true');
                btn.target = '_blank';
                btn.href = play;
                btn.innerHTML = '<i><em class="ply"></em>直链</i>';
                bar.appendChild(btn);
            }
        },

        list: doc => {
            let audio = doc.querySelector('#wyyyydda');
            if (!audio) { audio = document.createElement('audio'); audio.id = 'wyyyydda'; doc.body.appendChild(audio); }
            audio.oncanplay = () => {
                const a = document.createElement('a');
                a.href = audio.src;
                a.id = 'tmp';
                a.download = audio.getAttribute('data-fileName') + (audio.src.includes('.flac') ? '.flac' : '.mp3');
                Net.bind(a);
                const cur = doc.querySelector('[downloading]');
                if (cur?.parentNode) { cur.parentNode.append(document.createElement('br'), a); cur.removeAttribute('downloading'); a.click(); }
            };

            doc.querySelectorAll('span.icn-dl').forEach(btn => {
                if (btn.hooked) return;
                btn.hooked = true;
                btn.onclick = () => {
                    const id = btn.getAttribute('data-res-id'), prev = btn.previousElementSibling;
                    const name = prev ? `${prev.getAttribute('data-res-author')} - ${prev.getAttribute('data-res-name')}` : '';
                    audio.setAttribute('data-fileName', name);
                    btn.setAttribute('downloading', 'true');
                    tip(`正在下载：${name}`);
                    Net.urls([id]).then(d => { if (d?.[0]) audio.src = d[0].url; else tip('解析失败'); });
                };
            });
        }
    };

    // 路由分发
    const route = () => {
        const frame = document.querySelector('#g_iframe') || document.querySelector('iframe');
        const doc = frame?.contentWindow?.document || document;
        const target = frame?.contentWindow || win;
        const href = target.location.href || location.href;
        const hash = location.hash || target.location.hash || '';
        const search = target.location.search || hash.split('?')[1] || location.search || '';
        const id = new URLSearchParams(search).get('id');

        hook(target);
        if ((href.includes('playlist') || hash.includes('playlist')) && id) Page.playlist(doc, id, target);
        else if ((href.includes('song') || hash.includes('song')) && id) Page.song(doc, id);
        else if ((href.includes('album') || hash.includes('album')) && id) Page.album(doc, id);
        else if ((href.includes('mv') || hash.includes('mv')) && id) Page.media(doc, id, true);
        else if ((href.includes('video') || hash.includes('video')) && id) Page.media(doc, id, false);
        else if (/artist|toplist|recommend/.test(href) || /artist|toplist|recommend/.test(hash)) Page.list(doc);
    };

    if (window.top === window.self) {
        const watch = () => {
            const bar = document.querySelector('.m-playbar .words');
            if (bar) new MutationObserver(() => {
                const frame = document.querySelector('#g_iframe') || document.querySelector('iframe');
                frame?.contentWindow?.dispatchEvent(new Event('songchange'));
            }).observe(bar, { childList: true });
            (document.querySelector('#g_iframe') || document.querySelector('iframe'))?.addEventListener('load', () => setTimeout(route, 500));
        };
        document.readyState === 'loading' ? window.addEventListener('DOMContentLoaded', watch) : watch();
    } else {
        hook(win);
        window.addEventListener('load', () => setTimeout(route, 500));
    }

    window.addEventListener('load', () => setTimeout(route, 500));
    window.addEventListener('hashchange', () => setTimeout(route, 500));
})();