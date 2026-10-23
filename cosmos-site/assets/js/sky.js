/* ============================================================
   寰宇 COSMOS · sky.js
   今晚观天指南（月相 / 日月出没 / 行星可见性）+ 天象预告
   依赖：assets/js/astro.js（window.astro）、assets/js/core.js（window.COSMOS）
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };
  var astro = window.astro;
  if (!astro) return;

  /* ============================================================
     二、今晚观天指南
     ============================================================ */
  var city = { lat: 39.13, lon: 117.20, name: "天津" };
  var TZ = 8;

  function tonightJd(hourLocal) {
    // 当地时刻（小时，可 >24 表示次日）-> JD
    var now = new Date();
    var y = now.getFullYear(), m = now.getMonth(), d = now.getDate();
    var h = hourLocal - TZ; // UTC 小时
    return Date.UTC(y, m, d, 0, 0, 0) / 86400000 + 2440587.5 + h / 24;
  }
  function fmtHour(h) {
    var hh = Math.floor(h) % 24;
    var mm = Math.round((h - Math.floor(h)) * 60);
    if (mm === 60) { hh += 1; mm = 0; }
    return (hh < 10 ? "0" : "") + hh + ":" + (mm < 10 ? "0" : "") + mm;
  }
  function jdToLocalHour(jd) {
    return ((jd + 0.5) % 1) * 24 + TZ;
  }
  function jdToLocalHm(jd) {
    return fmtHour(jdToLocalHour(jd));
  }
  function azimuthName(az) {
    var names = ["北", "东北", "东", "东南", "南", "西南", "西", "西北"];
    return names[Math.round(az / 45) % 8];
  }

  function moonRiseSet(jd0ut) {
    // 月亮出没（上边缘 -0.125° 地平高度，两次迭代修正月球位移）
    var r = null;
    for (var it = 0; it < 2; it++) {
      var m = astro.moonGeo(it === 0 ? jd0ut + 0.5 : (r && r.rise ? r.rise : jd0ut + 0.5));
      r = astro.riseSet(jd0ut, city.lat, city.lon, TZ, -0.125, m.ra, m.dec);
      if (!r.rise) break;
    }
    return r;
  }

  function renderTonight() {
    var hour = parseFloat($("#timeSlider").value);
    $("#timeVal").textContent = fmtHour(hour);
    var jd = tonightJd(hour);

    /* ---- 月相 ---- */
    var ph = astro.moonPhase(jd);
    $("#moonPhaseName").textContent = ph.phaseName;
    $("#moonAge").textContent = ph.age.toFixed(1);
    $("#moonIllum").textContent = (ph.illum * 100).toFixed(0) + "%";
    var mr = moonRiseSet(Math.floor(jd - 0.5) + 0.5);
    $("#moonRise").textContent = mr.rise ? jdToLocalHm(mr.rise) : "全天可见/不可见";
    $("#moonSet").textContent = mr.set ? jdToLocalHm(mr.set) : "—";
    drawMoon(ph.illum, ph.age < astro.SYNODIC / 2);

    /* ---- 太阳 ---- */
    var jd0 = Math.floor(jd - 0.5) + 0.5;
    var sr = astro.sunRiseSet(jd0, city.lat, city.lon, TZ);
    if (sr.rise) {
      $("#sunRise").textContent = jdToLocalHm(sr.rise);
      $("#sunSet").textContent = jdToLocalHm(sr.set);
      $("#sunNoon").textContent = jdToLocalHm(sr.transit);
      // 天文暮光（太阳高度 -18°）
      var m = astro.sunGeo(sr.transit);
      var dusk = astro.riseSet(jd0, city.lat, city.lon, TZ, -18, m.ra, m.dec);
      var dawn = astro.riseSet(jd0, city.lat, city.lon, TZ, -18, m.ra, m.dec);
      var duskEnd = dusk.set, dawnStart = dawn.rise;
      var dark = (jd0 + 1 - duskEnd) + (dawnStart - jd0);
      $("#darkWindow").textContent =
        jdToLocalHm(duskEnd) + " → " + jdToLocalHm(dawnStart) + "（" + (dark * 24).toFixed(1) + " 小时）";
    } else {
      $("#sunRise").textContent = sr.always === "up" ? "极昼" : "极夜";
      $("#sunSet").textContent = "—";
      $("#sunNoon").textContent = "—";
      $("#darkWindow").textContent = "—";
    }

    /* ---- 行星表 ---- */
    var tbody = $("#planetTableBody");
    tbody.innerHTML = "";
    var visible = [];
    ["mercury", "venus", "mars", "jupiter", "saturn", "uranus", "neptune"].forEach(function (name) {
      var g = astro.planetGeo(name, jd);
      var aa = astro.altAz(g.ra, g.dec, jd, city.lat, city.lon);
      var sun = astro.sunGeo(jd);
      var elong = Math.abs(astro.norm180(g.lon - sun.lon));
      var mag = astro.planetMagnitude(name, jd);
      var status, cls;
      if (aa.alt > 15) { status = "可见"; cls = "pt-status-ok"; }
      else if (aa.alt > 0) { status = "接近地平线"; cls = "pt-status-low"; }
      else if (elong < 12) { status = "白昼天区"; cls = "pt-status-no"; }
      else { status = "地平线下"; cls = "pt-status-no"; }
      if (aa.alt > 15) visible.push(astro.PLANET_NAMES[name] + "（" + azimuthName(aa.az) + "，" + mag.toFixed(1) + " 等）");

      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td data-label="行星"><span class="pt-name"><i class="pt-dot" style="background:' + astro.PLANET_COLORS[name] +
        ";color:" + astro.PLANET_COLORS[name] + '"></i>' + astro.PLANET_NAMES[name] + "</span></td>" +
        '<td class="pt-mag" data-label="视星等">' + mag.toFixed(1) + "</td>" +
        '<td data-label="所在方位">' + azimuthName(aa.az) + " " + Math.round(aa.az) + "°</td>" +
        '<td data-label="高度角">' + aa.alt.toFixed(1) + "°</td>" +
        '<td data-label="与太阳距角">' + elong.toFixed(0) + "°</td>" +
        '<td class="' + cls + '" data-label="状态">' + status + "</td>";
      tbody.appendChild(tr);
    });

    /* ---- 观测建议 ---- */
    var tip, sub;
    if (ph.illum > 0.62) {
      tip = "月相明亮（照亮 " + (ph.illum * 100).toFixed(0) + "%），适合赏月和看行星，但深空天体会受月光干扰。";
    } else if (ph.illum < 0.22) {
      tip = "接近新月（照亮 " + (ph.illum * 100).toFixed(0) + "%），整夜几乎无月光干扰，是观测星系星云的黄金窗口。";
    } else {
      tip = "月相中等（照亮 " + (ph.illum * 100).toFixed(0) + "%），月前后半夜适合行星，深空建议等月落后。";
    }
    sub = visible.length
      ? "当前时刻可见：" + visible.join("、") + "。"
      : "当前时刻五大行星均在地平线下，适合纯深空观测（若月相允许）。";
    if (mr.rise && mr.set) {
      var moonUp = (jd >= mr.rise && jd <= mr.set) || (jd >= mr.rise - 1 && jd <= mr.set - 1);
      sub += moonUp ? "月亮正在天上。" : "月亮已落下或不在此刻。";
    }
    $("#tipMain").textContent = tip;
    $("#tipSub").textContent = sub;
  }

  /* ---- 月相 SVG ---- */
  function drawMoon(k, waxing) {
    var R = 42, cx = 60, cy = 60;
    var rx = R * Math.abs(1 - 2 * k);
    var sweepOuter = waxing ? 1 : 0;
    var sweepInner;
    if (waxing) sweepInner = k < 0.5 ? 0 : 1;
    else sweepInner = k < 0.5 ? 1 : 0;
    var d;
    if (k < 0.005 || k > 0.995) {
      d = ""; // 新月：全暗
    } else {
      d = "M " + cx + " " + (cy - R) +
        " A " + R + " " + R + " 0 0 " + sweepOuter + " " + cx + " " + (cy + R) +
        " A " + rx.toFixed(2) + " " + R + " 0 0 " + sweepInner + " " + cx + " " + (cy - R) + " Z";
    }
    $("#moonLit").setAttribute("d", d);
  }

  $("#citySelect").addEventListener("change", function () {
    var v = this.value.split(",");
    city.lat = parseFloat(v[0]);
    city.lon = parseFloat(v[1]);
    city.name = this.options[this.selectedIndex].text;
    renderTonight();
  });
  $("#timeSlider").addEventListener("input", renderTonight);

  /* ============================================================
     三、天象预告
     ============================================================ */
  var METEOR_SHOWERS = [
    { name: "象限仪座流星雨", m: 1, d: 3, zhr: 110, note: "后半夜辐射点升高，冬季严寒注意保暖" },
    { name: "天琴座流星雨", m: 4, d: 22, zhr: 18, note: "21 时前后辐射点即从东北升起" },
    { name: "宝瓶座η流星雨", m: 5, d: 6, zhr: 50, note: "哈雷彗星尘埃，流星快而亮" },
    { name: "英仙座流星雨", m: 8, d: 12, zhr: 100, note: "暑期首选，流量稳定、火流星多" },
    { name: "猎户座流星雨", m: 10, d: 21, zhr: 20, note: "同为哈雷彗星尘埃，凌晨最佳" },
    { name: "狮子座流星雨", m: 11, d: 17, zhr: 15, note: "爆发年份可达数千，平常年流量一般" },
    { name: "双子座流星雨", m: 12, d: 14, zhr: 150, note: "年终大戏，流量大、速度中等" },
    { name: "小熊座流星雨", m: 12, d: 22, zhr: 10, note: "辐射点接近北极星，几乎不落" }
  ];

  var ECLIPSES = [
    { date: "2026-02-17", kind: "日环食", where: "南极洲", cn: false },
    { date: "2026-08-12", kind: "日全食", where: "格陵兰—冰岛—西班牙", cn: false },
    { date: "2027-02-06", kind: "日环食", where: "南美洲—大西洋—非洲", cn: false },
    { date: "2027-08-02", kind: "日全食", where: "西班牙—北非—埃及—沙特", cn: false },
    { date: "2028-01-26", kind: "日环食", where: "厄瓜多尔—巴西—大西洋—西欧", cn: false },
    { date: "2028-07-22", kind: "日全食", where: "澳大利亚—新西兰（悉尼可见）", cn: false }
  ];

  function renderEvents() {
    var now = new Date();
    var nowJd = astro.jdFromDate(now);
    var grid = $("#eventGrid");
    grid.innerHTML = "";
    var cards = [];

    // 冲日
    ["mars", "jupiter", "saturn", "uranus", "neptune"].forEach(function (name) {
      var opps = astro.oppositions(name, nowJd, nowJd + 800);
      if (opps.length) {
        var jd = opps[0];
        var g = astro.planetGeo(name, jd);
        var mag = astro.planetMagnitude(name, jd);
        cards.push({
          kind: "opp", kindLabel: "冲日",
          title: astro.PLANET_NAMES[name] + "冲日",
          date: astro.fmtJdLocal(jd, TZ, false),
          dateFull: astro.fmtJdLocal(jd, TZ, true),
          desc: "届时距地 " + g.r.toFixed(2) + " AU，亮度约 " + mag.toFixed(1) + " 等，整夜可见，是拍摄行星表面细节的最佳时机。",
          count: Math.round(jd - nowJd)
        });
      }
    });

    // 内行星大距
    ["mercury", "venus"].forEach(function (name) {
      var es = astro.greatestElongations(name, nowJd, nowJd + 800);
      if (es.length) {
        var e = es[0];
        cards.push({
          kind: "elong", kindLabel: "大距",
          title: astro.PLANET_NAMES[name] + (e.dir === "east" ? "东大距" : "西大距"),
          date: astro.fmtJdLocal(e.jd, TZ, false),
          dateFull: astro.fmtJdLocal(e.jd, TZ, true),
          desc: "与太阳距角 " + Math.abs(e.elong).toFixed(1) + "°，" +
            (e.dir === "east" ? "日落后出现在西方低空（昏星）" : "日出前出现在东方低空（晨星）") + "。",
          count: Math.round(e.jd - nowJd)
        });
      }
    });

    // 流星雨（含当晚月相干扰判断）
    METEOR_SHOWERS.forEach(function (s) {
      var y = now.getFullYear();
      var peak = new Date(Date.UTC(y, s.m - 1, s.d, 14, 0, 0)); // 极大 22:00 北京
      var peakJd = astro.jdFromDate(peak);
      if (peakJd < nowJd) {
        peak = new Date(Date.UTC(y + 1, s.m - 1, s.d, 14, 0, 0));
        peakJd = astro.jdFromDate(peak);
      }
      var ph = astro.moonPhase(peakJd);
      var moonNote = ph.illum > 0.55
        ? "当晚月照亮 " + (ph.illum * 100).toFixed(0) + "%，受月光干扰明显"
        : "当晚月照亮 " + (ph.illum * 100).toFixed(0) + "%，观测条件好";
      cards.push({
        kind: "rain", kindLabel: "流星雨",
        title: s.name,
        date: (peak.getUTCFullYear()) + " 年 " + s.m + " 月 " + s.d + " 日",
        dateFull: "",
        desc: "ZHR ≈ " + s.zhr + "（理想状态下每小时天顶流量）。" + s.note + "。" + moonNote + "。",
        count: Math.round(peakJd - nowJd)
      });
    });

    // 日月食
    ECLIPSES.forEach(function (e) {
      var parts = e.date.split("-");
      var jd = astro.jdFromDate(new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2], 6, 0, 0)));
      if (jd < nowJd) return;
      cards.push({
        kind: "ecl", kindLabel: "日月食",
        title: e.kind,
        date: e.date.replace(/-/g, " 年 ").replace(" 年 ", "-").replace("-", " 月 ") + " 日",
        dateFull: "",
        desc: "可见地区：" + e.where + "。中国不可见，可关注 NASA/ICO 网络直播。",
        count: Math.round(jd - nowJd)
      });
    });

    cards.sort(function (a, b) { return a.count - b.count; });
    cards.slice(0, 9).forEach(function (c) {
      var div = document.createElement("div");
      div.className = "event-card";
      var countText = c.count <= 0 ? "就在今晚前后" : "还有 " + c.count + " 天";
      div.innerHTML =
        '<span class="ec-kind ' + c.kind + '">' + c.kindLabel + "</span>" +
        "<b>" + c.title + "</b>" +
        '<span class="ec-date">' + c.date + "</span>" +
        "<p>" + c.desc + "</p>" +
        '<p class="ec-count">⏳ ' + countText + "</p>";
      grid.appendChild(div);
    });
  }

  /* ---------- 初始化 ---------- */
  // 默认观测时刻：当前若在 18:00-30:00 之间则取当前整点，否则 21:00
  (function () {
    var h = new Date().getHours() + new Date().getMinutes() / 60;
    if (h >= 18 || h < 6) {
      var v = Math.round(h);
      if (v < 6) v += 24;
      if (v >= 18 && v <= 30) $("#timeSlider").value = v;
    }
  })();

  renderTonight();
  renderEvents();

})();
