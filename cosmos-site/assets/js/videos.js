/* ============================================================
   寰宇 COSMOS · videos.js
   NASA 影像库动态影像（本地 mp4 + 播放弹层）
   数据：window.EXTRA.videos（assets/data/extra.js）
   ============================================================ */
(function () {
  "use strict";

  var C = window.COSMOS || {};
  var $ = C.$ || function (s, c) { return (c || document).querySelector(s); };

  var EXTRA = window.EXTRA;
  var grid = $("#videoGrid");
  if (!EXTRA || !EXTRA.videos || !EXTRA.videos.length || !grid) return;

  var list = EXTRA.videos;
  // NASA 的部分标题是文件名风格（下划线连接），显示时转成正常文本
  function pretty(t) {
    return String(t || "").replace(/_/g, " ").replace(/\s+/g, " ").trim();
  }

  // 中文标题映射：按 NASA ID 关键词匹配，匹配不到就回退英文
  var VIDEO_ZH = [
    ["Apollo_11_moonwalk", "阿波罗 11 号月面行走集锦",
      "这段两分钟的剪辑，收录了阿波罗 11 号月面行走的精彩片段。"],
    ["Spacewalk_91", "美国第 91 次舱外活动（动画预演）",
      "2025 年 1 月的舱外活动动画预演：NASA 宇航员在站外更换设备、维护线路。"],
    ["Perseverance", "毅力号着陆火星",
      "2021 年 2 月 18 日，全世界注视着 NASA 火星 2020 团队完成这场最惊险的着陆。"],
    ["Northern_Lights", "怎样才能看到北极光？",
      "想看一眼极光？你需要够暗的天空、对的位置，还有一点运气——NASA 专家讲讲怎么提高胜算。"],
    ["TROPICS", "TROPICS 任务发射",
      "火箭实验室的电子号从新西兰升空，把两颗 NASA 立方星送入轨道，用来追踪热带气旋。"],
    ["Earth_View", "从国际空间站看地球",
      "空间站的高清地球观测实验用一组外部相机持续拍摄地球，这是它拍下的画面。"]
  ];

  function zhVideo(v) {
    for (var i = 0; i < VIDEO_ZH.length; i++) {
      if ((v.id || "").indexOf(VIDEO_ZH[i][0]) >= 0) {
        return { t: VIDEO_ZH[i][1], d: VIDEO_ZH[i][2] };
      }
    }
    return { t: pretty(v.title), d: v.desc || "" };
  }
  var modal = $("#vModal");
  var player = $("#vPlayer");
  var vTitle = $("#vTitle");
  var vDesc = $("#vDesc");
  var vTag = $("#vTag");
  var vClose = $("#vClose");
  var lastFocus = null;

  function card(v, i) {
    var el = document.createElement("button");
    el.type = "button";
    el.className = "video-card";
    el.setAttribute("aria-label", "播放视频：" + zhVideo(v).t);

    var poster = document.createElement("div");
    poster.className = "vc-poster";
    var img = document.createElement("img");
    img.loading = "lazy";
    img.src = v.poster;
    img.alt = "";
    poster.appendChild(img);

    var play = document.createElement("span");
    play.className = "vc-play";
    play.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
    poster.appendChild(play);

    el.appendChild(poster);

    var meta = document.createElement("div");
    meta.className = "vc-meta";
    var tag = document.createElement("span");
    tag.className = "vc-tag";
    tag.textContent = v.cat;
    var title = document.createElement("b");
    title.textContent = zhVideo(v).t;
    var date = document.createElement("span");
    date.className = "vc-date";
    date.textContent = v.date || "";
    meta.appendChild(tag);
    meta.appendChild(title);
    meta.appendChild(date);
    el.appendChild(meta);

    el.addEventListener("click", function () { open(v, el); });
    return el;
  }

  function open(v, from) {
    lastFocus = from || document.activeElement;
    var zv = zhVideo(v);
    vTitle.textContent = zv.t;
    vDesc.textContent = zv.d || "（暂无详细说明）";
    vTag.textContent = v.cat + (v.date ? " · " + v.date : "");
    player.src = v.src;
    modal.hidden = false;
    document.body.classList.add("lb-open");
    var p = player.play();
    if (p && p.catch) p.catch(function () { /* 自动播放被拦，等用户点 */ });
    if (vClose) vClose.focus();
  }

  function close() {
    if (!modal) return;
    modal.hidden = true;
    document.body.classList.remove("lb-open");
    player.pause();
    player.removeAttribute("src");
    player.load();
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  C.on(vClose, "click", close);
  C.on(modal, "click", function (e) {
    if (e.target.hasAttribute("data-vclose")) close();
  });
  document.addEventListener("keydown", function (e) {
    if (modal && !modal.hidden && e.key === "Escape") close();
  });

  var frag = document.createDocumentFragment();
  list.forEach(function (v, i) { frag.appendChild(card(v, i)); });
  grid.appendChild(frag);
})();
