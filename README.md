# 寰宇 COSMOS

汇聚全球航天机构公开数据的宇宙影像档案。

**在线访问**：https://lihao-08.github.io/cosmos-archive/

## 这是什么

一个纯静态的太空数据站点：深空影像、动态影像、实时太阳活动、全球发射日程、近地小行星、系外行星图鉴、地球上正在发生的自然事件。

数据每天由 GitHub Actions 自动抓取并重新部署，与本机是否开机无关。全站 189 幅影像的标题与说明已中文化，英文原名保留在灯箱副标题里。

## 数据来源

| 来源 | 内容 |
|---|---|
| NASA Image and Video Library | 189 幅影像、6 段动态影像 |
| NASA EPIC / DSCOVR | 地球全圆盘影像（按天发布，滞后 1–3 天）|
| NASA SDO | 太阳全日面，3 个波段 |
| NASA EONET | 地球自然事件（野火 / 风暴 / 海冰）|
| NASA Exoplanet Archive | 已确认系外行星 6000+ |
| JPL CAD | 近地小行星接近数据 |
| JPL SBDB | 小行星轨道与物理参数 |
| NOAA SWPC | 地磁 Kp 指数、太阳风 |
| The Space Devs Launch Library 2 | 全球发射日程 |

所有影像与视频已下载到本地并重新压缩，站点不依赖任何外部 CDN。

## 自动更新

`.github/workflows/update.yml` 每天 UTC 22:00（北京时间次日 06:00）执行：

1. 运行 `_tools/daily_update.py` 抓取最新数据
2. 运行 `_tools/to_webp.py`，为当天新增图片增量生成 WebP 副本
3. 数据有变化则自动提交
4. 部署到 GitHub Pages

任一数据源不可用时，脚本会沿用上一次的数据，不会把线上内容刷成空。

手动触发：仓库 Actions 页面 → 「更新太空数据并部署」→ Run workflow。推送代码也会触发部署（但不重新抓数据）。

## 前端架构

零构建、零 npm 依赖，改完直接 push 即上线。

- **`assets/js/boot.js` 是唯一加载调度器**。依赖图在这里显式声明，脚本与数据按 Promise 缓存动态注入，不会重复加载。首屏只取 `core` + `data` + `gallery` + `solar`；`astro / orrery / sky / videos / live` 等模块在对应章节接近视口前 1200px 才预取。打印、无 `IntersectionObserver`、资源失败均有兜底。
- **`assets/js/core.js`** 提供 `COSMOS` 公共工具（选择器、reveal 观察器、WebP 路径改写）。功能模块仍是 IIFE，由调度器决定何时执行。
- **图片走 WebP + 自动回退**。数据文件里存的仍是 `.jpg` 路径（云端抓取脚本不用改），前端统一改写为 `.webp`；任何一张加载失败，`boot.js` 在捕获阶段自动换回同名 JPG。首屏大背景用 `image-set()`。
- **`reveal` 入场动画是渐进增强**：只有确认 JS 可用才给 `<html>` 加 `js-anim` 类隐藏内容；无 JS、脚本失败、打印时内容默认全部可见。
- **`assets/css/refactor.css`** 是第二版设计语言（深墨 + 铜金的「观测档案」风格），覆盖在四个基础 CSS 之上。章节编号沿用 `base.css` 的 `sec` 计数器。

## 目录结构

```
cosmos-site/            站点本体（静态，直接可部署）
  index.html
  assets/css/           base / layout / gallery / instruments / refactor
  assets/js/            boot（调度）+ core + 7 个功能模块 + 天文引擎
  assets/data/          数据快照（live / extra / global / 影像索引）
  assets/img/           JPG 原图 + WebP 副本、6 段视频、太阳与地球影像
.github/workflows/      每日抓取 + WebP + Pages 部署
_tools/                 数据抓取与素材处理脚本
  daily_update.py       每日更新主入口
  fetch_live.py         NASA EPIC / 小行星 / 系外行星
  fetch_global.py       NOAA / SDO / 全球发射
  fetch_extra.py        EONET / 小行星档案 / 视频
  localize_images.py    影像本地化（仅在需要重建素材时使用）
  to_webp.py            JPG → WebP 增量转换（本地可调 --force 全量重转）
```

## 本地预览

```bash
cd cosmos-site
python -m http.server 8080
```

打开 http://127.0.0.1:8080

## 许可

站点代码可自由使用。影像与数据版权归 NASA、JPL、NOAA、The Space Devs 及相关贡献者所有，NASA 资料多属公共领域。
