# mynav 2.0 架构与状态规范 (Architecture & Spec)

> 每次开发前必读。目的：分步迭代时不出现命名冲突、样式污染或状态写乱。功能细节见 `docs/FEATURE_IDEAS.md`，进度见 `TODO.md`。

## 1. 核心设计哲学

- **视觉语言 EX LIBRIS**：
  - 深色（观星台）：底色 `#0A0E17` + 黄铜金 `#C8A97E`
  - 浅色（日晷）：棉纸 `#F3EFE6` + 青铜褐 `#8C5A32` + 藏书票朱砂红 `#A64030`
- **禁止**：天气插件、番茄钟、花哨现代仪表盘等破坏古籍仪器感的元素。
- **严禁破坏原有核心能力**：搜索框既有的隐藏数字口令、引擎切换、分类过滤、深浅色切换、Canvas 星轨 / 日晷绘制、收藏增删改查与本地存储逻辑必须 100% 保持兼容。

## 2. 统一数据模型 (Bookmark Item Schema v2)

在不破坏原有字段的基础上，每个站点对象可选支持以下扩展字段；缺省时前端自动降级处理。读取旧数据时统一经过 `normalizeItemSchema(item, index)` 适配器补齐。

```javascript
{
  // --- 原有基础字段保持不变 ---
  id: "deepseek",
  title: "DeepSeek",
  url: "https://deepseek.com",
  category: "ai",
  desc: "深度求索开源与高性价比大模型平台...",
  tags: ["ai"],
  favorite: false,

  // --- 2.0 新增可选扩展字段 ---
  status: "catalogued",   // "catalogued"(正式馆藏) | "uncatalogued"(B 待编目匣)
  whySaved: "",           // B3 待编目匣专属：收录动机斜体备忘
  notes: "",              // A3 藏书票背面：馆主私人批注
  subLinks: [             // A3 藏书票背面：快捷子路由锚点（最多 4 个）
    // { label: "API Keys", url: "https://platform.deepseek.com/api_keys" }
  ],
  visibility: "public",   // D2 "public"(表世界) | "shadow"(暗月密室专属)
  snapshotUrl: "",        // D5 网页琥珀离线拓片备份地址（拓片正文见 ledger.amberVault）
  telemetry: null         // C4 遥测配置（需要 ping 或展示状态的卡片）
}
```

## 3. 本地状态存储中心（localStorage key：`MYNAV_LEDGER_V2`）

所有动态演化的客户端数据统一收口到这一个 JSON 对象读写，严禁散落多个零碎 key。

```javascript
{
  accessLog: {            // A4 借阅热度统计
    // [itemId]: { count: 12, lastVisited: 1760832000000, firstSeenAt: 1760230000000, history: [{ date: "2026-10-18", count: 3 }] }
  },
  marginalia: {           // A3 馆主批注（按 itemId 保存正文）
    // "ai-deepseek": "API Key 放在密码管理器..."
  },
  snippets: [             // C1 活字秘卷匣（Prompt / 脚本模板）
    // { id, title, content, targetAIs: ["deepseek", "chatgpt", "gemini"] }
  ],
  constellations: [       // C3 星群连珠工作流预设
    // { id, name: "科研星群", itemIds: ["deepseek", "gemini"] }
  ],
  almanac: {              // D4 星轨编年史每日活跃计数
    // "2026-10-18": { count: 15, clicks: 15, aiCalls: 4, sites: ["ai-hark", "dev-github"] }
  },
  modeState: {            // D2 & D6 结界与环境声状态
    shadowMoon: false,    // 暗月密室是否激活
    focusLock: false,     // 考场封条是否激活
    ambientSound: false   // 白噪音音叉是否开启
  },
  firstSeenAt: {          // 从未访问卡片的稳定首次入馆锚点
    // "ai-claude": 1760230000000
  },
  dustResetAt: 0          // /clear-dust 的全局重置时间
}
```

`firstSeenAt` 只初始化一次，和 `recordAccess()` 分离：渲染页面不会制造访问次数，但从未访问的卡片仍可在 `(lastVisited || firstSeenAt)` 超过 60 个自然日后进入 `.card--dusty`。`marginalia` 为账本权威来源，`normalizeItemSchema()` 会用其覆盖 `data.js` 中的旧版 `notes` 字段。

## 4. 索书框（`.folio-search-bar input`）多模前缀路由表

根据首字符实时切换工作模式：

| 输入 | 模式 | 行为 | 所属阶段 |
|---|---|---|---|
| 无前缀 | 馆内检索 | 实时模糊检索全馆卡片（标题 / 域名 / 拼音首字母 / `#tag`），底部穿透检索「待编目匣」；回车若唯一匹配则打开，否则或按 `Shift+Enter` 跳当前外网搜索引擎；**特定纯数字 / 密令依然静默触发隐藏跳转** | Phase 1（穿透在 Phase 2） |
| `/` 或 `>` | A1 馆内命令 | 搜索框下方展开古籍批注式命令补全条，上下键或点击执行 | Phase 1 起 |
| `?` | D1 守馆人 RAG | 羊皮纸浮层 `.librarian-parchment-folio` 流式输出馆长荐书批注 + 1~3 张藏书票推荐条（含待编目匣） | Phase 4A |
| `!` | D1 守馆人轻执行 | 原地羊皮纸浮层流式输出解答 / 代码块，并提供复制、存入活字秘卷、收卷 | Phase 4A |

**`?` / `!` 的触发边界（零容忍）**：只有在 `#archive-search-input` 拥有焦点、且输入内容以该前缀开头时，才会进入司天监路由（`js/librarian.js` → `isLibrarianQuery()`）。非输入态直接按 `?` 依旧由 `js/shortcuts.js` 唤出「快捷键漫游指南 `#shortcuts-modal`」，二者互不侵占。`app.js` 的 `isCommandQuery()` 同样把 `?` / `!` 视为前缀路由，避免它们进入馆内模糊过滤。

**命令清单**（按阶段逐步加入）：
- Phase 1：`/theme`（切换观星台 / 日晷）、`/random`（今日开卷）、`/export`（导出全馆 JSON + 借阅账本）、`/clear-dust`（重置蒙尘状态）
- Phase 2：`/uncatalogued`（打开待编目匣）、`/snippets`（活字秘卷匣）、`/shadow`（暗月密室）、`/focus`（考场结界）
- Phase 3A：`/sound`（白噪音天文台开关）、`/tools`（黄铜工具尺）
- Phase 3B：`/graph`（展开穹顶引力星图）
- Phase 4A：`/ask`（司天监荐书顾问）、`/exec`（就地处决）、`/ai-config`（司天监密钥）、`/ping`（巡检星轨；`/ping sandbox` 走确定性演练）
- Phase 4B：`/morning`（观星台晨报）、`/ephemeris`（同上别名）、`/amber`（网页琥珀拓片）、`/ingest`（飞鸽传书 / 盖章小书签）、`/notion`（Notion 同步桥）、`/telescope`（联邦寻星镜）、`/federation`（同上别名）
- 后续：`/sync`（云端同步，未排期）

> `/ping sandbox` 是唯一接受尾随参数的命令：`parseCommandArgs()` 只解析命令 token 之后的关键词，命令补全也按首个 token 过滤，因此 `/ping sandbox` 仍能命中 `/ping`。

## 5. 全局快捷键（仅在焦点不在 input / textarea 时生效）

| 键 | 功能 | 阶段 |
|---|---|---|
| 两位数字（450ms 内） | A2 索书号直达 | Phase 1 |
| `R` | A8 今日开卷 | Phase 1 |
| `U` | B 待编目匣 | Phase 2 |
| `S` | C1 活字秘卷匣 | Phase 2 |
| `T` | D3 黄铜工具尺（非输入态） | Phase 3A |
| `G` | C6 书本目录 / 穹顶星图切换（非输入态） | Phase 3B |
| `M` | C2 观星台晨报开合（非输入态、无修饰键、无其他浮层） | Phase 4B |
| `Ctrl/Cmd + Shift + Enter` | C3 群星会诊 | Phase 2 |
| `Alt + 点击卡片` | A3 翻转批注面（不触发外链） | Phase 2 |

## 6. 布局与命名约定（Phase 0 确立，后续沿用）

- 外壳 `.folio-shell`：桌面 `max-width: 1440px; display: grid; grid-template-columns: 290px minmax(0, 1fr);`
- 左栏 `.folio-spine`（Sticky）；右栏 `.folio-main`；索书条 `.folio-search-bar`
- 卡片网格 `.cards-asymmetric-grid`（12 列），三级密度：
  - Tier 1 镇馆主卷 `.card--monograph`（span 8）
  - Tier 2 标准典藏 `.card--archive`（span 4 / span 6）
  - Tier 3 窄幅索书签 `.card--slip`（span 4）
- 状态类：`.card--dusty`（A4 蒙尘）；后续新增状态类统一用 `.card--*` 前缀
- Phase 2 状态类：`.card--shadow`（暗月卷宗）、`.card--sealed`（考场封条）、`.is-flipped`（批注背面）、`.constellation-highlight`（星群悬停高亮）
- 待编目抽屉 `.uncatalogued-drawer`：桌面 `420px`、`<=640px` 时 `100vw`；候选卡使用 1px dashed 框、`TMP-XX` 铅笔编号与 `[ 留卷待查 ]` 章
- 黄铜工具尺 `.brass-workbench`：右侧抽屉，桌面 `min(600px, 100vw)`、`<=640px` 时 `100vw`；所有探针请求 2000ms 超时并静默回退本地沙盒
- 星轨编年史 `.almanac-chronicle`：最近 28 天月相矩阵 + `.is-time-dimmed` 时光回溯过滤；数据写入 `almanac[YYYY-MM-DD] = { count, clicks, aiCalls, sites }`
- 穹顶星图 `.star-map-container`：Canvas 径向引力图；`G` 切回目录时立即停止 `requestAnimationFrame`，桌面 `min-height: 640px`、移动端 `480px`
- 尘封阈值：`> 60` 个本地自然日；封存沙漏：`> 90` 天且 `accessLog[itemId].count === 0`。随机开卷默认有 25% 概率优先检查封存候选
- 移动端断点 `< 900px`：单列，书脊转吸顶横向游标刻度尺；搜索框旁保留 `[ ⌘ 待编目 ]` / `[ 📐 工具尺 ]` 紧凑入口，无横向溢出
- Phase 4A 司天监浮层 `.librarian-parchment-folio`：双线边框羊皮纸，纸底必须 **不透明**（`--bg-surface` 实底 + 半透明洗色与横线层），否则浮层会透出下方卡片文字。桌面锚定 `.archive-search-section`；`<= 900px` 时该区块与移动端按钮同行、宽度塌缩至约 221px，因此把 `.folio-search-bar .archive-search-section` 改为 `position: static`，改挂到吸顶索书条，浮层才真正全幅。浮层内容为 flex 列：头部与动作栏 `flex-shrink: 0`，批注区 `flex: 1 1 auto; min-height: 0; overflow-y: auto`，推荐条 `flex: 0 1 auto` 并自行滚动——缺任一条件都会出现「批注被压扁并盖住推荐条」的视觉重叠。`positionFolio()` 会把索书条底边写入 `--librarian-folio-top`，供 `<= 640px` 计算 `max-height`；下方空间不足时追加 `.is-flip-up` 翻到索书条上沿。
- Phase 4A 密钥弹窗 `#librarian-config-modal`：`<= 640px` 时卡片 `width: 100%`、底部对齐、`max-height: 90dvh`，内容区可滚动。
- Phase 4A 星轨探针 `.card-star-probe`：5px 圆点，插在 `.card-domain-slug`（窄幅卡为 `.card-slip-domain`）之后，故 `.card-titles .card-domain-slug` 需 `display: inline-block`；三态类 `.is-idle` / `.is-probing` / `.is-online` / `.is-offline`，并通过 `data-probe-status` 与 `data-latency-ms` 对外暴露状态。
- Phase 4A 遥测机关台 `.telemetry-deck`：右栏 `#constellation-rail` 之后，`auto-fit minmax(180px, 1fr)` 三表盘，`<= 900px` 单列；黄铜扳手靠 `.is-pulling` → `.is-pulled` 两个类驱动动画；`#telemetry-deck-body` 折叠态用 `[hidden]`。
- Phase 4B 新增四个浮层，统一约定：`<div id="X-backdrop" hidden>` + `<section id="X-modal" hidden aria-hidden="true">`，`open()` 置 `hidden=false` 并给 `body` 加 `.X-open { overflow: hidden }`，`close()` 归还焦点；`<= 900px` 一律底部对齐、宽度 `100%`、`max-height: calc(100dvh - 20px)`。
  - `.ephemeris-modal` / `.ephemeris-sheet`（C2）：`z-index` 320/330；正文 `.ephemeris-body` 为 `repeat(2, minmax(0, 1fr))` 双栏 Grid，`.ephemeris-column:nth-child(2n)` 去右分割线，末栏 `.ephemeris-column:last-child:nth-child(odd)` 跨整行；`<= 900px` 降单栏。
  - `.amber-modal` / `.amber-stone`（D5）：`z-index` 340/350；竖纹宣纸 + 琥珀晕染底；`.amber-body` 为 flex 列且 `overflow: hidden`，只有 `.amber-snapshot` 内部滚动，批注与 `.amber-wayback` 用 `flex: 0 0 auto` 常驻——整块滚动会把时光机按钮推到折线以下。
  - `.courier-modal` / `.courier-sheet`（A6/C5）：`z-index` 360/370。
  - `.federation-modal` / `.federation-sheet`（D7）：`z-index` 380/390；`.federation-rail` 横向滚动，`.federation-list` 为 `auto-fill minmax(240px, 1fr)`，`<= 640px` 单列。
- Phase 4B 琥珀徽章 `.card-amber-badge`：**底部封条**而非浮动角标——`left: 0; right: 0; bottom: 0` 占满卡片下缘。浮动角标会压住 `.card-bottom-actions` 的 `№` 号与 `↗` 跳转符（实测重叠 16px）。离线卡加 `.card--amber-offline { padding-bottom: 34px }` 预留高度，窄幅卡 `.card--slip.card--amber-offline` 用 `min-height: 92px` 代替。
- Phase 4B 顶栏入口响应式：`<= 1180px` 三个新入口收敛为纯图标（否则 899px 会把 `.colophon-right` 撑出视口 28px）；`<= 900px` 顶栏入口整体 `display: none`，改由 `.mobile-phase4b-actions` 承接。

### 6.1 Phase 4A 新增状态（`MYNAV_LEDGER_V2`）

```javascript
{
  aiConfig: {              // D1 司天监密钥（仅存本机，绝不上传第三方）
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat"
  },
  telemetryConfig: {       // C4 遥测机关台
    autoProbe: true,       // 首屏静默轻量探测开关
    instruments: {         // quota / node / hook 三枚仪器，缺省由 telemetry.js 合并默认值
      // node: { id, label: "sueexin.dev", value: "节点在线", expiresAt: "2027-03-15" }
      // hook: { id, label, url: "", method: "POST", status: "⚙️ 机关已触发 · HTTP 200 (Δt 24ms)", latencyMs: 24, at: 1760... }
    }
  }
}
```

`normalizeLedger()` 对这两个字段做逐项合并，旧账本（无此字段）自动回落默认值，升级不丢用户已填内容。

### 6.2 Phase 4A 对外测试钩子

| 钩子 | 用途 |
|---|---|
| `NavApp.Librarian.setStreamSpeed(0)` | 关闭打字机流式，断言瞬时完成 |
| `NavApp.Librarian.run("?", q)` / `whenSettled()` / `isStreaming()` | 直接驱动司天监并等待流式收敛 |
| `NavApp.Librarian.saveToCodex()` / `copyResult()` | 存入活字秘卷 / 复制结果 |
| `NavApp.Librarian.getState()` | 读 `{ open, mode, streaming, source, cards, hasApiKey }` |
| `NavApp.Telemetry.probeAll({ mock: true })` | 确定性巡检（FNV-1a 散列决定在线与否与 Δt），返回 `{ probed, online, offline, results }` |
| `NavApp.Telemetry.getState()` / `getProbe(id)` | 读取探针三态与延迟读数 |
| `NavApp.Telemetry.triggerHook("hook", { mock: true })` | 黄铜扳手沙盒演练，返回 `{ ok, httpCode, latencyMs, status }` |
| `NavApp.Telemetry.updateInstrument(id, patch)` | 就地更新仪器配置（持久化到 `telemetryConfig`） |

> 自动化环境（`navigator.webdriver === true`）下首屏自动巡检默认不启动，以保证断言确定性；真实用户仍有 4s 后的轻量首屏探测。

### 6.3 Phase 4B 新增状态（`MYNAV_LEDGER_V2`）

```javascript
{
  amberVault: {            // D5 网页琥珀拓片封存库（siteId → rubbing），仅存本机
    // "ai-muse": {
    //   siteId, name, url, host, callNumber,
    //   summary, snapshot, note, wayback, amberNo,
    //   favorite, sealedAt, updatedAt, source
    // }
  }
}
```

`normalizeLedger()` 对其做逐条合并，旧账本（无此字段）自动回落 `{}`，升级不丢已封存的碑拓。新增导出：`getAmberVault` / `setAmberRubbing` / `removeAmberRubbing`。

另有三个**不进入账本**的独立 key（与既有 `mynav_arch_view` 等同级）：

| key | 归属 | 内容 |
|---|---|---|
| `MYNAV_EPHEMERIS_SOURCES` | C2 | 外部 JSON / RSS 聚合源数组 `[{ url, kind }]` |
| `MYNAV_NOTION_ENDPOINT` | A6 | 可选的 Cloudflare Worker 同步端点 URL |

### 6.4 Phase 4B 对外测试钩子

| 钩子 | 用途 |
|---|---|
| `NavApp.Ephemeris.open() / close() / isOpen()` | 开合《观星台晨报》 |
| `NavApp.Ephemeris.setColumn("ai"\|"workshop"\|"study"\|"all")` | 切换分栏 |
| `NavApp.Ephemeris.capture(itemId)` | 一键收入待编目匣，返回 `{ site, tmpNumber, whySaved }` 或 `{ duplicate: true }` |
| `NavApp.Ephemeris.getItems()` / `getState()` | 读 12 条简报与刊期 / 信源状态 |
| `NavApp.Ephemeris.setSources([...])` / `loadSources()` | 配置并装载外部聚合源（2000ms 超时，失败静默回落） |
| `NavApp.Amber.sealSite(siteId, customSnapshot)` | 封存拓片，`customSnapshot` 可为字符串或 `{ summary, snapshot, note }` |
| `NavApp.Amber.openRubbing(siteId)` / `open()` / `close()` | 打开碑拓阅览室（未封存则「调阅即封存」） |
| `NavApp.Amber.getVault()` / `getRubbing(id)` / `getState()` | 读取封存库 |
| `NavApp.Amber.autoSealFavorites()` / `sealAll()` | 批量封存（前者仅 `★ 私人典藏`） |
| `NavApp.Courier.ingestFromParams({ search, payload, clean })` | 解析 `?ingest=1&…` 并唤醒确认匣，返回是否拦截成功 |
| `NavApp.Courier.commitIngest("uncatalogued"\|"catalogued")` | 确认入馆，返回 `{ site, duplicate, mode }` |
| `NavApp.Courier.buildBookmarklet(baseUrl?)` | 生成含 `ingest=1` 的小书签脚本 |
| `NavApp.Courier.toCsv()` / `exportJson()` / `importText(text)` | Notion 九列双向导入导出 |
| `NavApp.Courier.getEndpoint()` / `setEndpoint(url)` / `pushToWorker()` | Worker 端点配置与推送（失败回落本地） |
| `NavApp.Federation.buildPublicManifest()` | 动态生成与 `public-collection.json` 同结构的公开清单 |
| `NavApp.Federation.auditManifest(manifest)` | 隐私自检，返回 `{ valid, total, shadowKnown, leaked[] }` |
| `NavApp.Federation.borrow(itemId, nodeId)` | 邻馆抄录进待编目匣，返回 `{ site, duplicate, source }` |
| `NavApp.Federation.fetchRemoteManifest(url)` | 拉取外部 `/public-collection.json`（2000ms 超时） |
| `NavApp.Federation.getNodes()` / `getState()` | 读节点轨与清单签名 |

### 6.5 D7 公开馆藏清单（根目录 `public-collection.json`）

由 `scripts/build-public-collection.js` 从 `data.js` 的 `NAV_DATA` 确定性生成（`vm` 沙箱加载，不执行浏览器环境）：

```
schema: "mynav.public-collection"   version: "2.0"
library: { name, volume: "VOL. 2026", curator, motto }
printedAt, siderealSignature ("LST hh mm ss"), signatureHash (8 位 hex)
visibilityPolicy: "public-only"     total: 36     shadowExcluded: 0
entries[]: { id, callNumber, title, url, category, description, tags[], whySaved }
```

- 恒星时签名与 `signatureHash` 均由 **FNV-1a 32-bit**（与 Phase 4A 遥测同一算法）派生，同一份清单永远得到同一枚戳记。
- **隐私红线**：生成器与 `buildPublicManifest()` 双向硬过滤 `visibility === "shadow"`；写入前额外断言「数量必须为 36」且「不得含任何 shadow 条目」，任一不满足即抛错中止。
- 该文件是**静态快照**，不随浏览器端改动自动刷新；用户新增 / 转正卡片后需重跑生成器，或在寻星镜面板点 `[ 💾 导出本馆清单 ]` 下载动态版本。

### 6.6 图标解析层（`js/schema.js`）

图标是**跨模块横切关注点**，唯一收口在 `NavSchema`，任何模块都不得自行拼接 `<img src>` 或裸请求 `https://${domain}/favicon.ico`。

```javascript
NavSchema.resolveIcon(site, fallbackText)    // 返回最终 src 字符串
NavSchema.iconAttributes(site, fallbackText) // 返回完整属性串（src + 降级链）
NavSchema.bindIconFallbacks(root)            // 为 root 内新插入的 <img> 绑定 error
NavSchema.handleIconError(img)               // 手动推进一级降级（返回是否推进）
NavSchema.waitForIcon(img, timeoutMs)        // Promise<{complete,naturalWidth,...}>
NavSchema.isPrivateOrIpHost(hostname)        // 内网 / localhost / IPv4 / IPv6 判定
NavSchema.buildMonogramDataUri(text)         // 零网络内联 SVG 字母徽标
NavSchema.hostnameOf(url)                    // 安全取 hostname，异常返回 ""
```

**解析优先级**

| 级别 | 条件 | 结果 |
| :--- | :--- | :--- |
| A | `site.iconPath` / `site.icon` / `site.favicon` 以 `icons/` 开头 | 本地静态路径 |
| B | `site.id` 命中 `LOCAL_ICON_IDS`（36 个内置 ID） | `icons/<id>.png` |
| C | 显式 `http(s)` favicon（Bookmarklet 捕获 / Notion 导入） | 该外链，外链失败后续接 C′ 链 |
| D | 主机为空、`localhost`、`.local/.lan/.internal/.home`、任意 IPv4、任意含 `:` 的 IPv6 | 内联 SVG 徽标，**零网络** |
| E | 其余公网域名 | `icons.duckduckgo.com` → `icon.horse` → `google.com/s2` → 内联 SVG |

**降级链与死循环防护**：`iconAttributes()` 把 C′/E 的三段候选写入 `src` / `data-fallback-1` / `data-fallback-2`，终极档写入 `data-icon-fallback`；`data-icon-probe-step` 记录当前级别。`handleIconError()` 只在候选与当前 `src` 不同时才推进；落到 `data:image/` 的瞬间即置 `data-icon-fallback-locked="true"` 且不再推进，因此**不可能递归触发 `onerror`**。

**渲染收口清单**（全部经 `iconAttributes` + `bindIconFallbacks`）：`app.js` 正式卡片（`.card-emblem`）、`js/uncatalogued.js` 待编目匣、`js/librarian.js` 司天监推荐票、`js/federation.js` 寻星镜、`js/serendipity.js` 今日开卷、`js/star-map.js` 星图预览卡。

**联邦星图的例外**：邻馆沙盒条目不是用户确认的来源，`federation.js` 对非本馆节点只输出内联徽标，避免陌生域名探测把 404 噪声带进控制台；本馆节点仍走正常解析。

**尺寸与主题**：`.archive-icon-box` 统一 `inline-flex` + `object-fit: contain`；`.card--monograph` 40px、`.card--archive/.card--full` 34px、`.card--slip` 24px；`[data-theme="dark"]` 追加 `drop-shadow(0 0 1px …0.35)` 背光，`[data-sanctum="shadow"]` 换成暗红底座。
