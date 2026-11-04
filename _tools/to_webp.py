"""把 cosmos-site/assets/img 下的 JPG 增量转成 WebP 副本。

设计要点
- 保留原 JPG：数据文件里写的仍是 .jpg 路径，云端每日抓取也会产出新的 JPG，
  原图同时充当 WebP 缺失时的回退。
- 增量：目标 .webp 比源 .jpg 新就跳过，GitHub Actions 每天跑也只处理新增文件。
  本地调了压缩参数时用 `--force` 全量重转。
- 星空图噪点多，WebP 高画质反而比 JPG 大，所以按用途分档压：
  首屏背景隔着 0.5 透明度和暗色遮罩，压得最狠也不易察觉。
- 前端通过 COSMOS.webp() 换路径，加载失败由 boot.js 的全局 error 捕获回退 JPG。
"""
import argparse
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent / "cosmos-site" / "assets" / "img"


def quality_for(src: Path) -> int:
    if src.name == "hero-pillars.jpg":
        return 62
    if src.parent == ROOT:          # 根目录展示大图
        return 72
    return 76                        # thumbs / full / epic / sun / video 海报


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="忽略时间戳，全量重转")
    args = ap.parse_args()

    files = sorted(ROOT.rglob("*.jpg"))
    made = skipped = 0
    before = after = 0
    failed = []

    for src in files:
        dst = src.with_suffix(".webp")
        if not args.force and dst.exists() and dst.stat().st_mtime >= src.stat().st_mtime:
            skipped += 1
            continue
        try:
            with Image.open(src) as im:
                im.convert("RGB").save(dst, "WEBP", quality=quality_for(src), method=6)
        except Exception as exc:  # 单张坏图不影响整体
            failed.append((src.name, str(exc)[:60]))
            continue
        made += 1
        before += src.stat().st_size
        after += dst.stat().st_size

    total_jpg = sum(f.stat().st_size for f in files)
    total_webp = sum(f.stat().st_size for f in ROOT.rglob("*.webp"))
    print(f"JPG {len(files)} 张 / {total_jpg / 1048576:.1f} MB")
    print(f"WebP 新增 {made} 张，跳过 {skipped} 张，累计 {total_webp / 1048576:.1f} MB")
    print(f"总体节省 {(1 - total_webp / total_jpg) * 100:.0f}%")
    if made:
        print(f"本次转换：{before / 1048576:.1f} MB -> {after / 1048576:.1f} MB "
              f"(省 {(1 - after / before) * 100:.0f}%)")
    if failed:
        print("失败：", failed[:5])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
