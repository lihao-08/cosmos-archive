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
    el.setAttribute("aria-label", "播放视频：" + pretty(v.title));

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
    title.textContent = pretty(v.title);
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
    vTitle.textContent = pretty(v.title);
    vDesc.textContent = v.desc || "（暂无详细说明）";
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
