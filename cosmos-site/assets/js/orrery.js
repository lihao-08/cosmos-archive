/* ============================================================
   寰宇 COSMOS · orrery.js
   实时太阳系仪（3D 拖拽旋转）+ 行星程序化自转特写
   依赖：assets/js/astro.js（window.astro）、assets/js/core.js（window.COSMOS）
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };
  var astro = window.astro;
  if (!astro) return;
  var D2R = astro.D2R;

  /* ============================================================
     一、实时太阳系仪
     ============================================================ */
  var MIN_JD = 2451545.0;          // 2000-01-01
  var MAX_JD = 2465927.5;          // 2040-01-01
  var PLANETS = ["mercury", "venus", "earth", "mars", "jupiter", "saturn", "uranus", "neptune"];
  var PLANET_RADIUS = { mercury: 2440, venus: 6052, earth: 6371, mars: 3390, jupiter: 69911, saturn: 58232, uranus: 25362, neptune: 24622 };

  var canvas = $("#orreryCanvas");
  var ctx = canvas.getContext("2d");
  var W = canvas.width, H = canvas.height;
  var CX = W / 2, CY = H / 2 + 8;

  var orrery = {
    jd: astro.jdFromDate(new Date()),
    playing: false,
    speed: 2592000,          // 模拟秒 / 真实秒
    tilt: 28,                // 视角倾角（度）
    yaw: 0,                  // 视角方位角（弧度）
    zoom: 1,                 // 缩放
    spin: 0,                 // 惯性角速度
    selected: null,          // 选中行星名
    hover: null
  };

  // 背景星点（固定种子，避免闪烁）
  var bgStars = [];
  (function () {
    var seed = 42;
    function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
    for (var i = 0; i < 130; i++) {
      bgStars.push({ x: rnd() * W, y: rnd() * H, r: rnd() * 1.1 + 0.2, a: rnd() * 0.35 + 0.08 });
    }
  })();

  function dispR(rAU) {
    return 30 + 52 * Math.sqrt(Math.max(rAU, 0.05));
  }
  // 3D 投影：绕黄极旋转 yaw → 按 tilt 俯仰 → 轻透视。返回 [x, y, depth]
  function project(x, y, z) {
    // 半径平方根压缩（否则海王星 30AU vs 水星 0.39AU 无法同屏）
    var rxy = Math.hypot(x, y);
    var k = rxy > 1e-6 ? dispR(rxy) / rxy : 0;
    var X = x * k, Y = y * k, Z = z * k;
    // 黄道面内旋转（拖动横向 = 绕太阳转视角）
    var cy = Math.cos(orrery.yaw), sy = Math.sin(orrery.yaw);
    var X1 = X * cy - Y * sy;
    var Y1 = X * sy + Y * cy;
    // 俯仰
    var t = orrery.tilt * D2R;
    var ct = Math.cos(t), st = Math.sin(t);
    var sx = X1;
    var syy = Y1 * ct + Z * st;
    // 垂直于屏幕的深度：near 为负、far 为正
    var depth = Y1 * st - Z * ct;
    // 轻透视：远处收缩、近处放大
    var persp = 1 / (1 + depth / 1500);
    return [CX + sx * persp * orrery.zoom, CY - syy * persp * orrery.zoom, depth];
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // 背景星
    for (var i = 0; i < bgStars.length; i++) {
      var s = bgStars[i];
      ctx.fillStyle = "rgba(255,255,255," + s.a + ")";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    var jd = orrery.jd;

    // 轨道
    PLANETS.forEach(function (name) {
      if (name === "earth") return;
      var pts = astro.planetOrbit(name, jd, 140);
      ctx.beginPath();
      for (var k = 0; k < pts.length; k++) {
        var p = project(pts[k][0], pts[k][1], pts[k][2]);
        if (k === 0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]);
      }
      ctx.closePath();
      var inner = PLANETS.indexOf(name) < 4;
      ctx.strokeStyle = orrery.selected === name
        ? "rgba(232, 200, 122, 0.62)"
        : (inner ? "rgba(139,92,246,0.44)" : "rgba(56,189,248,0.32)");
      ctx.lineWidth = orrery.selected === name ? 1.6 : 1.1;
      ctx.stroke();
    });

    // 太阳
    var sunGrad = ctx.createRadialGradient(CX, CY, 0, CX, CY, 46);
    sunGrad.addColorStop(0, "rgba(255, 214, 90, 0.9)");
    sunGrad.addColorStop(0.25, "rgba(255, 190, 60, 0.35)");
    sunGrad.addColorStop(1, "rgba(255, 190, 60, 0)");
    ctx.fillStyle = sunGrad;
    ctx.beginPath();
    ctx.arc(CX, CY, 46, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ffd34d";
    ctx.beginPath();
    ctx.arc(CX, CY, 7, 0, Math.PI * 2);
    ctx.fill();

    // 行星
    var earthPos = null;
    var positions = {};
    var renderList = [];
    PLANETS.forEach(function (name) {
      var h = astro.planetHelio(name, jd);
      positions[name] = h;
      if (name === "earth") earthPos = h;
      var p = project(h.x, h.y, h.z);
      renderList.push({ name: name, p: p, h: h });
    });
    // 远的先画（depth 大 = 远）
    renderList.sort(function (a, b) { return b.p[2] - a.p[2]; });

    renderList.forEach(function (item) {
      var name = item.name, p = item.p;
      var depthScale = 1 / (1 + p[2] / 1500);
      var r = (2.6 + 2.4 * Math.log10(PLANET_RADIUS[name] / 1000)) * Math.max(0.55, Math.min(1.5, depthScale));
      var color = astro.PLANET_COLORS[name];
      var isSel = orrery.selected === name;
      var isHov = orrery.hover === name;

      // 太阳-选中行星连线（示意距离方向）
      if (isSel && orrery.selected !== "sun") {
        ctx.strokeStyle = "rgba(232, 200, 122, 0.45)";
        ctx.setLineDash([5, 5]);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(CX, CY);
        ctx.lineTo(p[0], p[1]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // 光晕
      var g = ctx.createRadialGradient(p[0], p[1], 0, p[0], p[1], r * 3.2);
      g.addColorStop(0, color + "cc");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r * 3.2, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p[0], p[1], r, 0, Math.PI * 2);
      ctx.fill();

      if (isSel || isHov) {
        ctx.strokeStyle = "rgba(255,255,255,0.85)";
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p[0], p[1], r + 5, 0, Math.PI * 2);
        ctx.stroke();
      }

      // 名称（选中/悬停/地球常显）
      if (isSel || isHov || name === "earth") {
        ctx.fillStyle = "rgba(230,237,247,0.92)";
        ctx.font = "12px system-ui, 'Microsoft YaHei', sans-serif";
        ctx.fillText(astro.PLANET_NAMES[name], p[0] + r + 7, p[1] + 4);
      }
    });
  }

  // 命中检测
  function hitPlanet(mx, my) {
    var jd = orrery.jd;
    var best = null, bestD = 16;
    var earth = astro.planetHelio("earth", jd);
    var ep = project(earth.x, earth.y, earth.z);
    var dSun = Math.hypot(mx - CX, my - CY);
    if (dSun < 18) return "sun";
    PLANETS.forEach(function (name) {
      var h = astro.planetHelio(name, jd);
      var p = project(h.x, h.y, h.z);
      var d = Math.hypot(mx - p[0], my - p[1]);
      if (d < bestD) { bestD = d; best = name; }
    });
    return best;
  }

  function canvasPos(evt) {
    var rect = canvas.getBoundingClientRect();
    return [(evt.clientX - rect.left) * (W / rect.width), (evt.clientY - rect.top) * (H / rect.height)];
  }

  /* ---------- 拖动旋转 / 滚轮缩放 / 双指缩放 ---------- */
  var drag = { on: false, id: null, x: 0, y: 0, moved: 0, vyaw: 0, vtilt: 0 };
  var pointers = {};   // 多点触控追踪
  var pinchDist = 0;

  canvas.addEventListener("pointerdown", function (e) {
    canvas.setPointerCapture(e.pointerId);
    pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
    var ids = Object.keys(pointers);
    if (ids.length === 2) {
      pinchDist = Math.hypot(
        pointers[ids[0]].x - pointers[ids[1]].x,
        pointers[ids[0]].y - pointers[ids[1]].y
      );
      drag.on = false;
      return;
    }
    drag.on = true;
    drag.id = e.pointerId;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved = 0;
    drag.vyaw = 0;
    drag.vtilt = 0;
    orrery.spin = 0;
    canvas.classList.add("dragging");
  });

  canvas.addEventListener("pointermove", function (e) {
    if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }
    var ids = Object.keys(pointers);
    // 双指缩放
    if (ids.length === 2) {
      var d = Math.hypot(
        pointers[ids[0]].x - pointers[ids[1]].x,
        pointers[ids[0]].y - pointers[ids[1]].y
      );
      if (pinchDist > 0) {
        orrery.zoom = clamp(orrery.zoom * (d / pinchDist), 0.45, 3.2);
        draw();
      }
      pinchDist = d;
      return;
    }
    if (!drag.on) {
      // 悬停高亮
      var pos0 = canvasPos(e);
      var h0 = hitPlanet(pos0[0], pos0[1]);
      if (h0 !== orrery.hover) {
        orrery.hover = h0;
        canvas.style.cursor = h0 ? "pointer" : "grab";
        draw();
      }
      return;
    }
    var dx = e.clientX - drag.x;
    var dy = e.clientY - drag.y;
    drag.x = e.clientX;
    drag.y = e.clientY;
    drag.moved += Math.abs(dx) + Math.abs(dy);

    orrery.yaw -= dx * 0.007;
    orrery.tilt = clamp(orrery.tilt - dy * 0.22, 0, 78);
    drag.vyaw = -dx * 0.007;
    drag.vtilt = -dy * 0.22;
    syncTiltUI();
    draw();
  });

  function endDrag(e) {
    delete pointers[e.pointerId];
    if (!drag.on) return;
    drag.on = false;
    canvas.classList.remove("dragging");
    // 轻点（未拖动）→ 选中行星
    if (drag.moved < 6) {
      var pos = canvasPos(e);
      var hit = hitPlanet(pos[0], pos[1]);
      orrery.selected = hit;
      renderInfo(hit);
      renderFocus(hit);
      orrery.spin = 0;
      drag.vyaw = 0;
    } else {
      // 拖动结束 → 惯性
      orrery.spin = drag.vyaw * 12;
    }
    draw();
  }
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", endDrag);
  canvas.addEventListener("pointerleave", function (e) {
    if (!drag.on) { orrery.hover = null; draw(); }
    delete pointers[e.pointerId];
  });

  canvas.addEventListener("wheel", function (e) {
    e.preventDefault();
    var f = Math.exp(-e.deltaY * 0.0012);
    orrery.zoom = clamp(orrery.zoom * f, 0.45, 3.2);
    draw();
  }, { passive: false });

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function syncTiltUI() {
    tiltInput.value = Math.round(orrery.tilt);
    $("#tiltVal").textContent = Math.round(orrery.tilt) + "°";
  }

  /* ---------- 行星特写（程序化球体，可拖拽自转） ---------- */
  var pfCanvas = $("#planetCanvas");
  var pfCtx = pfCanvas.getContext("2d");
  var PW = pfCanvas.width, PH = pfCanvas.height;

  var PLANET_LOOK = {
    mercury: { base: [156, 143, 132], spot: [[111, 101, 92], [179, 166, 154]], bands: 0, speck: 30 },
    venus:   { base: [232, 192, 125], bands: 0.55, spot: [[214, 168, 98]], speck: 12 },
    earth:   { base: [26, 82, 150], land: true, cloud: true, bands: 0, speck: 0 },
    mars:    { base: [193, 68, 14], spot: [[139, 47, 8], [224, 104, 47]], speck: 24, cap: true },
    jupiter: { base: [216, 180, 139], bands: 1, spot: [[150, 100, 68], [241, 222, 190]], speck: 7, redSpot: true },
    saturn:  { base: [227, 207, 158], bands: 0.8, spot: [[196, 172, 122], [238, 224, 188]], speck: 0, ring: true },
    uranus:  { base: [159, 227, 232], bands: 0.22, spot: [[138, 208, 216]], speck: 3 },
    neptune: { base: [63, 111, 216], bands: 0.3, spot: [[45, 84, 176], [110, 148, 232]], speck: 5 }
  };

  var pf = { name: null, rot: 0, dragging: false, lastX: 0, raf: 0, spots: null, land: null, clouds: null };

  // 固定种子纹理斑点
  function makeSpots(seed, n) {
    var s = seed, out = [];
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var i = 0; i < n; i++) {
      out.push({
        lon: rnd() * Math.PI * 2,
        lat: (rnd() - 0.5) * 1.7,
        size: 0.05 + rnd() * 0.13,
        k: rnd(),
        rot: (rnd() - 0.5) * 0.9
      });
    }
    return out;
  }

  // 聚簇斑点（用于大陆、云团）
  function makeClusters(seed, nClusters, sizeMin, sizeMax, spread) {
    var s = seed, out = [];
    function rnd() { s = (s * 9301 + 49297) % 233280; return s / 233280; }
    for (var c = 0; c < nClusters; c++) {
      var baseLon = rnd() * Math.PI * 2;
      var baseLat = (rnd() - 0.5) * 1.55;
      var count = 3 + Math.floor(rnd() * 4);
      for (var i = 0; i < count; i++) {
        out.push({
          lon: baseLon + (rnd() - 0.5) * spread,
          lat: baseLat + (rnd() - 0.5) * spread * 0.55,
          size: sizeMin + rnd() * (sizeMax - sizeMin),
          k: rnd()
        });
      }
    }
    return out;
  }

  function rgba(c, a) {
    return "rgba(" + c[0] + "," + c[1] + "," + c[2] + "," + (a === undefined ? 1 : a) + ")";
  }

  function renderPlanet() {
    if (!pf.name) return;
    var look = PLANET_LOOK[pf.name];
    if (!look) return;
    var cx = PW / 2, cy = PH / 2;
    var R = look.ring ? 86 : 112;

    pfCtx.clearRect(0, 0, PW, PH);

    // ---- 环的后半段 ----
    if (look.ring) drawRing(cx, cy, R, true);

    // ---- 球体 ----
    pfCtx.save();
    pfCtx.beginPath();
    pfCtx.arc(cx, cy, R, 0, Math.PI * 2);
    pfCtx.clip();

    // 基础色（带球面明暗）
    var base = pfCtx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.08, cx, cy, R * 1.15);
    base.addColorStop(0, "rgb(" + Math.min(255, look.base[0] * 1.35) + "," + Math.min(255, look.base[1] * 1.35) + "," + Math.min(255, look.base[2] * 1.35) + ")");
    base.addColorStop(0.55, rgba(look.base));
    base.addColorStop(1, "rgb(" + Math.round(look.base[0] * 0.42) + "," + Math.round(look.base[1] * 0.42) + "," + Math.round(look.base[2] * 0.42) + ")");
    pfCtx.fillStyle = base;
    pfCtx.fillRect(0, 0, PW, PH);

    // 纬向条纹
    if (look.bands > 0) {
      var rows = 26;
      for (var i = 0; i < rows; i++) {
        var v = i / (rows - 1) * 2 - 1;              // -1..1
        if (Math.abs(v) > 0.98) continue;
        var w = Math.sqrt(1 - v * v);                 // 该纬度球面半径
        var wave = Math.sin(v * 9 + pf.rot * 1.6 + i);
        var tone = 0.5 + 0.5 * wave;
        var col = tone > 0.5 ? look.spot[0] : look.base;
        var alpha = look.bands * (0.13 + 0.3 * Math.abs(wave));
        pfCtx.fillStyle = rgba(col, alpha);
        pfCtx.beginPath();
        pfCtx.ellipse(cx, cy + v * R, w * R * 1.01, R * 0.028, 0, 0, Math.PI * 2);
        pfCtx.fill();
      }
    }

    // 地球陆地（聚簇成大陆）
    if (look.land && pf.land) {
      pf.land.forEach(function (sp) {
        var lon = sp.lon + pf.rot;
        var cl = Math.cos(lon);
        if (cl <= 0.03) return;
        var clat = Math.cos(sp.lat), slat = Math.sin(sp.lat);
        var x = cx + Math.sin(lon) * clat * R;
        var y = cy - slat * R;
        var rr = sp.size * R * cl;
        var col = sp.k > 0.78 ? [186, 168, 118] : (sp.k > 0.3 ? [74, 141, 88] : [52, 112, 72]);
        pfCtx.save();
        pfCtx.translate(x, y);
        pfCtx.rotate(sp.k * 2.4);
        pfCtx.fillStyle = rgba(col, 0.9 * Math.min(1, cl * 1.8));
        pfCtx.beginPath();
        pfCtx.ellipse(0, 0, rr, rr * (0.55 + sp.k * 0.55), 0, 0, Math.PI * 2);
        pfCtx.fill();
        pfCtx.restore();
      });
      // 极冠
      var pcN = pfCtx.createRadialGradient(cx, cy - R * 0.98, R * 0.02, cx, cy - R * 0.98, R * 0.46);
      pcN.addColorStop(0, "rgba(250,252,255,0.95)");
      pcN.addColorStop(1, "rgba(250,252,255,0)");
      pfCtx.fillStyle = pcN;
      pfCtx.beginPath();
      pfCtx.ellipse(cx, cy - R * 0.98, R * 0.46, R * 0.3, 0, 0, Math.PI * 2);
      pfCtx.fill();
      var pcS = pfCtx.createRadialGradient(cx, cy + R * 0.99, R * 0.02, cx, cy + R * 0.99, R * 0.4);
      pcS.addColorStop(0, "rgba(250,252,255,0.92)");
      pcS.addColorStop(1, "rgba(250,252,255,0)");
      pfCtx.fillStyle = pcS;
      pfCtx.beginPath();
      pfCtx.ellipse(cx, cy + R * 0.99, R * 0.4, R * 0.26, 0, 0, Math.PI * 2);
      pfCtx.fill();
    }

    // 斑点（按经度旋转，只画正面）
    if (pf.spots) {
      pf.spots.forEach(function (sp) {
        var lon = sp.lon + pf.rot;
        var cl = Math.cos(lon);
        if (cl <= 0.04) return;
        var lat = sp.lat;
        var clat = Math.cos(lat), slat = Math.sin(lat);
        var x = cx + Math.sin(lon) * clat * R;
        var y = cy - slat * R;
        var rr = sp.size * R * cl;
        var col = look.spot && look.spot.length ? look.spot[Math.floor(sp.k * look.spot.length)] : look.base;
        pfCtx.save();
        pfCtx.translate(x, y);
        pfCtx.rotate(sp.rot * 0.3);
        pfCtx.fillStyle = rgba(col, 0.28 + 0.4 * cl);
        pfCtx.beginPath();
        pfCtx.ellipse(0, 0, rr, rr * 0.72, 0, 0, Math.PI * 2);
        pfCtx.fill();
        pfCtx.restore();
      });
    }

    // 地球云团（小簇，随纬度压缩）
    if (look.cloud && pf.clouds) {
      pf.clouds.forEach(function (c) {
        var lon = c.lon + pf.rot * 1.22;
        var cl = Math.cos(lon);
        if (cl <= 0.04) return;
        var clat = Math.cos(c.lat), slat = Math.sin(c.lat);
        var x = cx + Math.sin(lon) * clat * R;
        var y = cy - slat * R;
        var rr = c.size * R * cl;
        pfCtx.fillStyle = "rgba(255,255,255," + (0.34 * Math.min(1, cl * 1.5)) + ")";
        pfCtx.beginPath();
        pfCtx.ellipse(x, y, rr * 1.25, rr * 0.42, 0, 0, Math.PI * 2);
        pfCtx.fill();
      });
    }

    // 火星极冠
    if (look.cap) {
      pfCtx.fillStyle = "rgba(245,245,250,0.75)";
      pfCtx.beginPath();
      pfCtx.ellipse(cx, cy - R * 0.94, R * 0.3, R * 0.11, 0, 0, Math.PI * 2);
      pfCtx.fill();
      pfCtx.beginPath();
      pfCtx.ellipse(cx, cy + R * 0.95, R * 0.22, R * 0.08, 0, 0, Math.PI * 2);
      pfCtx.fill();
    }

    // 木星大红斑
    if (look.redSpot) {
      var rsLon = pf.rot + 2.1;
      if (Math.cos(rsLon) > 0.15) {
        pfCtx.save();
        pfCtx.translate(cx + Math.sin(rsLon) * 0.62 * R * Math.cos(-0.35), cy + 0.35 * R);
        pfCtx.fillStyle = "rgba(186,88,52,0.75)";
        pfCtx.beginPath();
        pfCtx.ellipse(0, 0, R * 0.17 * Math.cos(rsLon), R * 0.085, 0, 0, Math.PI * 2);
        pfCtx.fill();
        pfCtx.restore();
      }
    }

    // 终结线阴影 + 高光
    var shade = pfCtx.createRadialGradient(cx - R * 0.45, cy - R * 0.5, R * 0.05, cx + R * 0.15, cy + R * 0.2, R * 1.25);
    shade.addColorStop(0, "rgba(255,250,235,0.22)");
    shade.addColorStop(0.35, "rgba(255,255,255,0)");
    shade.addColorStop(0.72, "rgba(0,0,0,0.34)");
    shade.addColorStop(1, "rgba(0,0,0,0.86)");
    pfCtx.fillStyle = shade;
    pfCtx.fillRect(0, 0, PW, PH);

    pfCtx.restore();

    // ---- 环的前半段 ----
    if (look.ring) drawRing(cx, cy, R, false);

    // 边缘辉光
    var halo = pfCtx.createRadialGradient(cx, cy, R * 0.92, cx, cy, R * 1.14);
    halo.addColorStop(0, "rgba(160,200,255,0)");
    halo.addColorStop(0.5, "rgba(150,190,255,0.18)");
    halo.addColorStop(1, "rgba(160,200,255,0)");
    pfCtx.fillStyle = halo;
    pfCtx.beginPath();
    pfCtx.arc(cx, cy, R * 1.14, 0, Math.PI * 2);
    pfCtx.fill();
  }

  function drawRing(cx, cy, R, back) {
    var c = pfCtx;
    c.save();
    c.translate(cx, cy);
    c.rotate(-0.42);
    var rx = R * 1.72, ry = R * 0.46;

    // 只画上半（后半段）或下半（前半段）
    c.beginPath();
    c.rect(-rx * 2, back ? -ry * 3 : 0, rx * 4, ry * 3);
    c.clip();

    // 环带主体：外椭圆减内椭圆
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    c.ellipse(0, 0, rx * 0.7, ry * 0.7, 0, 0, Math.PI * 2);
    c.clip("evenodd");

    var g = c.createLinearGradient(-rx, 0, rx, 0);
    g.addColorStop(0, "rgba(214,196,158,0.5)");
    g.addColorStop(0.32, "rgba(240,226,190,0.78)");
    g.addColorStop(0.5, "rgba(250,240,210,0.85)");
    g.addColorStop(0.72, "rgba(236,220,182,0.72)");
    g.addColorStop(1, "rgba(214,196,158,0.46)");
    c.fillStyle = g;
    c.beginPath();
    c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    c.fill();

    // 环内的细密纹路
    for (var i = 0; i < 3; i++) {
      c.strokeStyle = "rgba(190,170,132," + (0.16 + i * 0.07) + ")";
      c.lineWidth = R * 0.014;
      c.beginPath();
      c.ellipse(0, 0, rx * (0.78 + i * 0.06), ry * (0.78 + i * 0.06), 0, 0, Math.PI * 2);
      c.stroke();
    }
    // 卡西尼缝
    c.strokeStyle = "rgba(14,18,32,0.62)";
    c.lineWidth = R * 0.03;
    c.beginPath();
    c.ellipse(0, 0, rx * 0.855, ry * 0.855, 0, 0, Math.PI * 2);
    c.stroke();

    c.restore();
  }

  function focusLoop() {
    if (!pf.name) return;
    if (!pf.dragging) pf.rot += 0.0035;
    renderPlanet();
    pf.raf = requestAnimationFrame(focusLoop);
  }

  function renderFocus(name) {
    if (!name || name === "sun") {
      $("#orreryFocus").hidden = true;
      pf.name = null;
      if (pf.raf) cancelAnimationFrame(pf.raf);
      pf.raf = 0;
      return;
    }
    pf.name = name;
    var look = PLANET_LOOK[name] || {};
    pf.spots = makeSpots(name.length * 977 + 13, look.speck === undefined ? 8 : look.speck);
    pf.land = look.land ? makeClusters(name.length * 613 + 7, 7, 0.12, 0.3, 0.85) : null;
    pf.clouds = look.cloud ? makeClusters(name.length * 431 + 29, 7, 0.05, 0.13, 0.5) : null;
    $("#orreryFocus").hidden = false;
    $("#pfName").textContent = astro.PLANET_NAMES[name];
    if (!pf.raf) focusLoop();
    else renderPlanet();
  }

  // 拖拽球体 → 自转
  pfCanvas.addEventListener("pointerdown", function (e) {
    pf.dragging = true;
    pf.lastX = e.clientX;
    pfCanvas.setPointerCapture(e.pointerId);
    pfCanvas.classList.add("dragging");
  });
  pfCanvas.addEventListener("pointermove", function (e) {
    if (!pf.dragging) return;
    var dx = e.clientX - pf.lastX;
    pf.lastX = e.clientX;
    pf.rot += dx * 0.012;
    renderPlanet();
  });
  function pfEnd() {
    pf.dragging = false;
    pfCanvas.classList.remove("dragging");
  }
  pfCanvas.addEventListener("pointerup", pfEnd);
  pfCanvas.addEventListener("pointercancel", pfEnd);
  pfCanvas.addEventListener("pointerleave", pfEnd);

  /* ---------- 信息面板 ---------- */
  function renderInfo(name) {
    var box = $("#orreryInfo");
    if (!name) {
      box.innerHTML = '<p class="orrery-hint">点击太阳或任意行星，查看实时轨道数据。</p>';
      return;
    }
    var jd = orrery.jd;
    if (name === "sun") {
      var e = astro.planetHelio("earth", jd);
      var sun = astro.sunGeo(jd);
      var v = 29.7847 * Math.sqrt(2 / e.r - 1 / e.a);
      box.innerHTML =
        '<div class="oi-head"><i class="oi-dot" style="background:#ffd34d;color:#ffd34d"></i>' +
        "<b>太阳</b><span>SOL · 太阳系中心</span></div>" +
        '<div class="oi-grid">' +
        '<span class="k">太阳地心黄经</span><span class="v">' + sun.lon.toFixed(2) + "°（" + astro.zodiac(sun.lon) + "）</span>" +
        '<span class="k">日地距离</span><span class="v">' + e.r.toFixed(6) + " AU</span>" +
        '<span class="k">地球公转速度</span><span class="v">' + v.toFixed(2) + " km/s</span>" +
        '<span class="k">地球轨道速度方向</span><span class="v">' + (e.lon < 180 ? "接近太阳" : "远离太阳") + "</span>" +
        "</div>" +
        '<p class="oi-note">太阳占太阳系总质量的 99.86%，核心每秒把约 6 亿吨氢聚变成氦。</p>';
      return;
    }
    var h = astro.planetHelio(name, jd);
    var g = astro.planetGeo(name, jd);
    var sun = astro.sunGeo(jd);
    var period = Math.pow(h.a, 1.5);
    var v = 29.7847 * Math.sqrt(2 / h.r - 1 / h.a);
    var elong = Math.abs(astro.norm180(g.lon - sun.lon));
    var mag = astro.planetMagnitude(name, jd);
    box.innerHTML =
      '<div class="oi-head"><i class="oi-dot" style="background:' + astro.PLANET_COLORS[name] + ";color:" + astro.PLANET_COLORS[name] + '"></i>' +
      "<b>" + astro.PLANET_NAMES[name] + "</b><span>" + name.toUpperCase() + "</span></div>" +
      '<div class="oi-grid">' +
      '<span class="k">日心黄经</span><span class="v">' + h.lon.toFixed(2) + "°</span>" +
      '<span class="k">距太阳</span><span class="v">' + h.r.toFixed(4) + " AU</span>" +
      '<span class="k">公转周期</span><span class="v">' + period.toFixed(2) + " 年</span>" +
      '<span class="k">轨道速度</span><span class="v">' + v.toFixed(2) + " km/s</span>" +
      '<span class="k">距地球</span><span class="v">' + g.r.toFixed(4) + " AU</span>" +
      '<span class="k">视星等</span><span class="v">' + mag.toFixed(1) + " 等</span>" +
      '<span class="k">与太阳距角</span><span class="v">' + elong.toFixed(1) + "°</span>" +
      '<span class="k">轨道倾角</span><span class="v">' + h.inc.toFixed(2) + "°</span>" +
      "</div>" +
      '<p class="oi-note">位置由 JPL Standish 近似要素实时解算（J2000 黄道），经 erfa.plan94 星历校验。</p>';
  }

  /* ---------- 控件 ---------- */
  var playBtn = $("#orreryPlay");
  playBtn.addEventListener("click", function () {
    orrery.playing = !orrery.playing;
    playBtn.textContent = orrery.playing ? "⏸ 暂停" : "▶ 播放";
  });

  $("#orrerySpeeds").addEventListener("click", function (e) {
    var btn = e.target.closest(".spd");
    if (!btn) return;
    $$(".spd").forEach(function (b) { b.classList.remove("active"); });
    btn.classList.add("active");
    orrery.speed = parseFloat(btn.getAttribute("data-s"));
  });
  function $$(s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); }

  var tiltInput = $("#orreryTilt");
  tiltInput.addEventListener("input", function () {
    orrery.tilt = parseFloat(tiltInput.value);
    $("#tiltVal").textContent = orrery.tilt + "°";
    draw();
  });

  var dateInput = $("#orreryDate");
  dateInput.addEventListener("input", function () {
    var v = parseFloat(dateInput.value) / 1000;
    orrery.jd = MIN_JD + v * (MAX_JD - MIN_JD);
    updateClock();
    renderInfo(orrery.selected);
    draw();
  });

  $("#orreryNow").addEventListener("click", function () {
    orrery.jd = astro.jdFromDate(new Date());
    syncSlider();
    updateClock();
    renderInfo(orrery.selected);
    draw();
  });

  $("#orreryReset").addEventListener("click", function () {
    orrery.yaw = 0;
    orrery.tilt = 28;
    orrery.zoom = 1;
    orrery.spin = 0;
    syncTiltUI();
    draw();
  });

  function syncSlider() {
    var v = (orrery.jd - MIN_JD) / (MAX_JD - MIN_JD) * 1000;
    dateInput.value = Math.max(0, Math.min(1000, v));
  }
  function updateClock() {
    $("#orreryClock").textContent = astro.fmtJdLocal(orrery.jd, 0, true) + " UTC";
  }

  // 动画循环（离开视口时暂停，省电也避免和其他 canvas 抢帧）
  var lastT = 0;
  var loopId = 0;
  var visible = true;

  function loop(t) {
    if (!visible) { loopId = 0; return; }
    var dt = lastT ? (t - lastT) / 1000 : 0;
    lastT = t;
    var dirty = false;
    if (orrery.playing && dt > 0 && dt < 1) {
      orrery.jd += (orrery.speed * dt) / 86400;   // speed 为模拟秒/真实秒，换算为天
      if (orrery.jd > MAX_JD) orrery.jd = MIN_JD;
      if (orrery.jd < MIN_JD) orrery.jd = MAX_JD;
      syncSlider();
      updateClock();
      if (orrery.selected) renderInfo(orrery.selected);
      dirty = true;
    }
    // 拖拽惯性
    if (!drag.on && Math.abs(orrery.spin) > 0.00015) {
      orrery.yaw += orrery.spin * (dt > 0 && dt < 0.2 ? dt * 60 : 1);
      orrery.spin *= Math.pow(0.16, dt > 0 ? dt : 0.016);
      dirty = true;
    }
    if (dirty || !orrery.lastDrawn) { draw(); orrery.lastDrawn = true; }
    loopId = requestAnimationFrame(loop);
  }

  function startLoop() {
    if (!loopId) { lastT = 0; loopId = requestAnimationFrame(loop); }
  }

  syncSlider();
  updateClock();
  draw();
  startLoop();

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(function (entries) {
      visible = entries[0].isIntersecting;
      if (visible) { startLoop(); if (pf.name && !pf.raf) focusLoop(); }
      else if (pf.raf) { cancelAnimationFrame(pf.raf); pf.raf = 0; }
    }, { threshold: 0 }).observe(canvas);
  }
})();
