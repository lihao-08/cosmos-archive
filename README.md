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

- **`assets/js/boot.js` 是唯一加载调度器**。依赖图在这里显式声明，脚本与数据按 Promise 缓存动态注入，不会重复加载。首屏只取 `core` + `data` + `archive` + `gallery` + `solar`；`astro / orrery / sky / videos / live` 等模块在对应章节接近视口前 1200px 才预取。打印、无 `IntersectionObserver`、资源失败均有兜底。
- **`assets/js/core.js`** 提供 `COSMOS` 公共工具（选择器、reveal 观察器、WebP 路径改写）。功能模块仍是 IIFE，由调度器决定何时执行。
- **`assets/js/archive.js`（第四版新增）** 是「可核查」层：收藏、引文、分享链接、首屏简报。收藏存 `localStorage`（键 `cosmos:fav:v1`），不需要账号也不上传；分享链接把 id 列表放 `?f=`，对方打开即可看到同一份清单并一键收入自己的收藏。灯箱引文按「机构 · 标题 · 日期 · 原始记录 URL · 访问日期」生成，可直接粘贴。
- **图片走 WebP + 自动回退**。数据文件里存的仍是 `.jpg` 路径（云端抓取脚本不用改），前端统一改写为 `.webp`；任何一张加载失败，`boot.js` 在捕获阶段自动换回同名 JPG。首屏大背景用 `image-set()`。所有图版带显式 `width/height`，避免布局跳动。
- **`reveal` 入场动画是渐进增强**：只有确认 JS 可用才给 `<html>` 加 `js-anim` 类隐藏内容；无 JS、脚本失败、打印时内容默认全部可见。
- **`assets/css/refactor.css`** 是设计语言「观测控制台」，覆盖在四个基础 CSS 之上：冷青为结构色、金只作数据信号、深灰蓝底（不用纯黑）、零圆角 1px 钢网格、超大左对齐标题、标本标签式影像图版、仪器括号与真实遥测读数。第四版在文件末尾追加了收藏抽屉、出处栏与 WCAG 2.2 修补。
- 颜色按 WCAG 2.2 AA 逐对验算：正文 ≥4.5:1、UI 边界与焦点 ≥3:1，并用浏览器实测合成色复核（不只看设计令牌）。WCAG 2.2 新增项也已处理：锚点 `scroll-margin-top` 避开吸顶导航（2.4.11）、滑块与图标的命中区 ≥24×24（2.5.8）、侧边圆点视觉仍是 9px 但点击区 24px。

## 设计参考（2026-11-04 调研）

第三版不是凭感觉配色，依据如下：

| 来源 | 借鉴的手法 |
|---|---|
| [webbtelescope.org](https://www.webbtelescope.org/) / [NASA Science](https://science.nasa.gov/)（实测） | 全幅深空图 + 超大左对齐 80px/700 实色白标题 + 面包屑；正文区用浅色，深色留给影像 |
| [ESA](https://www.esa.int/)（实测） | 极简顶栏、等宽大写机构名、1px 细线 |
| [Curio · James Webb Telescope (2022)](https://designbycurio.com/learn/james-webb-telescope-2022)、[Deep Space Observatory](https://designbycurio.com/observatory-deep-space-2020) | 双色系统（镜面金 / 电离青）、等宽遥测字、细钢网格、靠黑色负空间而非阴影建立深度；红外数据由青到金按波长映射 |
| [Canemah · Macroscope 视觉规范 (2026)](https://canemah.org/archive/document.php?id=CNL-SP-2026-051) | 标本标签式图版（图片加框 + 下方等宽 caption bar 写编号/时间/来源）、仪器括号 `[ ]`、坐标批注；禁用渐变按钮、玻璃拟态、霓虹强调，签名手法最多两个 |
| [WebYes · 深色模式与 WCAG](https://www.webyes.com/blogs/dark-mode-accessibility)、[Lucky.Graphics · 深色模式设计指南 2026](https://lucky.graphics/learn/dark-mode-design-guide-2026) | 正文 4.5:1 / 大字与 UI 3:1；深灰底而非纯黑、正文不用纯白、品牌色提亮降饱和、分隔线要够 3:1、焦点必须可见、测最终合成色 |
| [2026 趋势综述](https://www.lumarodigital.com.au/?p=8857)、[InspireFusion](https://www.inspirefusion.com/web-design-inspiration-trends-2026/) | 深色为默认、大胆排版、微交互「感受到而非注意到」、尊重 `prefers-reduced-motion`、性能优先，且不要一次追齐所有趋势 |

### 第四版补充调研（2026-11-04）

| 来源 | 借鉴的手法 |
|---|---|
| [Yale University Art Gallery · Using the Collection](https://artgallery.yale.edu/using-collection)、[Cooper Hewitt shoebox](https://labs.cooperhewitt.org/tag/collecting/) | 不登录的个人收藏：缩略图角标 → 本地保存 → 可分享链接 → 一键清空；用户不必注册也愿意整理自己的清单 |
| [NASA · Images and Media 使用指南](https://www.nasa.gov/multimedia/guidelines/index.html) | 内容一般不受版权保护，但必须注明 NASA 为来源、不得暗示 NASA 认可、徽标受法律保护；据此写了灯箱「出处 / 原始编号 / 原始记录」三件套与关于页许可说明 |
| [daisyUI · 2026 UI 趋势](https://trends.daisyui.com/ui-design-trends-2026)、[Social Script · 2026 真实上线的趋势](https://www.socialscript.in/blog/web-design-trends-2026) | Data-Dense Utilitarian 回潮、编辑式密度取代大面积留白、微仪表盘先用一句人话摘要再给读数 |
| [WCAG 2.2 清单](https://getwcag.com/en/wcag-2-2-guidelines)、[WebYes WCAG 2.2](https://www.webyes.com/blogs/wcag-2-2-compliance-checklist) | 2.4.11 焦点不被遮挡、2.5.8 目标 ≥24×24、滚动锚点偏移 |
| [Chrome/Edge 115+、Safari 18+ 的 scroll-driven animations](https://csstools.io/blog/css-scroll-driven-animations) | `animation-timeline: scroll()` 只用在首屏背景这类装饰层，`@supports` 包裹，不支持就是静态图，不冒险隐藏内容 |

## 目录结构

```
cosmos-site/            站点本体（静态，直接可部署）
  index.html
  assets/css/           base / layout / gallery / instruments / refactor
  assets/js/            boot（调度）+ core + archive（收藏/引文）+ 7 个功能模块 + 天文引擎
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

站点代码可自由使用。

NASA 内容在美国一般不受版权保护，可用于教育与信息性用途。依 NASA 媒体使用指南，转载须注明 NASA 为来源，且不得暗示 NASA 对本站的认可；NASA 徽标、标识与徽章受法律保护，本站不使用。若某幅影像属第三方版权，其原始记录页会标注权利人，请以该记录为准。每幅影像的原始编号与 NASA 影像库链接都写在灯箱里，可逐条核对。
