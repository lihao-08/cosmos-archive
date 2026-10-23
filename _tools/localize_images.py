#!/usr/bin/env python3
"""把 189 张 NASA 影像全部下载到本地并压缩，站点彻底自包含。

- 缩略图：480px / q78  → assets/img/thumbs/<id>.jpg
- 大    图：1280px / q80 → assets/img/full/<id>.jpg
- 同时改写 assets/data/data.js 里的 thumb / img 字段为本地相对路径

支持断点续传：已存在的文件自动跳过，可重复运行。
"""
import io
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "cosmos-site")
IMG = os.path.join(ROOT, "assets", "img")
THUMB_DIR = os.path.join(IMG, "thumbs")
FULL_DIR = os.path.join(IMG, "full")
DATA = os.path.join(ROOT, "assets", "data", "data.js")
UA = {"User-Agent": "Mozilla/5.0 (cosmos-site localizer)"}

os.makedirs(THUMB_DIR, exist_ok=True)
os.makedirs(FULL_DIR, exist_ok=True)


def fetch(url, timeout=60, retries=3):
    last = None
    for i in range(retries):
        try:
            safe_url = urllib.parse.quote(url, safe=":/?#[]@!&'()*+,;=%~")
            req = urllib.request.Request(safe_url, headers=UA)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.2 * (i + 1))
    raise last


def safe_name(nasa_id):
    keep = "".join(c if (c.isalnum() or c in "-_") else "_" for c in nasa_id)
    return keep[:80]


def process(item):
    """下载并压缩一张影像，返回 (id, thumb_rel, full_rel, 状态)。"""
    nid = safe_name(item["id"])
    thumb_path = os.path.join(THUMB_DIR, nid + ".jpg")
    full_path = os.path.join(FULL_DIR, nid + ".jpg")
    thumb_rel = "assets/img/thumbs/%s.jpg" % nid
    full_rel = "assets/img/full/%s.jpg" % nid

    need_thumb = not os.path.exists(thumb_path)
    need_full = not os.path.exists(full_path)

    if not need_thumb and not need_full:
        return nid, thumb_rel, full_rel, "skip"

    # 优先用 medium 作源（1280px），拿不到再退到 thumb
    src_url = item.get("img") or item.get("thumb")
    raw = None
    try:
        raw = fetch(src_url)
    except Exception:  # noqa: BLE001
        try:
            raw = fetch(item.get("thumb") or src_url)
        except Exception as e:  # noqa: BLE001
            return nid, None, None, "fail:%s" % type(e).__name__

    try:
        im = Image.open(io.BytesIO(raw))
        if im.mode not in ("RGB", "L"):
            im = im.convert("RGB")
        elif im.mode == "L":
            im = im.convert("RGB")

        if need_full:
            f = im.copy()
            f.thumbnail((1280, 1280), Image.LANCZOS)
            f.save(full_path, "JPEG", quality=80, optimize=True, progressive=True)

        if need_thumb:
            t = im.copy()
            t.thumbnail((480, 480), Image.LANCZOS)
            t.save(thumb_path, "JPEG", quality=78, optimize=True, progressive=True)

        return nid, thumb_rel, full_rel, "ok"
    except Exception as e:  # noqa: BLE001
        return nid, None, None, "img-err:%s" % type(e).__name__


def main():
    raw = open(DATA, encoding="utf-8").read()
    head = raw[: raw.index("=") + 1]
    payload = raw[raw.index("=") + 1:].rstrip().rstrip(";")
    data = json.loads(payload)
    items = data["items"]

    print("共 %d 张影像，开始下载压缩（并发 6）..." % len(items))
    t0 = time.time()
    mapping = {}
    stats = {"ok": 0, "skip": 0, "fail": 0}
    fails = []

    with ThreadPoolExecutor(max_workers=6) as ex:
        futures = [ex.submit(process, it) for it in items]
        done = 0
        for fut in as_completed(futures):
            nid, t_rel, f_rel, st = fut.result()
            done += 1
            if st == "ok":
                stats["ok"] += 1
            elif st == "skip":
                stats["skip"] += 1
            else:
                stats["fail"] += 1
                fails.append((nid, st))
            if t_rel:
                mapping[nid] = (t_rel, f_rel)
            if done % 20 == 0 or done == len(items):
                print("  进度 %d/%d  ok=%d skip=%d fail=%d  %.0fs"
                      % (done, len(items), stats["ok"], stats["skip"], stats["fail"], time.time() - t0))

    # 改写 data.js
    changed = 0
    for it in items:
        nid = safe_name(it["id"])
        if nid in mapping:
            t_rel, f_rel = mapping[nid]
            if it.get("thumb") != t_rel or it.get("img") != f_rel:
                it["thumb"] = t_rel
                it["img"] = f_rel
                changed += 1

    data["meta"]["localized"] = True
    data["meta"]["localizedAt"] = time.strftime("%Y-%m-%d %H:%M")

    out = head + " " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"
    with open(DATA, "w", encoding="utf-8") as f:
        f.write(out)

    def dirsize(p):
        total = 0
        for dp, _, fs in os.walk(p):
            for x in fs:
                total += os.path.getsize(os.path.join(dp, x))
        return total

    print("\n完成：改写 %d 条记录" % changed)
    print("缩略图目录 %.1f MB / %d 个文件" % (dirsize(THUMB_DIR) / 1048576, len(os.listdir(THUMB_DIR))))
    print("大图目录   %.1f MB / %d 个文件" % (dirsize(FULL_DIR) / 1048576, len(os.listdir(FULL_DIR))))
    if fails:
        print("失败 %d 条：" % len(fails))
        for n, s in fails[:10]:
            print("  ", n, s)
    return 0 if not fails else 1


if __name__ == "__main__":
    sys.exit(main())
