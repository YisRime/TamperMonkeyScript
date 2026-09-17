// ==UserScript==
// @name         Unredirect All 外链净化
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.1
// @author       YisRime
// @description  【提交 Issue 以扩充网站支持】自动清理各大网站链接中的追踪参数。
// @match        *://*/*
// @run-at       document-start
// @grant        unsafeWindow
// @license      AGPLv3
// ==/UserScript==

(() => {
  "use strict";

  const scope = typeof unsafeWindow !== "undefined" ? unsafeWindow : window;
  const host = scope.location.hostname;

  const params = new Set([
    "gclid", "dclid", "_ga", "gclsrc", "fbclid", "fbadid", "fb_action_ids", "igshid", "embed_host_url",
    "actionsource", "shreddit", "correlation_id", "original_referer", "upsellorderorigin", "trackingid",
    "midtoken", "refid", "from", "source", "ref", "brand", "feature", "adtag", "msclkid",
    "mc_cid", "mc_eid", "_hsenc", "_hsmi", "yclid", "snr", "alias", "vd_source", "curator_clanid",
    "redir", "sprefix", "u1", "ascsubtag", "asc_refurl", "asc_campaign", "qq-pf-to", "cmnhd_ref",
    "irgwc", "mpid", "irclickid", "intlreferer", "pckg_id", "imp_id"
  ]);

  const pattern = /^(utm_|spm|scm|from_|ref_|track|trk|share_|embeds_|refer_|experiment_)/i;
  const keys = ["target", "url", "dest", "destination", "link", "redirect", "to", "target_url", "u", "goto", "pfurl", "dltype"];
  const redirectKeys = ["q", ...keys];

  const REDIRECT_HOST_RE = /^(link|jump|out|redirect|tra|l)\./i;
  const REDIRECT_PATH_RE = /^\/(link|jump|redirect|safecheck|out|url)($|\/)/i;

  const rules = [
    {
      match: /(^|\.)(bilibili|biligame)\.com$|(^|\.)b23\.tv$/,
      params: new Set(["hotrank", "launch_id", "popular_rank", "session_id", "business", "sort_field", "is_room_feed", "visit_id", "broadcast_type", "p2p_type", "event_source_type", "share_plat", "share_tag", "share_session_id", "noreffer", "extra_jump_from", "is_preview", "spm_id_from", "from_source", "from_spmid", "csource", "bsource", "dynamicspm_id_from", "lottery_id", "seid", "-abrowser", "jumplinktype", "plat_id", "share_medium", "_from"]),
      strip(el) {
        ["data-mod", "data-spmid", "data-idx", "data-target-url"].forEach(attr => el.removeAttribute(attr));
        const addr = el.getAttribute("data-url");
        if (addr && /^https?:\/\//i.test(addr)) {
          el.href = clean(addr);
          el.removeAttribute("data-url");
          el.classList.remove("jump-link");
        }
      }
    },
    {
      match: /(^|\.)(taobao|tmall|alibaba|1688|aliexpress|fliggy|jiyoujia|lazada|trendyol|tb)\.[a-z.]{2,10}$/,
      params: new Set(["scm2", "stats_click", "initiative_id", "suggest", "suggest_query", "icontype", "traceid", "relationid", "bxsign", "utparam", "eurl", "lwfrom", "x5referer", "pvid", "pvid2", "union_lens", "scene", "topofferids", "cms_id", "cosite", "shareuniqueid", "clicktrackinfo", "data_prefetch", "prefetch_replace"]),
      regex: /^(ref|wh_|wx_|ali_)/i
    },
    {
      match: /(^|\.)baidu\.com$/,
      params: new Set(["rsv_idx", "hisfilter", "rsf", "rsv_pq", "rsv_t", "qid", "rsv_dl", "oq", "usm", "fenlei", "rqid", "rqlang", "wfr", "eqid", "_at_", "sa", "pd", "tag_key", "frommodule", "rsv_enter", "rsv_btype", "prefixsug", "share_from", "tb_mod", "is_video", "rs_src", "rsv_page", "dytabstr", "bsst", "lid", "rsv_spt", "rsv_bp", "f", "tn", "rsp", "topic_name", "frwh", "obj_id", "fid", "fname", "_wkts_"]),
      purge(target) { if (target.hostname === "zhidao.baidu.com" && target.pathname === "/q") target.pathname = "/search"; }
    },
    {
      match: /(^|\.)amazon\.[a-z.]{2,10}$/,
      params: new Set(["content-id", "crid", "pd_rd_r", "pd_rd_w", "pd_rd_wg", "pf_rd_r", "pf_rd_p", "qid", "sbo", "plattr", "ld", "_encoding", "isamazonfulfilled"]),
      regex: /^(ref|pd_rd_|pf_rd_|sc_)/i,
      purge(target) { const idx = target.pathname.search(/\/ref(=|\/|$)/i); if (idx !== -1) target.pathname = target.pathname.slice(0, idx); }
    },
    {
      match: /(^|\.)(microsoft|bing|xbox|skype|office|microsoft365|msn)\.(com|cn)$/,
      params: new Set(["ocid", "icid", "form", "cvid", "wreply", "cobrandid", "wt.mc_id", "activetab", "clcid", "deeplink", "feed_filter_source", "uiflavor"])
    },
    {
      match: /(^|\.)(jd|yangkeduo)\.com$/,
      params: new Set(["gx", "ad_od", "needrecommendflag", "uabt", "pvid", "jxsid", "csid", "scan_orig", "sceneval", "pxq_secret_key", "cpssignjb_act", "launch_pdd", "duoduo_type", "goods_sign"]),
      regex: /^(wxa_|_oak_|_wv|_x_)/i
    },
    { match: /(^|\.)csdn\.net$/, params: new Set(["ops_request_misc", "request_id", "biz_id", "ydreferer", "usp"]) },
    { match: /(^|\.)(steampowered|steamcommunity|hoyolab|hoyoverse|mihoyo)\.com$/, params: new Set(["game_version", "visit_device", "device_type", "plat_type"]), regex: /^(hyl_|bbs_|mhy_)|_from$/i },
    { match: /(^|\.)(douyin|tiktok)\.com$/, params: new Set(["enter_from", "enter_method", "focus_method", "sender_device", "is_from_webapp", "web_id", "previous_page", "extra_params", "gid"]) },
    { match: /(^|\.)(youtube\.com|youtu\.be)$/, params: new Set(["si", "embeds_referring_euri", "source_ve_path", "ab_channel", "app", "pp", "enablejsapi", "widgetid", "redir_token"]) },
    { match: /(^|\.)(google\.[a-z.]{2,10}$|about\.google)$/, params: new Set(["ved", "ei", "sca_esv", "visit_id", "sig", "pcampaignid", "dest_src", "subid"]) },
    {
      match: /(^|\.)(zhihu|weibo|douban|ebay|github|music\.apple|dzen\.ru|bluestacks|twitter|x)\.[a-z.]{2,10}$/,
      params: new Set(["s", "t", "search_source", "hybrid_search_source", "hybrid_search_extra", "mark_id", "sudaref", "band_rank", "target_user_id", "dcs", "dcm", "dt_time_source", "_trkparms", "_trksid", "amdata", "itmprp", "itmmeta", "ref_cta", "ref_loc", "ref_page", "at", "itscg", "itsct", "client_uuid", "app_pkg", "first_landing_page", "issue_tld", "feed_exp"]),
      regex: /^(device_|_version$)/i,
      strip(el) { const exp = el.getAttribute("data-expanded-url"); if (exp && /^https?:\/\//i.test(exp)) el.href = clean(exp); }
    }
  ];

  const currentHostRule = rules.find(entry => entry.match.test(host));

  const valid = str => {
    if (!str || typeof str !== "string" || !/^https?:\/\//i.test(str)) return false;
    try { return ["http:", "https:"].includes(new URL(str).protocol); } catch { return false; }
  };

  const decode = value => {
    if (!value || typeof value !== "string") return null;
    try {
      let res = decodeURIComponent(value);
      if (valid(res)) return res;
      res = decodeURIComponent(res);
      if (valid(res)) return res;
    } catch {}
    if (value.length >= 16 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
      try {
        let base = value.replace(/-/g, "+").replace(/_/g, "/");
        base = base.padEnd((base.length + 3) & ~3, "=");
        const text = new TextDecoder().decode(Uint8Array.from(atob(base), c => c.charCodeAt(0)));
        if (valid(text)) return text;
      } catch {}
    }
    return null;
  };

  const isTracker = (key, rule) => {
    const k = key.toLowerCase();
    return params.has(k) || pattern.test(key) || (rule && ((rule.params && rule.params.has(k)) || (rule.regex && rule.regex.test(key))));
  };

  function clean(source, depth = 0) {
    if (!source || typeof source !== "string" || depth > 3) return source;
    const trimmed = source.trim();

    if (!/^https?:\/\//i.test(trimmed)) return trimmed.startsWith("//") ? clean(`https:${trimmed}`, depth) : source;

    let parsed;
    try { parsed = new URL(trimmed); } catch { return source; }

    if (parsed.searchParams.size === 1) {
      const [first, empty] = parsed.searchParams.entries().next().value;
      if (!empty) {
        const inner = decode(first);
        if (inner && inner !== trimmed) return clean(inner, depth + 1);
      }
    }

    const redirected = REDIRECT_HOST_RE.test(parsed.hostname) || REDIRECT_PATH_RE.test(parsed.pathname)
      || (parsed.pathname === "/url" && parsed.hostname.includes("google."))
      || (parsed.pathname === "/redirect" && parsed.hostname.includes("youtube."));

    const fieldKeys = redirected ? redirectKeys : keys;
    for (const key of fieldKeys) {
      const rawVal = parsed.searchParams.get(key);
      if (rawVal) {
        const extracted = decode(rawVal);
        if (extracted && extracted !== trimmed) return clean(extracted, depth + 1);
      }
    }

    const matched = rules.find(item => item.match.test(parsed.hostname));

    for (const key of [...parsed.searchParams.keys()]) {
      if ((key === "u" && parsed.hostname === "passport.baidu.com") || (key === "kw" && parsed.hostname.includes("tieba.baidu.com"))) continue;

      if (isTracker(key, matched)) {
        parsed.searchParams.delete(key);
      } else {
        const val = parsed.searchParams.get(key);
        if (val && (val.startsWith("http") || val.includes("%"))) {
          try {
            const nested = decodeURIComponent(val);
            if (valid(nested)) {
              const sanitized = clean(nested, depth + 1);
              if (sanitized !== nested) parsed.searchParams.set(key, sanitized);
            }
          } catch {}
        }
      }
    }

    const qIdx = parsed.hash.indexOf("?");
    if (qIdx !== -1) {
      const base = parsed.hash.slice(0, qIdx);
      const search = new URLSearchParams(parsed.hash.slice(qIdx + 1));
      let changed = false;
      for (const item of [...search.keys()]) {
        if (isTracker(item, matched)) {
          search.delete(item);
          changed = true;
        }
      }
      if (changed) {
        const qs = search.toString();
        parsed.hash = qs ? `${base}?${qs}` : base;
      }
    }

    if (matched?.purge) matched.purge(parsed);
    return parsed.href;
  }

  const cleanUrl = url => {
    if (!url || typeof url !== "string") return url;
    try {
      const resolved = new URL(url, scope.location.href);
      const purified = clean(resolved.href);
      if (purified === resolved.href) return url;
      return (url.startsWith("/") || url.startsWith("?")) ? purified.slice(resolved.origin.length) : purified;
    } catch {
      return clean(url);
    }
  };

  const scrub = text => typeof text === "string" ? text.replace(/https?:\/\/[^\s\u4e00-\u9fa5'"<>）】]+/g, match => {
    const trailing = match.match(/[.,!?:;）)\]]+$/);
    return trailing ? clean(match.slice(0, -trailing[0].length)) + trailing[0] : clean(match);
  }) : text;

  function sanitize(el) {
    if (!el || typeof el.getAttribute !== "function") return;
    if (el.hasAttribute("ping")) el.removeAttribute("ping");

    const raw = el.getAttribute("href");
    if (!raw || raw[0] === "#" || /^(javascript|mailto|tel):/i.test(raw) || el.dataset.ulpHref === raw) return;

    const fullUrl = el.href?.animVal ?? el.href ?? raw;
    const purified = cleanUrl(fullUrl);
    el.dataset.ulpHref = raw;

    if (purified !== fullUrl) {
      if (el.href?.animVal !== undefined) el.setAttribute("href", purified);
      else el.href = purified;
    }

    if (currentHostRule?.strip) currentHostRule.strip(el);
  }

  const handle = event => {
    const target = event.composedPath?.().find(el => el.matches?.("a[href], area[href]")) || event.target?.closest?.("a[href], area[href]");
    if (target) sanitize(target);
  };

  ["pointerdown", "focusin", "contextmenu"].forEach(event => document.addEventListener(event, handle, { capture: true, passive: true }));
  document.addEventListener("submit", event => { if (event.target?.action) event.target.action = cleanUrl(event.target.action); }, { capture: true, passive: true });

  document.addEventListener("copy", event => {
    const selection = scope.getSelection()?.toString()?.trim();
    if (selection) {
      const sanitized = scrub(selection);
      if (sanitized !== selection) {
        event.clipboardData.setData("text/plain", sanitized);
        event.preventDefault();
      }
    }
  }, true);

  const intercept = (target, method, index, mode = false) => {
    try {
      if (target && typeof target[method] === "function") {
        const invoke = target[method];
        target[method] = function (...args) {
          if (args[index] !== undefined && args[index] !== null) {
            args[index] = mode ? scrub(args[index]) : cleanUrl(String(args[index]));
          }
          return invoke.apply(this, args);
        };
      }
    } catch {}
  };

  intercept(scope.navigator?.clipboard, "writeText", 0, true);
  intercept(scope.history, "pushState", 2);
  intercept(scope.history, "replaceState", 2);

  if (typeof scope.open === "function") {
    const popup = scope.open;
    scope.open = function (url, ...extra) {
      return popup.call(this, url ? cleanUrl(String(url)) : url, ...extra);
    };
  }

  const cleanCurrentUrl = () => {
    const current = clean(scope.location.href);
    if (current !== scope.location.href) scope.history.replaceState(scope.history.state, "", current);
  };

  ["popstate", "hashchange"].forEach(e => scope.addEventListener(e, cleanCurrentUrl));
  cleanCurrentUrl();
})();