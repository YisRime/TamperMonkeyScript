// ==UserScript==
// @name         Redirect All 外链跳转
// @namespace    https://github.com/YisRime/TamperMonkeyScript
// @version      1.0.0
// @author       YisRime
// @description  【提交 Issue 以扩充网站支持】一键跳转各大网站的外链，已适配：知乎、简书、豆瓣、百度贴吧、YouTube、CSDN、掘金、哔哩哔哩、QQ（电脑端/移动端/邮箱）、微信（企业微信/阅读模板/开发者社区/安全确认/公众号）、Google、Steam、微博（移动版/网页版）、腾讯文档、腾讯兔小巢、腾讯问卷、腾讯云、Gitee、GitCode、开源中国、牛客网、百度百科、搜狗搜索、语雀、金山文档、石墨文档、飞书、酷安、少数派、爱发电、天眼查、企查查、爱企查、亿企查、阿里云（开发者社区/帮助中心/云栖社区）、Instagram、LinkedIn、Telegram、Epic、力扣、51CTO、洛谷、LINUX DO、NGA、NodeSeek、InfoQ、HelloGitHub、CNB、链滴、站长之家、优设网、网盘分享、PC6下载、YY语音、KOOK、机核网、森空岛、巴哈姆特、CurseForge、GameBanana、我的世界中文论坛、360个人图书馆、印象笔记、5ch、MC模组百科、Pixiv、ACGrip、开发者知识库、花瓣网、异次元软件、AtCoder、LaTeX开源社区、知更鸟、ABABTOOLS、URLShare、Zaker、喜格微、标志情报局、Unsafelink、TechLife、书签地球、蓝字团队等。
// @match        *://link.zhihu.com/*
// @match        *://www.jianshu.com/go-wild*
// @match        *://www.douban.com/link2*
// @match        *://tieba.baidu.com/mo/q/checkurl*
// @match        *://jump.bdimg.com/safecheck*
// @match        *://jump2.bdimg.com/safecheck*
// @match        *://www.youtube.com/redirect*
// @match        *://link.csdn.net/*
// @match        *://link.juejin.cn/*
// @match        *://game.bilibili.com/linkfilter*
// @match        *://www.bilibili.com/york/link-middle-page*
// @match        *://c.pc.qq.com/*
// @match        *://open.work.weixin.qq.com/wwopen/uriconfirm*
// @match        *://mp.weixin.qq.com/mp/readtemplate*
// @match        *://developers.weixin.qq.com/community/middlepage/href*
// @match        *://weixin110.qq.com/cgi-bin/mmspamsupport-bin/newredirectconfirmcgi*
// @match        *://mp.weixin.qq.com/s*
// @match        *://mail.qq.com/cgi-bin/readtemplate*
// @match        *://mail.qq.com/cgi-bin/mail_spam*
// @match        *://wx.mail.qq.com/xmspamcheck/xmsafejump*
// @match        *://docs.qq.com/scenario/link.html*
// @match        *://support.qq.com/products/*/link-jump*
// @match        *://support.qq.com/product/*/link-jump*
// @match        *://txc.qq.com/products/*/link-jump*
// @match        *://txc.qq.com/product/*/link-jump*
// @match        *://wj.qq.com/s2/*
// @match        *://cloud.tencent.com/developer/tools/blog-entry*
// @match        *://www.google.*/url*
// @match        *://steamcommunity.com/linkfilter*
// @match        *://weibo.cn/sinaurl*
// @match        *://t.cn/*
// @match        *://gitee.com/link*
// @match        *://link.gitcode.com/*
// @match        *://www.oschina.net/action/GoToLink*
// @match        *://hd.nowcoder.com/link.html*
// @match        *://www.baike.com/redirect_link*
// @match        *://m.sogou.com/*/tc*
// @match        *://m.sogou.com/tc*
// @match        *://*.yuque.com/r/goto*
// @match        *://www.kdocs.cn/office/link*
// @match        *://www.kdocs.cn/etapps/query/link*
// @match        *://shimo.im/outlink/*
// @match        *://security.feishu.cn/link/safety*
// @match        *://www.coolapk.com/link*
// @match        *://sspai.com/link*
// @match        *://niu.sspai.com/link*
// @match        *://afdian.com/link*
// @match        *://afdian.net/link*
// @match        *://ifdian.net/link*
// @match        *://www.tianyancha.com/security*
// @match        *://www.qcc.com/web/transfer-link*
// @match        *://aiqicha.baidu.com/safetip*
// @match        *://www.aiqicha.com/safetip*
// @match        *://developer.aliyun.com/redirect*
// @match        *://help.aliyun.com/redirect*
// @match        *://yq.aliyun.com/go/articleRenderRedirect*
// @match        *://www.instagram.com/linkshim*
// @match        *://www.linkedin.com/safety/go*
// @match        *://t.me/iv*
// @match        *://redirect.epicgames.com/*
// @match        *://leetcode.cn/link*
// @match        *://blog.51cto.com/transfer*
// @match        *://www.luogu.com.cn/paste/*
// @match        *://www.luogu.com.cn/discuss/*
// @match        *://www.luogu.com.cn/article/*
// @match        *://linux.do/*
// @match        *://bbs.nga.cn/read.php*
// @match        *://nga.178.com/read.php*
// @match        *://www.nodeseek.com/jump*
// @match        *://infoq.cn/link*
// @match        *://www.infoq.cn/link*
// @match        *://xie.infoq.cn/link*
// @match        *://hellogithub.com/periodical/statistics/click*
// @match        *://cnb.cool/goto*
// @match        *://cnb.cool/110*
// @match        *://link.ld246.com/forward*
// @match        *://www.chinaz.com/go.shtml*
// @match        *://link.uisdc.com/*
// @match        *://wpfx.org/go*
// @match        *://www.pc6.com/goread.html*
// @match        *://redir.yy.duowan.com/warning.php*
// @match        *://www.kookapp.cn/go-wild.html*
// @match        *://www.gcores.com/link*
// @match        *://www.skland.com/third-link*
// @match        *://ref.gamer.com.tw/redir.php*
// @match        *://www.curseforge.com/linkout*
// @match        *://gamebanana.com/linkfilter*
// @match        *://api.himcbbs.com/refer*
// @match        *://www.mczwlt.net/go-external*
// @match        *://forum.mczwlt.net/outgoing*
// @match        *://www.360doc.cn/outlink.html*
// @match        *://app.yinxiang.com/OutboundRedirect*
// @match        *://www.yiqicha.com/thirdPage*
// @match        *://jump.5ch.net/*
// @match        *://link.mcmod.cn/target*
// @match        *://www.pixiv.net/jump.php*
// @match        *://bbs.acgrip.com/*
// @match        *://www.itdaan.com/link*
// @match        *://www.360doc.com/content*
// @match        *://huaban.com/go*
// @match        *://www.iplaysoft.com/link*
// @match        *://atcoder.jp/jump*
// @match        *://ask.latexstudio.net/go/index*
// @match        *://zmingcx.com/go.html*
// @match        *://ababtools.com/*
// @match        *://google.urlshare.cn/umirror_url_check*
// @match        *://iphone.myzaker.com/zaker/link.php*
// @match        *://www.xgw4.com/qqdl.html*
// @match        *://link.logonews.cn/*
// @match        *://unsafelink.com/*
// @match        *://t.techlife.app/*
// @match        *://www.bookmarkearth.com/view*
// @match        *://blzxteam.com/gowild.htm*
// @run-at       document-start
// @grant        unsafeWindow
// @license      AGPLv3
// ==/UserScript==

const safeAtob = s => { try { return atob(s); } catch { return s; } };

const RULES = [
  { name: '知乎', match: 'link.zhihu.com', key: 'target' },
  { name: '简书', match: 'www.jianshu.com/go-wild', key: 'url' },
  { name: '豆瓣', match: 'www.douban.com/link2', key: 'url' },
  { name: 'YouTube', match: 'www.youtube.com/redirect', key: 'q' },
  { name: 'Instagram', match: 'www.instagram.com/linkshim', key: 'u' },
  { name: 'LinkedIn', match: 'www.linkedin.com/safety/go', key: 'url' },
  { name: 'Telegram', match: 't.me/iv', key: 'url' },
  { name: '百度贴吧', match: 'tieba.baidu.com/mo/q/checkurl', key: 'url' },
  { name: 'QQ·电脑端', match: /^c\.pc\.qq\.com\/(middle[mctb]|index)\.html/, key: 'pfurl' },
  { name: 'QQ·移动端', match: /^c\.pc\.qq\.com\/(pc|ios|android)\.html/, key: 'url' },
  { name: '微信·企业微信', match: 'open.work.weixin.qq.com/wwopen/uriconfirm', key: 'uri' },
  { name: '微信·阅读模板', match: 'mp.weixin.qq.com/mp/readtemplate', key: 'url' },
  { name: '微信·开发者社区', match: 'developers.weixin.qq.com/community/middlepage/href', key: 'href' },
  { name: '腾讯·兔小巢', match: /^(support|txc)\.qq\.com\/products?\/\d+\/link-jump/, key: 'jump' },
  { name: '腾讯·文档', match: 'docs.qq.com/scenario/link.html', key: ['url', 'u'] },
  { name: 'QQ·邮箱', match: ['mail.qq.com/cgi-bin/readtemplate', 'mail.qq.com/cgi-bin/mail_spam', 'wx.mail.qq.com/xmspamcheck/xmsafejump'], key: ['gourl', 'url'] },
  { name: 'Google', match: /^www\.google\..*\/url$/, key: ['url', 'q'] },
  { name: '微博·移动端', match: 'weibo.cn/sinaurl', key: ['toasturl', 'u'] },
  { name: '百度贴吧·安全检查', match: /^jump2?\.bdimg\.com\/safecheck/, dom: 'interactive', action: () => document.querySelector('.warning_info a[href], .btn[href]')?.href },
  { name: '腾讯·问卷', match: 'wj.qq.com/s2/', dom: 'interactive', action: () => document.addEventListener('click', e => { if (e.target.classList.contains('pe-link')) e.stopPropagation(); }, true) },
  { name: '微信·确认', match: 'weixin110.qq.com/cgi-bin/mmspamsupport-bin/newredirectconfirmcgi', dom: 'interactive', action: ({ query }) => {
    if (query.main_type === '2') return location.href.replace('main_type=2', 'main_type=1');
    const MAGIC_KEY = atob(atob("Tmpjek56ZGhNbUZrWWpRMFpURTNZekZpTUdGa1lqSTBZalZqWmpKaVpERXlZek0wWkRsaU5UWmxNRFpqWTJRMlpHUTBZekk1TVdJME1qTmlOV0prTjJabU5tUmhZbVJqTlRVM1l6azVNbVkxWkRZd1pEZzVNbUkyT0Rjd1pqYzBOakV3TldNM05HRmhNalJqTXpBMk0yUTNOR1ExT1dJMFlXVTFOVFF6WldJM1lqSmtObVUwT1dOak1qYzNNMkZsTVRjM01UWTNNemcwTmpRM04ySmpOalppTTJNelltUTNPVE5sWkRJNFpEZGhaVE5rTnpZeE0yUm1ZVGRpWW1ReQ=="));
    if (query.midpagecode && query.midpagecode !== MAGIC_KEY && !unsafeWindow?.cgiData?.url) {
      const url = new URL(location.href);
      url.searchParams.set("midpagecode", MAGIC_KEY);
      location.replace(url.href);
      return;
    }
    return document.querySelector('.weui-msg__desc, .weui-msg__text-area .ui-ellpisis-content p, .ui-ellpisis-content p')?.innerText;
  } },
  { name: '微信·公众号', match: /^mp\.weixin\.qq\.com\/s/, dom: 'interactive', action: () => {
    const accessMsg = document.getElementById('js_access_msg');
    if (accessMsg?.href) return accessMsg.href;
    window.addEventListener('click', e => { if (e.target.id === 'js_view_source' && unsafeWindow?.msg_source_url) { e.stopImmediatePropagation(); e.preventDefault(); window.open(unsafeWindow.msg_source_url); } }, true);
    const pattern = /https?:\/\/[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/g;
    document.querySelectorAll('#js_content section').forEach(sec => {
      if (sec.className?.includes('code-snippet')) return;
      (sec.innerText.match(pattern) || []).forEach(link => { if (!link.includes('127.0.0.1') && !link.includes('localhost')) sec.innerHTML = sec.innerHTML.replaceAll(link, `<a target="_blank" rel="noopener noreferrer" href="${link}">${link}</a>`); });
    });
    document.querySelectorAll('img[data-src]').forEach(img => { img.src = img.dataset.src; img.style.cssText = 'width:100%!important;height:auto!important;visibility:visible!important;'; });
  } },
  { name: '微博·网页端', match: 't.cn', dom: 'interactive', action: async () => {
    const el = document.querySelector('.wrap .link, .open-url a[href]');
    let raw = el?.href || el?.innerText;
    if (!raw) raw = await fetch(location.href).then(r => r.headers.get('location')).catch(() => null);
    if (!raw) return;
    const url = new URL(raw, location.origin);
    url.searchParams.delete('continueFlag');
    return url.href;
  } },
  { name: 'CSDN', match: 'link.csdn.net', key: 'target' },
  { name: '掘金', match: 'link.juejin.cn', key: 'target' },
  { name: 'Gitee', match: 'gitee.com/link', key: 'target' },
  { name: 'GitCode', match: 'link.gitcode.com', key: 'target' },
  { name: '开源中国', match: 'www.oschina.net/action/GoToLink', key: 'url' },
  { name: '牛客网', match: 'hd.nowcoder.com/link.html', key: 'target' },
  { name: 'HelloGitHub', match: 'hellogithub.com/periodical/statistics/click', key: 'target' },
  { name: 'NodeSeek', match: 'www.nodeseek.com/jump', key: 'to' },
  { name: 'InfoQ', match: /^(xie\.|www\.)?infoq\.cn\/link/, key: 'target' },
  { name: '腾讯云·社区', match: 'cloud.tencent.com/developer/tools/blog-entry', key: 'target' },
  { name: '阿里云·社区', match: 'developer.aliyun.com/redirect', key: 'target' },
  { name: '阿里云·帮助', match: 'help.aliyun.com/redirect', key: 'targetUrl' },
  { name: '阿里云·云栖', match: 'yq.aliyun.com/go/articleRenderRedirect', key: 'url' },
  { name: 'CNB', match: /^cnb\.cool\/(goto|110)/, key: 'url' },
  { name: '链滴', match: 'link.ld246.com/forward', key: 'goto' },
  { name: 'LaTeX 开源社区', match: 'ask.latexstudio.net/go/index', key: 'url' },
  { name: 'AtCoder', match: 'atcoder.jp/jump', key: 'url' },
  { name: '51CTO', match: 'blog.51cto.com/transfer', action: () => location.search.slice(1) },
  { name: '力扣', match: 'leetcode.cn/link', action: () => location.href.split('target=').pop() },
  { name: 'LINUX DO', match: 'linux.do', dom: 'interactive', action: () => document.addEventListener('click', e => { const a = e.target.closest('a.normal-external-link-icon[href]'); if (a) { e.stopImmediatePropagation(); e.preventDefault(); window.open(a.href); } }, true) },
  { name: '开发者知识库', match: 'www.itdaan.com/link', dom: 'interactive', action: () => document.querySelector('.safety-url')?.innerText },
  { name: '洛谷', match: [/^www\.luogu\.com\.cn\/(paste|discuss|article)\//], dom: 'interactive', action: () => document.getElementById('url')?.innerText },
  { name: 'BiliBili·中转', match: 'www.bilibili.com/york/link-middle-page', key: ['redirect_url', 'url'] },
  { name: 'BiliBili·游戏', match: 'game.bilibili.com/linkfilter', key: 'url' },
  { name: 'Steam', match: 'steamcommunity.com/linkfilter', key: ['url', 'u'] },
  { name: 'Epic', match: 'redirect.epicgames.com', key: 'redirectTo' },
  { name: '巴哈姆特', match: 'ref.gamer.com.tw/redir.php', key: 'url' },
  { name: '机核网', match: 'www.gcores.com/link', key: 'target' },
  { name: '森空岛', match: 'www.skland.com/third-link', key: 'target' },
  { name: 'KOOK', match: 'www.kookapp.cn/go-wild.html', key: 'url' },
  { name: 'CurseForge', match: 'www.curseforge.com/linkout', key: 'remoteUrl' },
  { name: 'GameBanana', match: 'gamebanana.com/linkfilter', key: 'url' },
  { name: '我的世界中文论坛', match: ['api.himcbbs.com/refer', 'www.mczwlt.net/go-external', 'forum.mczwlt.net/outgoing'], key: 'url' },
  { name: '5ch', match: 'jump.5ch.net', action: () => location.search.slice(1) },
  { name: 'MC 模组百科', match: 'link.mcmod.cn/target', action: () => safeAtob(location.pathname.replace(/^\/target\//, '')) },
  { name: 'Pixiv', match: 'www.pixiv.net/jump.php', action: ({ query }) => Object.entries(query).flat().find(v => /^https?:\/\//i.test(v)) },
  { name: 'NGA', match: ['bbs.nga.cn/read.php', 'nga.178.com/read.php'], dom: 'interactive', action: () => { if (unsafeWindow?.ubbcode) unsafeWindow.ubbcode.showUrlAlert = (...args) => window.open(args[1].href); } },
  { name: 'ACGrip', match: 'bbs.acgrip.com', dom: 'interactive', action: () => document.querySelectorAll('a[href^="http"]').forEach(a => { if (!a.href.includes(location.host)) a.addEventListener('click', e => { e.stopPropagation(); window.open(a.href, '_blank'); unsafeWindow?.hideMenu?.('fwin_dialog', 'dialog'); }); }) },
  { name: '飞书', match: /security\.feishu\.cn\/link\/safety/, key: ['target', 'url'] },
  { name: '语雀', match: /\.yuque\.com\/r\/goto/, key: 'url' },
  { name: '金山文档', match: ['www.kdocs.cn/office/link', 'www.kdocs.cn/etapps/query/link'], key: 'target' },
  { name: '石墨文档', match: [/^shimo\.im\/outlink\/(black|gray)/], key: 'url' },
  { name: '印象笔记', match: 'app.yinxiang.com/OutboundRedirect', key: 'dest' },
  { name: '天眼查', match: 'www.tianyancha.com/security', key: 'target' },
  { name: '企查查', match: 'www.qcc.com/web/transfer-link', key: 'link' },
  { name: '爱企查', match: [/^aiqicha\.baidu\.com\/safetip/, /^www\.aiqicha\.com\/safetip/], key: 'target' },
  { name: '亿企查', match: 'www.yiqicha.com/thirdPage', key: 'link' },
  { name: '少数派', match: /^(niu\.)?sspai\.com\/link/, key: 'target' },
  { name: '酷安', match: 'www.coolapk.com/link', key: 'url' },
  { name: '爱发电', match: [/^(afdian\.(net|com)|ifdian\.net)\/link/], key: 'target' },
  { name: '360 个人图书馆·外链', match: 'www.360doc.cn/outlink.html', key: 'url' },
  { name: '百度·百科', match: 'www.baike.com/redirect_link', key: 'url' },
  { name: '搜狗搜索', match: /^m\.sogou\.com.*\/tc$/, key: 'url' },
  { name: '360 个人图书馆·文章', match: 'www.360doc.com/content', dom: 'interactive', action: () => document.getElementById('artContent')?.addEventListener('click', e => { const a = e.target.closest('a'); if (a?.href && !a.href.includes(location.host)) { e.stopPropagation(); window.open(a.href); } }, true) },
  { name: '站长之家', match: 'www.chinaz.com/go.shtml', key: 'url' },
  { name: '优设网', match: 'link.uisdc.com', key: 'redirect' },
  { name: '网盘分享', match: 'wpfx.org/go', key: 'url' },
  { name: 'PC6 下载', match: 'www.pc6.com/goread.html', key: 'gourl' },
  { name: 'YY 语音', match: 'redir.yy.duowan.com/warning.php', key: 'url' },
  { name: '知更鸟', match: 'zmingcx.com/go.html', key: 'target' },
  { name: 'ABABTOOLS', match: 'ababtools.com', key: 'url' },
  { name: 'URLShare', match: 'google.urlshare.cn/umirror_url_check', key: 'url' },
  { name: 'Zaker', match: 'iphone.myzaker.com/zaker/link.php', action: ({ query }) => safeAtob(query.url) },
  { name: '喜格微', match: 'www.xgw4.com/qqdl.html', action: ({ query }) => safeAtob(query.url) },
  { name: '标志情报局', match: 'link.logonews.cn', action: ({ query, search }) => query.url || search.slice(1) },
  { name: 'Unsafelink', match: 'unsafelink.com', action: () => location.href.replace(/^https?:\/\/unsafelink\.com\//, '') },
  { name: 'TechLife', match: 't.techlife.app', action: () => safeAtob(location.hash.replace(/^#\/?/, '')) },
  { name: '花瓣网', match: 'huaban.com/go', dom: 'interactive', action: () => JSON.parse(document.getElementById('__NEXT_DATA__')?.textContent || '{}').props?.pageProps?.data?.link },
  { name: '异次元软件', match: 'www.iplaysoft.com/link', dom: 'interactive', action: () => document.querySelector('#targetUrl a')?.href },
  { name: '书签地球', match: 'www.bookmarkearth.com/view', dom: 'interactive', action: () => document.querySelector('p.link')?.innerText },
  { name: '蓝字团队', match: 'blzxteam.com/gowild.htm', dom: 'interactive', action: () => document.querySelector('div._2VEbEOHfDtVWiQAJxSIrVi_0')?.getAttribute('title') }
];

(function start() {
  const protocols = new Set(['http:', 'https:']);

  function clean(raw) {
    if (typeof raw !== 'string' || !raw.trim()) return null;
    let url = raw.trim();
    if (/%3A%2F%2F/i.test(url)) url = decodeURIComponent(url);
    if (url.startsWith('//')) url = location.protocol + url;
    else if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    try {
      const p = new URL(url);
      return protocols.has(p.protocol) ? p.href : null;
    } catch {
      return null;
    }
  }

  function redirect(target) {
    const destination = clean(target);
    if (!destination) return false;
    const style = document.createElement('style');
    style.textContent = 'html{visibility:hidden!important;display:none!important;}';
    (document.head || document.documentElement || document).append(style);
    setTimeout(() => style.remove(), 3000);
    location.replace(destination);
    return true;
  }

  const matches = (p, path) => Array.isArray(p) ? p.some(i => matches(i, path)) : p instanceof RegExp ? p.test(path) : typeof p === 'string' && path.includes(p);
  const path = location.host + location.pathname;
  const rule = RULES.find(item => matches(item.match, path));
  if (!rule) return;
  const search = location.search || (location.hash.includes('?') ? location.hash.slice(location.hash.indexOf('?')) : '');
  const context = { query: Object.fromEntries(new URLSearchParams(search)), url: location.href, search: location.search, hash: location.hash };

  async function run() {
    let target = null;
    if (rule.key) {
      for (const k of (Array.isArray(rule.key) ? rule.key : [rule.key])) {
        if (context.query[k]) {
          const rawMatch = search.match(new RegExp(`[?&]${k}=([^&].*$)`));
          target = (rawMatch && /^https?:\/\//i.test(rawMatch[1])) ? rawMatch[1] : context.query[k];
          break;
        }
      }
    } else if (rule.action) {
      target = await rule.action(context);
    }
    if (target) redirect(target);
  }

  const state = rule.dom === 'complete' ? 'complete' : 'interactive';
  const isReady = () => document.readyState === state || document.readyState === 'complete';
  if (!rule.dom || isReady()) {
    run();
  } else {
    document.addEventListener('readystatechange', () => { if (isReady()) run(); }, { once: true });
  }
})();