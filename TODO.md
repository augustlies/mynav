# mynav 2.0 · EX LIBRIS 终极进化工程代办清单 (Master Roadmap)

> 🎉 mynav 2.0 · EX LIBRIS 全量 22 项提案与 Phase 0~5 性能架构升级已 100% 竣工

> 架构准则：先重构「古籍对开卷」骨架与统一数据 Schema，再按「纯前端效率 → 策展与沙盒 → 视图升维 → 云端与 AI 算力」分五期推进。
> 规则：每完成一项，把 `[ ]` 改成 `[x]`。数据结构与命名以 `ARCHITECTURE_2.0.md` 为准；每个功能的完整设计细节见 `docs/FEATURE_IDEAS.md`（编号 A1–A8、B、C1–C6、D1–D7 一一对应）。

## 已拍板的设计决定
- **B2 待编目匣位置**：左栏书脊底部独立暗格 `[ ⌘ 待编目匣 ]`（快捷键 `U`）+ 点击后从右侧滑出羊皮纸抽屉（宽 420px，移动端 `100vw`）的混合方案。不污染主分类流，也不离开当前页面。

## 🏛️ Phase 0：古籍对开骨架与统一数据底座（地基期 · 当前首要任务）
- [x] **0.1 骨架重构**：落地「古籍对开卷 · 经纬档案台」双栏布局（左栏 Sticky 藏书票 + 纵向书脊，右栏吸顶索书条 + 12 列三级密度卡片）。
- [x] **0.2 Schema 2.0 升级**：无损扩展现有书签数据结构与 localStorage 状态中心（`MYNAV_LEDGER_V2`），预留批注、子链接、借阅计数、待编目状态、琥珀快照字段，旧数据 100% 自动兼容。

## ⚡ Phase 1：键盘流、活体热度与索书指令中枢（纯前端高爽感期）
- [x] **A1 星盘检字法（索书框多模路由）**：默认拼音 / 标签模糊高亮过滤；`/` 命令面板（`/theme`、`/random`、`/export`、`/clear-dust`）；保留原有隐藏数字口令并支持多组密令路由。
- [x] **A2 索书号盲打直达（Chord Shortcuts）**：非输入态下 450ms 内连按两位数字（`01`–`36`），浮现黄铜印章提示并新标签页打开对应卡片。
- [x] **A4 阅览室借阅热度与古籍蒙尘**：静默记录点击频次与最后调阅时间戳；近 7 天 Top 6 自动晋升「🔥 常驻案头」；超 60 天未访问的卡片降低透明度并显示角标尘封印记。
- [x] **A8 今日开卷（随机寻星，`R` 键）**：星盘旋转动效，从深层非置顶馆藏随机抽一张居中放大展示。

## 🗂️ Phase 2：策展深度、待编目匣与随身弹药库（内容与结界期）
- [x] **A3 藏书票翻转批注（Marginalia）**：点击卡片右下角 `藏书票 № XX` 翻转 / 展开背面，展示私人备忘与最多 4 个快捷子路由锚点（如 API Keys / Docs）。
- [x] **B1–B4 待编目匣（暗星带缓存区）**：左栏底部入口 `[ ⌘ 待编目匣 ]`（`U`）+ 右侧滑出抽屉；1px 虚线窄签 + 临时编号 `TMP-XX` + `[ 留卷待查 ]` 线框章 + 斜体「收录动机（Why Saved）」；全局搜索底部穿透匹配；`[ ✦ 授予藏书票 ]` 一键转正；90 天未点开显示沙漏提醒。`/uncatalogued` 命令在本期加入。
- [x] **C1 活字秘卷匣（Codex Snippets）**：管理常用 System Prompt、脚本与配置模板；点击自动复制并弹出 `[ 携卷前往：DeepSeek | ChatGPT | Gemini ]` 跳转菜单。
- [x] **C3 星群连珠与群星会诊**：预设工作流（一键并发打开一组网站）；搜索框 `[ ✦ 群星会诊 ]` 多引擎并发检索。
- [x] **D2 双生结界（暗月模式 & 考场封条）**：暗语触发星盘逆转 180° 切换私密卷宗（`visibility: "shadow"`）；「考场结界（Focus Lock）」给娱乐社交分类贴不可点击封条。`/focus` 命令在本期加入。

## 🧭 Phase 3A：天文声光与极客仪器室（纯前端硬核拓展期 · 已完成）
- [x] **A7 真·天文日晷与实时恒星时**：书脊底部实时显示本地恒星时（LST）与月相铭文；浅色模式按系统时间映射 `--sundial-angle` / `--sundial-length` 并驱动日影与卡片投影；深色模式星轨 Canvas 增加稀有流星，提供 `NavApp.Astronomy.setMockTime()` / `resetMockTime()` / `triggerMeteor()` 测试钩子。
- [x] **D6 白噪音天文台（Web Audio 合成器）**：眉批 `[ 𝄞 寂静 / 听风 ]` 开关与 `/sound` 命令；仅用户手势后懒创建 `AudioContext`，纯代码合成布朗噪声、粉红噪声、星际脉冲、赤道仪 Tick 与钟摆泛音；主题切换 0.5s 增益过渡，历史开启状态显示 `听风 · 待唤醒` 并在首次交互恢复。
- [x] **D3 炼金实验台 · 黄铜工具尺**：书脊与移动端入口、`T` 快捷键与 `/tools` 命令；星象罗盘探针采用 2000ms `AbortController` 并静默回退 `LOCAL SANDBOX`；UTF-8 Base64、URL、JSON 行列提示、JWT Payload、时间戳双向换算与原生 Web Crypto SHA-256 全部前端本地完成。
- [x] **移动端入口补齐**：`< 900px` 搜索框旁提供可见、可点击的 `[ ⌘ 待编目 ]` 与 `[ 📐 工具尺 ]`，390px / 375px 抽屉宽度与页面零横向溢出通过验收。

## 🌘 Phase 3B：月相编年史与穹顶引力星图（已完成）
- [x] **D4 星轨编年史（月相热力图与时间轴）**：`js/almanac.js` 提供 28 天月相星历格（0 次暗星点 / 1–2 次蛾眉月 / 3–5 次上弦月 / 6+ 次满月辉光，均为内联 SVG）、古籍批注式日摘要与卡片高亮；`js/ledger.js` 的 `openSite()` 同步写入 `MYNAV_LEDGER_V2.almanac[YYYY-MM-DD]`（`count` / `clicks` / `sites`）；四档时光回溯拨片（`All` / `7D` / `30D` / `>60D`）联动主画布与星图的 `.is-time-dimmed` 过滤，并暴露 `NavApp.Almanac.seedMockHistory()` 测试钩子。
- [x] **C6 穹顶引力星图（Knowledge Graph）**：眉批切换 `[ 书本目录 / 穹顶星图 ]`（`G` 键与 `/graph` 命令）；`js/star-map.js` 以 DPR 适配 Canvas 绘制五边形星轨分布的 5 个分类恒星与 36（暗月模式 38）张行星卡片，节点半径按访问热度映射 5–11px；实线主星从属轨 + 跨分类 `#tag` / 预设星群共振虚线；阻尼 0.85 弹簧拖拽、Hover 聚焦与藏书票预览卡、单击锁定 / 双击调阅；`requestAnimationFrame` 循环仅在星图激活时运行，切回目录或页面隐藏立即停止。
- [x] **Phase 3B 验收**：`artifacts/visual-qa/phase03b/acceptance.js` 与 `shots.js` 全绿，产出 `acceptance-report.json`、`shots-report.json` 与深色 / 浅色 / 移动端星图、月相编年史 DPR2 高清截图集；至此 Phase 0 ~ Phase 3 全部完成。

## 🛰️ Phase 4：无头云端底座、守馆人 AI 与联邦星图（Cloudflare Worker 赋能期）
> Phase 4 拆分为 **4A（守馆人 AI 司天监终端 + 星轨联通探针 + 遥测机关台，纯前端）** 与 **4B（观星晨报 + 网页琥珀 + 盖章入馆 Bookmarklet + Notion 桥 + 联邦星图）**，两期均已完成。

### Phase 4A：守馆人 AI、星轨探针与遥测机关台（已完成）
- [x] **D1 守馆人 AI（司天监终端）**：`js/librarian.js`。仅在索书框 `#archive-search-input` 聚焦且以 `?` / `!` 开头时触发（非输入态 `?` 仍唤出快捷键指南）；`?` 前缀为懂全馆藏书的 RAG 顾问（正式馆藏 + 待编目匣），羊皮纸浮层 `.librarian-parchment-folio` 打字机流式批注 + 1~3 张可调阅 / 一键转正的微缩藏书票推荐条；`!` 前缀就地执行轻任务，原地输出代码块并提供 `[ 📋 复制结果 (Enter) ]` / `[ 📜 存入活字秘卷匣 ]` / `[ ✕ 收卷 (Esc) ]`；命令 `/ask`、`/exec`、`/ai-config`。**双擎驱动**：已配置 Key 时走 OpenAI 兼容 `/chat/completions`（12s 超时），未配置 / 离线 / 测试环境自动降级为本地多维加权检索引擎（title / desc / tags / whySaved / notes）与 14 套预设极客指令沙盒，绝不阻塞。「司天监密钥」持久化于 `MYNAV_LEDGER_V2.aiConfig`（Base URL / Key / Model），仅存本机。
- [x] **A5 星轨联通探针**：`js/telemetry.js`。每张正式馆藏卡片域名旁注入 5px `.card-star-probe`；未巡检 = 黄铜微点 `opacity: 0.35`，在线 = `#F4E7C5` 恒星暖白呼吸灯（Hover `星轨畅通 · Δt XXms`），离线 = `#A64030` 暗红残星（Hover `星轨受阻 / 离线`）；`AbortController` 2000ms 超时 + 4 路并发控制，提供 `/ping`、`[ 📡 巡检星轨 ]` 与首屏静默轻量探测，暴露 `NavApp.Telemetry.probeAll({ mock: true })` 确定性测试钩子（FNV-1a 散列决定在线与否与延迟）。
- [x] **C4 星轨遥测与机关台**：`js/telemetry.js`。右栏星群连珠下方 `.telemetry-deck` 三枚古典仪器表盘 —— 算力余量表（余量 / 预警线）、星槎负载仪（节点状态 + 主域名续期倒计时）、「黄铜扳手」Webhook 拨片（`.is-pulling` / `.is-pulled` 机械拨动，回执 `[ ⚙️ 机关已触发 · HTTP 200 (Δt XXms) ]`，未配真实 URL 走沙盒演练）；配置持久化于 `MYNAV_LEDGER_V2.telemetryConfig`。
- [x] **Phase 4A 验收**：`artifacts/visual-qa/phase04a/acceptance.js` 与 `shots.js` 全绿（`errors: []`），产出 `acceptance-report.json`、`shots-report.json` 与 12 张深色 / 浅色 / 移动端 DPR2 高清截图；`uniqueCallNumbers === 36`、`***REMOVED***` 口令、非输入态 `?` 仍唤出快捷键指南、5 断点（1440 / 899 / 768 / 390 / 375）零横向溢出全部通过。

### Phase 4B：观星晨报、网页琥珀与联邦星图（已完成 · 收官）
- [x] **C2 观星简报台 · Daily Ephemeris**：`js/ephemeris.js`。顶栏 `[ 🗞️ 观星晨报 ]`、移动端 `[ 🗞️ 晨报 ]`、非输入态快捷键 `M`、命令 `/morning` 与 `/ephemeris`；古典双栏铅字报纸版式（`#ephemeris-modal`，CSS Grid 双栏 + 交替分割线 + 末栏跨行），刊期为确定性「第 NNN 期」（以 2026-01-01 为第一卷基准逐日累加）。内置 12 条确定性《司天监晨间星历简报》（AI 前沿 / 开源工坊 / 数字古籍 / 极客工具，按「AI 思考 4 / 工程工坊 4 / 深度研习 4」三栏阅读），并支持配置外部 JSON / RSS 聚合源（`AbortController` 2000ms 超时，失败静默回落内置）。每条简报的 `[ ✦ 收入待编目匣 ]` 直接调用 `NavOverrides.addSite({ status: "uncatalogued" })`，自动把该条晨报摘要填入 `whySaved`，按钮锁定为 `[ ✓ 已封存 TMP-XX ]` 并按内存 + URL 双路判重。
- [x] **D5 网页琥珀 · 离线快照与防失联保险箱**：`js/amber.js`。拓片封存库持久化于 `MYNAV_LEDGER_V2.amberVault`（`getAmberVault` / `setAmberRubbing` / `removeAmberRubbing`），拓片正文为五节 Markdown（核心功能摘要 / 关键路由备忘 / 馆藏索引 / 馆主批注 / 互联网档案馆），完全由卡片元数据与账本批注本地拼装，并自动拼装 `https://web.archive.org/web/*/{url}` 时光机锚点；`★ 私人典藏` 在初始化时自动补封。死链触发联动 Phase 4A `telemetry.js`：`probeAll` / `resetProbes` 后广播 `mynav-probe-updated`，离线卡片（探针 `data-probe-status="offline"`，镜像回卡片 `.is-offline` 与 `data-probe-status`）下缘浮现琥珀封条 `[ 📜 调阅拓片 ]`；点击在捕获阶段拦截，**绝不跳转死链外网**，原地打开碑拓风格 `#amber-modal`（竖纹宣纸 + 琥珀晕染，固定头 / 弹性正文 / 固定脚，Wayback 入口常驻可见）。暴露 `NavApp.Amber.sealSite(siteId, customSnapshot)` / `openRubbing(siteId)` 与命令 `/amber`。
- [x] **A6 & C5 飞鸽传书 · 跨端入馆通道与 Notion 典藏同步桥**：`js/courier.js`。入口为顶栏 `[ 🕊️ 飞鸽 ]`、待编目匣顶部 `[ 🕊️ 飞鸽传书 / 盖章小书签 ]`、移动端入口与命令 `/ingest`、`/notion`。**C5 URL 接收器**：页面以 `?ingest=1&url=...&title=...&why=...`（可选 `selection` / `category` / `mode`）打开时自动拦截，唤醒「盖章入馆确认匣」，一键存入待编目匣或正式馆藏，随后 `history.replaceState` 清理地址栏；按规范化 URL 判重，非法协议拒绝。**C5 Bookmarklet**：可拖拽黄铜印章 `[ ✦ 盖章入馆 · EX LIBRIS ]`，脚本自动提取 `location.href` / `document.title` / `window.getSelection()` 并回传 `?ingest=1`，附一键复制。**A6 Notion 桥**：字段严格对齐 `Title, URL, Category, Description, CallNumber, Status, WhySaved, Tags, Notes` 九列，自实现 RFC 4180 CSV 转义与解析（支持字段内换行与 `""` 转义），CSV / JSON 双向导入导出、分类显示名反查 id、标签多分隔符、URL 判重；可选 Cloudflare Worker 端点（`AbortController` 2000ms，未配置或不可达一律回落本地导出）。导出通道硬过滤 `visibility === "shadow"`。
- [x] **D7 馆际互借 · 联邦星图寻星镜**：`js/federation.js` + 根目录 `public-collection.json`。根目录生成标准公开馆藏清单（`schema: "mynav.public-collection"`、`version: "2.0"`、馆名 / 卷号 / 馆正 / 馆训、FNV-1a 派生的恒星时签名 `LST hh mm ss` 与 8 位 `signatureHash`、`visibilityPolicy: "public-only"`、**36 张公开卡 / 0 张 `shadow`**），由 `scripts/build-public-collection.js` 从 `data.js` 确定性生成并在写入前双重断言；同时提供 `NavApp.Federation.buildPublicManifest()` 与 `auditManifest()`（三路合并暗月名录，可识别伪造泄漏）。「邻近星系 · 寻星镜」面板经顶栏 / 移动端 / `/telescope` / `/federation` 唤起，节点轨含**本馆 · EX LIBRIS**（只读镜面）+ **星系 α · 极客工坊典藏**（6 卷）+ **星系 β · 数字人文与古籍馆**（6 卷），并支持拉取任意外部 `/public-collection.json`（2000ms 超时，失败保留内置沙盒，对端 shadow 条目同样过滤）；邻馆卡片 `[ ✦ 拓印入馆 ]` 一键抄入待编目匣，自动标记 `拓印自：星系 β · …` 来源与节点代号，按钮变为 `[ ✓ 已拓印 ]`。底部状态条实时显示本馆公开卷数 / 暗月私密 0（硬过滤）/ 清单签名 / 外部节点 / 自检 PASS。
- [x] **Phase 4B 验收**：`artifacts/visual-qa/phase04b/acceptance.js` 与 `shots.js` 全绿（`errors: []`、`exit 0`），产出 `acceptance-report.json`、`shots-report.json` 与 21 张 DPR2 高清截图；`assertHeadedBoot()` 有头守卫（36 张卡片 / 0 报错 / 0 溢出 / `M` 打开晨报）、Phase 1 ~ 4A 全量回归、5 断点（1440 / 899 / 768 / 390 / 375）零横向溢出（四个新浮层在各断点均 0 溢出且留在视口内）全部通过。

## 🏁 收官宣告
> **Phase 0 ~ Phase 4B 全部 22 项提案 100% 达成。**
>
> 0.1 骨架重构 · 0.2 Schema 2.0 · A1 星盘检字法 · A2 索书号盲打 · A4 借阅热度与蒙尘 · A8 今日开卷 · A3 藏书票批注 · B1–B4 待编目匣 · C1 活字秘卷匣 · C3 星群连珠 · D2 双生结界 · A7 天文日晷与恒星时 · D6 白噪音天文台 · D3 黄铜工具尺 · D4 星轨编年史 · C6 穹顶引力星图 · D1 守馆人 AI · A5 星轨联通探针 · C4 星轨遥测机关台 · C2 观星简报台 · D5 网页琥珀 · A6 & C5 飞鸽传书与 Notion 桥 · D7 联邦星图寻星镜。

## 🖼️ 图标体系加固（已完成 · 2026-10-21）
- [x] **本地图标清零**：修复 16 个缺失 / 损坏文件（其中 `ai-deepseek-platform.png`、`learn-ecut.png`、`learn-ecut-ehall.png` 原为 HTML 冒充 PNG）；全部重制为 128x128 透明 PNG，官方来源包括站点自有 SVG、GitHub README 品牌徽标、原站 favicon 与校徽原图。`node validate.js` = 36 / 36、0 warnings。
- [x] **`validate.js` 加 Magic Bytes 校验**：不仅检查文件存在，还校验 PNG 文件头与最小体积，HTML 404 页无法再冒充图标。
- [x] **`js/schema.js` 统一解析层**：`resolveIcon` / `iconAttributes` / `handleIconError` / `bindIconFallbacks` / `waitForIcon` / `isPrivateOrIpHost` / `buildMonogramDataUri` / `hostnameOf`；公网走 `DuckDuckGo → Icon.Horse → Google S2 → 内联 SVG`，内网 / localhost / 任意 IPv4（含 `***REMOVED***`）/ IPv6 直接内联徽标、零外发。
- [x] **全模块收口**：`app.js`、`uncatalogued`、`librarian`、`federation`、`serendipity`、`star-map` 全部改用统一图标属性；「今日开卷」浮层新增图标容器；模块缓存版本统一 `4.2.0`。
- [x] **Bookmarklet 源头捕获**：`js/courier.js` 自动提取 `apple-touch-icon` / `icon` 绝对地址并以 `&icon=` 回传，`courier.js` / `overrides.js` 持久化为 `favicon`；Notion 导出新增 `Icon` 列（十列）。
- [x] **三级尺寸与三套主题护盾**：40 / 34 / 24px 底座，浅色日晷 / 深色观星台 / 暗月密室三套边框与背光；顺带修复暗月倾斜导致的 1440 断点 8px 横向溢出。
- [x] **验收**：`artifacts/visual-qa/icons-2026-10-21/acceptance.js` 全绿 —— 36/36 图标解码、三档尺寸、9 断点（1440/1280/1024/900/899/768/640/390/375）零溢出、冷启动 0 三方请求 / 0 控制台错误 / 0 失败请求、DOM 级降级链终止于内联 SVG；`phase01 / phase02 / phase03a / phase03b / phase05-perf` 回归全绿。
