/* ============================================================
   寰宇 COSMOS · archive.js —「可核查的档案」层（v4）
   ------------------------------------------------------------
   三件事，全部不依赖后端：
     1) 收藏：localStorage 存 id，不需要账号；可生成分享链接
     2) 引用：按出处/编号/原始记录生成可复制的引文
     3) 简报：首屏那句摘要与三条读数由 data.js 现场算，不写死
   数据来源仍是 window.NASA_DATA，本文件不改数据、只加索引。
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };
  var $$ = C.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var on = C.on || function (el, t, fn) { if (el) el.addEventListener(t, fn); };
  var toW = C.webp || function (u) { return u; };

  var DATA = window.NASA_DATA || { meta: {}, items: [] };
  var ITEMS = DATA.items || [];
  if (!ITEMS.length) return;

  var KEY = "cosmos:fav:v1";
  var MAX = 240;
  var SRC = "https://images.nasa.gov/details/";

  var byId = {};
  ITEMS.forEach(function (it) { if (it && it.id) byId[it.id] = it; });

  function zhTitle(it) { return (it && (it.titleZh || it.title)) || "未命名影像"; }
  function zhDesc(it) { return (it && (it.descZh || it.desc)) || ""; }

  /* ---------- 存储（隐私模式/禁用 cookie 时不炸） ---------- */
  function readStore() {
    try {
      var raw = window.localStorage.getItem(KEY);
      var arr = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(arr)) return [];
      return arr.filter(function (id) { return typeof id === "string" && byId[id]; }).slice(0, MAX);
    } catch (e) { return []; }
  }
  function writeStore(ids) {
    try { window.localStorage.setItem(KEY, JSON.stringify(ids)); return true; }
    catch (e) { return false; }
  }

  var ids = readStore();
  var registry = [];   // [{btn, id}] 用于状态同步

  function indexOf(id) { return ids.indexOf(id); }
  function has(id) { return indexOf(id) >= 0; }

  function applyBtn(r) {
    var on_ = has(r.id);
    r.btn.setAttribute("aria-pressed", on_ ? "true" : "false");
    r.btn.textContent = on_ ? "★" : "☆";
    r.btn.setAttribute("aria-label", (on_ ? "取消收藏：" : "收藏：") + r.title);
    r.btn.title = on_ ? "取消收藏" : "收藏到我的清单";
  }

  function syncButtons(id) {
    registry.forEach(function (r) { if (r.id === id) applyBtn(r); });
  }

  function syncAll() {
    registry.forEach(applyBtn);
    syncNav();
    if (drawer && !drawer.hidden) renderDrawer();
  }

  function toggle(id) {
    if (!byId[id]) return false;
    var i = indexOf(id);
    if (i >= 0) { ids.splice(i, 1); }
    else {
      if (ids.length >= MAX) { toast("收藏上限 " + MAX + " 张"); return !!has(id); }
      ids.unshift(id);
    }
    writeStore(ids);
    syncButtons(id);
    syncNav();
    if (drawer && !drawer.hidden) renderDrawer();
    document.dispatchEvent(new CustomEvent("cosmos:fav", { detail: { id: id, on: has(id) } }));
    return has(id);
  }

  /* ---------- 图版上的收藏角标 ---------- */
  function attach(btn, item) {
    if (!btn || !item || !item.id) return;
    var rec = { btn: btn, id: item.id, title: zhTitle(item) };
    registry.push(rec);
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      var now = toggle(item.id);
      toast(now ? "已收进「我的收藏」" : "已从收藏移除");
    });
    btn.setAttribute("aria-pressed", has(item.id) ? "true" : "false");
    btn.textContent = has(item.id) ? "★" : "☆";
    btn.setAttribute("aria-label", (has(item.id) ? "取消收藏：" : "收藏：") + rec.title);
    btn.title = has(item.id) ? "取消收藏" : "收藏到我的清单";
  }

  /* ---------- 顶栏计数 ---------- */
  function syncNav() {
    var navFav = $("#navFav");
    var count = $("#favCount");
    if (count) count.textContent = String(ids.length);
    if (navFav) {
      navFav.classList.toggle("is-on", ids.length > 0);
      navFav.setAttribute("aria-label", "我的收藏（" + ids.length + " 张）");
    }
    var shareBtn = $("#favShare");
    if (shareBtn) shareBtn.disabled = ids.length === 0;
    var clearBtn = $("#favClear");
    if (clearBtn) clearBtn.disabled = ids.length === 0;
  }

  /* ---------- 抽屉 ---------- */
  var drawer = $("#favDrawer");
  var scrim = null;
  var lastFocus = null;
  var sharedIds = null;   // 来自 ?f= 的分享清单

  function ensureScrim() {
    if (scrim) return scrim;
    scrim = document.createElement("div");
    scrim.className = "fav-scrim";
    scrim.addEventListener("click", function () { closeDrawer(); });
    document.body.appendChild(scrim);
    return scrim;
  }

  function openDrawer() {
    if (!drawer) return;
    lastFocus = document.activeElement;
    ensureScrim();
    renderDrawer();
    drawer.hidden = false;
    // 先渲染再加 class，否则过渡不会触发
    requestAnimationFrame(function () {
      drawer.classList.add("open");
      scrim.classList.add("open");
    });
    document.body.style.overflow = "hidden";
    var navFav = $("#navFav");
    if (navFav) navFav.setAttribute("aria-expanded", "true");
    var close = $("#favClose");
    if (close) close.focus();
  }

  function closeDrawer() {
    if (!drawer || drawer.hidden) return;
    drawer.classList.remove("open");
    if (scrim) scrim.classList.remove("open");
    document.body.style.overflow = "";
    var navFav = $("#navFav");
    if (navFav) navFav.setAttribute("aria-expanded", "false");
    window.setTimeout(function () {
      if (!drawer.classList.contains("open")) drawer.hidden = true;
    }, 300);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function renderDrawer() {
    var list = $("#favList");
    var empty = $("#favEmpty");
    var sharedBar = $("#favShared");
    var note = $("#favNote");
    var title = $("#favTitle");
    var isShared = !!(sharedIds && sharedIds.length);
    var view = isShared ? sharedIds : ids;

    if (sharedBar) {
      sharedBar.hidden = !isShared;
      var sn = $("#favSharedN");
      if (sn) sn.textContent = String(sharedIds ? sharedIds.length : 0);
    }
    var clearBtn = $("#favClear");
    if (clearBtn) clearBtn.hidden = isShared;
    if (title) title.textContent = isShared ? "分享的收藏" : "我的收藏";
    if (note) {
      note.textContent = isShared
        ? "这份清单来自别人分享的链接，只在你打开时临时显示，没有写进你的收藏。"
        : "收藏只存在这台设备的浏览器里，不上传、不需要账号。想给别人看，就复制分享链接。";
    }

    if (!list) return;
    list.innerHTML = "";
    if (empty) empty.hidden = view.length > 0;

    view.forEach(function (id) {
      var it = byId[id];
      if (!it) return;
      var li = document.createElement("li");
      li.className = "fav-item";

      var img = document.createElement("img");
      img.className = "fav-thumb";
      img.loading = "lazy";
      img.decoding = "async";
      img.width = 58; img.height = 58;
      img.src = encodeURI(toW(it.thumb || it.img));
      img.alt = "";
      img.addEventListener("click", function () { openOne(it); });
      li.appendChild(img);

      var meta = document.createElement("button");
      meta.type = "button";
      meta.className = "fav-meta";
      var b = document.createElement("b");
      b.textContent = zhTitle(it);
      var s = document.createElement("span");
      s.textContent = [it.date, it.center].filter(Boolean).join(" · ");
      meta.appendChild(b);
      meta.appendChild(s);
      meta.addEventListener("click", function () { openOne(it); });
      li.appendChild(meta);

      var del = document.createElement("button");
      del.type = "button";
      del.className = "fav-del";
      del.setAttribute("aria-label", (isShared ? "从分享清单移除：" : "取消收藏：") + zhTitle(it));
      del.textContent = isShared ? "−" : "✕";
      del.addEventListener("click", function () {
        if (isShared) {
          sharedIds = sharedIds.filter(function (x) { return x !== id; });
          renderDrawer();
        } else {
          toggle(it.id);
        }
      });
      li.appendChild(del);
      list.appendChild(li);
    });
  }

  function openOne(it) {
    if (C.gallery && C.gallery.openList) {
      closeDrawer();
      C.gallery.openList([it], 0);
    }
  }

  /* ---------- 分享链接 ---------- */
  function shareUrl(list) {
    var base = location.origin + location.pathname;
    return base + "?f=" + encodeURIComponent(list.join(","));
  }

  function copyText(text, okMsg) {
    function done() { toast(okMsg || "已复制"); }
    function fallback() {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (e) { ok = false; }
      document.body.removeChild(ta);
      toast(ok ? (okMsg || "已复制") : "复制失败，请手动选中");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
  }

  /* ---------- 引文 ---------- */
  function pad(n) { return n < 10 ? "0" + n : "" + n; }
  function today() {
    var d = new Date();
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }
  function citation(it) {
    if (!it) return "";
    var inst = it.credit || "NASA";
    var name = zhTitle(it);
    var en = it.title && it.title !== name ? "（" + it.title + "）" : "";
    var date = it.date || "日期不详";
    var link = SRC + encodeURIComponent(it.id);
    return inst + "，〈" + name + "〉" + en + "，" + date + "，NASA Image and Video Library，" +
      link + "（访问于 " + today() + "）。";
  }

  /* ---------- 轻提示 ---------- */
  var toastEl = null, toastTimer = 0;
  function toast(msg) {
    if (!toastEl) {
      toastEl = document.createElement("div");
      toastEl.className = "toast";
      toastEl.setAttribute("role", "status");
      toastEl.setAttribute("aria-live", "polite");
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    requestAnimationFrame(function () { toastEl.classList.add("show"); });
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { toastEl.classList.remove("show"); }, 2200);
  }

  /* ---------- 首屏简报 ---------- */
  function computeBrief() {
    var lead = $("#hbLead");
    if (!lead) return;
    var years = [];
    ITEMS.forEach(function (it) {
      var y = parseInt(String(it.date || "").slice(0, 4), 10);
      if (y > 1900 && y < 2100) years.push(y);
    });
    var minY = years.length ? Math.min.apply(null, years) : null;
    var maxY = years.length ? Math.max.apply(null, years) : null;
    var traced = ITEMS.filter(function (it) { return !!it.id; }).length;

    lead.innerHTML = "本档案收录 <b>" + ITEMS.length + "</b> 幅影像，最早一幅摄于 <b>" +
      (minY || "—") + "</b> 年，最晚 <b>" + (maxY || "—") +
      "</b> 年；每一幅都附原始编号，可在 NASA 影像库逐条核对，不必相信我们的转述。";

    var span = $("#hbSpan");
    if (span) span.textContent = (minY || "—") + " — " + (maxY || "—");

    var upd = $("#hbUpdated");
    var fetched = String(DATA.meta && DATA.meta.fetched || "");
    if (upd) upd.textContent = fetched ? fetched.slice(5, 16) : today();

    var trace = $("#hbTrace");
    if (trace) trace.textContent = traced + " / " + ITEMS.length;
  }

  /* ---------- 入口 ---------- */
  function init() {
    computeBrief();
    syncNav();

    on($("#navFav"), "click", openDrawer);
    on($("#favClose"), "click", closeDrawer);

    var shareBtn = $("#favShare");
    on(shareBtn, "click", function () {
      var list = (sharedIds && sharedIds.length) ? sharedIds : ids;
      if (!list.length) { toast("还没有收藏"); return; }
      copyText(shareUrl(list), "分享链接已复制（" + list.length + " 张）");
    });

    var clearBtn = $("#favClear");
    on(clearBtn, "click", function () {
      if (!ids.length) return;
      ids = [];
      writeStore(ids);
      syncAll();
      toast("已清空收藏");
    });

    var importBtn = $("#favImport");
    on(importBtn, "click", function () {
      if (!sharedIds) return;
      var added = 0;
      sharedIds.forEach(function (id) {
        if (byId[id] && indexOf(id) < 0) { ids.unshift(id); added++; }
      });
      ids = ids.slice(0, MAX);
      writeStore(ids);
      sharedIds = null;
      syncAll();
      toast("已收进收藏（新增 " + added + " 张）");
    });

    document.addEventListener("keydown", function (e) {
      if (!drawer || drawer.hidden) return;
      if (e.key === "Escape") { closeDrawer(); return; }
      if (e.key !== "Tab") return;
      // 抽屉是模态的（背景锁滚），焦点也锁在里面
      var f = $$("button, [href], input, [tabindex]:not([tabindex='-1'])", drawer)
        .filter(function (el) { return el.offsetParent !== null && !el.disabled; });
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    // 空抽屉里点「分享」不该复制空串
    syncNav();

    // ?f= 分享清单
    var q = new URLSearchParams(location.search).get("f");
    if (q) {
      var incoming = q.split(",").map(function (s) { return s.trim(); })
        .filter(function (id) { return !!byId[id]; })
        .slice(0, MAX);
      if (incoming.length) {
        sharedIds = incoming;
        openDrawer();
      }
    }

    document.documentElement.setAttribute("data-archive", "ready");
  }

  window.COSMOS.archive = {
    has: has,
    toggle: toggle,
    attach: attach,
    citation: citation,
    cite: function (it) {
      if (!it) return;
      copyText(citation(it), "引文已复制，可直接粘贴");
    },
    itemById: function (id) { return byId[id] || null; },
    openDrawer: openDrawer,
    count: function () { return ids.length; },
    ids: function () { return ids.slice(); },
    toast: toast
  };

  init();
})();
