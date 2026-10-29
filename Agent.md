# JJYDXFS Lab — 开发与设计交接

更新日期：2026-10-29。本文件按用户指定命名为 `Agent.md`，供其他 agent 显式阅读；不假设所有工具会像 `AGENTS.md` 一样自动加载它。

## 1. 项目定位

- 网站：<https://jjydxfs-lab.github.io/>
- 仓库：<https://github.com/JJYDXFS-Lab/jjydxfs-lab.github.io>
- 定位：JJYDXFS 与 Atom 的个人实验室，展示研究工具、知识整理、Agent 实验和有趣的小作品。
- 用户喜欢墨蓝星空、双星和真实小记，并愿意往「小游戏 / 彩蛋」方向继续做；视觉上偏好克制、有意义的细节，而不是堆砌特效。
- 继续维护现有 GitHub Pages 项目；无需迁移托管平台或改用新框架。

## 2. 当前交付状态（2026-10-29 快照）

最后已推送的提交：`6ecd83b`，添加 Google 网站验证文件。以实际 Git 状态为准，不把推送成功等同于部署完成。

本地已实现、已在真实浏览器验收、**尚未 commit / push** 的升级：

1. **五张项目卡**：加入 Agent Atlas 和 Academic Skills；桌面三加二居中、平板两列（落单的最后一张居中）、手机单列。
2. **视觉升级**：星云色、双星外的星盘刻度环（慢转）、首屏与项目区之间的行星地平线、卡片的项目色画框 / 编号 / 胶囊署名 / 圆形箭头 / 鼠标跟随柔光。
3. **作品星座重画**：五个星座沿各自卡片插画绘制，轮廓互不相同（打开的书、文献网络、带缺口的轨道、横向网格、两页带勾的纸）。
4. **真实星空**：按 `sky-place.js` 的地点（目前是堪培拉）和访客当前时刻计算 1627 颗亮星、真实银河与星座；鼠标靠近时显示真实星座连线和中英文名。
5. **天色随时间**：按该地太阳高度在夜、暮光、白天之间过渡。
6. **首屏天顶坐标**：eyebrow 下方一行 `ZENITH OVER 地点 · RA …h …m · DEC …`，实时更新。地名放在前面读成短语，与页脚 `Sky over …` 呼应；不要写成 current position（那不是访客的位置）。
7. **抓流星小游戏**与**星座图鉴收集**，各自解锁 Atom 的一则小练笔。
8. **修复**：行星地平线的巨大圆形曾把页面撑长约 1300px，已用 `.page { overflow-y: clip }` 解决。

未跟踪的 `.DS_Store` 与 `.claude/`（本地预览配置）不是交付内容，不要提交。

## 3. 技术结构

纯 HTML / CSS / JavaScript，无框架、依赖安装、后端或构建步骤。脚本按以下顺序 `defer` 加载：`sky-place.js` → `sky-data.js` → `script.js` → `notes.js` → `projects.js` → `games.js`。

| 文件 | 职责 |
| --- | --- |
| `index.html` | 页面结构、双语介绍、天顶坐标行、成员入口、项目卡片、图鉴按钮、双星小记容器、故事卡 `<dialog>`、页脚 |
| `styles.css` | 配色、排版、响应式布局、双星、卡片、星座、图鉴、故事卡、天色层 |
| `sky-place.js` | **星空地点配置**：`name`、`lat`、`lon`（南纬 / 西经为负）、IANA `timeZone`。换地点只改这个文件 |
| `sky-data.js` | 由 d3-celestial（BSD 3-Clause，署名保留在文件头）生成的 5 等以内亮星、星座连线与中英文名；数值是生成结果，不要手改，需要更新时从文件头注明的来源重新筛选生成 |
| `script.js` | 真实星空计算与绘制（恒星时、地平坐标、银河、太阳高度）、鼠标附近的真实星座与名称、天色变量、页脚地点时钟、天顶坐标、可捕捉的流星、视差、全局暂停控制 |
| `notes.js` | 双星运行、小记数据与抽取、隐藏彩蛋、关闭和焦点行为 |
| `projects.js` | 五个作品的星座几何、卡片与背景 SVG 联动、星座图鉴收集与本地进度 |
| `games.js` | 两则小练笔的文本、故事卡开关、流星计数、暂停时的「Catch a falling star」替代按钮 |
| `img/` | `JJYDXFS.png`、`Atom.png`、`JJYDXFS_lab.png`；保留原始图片 |
| `favicon.ico` | 原 logo 转换的 16 / 32 / 48 / 256px 图标；用户决定暂时保留方形 |
| `google1b189baf8fa0103f.html` | Google 网站验证；保留根目录路径、文件名及内容 |
| `README.md` | 公开项目介绍、入口、换地点方法与数据来源 |

脚本之间只通过 DOM 事件通信：`lab:meteor-caught`（`script.js` 发出）、`lab:atlas-complete` 与 `lab:atlas-open`（`projects.js` 发出），由 `games.js` 打开故事卡；全局暂停状态统一读 `#motion-toggle` 的 `aria-pressed`。

CSS 是分阶段追加的，末尾有多段带注释的覆盖块，同一选择器可能被后面覆盖；改动前检查完整文件与媒体查询，不要只改前面一处就认为生效。

## 4. 已确认的设计约定

- **作品等权**：不划分主推／次级项目。尺寸、字号和视觉分量保持平等；卡片编号 01–05 只是顺序。
- **合作署名是内容的一部分**：每张卡片展示 `By A × B`，不要改成 Powered by，不根据 commit 作者猜署名。
- **公开名称为 JJYDXFS**：小记和公开文案不用私人昵称或真名。Atom 保持原署名。
- 主标题使用较轻的现代无衬线体，暖白渐变 `JJYDXFS` + 浅金渐变 `Lab`，不使用斜体。大号衬线标题已被用户否定。
- 项目标题与故事标题用衬线字体；正文用无衬线字体；小标签、坐标、页脚地点用等宽字体。
- 主要色彩：墨蓝 `#070a12`、暖白 `#ede9e0`、灰蓝 `#9aa7b8`、浅金 `#cbb78a`。
- 每个项目有一个低饱和的星光色 `--hue`（用户确认保留）：library `#d4bc8a`、literature `#8fc0cc`、personal-agent `#c2abdc`、atlas `#92b5e8`、skills `#a9cba1`。只用于该卡片的强调元素、对应背景星座和图鉴小图标；新增项目时同时补一个色值。
- 首屏英文说明在上、较轻的中文在下。
- JJYDXFS 与 Atom 的圆形头像并排、等权，分别链接个人主页。用户认为两头像之间不需要额外的连线装饰。
- 页面始终是深色夜空，白天只轻微提亮。
- **已被否定、不要再加**：标语 "curious things" 下的金色弧线（像 Amazon 标志）；打字机 / 轮播标语；WebGL 极光等高耗电特效；编造的「最近在做」文案。
- 星空效果需可察觉，但不能妨碍阅读、键盘操作、点击入口或手机性能。

## 5. 五个项目：内容、署名、入口

| 项目 | 类别 | 署名 | 入口 |
| --- | --- | --- | --- |
| Library of the Citadel | Library | Atom × Claude | <https://jjydxfs-lab.github.io/library-of-the-citadel/> |
| Human–Agent Collaboration in Data Science | Literature Collection | JJYDXFS × Codex | <https://jjydxfs-lab.github.io/awesome-human-agent-collaboration-in-data-science/> |
| Living with a Personal Agent | Reading group | Atom × JJYDXFS | <https://jjydxfs.github.io/atom-reading-group-2026/> |
| Agent Atlas | Knowledge Atlas | Atom × Codex | <https://jjydxfs-lab.github.io/agent-atlas/> |
| Academic Skills | Research Tools | Atom × JJYDXFS | <https://github.com/JJYDXFS-Lab/academic-skills> |

当前英文简介：

- Library：A growing library of recipes, practical notes, and original stories.
- Literature Collection：A curated collection of papers on human–agent collaboration in data science.
- Reading group：A case study of long-running personal agents: workflows, boundaries, and lessons from failure.
- Agent Atlas：A source-linked atlas of intelligent-agent concepts and their connections.
- Academic Skills：Agent skills for reviewing academic prose and auditing LaTeX bibliographies.

Literature Collection 是论文整理页面，不再称为 Literature Review Pipeline；旧 Cloudflare 地址已迁移。Academic Skills 入口是仓库，不要凭空假设有独立部署网页。

## 6. 互动逻辑与必须保留的行为

### 真实星空

- 地点来自 `sky-place.js`；缺失时 `script.js` 回退到 Greenwich，不报错。南半球朝北看、北半球朝南看，由纬度自动决定。
- 视野：地平线在视口底部附近，纵向约 76°，横向随视口宽度变化；恒星随真实恒星时缓慢转动。
- 星点亮度和大小按星等，颜色按 B−V 色指数；左侧阅读区的星、星座线和名称都会减弱。
- 银河沿真实银道面绘制在离屏画布上，每 20 秒重绘一次；支持 `ctx.filter` 时加模糊。
- 鼠标靠近时，附近真实星座的连线变金并显示 `ENGLISH · 中文` 名称，离开后渐隐；平时星座线极淡。
- 天色：按太阳高度设置 `--sky-twilight`、`--sky-day`、`--sky-sun-x` 与 `data-sky-phase`，暮光时在太阳方位的地平线泛暖光。白天暗星只略淡，刻意保留星空。
- 页脚显示 `Sky over 地点 · 当地时间`；首屏显示天顶坐标（赤经即当地恒星时，赤纬即纬度）。静止状态下每分钟仍刷新一次时钟、坐标与天色。

### 双星

- 双星约 90 秒一圈，绕共同中心运行；两颗星地位平等。外圈星盘刻度环约 240 秒一圈。
- **修复过的 bug**：原来鼠标进入整个双星区域就暂停，桌面看起来不动。现在只在鼠标悬停可点击星体、键盘可见焦点、阅读小记等情况下暂停。不要恢复整块区域 hover 暂停。
- 关闭小记后，不应因鼠标操作留下的普通焦点而一直暂停；保留键盘焦点的暂停与返回行为。
- 遵守 `prefers-reduced-motion`，页面隐藏时停止循环；使用已有全局暂停按钮，不另起不受控的动画循环。

### 小记

- `notes.js` 收录用户提供的原文：六条日常小记、research 特别星、勋章隐藏卫星。
- 日常小记按洗牌抽取，一轮不重复，跨轮避免紧邻重复。
- 有日期就显示日期，没有日期的不补日期；署名保持用户确认的版本。
- 打开后停留，不自动消失；关闭按钮、点击空白、Esc 都能收起。
- 不生成冒充真实回忆的内容，不从私人聊天或内部记录自行提取公开素材。

### 抓流星与星座图鉴

- 首次流星约 5–9 秒后出现；之后每次结束随机等待 14–26 秒，每颗持续约 1.9–2.7 秒。鼠标靠近时光标变手型；点中头部或尾巴前段即捕捉，散成一圈火花并弹出故事卡，顶行带「No. N」计数（存在访客浏览器）。
- 每个作品点亮约 0.9 秒（鼠标悬停或键盘焦点）或被点击打开即算收集；进度只存在访客浏览器的 `localStorage`。项目标题旁的图鉴按钮显示五个小星座与 `n/5`，未集齐时点击显示提示；集齐后自动弹出解锁卡，按钮变为 `5/5 · open ✧`。
- 动态关闭（系统减少动态或手动暂停）时，页脚出现「Catch a falling star」按钮，保证流星故事仍可获取。
- 两张卡片顶行都先说明出现原因，但不写「彩蛋」二字（用户确认）：
  - 流星：`A falling star, caught · 2026.10.25 · Atom · 一则虚构小品` →《原子的无用观察：纸箱暂时没有用途》
  - 图鉴：`Five constellations, one atlas · 2026.10.28 · Atom` →《猫把地址删掉了》
- 两篇都是 Atom 的小练笔，原文照录、不要改写；底部按用户要求注明「—— JJYDXFS 从 Atom 的小练笔里偷来的」。

### 作品星座

- HTML 的 `data-project` 与 `projects.js` 的 `maps` 对应：`library`、`literature`、`personal-agent`、`atlas`、`skills`；每个 map 有 `main`（较大的主星序号）。
- 卡片、背景与图鉴小图标复用同一套节点和边；通过 `is-illuminated` / `is-lit` 控制显示。背景星座会继承对应卡片的 `--hue`。
- 键盘可见焦点优先于鼠标悬停；触摸不拦截原生链接导航。
- 页面失焦或隐藏时清理点亮状态；全局暂停通过 `project-motion-paused` 禁用描线过渡与星盘旋转，系统减少动态偏好也禁用。
- 新增或改名项目时同步检查 HTML、`maps`、`--hue`、署名、项目数量标签与 README。

## 7. 已做的验证

2026-10-29 在内置浏览器中验收（桌面 1280–1440、平板 768、手机 375）：

- 五卡布局、平板落单卡居中、手机单列；三种宽度均无横向滚动，页面在页脚处结束。
- 悬停 / 键盘焦点点亮卡片与背景星座；五个星座轮廓可区分。
- 真实星空：堪培拉时间与 Sydney 时区一致，天顶赤经与手算恒星时一致；鼠标附近显示真实星座名；白天星空仍可见。
- 抓流星：用与悬停相同的命中检测定位后点击，故事卡打开、计数写入。
- 图鉴：依次点亮五卡，进度 1/5→5/5，自动弹出解锁卡；未集齐时提示浮层不被卡片遮挡。
- 暂停星空后页脚出现替代按钮；控制台无报错；所有脚本通过 `node --check`。

未覆盖：真实触屏设备、Safari（银河模糊依赖 `ctx.filter`，Safari 不支持时会退化为较硬的边缘）、系统级减少动态设置的实机测试。

## 8. 预览、检查与提交流程

在仓库根目录运行：

```sh
python3 -m http.server 8765 --bind 127.0.0.1
```

打开 <http://127.0.0.1:8765/>。已有同项目服务器时复用，不盲目重复启动。`http.server` 会让浏览器缓存旧脚本，改动后需强制刷新。

基础检查：

```sh
node --check sky-place.js
node --check sky-data.js
node --check script.js
node --check notes.js
node --check projects.js
node --check games.js
git diff --check
git status --short
```

- 无需 `npm install` 或构建；不要为简单修改引入框架。
- 用户惯常先看本地版本，再明确要求 commit + push；不要因为用户说「好」就推送。
- 获得发布指令后，检查 diff，只暂存相关文件，提交并 `git push origin main`。
- 不提交 `.DS_Store`、`.claude/`、临时测试、个人环境路径或凭据。
- 推送结果、GitHub Pages 部署结果、线上检查分别报告，不混为一谈。

## 9. 后续候选（未批准）

- 背景里的作品星座固定在视口右上，第一排卡片悬停时大部分被卡片遮住；可以让它移到悬停卡片旁的空白夜空。已向用户提过，尚未决定。
- 更早讨论过 `Cards / Constellation` 双视图、全屏可拖动缩放的星图；未实施，且现在的真实星空与图鉴已覆盖部分目的，做之前先和用户确认。
