/* ============================================================
   寰宇 COSMOS · gallery.js
   影像卡片 / 深空图库筛选 / 灯箱 / 随机
   数据：window.NASA_DATA（assets/data/data.js）
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };
  var $$ = C.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var enc = C.enc || function (u) { return encodeURI(u || ""); };

  var DATA = window.NASA_DATA || { meta: {}, items: [] };
  var ITEMS = DATA.items || [];
  if (!ITEMS.length) return;

  var BATCH = 24;   // 每批渲染数量

  /* ---------- 卡片 ---------- */
  function makeCard(item, idx) {
    var card = document.createElement("figure");
    card.className = "card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", item.title + "（" + item.cat + "）");
    card.dataset.k = idx % 8;
    card._item = item;

    var img = document.createElement("img");
    img.loading = "lazy";
    img.decoding = "async";
    img.alt = item.title;
    img.src = enc(item.thumb || item.img);
    img.addEventListener("load", function () {
      img.classList.add("loaded");
      card.classList.add("img-ready");
    });
    img.addEventListener("error", function () { card.classList.add("img-failed"); });
    card.appendChild(img);

    var veil = document.createElement("div");
    veil.className = "card-veil";
    card.appendChild(veil);

    var tag = document.createElement("span");
    tag.className = "card-tag";
    tag.textContent = item.cat;
    card.appendChild(tag);

    var cap = document.createElement("figcaption");
    cap.className = "card-cap";
    var b = document.createElement("b");
    b.textContent = item.title;
    var s = document.createElement("span");
    s.textContent = (item.date || "—") + (item.center ? " · " + item.center : "");
    cap.appendChild(b);
    cap.appendChild(s);
    card.appendChild(cap);

    card.addEventListener("click", function () { openFromCard(card); });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openFromCard(card); }
    });
    return card;
  }

  function openFromCard(card) {
    var g = galleries[card.dataset.gal];
    if (!g) return;
    var idx = g.visible.indexOf(card._item);
    galleryOpen(g, idx < 0 ? 0 : idx);
  }

  /* ---------- 图库（分批渲染） ---------- */
  var galleries = {};

  var cardObserver = "IntersectionObserver" in window
    ? new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (!e.isIntersecting) return;
          var el = e.target;
          var k = parseInt(el.dataset.k, 10) || 0;
          setTimeout(function () { el.classList.add("in"); }, k * 55);
          cardObserver.unobserve(el);
        });
      }, { threshold: 0.05 })
    : null;

  function buildGallery(id, cats) {
    var grid = document.getElementById(id);
    if (!grid) return null;
    var list = ITEMS.filter(function (it) { return cats.indexOf(it.cat) >= 0; });
    var g = {
      id: id, grid: grid, list: list, visible: list.slice(),
      rendered: 0, sentinel: null
    };
    galleries[id] = g;
    resetGallery(g, list);
    return g;
  }

  // 按当前可见列表重新分批渲染
  function resetGallery(g, list) {
    g.visible = list;
    g.rendered = 0;
    g.grid.innerHTML = "";
    if (g.sentinel && g.sentinel.parentNode) g.sentinel.parentNode.removeChild(g.sentinel);
    g.sentinel = null;
    appendBatch(g, BATCH);
    if (g.rendered < list.length) attachSentinel(g);
  }

  function appendBatch(g, n) {
    var end = Math.min(g.rendered + n, g.visible.length);
    if (end <= g.rendered) return;
    var frag = document.createDocumentFragment();
    for (var i = g.rendered; i < end; i++) {
      var card = makeCard(g.visible[i], i);
      card.dataset.gal = g.id;
      frag.appendChild(card);
      if (cardObserver) cardObserver.observe(card);
      else card.classList.add("in");
    }
    g.grid.appendChild(frag);
    g.rendered = end;
  }

  function attachSentinel(g) {
    var s = document.createElement("div");
    s.className = "grid-sentinel";
    s.setAttribute("aria-hidden", "true");
    g.sentinel = s;
    g.grid.parentNode.insertBefore(s, g.grid.nextSibling);

    if (!("IntersectionObserver" in window)) { appendBatch(g, BATCH); return; }
    var io = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      appendBatch(g, BATCH);
      if (g.rendered >= g.visible.length) { io.disconnect(); s.remove(); g.sentinel = null; }
    }, { rootMargin: "300px" });
    io.observe(s);
    s._io = io;
  }

  var G_DEEP = buildGallery("grid-deep", ["星云", "星系", "黑洞", "深空场", "系外行星", "韦伯望远镜"]);
  buildGallery("grid-mars", ["火星"]);
  buildGallery("grid-earth", ["地球", "极光"]);
  buildGallery("grid-legacy", ["航天员", "火箭", "月球"]);

  /* ---------- 深空筛选 ---------- */
  var chipsBox = $("#chips-deep");
  if (chipsBox && G_DEEP) {
    var cats = [];
    G_DEEP.list.forEach(function (it) { if (cats.indexOf(it.cat) < 0) cats.push(it.cat); });

    function chip(label, cat) {
      var b = document.createElement("button");
      b.type = "button";
      b.className = "chip" + (cat ? "" : " active");
      var n = cat ? G_DEEP.list.filter(function (i) { return i.cat === cat; }).length : G_DEEP.list.length;
      b.innerHTML = '<span class="chip-label">' + label + '</span><span class="chip-n">' + n + "</span>";
      b.addEventListener("click", function () {
        $$(".chip", chipsBox).forEach(function (c) {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        b.classList.add("active");
        b.setAttribute("aria-pressed", "true");
        var vis = cat ? G_DEEP.list.filter(function (i) { return i.cat === cat; }) : G_DEEP.list.slice();
        resetGallery(G_DEEP, vis);
        var empty = $("#empty-deep");
        if (empty) empty.hidden = vis.length > 0;
      });
      b.setAttribute("aria-pressed", cat ? "false" : "true");
      chipsBox.appendChild(b);
    }
    chip("全部", null);
    cats.forEach(function (c) { chip(c, c); });
  }

  /* ---------- 灯箱 ---------- */
  var lb = $("#lightbox");
  var lbImg = $("#lbImg");
  var lbTitle = $("#lbTitle");
  var lbDesc = $("#lbDesc");
  var lbMeta = $("#lbMeta");
  var lbCat = $("#lbCat");
  var lbCount = $("#lbCount");
  var lbClose = $("#lbClose");
  var lbPrev = $("#lbPrev");
  var lbNext = $("#lbNext");
  var lbBackdrop = $("#lbBackdrop");
  var lbSpinner = $("#lbSpinner");
  var lbStrip = $("#lbStrip");
  var lbState = { list: [], idx: 0 };
  var lastFocus = null;

  function renderLb() {
    var it = lbState.list[lbState.idx];
    if (!it) return;

    if (lbSpinner) lbSpinner.hidden = false;
    lbImg.classList.remove("ready");
    var loader = new Image();
    loader.onload = function () {
      lbImg.src = loader.src;
      lbImg.classList.add("ready");
      if (lbSpinner) lbSpinner.hidden = true;
    };
    loader.onerror = function () {
      if (lbSpinner) lbSpinner.hidden = true;
      lbImg.classList.add("ready");
    };
    loader.src = enc(it.img);
    lbImg.alt = it.title;

    lbTitle.textContent = it.title;
    lbDesc.textContent = it.desc || "（暂无详细说明）";
    lbCat.textContent = it.cat;
    lbMeta.textContent = [
      it.date ? "日期 " + it.date : "",
      it.center ? "中心 " + it.center : "",
      it.credit && it.credit !== "NASA" ? "版权 " + it.credit : "",
      "ID " + it.id
    ].filter(Boolean).join(" · ");
    lbCount.textContent = (lbState.idx + 1) + " / " + lbState.list.length;

    var multi = lbState.list.length > 1;
    lbPrev.hidden = !multi;
    lbNext.hidden = !multi;

    renderStrip();
  }

  function renderStrip() {
    if (!lbStrip) return;
    var n = lbState.list.length;
    if (n < 2) { lbStrip.hidden = true; return; }
    lbStrip.hidden = false;

    // 只渲染当前索引附近的窗口，避免一次塞上百张缩略图
    var WIN = 12;
    var from = Math.max(0, lbState.idx - WIN);
    var to = Math.min(n, lbState.idx + WIN + 1);

    lbStrip.innerHTML = "";
    for (var i = from; i < to; i++) {
      (function (idx) {
        var it = lbState.list[idx];
        var b = document.createElement("button");
        b.type = "button";
        b.className = "lb-thumb" + (idx === lbState.idx ? " active" : "");
        b.setAttribute("aria-label", "第 " + (idx + 1) + " 张：" + it.title);
        var im = document.createElement("img");
        im.loading = "lazy";
        im.src = enc(it.thumb || it.img);
        im.alt = "";
        b.appendChild(im);
        b.addEventListener("click", function () { lbState.idx = idx; renderLb(); });
        lbStrip.appendChild(b);
      })(i);
    }
    var act = lbStrip.querySelector(".lb-thumb.active");
    if (act) act.scrollIntoView({ block: "nearest", inline: "center", behavior: C.reduceMotion ? "auto" : "smooth" });
  }

  function openLb(list, idx) {
    lbState.list = list;
    lbState.idx = idx;
    lb.hidden = false;
    document.body.classList.add("lb-open");
    renderLb();
    if (lbClose) lbClose.focus();
  }
  function closeLb() {
    lb.hidden = true;
    document.body.classList.remove("lb-open");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  function step(d) {
    var n = lbState.list.length;
    if (!n) return;
    lbState.idx = (lbState.idx + d + n) % n;
    renderLb();
  }
  function galleryOpen(g, idx) {
    lastFocus = document.activeElement;
    openLb(g.visible, idx);
  }

  if (lb) {
    C.on(lbClose, "click", closeLb);
    C.on(lbBackdrop, "click", closeLb);
    C.on(lbPrev, "click", function () { step(-1); });
    C.on(lbNext, "click", function () { step(1); });
    document.addEventListener("keydown", function (e) {
      if (lb.hidden) return;
      if (e.key === "Escape") closeLb();
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key === "Tab") {
        // 焦点锁在灯箱内
        var f = $$("button, [href], input, [tabindex]:not([tabindex='-1'])", lb)
          .filter(function (el) { return el.offsetParent !== null; });
        if (!f.length) return;
        var first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    // 触屏左右滑
    var x0 = null, y0 = null;
    lb.addEventListener("touchstart", function (e) {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 === null) return;
      var dx = e.changedTouches[0].clientX - x0;
      var dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.4) step(dx < 0 ? 1 : -1);
      x0 = null; y0 = null;
    }, { passive: true });
  }

  /* ---------- 随机一张 ---------- */
  var btnRandom = $("#btnRandom");
  if (btnRandom) {
    btnRandom.addEventListener("click", function () {
      var i = Math.floor(Math.random() * ITEMS.length);
      lastFocus = document.activeElement;
      openLb([ITEMS[i]], 0);
    });
  }

  /* ---------- 暴露给其他模块 ---------- */
  window.COSMOS.gallery = { open: galleryOpen, items: ITEMS };
})();
