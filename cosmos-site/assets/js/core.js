/* ============================================================
   寰宇 COSMOS · core.js
   公共工具 + 全局行为（导航 / 滚动 / 显现 / 星空）
   对外暴露 window.COSMOS
   ============================================================ */
window.COSMOS = (function () {
  "use strict";

  /* ---------- 工具 ---------- */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function enc(url) { return encodeURI(url || ""); }
  function esc(s) { return String(s == null ? "" : s); }
  function on(el, type, fn, opts) { if (el) el.addEventListener(type, fn, opts); }
  function raf(fn) { return window.requestAnimationFrame(fn); }

  var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------- 滚动显现（供其他模块复用） ---------- */
  var revealObserver = null;
  function initReveal() {
    if (!("IntersectionObserver" in window)) {
      $$(".reveal").forEach(function (el) { el.classList.add("in"); });
      return;
    }
    revealObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          revealObserver.unobserve(e.target);
        }
      });
    }, { threshold: 0.12 });
    $$(".reveal").forEach(function (el) { revealObserver.observe(el); });
  }
  function observeReveal(el) {
    if (!el) return;
    if (revealObserver) revealObserver.observe(el);
    else el.classList.add("in");
  }

  /* ---------- 数字计数 ---------- */
  function initCounters() {
    $$(".count").forEach(function (el) {
      var target = parseInt(el.getAttribute("data-target"), 10) || 0;
      var suffix = el.getAttribute("data-suffix") || "";
      var started = false;
      var io = new IntersectionObserver(function (entries) {
        if (!entries[0].isIntersecting || started) return;
        started = true;
        io.disconnect();
        if (reduceMotion) { el.textContent = target + suffix; return; }
        var t0 = performance.now(), dur = 1400;
        (function tick(now) {
          var p = Math.min((now - t0) / dur, 1);
          var eased = 1 - Math.pow(1 - p, 3);
          el.textContent = Math.round(target * eased) + suffix;
          if (p < 1) raf(tick);
        })(t0);
      }, { threshold: 0.5 });
      io.observe(el);
    });
  }

  /* ---------- 星空画布 ---------- */
  function initStarfield() {
    var canvas = $("#starfield");
    if (!canvas) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var stars = [], meteors = [];
    var W = 0, H = 0;
    var running = false;
    var lastT = 0;
    var meteorTimer = 0;

    function resize() {
      W = window.innerWidth;
      H = window.innerHeight;
      canvas.width = Math.round(W * dpr);
      canvas.height = Math.round(H * dpr);
      canvas.style.width = W + "px";
      canvas.style.height = H + "px";
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      build();
      if (!running) paintStatic();
    }

    function build() {
      var n = Math.min(300, Math.floor((W * H) / 4800));
      stars = [];
      for (var i = 0; i < n; i++) {
        stars.push({
          x: Math.random() * W,
          y: Math.random() * H,
          r: Math.random() * 1.2 + 0.25,
          a: Math.random() * 0.5 + 0.28,
          sp: Math.random() * 1.2 + 0.25,
          ph: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.12 ? "168,190,255" : (Math.random() < 0.08 ? "255,228,196" : "255,255,255")
        });
      }
    }

    function drawStars(t) {
      for (var i = 0; i < stars.length; i++) {
        var s = stars[i];
        var tw = 0.65 + 0.35 * Math.sin(t / 1200 * s.sp + s.ph);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(" + s.hue + "," + (s.a * tw).toFixed(3) + ")";
        ctx.fill();
      }
    }

    function paintStatic() {
      ctx.clearRect(0, 0, W, H);
      drawStars(0);
    }

    function spawnMeteor() {
      var fromLeft = Math.random() < 0.5;
      meteors.push({
        x: fromLeft ? -40 : W * (0.4 + Math.random() * 0.6),
        y: Math.random() * H * 0.35,
        vx: (fromLeft ? 1 : -1) * (5 + Math.random() * 4),
        vy: 2 + Math.random() * 2,
        life: 1
      });
    }

    function frame(t) {
      var dt = Math.min((t - lastT) / 16.7, 3) || 1;
      lastT = t;
      ctx.clearRect(0, 0, W, H);
      drawStars(t);

      // 流星
      meteorTimer -= dt;
      if (meteorTimer <= 0) {
        spawnMeteor();
        meteorTimer = 180 + Math.random() * 320;
      }
      for (var m = meteors.length - 1; m >= 0; m--) {
        var mt = meteors[m];
        mt.x += mt.vx * dt;
        mt.y += mt.vy * dt;
        mt.life -= 0.012 * dt;
        if (mt.life <= 0 || mt.x < -120 || mt.x > W + 120 || mt.y > H + 60) {
          meteors.splice(m, 1);
          continue;
        }
        var tail = 90;
        var g = ctx.createLinearGradient(mt.x, mt.y, mt.x - mt.vx * tail * 0.16, mt.y - mt.vy * tail * 0.16);
        g.addColorStop(0, "rgba(220,235,255," + (0.85 * mt.life).toFixed(3) + ")");
        g.addColorStop(1, "rgba(150,190,255,0)");
        ctx.strokeStyle = g;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(mt.x, mt.y);
        ctx.lineTo(mt.x - mt.vx * tail * 0.16, mt.y - mt.vy * tail * 0.16);
        ctx.stroke();
      }
      raf(frame);
    }

    function start() {
      if (running || reduceMotion) return;
      running = true;
      lastT = 0;
      raf(frame);
    }
    function stop() {
      running = false;
    }

    resize();
    var rt;
    window.addEventListener("resize", function () {
      clearTimeout(rt);
      rt = setTimeout(resize, 180);
    }, { passive: true });

    // 只在首屏可见时跑动画，滚下去就停（省电、避免和其他 canvas 抢帧）
    var hero = $(".hero") || canvas.parentElement;
    if ("IntersectionObserver" in window && hero) {
      new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) start(); else stop();
        });
      }, { threshold: 0 }).observe(hero);
    } else {
      start();
    }
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) stop();
      else if (!reduceMotion) start();
    });
  }

  /* ---------- 导航 / 滚动 ---------- */
  function initNav() {
    var nav = $("#nav");
    var progress = $("#scrollProgress");
    var toTop = $("#toTop");

    function onScroll() {
      var y = window.scrollY || document.documentElement.scrollTop;
      if (nav) nav.classList.toggle("scrolled", y > 30);
      if (toTop) toTop.classList.toggle("show", y > 640);
      if (progress) {
        var max = document.documentElement.scrollHeight - window.innerHeight;
        progress.style.width = (max > 0 ? (y / max) * 100 : 0) + "%";
      }
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();

    on(toTop, "click", function () {
      window.scrollTo({ top: 0, behavior: reduceMotion ? "auto" : "smooth" });
    });

    var burger = $("#navBurger");
    var navLinks = $("#navLinks");
    on(burger, "click", function () {
      var open = navLinks.classList.toggle("open");
      burger.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
    });
    $$("a", navLinks).forEach(function (a) {
      a.addEventListener("click", function () {
        navLinks.classList.remove("open");
        burger.classList.remove("open");
        burger.setAttribute("aria-expanded", "false");
      });
    });

    // 当前区块高亮：顶部导航 + 侧边点导航共用一套观察器
    var links = $$(".nav-links a[data-sec]");
    var sections = $$("[data-nav]").filter(function (el) { return el.id; });
    if (!sections.length || !("IntersectionObserver" in window)) return;

    var byId = {};
    links.forEach(function (a) { byId[a.getAttribute("data-sec")] = a; });

    // 生成侧边点导航
    var dotBox = $("#dotNav");
    var dots = {};
    if (dotBox && sections.length > 2) {
      sections.forEach(function (sec) {
        var a = document.createElement("a");
        a.href = "#" + sec.id;
        a.dataset.label = sec.getAttribute("data-nav") || sec.id;
        a.setAttribute("aria-label", "跳到" + a.dataset.label);
        dotBox.appendChild(a);
        dots[sec.id] = a;
      });
    }

    function setActive(id) {
      links.forEach(function (a) { a.classList.toggle("active", a === byId[id]); });
      Object.keys(dots).forEach(function (k) {
        dots[k].classList.toggle("active", k === id);
      });
    }

    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setActive(e.target.id);
      });
    }, { rootMargin: "-42% 0px -52% 0px", threshold: 0 });

    sections.forEach(function (sec) { spy.observe(sec); });

    // 点导航只在离开首屏后出现
    var dotNavEl = $("#dotNav");
    if (dotNavEl) {
      window.addEventListener("scroll", function () {
        dotNavEl.classList.toggle("show", (window.scrollY || 0) > window.innerHeight * 0.6);
      }, { passive: true });
    }
  }

  /* ---------- 键盘可达性：卡片/按钮天然支持，这里补 skip link ---------- */
  function initA11y() {
    var skip = $("#skipLink");
    if (!skip) return;
    on(skip, "click", function (e) {
      e.preventDefault();
      var main = $("#main") || $("main");
      if (main) {
        main.setAttribute("tabindex", "-1");
        main.focus();
      }
    });
  }

  /* ---------- 启动 ---------- */
  var booted = false;
  function boot() {
    if (booted) return;
    booted = true;
    initStarfield();
    initNav();
    initReveal();
    initCounters();
    initA11y();
  }

  // 脚本位于 body 末尾：DOM 已就绪，立即初始化，保证后续模块能用上 reveal 观察器
  if (document.body) {
    boot();
  } else {
    document.addEventListener("DOMContentLoaded", boot);
  }

  return {
    $: $, $$: $$, clamp: clamp, enc: enc, esc: esc, on: on, raf: raf,
    reduceMotion: reduceMotion, observeReveal: observeReveal
  };
})();
