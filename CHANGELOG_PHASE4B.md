# mynav 2.0 · Phase 4B 更新日志

> 面向接手者的技术变更说明。可直接作为上下文交给其他 AI 阅读。
> 基准提交：Phase 4A 之后的工作区（`CHANGELOG_PHASE4A.md` 所述全部改动）。
> **本次改动全部未提交，位于工作区。**

---

## 一、概述

项目：个人数字收藏馆 mynav（EX LIBRIS 风格，纯静态前端，零构建步骤，原生 `<script>` 加载）。

Phase 4B 为**收官阶段**，一次补齐 Phase 4 拆分的五个提案，实现 **C2 / D5 / A6 / C5 / D7**：

| 编号 | 名称 | 文件 |
|---|---|---|
| C2 | 观星简报台 · Daily Ephemeris | `js/ephemeris.js`（新建） |
| D5 | 网页琥珀 · 离线快照与防失联保险箱 | `js/amber.js`（新建） |
| A6 | Notion 数据库无头同步桥 | `js/courier.js`（新建，与 C5 同文件） |
| C5 | 飞鸽传书 · 盖章入馆 Bookmarklet | `js/courier.js`（新建） |
| D7 | 馆际互借 · 联邦星图寻星镜 | `js/federation.js`（新建）+ 根目录 `public-collection.json` |

至此 **Phase 0 ~ Phase 4B 全部 22 项提案 100% 达成**。

---

## 二、文件清单

### 新增

| 文件 | 说明 |
|---|---|
| `js/ephemeris.js` | C2 全部逻辑（12 条确定性简报 + JSON/RSS 聚合 + 一键捕获） |
| `js/amber.js` | D5 全部逻辑（拓片生成 / 徽章注入 / 碑拓阅览室） |
| `js/courier.js` | A6 + C5 全部逻辑（URL 接收器 / Bookmarklet / Notion 双向桥） |
| `js/federation.js` | D7 全部逻辑（公开清单 / 邻馆节点 / 拓印入馆） |
| `public-collection.json` | 联邦星图标准公开馆藏清单（36 卷，0 暗月） |
| `scripts/build-public-collection.js` | 上述清单的确定性生成器（`node scripts/build-public-collection.js`） |
| `docs/prompts/STEP4B_PROMPT.md` | 指令存档 |
| `CHANGELOG_PHASE4B.md` | 本文 |
| `artifacts/visual-qa/phase04b/acceptance.js` | Playwright 全量验收（含有头守卫） |
| `artifacts/visual-qa/phase04b/shots.js` | 高清截图脚本（`deviceScaleFactor: 2`） |

附带产物：`acceptance-report.json`、`shots-report.json`、**21 张 DPR2 高清截图**。

### 修改

```
 index.html          |  +289/-6   四个浮层 + 顶栏/移动端入口 + 版本戳
 styles.css          | +1708/-10  Phase 4B 全部样式（4B.1 ~ 4B.6）
 app.js              |   +12/-2   safeInit ×4 + NavApp 暴露 ×4
 js/ledger.js        |   +41/-1   amberVault 字段 + 三个读写接口
 js/commands.js      |   +76/-1   /morning /ephemeris /amber /ingest /notion /telescope /federation
 js/telemetry.js     |   +13/-1   probeAll / resetProbes 后广播 mynav-probe-updated
 js/shortcuts.js     |   +10/-1   isAnyModalOpen 纳入四个新浮层
 TODO.md             |   全勾选
 ARCHITECTURE_2.0.md |   增补 4B 章节
```

### 未触碰

`data.js`（版本戳仍 `1.8.0`）、`404.html`、`icons/`、`functions/`、`notion-sync.js`、`validate.js`，以及 Phase 1–4A 的全部业务模块。

---

## 三、C2 观星简报台 · Daily Ephemeris

### 入口

- 顶栏 `[ 🗞️ 观星晨报 ]`（`#btn-ephemeris-entry`）
- 移动端（`< 900px`）`[ 🗞️ 晨报 ]`（`#btn-ephemeris-mobile`）
- 非输入态快捷键 **`M`**
- 命令 `/morning`、`/ephemeris`

### 古典双栏铅字版式

`.ephemeris-sheet` 为整张报纸：双细线刊头 → 居中刊名「观星台晨报」→ 副题行（日期 · 刊期 · 总则数）→ 分栏切换条 → 正文。

正文 `.ephemeris-body` 是 **CSS Grid 双栏**（`repeat(2, minmax(0, 1fr))`），三栏内容按 `nth-child(2n)` 交替去掉右分割线，末栏独占整行。`<= 900px` 降为单栏。

刊期为**确定性**的：`editionNumber()` 以 `2026-01-01` 为第一卷基准逐日累加，同一台机器同一天永远读到同一期（`VOL. 2026 · 第 NNN 期`）。

### 信源

**内置确定性星历（默认，零网络）** —— `BULLETINS` 共 12 条，覆盖 AI 前沿 / 开源工坊 / 数字古籍 / 极客工具，按三栏归类：

| 栏 | `column` | 条数 |
|---|---|---|
| AI 思考 | `ai` | 4 |
| 工程工坊 | `workshop` | 4 |
| 深度研习 | `study` | 4 |

**外部 JSON / RSS 聚合（可选）** —— `NavEphemeris.setSources([{ url, kind }])`，持久化于 `localStorage["MYNAV_EPHEMERIS_SOURCES"]`。抓取使用 **`AbortController` + 2000ms 超时**；`kind` 为 `json` / `rss` / `auto`（按首字符 `<` 判别）。**任何失败都静默回落内置简报**，绝不抛出、绝不阻塞 UI。状态行会明示「外部信源不可达 · 已回落内置星历」。

### 一键捕获闭环（联动 B 待编目匣）

每条简报底部 `[ ✦ 收入待编目匣 ]`：

1. 调用 `window.NavOverrides.addSite({ status: "uncatalogued", ... })` 存入待编目匣
2. **`whySaved` 自动填入** `《观星台晨报》{kicker}：{summary}` —— 即该条晨报摘要
3. 按钮变为 `[ ✓ 已封存 TMP-XX ]` 并 `disabled`
4. 判重双保险：内存 `state.captured` + 按 URL 比对 `NavUncatalogued.getAll()`，刷新页面后按钮仍是已封存态

---

## 四、D5 网页琥珀 · 离线快照与防失联保险箱

### 琥珀封存库

持久化于 `MYNAV_LEDGER_V2.amberVault`（`siteId → rubbing`），新增三个账本接口：`getAmberVault()` / `setAmberRubbing(id, r)` / `removeAmberRubbing(id)`。

拓片对象结构：

```javascript
{
  siteId, name, url, host, callNumber,
  summary,        // 核心功能摘要
  snapshot,       // 完整 Markdown 拓片正文
  note,           // 馆主批注
  wayback,        // https://web.archive.org/web/*/{url}
  amberNo,        // AMBER-{ID}-{时间戳后 4 位}
  favorite, sealedAt, updatedAt, source
}
```

拓片正文（`buildSnapshotText()`）为五节 Markdown：**核心功能摘要 / 关键路由备忘（主机 · 路径 · 子路由）/ 馆藏索引 / 馆主批注 / 互联网档案馆**。**不依赖网络**：全部由卡片元数据 + 账本批注自动拼装，因此原文网页存亡与拓片可读性完全解耦。

自动封存：`init()` 时对全部 `★ 私人典藏` 补一份拓片（`autoSealFavorites()`，跳过已存在者）。

### 死链触发机制

卡片右下角注入 `.card-amber-badge`。**离线判定以探针节点为权威信源**（`.card-star-probe[data-probe-status="offline"]` / `.is-offline`），并把结果**镜像**回卡片自身的 `data-probe-status="offline"` 与 `.is-offline`，满足两种查询口径。

徽章以「底部封条」形式占满卡片下缘（`left: 0; right: 0; bottom: 0`），离线卡通过 `.card--amber-offline { padding-bottom: 34px }` 预留高度 —— 绝对定位的浮动角标会压住 `.card-bottom-actions` 的 `№` 号与 `↗` 跳转符（实测重叠 16px），因此改为封条方案。

`telemetry.js` 在 `probeAll()` 与 `resetProbes()` 之后派发 `mynav-probe-updated` 自定义事件，琥珀模块据此 `injectBadges() + syncCards()`。

**点击徽章绝不跳转死链**：事件在捕获阶段 `preventDefault + stopPropagation + stopImmediatePropagation`，原地打开 `#amber-modal` 碑拓阅览室。

### 碑拓阅览室

`.amber-stone` 使用**竖纹宣纸 + 琥珀晕染**背景（`repeating-linear-gradient(96deg, ...)`），配 `::before` 内嵌细框。

版式为固定头 / 弹性正文 / 固定脚：正文 `.amber-body` 为 flex 列，批注块与「互联网档案馆 · 时光机 ↗」按钮 **`flex: 0 0 auto` 常驻可见**，仅 `.amber-snapshot` 自行滚动 —— 整块滚动会把 Wayback 按钮推到折线以下（实测 900px 视口不可见）。

### 对外接口

```javascript
NavApp.Amber.sealSite(siteId, customSnapshot)  // customSnapshot: string | { summary, snapshot, note }
NavApp.Amber.openRubbing(siteId)               // 未封存则「调阅即封存」
NavApp.Amber.open() / close() / isOpen()
NavApp.Amber.copyRubbing()
NavApp.Amber.autoSealFavorites() / sealAll()
NavApp.Amber.getRubbing(id) / getVault() / getState()
NavApp.Amber.buildSnapshotText(site, extra) / waybackUrl(url)
```

命令：`/amber`。

---

## 五、A6 & C5 飞鸽传书 · 跨端入馆通道与 Notion 同步桥

### 入口

- 顶栏 `[ 🕊️ 飞鸽 ]`（`#btn-courier-entry`）
- 待编目匣顶部 `[ 🕊️ 飞鸽传书 / 盖章小书签 ]`（`#btn-courier-entry-drawer`）
- 移动端 `[ 🕊️ 飞鸽 ]`（`#btn-courier-mobile`）
- 命令 `/ingest`、`/notion`

### C5 · URL 参数自动接收入馆

页面以 `?ingest=1&url=...&title=...&why=...`（可选 `selection` / `category` / `mode`）打开时：

1. `init()` 后 120ms 解析参数
2. 校验 URL 必须 `http(s)`，否则弹「飞鸽迷航」提示并清理
3. 唤醒 `#courier-modal` 的「盖章入馆确认匣」，渲染来信（题名 / 网址 / 收录动机 / 选中文本引用）
4. **`history.replaceState` 清理地址栏全部 ingest 参数**
5. 用户点 `[ ⌘ 存入待编目匣 ]` 或 `[ ✦ 盖章入正式馆藏 ]` 落库；`[ ✕ 退回飞鸽 ]` 丢弃

判重：按规范化 URL 比对全馆（含待编目），已存在则不重复入库；若目标是「正式馆藏」而现有记录为待编目，则就地转正。

### C5 · Bookmarklet 生成器

```javascript
javascript:(function(){
  var b="<馆址>";var u=encodeURIComponent(location.href);
  var t=encodeURIComponent(document.title||"");
  var s=encodeURIComponent((window.getSelection&&String(window.getSelection()))||"");
  var w=encodeURIComponent((window.getSelection&&String(window.getSelection()))||document.title||"");
  window.open(b+"?ingest=1&url="+u+"&title="+t+"&why="+w+"&selection="+s,"_blank");
})();
```

弹窗内渲染为可拖拽的黄铜印章 `[ ✦ 盖章入馆 · EX LIBRIS ]`（`.courier-bookmarklet`，`cursor: grab`），另有 `[ 📋 复制小书签代码 ]` 一键复制。

> 小书签内部**全部使用双引号**，避免与 `href` 属性的引号冲突。

### A6 · Notion 数据库同步桥

字段严格对齐九列：

```
Title, URL, Category, Description, CallNumber, Status, WhySaved, Tags, Notes
```

- **导出 CSV**：自实现 RFC 4180 转义（含引号 / 逗号 / 换行）
- **导出 JSON**：`{ schema, database, version: "2.0", generatedAt, fields, total, results }`
- **导入**：自实现 RFC 4180 解析器（支持字段内换行与 `""` 转义），自动识别 CSV / JSON；`Category` 由显示名反查 id，`Tags` 支持 `/ , ， 、 |` 分隔；按 URL 判重
- **Cloudflare Worker 端点（可选）**：`localStorage["MYNAV_NOTION_ENDPOINT"]`，`AbortController` 2000ms 超时；未配置或不可达一律**回落本地导出**并明示状态

> **隐私红线**：`exportRows()` 硬过滤 `visibility === "shadow"`，暗月卷宗不进入任何导出通道。

### 对外接口

```javascript
NavApp.Courier.ingestFromParams({ search?, payload?, clean? })
NavApp.Courier.parseIngestParams(search) / cleanIngestParams()
NavApp.Courier.commitIngest("uncatalogued" | "catalogued")
NavApp.Courier.buildBookmarklet(baseUrl?) / bookmarkletHtml() / copyBookmarklet()
NavApp.Courier.exportRows() / exportJson() / toCsv() / parseCsv(text)
NavApp.Courier.importText(text, "csv" | "json") / importRows(rows)
NavApp.Courier.siteToNotionRow(site) / notionRowToSite(row)
NavApp.Courier.getEndpoint() / setEndpoint(url) / pushToWorker()
NavApp.Courier.open() / close() / isOpen() / getState()
NavApp.Courier.NOTION_FIELDS / SYNC_TIMEOUT_MS
```

---

## 六、D7 馆际互借 · 联邦星图寻星镜

### 根目录 `public-collection.json`

```json
{
  "schema": "mynav.public-collection",
  "version": "2.0",
  "library": {
    "name": "EX LIBRIS · 个人数字收藏馆",
    "volume": "VOL. 2026",
    "curator": "馆主 · The Archivist",
    "motto": "EX LIBRIS · 以星图为目录，以拓片为备份"
  },
  "printedAt": "2026-10-20T…",
  "siderealSignature": "LST 08h 40m 36s",
  "signatureHash": "63900200",
  "visibilityPolicy": "public-only",
  "total": 36,
  "shadowExcluded": 0,
  "entries": [
    { "id": "ai-hark", "callNumber": "01", "title": "Hark",
      "url": "https://hark.com", "category": "ai",
      "description": "…", "tags": ["ai", "hark", …], "whySaved": "" }
  ]
}
```

**36 张公开卡，0 张 `shadow`。** 由 `scripts/build-public-collection.js` 从 `data.js` 的 `NAV_DATA` 确定性生成（`vm` 沙箱加载，不执行浏览器环境），并在写入前双重断言：数量必须为 36、不得含任何 shadow 条目。

恒星时签名用 **FNV-1a 32-bit** 散列（与 Phase 4A 遥测同一套算法）派生 `LST hh mm ss`，保证同一份清单永远得到同一枚戳记。

### 浏览器端动态接口

```javascript
NavApp.Federation.buildPublicManifest()  // 与静态文件同结构
NavApp.Federation.auditManifest(manifest) // { valid, total, shadowKnown, leaked[] }
NavApp.Federation.publicSites()          // 过滤后的公开站点
```

`auditManifest()` 三路合并暗月名录（本地账本 + `NavSanctum.getDefaultSites()` + `shadow-` 前缀启发式），因此即便伪造一份含 `shadow-private-notes` 的清单也会被判定 `valid: false` 并列出泄漏 id。

### 寻星镜面板

- 入口：顶栏 `[ 🔭 寻星镜 ]`、移动端 `[ 🔭 寻星镜 ]`、命令 `/telescope`、`/federation`
- 节点轨：**本馆 · EX LIBRIS** + **星系 α · 极客工坊典藏**（6 卷）+ **星系 β · 数字人文与古籍馆**（6 卷），可再接入任意外部 `/public-collection.json`（2000ms 超时，失败保留内置沙盒）
- 本馆节点为只读镜面（「本馆自有馆藏」，无拓印按钮）；邻馆卡片提供 `[ ✦ 拓印入馆 ]`
- 拓印入馆 → `NavOverrides.addSite({ status: "uncatalogued" })`，`whySaved` 自动标记 **`拓印自：星系 β · …`**，`notes` 记录节点代号与友馆索书号，标签追加 `馆际互借`；按钮变为 `[ ✓ 已拓印 ]` 并 `aria-disabled`
- 底部状态条实时显示「本馆公开卷 / 暗月私密 0（硬过滤）/ 清单签名 / 外部节点 / 自检 PASS」

外部清单拉取时同样过滤 `visibility === "shadow"`，防止对端把私密卡混进来。

---

## 七、状态中心变更（`js/ledger.js`）

`MYNAV_LEDGER_V2` 新增一个顶层字段：

```javascript
{
  amberVault: {
    // "ai-muse": { siteId, name, url, host, callNumber, summary,
    //              snapshot, note, wayback, amberNo, favorite,
    //              sealedAt, updatedAt, source }
  }
}
```

`normalizeLedger()` 对之逐条合并，**旧账本（无此字段）自动回落 `{}`，升级不丢用户已封存的碑拓**。

新增导出：`getAmberVault` / `setAmberRubbing` / `removeAmberRubbing`。

---

## 八、命令与 API

### 新增命令（`js/commands.js`）

| 命令 | 编号 | 行为 |
|---|---|---|
| `/morning` | C2 | 展开《观星台晨报》 |
| `/ephemeris` | C2 | 同上（别名） |
| `/amber` | D5 | 调阅网页琥珀拓片 |
| `/ingest` | C5 | 打开飞鸽传书 / 盖章小书签台 |
| `/notion` | A6 | 打开 Notion 典藏同步桥 |
| `/telescope` | D7 | 打开邻近星系寻星镜 |
| `/federation` | D7 | 同上（别名） |

### 键盘

| 键 | 行为 |
|---|---|
| `M` | 开合《观星台晨报》（非输入态、无修饰键、无其他浮层时） |
| `Esc` | 收卷当前 4B 浮层 |

`js/shortcuts.js` 的 `isAnyModalOpen()` 已纳入 `#ephemeris-modal` / `#amber-modal` / `#courier-modal` / `#federation-modal`，浮层开启时全局漫游键正确让位。

**红线未变**：非输入态 `?` 仍只唤出 `#shortcuts-modal`；`M` 与 `?` 互不侵占。

---

## 九、验收结果

```
headedBoot（headless:false 真实浏览器）
  cards=36  sections=5  "全馆典藏 36 卷"
  刊头日期已解析  NavApp/Ephemeris/Amber/Courier/Federation 均挂载
  amberBadges=36  overflow=0
  书架切换 ✅  随机开卷 ✅  M 打开晨报（12 则 / 3 栏）✅

全量回归
  cards=36  uniqueCallNumbers=36  uniqueCardIds=36  errors=[]
  ***REMOVED*** 口令 ✅  非输入态 ? 打开快捷键指南且不触发司天监/晨报 ✅
  待编目匣 420px（含飞鸽入口）✅  活字秘卷 4 张 ✅  暗月/考场 ✅
  恒星时 ✅  白噪音 ✅  黄铜工具尺（Base64/SHA-256）✅
  月相编年史 28 格/28 SVG ✅  穹顶星图 hub=5 planet=36 ✅
  D1 ? 荐书（含待编目穿透）/ ! 就地处决 / saveToCodex / 配置持久化 ✅
  A5/C4 探针三态 · 5px · starProbeBreath · 黄铜扳手 HTTP 200 ✅

C2
  M 打开 → 3 栏 / 12 则 / 12 个捕获按钮 · 双栏网格 · 第 293 期
  分栏 4+4+4=12  ·  [ ✦ 收入待编目匣 ] → 待编目 0→1，whySaved 含晨报摘要
  按钮锁定 [ ✓ 已封存 TMP-01 ] · 重复捕获被拒 · /morning 与 /ephemeris 均可用

D5
  probeAll({mock:true}) → online=23 offline=14
  .is-offline=14  [data-probe-status="offline"]=14  徽章可见=14
  点击徽章 → #amber-modal 打开，快照 389 字符，Wayback 链接正常
  外跳计数 0（绝不跳转死链）· amberVault 持久化 · /amber 可用

A6 & C5
  Bookmarklet 含 ingest=1 / location.href / document.title / getSelection
  CSV 表头 9 列严格对齐 · 行数 38 · JSON total 38 · 往返导入 0 新增（判重）
  ?ingest=1&url=…&title=IngestTest&why=BookmarkletTest
    → 唤醒确认匣，入库 1 卷，地址栏已清理
  重复来信判重 ✅  非法 ftp:// 拒绝 ✅
  CSV 引号字段往返 ✅（Imported, with comma）  分类名→id 映射 ✅
  Worker 未配置 → 回落本地 ✅

D7
  public-collection.json：schema/version 合法 · total=36 · shadow=0
  uniqueIds=36  uniqueCallNumbers=36  signature=LST 08h 40m 36s
  动态清单 total=37（含 D1 转正的 1 卷）· audit.valid=true · 泄漏 0
  伪造泄漏审计 → valid=false, leaked=["shadow-private-notes"] ✅
  寻星镜：本馆 36 / 星系 α 6 / 星系 β 6
  [ ✦ 拓印入馆 ] → 待编目 +1，whySaved 含「拓印自：星系 β」✅
  重复拓印被拒 ✅  拉取本地清单 → 36 卷 · remote 节点出现 ✅

响应式（零横向溢出）
  1440 / 899 / 768 / 390 / 375  →  0,0,0,0,0
  四个浮层在上述 5 断点均 0 溢出、均留在视口内
  移动端入口 待编目/工具尺/晨报/飞鸽/寻星镜 全部可见
  移动端浮层全部 inView，徽章 356×24 且不越出卡片

acceptance.js exit 0 · shots.js exit 0 · 21 张 DPR2 截图
```

---

## 十、执行期修复的 9 个缺陷（按严重度）

1. **【致命】`#amber-body` 缺 id** —— `renderRubbing()` 在 `if (!body) return;` 处静默返回，拓片阅览室永远显示「尚无拓片」、快照长度 0、Wayback 为 `#`。症状是「点得开、什么都没」。补 id 后修复。
2. **【致命】`customSnapshot.summary` 未传入快照** —— `sealSite(id, { summary })` 把 summary 存进 `rubbing.summary`，但 `buildSnapshotText()` 只读 `site.description`，导致自定义摘要不落进正文。改为 `data.summary || site.description || …`。
3. **【高】离线判定被自身镜像污染** —— 早期实现把 `data-probe-status` 写到卡片上又用它判断离线，`resetProbes()` 后卡片仍残留旧属性，14 个徽章关不掉。改为**探针节点为权威**、卡片属性仅为镜像。
4. **【高】`resetProbes()` 不广播** —— 只广播了 `probeAll`，复位后琥珀模块收不到通知。补齐事件派发。
5. **【高】徽章压住动作栏** —— 浮动角标与 `.card-bottom-actions` 的 `№ 02` / `↗` 重叠 16px。改为**底部封条**布局 + `.card--amber-offline` 预留 34px。
6. **【高】899px 顶栏溢出 28px** —— 新增的三个入口把 `.colophon-right` 撑出视口。新增 `<= 1180px` 收为图标、`<= 900px` 顶栏整体让位给 `.mobile-phase4b-actions`。
7. **【中】Wayback 入口在折线以下** —— 碑拓阅览室整块滚动，900px 视口看不到时光机按钮。改为固定头/弹性正文/固定脚，仅 `.amber-snapshot` 内部滚动。
8. **【中】`auditManifest` 无法识别未入账的暗月卡** —— 暗月默认名录存在 `NavSanctum` 而不在 `localStorage`，导致伪造泄漏审计误判 `valid: true`。改为三路合并 + `shadow-` 前缀启发式。
9. **【低】验收脚本自身两处缺陷** —— `assertEphemeris` 在 Node 侧误写 `window.NavUncatalogued`（ReferenceError）；`assertTelemetry` 在 D1 转正后未等 MutationObserver 补注入探针（探针数 < 卡片数）。均已修正。

---

## 十一、已知遗留 / 注意事项

- **`public-collection.json` 是静态快照**，不随浏览器端改动自动刷新。用户新增/转正卡片后需重跑 `node scripts/build-public-collection.js`，或在面板内点 `[ 💾 导出本馆清单 ]` 下载动态版本。
- **外部 RSS / JSON 源在 `file://` 下受 CORS 限制**，会静默回落内置简报。这是浏览器的固有限制，非缺陷；`http://127.0.0.1:8080` 下同源源可正常拉取。
- **Bookmarklet 的 `javascript:` 协议**被部分浏览器（Chrome 书签栏允许，页面内 `href` 点击被拦截）限制。已用 `onclick="event.preventDefault()"` 保证页面内点击不误触，正确用法是拖拽到书签栏。
- **Cloudflare Worker 端点仅做「推送」**，未实现服务端 Notion API 写入。真正的双向同步需部署 Worker（原设计），本阶段提供端点配置 + 2000ms 超时 + 本地回落。
- **`file://` 与 `http://127.0.0.1:8080` 的 localStorage 是两套独立空间**。用户数据按地址隔离。
- **`data.js` 的版本戳保持 `1.8.0`**（本次未修改该文件）。
- 自动化环境（`navigator.webdriver === true`）下首屏自动巡检默认不启动，以保证断言确定性。
- 所有改动**未提交 git**，可 `git checkout .` 回到 Phase 4A 之前（会丢失 Phase 4B 全部工作）。
