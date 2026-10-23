#!/usr/bin/env python3
"""补齐站内尚未用上的 NASA 数据：

1. 视频    — images-api media_type=video，取 ~mobile.mp4（约 5MB/条）+ 封面
2. EONET   — 地球正在发生的自然事件（野火 / 风暴 / 火山），GeoJSON
3. SBDB    — 对 live.js 里最接近的若干小行星，查轨道要素与物理参数

输出：assets/data/extra.js  （window.EXTRA）
      assets/img/video/*.jpg、*.mp4
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cosmos-site")
DATA_DIR = os.path.join(ROOT, "assets", "data")
VID_DIR = os.path.join(ROOT, "assets", "img", "video")
UA = {"User-Agent": "Mozilla/5.0 (cosmos-site)"}
os.makedirs(VID_DIR, exist_ok=True)


def bj_now():
    """返回北京时间字符串。GitHub Actions 的 runner 是 UTC，直接 strftime 会差 8 小时。"""
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(time.time() + 8 * 3600))


def get(url, timeout=60, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(urllib.parse.quote(url, safe=":/?#[]@!&'()*+,;=%~"), headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def head_size(url):
    try:
        req = urllib.request.Request(urllib.parse.quote(url, safe=":/"), headers=UA, method="HEAD")
        with urllib.request.urlopen(req, timeout=20) as r:
            return int(r.headers.get("Content-Length") or 0)
    except Exception:  # noqa: BLE001
        return 0


def jget(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


# ---------------- 1. 视频 ----------------
QUERIES = [
    ("apollo 11 moonwalk", "登月"),
    ("spacewalk ISS", "舱外活动"),
    ("mars rover landing", "火星着陆"),
    ("aurora from space", "极光"),
    ("rocket launch", "火箭发射"),
    ("earth from space", "地球"),
]


def fetch_videos(max_total=6, max_mb=8):
    print("[Video] 搜索可用视频 ...")
    picked, seen = [], set()
    for q, cat in QUERIES:
        if len(picked) >= max_total:
            break
        try:
            d = jget("https://images-api.nasa.gov/search?q=%s&media_type=video&page_size=8"
                     % urllib.parse.quote(q))
        except Exception as e:  # noqa: BLE001
            print("  查询失败", q, type(e).__name__)
            continue
        per_query = 0
        for it in d.get("collection", {}).get("items", []):
            if len(picked) >= max_total or per_query >= 1:
                break
            dd = (it.get("data") or [{}])[0]
            nid = dd.get("nasa_id")
            if not nid or nid in seen:
                continue
            try:
                assets = jget("https://images-api.nasa.gov/asset/" + urllib.parse.quote(nid))
            except Exception:  # noqa: BLE001
                continue
            files = [x["href"] for x in assets.get("collection", {}).get("items", [])]
            mobile = next((f for f in files if f.endswith("~mobile.mp4")), None)
            thumb = next((f for f in files if f.endswith("~medium.jpg")), None) or \
                    next((f for f in files if f.endswith("~thumb.jpg")), None)
            if not mobile or not thumb:
                continue
            size = head_size(mobile)
            if not size or size > max_mb * 1048576:
                continue
            seen.add(nid)
            per_query += 1
            picked.append({
                "id": nid, "cat": cat,
                "title": (dd.get("title") or nid)[:90],
                "desc": " ".join((dd.get("description") or "").split())[:200],
                "date": (dd.get("date_created") or "")[:10],
                "mobile": mobile, "thumbUrl": thumb,
                "bytes": size,
            })
            print("  选中 %-38s %5.1f MB  [%s]" % (dd.get("title", "")[:36], size / 1048576, cat))

    out = []
    for i, v in enumerate(picked):
        base = "v%02d" % (i + 1)
        mp4_path = os.path.join(VID_DIR, base + ".mp4")
        jpg_path = os.path.join(VID_DIR, base + ".jpg")
        if not os.path.exists(jpg_path):
            try:
                raw = get(v["thumbUrl"], timeout=90)
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                im.thumbnail((960, 960), Image.LANCZOS)
                im.save(jpg_path, "JPEG", quality=80, optimize=True)
            except Exception as e:  # noqa: BLE001
                print("  封面失败", base, type(e).__name__)
                continue
        if not os.path.exists(mp4_path):
            try:
                with open(mp4_path, "wb") as f:
                    f.write(get(v["mobile"], timeout=180))
                print("  下载 %s (%.1f MB)" % (base + ".mp4", os.path.getsize(mp4_path) / 1048576))
            except Exception as e:  # noqa: BLE001
                print("  视频失败", base, type(e).__name__)
                continue
        out.append({
            "id": v["id"], "cat": v["cat"], "title": v["title"], "desc": v["desc"],
            "date": v["date"],
            "poster": "assets/img/video/%s.jpg" % base,
            "src": "assets/img/video/%s.mp4" % base,
            "mb": round(os.path.getsize(mp4_path) / 1048576, 1),
        })
    print("[Video] 完成 %d 条" % len(out))
    return out


# ---------------- 2. EONET 地球事件 ----------------
def fetch_eonet(limit=40):
    print("[EONET] 地球正在发生的事件 ...")
    try:
        d = jget("https://eonet.gsfc.nasa.gov/api/v3/events?status=open&limit=%d" % limit)
    except Exception as e:  # noqa: BLE001
        print("  FAIL", type(e).__name__)
        return None
    out = []
    for ev in d.get("events", []):
        geo = ev.get("geometry") or []
        if not geo:
            continue
        g = geo[-1]
        coords = g.get("coordinates")
        if not coords:
            continue
        # Point: [lon, lat]；Polygon: [[[lon,lat],...]]
        if isinstance(coords[0], (int, float)):
            lon, lat = coords[0], coords[1]
        else:
            ring = coords[0] if isinstance(coords[0][0], list) else coords
            lon = sum(p[0] for p in ring) / len(ring)
            lat = sum(p[1] for p in ring) / len(ring)
        cats = ev.get("categories") or [{}]
        out.append({
            "id": ev.get("id"),
            "title": (ev.get("title") or "")[:80],
            "cat": cats[0].get("title") or "其他",
            "date": (g.get("date") or "")[:10],
            "lat": round(lat, 3),
            "lon": round(lon, 3),
        })
    print("[EONET] %d 个事件，类型：%s" % (len(out), sorted(set(x["cat"] for x in out))))
    return out


# ---------------- 3. SBDB 小行星档案 ----------------
def fetch_sbdb(names, limit=14):
    print("[SBDB] 查询小行星轨道要素 ...")
    out = []
    for n in names[:limit]:
        try:
            d = jget("https://ssd-api.jpl.nasa.gov/sbdb.api?sstr=%s&phys-par=1" % urllib.parse.quote(n))
        except Exception as e:  # noqa: BLE001
            print("  %s FAIL %s" % (n, type(e).__name__))
            continue
        orb = d.get("orbit") or {}
        els = {e["name"]: e.get("value") for e in (orb.get("elements") or [])}
        phys = {p["name"]: p.get("value") for p in (d.get("phys_par") or [])}
        obj = d.get("object") or {}

        def fnum(v, nd=3):
            try:
                return round(float(v), nd)
            except (TypeError, ValueError):
                return None

        out.append({
            "n": obj.get("des") or obj.get("fullname") or n,
            "full": (obj.get("fullname") or "")[:70],
            "a": fnum(els.get("a")),          # 半长轴 AU
            "e": fnum(els.get("e")),          # 偏心率
            "i": fnum(els.get("i")),          # 轨道倾角 deg
            "q": fnum(els.get("q")),          # 近日点 AU
            "ad": fnum(els.get("ad")),        # 远日点 AU
            "per": fnum(els.get("per"), 2),   # 公转周期 天
            "diam": fnum(phys.get("diameter"), 3),   # 直径 km
            "rot": fnum(phys.get("rot_per"), 3),     # 自转周期 h
            "albedo": fnum(phys.get("albedo"), 3),
            "class": (obj.get("orbit_class") or {}).get("name") or "",
        })
        print("  %-14s a=%.3f e=%.3f i=%.2f diam=%s" % (out[-1]["n"], out[-1]["a"] or 0,
                                                        out[-1]["e"] or 0, out[-1]["i"] or 0,
                                                        out[-1]["diam"]))
        time.sleep(0.25)
    print("[SBDB] 完成 %d 条" % len(out))
    return out


def main():
    # --skip-video：每日更新只刷动态数据（EONET / SBDB），视频沿用现有文件
    skip_video = "--skip-video" in sys.argv

    live_path = os.path.join(DATA_DIR, "live.js")
    near_names = []
    if os.path.exists(live_path):
        raw = open(live_path, encoding="utf-8").read()
        raw = raw[raw.index("=") + 1:].rstrip().rstrip(";")
        live = json.loads(raw)
        near_names = [x["n"] for x in (live.get("neo") or {}).get("items", [])[:16]]

    videos = []
    extra_path = os.path.join(DATA_DIR, "extra.js")
    if skip_video and os.path.exists(extra_path):
        try:
            raw = open(extra_path, encoding="utf-8").read()
            prev = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
            videos = prev.get("videos") or []
            print("[Video] 跳过重搜，沿用现有 %d 条" % len(videos))
        except Exception as e:  # noqa: BLE001
            print("[Video] 读取旧数据失败，重新抓取:", type(e).__name__)
            videos = fetch_videos()
    else:
        videos = fetch_videos()

    extra = {
        "fetched": bj_now(),
        "videos": videos,
        "eonet": fetch_eonet(),
        "sbdb": fetch_sbdb(near_names) if near_names else [],
    }

    out = "/* 由 _tools/fetch_extra.py 生成：视频 / EONET 地球事件 / 小行星档案 */\nwindow.EXTRA = " \
          + json.dumps(extra, ensure_ascii=False, separators=(",", ":")) + ";\n"
    p = os.path.join(DATA_DIR, "extra.js")
    with open(p, "w", encoding="utf-8") as f:
        f.write(out)
    print("\n写入 %s (%.0f KB)" % (os.path.relpath(p), os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
