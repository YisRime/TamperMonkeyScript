// ==UserScript==
// @name         Bing Rewards 挂机助手
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @description  自动完成 Microsoft Rewards 的每日活动、每日搜索与主动搜索，自动获取积分。
// @author       YisRime
// @match        *://*.bing.com/*
// @grant        GM_openInTab
// @grant        GM_setValue
// @grant        GM_getValue
// @run-at       document-end
// @license      AGPLv3
// @icon         https://www.bing.com/favicon.ico
// ==/UserScript==
(function () {
    'use strict';

    const K = { owner: 'rw:owner', snap: 'rw:snapshot', click: 'rw:click' };
    const S = { run: 'rw_run', cfg: 'rw_cfg', tries: 'rw_tries', terms: 'rw_terms', score: 'rw_score', pend: 'rw_pend', fold: 'rw_fold' };
    const FLYOUT = 'https://rewards.bing.com/flyout?channel=bingflyout&partnerId=BingRewards';

    const SELF = Math.random().toString(36).slice(2); const day = () => new Date().toDateString();

    const EPOCH = (window.__rwEpoch = (window.__rwEpoch || 0) + 1);
    const stale = () => window.__rwEpoch !== EPOCH;
    if (window.__rwLive) { window.__rwEpoch = window.__rwLiveEpoch; return; }
    window.__rwLive = true; window.__rwLiveEpoch = EPOCH;

    const Bridge = { get: k => GM_getValue(k, null), set: (k, v) => GM_setValue(k, v) };

    const Store = {
        get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
        del(k) { try { localStorage.removeItem(k); } catch (e) {} }
    };

    const Clock = (() => {
        const waiters = new Set();
        const sweep = () => {
            const list = [...waiters];
            waiters.clear();
            list.forEach(fn => { try { fn(); } catch (e) {} });
        };
        try {
            const w = new Worker(URL.createObjectURL(new Blob(['setInterval(()=>postMessage(1),100)'], { type: 'text/javascript' })));
            w.onmessage = sweep;
        } catch (e) {}
        setInterval(sweep, 1000);
        return {
            sleep(ms) {
                return new Promise(resolve => {
                    const start = Date.now();
                    const probe = () => { if (Date.now() - start >= ms) return resolve(); waiters.add(probe); };
                    waiters.add(probe);
                });
            }
        };
    })();

    const jitter = (base, spread) => base + Math.random() * spread;

    async function waitFor(ready, timeout = 5000) {
        const start = Date.now();
        for (;;) {
            let ok = false;
            try { ok = ready(); } catch (e) {}
            if (ok) return true;
            if (Date.now() - start >= timeout) return false;
            await Clock.sleep(100);
        }
    }

    const Front = {
        ok() { return document.visibilityState !== 'hidden'; },
        claim() { try { window.focus(); } catch (e) {} },
        wait(timeout = 60000) { return waitFor(() => Front.ok(), timeout); }
    };

    const Lock = {
        take() { Bridge.set(K.owner, { id: SELF, at: Date.now() }); },
        drop() { const o = Bridge.get(K.owner); if (o && o.id === SELF) Bridge.set(K.owner, null); },
        other() { const o = Bridge.get(K.owner); return !!o && o.id !== SELF && Date.now() - o.at < 5000; }
    };

    const Mouse = {
        move(x, y) {
            document.dispatchEvent(new MouseEvent('mousemove', {
                bubbles: true, cancelable: true, clientX: Math.round(x), clientY: Math.round(y)
            }));
        },
        async glide(tx, ty, steps = 4) {
            const sx = jitter(120, 600), sy = jitter(80, 400);
            for (let i = 1; i <= steps; i++) {
                const t = i / steps;
                Mouse.move(sx + (tx - sx) * t, sy + (ty - sy) * t);
                await Clock.sleep(100);
            }
            for (let i = 0; i < 2; i++) {
                Mouse.move(tx + (Math.random() - 0.5) * 6, ty + (Math.random() - 0.5) * 6);
                await Clock.sleep(100);
            }
            Mouse.move(tx, ty);
        },
        to(el) {
            if (!el) return Promise.resolve();
            const r = el.getBoundingClientRect();
            return Mouse.glide(r.x + r.width / 2, r.y + r.height / 2);
        }
    };

    const Daily = {
        get(key, field, fallback) {
            const f = Store.get(key, null);
            if (f && f.day === day() && f[field] != null) return f[field];
            Store.del(key);
            return fallback;
        },
        set(key, field, value) { Store.set(key, { day: day(), [field]: value }); }
    };

    const cfg = { maxRounds: 40, activeEnabled: true, activeGoal: 90, capProbe: 3, gapTicks: 3 };

    let searching = false, folded = false, rounds = 0, pendBefore = 0;
    const progress = { current: 0, total: 0, completed: false };

    const Score = {
        value: 0, today: 0, miss: 0, count: 0, lastAt: 0,
        refresh() {
            const raw = ((document.querySelector('#rh_rwm .points-container, .points-container') || {}).textContent || '');
            const n = parseInt(raw.replace(/\D/g, ''), 10) || 0;
            if (n && n !== Score.value) { Score.value = n; UI.progress(); }
            return n;
        },
        load() { const f = Daily.get(S.score, 's', null); if (f) Object.assign(Score, f); },
        save() { Daily.set(S.score, 's', { today: Score.today, miss: Score.miss, count: Score.count, lastAt: Score.lastAt }); },
        countSearch() { Score.count++; Score.lastAt = Date.now(); Score.save(); },
        record(before) {
            const now = Score.value || 0; const got = now > before ? now - before : 0;
            Score.today += got;
            Score.miss = got > 0 ? 0 : Score.miss + 1;
            Score.save();
            return got;
        },
        capped() { return Score.miss >= cfg.capProbe && Score.count >= cfg.capProbe; },
        done() { return Score.today >= cfg.activeGoal || Score.capped(); }
    };

    const Query = {
        pool: [], used: [],
        harvest() {
            Query.addAll(document.querySelectorAll('#b_results .b_rs a, .richrsrailsuggestion_text, #b_context .b_rs a'), false);
            Query.addAll(document.querySelectorAll('#tobPrompt a, #b_hot .hot_item, #b_hot a[href*="/search"]'), true);
            (Board.suggestions || []).forEach(t => Query.add(t));
        },
        addAll(nodes, strip) {
            nodes.forEach(n => {
                let s = (n.textContent || '').replace(/\s+/g, ' ').trim();
                if (strip) s = s.replace(/^\s*\d+\s*/, '');
                Query.add(s);
            });
        },
        add(t) {
            const s = (t || '').replace(/\s+/g, ' ').trim();
            if (s.length < 2 || s.length > 40) return;
            if (/^(换一批|必应上的热点|显示更多)$/.test(s)) return;
            if (s.toLowerCase() === (new URLSearchParams(location.search).get('q') || '').trim().toLowerCase()) return;
            if (Query.used.includes(s) || Query.pool.includes(s)) return;
            Query.pool.push(s);
        },
        pick() {
            if (!Query.pool.length) Query.harvest();
            const t = Query.pool.shift();
            if (!t) return null;
            Query.used.push(t);
            Daily.set(S.terms, 't', Query.used);
            return t;
        },
        load() { Query.used = Daily.get(S.terms, 't', []); }
    };

    const Side = {
        read() { return Bridge.get(K.snap); },
        askClick(task) { Bridge.set(K.click, task ? { name: task.name, at: Date.now() } : null); },
        misses: 0,
        async readInline() {
            if (Side.misses >= 3) return null;
            let frame = document.getElementById('rw-frame');
            if (!frame) {
                frame = document.createElement('iframe');
                frame.id = 'rw-frame';
                frame.setAttribute('aria-hidden', 'true');
                frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
                frame.src = FLYOUT;
                (document.body || document.documentElement).appendChild(frame);
            }
            const ok = await waitFor(() => {
                const p = Side.read();
                return !!p && Date.now() - p.at < 5000;
            }, 5000);
            if (!ok) { Side.misses++; return null; }
            Side.misses = 0;
            return Side.read();
        }
    };

    const Flyout = {
        isFlyoutDoc() { return /\/(panelflyout|flyout)(\/|$)/i.test(location.pathname); },
        settled(doc) {
            const root = doc.querySelector('main') || doc.body;
            if (!root) return false;
            if (root.querySelector('[class*="skeleton"], [class*="animate-pulse"], [aria-busy="true"]')) return false;
            return /(搜索|Search)\s*[:：]?\s*\d+\s*\/\s*\d+/.test((root.textContent || '').replace(/\s+/g, ' '));
        },
        parse(doc, baseUrl) {
            const root = doc.querySelector('main') || doc.body;
            if (!root) return null;
            const txt = n => ((n && n.textContent) || '').replace(/\s+/g, ' ').trim();
            const frac = s => {
                const m = (s || '').replace(/[,\s]/g, '').match(/(\d+)\/(\d+)/);
                return m ? { current: +m[1], total: +m[2] } : null;
            };
            const near = [];
            for (const e of root.querySelectorAll('*')) {
                if (e.childElementCount > 2) continue;
                const t = txt(e);
                if (t.length && t.length < 60) near.push(t);
            }
            const shortest = re => near.filter(t => re.test(t)).sort((a, b) => a.length - b.length)[0] || '';
            const quota = label => frac(shortest(new RegExp(label + '[^0-9]{0,8}\\d+\\s*/\\s*\\d+', 'i')));
            const tasks = [], terms = [];
            root.querySelectorAll('a[href]').forEach(a => {
                const href = a.getAttribute('href') || '';
                if (/refer|invite|share|redeem|orders|faq|help|level/i.test(href)) return;
                const body = txt(a);
                const badge = (body.match(/[+＋]\s*(\d{1,4})(?!\d)/) || [])[1] || '';
                const done = /已完成|已领取|已参与|Completed|Claimed/i.test(body);
                if (!badge && !done) return;
                let url = href;
                try { url = new URL(href, baseUrl || location.href).href; } catch (e) {}
                tasks.push({
                    name: txt(a.querySelector('p, h3, h4, [class*=title]')) || body.slice(0, 24),
                    status: done ? 'done' : 'todo',
                    url,
                    locked: /需要.{0,8}级别|如何激活|Requires|Locked/i.test(body),
                    points: +badge || 0
                });
                const q = Flyout.searchQuery(url);
                if (q) terms.push(q);
            });
            const search = quota('(搜索|Search)'); const activity = quota('(活动|Activit)');
            const checkin = quota('(签到|Check in)');
            const dailySet = frac(near.find(t => /^\d{1,5}\s*\/\s*\d{1,5}$/.test(t))) || null;
            if (!search && !activity && !checkin && !dailySet && !tasks.length) return null;
            return { search, activity, checkin, dailySet, tasks, suggestedSearches: [...new Set(terms)] };
        },
        searchQuery(url) {
            let u;
            try { u = new URL(url); } catch (e) { return null; }
            if (!/(^|\.)bing\.com$/.test(u.hostname) || !/\/search/i.test(u.pathname)) return null;
            const q = (u.searchParams.get('q') || '').trim();
            return q.length > 1 && q.length < 60 ? q : null;
        },
        press(doc, el) {
            const W = doc.defaultView, r = el.getBoundingClientRect();
            const o = {
                bubbles: true, cancelable: true, button: 0, buttons: 1,
                clientX: Math.round(r.x + r.width / 2), clientY: Math.round(r.y + r.height / 2),
                pointerId: 1, pointerType: 'mouse', isPrimary: true
            };
            el.dispatchEvent(new W.PointerEvent('pointerdown', o));
            el.dispatchEvent(new W.PointerEvent('pointerup', o));
            el.dispatchEvent(new W.MouseEvent('click', o));
        },
        claimed: false,
        async claimPending() {
            if (Flyout.claimed) return;
            const entry = [...document.querySelectorAll('button')].find(b => /待领取/.test(b.textContent || ''));
            if (!entry) return;
            Flyout.claimed = true;
            Flyout.press(document, entry);
            for (let i = 0; i < 8; i++) {
                await Clock.sleep(1000);
                const dlg = [...document.querySelectorAll('[role=dialog]')].find(x => /领取积分/.test(x.textContent || ''));
                if (!dlg) continue;
                const all = [...dlg.querySelectorAll('button')].find(b => /待领取/.test(b.textContent || '') && /领取积分/.test(b.textContent || ''));
                if (all) { Flyout.press(document, all); return; }
            }
        },
        clickedAt: 0,
        async runClickJob() {
            const job = Bridge.get(K.click);
            if (!job || !job.name) { Flyout.clickedAt = 0; return; }
            if (Date.now() - job.at > 60000 || Flyout.clickedAt === job.at) return;
            if (!Front.ok()) return;
            const link = [...document.querySelectorAll('a')].find(a =>
                (a.textContent || '').includes(job.name) && !/已完成/.test(a.textContent || ''));
            if (!link) return;
            Flyout.clickedAt = job.at;
            await Mouse.to(link);
            Flyout.press(document, link);
        },
        expanded: 0, lastExpand: 0, lastPub: 0,
        run() {
            const publish = () => {
                if (Date.now() - Flyout.lastPub < 1000 || !Flyout.settled(document)) return;
                Flyout.lastPub = Date.now();
                const more = [...document.querySelectorAll('button')]
                    .find(b => /^(显示更多|Show more)/i.test((b.textContent || '').trim()) && b.offsetParent !== null);
                if (more && Flyout.expanded < 4) {
                    if (Date.now() - Flyout.lastExpand > 1000) {
                        Flyout.lastExpand = Date.now();
                        Flyout.expanded++;
                        Flyout.press(document, more);
                    }
                    return;
                }
                Flyout.claimPending().catch(() => {  });
                Flyout.runClickJob().catch(() => {  });
                const p = Flyout.parse(document, location.href);
                if (p) Bridge.set(K.snap, Object.assign(p, { at: Date.now() }));
            };
            setInterval(publish, 1000);
            new MutationObserver(publish).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
            publish();
        }
    };

    const Board = {
        tasks: [], search: null, activity: null, dailySet: null, checkin: null,
        suggestions: [], attempts: {},
        key(t) {
            const s = (t && (t.url || t.name)) || ''; let h = 0;
            for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
            return (h >>> 0).toString(36);
        },
        todo() { return Board.tasks.filter(t => t.status === 'todo' && !t.locked); },
        tries(t) { return Board.attempts[Board.key(t)] || 0; },
        apply(p) {
            Board.search = p.search || null; Board.activity = p.activity || null;
            Board.checkin = p.checkin || null; Board.dailySet = p.dailySet || null;
            if (p.suggestedSearches && p.suggestedSearches.length) Board.suggestions = p.suggestedSearches;
            if (p.tasks && p.tasks.length) { Board.tasks = p.tasks; UI.tasks(p.tasks); }
            Board.sync();
        },
        sync() {
            const qs = [Board.search, Board.activity].filter(q => q && q.total > 0);
            if (!qs.length) return;
            progress.total = qs.reduce((s, q) => s + q.total, 0);
            progress.current = qs.reduce((s, q) => s + Math.min(q.current, q.total), 0);
            progress.completed = qs.every(q => q.current >= q.total) && !Board.todo().length;
        },
        preRender() {
            const c = Side.read();
            if (!c || !(c.tasks || []).length || Date.now() - c.at > 60000) return;
            Board.apply(c);
            UI.progress();
        }
    };

    if (Flyout.isFlyoutDoc()) { Flyout.run(); return; }

    async function collect() {
        UI.status('读取侧栏');
        UI.place();
        Lock.take();
        const snap = await Side.readInline();
        if (!snap) { UI.status('侧栏未响应'); return false; }
        Board.apply(snap);
        Query.harvest();
        Score.refresh();
        UI.progress();
        return true;
    }

    async function ensureSnapshot() {
        const c = Side.read();
        if (c && Date.now() - c.at < 60000) return true;
        return collect();
    }

    function browseLanding() {
        const start = Date.now();
        (async () => {
            Front.claim();
            await Clock.sleep(1000);
            const doc = document.documentElement;
            const bottom = () => doc.scrollHeight - window.innerHeight - 40;
            while (Date.now() - start < 60000) {
                if (!Front.ok()) return;
                window.scrollBy({ top: Math.round(window.innerHeight * 0.8) * (window.scrollY < bottom() ? 1 : -1), behavior: 'smooth' });
                await Mouse.glide(jitter(200, 900), jitter(200, 400));
                await Clock.sleep(1000);
            }
            if (window.opener) { try { window.opener.focus(); } catch (e) {} }
            try { window.close(); } catch (e) {}
        })();
    }

    async function typeAndSearch(term) {
        const box = document.querySelector('#sb_form_q'); const form = document.querySelector('#sb_form');
        const before = location.href;
        Front.claim();
        if (box && form) {
            await Mouse.to(box);
            box.focus();
            const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
            const input = () => box.dispatchEvent(new Event('input', { bubbles: true }));
            set.call(box, '');
            input();
            await Clock.sleep(100);
            for (const ch of term) {
                set.call(box, box.value + ch);
                input();
                await Clock.sleep(100);
            }
            box.dispatchEvent(new Event('change', { bubbles: true }));
            await Clock.sleep(100);
            const go = document.querySelector('#sb_form_go') ||
                form.querySelector('button[type="submit"], input[type="submit"]');
            if (go) { await Mouse.to(go); go.click(); }
            if (await waitFor(() => location.href !== before, 5000)) return;
            try { HTMLFormElement.prototype.submit.call(form); } catch (e) {}
            if (await waitFor(() => location.href !== before, 5000)) return;
        }
        location.href = location.origin + '/search?q=' + encodeURIComponent(term);
    }

    async function submit(term) {
        const before = location.href;
        await typeAndSearch(term);
        await waitFor(() => window.__rwLeaving || location.href !== before, 5000);
        return !!window.__rwLeaving;
    }

    async function run() {
        while (searching && !stale()) {
            if (!Front.ok()) {
                UI.status('页面在后台 · 计分暂停');
                if (!await Front.wait()) {
                    if (!searching || stale()) return;
                    stop(true);
                    UI.status('长时间在后台 · 已停止');
                    return;
                }
                if (!searching || stale()) return;
                UI.status('已回到前台');
            }
            await ensureSnapshot();
            if (!searching || stale()) return;
            await waitFor(resultsSettled);
            await scrollResults();
            if (pendBefore > 0) {
                const before = pendBefore;
                pendBefore = 0;
                await waitFor(() => Score.refresh() > 0, 5000);
                const got = Score.record(before);
                UI.status(got > 0 ? `积分 +${got} · 今日 ${Score.today}` : `未加分 · 连续 ${Score.miss} 次`);
            }
            const quotaDone = !!Board.search && Board.search.current >= Board.search.total;
            const task = Board.todo().find(t => t.url && Board.tries(t) < 3) || null;
            const blank = !Board.search && !Board.activity && !Board.todo().length;
            const over = () => { stop(true); UI.status(`已达轮次上限 ${cfg.maxRounds}`); };
            if (task) {
                if (++rounds > cfg.maxRounds) return over();
                await doTask(task);
                continue;
            }
            const quota = Board.search && !quotaDone;
            if (!quota && (!cfg.activeEnabled || Score.done())) return finish(blank);
            const term = Query.pick();
            if (!term) { stop(true); UI.status('搜索词已用尽'); return; }
            if (++rounds > cfg.maxRounds) return over();
            if (quota) {
                UI.status(`配额搜索 · ${term}`);
            } else {
                const need = cfg.gapTicks - Math.floor((Date.now() - (Score.lastAt || 0)) / 5000);
                for (let i = 0; i < need; i++) { UI.countdown((need - i) * 5, '等待'); await Clock.sleep(5000); }
                UI.countdown(0);
                if (!searching || stale()) return;
                pendBefore = Score.value || 0;
                Score.countSearch();
                Daily.set(S.pend, 'b', pendBefore);
                UI.status(`搜索 · ${term} · 第 ${Score.count} 次`);
            }
            saveRun();
            if (await submit(term)) return;
        }
    }

    function finish(blank) {
        stop(true);
        if (Score.capped()) { UI.status('今日搜索分已到顶'); return; }
        if (cfg.activeEnabled && Score.today >= cfg.activeGoal) { UI.status(`已达目标 ${cfg.activeGoal} 分`); return; }
        if (blank) { UI.status(Side.read() ? '今日无可用项目' : '侧栏未响应或未登录'); return; }
        UI.toast();
        UI.status(`今日完成 · 积分 ${Score.value}`);
    }

    async function doTask(task) {
        const sig = () => JSON.stringify([Board.search, Board.activity, Board.checkin, Board.dailySet, Board.todo().length, Score.value]);
        const before = sig();
        Board.attempts[Board.key(task)] = Board.tries(task) + 1;
        Daily.set(S.tries, 'c', Board.attempts);
        UI.status(`任务 ${task.name}${task.points ? ` +${task.points}` : ''} · 第 ${Board.tries(task)} 次`);
        Side.askClick(task);
        const tab = openTab(task.url); let ok = false;
        const until = Date.now() + 60000;
        while (Date.now() < until && searching) {
            await Clock.sleep(5000);
            if (stale()) break;
            await collect();
            const now = Board.tasks.find(x => Board.key(x) === Board.key(task));
            if (sig() !== before || (now && now.status === 'done')) { ok = true; break; }
        }
        Side.askClick(null);
        try { if (tab && !tab.closed) tab.close(); } catch (e) {}
        UI.status(ok ? `任务到账 · ${task.name}` : `任务未到账 · ${task.name}`);
        saveRun();
    }

    function resultsSettled() {
        const box = document.querySelector('#b_results');
        if (!box) return true;
        if (box.querySelector('li.b_algo, li.b_ans')) return true;
        return /没有找到|No results/i.test(box.textContent || '');
    }

    async function scrollResults() {
        if (!document.querySelector('#b_results')) return;
        const doc = document.documentElement;
        for (let i = 0; i < 4; i++) {
            if (window.scrollY >= doc.scrollHeight - window.innerHeight - 40) break;
            window.scrollBy(0, Math.round(window.innerHeight * 0.8));
            await Clock.sleep(100);
        }
    }

    function openTab(url) {
        try { return GM_openInTab(url, { active: true, insert: true, setParent: true }); }
        catch (e) { return null; }
    }

    function isLoggedIn() {
        if (document.querySelector('#id_n')) return true;
        const btn = document.querySelector('#id_l');
        if (btn) {
            const name = (btn.getAttribute('title') || btn.getAttribute('aria-label') || '').trim();
            if (name && name !== '登录' && name.toLowerCase() !== 'sign in') return true;
        }
        return /\d/.test((document.querySelector('.points-container') || {}).textContent || '');
    }

    function saveRun() { Store.set(S.run, { searching, progress, tasks: Board.tasks, rounds, at: Date.now() }); }
    function clearRun() { Store.del(S.run); }

    function readRun() {
        const v = Store.get(S.run, null);
        return v && v.searching && Date.now() - (v.at || 0) < 60000 ? v : null;
    }

    function start(fresh) {
        searching = true;
        if (fresh) rounds = 0;
        UI.start(true);
        Lock.take();
        UI.status('已启动');
        saveRun();
        run();
    }

    function stop(keep) {
        if (stale()) return;
        searching = false;
        rounds = 0;
        UI.countdown(0);
        clearRun();
        Lock.drop();
        UI.start(false);
        UI.progress();
        if (!keep) UI.status('已停止');
    }

    function restore() {
        const s = readRun();
        if (!s) { clearRun(); return false; }
        Object.assign(progress, s.progress || {});
        rounds = s.rounds || 0;
        if (Array.isArray(s.tasks) && s.tasks.length) { Board.tasks = s.tasks; UI.tasks(Board.tasks); }
        UI.progress();
        if (progress.completed && !Board.todo().length && (!cfg.activeEnabled || Score.done())) {
            UI.status('今日已完成');
            clearRun();
        } else {
            searching = true;
            UI.start(true);
            Lock.take();
            run();
        }
        return true;
    }

    const STYLE = `
#rw-panel {
    --bg:#fff; --fg:#16191d; --mut:#6b7480; --line:#e3e7ec; --soft:#f4f6f9;
    --brand:#0b57d0; --brand-soft:#eaf1fd; --ok:#1a7f37; --bad:#c5221f; --on:#fff;
    --font:-apple-system,"Segoe UI","Microsoft YaHei",system-ui,sans-serif;
    --pad:12px; --pill:99px; --r:7px;
    position:fixed; z-index:10000; top:60px; right:16px; width:264px; user-select:none;
    background:var(--bg); color:var(--fg); border:1px solid var(--line); border-radius:14px;
    box-shadow:0 6px 20px -8px rgba(20,30,50,.22); font:12px/1.45 var(--font);
    transition:top .2s,right .2s,transform .2s,box-shadow .2s;
}
#rw-panel.rw-dark {
    --bg:#202327; --fg:#e8eaed; --mut:#9aa3ad; --line:#34383d; --soft:#2a2e33; --on:#10131a;
    --brand:#8ab4f8; --brand-soft:rgba(138,180,248,.14); --ok:#7cc794; --bad:#ee9190;
    box-shadow:0 6px 20px -8px rgba(0,0,0,.6);
}
:where(#rw-panel) * { box-sizing:border-box; margin:0; padding:0; }
:where(#rw-panel) i { font-style:normal; }
#rw-panel::before {
    content:''; position:absolute; top:-5px; right:calc(var(--caret,24px) - 5px); width:9px; height:9px;
    background:var(--bg); border-top:1px solid var(--line); border-left:1px solid var(--line); transform:rotate(45deg);
}
#rw-panel.rw-shift { transform:translateX(calc(-1 * var(--shift,0px))); }
#rw-panel.rw-collapsed { width:max-content; max-width:min(70vw,420px); border-radius:var(--pill); box-shadow:0 2px 10px -4px rgba(20,30,50,.3); }
#rw-panel.rw-collapsed.rw-dark { box-shadow:0 2px 10px -4px rgba(0,0,0,.7); }
#rw-panel.rw-collapsed::before, #rw-panel.rw-collapsed .rw-fold { display:none; }
#rw-panel.rw-collapsed .rw-head { padding:3px 5px 3px 11px; gap:6px; }
#rw-panel.rw-collapsed .rw-tag { max-width:46vw; overflow:hidden; text-overflow:ellipsis; }

.rw-head { display:flex; align-items:center; gap:7px; padding:9px 9px 9px var(--pad); }
.rw-name { flex:1; font-weight:600; white-space:nowrap; }
.rw-tag, .rw-unit, .rw-goal, .rw-task-status, .rw-empty, .rw-status { color:var(--mut); }
.rw-led { width:7px; height:7px; border-radius:50%; background:var(--mut); opacity:.4; flex:none; }
.rw-led.live { background:var(--brand); opacity:1; animation:rw-pulse 1.2s ease-in-out infinite; }
.rw-led.ok { background:var(--ok); opacity:1; }
@keyframes rw-pulse { 50% { opacity:.25; } }
.rw-tag { font-size:10.5px; background:var(--soft); padding:2px 7px; border-radius:var(--pill); white-space:nowrap; }
.rw-i { width:24px; height:24px; flex:none; border:0; border-radius:var(--r); background:none; color:var(--mut); font-size:13px; line-height:1; cursor:pointer; }
.rw-i:hover { color:var(--fg); background:var(--soft); }

.rw-body { padding:0 var(--pad) 11px; }
.rw-metrics { display:flex; align-items:flex-end; gap:10px; }
.rw-pts { font-size:27px; font-weight:600; line-height:1.05; font-variant-numeric:tabular-nums; }
.rw-unit { font-size:11px; margin-left:3px; }
.rw-goal { margin-left:auto; text-align:right; font-size:10.5px; line-height:1.35; }
.rw-goal b { display:block; font-size:14px; font-weight:600; color:var(--fg); font-variant-numeric:tabular-nums; }
.rw-bar { height:3px; margin:9px 0 8px; border-radius:var(--pill); background:var(--soft); overflow:hidden; }
.rw-bar i { display:block; height:100%; width:0; background:var(--brand); transition:width .45s cubic-bezier(.22,1,.36,1); }
.rw-status { min-height:32px; font-size:11.5px; }
.rw-cd { display:none; margin-top:5px; width:max-content; padding:2px 8px; border-radius:var(--pill); font-size:10.5px; font-weight:600; color:var(--brand); background:var(--brand-soft); }

.rw-tasks { margin-top:9px; padding-top:9px; border-top:1px solid var(--line); max-height:150px; overflow-y:auto; }
.rw-task { display:flex; align-items:center; gap:8px; padding:3px 0; font-size:11.5px; }
.rw-task .rw-led { opacity:1; }
.rw-task.todo .rw-led { background:var(--bad); }
.rw-task.done .rw-led { background:var(--ok); }
.rw-task.locked .rw-led { background:var(--mut); opacity:.45; }
.rw-task.todo { cursor:pointer; }
.rw-task.todo:hover .rw-task-name { color:var(--brand); }
.rw-task-name { flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rw-task.done .rw-task-name { color:var(--mut); }
.rw-task-status { flex:none; font-size:10.5px; font-variant-numeric:tabular-nums; }
.rw-empty { font-size:11.5px; padding:4px 0; }

.rw-cfg { display:none; margin-top:9px; padding-top:9px; border-top:1px solid var(--line); font-size:11px; }
#rw-panel.rw-cfg-open .rw-cfg { display:block; }
.rw-cfg label { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:3px 0; }
.rw-cfg input { width:52px; padding:3px 6px; text-align:right; font:inherit; color:var(--fg); background:none; border:1px solid var(--line); border-radius:var(--r); outline:none; font-variant-numeric:tabular-nums; }
.rw-cfg input:focus { border-color:var(--brand); }
.rw-cfg input[type=checkbox] { width:auto; }

.rw-foot { display:flex; gap:7px; padding:0 var(--pad) var(--pad); }
.rw-go { flex:1; height:34px; border:0; border-radius:var(--pill); cursor:pointer; background:var(--brand); color:var(--on); font-size:12.5px; font-weight:600; }
.rw-go:hover { filter:brightness(1.06); }
.rw-go.stop { background:var(--bad); color:#fff; }

#rw-toast { position:fixed; bottom:24px; left:50%; transform:translateX(-50%); z-index:10001; max-width:460px;
    display:flex; align-items:center; gap:14px; padding:11px 14px; background:#22262b; color:#f2f4f7;
    border-radius:11px; box-shadow:0 8px 26px rgba(0,0,0,.3); font:12px/1.5 var(--font); }
#rw-toast > div { flex:1; }
#rw-toast strong { display:block; font-size:12.5px; font-weight:600; }
#rw-toast em { display:block; font-size:11.5px; font-style:normal; color:#aab2bc; }
#rw-toast button { flex:none; padding:6px 11px; border:0; border-radius:var(--pill); background:none; color:#8ab4f8; font-size:11.5px; font-weight:600; cursor:pointer; }
`;

    const $ = id => document.getElementById(id);
    function el(tag, cls, text) {
        const n = document.createElement(tag);
        if (cls) n.className = cls;
        if (text !== undefined) n.textContent = text;
        return n;
    }

    const UI = {
        status(msg) {
            const led = $('rw-led');
            if (led) {
                led.classList.toggle('live', searching && !progress.completed);
                led.classList.toggle('ok', progress.completed);
            }
            const s = $('rw-status');
            if (s) s.textContent = msg;
            console.log('[Rewards]', msg);
        },
        countdown(sec, action) {
            const cd = $('rw-cd');
            if (!cd) return;
            cd.textContent = sec > 0 ? `${action} ${sec}s` : '';
            cd.style.display = sec > 0 ? 'block' : 'none';
        },
        start(on) {
            const b = $('rw-go');
            if (!b) return;
            b.textContent = on ? '停止' : '开始';
            b.classList.toggle('stop', on);
        },
        progress() {
            const pts = $('rw-pts'), val = $('rw-progress');
            if (!pts || !val) return;
            pts.textContent = Score.value > 0 ? Score.value.toLocaleString('zh-CN') : '—';
            const useScore = cfg.activeEnabled && cfg.activeGoal > 0; const label = $('rw-goal-label');
            if (label) label.textContent = useScore ? `搜索分 / ${cfg.activeGoal}` : '每日配额';
            val.textContent = useScore ? Score.today
                : (progress.total ? `${progress.current}/${progress.total}` : '—');
            const bar = document.querySelector('#rw-bar i');
            if (bar) {
                const pct = useScore ? Score.today / cfg.activeGoal * 100
                    : (progress.total ? progress.current / progress.total * 100 : 0);
                bar.style.width = Math.min(100, Math.max(0, pct)) + '%';
            }
        },
        tasks(list) {
            const box = $('rw-list'), sum = $('rw-tag');
            if (!box || !sum) return;
            const left = (list || []).filter(t => t.status === 'todo' && !t.locked).length;
            sum.textContent = (!list || !list.length) ? '无任务' : left ? `${left} 项待办` : '已完成';
            if (Board.checkin) sum.textContent += ` · 签到 ${Board.checkin.current}/${Board.checkin.total}`;
            box.textContent = '';
            if (!list || !list.length) { box.appendChild(el('div', 'rw-empty', '今日没有可执行的任务')); return; }
            list.forEach(t => {
                const locked = !!t.locked, done = t.status !== 'todo', tried = Board.tries(t);
                const row = el('div', `rw-task ${locked ? 'locked' : done || tried ? 'done' : 'todo'}`);
                row.title = `${t.name}${t.points ? ` +${t.points}` : ''} · ${locked ? '等级受限' : tried ? `已尝试 ${tried} 次` : done ? '已完成' : '未完成'}`;
                row.append(
                    el('i', 'rw-led'),
                    el('span', 'rw-task-name', t.name),
                    el('span', 'rw-task-status', locked ? '受限' : done ? '已完成' : tried ? `尝试 ${tried}` : t.points ? `+${t.points}` : '未完成')
                );
                if (!done && !locked && t.url) {
                    row.addEventListener('click', () => { openTab(t.url); UI.status(`已打开 ${t.name}`); });
                }
                box.appendChild(row);
            });
        },
        toast() {
            const old = $('rw-toast');
            if (old) old.remove();
            const box = el('div'); box.id = 'rw-toast';
            const text = el('div');
            text.append(el('strong', null, '今日完成'), el('em', null, `配额已清空 · 积分 ${Score.value}`));
            const close = el('button', null, '关闭');
            close.onclick = () => box.remove();
            box.append(text, close);
            document.body.appendChild(box);
            setTimeout(() => box.remove(), 5000);
        },
        place() {
            const panel = $('rw-panel');
            if (!panel) return;
            const med = document.querySelector('#rh_rwm, .points-container');
            if (med) {
                const r = med.getBoundingClientRect(); const vw = document.documentElement.clientWidth;
                if (r.bottom > 0) {
                    panel.style.top = Math.round(r.bottom + (panel.classList.contains('rw-collapsed') ? 4 : 9)) + 'px';
                    panel.style.right = Math.round(vw - r.right) + 'px';
                    panel.style.setProperty('--caret', Math.round(r.width / 2) + 'px');
                }
            }
            const side = [...document.querySelectorAll('iframe')]
                .find(f => f.id !== 'rw-frame' && /rewards\.bing\.com\/flyout|panelflyout/i.test(f.src || ''));
            if (side) panel.style.setProperty('--shift', Math.round(side.getBoundingClientRect().width + 12) + 'px');
            panel.classList.toggle('rw-shift', !!side);
        },
        dark() {
            const panel = $('rw-panel');
            if (!panel) return;
            const cls = document.documentElement.className + ' ' + (document.body ? document.body.className : '');
            const dark = /(^|\s)b_dark(\s|$)/.test(cls) ||
                document.documentElement.getAttribute('data-darkmode') === 'true' ||
                (!document.body && matchMedia('(prefers-color-scheme: dark)').matches);
            panel.classList.toggle('rw-dark', dark);
        },
        fold() {
            folded = !folded;
            Store.set(S.fold, folded);
            const panel = $('rw-panel');
            if (panel) panel.classList.toggle('rw-collapsed', folded);
            const b = $('rw-fold');
            if (b) { b.textContent = folded ? '⌄' : '⌃'; b.title = folded ? '展开' : '收起'; }
            UI.place();
        },
        build() {
            if ($('rw-panel')) return;
            if (!$('rw-style')) {
                const st = document.createElement('style');
                st.id = 'rw-style'; st.textContent = STYLE;
                document.head.appendChild(st);
            }
            const panel = el('div'); panel.id = 'rw-panel';
            if (folded) panel.classList.add('rw-collapsed');
            const tag = el('span', 'rw-tag', '加载中'); tag.id = 'rw-tag';
            const fold = el('button', 'rw-i', folded ? '⌄' : '⌃'); fold.id = 'rw-fold';
            fold.title = folded ? '展开' : '收起'; fold.onclick = UI.fold;
            const refresh = el('button', 'rw-i', '⟳');
            refresh.title = '重新读取侧栏'; refresh.onclick = () => collect().then(() => UI.status('侧栏已刷新'));
            const led = el('i', 'rw-led'); led.id = 'rw-led';
            const head = el('div', 'rw-head');
            head.append(led, el('span', 'rw-name', 'Rewards 助手'), tag, refresh, fold);
            const pts = el('b', 'rw-pts', '—'); pts.id = 'rw-pts';
            const ptsBox = el('div');
            ptsBox.append(pts, el('i', 'rw-unit', '积分'));
            const prog = el('b', null, '—'); prog.id = 'rw-progress';
            const label = el('span', null, '每日配额'); label.id = 'rw-goal-label';
            const goal = el('div', 'rw-goal');
            goal.append(prog, label);
            const metrics = el('div', 'rw-metrics');
            metrics.append(ptsBox, goal);
            const bar = el('div', 'rw-bar'); bar.id = 'rw-bar';
            bar.appendChild(el('i'));
            const status = el('p', 'rw-status'); status.id = 'rw-status';
            const cd = el('p', 'rw-cd'); cd.id = 'rw-cd';
            const list = el('div', 'rw-tasks'); list.id = 'rw-list';
            const body = el('div', 'rw-body rw-fold');
            body.append(metrics, bar, status, cd, list);
            const cfgBox = el('div', 'rw-cfg rw-fold');
            const row = (text, key, attrs) => {
                const label = el('label', null, text); const input = document.createElement('input');
                Object.assign(input, attrs);
                if (attrs.type === 'checkbox') input.checked = !!cfg[key];
                else input.value = cfg[key];
                input.addEventListener('change', () => {
                    cfg[key] = attrs.type === 'checkbox' ? input.checked
                        : Math.max(attrs.min || 1, parseInt(input.value) || cfg[key]);
                    if (attrs.type !== 'checkbox') input.value = cfg[key];
                    Store.set(S.cfg, cfg);
                    UI.progress();
                });
                label.appendChild(input);
                cfgBox.appendChild(label);
            };
            row('轮次上限', 'maxRounds', { type: 'number', min: 5, max: 300 });
            row('主动搜索', 'activeEnabled', { type: 'checkbox' });
            row('目标分', 'activeGoal', { type: 'number', min: 0, max: 90 });
            const go = el('button', 'rw-go', '开始'); go.id = 'rw-go';
            go.onclick = () => {
                if (searching) stop();
                else if (!isLoggedIn()) UI.status('未登录 · 无法计分');
                else start(true);
            };
            const gear = el('button', 'rw-i', '⚙');
            gear.title = '设置'; gear.onclick = () => panel.classList.toggle('rw-cfg-open');
            const foot = el('div', 'rw-foot rw-fold');
            foot.append(go, gear);
            panel.append(head, body, cfgBox, foot);
            document.documentElement.appendChild(panel);
            UI.dark();
            UI.place();
            UI.progress();
        }
    };

    function init() {
        if (init._done) return;
        init._done = true;
        console.log('[Rewards] 已加载');
        const saved = Store.get(S.cfg, {});
        Object.keys(cfg).forEach(k => { if (typeof saved[k] === typeof cfg[k]) cfg[k] = saved[k]; });
        folded = Store.get(S.fold, false) === true;
        Board.attempts = Daily.get(S.tries, 'c', {});
        Query.load();
        Score.load();
        pendBefore = Daily.get(S.pend, 'b', 0);
        UI.build();
        Board.preRender();
        if (/PUBL=RewardsDO|FORM=tgrew4|[?&]OCID=ML2/i.test(location.search)) browseLanding();
        const refresh = () => { UI.dark(); UI.place(); Score.refresh(); };
        const mo = new MutationObserver(refresh);
        mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'data-darkmode'] });
        if (document.body) mo.observe(document.body, { attributes: true, attributeFilter: ['class'] });
        new MutationObserver(() => Score.refresh()).observe(document.documentElement,
            { childList: true, subtree: true, characterData: true });
        new MutationObserver(() => { if (!$('rw-panel')) UI.build(); }).observe(document.documentElement, { childList: true });
        matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh);
        window.addEventListener('resize', UI.place);
        window.addEventListener('pagehide', () => { window.__rwLeaving = true; Lock.drop(); });
        afterHeader();
    }

    async function afterHeader() {
        const resuming = !!readRun();
        const ok = await waitFor(() => document.querySelector('#rh_rwm, .points-container'), resuming ? 1000 : 5000);
        if (!ok && !resuming) { UI.status('未检测到积分徽章'); return; }
        Score.refresh();
        if (Lock.other()) { UI.status('其他标签页在运行'); return; }
        if (restore()) return;
        await collect();
        Score.refresh();
        UI.status(progress.completed ? '今日完成' : '待命');
    }

    if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', init);
    else init();
})();
