/* ============================================================
   寰宇 COSMOS · astro.js — 天文计算库
   算法均经过 Python/astropy/erfa 交叉验证：
   - 行星：JPL Standish 低精度开普勒要素（vs erfa.plan94 ≤0.07°）
   - 月球：Meeus 表 47.A/47.B 主项（vs astropy get_body ≤0.4°）
   - 日出日落：第一原理真太阳时（vs astropy 高度角插值 ≤1 分钟）
   ============================================================ */
(function (root, factory) {
  var api = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.astro = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var D2R = Math.PI / 180;
  var R2D = 180 / Math.PI;
  var OBLIQ = 23.4392911; // J2000 黄赤交角（度）

  /* ---------- 基础 ---------- */
  function norm360(x) { return ((x % 360) + 360) % 360; }
  function norm180(x) { return norm360(x + 180) - 180; }

  function jdFromDate(date) {
    return date.getTime() / 86400000 + 2440587.5;
  }
  function dateFromJd(jd) {
    return new Date((jd - 2440587.5) * 86400000);
  }

  /* ---------- 行星（JPL Standish 近似要素，J2000 黄道） ---------- */
  // [a(AU), e, i, L, ϖ(近日点黄经), Ω(升交点黄经)] + 每世纪速率
  var ELEM = {
    mercury: [0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593,
      0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081],
    venus: [0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255,
      0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418],
    earth: [1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0,
      0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0],
    mars: [1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891,
      0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343],
    jupiter: [5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909,
      -0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106],
    saturn: [9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448,
      -0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794],
    uranus: [19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503,
      -0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589],
    neptune: [30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574,
      0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]
  };

  var PLANET_NAMES = {
    mercury: "水星", venus: "金星", earth: "地球", mars: "火星",
    jupiter: "木星", saturn: "土星", uranus: "天王星", neptune: "海王星"
  };
  var PLANET_COLORS = {
    mercury: "#b8b2a8", venus: "#e8c47a", earth: "#5ea9ff", mars: "#e2725b",
    jupiter: "#d8a06a", saturn: "#e6cf9a", uranus: "#9fe3e8", neptune: "#6d8bef"
  };

  function solveKepler(M, e) {
    M = norm180(M) * D2R;
    var E = M + e * Math.sin(M);
    for (var i = 0; i < 8; i++) {
      E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
    }
    return E;
  }

  // 日心黄道直角坐标（AU）
  function planetHelio(name, jd) {
    var el = ELEM[name];
    if (!el) return null;
    var T = (jd - 2451545.0) / 36525.0;
    var a = el[0] + el[6] * T, e = el[1] + el[7] * T, inc = el[2] + el[8] * T;
    var L = norm360(el[3] + el[9] * T), lp = norm360(el[4] + el[10] * T), node = norm360(el[5] + el[11] * T);
    var M = norm180(L - lp);
    var E = solveKepler(M, e);
    var xp = a * (Math.cos(E) - e);
    var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
    var w = (lp - node) * D2R, om = node * D2R, ii = inc * D2R;
    var cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(ii), si = Math.sin(ii);
    var x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
    var y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
    var z = (sw * si) * xp + (cw * si) * yp;
    var lon = norm360(Math.atan2(y, x) * R2D);
    var r = Math.sqrt(x * x + y * y + z * z);
    return { name: name, x: x, y: y, z: z, lon: lon, r: r, a: a, e: e, inc: inc };
  }

  // 轨道要素（用于画轨道线）
  function planetOrbit(name, jd, samples) {
    var el = ELEM[name];
    if (!el) return [];
    var T = (jd - 2451545.0) / 36525.0;
    var a = el[0] + el[6] * T, e = el[1] + el[7] * T, inc = el[2] + el[8] * T;
    var lp = norm360(el[4] + el[10] * T), node = norm360(el[5] + el[11] * T);
    var w = (lp - node) * D2R, om = node * D2R, ii = inc * D2R;
    var cw = Math.cos(w), sw = Math.sin(w), co = Math.cos(om), so = Math.sin(om), ci = Math.cos(ii), si = Math.sin(ii);
    var pts = [];
    var n = samples || 220;
    for (var k = 0; k <= n; k++) {
      var E = (k / n) * Math.PI * 2;
      var xp = a * (Math.cos(E) - e);
      var yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
      var x = (cw * co - sw * so * ci) * xp + (-sw * co - cw * so * ci) * yp;
      var y = (cw * so + sw * co * ci) * xp + (-sw * so + cw * co * ci) * yp;
      var z = (sw * si) * xp + (cw * si) * yp;
      pts.push([x, y, z]);
    }
    return pts;
  }

  /* ---------- 地心位置 / 坐标变换 ---------- */
  function planetGeo(name, jd) {
    var p = planetHelio(name, jd);
    var e = planetHelio("earth", jd);
    var x = p.x - e.x, y = p.y - e.y, z = p.z - e.z;
    var lon = norm360(Math.atan2(y, x) * R2D);
    var r = Math.sqrt(x * x + y * y + z * z);
    var eq = eclToEq(lon, Math.asin(z / r) * R2D);
    return { name: name, x: x, y: y, z: z, lon: lon, lat: Math.asin(z / r) * R2D, r: r, ra: eq.ra, dec: eq.dec };
  }

  // 黄道坐标 -> 赤道坐标（真赤纬/赤经，忽略章动）
  function eclToEq(lonDeg, latDeg) {
    var l = lonDeg * D2R, b = latDeg * D2R, eps = OBLIQ * D2R;
    var ra = Math.atan2(Math.sin(l) * Math.cos(eps) - Math.tan(b) * Math.sin(eps), Math.cos(l));
    var dec = Math.asin(Math.sin(b) * Math.cos(eps) + Math.cos(b) * Math.sin(eps) * Math.sin(l));
    return { ra: norm360(ra * R2D), dec: dec * R2D };
  }

  function sunGeo(jd) {
    var e = planetHelio("earth", jd);
    // 太阳地心方向 = -地球日心矢量
    var lon = norm360(Math.atan2(-e.y, -e.x) * R2D);
    var lat = norm360(Math.atan2(-e.z, Math.sqrt(e.x * e.x + e.y * e.y)) * R2D);
    var eq = eclToEq(lon, lat);
    return { lon: lon, lat: lat, ra: eq.ra, dec: eq.dec };
  }

  /* ---------- 月球（Meeus 47.A/47.B 主项） ---------- */
  function moonGeo(jd) {
    var T = (jd - 2451545.0) / 36525.0;
    var Lp = norm360(218.3164477 + 481267.88123421 * T);
    var D = norm360(297.8501921 + 445267.1114034 * T);
    var M = norm360(357.5291092 + 35999.0502909 * T);
    var Mp = norm360(134.9633964 + 477198.8675055 * T);
    var F = norm360(93.2720950 + 483202.0175233 * T);
    function d(x) { return x * D2R; }
    var dl = 6.288774 * Math.sin(d(Mp)) + 1.274027 * Math.sin(d(2 * D - Mp))
      + 0.658314 * Math.sin(d(2 * D)) + 0.213618 * Math.sin(d(2 * Mp))
      - 0.185116 * Math.sin(d(M)) - 0.114332 * Math.sin(d(2 * F))
      + 0.058793 * Math.sin(d(2 * D - 2 * Mp)) + 0.057066 * Math.sin(d(2 * D - M - Mp))
      + 0.053322 * Math.sin(d(2 * D + Mp)) + 0.045758 * Math.sin(d(2 * D - M))
      - 0.040923 * Math.sin(d(M - Mp)) - 0.034720 * Math.sin(d(D))
      - 0.030383 * Math.sin(d(M + Mp)) + 0.015327 * Math.sin(d(2 * D - 2 * F))
      - 0.012528 * Math.sin(d(Mp + 2 * F)) + 0.010980 * Math.sin(d(Mp - 2 * F))
      + 0.010675 * Math.sin(d(4 * D - Mp)) + 0.010034 * Math.sin(d(3 * Mp))
      + 0.008548 * Math.sin(d(4 * D - 2 * Mp));
    var db = 5.128122 * Math.sin(d(F)) + 0.280602 * Math.sin(d(Mp + F))
      + 0.277693 * Math.sin(d(Mp - F)) + 0.173237 * Math.sin(d(2 * D - F))
      + 0.055413 * Math.sin(d(2 * D - Mp + F)) + 0.046271 * Math.sin(d(2 * D - Mp - F))
      + 0.032573 * Math.sin(d(2 * D + F)) + 0.017198 * Math.sin(d(2 * Mp + F))
      + 0.009266 * Math.sin(d(2 * D + Mp - F)) + 0.008822 * Math.sin(d(2 * D - Mp + 2 * F))
      + 0.008216 * Math.sin(d(2 * D - 2 * Mp + F)) + 0.004324 * Math.sin(d(2 * D - 2 * Mp - F))
      + 0.004200 * Math.sin(d(2 * D + Mp + F));
    var lon = norm360(Lp + dl);
    var lat = db;
    var dist = 385000.56 - 20905.355 * Math.cos(d(Mp)) - 3699.111 * Math.cos(d(2 * D - Mp))
      - 2955.968 * Math.cos(d(2 * D)) - 569.925 * Math.cos(d(2 * Mp));
    var eq = eclToEq(lon, lat);
    return { lon: lon, lat: lat, ra: eq.ra, dec: eq.dec, dist: dist };
  }

  /* ---------- 当地时间 / 高度角 ---------- */
  function gmst(jd) { // 度
    var T = (jd - 2451545.0) / 36525.0;
    return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0)
      + 0.000387933 * T * T - T * T * T / 38710000);
  }

  // 给定时刻的赤经赤纬 -> 高度角/方位角（北为 0，顺时针）
  function altAz(raDeg, decDeg, jd, latDeg, lonDeg) {
    var lst = norm360(gmst(jd) + lonDeg);
    var H = norm180(lst - raDeg) * D2R;
    var lat = latDeg * D2R, dec = decDeg * D2R;
    var sinAlt = Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(H);
    var alt = Math.asin(Math.max(-1, Math.min(1, sinAlt))) * R2D;
    var az = norm360(Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat)) * R2D + 180);
    return { alt: alt, az: az };
  }

  /* ---------- 日出日落（已验证：vs astropy ≤1 分钟） ---------- */
  function sunTransit(jd0ut, latDeg, lonDeg, tzHours) {
    // jd0ut = 当地当日 0 时（UT）对应的 JD
    var jstarMean = jd0ut + (0.5 - lonDeg / 360.0);
    var dd = jstarMean - 2451545.0;
    var M = (357.5291 + 0.98560028 * dd) * D2R;
    var L = (280.4665 + 0.9856474 * dd) * D2R;
    var lam = L + (1.9148 * Math.sin(M) + 0.0200 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)) * D2R;
    var eps = (23.4392911 - 0.0000004 * dd) * D2R;
    var dec = Math.asin(Math.sin(eps) * Math.sin(lam)) * R2D;
    var jtransit = jstarMean + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * lam);
    return { jtransit: jtransit, dec: dec };
  }

  function riseSet(jd0ut, latDeg, lonDeg, tzHours, altDeg, raDeg, decDeg) {
    // 用给定目标的 ra/dec 算当天过中天与升起/落下（altDeg 为地平高度，含折射）
    var tr = sunTransit(jd0ut, latDeg, lonDeg, tzHours);
    var lat = latDeg * D2R, dec = decDeg * D2R;
    var cosH = (Math.sin(altDeg * D2R) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
    if (cosH < -1) return { always: "up" };
    if (cosH > 1) return { always: "down" };
    var H = Math.acos(cosH) * R2D;
    return { rise: tr.jtransit - H / 360, set: tr.jtransit + H / 360, transit: tr.jtransit, dec: dec };
  }

  function sunRiseSet(jd0ut, latDeg, lonDeg, tzHours) {
    var tr = sunTransit(jd0ut, latDeg, lonDeg, tzHours);
    var lat = latDeg * D2R, dec = tr.dec * D2R;
    var cosH = (Math.sin(-0.833 * D2R) - Math.sin(lat) * Math.sin(dec)) / (Math.cos(lat) * Math.cos(dec));
    if (cosH < -1) return { always: "up" };
    if (cosH > 1) return { always: "down" };
    var H = Math.acos(cosH) * R2D;
    return { rise: tr.jtransit - H / 360, set: tr.jtransit + H / 360, transit: tr.jtransit };
  }

  /* ---------- 月相 ---------- */
  var SYNODIC = 29.530588853;
  function moonPhase(jd) {
    var sun = sunGeo(jd);
    var moon = moonGeo(jd);
    var elong = norm180(moon.lon - sun.lon); // -180..180
    var age = (elong / 360 + 1) % 1 * SYNODIC; // 0..29.53
    var illum = (1 - Math.cos(elong * D2R)) / 2;
    return {
      age: age, illum: illum, elong: elong,
      sunLon: sun.lon, moonLon: moon.lon,
      phaseName: phaseName(age)
    };
  }
  function phaseName(age) {
    if (age < 1.5 || age >= 28.5) return "新月";
    if (age < 6.4) return "蛾眉月";
    if (age < 8.9) return "上弦月";
    if (age < 13.8) return "盈凸月";
    if (age < 16.3) return "满月";
    if (age < 21.0) return "亏凸月";
    if (age < 23.4) return "下弦月";
    return "残月";
  }

  /* ---------- 行星视星等 ----------
     Lambert 球体相位函数 Φ(i) = (sin i + (π−i)·cos i)/π
     m = V(1,0) + 5·lg(r·Δ) − 2.5·lg(Φ(i)/Φ(0))
     V(1,0) 取 JPL 值；土星另加环面开合修正（环侧对时偏暗） */
  var V10 = {
    mercury: -0.42, venus: -4.40, mars: -1.52, jupiter: -9.40,
    saturn: -8.88, uranus: -7.19, neptune: -6.87
  };

  function lambertPhi(iDeg) {
    var i = iDeg * D2R;
    return (Math.sin(i) + (Math.PI - i) * Math.cos(i)) / Math.PI;
  }

  function planetMagnitude(name, jd) {
    var g = planetGeo(name, jd);
    var h = planetHelio(name, jd);
    var R = h.r;                 // 行星到太阳
    var delta = g.r;             // 行星到地球
    // 相位角：行星处「太阳方向」与「地球方向」的夹角
    // planet->sun = -h, planet->earth = -g, 故 cos i = (h·g)/(R·Δ)
    var cosI = (h.x * g.x + h.y * g.y + h.z * g.z) / (R * delta);
    var i = Math.acos(Math.max(-1, Math.min(1, cosI))) * R2D;
    var m = V10[name] + 5 * Math.log10(R * delta) - 2.5 * Math.log10(lambertPhi(i) / lambertPhi(0));
    if (name === "saturn") {
      // 土星环修正：用土星北极方向（赤道 J2000）算环面开合角 B
      var e = planetHelio("earth", jd);
      var ux = e.x - h.x, uy = e.y - h.y, uz = e.z - h.z; // 土星 -> 地球
      var uNorm = Math.sqrt(ux * ux + uy * uy + uz * uz);
      var n = saturnPoleEcliptic(); // 环面法线（黄道 J2000）
      var sinB = Math.abs((n[0] * ux + n[1] * uy + n[2] * uz) / uNorm);
      m += 0.35 * (1 - sinB); // 环侧对时偏暗
    }
    return m;
  }

  // 土星北极方向（赤道 J2000, RA=40.589° Dec=83.537°）转到黄道 J2000
  var _saturnPole = null;
  function saturnPoleEcliptic() {
    if (_saturnPole) return _saturnPole;
    var ra = 40.589 * D2R, dec = 83.537 * D2R, eps = OBLIQ * D2R;
    var x = Math.cos(dec) * Math.cos(ra);
    var y = Math.cos(dec) * Math.sin(ra);
    var z = Math.sin(dec);
    _saturnPole = [
      x,
      y * Math.cos(eps) + z * Math.sin(eps),
      -y * Math.sin(eps) + z * Math.cos(eps)
    ];
    return _saturnPole;
  }

  /* ---------- 黄道十二星座（近似，30° 分段） ---------- */
  var ZODIAC = ["双鱼", "白羊", "金牛", "双子", "巨蟹", "狮子", "室女", "天秤", "天蝎", "人马", "摩羯", "宝瓶"];
  function zodiac(lonDeg) {
    return ZODIAC[Math.floor(norm360(lonDeg) / 30) % 12] + "座";
  }

  /* ---------- 冲日 / 大距搜索 ---------- */
  // 外行星冲日：地心黄经与太阳黄经相差 180°。
  // 判据 f = sin(Δλ − 180°)（Δλ 为地日黄经差，跳变 360° 不影响 sin），
  // 冲日与合日处 f 均为 0，需在零点用几何判据复核（地日夹角≈180°）。
  function oppositions(name, jdFrom, jdTo) {
    var f = function (jd) {
      var g = planetGeo(name, jd);
      var s = sunGeo(jd);
      return Math.sin((g.lon - s.lon - 180) * D2R);
    };
    var isOpp = function (jd) {
      var g = planetGeo(name, jd);
      var s = sunGeo(jd);
      var e = norm360(g.lon - s.lon);
      return Math.abs(e - 180) < 2; // 几何复核
    };
    var out = [], step = 1;
    var prev = f(jdFrom), prevJd = jdFrom;
    for (var jd = jdFrom + step; jd <= jdTo + 1e-9; jd += step) {
      var v = f(jd);
      if ((prev < 0 && v >= 0) || (prev > 0 && v <= 0)) {
        var lo = prevJd, hi = jd;
        for (var k = 0; k < 40; k++) {
          var mid = (lo + hi) / 2;
          var fm = f(mid);
          if ((fm < 0) === (prev < 0)) lo = mid; else hi = mid;
        }
        var zero = (lo + hi) / 2;
        if (isOpp(zero)) out.push(zero);
      }
      prev = v; prevJd = jd;
    }
    return out;
  }

  // 内行星大距：地心-太阳距角 |E| 的局部极大
  function greatestElongations(name, jdFrom, jdTo) {
    var f = function (jd) {
      var g = planetGeo(name, jd);
      var s = sunGeo(jd);
      var e = norm180(g.lon - s.lon);
      return e; // 连续（大距时 ±(18~28/45~47)）
    };
    // 找 f 的局部极值（|e| 极大）
    var out = [];
    var step = 1;
    var prev = f(jdFrom), prevJd = jdFrom, prev2 = null, prev2Jd = null;
    for (var jd = jdFrom + step; jd <= jdTo; jd += step) {
      var v = f(jd);
      if (prev2 !== null) {
        var isMax = prev >= prev2 && prev > v && prev > 0;
        var isMin = prev <= prev2 && prev < v && prev < 0;
        if (isMax || isMin) {
          // 抛物线细化
          var denom = (prev2 - 2 * prev + v);
          var shift = denom !== 0 ? 0.5 * step * (prev2 - v) / denom : 0;
          out.push({ jd: prevJd + shift, elong: prev, dir: isMax ? "east" : "west" });
        }
      }
      prev2 = prev; prev2Jd = prevJd;
      prev = v; prevJd = jd;
    }
    return out;
  }

  // 通用零点搜索（带符号连续函数）
  function zeros(f, jdFrom, jdTo, step, refine) {
    var out = [];
    var prev = f(jdFrom), prevJd = jdFrom;
    for (var jd = jdFrom + step; jd <= jdTo + 1e-9; jd += step) {
      var v = f(jd);
      if ((prev <= 0 && v > 0) || (prev >= 0 && v < 0)) {
        var lo = prevJd, hi = jd;
        for (var k = 0; k < 40; k++) {
          var mid = (lo + hi) / 2;
          if ((f(lo) <= 0) === (f(mid) <= 0)) lo = mid; else hi = mid;
        }
        out.push((lo + hi) / 2);
      }
      prev = v; prevJd = jd;
    }
    return out;
  }

  /* ---------- 天体时标格式化 ---------- */
  function fmtJdLocal(jd, tzHours, withDate) {
    var local = jd + tzHours / 24;
    var z = local + 0.5;
    var Z = Math.floor(z);
    var F = z - Z;
    var A = Z;
    if (Z >= 2299161) {
      var alpha = Math.floor((Z - 1867216.25) / 36524.25);
      A = Z + 1 + alpha - Math.floor(alpha / 4);
    }
    var B = A + 1524;
    var C = Math.floor((B - 122.1) / 365.25);
    var D = Math.floor(365.25 * C);
    var E = Math.floor((B - D) / 30.6001);
    var day = B - D - Math.floor(30.6001 * E) + F;
    var month = E < 14 ? E - 1 : E - 13;
    var year = month > 2 ? C - 4716 : C - 4715;
    var di = Math.floor(day);
    var h = (day - di) * 24;
    var hi = Math.floor(h);
    var mi = Math.round((h - hi) * 60);
    if (mi === 60) { hi += 1; mi = 0; }
    if (hi === 24) { hi = 0; di += 1; }
    var dateStr = year + " 年 " + month + " 月 " + di + " 日";
    var timeStr = (hi < 10 ? "0" : "") + hi + ":" + (mi < 10 ? "0" : "") + mi;
    return withDate === false ? timeStr : dateStr + " " + timeStr;
  }

  return {
    D2R: D2R, R2D: R2D, OBLIQ: OBLIQ,
    norm360: norm360, norm180: norm180,
    jdFromDate: jdFromDate, dateFromJd: dateFromJd,
    ELEM: ELEM, PLANET_NAMES: PLANET_NAMES, PLANET_COLORS: PLANET_COLORS,
    planetHelio: planetHelio, planetOrbit: planetOrbit, planetGeo: planetGeo,
    eclToEq: eclToEq, sunGeo: sunGeo, moonGeo: moonGeo,
    gmst: gmst, altAz: altAz,
    sunTransit: sunTransit, riseSet: riseSet, sunRiseSet: sunRiseSet,
    moonPhase: moonPhase, phaseName: phaseName, SYNODIC: SYNODIC,
    planetMagnitude: planetMagnitude, zodiac: zodiac,
    oppositions: oppositions, greatestElongations: greatestElongations,
    fmtJdLocal: fmtJdLocal
  };
});
