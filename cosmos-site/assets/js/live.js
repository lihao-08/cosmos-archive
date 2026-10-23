/* ============================================================
   寰宇 COSMOS · live.js
   实时深空：EPIC 地球 / 小行星雷达 / 系外行星图鉴
   数据：assets/data/live.js（由 _tools/fetch_live.py 从 NASA 接口抓取）
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s) { return document.querySelector(s); };
  var $$ = C.$$ || function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  var LIVE = window.LIVE;
  if (!LIVE) {
    console.warn("[live] 缺少 assets/data/live.js，请先运行 _tools/fetch_live.py");
    return;
  }

  /* ---------- 提示框跟随定位（两处画布共用） ---------- */
  function placeTip(tip, evt, rect) {
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var x = evt.clientX - rect.left + 14;
    var y = evt.clientY - rect.top + 14;
    if (x + tw > rect.width) x = evt.clientX - rect.left - tw - 14;
    if (y + th > rect.height) y = evt.clientY - rect.top - th - 14;
    tip.style.left = Math.max(4, x) + "px";
    tip.style.top = Math.max(4, y) + "px";
  }

  /* ============================================================
     一、Tab 切换
     ============================================================ */
  var tabs = $$(".ltab");
  var panels = {
    earth: $("#panel-earth"),
    events: $("#panel-events"),
    sun: $("#panel-sun"),
    launch: $("#panel-launch"),
    neo: $("#panel-neo"),
    exo: $("#panel-exo")
  };
  var drawn = { neo: false, exo: false, events: false, sun: false, launch: false };

  tabs.forEach(function (btn) {
    btn.addEventListener("click", function () {
      var key = btn.getAttribute("data-tab");
      tabs.forEach(function (b) {
        var on = b === btn;
        b.classList.toggle("active", on);
        b.setAttribute("aria-selected", on ? "true" : "false");
      });
      Object.keys(panels).forEach(function (k) {
        if (panels[k]) panels[k].classList.toggle("active", k === key);
      });
      // 首次切到时再绘制，避免隐藏状态下 canvas 尺寸为 0
      if (key === "neo" && !drawn.neo) { drawn.neo = true; window.requestAnimationFrame(renderNeo); }
      if (key === "exo" && !drawn.exo) { drawn.exo = true; window.requestAnimationFrame(renderExo); }
      if (key === "events" && !drawn.events) { drawn.events = true; window.requestAnimationFrame(renderEarthEvents); }
      if (key === "sun" && !drawn.sun) { drawn.sun = true; window.requestAnimationFrame(renderSun); }
      if (key === "launch" && !drawn.launch) { drawn.launch = true; window.requestAnimationFrame(renderLaunch); }
    });
  });

  /* ============================================================
     二、EPIC 地球回望
     ============================================================ */
  var epic = LIVE.epic;
  if (epic && epic.frames && epic.frames.length) {
    var frames = epic.frames;
    var img = $("#epicImg");
    var slider = $("#epicSlider");
    var timeBadge = $("#epicTime");
    var metaEl = $("#epicMeta");
    var dateEl = $("#epicDate");
    var playBtn = $("#epicPlay");
    var idx = 0;
    var timer = 0;

    slider.max = String(frames.length - 1);
    // 标注数据滞后天数：EPIC 由卫星回传后按天发布，天然比实时晚 1-3 天
    var epicDay = new Date(epic.date + "T00:00:00Z");
    var lag = Math.max(0, Math.floor((Date.now() - epicDay.getTime()) / 86400000));
    dateEl.textContent = epic.date.replace(/-/g, " / ") + (lag > 0 ? " · " + lag + " 天前" : " · 今天");

    function showEpic(i) {
      idx = (i + frames.length) % frames.length;
      var f = frames[idx];
      img.classList.add("swapping");
      var pre = new Image();
      pre.onload = function () {
        img.src = pre.src;
        img.classList.remove("swapping");
      };
      pre.src = f.src;
      timeBadge.textContent = f.t + " UTC";
      slider.value = String(idx);
      var latTxt = Math.abs(f.lat).toFixed(1) + "°" + (f.lat >= 0 ? "N" : "S");
      var lonTxt = Math.abs(f.lon).toFixed(1) + "°" + (f.lon >= 0 ? "E" : "W");
      metaEl.textContent = "太阳直射点 " + latTxt + " " + lonTxt + "（" + (idx + 1) + "/" + frames.length + "）";
    }

    slider.addEventListener("input", function () {
      stopEpic();
      showEpic(parseInt(slider.value, 10) || 0);
    });

    function stopEpic() {
      if (timer) { clearInterval(timer); timer = 0; }
      playBtn.textContent = "▶ 播放一天";
      playBtn.classList.remove("playing");
    }
    playBtn.addEventListener("click", function () {
      if (timer) { stopEpic(); return; }
      playBtn.textContent = "⏸ 暂停";
      playBtn.classList.add("playing");
      timer = setInterval(function () { showEpic(idx + 1); }, 900);
    });

    showEpic(0);
  }

  /* ============================================================
     三、小行星雷达
     ============================================================ */
  var neo = LIVE.neo;
  var neoCanvas = $("#neoCanvas");
  var neoTip = $("#neoTip");
  var neoHits = [];   // 命中检测用

  // 估算直径（km）：由绝对星等 H 和反照率 0.14 反推
  function neoDiameter(h) {
    if (h === null || h === undefined || h === "") return null;
    var H = parseFloat(h);
    if (!isFinite(H)) return null;
    return 1329 / Math.sqrt(0.14) * Math.pow(10, -H / 5);
  }

  // JPL CAD 的日期格式是 "2026-Oct-23 08:34"，不是 ISO，Date 解析不了 → 手动转时间戳
  var MON = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  function cadTime(s) {
    var m = /^(\d{4})-([A-Za-z]{3})-(\d{1,2})[ T](\d{1,2}):(\d{2})/.exec(s || "");
    if (!m || MON[m[2]] === undefined) return null;
    return Date.UTC(+m[1], MON[m[2]], +m[3], +m[4], +m[5]);
  }

  function fmtKm(au) {
    var km = au * 149597870.7;
    if (km >= 1e8) return (km / 1e8).toFixed(2) + " 亿 km";
    if (km >= 1e4) return Math.round(km / 1e4) + " 万 km";
    return Math.round(km) + " km";
  }

  function renderNeo() {
    if (!neo || !neoCanvas || !neo.items || !neo.items.length) return;
    var ctx = neoCanvas.getContext("2d");
    var W = neoCanvas.width, H = neoCanvas.height;
    var cx = W / 2, cy = H / 2 + 6;
    var R0 = 74, RMAX = Math.min(W, H) / 2 - 52;

    var items = neo.items;
    var dMin = 0.0004;   // 约 6 万 km
    var dMax = 0.1;      // 0.1 AU（更远的点压缩到外缘，聚焦真正靠近的）
    var days = neo.days || 30;

    function d2r(au) {
      var t = (Math.log(Math.max(au, dMin)) - Math.log(dMin)) / (Math.log(dMax) - Math.log(dMin));
      t = Math.max(0, Math.min(1, t));
      return R0 + t * (RMAX - R0);
    }
    // 日期 → 角度（顶部起，顺时针）
    var day0 = null;
    items.forEach(function (it) {
      var t = cadTime(it.d);
      if (t !== null && (day0 === null || t < day0)) day0 = t;
    });
    if (day0 === null) day0 = Date.now();

    ctx.clearRect(0, 0, W, H);

    // 距离参考环
    var rings = [
      { v: 0.00257, label: "月球轨道", color: "rgba(232, 200, 122, 0.55)", dash: true, la: 158 },
      { v: 0.01, label: "0.01 AU", color: "rgba(148, 163, 184, 0.16)", la: -124 },
      { v: 0.05, label: "0.05 AU", color: "rgba(148, 163, 184, 0.16)", la: -74 },
      { v: 0.1, label: "0.1 AU", color: "rgba(148, 163, 184, 0.16)", la: -30 }
    ];
    ctx.font = "11px system-ui, 'Microsoft YaHei', sans-serif";
    rings.forEach(function (r) {
      var rad = d2r(r.v);
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.strokeStyle = r.color;
      ctx.lineWidth = r.dash ? 1.2 : 1;
      ctx.setLineDash(r.dash ? [4, 5] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      var la = r.la * Math.PI / 180;
      var lx = cx + Math.cos(la) * rad;
      var ly = cy + Math.sin(la) * rad;
      ctx.fillStyle = r.dash ? "rgba(232, 200, 122, 0.9)" : "rgba(139, 152, 173, 0.8)";
      ctx.textAlign = Math.cos(la) < -0.2 ? "right" : "left";
      ctx.fillText(r.label, lx + (Math.cos(la) < -0.2 ? -6 : 6), ly - 5);
      ctx.textAlign = "left";
    });

    // 日期刻度（每 7 天）
    for (var dd = 0; dd <= days; dd += 7) {
      var ang = -Math.PI / 2 + (dd / days) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(ang) * (R0 - 8), cy + Math.sin(ang) * (R0 - 8));
      ctx.lineTo(cx + Math.cos(ang) * (RMAX + 10), cy + Math.sin(ang) * (RMAX + 10));
      ctx.strokeStyle = "rgba(148, 163, 184, 0.12)";
      ctx.lineWidth = 1;
      ctx.stroke();
      var lx = cx + Math.cos(ang) * (RMAX + 26);
      var ly = cy + Math.sin(ang) * (RMAX + 26);
      ctx.fillStyle = "rgba(139, 152, 173, 0.9)";
      ctx.textAlign = "center";
      ctx.fillText(dd === 0 ? "今天" : "+" + dd + "天", lx, ly + 4);
      ctx.textAlign = "left";
    }

    // 地球
    var eg = ctx.createRadialGradient(cx, cy, 0, cx, cy, 26);
    eg.addColorStop(0, "rgba(76, 154, 255, 0.9)");
    eg.addColorStop(0.4, "rgba(56, 120, 220, 0.35)");
    eg.addColorStop(1, "rgba(56, 120, 220, 0)");
    ctx.fillStyle = eg;
    ctx.beginPath();
    ctx.arc(cx, cy, 26, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#4c9aff";
    ctx.beginPath();
    ctx.arc(cx, cy, 6, 0, Math.PI * 2);
    ctx.fill();

    // 小行星点
    neoHits = [];
    items.forEach(function (it) {
      var t = cadTime(it.d);
      if (t === null) return;
      var frac = (t - day0) / 86400000 / days;
      var ang = -Math.PI / 2 + frac * Math.PI * 2;
      var rad = d2r(it.au);
      var x = cx + Math.cos(ang) * rad;
      var y = cy + Math.sin(ang) * rad;
      if (!isFinite(x) || !isFinite(y)) return;

      var Hv = parseFloat(it.h);
      if (!isFinite(Hv)) Hv = 24;
      var size = Math.max(2.2, Math.min(7, 12.5 - (Hv - 19) * 0.8));
      var close = it.au < 0.05;
      var far = it.au > 0.1;
      var color = close ? "#f87171" : (it.au < 0.1 ? "#fbbf24" : "#38bdf8");
      var alpha = far ? 0.3 : 1;

      ctx.globalAlpha = alpha;
      var g = ctx.createRadialGradient(x, y, 0, x, y, size * 1.9);
      g.addColorStop(0, color + "aa");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, size * 1.9, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x, y, far ? 1.9 : size, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      neoHits.push({ x: x, y: y, r: size + 5, it: it });
    });

    // 统计
    var closest = items[0];
    var within5 = items.filter(function (i) { return i.au < 0.05; }).length;
    var within1 = items.filter(function (i) { return i.au < 0.01; }).length;
    var statBox = $("#neoStats");
    if (statBox) {
      statBox.innerHTML =
        '<div class="nstat"><b>' + items.length + '</b><span>未来 ' + days + ' 天接近</span></div>' +
        '<div class="nstat"><b>' + within5 + '</b><span>进入 0.05 AU</span></div>' +
        '<div class="nstat"><b>' + within1 + '</b><span>进入 0.01 AU</span></div>';
    }

    // 列表（最近 12 颗）
    var listEl = $("#neoList");
    if (listEl) {
      listEl.innerHTML = items.slice(0, 12).map(function (it) {
        var mm = it.au * 149597870.7;
        var soon = it.au < 0.05;
        return '<li><span class="n-name">' + it.n + '</span>' +
          '<span class="n-dist' + (soon ? " soon" : "") + '">' + fmtKm(it.au) + '</span></li>';
      }).join("");
    }
  }

  if (neoCanvas) {
    neoCanvas.addEventListener("mousemove", function (e) {
      var rect = neoCanvas.getBoundingClientRect();
      var scale = neoCanvas.width / rect.width;
      var mx = (e.clientX - rect.left) * scale;
      var my = (e.clientY - rect.top) * scale;
      var hit = null;
      for (var i = 0; i < neoHits.length; i++) {
        var h = neoHits[i];
        if (Math.hypot(mx - h.x, my - h.y) <= h.r) { hit = h; break; }
      }
      if (!hit) { neoTip.hidden = true; return; }
      var it = hit.it;
      var dia = neoDiameter(it.h);
      // 叠加 SBDB 档案（轨道要素）
      var sb = null;
      var sbdb = (window.EXTRA && window.EXTRA.sbdb) || [];
      for (var k = 0; k < sbdb.length; k++) {
        if (sbdb[k].n === it.n) { sb = sbdb[k]; break; }
      }
      var orbitLine = "";
      if (sb && sb.a) {
        orbitLine = "轨道半长轴 " + sb.a.toFixed(3) + " AU · 偏心率 " + (sb.e || 0).toFixed(3) +
          " · 倾角 " + (sb.i || 0).toFixed(1) + "°" +
          (sb.per ? "<br>公转周期 " + (sb.per / 365.25).toFixed(1) + " 年" : "");
        if (sb.diam) orbitLine += " · 直径 " + sb.diam.toFixed(2) + " km";
      }

      neoTip.innerHTML = "<b>" + it.n + "</b><br>" +
        "最近距离 " + fmtKm(it.au) + "（" + it.au.toFixed(4) + " AU）<br>" +
        "相对速度 " + it.v.toFixed(1) + " km/s" +
        (dia ? "<br>估算直径 " + (dia < 1 ? dia.toFixed(2) + " km" : Math.round(dia) + " km") : "") +
        (orbitLine ? "<br>" + orbitLine : "") +
        "<br><span style=\"color:#8b98ad\">" + it.d + " UTC</span>";
      neoTip.hidden = false;
      placeTip(neoTip, e, rect);
    });
    neoCanvas.addEventListener("mouseleave", function () { neoTip.hidden = true; });
  }

  /* ============================================================
     四、系外行星图鉴
     ============================================================ */
  var exo = LIVE.exo;
  var exoCanvas = $("#exoCanvas");
  var exoTip = $("#exoTip");
  var exoHits = [];
  var exoOff = {};   // 被关闭的方法索引

  var EXO_COLORS = ["#38bdf8", "#a78bfa", "#fbbf24", "#4ade80", "#64748b"];
  var EXO_LABELS_CN = { "Transit": "凌星法", "Radial Velocity": "视向速度", "Microlensing": "微引力透镜", "Imaging": "直接成像", "其他": "其他方法" };

  function renderExo() {
    if (!exo || !exoCanvas || !exo.rows) return;
    var ctx = exoCanvas.getContext("2d");
    var W = exoCanvas.width, H = exoCanvas.height;
    var pad = { l: 62, r: 22, t: 18, b: 46 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;

    // 对数轴范围
    var xMin = Math.log10(0.3), xMax = Math.log10(20000);
    var yMin = Math.log10(0.3), yMax = Math.log10(25);
    function px(period) { return pad.l + (Math.log10(period) - xMin) / (xMax - xMin) * iw; }
    function py(rade) { return pad.t + ih - (Math.log10(rade) - yMin) / (yMax - yMin) * ih; }

    ctx.clearRect(0, 0, W, H);

    // 网格
    var xTicks = [0.3, 1, 3, 10, 30, 100, 365, 1000, 5000, 20000];
    var yTicks = [0.3, 0.5, 1, 2, 4, 8, 15, 25];
    ctx.font = "11.5px system-ui, 'Microsoft YaHei', sans-serif";
    ctx.strokeStyle = "rgba(148, 163, 184, 0.1)";
    ctx.lineWidth = 1;
    xTicks.forEach(function (t) {
      var x = px(t);
      ctx.beginPath(); ctx.moveTo(x, pad.t); ctx.lineTo(x, pad.t + ih); ctx.stroke();
    });
    yTicks.forEach(function (t) {
      var y = py(t);
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
    });

    // 参考天体
    var refs = [
      { name: "地球", p: 365.25, r: 1, c: "rgba(76, 154, 255, 0.9)" },
      { name: "木星", p: 4332.6, r: 11.21, c: "rgba(226, 114, 91, 0.9)" },
      { name: "海王星", p: 60190, r: 3.88, c: "rgba(96, 130, 220, 0.7)" }
    ];
    refs.forEach(function (rf) {
      if (rf.p > 20000) return;
      var x = px(rf.p), y = py(rf.r);
      ctx.strokeStyle = rf.c;
      ctx.lineWidth = 1.2;
      ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
      // 标签加描边，避免被密集数据点淹没
      ctx.font = "11.5px system-ui, 'Microsoft YaHei', sans-serif";
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(2, 4, 12, 0.92)";
      ctx.strokeText(rf.name, x + 9, y + 4);
      ctx.fillStyle = rf.c;
      ctx.fillText(rf.name, x + 9, y + 4);
    });

    // 数据点
    exoHits = [];
    var rows = exo.rows;
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i];
      var mi = r[5];
      if (exoOff[mi]) continue;
      var period = r[2], rade = r[3];
      if (!(period > 0) || !(rade > 0)) continue;
      if (period < 0.3 || period > 20000 || rade < 0.3 || rade > 25) continue;
      var x = px(period), y = py(rade);
      ctx.fillStyle = EXO_COLORS[mi] || "#64748b";
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(x, y, 1.7, 0, Math.PI * 2);
      ctx.fill();
      exoHits.push({ x: x, y: y, row: r });
    }
    ctx.globalAlpha = 1;

    // 轴标签
    ctx.fillStyle = "rgba(139, 152, 173, 0.95)";
    ctx.textAlign = "center";
    xTicks.forEach(function (t) {
      var lbl = t === 365 ? "1 年" : (t >= 1000 ? (t / 365).toFixed(0) + " 年" : t + " 天");
      ctx.fillText(lbl, px(t), pad.t + ih + 20);
    });
    ctx.textAlign = "right";
    yTicks.forEach(function (t) {
      ctx.fillText(t + " R⊕", pad.l - 9, py(t) + 4);
    });
    ctx.textAlign = "left";
    ctx.fillStyle = "rgba(139, 152, 173, 0.75)";
    ctx.fillText("公转周期 →", pad.l + iw / 2 - 30, H - 6);
    ctx.save();
    ctx.translate(15, pad.t + ih / 2 + 20);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText("行星半径 →", 0, 0);
    ctx.restore();

    // 图例
    var legend = $("#exoLegend");
    if (legend) {
      var counts = {};
      rows.forEach(function (r) { counts[r[5]] = (counts[r[5]] || 0) + 1; });
      legend.innerHTML = (exo.methods || []).map(function (m, k) {
        return '<div class="lg' + (exoOff[k] ? " off" : "") + '" data-m="' + k + '">' +
          '<i style="background:' + (EXO_COLORS[k] || "#64748b") + '"></i>' +
          (EXO_LABELS_CN[m] || m) + '<em>' + (counts[k] || 0) + '</em></div>';
      }).join("");
      $$(".lg", legend).forEach(function (el) {
        el.addEventListener("click", function () {
          var k = parseInt(el.getAttribute("data-m"), 10);
          exoOff[k] = !exoOff[k];
          el.classList.toggle("off", !!exoOff[k]);
          renderExo();
        });
      });
    }

    // 统计
    var statsEl = $("#exoStats");
    if (statsEl) {
      var years = rows.map(function (r) { return r[1]; }).filter(Boolean);
      var latest = years.length ? Math.max.apply(null, years) : null;
      statsEl.innerHTML =
        '<div class="nstat"><b>' + exo.count + '</b><span>已确认系外行星</span></div>' +
        '<div class="nstat"><b>' + (latest || "—") + '</b><span>最新发现年份</span></div>';
    }
  }

  if (exoCanvas) {
    exoCanvas.addEventListener("mousemove", function (e) {
      var rect = exoCanvas.getBoundingClientRect();
      var scale = exoCanvas.width / rect.width;
      var mx = (e.clientX - rect.left) * scale;
      var my = (e.clientY - rect.top) * scale;
      var best = null, bestD = 7 * 7;
      for (var i = 0; i < exoHits.length; i++) {
        var h = exoHits[i];
        var dx = mx - h.x, dy = my - h.y;
        var d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = h; }
      }
      if (!best) { exoTip.hidden = true; return; }
      var r = best.row;
      var method = (exo.methods && exo.methods[r[5]]) || "";
      exoTip.innerHTML = "<b>" + r[0] + "</b><br>" +
        "公转周期 " + (r[2] >= 365 ? (r[2] / 365.25).toFixed(1) + " 年" : r[2].toFixed(2) + " 天") + "<br>" +
        "半径 " + r[3].toFixed(2) + " R⊕" +
        (r[4] ? " · 质量 " + r[4].toFixed(1) + " M⊕" : "") +
        "<br>发现 " + (r[1] || "—") + " · " + (EXO_LABELS_CN[method] || method) +
        (r[6] ? "<br><span style=\"color:#8b98ad\">距地 " + r[6].toFixed(1) + " 秒差距</span>" : "");
      exoTip.hidden = false;
      placeTip(exoTip, e, rect);
    });
    exoCanvas.addEventListener("mouseleave", function () { exoTip.hidden = true; });
  }

  /* ============================================================
     五、地球事件（NASA EONET）
     ============================================================ */
  var EXTRA = window.EXTRA;
  var eoCanvas = $("#eoCanvas");
  var eoTip = $("#eoTip");
  var eoHits = [];

  var EO_COLORS = {
    "Wildfires": "#f97316",
    "Severe Storms": "#38bdf8",
    "Sea and Lake Ice": "#a5d8f3",
    "Volcanoes": "#ef4444",
    "Dust and Haze": "#d4b483",
    "Floods": "#3b82f6"
  };
  var EO_LABELS = {
    "Wildfires": "野火",
    "Severe Storms": "强风暴",
    "Sea and Lake Ice": "海冰",
    "Volcanoes": "火山",
    "Dust and Haze": "沙尘",
    "Floods": "洪水"
  };
  function eoLabel(c) { return EO_LABELS[c] || c || "其他"; }
  function eoColor(c) { return EO_COLORS[c] || "#94a3b8"; }

  function renderEarthEvents() {
    var events = (EXTRA && EXTRA.eonet) || [];
    if (!eoCanvas || !events.length) return;

    var ctx = eoCanvas.getContext("2d");
    var W = eoCanvas.width, H = eoCanvas.height;
    var padL = 46, padR = 20, padT = 20, padB = 30;

    function px(lon) { return padL + (lon + 180) / 360 * (W - padL - padR); }
    function py(lat) { return padT + (90 - lat) / 180 * (H - padT - padB); }

    ctx.clearRect(0, 0, W, H);

    // 经纬网格
    ctx.strokeStyle = "rgba(148,163,184,0.13)";
    ctx.lineWidth = 1;
    ctx.font = "10.5px system-ui, 'Microsoft YaHei', sans-serif";
    for (var lon = -180; lon <= 180; lon += 30) {
      ctx.beginPath();
      ctx.moveTo(px(lon), padT);
      ctx.lineTo(px(lon), H - padB);
      ctx.stroke();
      if (lon % 60 === 0) {
        ctx.fillStyle = "rgba(139,152,173,0.55)";
        ctx.textAlign = "center";
        ctx.fillText((lon === 0 ? "0°" : Math.abs(lon) + "°" + (lon > 0 ? "E" : "W")), px(lon), H - 9);
      }
    }
    for (var lat = -60; lat <= 60; lat += 30) {
      var strong = lat === 0;
      ctx.strokeStyle = strong ? "rgba(56,189,248,0.28)" : "rgba(148,163,184,0.13)";
      ctx.beginPath();
      ctx.moveTo(padL, py(lat));
      ctx.lineTo(W - padR, py(lat));
      ctx.stroke();
      ctx.fillStyle = strong ? "rgba(56,189,248,0.8)" : "rgba(139,152,173,0.55)";
      ctx.textAlign = "right";
      ctx.fillText((lat === 0 ? "赤道" : Math.abs(lat) + "°" + (lat > 0 ? "N" : "S")), padL - 8, py(lat) + 3.5);
    }
    ctx.textAlign = "left";

    // 事件点
    eoHits = [];
    events.forEach(function (ev) {
      var x = px(ev.lon), y = py(ev.lat);
      var c = eoColor(ev.cat);

      var g = ctx.createRadialGradient(x, y, 0, x, y, 10);
      g.addColorStop(0, c + "aa");
      g.addColorStop(1, c + "00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, 10, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(x, y, 3.4, 0, Math.PI * 2);
      ctx.fill();

      eoHits.push({ x: x, y: y, ev: ev });
    });

    // 统计与图例
    var counts = {};
    events.forEach(function (e) { counts[e.cat] = (counts[e.cat] || 0) + 1; });
    var legend = $("#eoLegend");
    if (legend) {
      legend.innerHTML = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; })
        .map(function (k) {
          return '<div class="lg"><i style="background:' + eoColor(k) + '"></i>' +
            eoLabel(k) + '<em>' + counts[k] + "</em></div>";
        }).join("") +
        '<div class="lg eo-total"><i style="background:transparent"></i>合计<em>' + events.length + "</em></div>";
    }

    var listEl = $("#eoList");
    if (listEl) {
      listEl.innerHTML = events.slice(0, 12).map(function (ev) {
        return '<li><span class="n-name">' + ev.title + "</span>" +
          '<span class="n-dist" style="color:' + eoColor(ev.cat) + '">' + eoLabel(ev.cat) + "</span></li>";
      }).join("");
    }
  }

  if (eoCanvas) {
    eoCanvas.addEventListener("mousemove", function (e) {
      var rect = eoCanvas.getBoundingClientRect();
      var scale = eoCanvas.width / rect.width;
      var mx = (e.clientX - rect.left) * scale;
      var my = (e.clientY - rect.top) * scale;
      var hit = null, best = 12 * 12;
      for (var i = 0; i < eoHits.length; i++) {
        var h = eoHits[i];
        var dx = mx - h.x, dy = my - h.y, d = dx * dx + dy * dy;
        if (d < best) { best = d; hit = h; }
      }
      if (!hit) { eoTip.hidden = true; return; }
      var ev = hit.ev;
      eoTip.innerHTML = "<b>" + ev.title + "</b><br>" +
        eoLabel(ev.cat) + " · " + (ev.date || "—") + "<br>" +
        '<span style="color:#8b98ad">' + Math.abs(ev.lat).toFixed(1) + "°" + (ev.lat >= 0 ? "N" : "S") + " " +
        Math.abs(ev.lon).toFixed(1) + "°" + (ev.lon >= 0 ? "E" : "W") + "</span>";
      eoTip.hidden = false;
      placeTip(eoTip, e, rect);
    });
    eoCanvas.addEventListener("mouseleave", function () { eoTip.hidden = true; });
  }

  /* ============================================================
     六、太阳活动（NASA SDO + NOAA SWPC）
     ============================================================ */
  var G = window.GLOBAL;
  var sunCanvas = $("#swCanvas");
  var sunWaveBox = $("#sunWaves");
  var sunImg = $("#sunImg");

  function renderSun() {
    if (!G) return;

    // ---- 波段切换 ----
    var waves = G.sun || [];
    if (sunWaveBox && waves.length) {
      sunWaveBox.innerHTML = waves.map(function (w, i) {
        return '<button type="button" class="sw-btn' + (i === 0 ? " active" : "") + '" data-i="' + i +
          '"><b>' + w.wave + '</b><span>' + w.desc + "</span></button>";
      }).join("");
      $$(".sw-btn", sunWaveBox).forEach(function (b) {
        b.addEventListener("click", function () {
          $$(".sw-btn", sunWaveBox).forEach(function (x) { x.classList.remove("active"); });
          b.classList.add("active");
          var w = waves[parseInt(b.getAttribute("data-i"), 10)];
          if (w && sunImg) sunImg.src = w.src;
        });
      });
    }

    // ---- Kp / 太阳风曲线 ----
    if (!sunCanvas) return;
    var ctx = sunCanvas.getContext("2d");
    var W = sunCanvas.width, H = sunCanvas.height;
    var pad = { l: 34, r: 38, t: 16, b: 24 };
    var iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    var kp = (G.weather && G.weather.kp) || [];
    var wind = (G.weather && G.weather.wind) || [];
    if (!kp.length) return;

    ctx.clearRect(0, 0, W, H);

    // 网格
    ctx.font = "10.5px system-ui, 'Microsoft YaHei', sans-serif";
    ctx.strokeStyle = "rgba(148,163,184,0.1)";
    for (var k = 0; k <= 9; k += 3) {
      var y = pad.t + ih - (k / 9) * ih;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + iw, y); ctx.stroke();
      ctx.fillStyle = "rgba(139,152,173,0.65)";
      ctx.textAlign = "right";
      ctx.fillText(k, pad.l - 7, y + 3.5);
    }

    function kx(i) { return pad.l + (i / Math.max(1, kp.length - 1)) * iw; }
    function ky(v) { return pad.t + ih - (Math.min(v, 9) / 9) * ih; }

    // Kp 面积
    var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ih);
    grad.addColorStop(0, "rgba(245,158,11,0.32)");
    grad.addColorStop(1, "rgba(245,158,11,0.02)");
    ctx.beginPath();
    ctx.moveTo(pad.l, pad.t + ih);
    kp.forEach(function (p, i) { ctx.lineTo(kx(i), ky(p.k)); });
    ctx.lineTo(pad.l + iw, pad.t + ih);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Kp 线
    ctx.beginPath();
    kp.forEach(function (p, i) {
      if (i === 0) ctx.moveTo(kx(i), ky(p.k)); else ctx.lineTo(kx(i), ky(p.k));
    });
    ctx.strokeStyle = "#fbbf24";
    ctx.lineWidth = 1.8;
    ctx.stroke();

    // Kp≥5 的区段标红
    kp.forEach(function (p, i) {
      if (p.k >= 5) {
        ctx.fillStyle = "#f87171";
        ctx.beginPath();
        ctx.arc(kx(i), ky(p.k), 2.6, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // 太阳风（右轴 250-850 km/s）
    if (wind.length) {
      function wx(i) { return pad.l + (i / Math.max(1, wind.length - 1)) * iw; }
      function wy(v) { return pad.t + ih - ((Math.min(Math.max(v, 250), 850) - 250) / 600) * ih; }
      ctx.beginPath();
      wind.forEach(function (p, i) {
        if (i === 0) ctx.moveTo(wx(i), wy(p.v)); else ctx.lineTo(wx(i), wy(p.v));
      });
      ctx.strokeStyle = "rgba(56,189,248,0.75)";
      ctx.lineWidth = 1.3;
      ctx.stroke();

      ctx.fillStyle = "rgba(56,189,248,0.75)";
      ctx.textAlign = "left";
      ctx.fillText("太阳风 km/s", pad.l + iw + 6, pad.t + 10);
    }

    // 轴标注
    ctx.fillStyle = "rgba(251,191,36,0.9)";
    ctx.textAlign = "left";
    ctx.fillText("Kp 指数", pad.l + 4, pad.t + 10);
    ctx.fillStyle = "rgba(139,152,173,0.6)";
    ctx.textAlign = "center";
    if (kp[0]) ctx.fillText(kp[0].t, pad.l, H - 7);
    if (kp[kp.length - 1]) ctx.fillText(kp[kp.length - 1].t, pad.l + iw, H - 7);

    // 统计卡
    var stats = $("#swStats");
    if (stats) {
      var lastKp = kp[kp.length - 1].k;
      var maxKp = Math.max.apply(null, kp.map(function (p) { return p.k; }));
      var lastWind = wind.length ? wind[wind.length - 1].v : null;
      var level = lastKp >= 7 ? "强磁暴" : (lastKp >= 5 ? "地磁暴" : (lastKp >= 4 ? "活跃" : "平静"));
      stats.innerHTML =
        '<div class="nstat"><b>' + lastKp + "</b><span>当前 Kp（" + level + "）</span></div>" +
        '<div class="nstat"><b>' + maxKp + "</b><span>24h 峰值</span></div>" +
        (lastWind ? '<div class="nstat"><b>' + lastWind + '</b><span>太阳风 km/s</span></div>' : "");
    }
  }

  /* ============================================================
     七、全球发射日程（Launch Library 2）
     ============================================================ */
  function fmtUTC(iso) {
    if (!iso) return { date: "待定", time: "" };
    var d = new Date(iso);
    if (isNaN(d.getTime())) return { date: iso.slice(0, 10), time: "" };
    // 转北京时间
    var bj = new Date(d.getTime() + 8 * 3600 * 1000);
    var mm = ("0" + (bj.getUTCMonth() + 1)).slice(-2);
    var dd = ("0" + bj.getUTCDate()).slice(-2);
    var hh = ("0" + bj.getUTCHours()).slice(-2);
    var mi = ("0" + bj.getUTCMinutes()).slice(-2);
    return { date: bj.getUTCFullYear() + "-" + mm + "-" + dd, time: hh + ":" + mi };
  }

  // 机构名归一化（原始名太长，右侧列表会截断）
  var AGENCY_CN = [
    ["China Aerospace Science and Technology", "中国航天 CASC"],
    ["China Aerospace", "中国航天"],
    ["Russian Federal Space Agency", "俄罗斯航天"],
    ["Russian Space Agency", "俄罗斯航天"],
    ["Japan Aerospace Exploration Agency", "日本 JAXA"],
    ["Indian Space Research Organization", "印度 ISRO"],
    ["United Launch Alliance", "ULA"],
    ["Arianespace", "阿丽亚娜空间"],
    ["Rocket Lab", "Rocket Lab"],
    ["SpaceX", "SpaceX"],
    ["Blue Origin", "蓝色起源"],
    ["Northrop Grumman", "诺格"],
    ["European Space Agency", "欧空局 ESA"],
    ["Israel Aerospace Industries", "以色列 IAI"],
    ["Korea Aerospace Research Institute", "韩国 KARI"]
  ];
  function agencyCN(name) {
    if (!name) return "未知";
    for (var i = 0; i < AGENCY_CN.length; i++) {
      if (name.indexOf(AGENCY_CN[i][0]) >= 0) return AGENCY_CN[i][1];
    }
    return name.length > 18 ? name.slice(0, 18) + "…" : name;
  }

  function renderLaunch() {
    if (!G || !G.launch) return;
    var items = G.launch.items || [];
    var listEl = $("#launchList");
    if (!listEl) return;

    var statusClass = { "Go": "go", "TBD": "tbd", "Hold": "hold", "In Flight": "go", "Success": "go" };

    listEl.innerHTML = items.map(function (x, i) {
      var t = fmtUTC(x.net);
      var sc = statusClass[x.status] || "tbd";
      return '<li class="launch-item">' +
        '<div class="li-when"><b>' + t.date.slice(5) + '</b><span>' + t.time + "</span></div>" +
        '<div class="li-body">' +
        '<div class="li-top"><span class="li-status ' + sc + '">' + (x.status || "TBD") + "</span>" +
        '<span class="li-agency">' + agencyCN(x.lsp) + "</span></div>" +
        '<div class="li-name">' + (x.name || "—") + "</div>" +
        '<div class="li-meta">' + (x.pad ? x.pad + " · " : "") + (x.loc || "") + "</div>" +
        "</div></li>";
    }).join("");

    // 统计
    var stats = $("#launchStats");
    if (stats) {
      var agencies = {};
      items.forEach(function (x) { var a = agencyCN(x.lsp); agencies[a] = (agencies[a] || 0) + 1; });
      var top = Object.keys(agencies).sort(function (a, b) { return agencies[b] - agencies[a]; });
      stats.innerHTML =
        '<div class="nstat"><b>' + (G.launch.total || items.length) + '</b><span>全球待发射</span></div>' +
        '<div class="nstat"><b>' + top.length + '</b><span>家机构</span></div>';

      var agBox = $("#launchAgencies");
      if (agBox) {
        agBox.innerHTML = top.slice(0, 6).map(function (a) {
          return '<div class="lg"><i style="background:var(--cyan)"></i>' + a + "<em>" + agencies[a] + "</em></div>";
        }).join("");
      }
    }
  }

  /* ============================================================
     八、滚动进入视口时自动绘制（tab 已激活的情况）
     ============================================================ */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        if (en.target === neoCanvas && !drawn.neo) { drawn.neo = true; renderNeo(); }
        if (en.target === exoCanvas && !drawn.exo) { drawn.exo = true; renderExo(); }
        if (en.target === eoCanvas && !drawn.events) { drawn.events = true; renderEarthEvents(); }
        if (en.target === sunCanvas && !drawn.sun) { drawn.sun = true; renderSun(); }
        io.unobserve(en.target);
      });
    }, { threshold: 0.15 });
    if (neoCanvas) io.observe(neoCanvas);
    if (exoCanvas) io.observe(exoCanvas);
    if (eoCanvas) io.observe(eoCanvas);
    if (sunCanvas) io.observe(sunCanvas);
  }
})();
