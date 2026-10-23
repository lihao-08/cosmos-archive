#!/usr/bin/env python3
"""抓取 NASA 实时数据 → cosmos-site/assets/data/live.js + assets/img/epic/

数据源（均经实测连通）：
  1. EPIC  DSCOVR 卫星地球全圆盘（需 key 提高配额）
  2. JPL CAD  未来 N 天近地小行星接近（无 CORS，必须预抓）
  3. NASA Exoplanet Archive  已确认系外行星全量（无 CORS，必须预抓）

用法：
  set NASA_KEY=xxxx   (或 --key xxxx)
  python fetch_live.py
"""
import argparse
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request

SITE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cosmos-site")
IMG_DIR = os.path.join(SITE, "assets", "img", "epic")
UA = {"User-Agent": "Mozilla/5.0 (cosmos-site data fetcher)"}


def bj_now():
    """返回北京时间字符串。GitHub Actions 的 runner 是 UTC，直接 strftime 会差 8 小时。"""
    return time.strftime("%Y-%m-%d %H:%M", time.gmtime(time.time() + 8 * 3600))


def get(url, timeout=60, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last


def jget(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


# ---------------- 1. EPIC 地球全圆盘 ----------------
def fetch_epic(api_key, max_frames=8):
    print("[EPIC] 拉取最新影像列表 ...")
    url = "https://api.nasa.gov/EPIC/api/natural?api_key=%s" % api_key
    try:
        data = jget(url)
    except Exception as e:  # noqa: BLE001
        print("  FAIL:", e)
        return None
    if not data:
        print("  FAIL: 空列表")
        return None

    # 均匀抽帧
    n = len(data)
    idx = [round(i * (n - 1) / (max_frames - 1)) for i in range(max_frames)] if n >= max_frames else list(range(n))
    picked = [data[i] for i in sorted(set(idx))]

    os.makedirs(IMG_DIR, exist_ok=True)
    frames = []
    from PIL import Image  # 延迟导入，失败时不阻塞其它数据

    for k, item in enumerate(picked):
        ident = item["image"]
        date = item["date"][:10].replace("-", "/")
        png_url = "https://epic.gsfc.nasa.gov/archive/natural/%s/png/%s.png" % (date, ident)
        out_name = "epic_%02d.jpg" % (k + 1)
        out_path = os.path.join(IMG_DIR, out_name)
        if not os.path.exists(out_path):
            try:
                raw = get(png_url, timeout=90)
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                im = im.resize((820, 820), Image.LANCZOS)
                im.save(out_path, "JPEG", quality=82, optimize=True)
                print("  下载 %s (%.0f KB)" % (out_name, os.path.getsize(out_path) / 1024))
            except Exception as e:  # noqa: BLE001
                print("  跳过 %s (%s)" % (ident, e))
                continue
        cc = item.get("centroid_coordinates", {})
        frames.append({
            "t": item["date"][11:16],
            "lat": round(cc.get("lat", 0), 2),
            "lon": round(cc.get("lon", 0), 2),
            "src": "assets/img/epic/%s" % out_name,
        })

    if not frames:
        return None
    print("[EPIC] %d 帧，日期 %s" % (len(frames), data[0]["date"][:10]))
    return {"date": data[0]["date"][:10], "frames": frames}


# ---------------- 2. JPL 小行星接近 ----------------
def fetch_neo(days=30, dist_max=0.2):
    import datetime
    start = datetime.date.today()
    end = start + datetime.timedelta(days=days)
    url = ("https://ssd-api.jpl.nasa.gov/cad.api?date-min=%s&date-max=%s&dist-max=%s"
           % (start.isoformat(), end.isoformat(), dist_max))
    print("[CAD] 未来 %d 天近地小行星 ..." % days)
    try:
        d = jget(url)
    except Exception as e:  # noqa: BLE001
        print("  FAIL:", e)
        return None
    f = d["fields"]
    i_des, i_cd, i_dist, i_vrel, i_h = f.index("des"), f.index("cd"), f.index("dist"), f.index("v_rel"), f.index("h")
    items = []
    for row in d["data"]:
        try:
            items.append({
                "n": row[i_des],
                "d": row[i_cd],                                  # 2026-Oct-23 08:34
                "au": round(float(row[i_dist]), 5),              # 最近距离 AU
                "v": round(float(row[i_vrel]), 2),               # 相对速度 km/s
                "h": row[i_h] if row[i_h] not in (None, "") else None,   # 绝对星等
            })
        except (ValueError, IndexError):
            continue
    if not items:
        print("[CAD] 无数据")
        return None
    items.sort(key=lambda x: x["au"])
    print("[CAD] %d 条，最近 %.5f AU (%s)" % (len(items), items[0]["au"], items[0]["n"]))
    return {"days": days, "count": len(items), "items": items}


# ---------------- 3. 系外行星 ----------------
METHODS = ["Transit", "Radial Velocity", "Microlensing", "Imaging", "其他"]


def fetch_exo():
    q = ("select pl_name,disc_year,pl_orbper,pl_rade,pl_bmasse,discoverymethod,sy_dist "
         "from pscomppars")
    url = ("https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=%s&format=json"
           % urllib.parse.quote(q))
    print("[Exo] 拉取已确认系外行星 ...")
    try:
        d = jget(url, timeout=120)
    except Exception as e:  # noqa: BLE001
        print("  FAIL:", e)
        return None
    rows = []
    for p in d:
        if p.get("pl_orbper") is None or p.get("pl_rade") is None:
            continue
        m = p.get("discoverymethod") or ""
        mi = METHODS.index(m) if m in METHODS else 4
        rows.append([
            p["pl_name"],
            int(p["disc_year"]) if p.get("disc_year") else None,
            round(float(p["pl_orbper"]), 3),
            round(float(p["pl_rade"]), 2),
            round(float(p["pl_bmasse"]), 1) if p.get("pl_bmasse") else None,
            mi,
            round(float(p["sy_dist"]), 1) if p.get("sy_dist") else None,
        ])
    rows.sort(key=lambda r: (r[1] or 0))
    print("[Exo] %d 颗（有周期与半径）" % len(rows))
    return {"count": len(rows), "methods": METHODS, "rows": rows}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--key", default=None)
    ap.add_argument("--no-epic", action="store_true")
    args = ap.parse_args()

    # key 优先级：命令行 > 环境变量 > 同目录 .nasa_key 文件 > DEMO_KEY
    key = args.key or os.environ.get("NASA_KEY")
    if not key:
        key_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".nasa_key")
        if os.path.exists(key_file):
            with open(key_file, encoding="utf-8") as f:
                key = f.read().strip()
    if not key:
        key = "DEMO_KEY"
        print("提示：未找到 key，使用 DEMO_KEY（每小时 30 次，容易限流）")

    # 读出上次的数据，某一源失败时沿用，避免把线上数据刷成空
    path = os.path.join(SITE, "assets", "data", "live.js")
    prev = {}
    if os.path.exists(path):
        try:
            raw = open(path, encoding="utf-8").read()
            prev = json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
        except Exception:  # noqa: BLE001
            prev = {}

    out = {"fetched": bj_now(), "epic": None, "neo": None, "exo": None}

    if not args.no_epic:
        out["epic"] = fetch_epic(key)
    if not out["epic"] or not (out["epic"] or {}).get("frames"):
        out["epic"] = prev.get("epic")
        if out["epic"]:
            print("  ! EPIC 抓取失败，沿用上次 %d 帧" % len(out["epic"].get("frames") or []))

    out["neo"] = fetch_neo()
    if not out["neo"] or not (out["neo"] or {}).get("items"):
        out["neo"] = prev.get("neo")
        if out["neo"]:
            print("  ! 小行星抓取失败，沿用上次 %d 颗" % len(out["neo"].get("items") or []))

    out["exo"] = fetch_exo()
    if not out["exo"] or not (out["exo"] or {}).get("rows"):
        out["exo"] = prev.get("exo")
        if out["exo"]:
            print("  ! 系外行星抓取失败，沿用上次 %d 颗" % len(out["exo"].get("rows") or []))

    js = "/* 由 _tools/fetch_live.py 生成，数据来自 NASA 官方开放接口 */\nwindow.LIVE = " \
         + json.dumps(out, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(path, "w", encoding="utf-8") as f:
        f.write(js)
    print("\n写入 %s (%.0f KB)" % (os.path.relpath(path), os.path.getsize(path) / 1024))


if __name__ == "__main__":
    sys.exit(main())
