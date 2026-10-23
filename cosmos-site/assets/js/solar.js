/* ============================================================
   寰宇 COSMOS · solar.js
   八大行星参数表 / 直径对比条 / 航天大事记 / 页脚数据
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };
  var $$ = C.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var DATA = window.NASA_DATA || { meta: {}, items: [] };
  var ITEMS = DATA.items || [];

  /* ---------- 天体数据 ---------- */
  var BODIES = [
    { name: "太阳", en: "Sun", d: 1392700, dist: "—", period: "—", spin: "25~35 天", moons: "—", temp: "5,505 °C", color: "#ffd34d" },
    { name: "水星", en: "Mercury", d: 4879, dist: "0.39 AU", period: "88 天", spin: "59 天", moons: "0", temp: "167 °C", color: "#b0a99f" },
    { name: "金星", en: "Venus", d: 12104, dist: "0.72 AU", period: "225 天", spin: "243 天(逆)", moons: "0", temp: "464 °C", color: "#e8c47a" },
    { name: "地球", en: "Earth", d: 12756, dist: "1.00 AU", period: "365.25 天", spin: "23.9 小时", moons: "1", temp: "15 °C", color: "#4c9aff" },
    { name: "火星", en: "Mars", d: 6792, dist: "1.52 AU", period: "687 天", spin: "24.6 小时", moons: "2", temp: "-65 °C", color: "#e2725b" },
    { name: "木星", en: "Jupiter", d: 142984, dist: "5.20 AU", period: "11.86 年", spin: "9.9 小时", moons: "95", temp: "-110 °C", color: "#d8a06a" },
    { name: "土星", en: "Saturn", d: 120536, dist: "9.54 AU", period: "29.45 年", spin: "10.7 小时", moons: "274", temp: "-140 °C", color: "#e6cf9a" },
    { name: "天王星", en: "Uranus", d: 51118, dist: "19.19 AU", period: "84.01 年", spin: "17.2 小时(逆)", moons: "28", temp: "-195 °C", color: "#9fe3e8" },
    { name: "海王星", en: "Neptune", d: 49528, dist: "30.07 AU", period: "164.8 年", spin: "16.1 小时", moons: "16", temp: "-200 °C", color: "#5a7ded" }
  ];

  /* ---------- 直径对比条（对数比例，否则太阳画不下） ---------- */
  var chart = $("#solarChart");
  if (chart) {
    var LO = Math.log10(4000), HI = Math.log10(1500000);
    BODIES.forEach(function (b, i) {
      var row = document.createElement("div");
      row.className = "bar-row";
      row.dataset.i = i;

      var name = document.createElement("span");
      name.className = "bar-name";
      name.textContent = b.name;

      var track = document.createElement("div");
      track.className = "bar-track";
      var fill = document.createElement("div");
      fill.className = "bar-fill";
      fill.style.background = "linear-gradient(90deg," + b.color + "55," + b.color + ")";
      fill.dataset.w = ((Math.log10(b.d) - LO) / (HI - LO) * 100).toFixed(1);
      track.appendChild(fill);

      var val = document.createElement("span");
      val.className = "bar-val";
      val.textContent = b.d.toLocaleString("en-US");

      row.appendChild(name);
      row.appendChild(track);
      row.appendChild(val);
      chart.appendChild(row);
      row.addEventListener("mouseenter", function () { highlightRow(b.name); });
    });

    var chartIO = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      $$(".bar-fill", chart).forEach(function (f, i) {
        setTimeout(function () { f.style.width = f.dataset.w + "%"; }, i * 70);
      });
      chartIO.disconnect();
    }, { threshold: 0.25 });
    chartIO.observe(chart);
  }

  /* ---------- 参数表 ---------- */
  var tbody = $("#solarTableBody");
  if (tbody) {
    BODIES.forEach(function (b) {
      var tr = document.createElement("tr");
      var tdName = document.createElement("td");
      var dot = document.createElement("i");
      dot.className = "pl-dot";
      dot.style.background = b.color;
      dot.style.color = b.color;
      tdName.appendChild(dot);
      tdName.appendChild(document.createTextNode(b.name + " " + b.en));
      tr.appendChild(tdName);
      var heads = ["直径 (km)", "平均距日", "公转周期", "卫星数", "平均温度"];
      [b.d.toLocaleString("en-US"), b.dist, b.period, b.moons, b.temp].forEach(function (v, i) {
        var td = document.createElement("td");
        td.textContent = v;
        td.setAttribute("data-label", heads[i] || "");
        tr.appendChild(td);
      });
      tr.addEventListener("mouseenter", function () { highlightRow(b.name); });
      tbody.appendChild(tr);
    });
  }

  function highlightRow(name) {
    $$(".bar-row").forEach(function (r, i) {
      r.classList.toggle("hot", BODIES[i] && BODIES[i].name === name);
    });
    $$(".solar-table tbody tr").forEach(function (tr, i) {
      tr.classList.toggle("hot", !!(BODIES[i] && BODIES[i].name === name));
    });
  }

  /* ---------- 航天大事记 ---------- */
  var EVENTS = [
    ["1957", "斯普特尼克1号", "人类首颗人造卫星进入轨道"],
    ["1961", "东方1号", "加加林成为进入太空的第一人"],
    ["1969", "阿波罗11号", "人类首次踏上月球表面"],
    ["1971", "礼炮1号", "人类首个空间站升空"],
    ["1977", "旅行者发射", "两艘探测器启程飞向外太阳系"],
    ["1981", "哥伦比亚号", "首架可重复使用航天飞机首飞"],
    ["1990", "哈勃升空", "太空望远镜时代正式开启"],
    ["1998", "国际空间站", "首个模块「曙光号」入轨组装"],
    ["2004", "勇气号 / 机遇号", "双火星车先后着陆火星"],
    ["2012", "好奇号", "核动力火星车着陆盖尔陨石坑"],
    ["2015", "新视野号", "人类首次飞掠冥王星"],
    ["2021", "韦伯发射", "同期毅力号携无人机登陆火星"],
    ["2022", "韦伯首批图像", "最深空红外影像公开问世"]
  ];
  var tl = $("#timeline");
  if (tl) {
    EVENTS.forEach(function (e) {
      var li = document.createElement("li");
      li.className = "tl-item reveal";
      var y = document.createElement("b");
      y.className = "tl-year";
      y.textContent = e[0];
      var t = document.createElement("div");
      t.className = "tl-text";
      var s = document.createElement("strong");
      s.textContent = e[1];
      t.appendChild(s);
      t.appendChild(document.createTextNode(e[2]));
      li.appendChild(y);
      li.appendChild(t);
      tl.appendChild(li);
      if (C.observeReveal) C.observeReveal(li);
    });
  }

  /* ---------- 页脚 / 关于 ---------- */
  var meta = DATA.meta || {};
  var ft = $("#fetchTime");
  if (ft) ft.textContent = meta.fetched || "—";
  var aboutCount = $("#aboutCount");
  if (aboutCount) aboutCount.textContent = String(ITEMS.length);

  // 统计条第一条与真实影像数对齐（其余几条在 HTML 里写死）
  var statCounts = $$(".stat .count");
  if (statCounts[0] && ITEMS.length) statCounts[0].setAttribute("data-target", String(ITEMS.length));
})();
