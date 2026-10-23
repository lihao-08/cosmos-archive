#!/usr/bin/env python3
"""接入 NASA 之外的太空数据源。

1. 全球发射日程  — Launch Library 2 (The Space Devs)，覆盖全球所有航天机构
2. 空间天气      — NOAA SWPC：地磁 Kp 指数 + 太阳风速度/密度
3. 今日太阳      — NASA SDO 卫星三个波段的实时全日面影像

输出：assets/data/global.js （window.GLOBAL）
      assets/img/sun/*.jpg
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
SUN_DIR = os.path.join(ROOT, "assets", "img", "sun")
UA = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
      "Accept": "application/json,*/*"}
os.makedirs(SUN_DIR, exist_ok=True)


def get(url, timeout=45, retries=3):
    last = None
    for i in range(retries):
        try:
            req = urllib.request.Request(
                urllib.parse.quote(url, safe=":/?#[]@!&'()*+,;=%~"), headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def jget(url, **kw):
    return json.loads(get(url, **kw).decode("utf-8"))


# ---------------- 1. 全球发射日程 ----------------
def fetch_launches(limit=18):
    print("[Launch] 拉取全球待发射任务 ...")
    url = ("https://ll.thespacedevs.com/2.2.0/launch/upcoming/?limit=%d&mode=list" % limit)
    try:
        d = jget(url)
    except Exception as e:  # noqa: BLE001
        print("  FAIL", type(e).__name__)
        return None

    out = []
    for r in d.get("results", []):
        # 机构名归一化（含中文标注）
        lsp = r.get("lsp_name") or "Unknown"
        out.append({
            "name": (r.get("name") or "")[:70],
            "lsp": lsp[:40],
            "net": r.get("net") or "",
            "pad": (r.get("pad") or "")[:40],
            "loc": (r.get("location") or "")[:48],
            "status": (r.get("status") or {}).get("abbrev") or "",
            "statusName": (r.get("status") or {}).get("name") or "",
            "mission": (r.get("mission") or "")[:60],
            "type": (r.get("mission_type") or "")[:24],
            "img": r.get("image") or "",
        })
    agencies = {}
    for x in out:
        agencies[x["lsp"]] = agencies.get(x["lsp"], 0) + 1
    print("[Launch] %d 次，机构：%s" % (len(out), sorted(agencies.items(), key=lambda i: -i[1])[:6]))
    return {"total": d.get("count", len(out)), "items": out}


# ---------------- 2. 空间天气 ----------------
def fetch_space_weather():
    print("[SWPC] 地磁 Kp + 太阳风 ...")
    out = {"kp": [], "wind": [], "updated": ""}
    try:
        kp = jget("https://services.swpc.noaa.gov/json/planetary_k_index_1m.json")
        # 取最近 24 小时，每 30 分钟一个点
        kp = [x for x in kp if x.get("kp_index") is not None]
        step = max(1, len(kp) // 48)
        out["kp"] = [{"t": x["time_tag"][5:16], "k": x["kp_index"]} for x in kp[::step][-48:]]
        print("  Kp 点 %d 个，最新 %s（Kp=%s）" % (len(out["kp"]), out["kp"][-1]["t"], out["kp"][-1]["k"]))
    except Exception as e:  # noqa: BLE001
        print("  Kp FAIL", type(e).__name__)

    try:
        pl = jget("https://services.swpc.noaa.gov/json/rtsw/rtsw_wind_1m.json")
        rows = [x for x in pl if x.get("proton_speed") is not None]
        step = max(1, len(rows) // 40)
        for r in rows[::step][-40:]:
            try:
                spd = float(r["proton_speed"])
                den = float(r.get("proton_density") or 0)
            except (TypeError, ValueError):
                continue
            out["wind"].append({"t": str(r["time_tag"])[5:16], "v": round(spd), "d": round(den, 1)})
        print("  太阳风点 %d 个，最新 %.0f km/s" % (len(out["wind"]), out["wind"][-1]["v"]) if out["wind"] else "  太阳风无数据")
    except Exception as e:  # noqa: BLE001
        print("  wind FAIL", type(e).__name__)

    out["updated"] = time.strftime("%Y-%m-%d %H:%M")
    return out


# ---------------- 3. 今日太阳（SDO） ----------------
WAVES = [
    ("0193", "193 Å", "日冕 · 百万度等离子体"),
    ("0304", "304 Å", "色球层 · 较冷物质"),
    ("0171", "171 Å", "日冕环 · 磁力线结构"),
]


def fetch_sun():
    print("[SDO] 下载全日面影像 ...")
    out = []
    for code, wave, desc in WAVES:
        url = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_%s.jpg" % code
        path = os.path.join(SUN_DIR, "sun_%s.jpg" % code)
        try:
            # SDO 每 15 分钟更新一次，本地图超过 1 小时就重下（原来"存在即跳过"会一直用旧图）
            stale = (not os.path.exists(path)) or (time.time() - os.path.getmtime(path) > 3600)
            if stale:
                raw = get(url, timeout=90)
                im = Image.open(io.BytesIO(raw)).convert("RGB")
                im.thumbnail((820, 820), Image.LANCZOS)
                im.save(path, "JPEG", quality=86, optimize=True)
                print("  %s → %.0f KB" % (code, os.path.getsize(path) / 1024))
            else:
                print("  %s 本地图仍在 1 小时内，跳过" % code)
            out.append({
                "wave": wave, "desc": desc,
                "src": "assets/img/sun/sun_%s.jpg" % code,
            })
        except Exception as e:  # noqa: BLE001
            print("  %s FAIL %s" % (code, type(e).__name__))
    print("[SDO] %d 个波段" % len(out))
    return out


def load_prev():
    """读出上一次的 global.js，用于接口失败时兜底。"""
    p = os.path.join(DATA_DIR, "global.js")
    if not os.path.exists(p):
        return {}
    try:
        raw = open(p, encoding="utf-8").read()
        return json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    except Exception:  # noqa: BLE001
        return {}


def main():
    prev = load_prev()

    launch = fetch_launches()
    if not launch or not launch.get("items"):
        launch = prev.get("launch")
        if launch:
            print("  ! 发射数据抓取失败，沿用上次 %d 条" % len(launch.get("items") or []))

    weather = fetch_space_weather()
    if not weather.get("kp") and not weather.get("wind"):
        weather = prev.get("weather") or weather
        print("  ! 空间天气抓取失败，沿用上次数据")

    sun = fetch_sun()
    if not sun:
        sun = prev.get("sun") or []
        print("  ! 太阳影像缺失，沿用上次")

    data = {
        "fetched": time.strftime("%Y-%m-%d %H:%M"),
        "launch": launch,
        "weather": weather,
        "sun": sun,
    }
    out = ("/* 由 _tools/fetch_global.py 生成\n"
           "   全球发射：Launch Library 2 (The Space Devs)\n"
           "   空间天气：NOAA SWPC   太阳影像：NASA SDO */\n"
           "window.GLOBAL = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n")
    p = os.path.join(DATA_DIR, "global.js")
    with open(p, "w", encoding="utf-8") as f:
        f.write(out)
    print("\n写入 %s (%.0f KB)" % (os.path.relpath(p), os.path.getsize(p) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
