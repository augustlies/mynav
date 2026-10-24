# mynav 2.0 · Phase 4A 更新日志

> 面向接手者的技术变更说明。可直接作为上下文交给其他 AI 阅读。
> 基准提交：`8140480`（Phase 3B 之后）。**本次改动全部未提交，位于工作区。**

---

## 一、概述

项目：个人数字收藏馆 mynav（EX LIBRIS 风格，纯静态前端，零构建步骤，原生 `<script>` 加载）。

本次为 **Phase 4A**，实现三个模块：

| 编号 | 名称 | 文件 |
|---|---|---|
| D1 | 守馆人 AI · 司天监终端 | `js/librarian.js`（新建） |
| A5 | 星轨联通探针 | `js/telemetry.js` 第 1 部分（新建） |
| C4 | 星轨遥测与机关台 | `js/telemetry.js` 第 2 部分（新建） |

原 Phase 4 已拆分为 **4A（本次，纯前端）** 与 **4B（未执行，需云端底座）**。4B 内容：Notion 同步（A6）、盖章入馆 Bookmarklet（C5）、观星晨报（C2）、网页琥珀（D5）、联邦星图（D7）。

---

## 二、文件清单

### 新增

| 文件 | 行数 | 说明 |
|---|---|---|
| `js/librarian.js` | 1362 | D1 全部逻辑 |
| `js/telemetry.js` | 802 | A5 + C4 全部逻辑 |
| `docs/prompts/STEP4A_PROMPT.md` | — | 指令存档 + 缺陷记录 |
| `artifacts/visual-qa/phase04a/acceptance.js` | 1099 | Playwright 验收 |
| `artifacts/visual-qa/phase04a/shots.js` | 349 | 高清截图脚本 |

附带产物：`acceptance-report.json`、`shots-report.json`、12 张 `deviceScaleFactor: 2` 截图。

### 修改

```
 ARCHITECTURE_2.0.md |   51 +-
 TODO.md             |   11 +-
 app.js              |   40 +-
 index.html          |  122 +++++-
 js/commands.js      |   88 ++++-
 js/ledger.js        |   70 ++++
 styles.css          | 1017 ++++++++++++++++++++++++++++++++
 7 files changed, 1383 insertions(+), 16 deletions(-)
```

### 未触碰

`data.js`、`404.html`、`icons/`、`functions/`、`notion-sync.js`、`validate.js`，以及所有 Phase 1–3B 的业务模块（`almanac.js`、`star-map.js`、`astronomy.js`、`soundscape.js`、`brass-tools.js`、`uncatalogued.js`、`snippets.js`、`sanctum.js`、`shortcuts.js` 等）。

---

## 三、D1 守馆人 AI · 司天监

### 触发契约（关键约束）

`?` 与 `!` **仅在同时满足**以下条件时进入司天监路由：

1. `document.activeElement` 是 `#archive-search-input`
2. 输入值以 `?` 或 `!` 开头

**非输入态按 `?` 仍归 `js/shortcuts.js`，唤出「快捷键漫游指南 `#shortcuts-modal`」。** 这是硬约束，二者互不侵占。

`app.js` 的 `isCommandQuery()` 已把 `?` / `!` 纳入前缀路由，避免它们进入馆内模糊过滤。

### 两种模式

**`?` 荐书顾问（RAG）**
- 语料 = 正式馆藏（`NavApp.getAllSites()`）+ 待编目匣（`NavApp.getUncataloguedSites()`）
- 在 `.librarian-parchment-folio` 中以打字机流式输出馆长批注
- 从语料中抽出 1–3 张最匹配卡片，渲染为 `.librarian-card-slip` 推荐条，支持点击调阅、待编目卡一键转正

**`!` 就地处决**
- 原地输出解答或围栏代码块（`.librarian-code`），不跳转任何外部网页
- 底部动作栏：`[ 📋 复制结果 (Enter) ]`、`[ 📜 存入活字秘卷匣 ]`、`[ ✕ 收卷 (Esc) ]`
- 同一提问二次回车 = 复制结果

### 双擎驱动

- **已配置 Key**：POST `${baseUrl}/chat/completions`（OpenAI 兼容），`AbortController` 12s 超时。RAG 模式把精简版全馆目录 JSON 作为 System Prompt，解析返回中的 `PICK: <id>` 回填推荐卡
- **未配置 Key / 离线 / 网络失败**：**一律静默降级**为本地引擎，绝不阻塞、绝不报错

本地引擎细节：
- 8 组语义簇（`SEMANTIC_CLUSTERS`：map / code / ai / design / study / efficiency / network / media），把口语提问扩散为馆藏可命中词
- 多维加权：title 240 / tags 90 / desc 34 / hostname 40 / whySaved 26 / notes 16；待编目卡「收录动机」命中额外 +30
- 14 套预设极客模板（`EXEC_RECIPES`：端口转发 / Git 撤销 / Docker / 正则 / HTTP / Nginx / systemd / 端口占用 / cron / SSH / 编码摘要 / JSON / SQL 等），按关键词打分选取，端口号从提问中自动提取

### 密钥配置

`#librarian-config-modal`，字段：`API Base URL`（默认 `https://api.deepseek.com/v1`）、`API Key`、`Model Name`（默认 `deepseek-chat`）。

持久化于 `MYNAV_LEDGER_V2.aiConfig`，**仅存本机，不上传任何第三方**。

---

## 四、A5 星轨联通探针

- 每张正式馆藏卡片的域名旁注入 5px `.card-star-probe`
- 定位：插在 `.card-domain-slug`（窄幅卡 `.card-slip-domain`）之后；因此 `.card-titles .card-domain-slug` 需 `display: inline-block`
- `MutationObserver` 监听画布重渲染，110ms 后补注入

| 状态 | 类名 | 视觉 | Hover |
|---|---|---|---|
| 未巡检 | `.is-idle` | 黄铜微点 `opacity: .35` | `星轨未巡检` |
| 巡检中 | `.is-probing` | 黄铜微点闪烁 | `星轨巡检中…` |
| 在线 | `.is-online` | `#F4E7C5` 暖白呼吸灯（`starProbeBreath` 2.8s） | `星轨畅通 · Δt XXms` |
| 离线 | `.is-offline` | `#A64030` 暗红残星 | `星轨受阻 / 离线` |

对外数据属性：`data-probe-status`、`data-latency-ms`。

探测：`AbortController` 2000ms 超时 + 4 路并发 worker 池，`no-cors` GET。手动触发：`/ping`、`[ 📡 巡检星轨 ]`。首屏 4s 后静默轻量探测（限 8 条）。

---

## 五、C4 星轨遥测与机关台

`.telemetry-deck` 位于右栏 `#constellation-rail` 之后，含 3 枚古典仪器表盘：

1. **算力余量表**（`.telemetry-instrument--quota`）—— 账户名 / 余额 / 预警线，可就地编辑
2. **星槎负载仪**（`.telemetry-instrument--node`）—— 节点状态摘要 + 主域名续期倒计时（`daysUntil()`）
3. **黄铜扳手**（`.telemetry-instrument--hook`）—— Webhook 拨片

扳手动画：`.is-pulling`（0.32s 扳动）→ `.is-pulled`（落位 + 黄铜压痕）。
回执格式：`⚙️ 机关已触发 · HTTP 200 (Δt XXms)`；未配真实 URL 或无网时走**沙盒演练**，同样返回确定性回执。

持久化于 `MYNAV_LEDGER_V2.telemetryConfig`。

---

## 六、状态中心变更（`js/ledger.js`）

`MYNAV_LEDGER_V2` 新增两个顶层字段：

```javascript
{
  aiConfig: {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat"
  },
  telemetryConfig: {
    autoProbe: true,
    instruments: {
      // quota: { id, label, value, note, endpoint }
      // node:  { id, label, value, expiresAt: "2027-03-15", note }
      // hook:  { id, label, url, method, status, latencyMs, at }
    }
  }
}
```

`normalizeLedger()` 对二者做逐字段合并，**旧账本（无此字段）自动回落默认值，升级不丢用户已填内容**。

新增导出：`getAiConfig` / `setAiConfig` / `getTelemetryConfig` / `setTelemetryConfig`。

---

## 七、命令与 API

### 新增命令（`js/commands.js`）

| 命令 | 行为 |
|---|---|
| `/ask` | 聚焦索书框并填入 `? ` |
| `/exec` | 聚焦索书框并填入 `! ` |
| `/ai-config` | 打开司天监密钥弹窗 |
| `/ping` | 巡检星轨并展开机关台 |
| `/ping sandbox` | 走确定性演练（不发起真实网络请求） |

`/ping sandbox` 是唯一接受尾随参数的命令：`parseCommandArgs()` 只解析命令 token 之后的关键词，命令补全亦改为按**首个 token** 过滤。

### 对外测试钩子

```javascript
// D1
NavApp.Librarian.setStreamSpeed(0)      // 关闭打字机，瞬时完成
NavApp.Librarian.run("?", query)        // 直接驱动
NavApp.Librarian.whenSettled()          // 等待流式收敛
NavApp.Librarian.isStreaming()
NavApp.Librarian.getState()             // { open, mode, streaming, source, cards, hasApiKey }
NavApp.Librarian.saveToCodex()          // 存入活字秘卷
NavApp.Librarian.copyResult()
NavApp.Librarian.openConfig() / closeConfig() / saveConfig()
NavApp.Librarian.recommend(query, limit)

// A5 / C4
NavApp.Telemetry.probeAll({ mock: true })   // { probed, online, offline, results }
NavApp.Telemetry.getState() / getProbe(id)
NavApp.Telemetry.triggerHook("hook", { mock: true })
NavApp.Telemetry.updateInstrument(id, patch)
NavApp.Telemetry.openDeck() / closeDeck() / toggleDeck()
NavApp.Telemetry.resetProbes()
```

`mock: true` 使用 **FNV-1a 32-bit 散列**决定在线与否与延迟（12–99ms），完全确定性可复现。

---

## 八、验收结果

```
headedBoot（headless:false 真实浏览器）
  cards=36  sections=5  "全馆典藏 36 卷"
  刊头日期已解析  NavApp/Librarian/Telemetry 均挂载  overflow=0
  书架切换 ✅  随机开卷 ✅

全量回归
  cards=36  uniqueCallNumbers=36  uniqueCardIds=36  errors=[]
  XXXXXXX 口令 ✅  非输入态 ? 打开快捷键指南且不触发司天监 ✅
  待编目匣 420px ✅  活字秘卷 4 张 ✅  暗月/考场 ✅
  恒星时 ✅  白噪音 ✅  黄铜工具尺（Base64/SHA-256）✅
  月相编年史 28 格/28 SVG ✅  穹顶星图 hub=5 planet=36 ✅

响应式（零横向溢出）
  1440 / 899 / 768 / 390 / 375  →  0,0,0,0,0

D1
  ? 地图切瓦片 → 2 张推荐条（含待编目 tmp-tile-gis）
  ! 端口转发 443 到 8080 → 4 个代码块
  saveToCodex → 秘卷 0 → 1
  aiConfig 改 Base URL/Model 后刷新仍持久化

A5 / C4
  online=22  offline=14  idle=0  探针宽度 5px  animation=starProbeBreath
  黄铜扳手 → HTTP 200 (Δt 24ms)

acceptance.js exit 0 · shots.js exit 0
```

---

## 九、执行期修复的 11 个缺陷（按严重度）

1. **【致命】`root is not defined`** —— `js/telemetry.js` 的 `scheduleAutoProbe()` 引用了 UMD 包装里存在、但工厂函数未接收的 `root`。异常在 `init()` 抛出，中断 `app.js` 整个初始化 → **0 张卡、刊头「载入中… · -- 卷」、书架与随机开卷全部无响应**。已改为 `window.__MYNAV_DISABLE_AUTOPROBE__`。
2. **【高】测试盲区** —— 上述 bug 被无头测试完全掩盖：Playwright 无头模式置 `navigator.webdriver = true`，`scheduleAutoProbe()` 在触达 `root` 前就提前 `return`。现已新增 `assertHeadedBoot()`（`headless: false`）作为验收第一道守卫。
3. **【高】缺初始化隔离** —— `app.js` 新增 `safeInit(name, fn)`，附加模块 `init()` 异常被捕获并 `console.warn`，绝不中断主画布渲染与事件绑定。
4. **【高】版本戳未升** —— 改动被引用文件却沿用旧 `?v=`，`file://` 下出现「新 HTML + 旧 JS」错配而白屏。`styles.css` / `ledger.js` / `commands.js` / `app.js` 已统一升至 `4.0.0`。
5. **浮层透底** —— 纸底原为半透明，压在实卡上透出卡片文字。改为不透明 `var(--bg-surface)` 实底 + 半透明洗色与横线层；`.telemetry-deck` 同理改用 `var(--bg-page)`。
6. **动作栏被裁** —— flex 列缺 `min-height: 0` 导致 `max-height` 不生效。已为头部/动作栏加 `flex-shrink: 0`，批注区 `flex: 1 1 auto; min-height: 0; overflow-y: auto`。
7. **移动端浮层塌缩** —— `<= 900px` 时 `.archive-search-section` 与移动端按钮同网格行，宽度仅约 221px。已将其改为 `position: static`，把浮层改挂到吸顶索书条。
8. **批注与推荐条重叠** —— 推荐条保留固有行高、批注区被压扁溢出所致。批注区自带滚动、推荐条 `flex: 0 1 auto` 并限高。
9. **黄铜扳手 `is-pulled` 丢失** —— `updateInstrument()` 重渲染替换拨片节点。`triggerHook()` 现在配置写入后重新 `animateLever()`。
10. **`/ping` 污染 Console** —— 无参时发起 36 路 `no-cors` 真实探测，浏览器必然记录跨域拒绝错误。新增 `/ping sandbox` 供自动化。
11. **有头溢出度量口径** —— `innerWidth` 含原生滚动条宽度，`scrollWidth - innerWidth` 会得负数假象。有头断言改用 `scrollWidth - documentElement.clientWidth`。

---

## 十、已知遗留 / 注意事项

- **`/ping`（无参数）在真实网络下仍会发起跨域探测**，浏览器会记录 `ERR_BLOCKED_BY_RESPONSE` 类 console 错误。这是 `no-cors` 探测的固有行为，非缺陷。彻底静默需改走 Worker 代理（原设计），属 4B 范畴。
- **`file://` 与 `http://127.0.0.1:8080` 的 localStorage 是两套独立空间**。用户数据按地址隔离，切换访问方式不会互相可见。
- **`data.js` 的版本戳保持 `1.8.0`**（本次未修改该文件）。
- 自动化环境（`navigator.webdriver === true`）下首屏自动巡检默认不启动，以保证断言确定性。
- 所有改动**未提交 git**，可 `git checkout .` 回到 `8140480`（会丢失 Phase 4A 全部工作）。
