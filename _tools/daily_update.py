#!/usr/bin/env python3
"""每日数据更新：依次刷新三组动态数据，不重下图片和视频。

  1. fetch_live.py      NASA EPIC 地球 / 近地小行星 / 系外行星
  2. fetch_global.py    NOAA 空间天气 / SDO 太阳 / 全球发射日程
  3. fetch_extra.py     EONET 地球事件 / 小行星轨道档案（--skip-video）

任一步失败不会中断其余步骤，最后统一汇总退出码：
  0 = 全部成功    1 = 有步骤失败
"""
import json
import os
import subprocess
import sys
import time

TOOLS = os.path.dirname(os.path.abspath(__file__))
SITE = os.path.join(TOOLS, "..", "cosmos-site")
DATA = os.path.join(SITE, "assets", "data")

STEPS = [
    ("NASA 实时数据", ["fetch_live.py"]),
    ("全球太空数据", ["fetch_global.py"]),
    ("地球事件与档案", ["fetch_extra.py", "--skip-video"]),
]


def read_var(path, var):
    """从 window.XXX = {...}; 里取出 JSON。"""
    if not os.path.exists(path):
        return None
    try:
        raw = open(path, encoding="utf-8").read()
        return json.loads(raw[raw.index("=") + 1:].rstrip().rstrip(";"))
    except Exception:  # noqa: BLE001
        return None


def main():
    print("=" * 56)
    print("每日数据更新 · %s" % time.strftime("%Y-%m-%d %H:%M"))
    print("=" * 56)

    results = []
    for label, args in STEPS:
        print("\n>>> %s" % label)
        t0 = time.time()
        try:
            r = subprocess.run(
                [sys.executable] + args,
                cwd=TOOLS, capture_output=True, timeout=900,
                encoding="utf-8", errors="replace",
            )
            ok = r.returncode == 0
            out = (r.stdout or "").strip().split("\n")
            for line in out[-4:]:
                if line.strip():
                    print("    " + line.strip())
            if not ok and r.stderr:
                print("    ! " + (r.stderr.strip().split("\n")[-1])[:160])
        except subprocess.TimeoutExpired:
            ok = False
            print("    ! 超时（>15 分钟）")
        except Exception as e:  # noqa: BLE001
            ok = False
            print("    ! 异常：%s" % type(e).__name__)
        dt = time.time() - t0
        results.append((label, ok, dt))
        print("    %s %.1fs" % ("完成" if ok else "失败", dt))

    # ---- 汇总 ----
    print("\n" + "-" * 56)
    live = read_var(os.path.join(DATA, "live.js"), "LIVE") or {}
    glob = read_var(os.path.join(DATA, "global.js"), "GLOBAL") or {}
    extra = read_var(os.path.join(DATA, "extra.js"), "EXTRA") or {}

    def cnt(d, *path):
        cur = d
        for p in path:
            cur = cur.get(p) if isinstance(cur, dict) else None
            if cur is None:
                return 0
        return len(cur) if hasattr(cur, "__len__") else 0

    print("数据快照")
    print("  地球影像 EPIC      %d 帧" % cnt(live, "epic", "frames"))
    print("  近地小行星         %d 颗" % cnt(live, "neo", "items"))
    print("  系外行星           %d 颗" % cnt(live, "exo", "rows"))
    print("  全球待发射         %d 次" % cnt(glob, "launch", "items"))
    print("  Kp 指数点          %d 个" % cnt(glob, "weather", "kp"))
    print("  SDO 太阳波段       %d 个" % cnt(glob, "sun"))
    print("  地球事件           %d 起" % cnt(extra, "eonet"))
    print("  小行星档案         %d 条" % cnt(extra, "sbdb"))

    for f in ["live.js", "global.js", "extra.js"]:
        p = os.path.join(DATA, f)
        if os.path.exists(p):
            print("  %-14s %6.0f KB  %s" % (f, os.path.getsize(p) / 1024,
                                            time.strftime("%m-%d %H:%M", time.localtime(os.path.getmtime(p)))))

    # 空数据检查：某块为空时即便脚本返回 0 也要标记
    warn = []
    if not glob.get("launch"):
        warn.append("全球发射为空")
    if cnt(live, "exo", "rows") < 1000:
        warn.append("系外行星数据异常")
    if cnt(live, "neo", "items") < 10:
        warn.append("小行星数据异常")
    if cnt(extra, "eonet") < 5:
        warn.append("地球事件为空")

    failed = [r for r in results if not r[1]]
    print("-" * 56)
    print("成功 %d / %d 步，总耗时 %.1fs" % (len(results) - len(failed), len(results),
                                             sum(r[2] for r in results)))
    if failed:
        print("失败：" + "、".join(r[0] for r in failed))
    if warn:
        print("警告：" + "、".join(warn) + "（已保留旧数据）")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(main())
