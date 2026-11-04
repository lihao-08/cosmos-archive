/* ============================================================
   寰宇 COSMOS · boot.js — 加载调度器（唯一入口）

   旧架构：index.html 尾部硬编码 12 个同步 <script>，全部阻塞 HTML
   解析，435KB 数据文件在首屏之前就下载并执行完毕；模块间依赖靠
   「标签顺序」隐式保证，任何增删都可能连锁出错。

   新架构：依赖图在这里显式声明。
     - 数据与脚本一律动态注入，按 Promise 缓存，绝不重复加载
     - 首屏必需组立即异步加载；其余按 section 接近视口提前预取
     - 打印 / 无 IntersectionObserver / 脚本失败时都有兜底
     - 部署仍是纯静态：无构建、无打包、无 npm 依赖

   各功能文件保持 IIFE 不变，加载时机由本文件统一编排。
   ============================================================ */
(function () {
  "use strict";

  var DATA_BASE = "assets/data/";
  var JS_BASE = "assets/js/";
  var cache = {};       // src -> Promise
  var fired = {};       // 任务 key -> true
  var failures = [];

  /* ---------- WebP 失败自动回退 JPG ----------
     <img> 的资源 error 不冒泡，必须在捕获阶段拦截；用 dataset 防止死循环。
     云端每天新抓的 JPG 若还没来得及转换，这条链保证图片不会开天窗。 */
  document.addEventListener("error", function (e) {
    var el = e.target;
    if (!el || el.tagName !== "IMG" || el.dataset.webpFallback) return;
    var src = el.getAttribute("src") || "";
    if (!/\.webp$/i.test(src)) return;
    el.dataset.webpFallback = "1";
    el.src = src.replace(/\.webp$/i, ".jpg");
  }, true);

  /* ---------- 动态注入一个脚本，带去重与错误处理 ---------- */
  function inject(src) {
    if (cache[src]) return cache[src];
    cache[src] = new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.async = false;             // 动态脚本仍按注入顺序执行
      s.onload = function () { resolve(); };
      s.onerror = function () {
        failures.push(src);
        console.warn("[cosmos] 资源加载失败：", src);
        reject(new Error(src));
      };
      document.head.appendChild(s);
    });
    return cache[src];
  }

  function data(name) { return inject(DATA_BASE + name + ".js"); }
  function js(name) { return inject(JS_BASE + name + ".js"); }

  function safe(p) {
    // 单个分支失败不能阻断其余分组
    return Promise.resolve(p).catch(function () { return null; });
  }

  /* ---------- section 接近视口时触发（提前 1200px 预取） ---------- */
  function whenNear(id, fn) {
    var el = document.getElementById(id);
    if (!el || !("IntersectionObserver" in window)) { fn(); return; }
    var io;
    var done = false;
    var fire = function () {
      if (done) return;
      done = true;
      if (io) io.disconnect();
      fn();
    };
    io = new IntersectionObserver(function (entries) {
      if (entries[0].isIntersecting) fire();
    }, { rootMargin: "1200px 0px 1200px 0px" });
    io.observe(el);
    return fire;
  }

  /* ---------- 依赖图：数据 → 模块，顺序在这里一眼可见 ---------- */
  var TASKS = [
    {
      key: "archive",
      id: "featured",
      eager: true,
      // 深空图库 / 统计条 / 页脚都依赖 NASA 影像总表
      run: function () {
        return data("data").then(function () {
          return Promise.all([safe(js("gallery")), safe(js("solar"))]);
        });
      }
    },
    {
      key: "videos",
      id: "videos",
      run: function () {
        return data("extra").then(function () { return safe(js("videos")); });
      }
    },
    {
      key: "orrery",
      id: "orrery",
      run: function () {
        return js("astro").then(function () { return safe(js("orrery")); });
      }
    },
    {
      key: "tonight",
      id: "tonight",
      run: function () {
        return js("astro").then(function () { return safe(js("sky")); });
      }
    },
    {
      key: "live",
      id: "live",
      // live.js 同时读取 LIVE / EXTRA / GLOBAL 三份数据
      run: function () {
        return Promise.all([data("live"), data("extra"), data("global")])
          .then(function () { return safe(js("live")); });
      }
    }
  ];

  var triggers = {};

  function start(task) {
    if (fired[task.key]) return;
    fired[task.key] = true;
    safe(task.run());
  }

  function startAll() {
    TASKS.forEach(start);
    Object.keys(triggers).forEach(function (k) { triggers[k](); });
  }

  /* 遥测条：影像总数取自 data.js，时钟用真实 UTC，不写假读数 */
  function initTelemetry() {
    var clock = document.getElementById("tmClock");
    var plates = document.getElementById("tmPlates");
    function tick() {
      if (clock) clock.textContent = new Date().toISOString().slice(11, 19);
      if (plates && window.NASA_DATA && window.NASA_DATA.items) {
        plates.textContent = String(window.NASA_DATA.items.length);
      }
    }
    tick();
    setInterval(tick, 1000);
  }

  function init() {
    initTelemetry();
    TASKS.forEach(function (task) {
      if (task.eager) { start(task); return; }
      var fire = whenNear(task.id, function () { start(task); });
      if (fire) triggers[task.key] = fire;
    });

    // 打印时必须渲染全部内容：懒加载模块还没跑的话，页面会是空的
    if (window.matchMedia) {
      var mq = window.matchMedia("print");
      var onChange = function (e) { if (e.matches) startAll(); };
      if (mq.addEventListener) mq.addEventListener("change", onChange);
      else if (mq.addListener) mq.addListener(onChange);
    }
    window.addEventListener("beforeprint", startAll);

    // 深链接直达页尾时（如 #about），顺带把途经分组拉起来
    window.addEventListener("hashchange", startAll, { once: true });

    document.documentElement.setAttribute("data-boot", "ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }

  // 供调试与自动化测试查看
  window.COSMOS_BOOT = {
    tasks: TASKS.map(function (t) { return t.key; }),
    loaded: fired,
    failures: failures,
    loadAll: startAll
  };
})();
