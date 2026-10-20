# mynav 2.0 · Phase 4A 执行指令

> 本文件保存 Phase 4A（D1 守馆人 AI 司天监终端 + A5 星轨联通探针 + C4 遥测机关台）的原始实施要求，作为 Phase 4B 与回归验收的上下文锚点。

## Role & Context

你是一位严谨的高级前端架构师。当前项目为个人数字收藏馆（EX LIBRIS 风格的 mynav）。
项目已圆满完成 Phase 0、Phase 1、Phase 2、Phase 3A 与 Phase 3B（见 `index.html`、`TODO.md`、`ARCHITECTURE_2.0.md` 及 `artifacts/visual-qa/phase03b/acceptance-report.json`）。

为了保证工程质量，我们将最后的 Phase 4 拆分为 **Phase 4A（守馆人 AI 司天监终端 + 星轨联通探针 + 遥测机关台）** 与 **Phase 4B（观星晨报 + 网页琥珀 + 盖章入馆 Bookmarklet + 联邦星图）** 两步执行。
本次仅执行 **Phase 4A（包含 D1、A5、C4 三个模块）**，请同步更新 `TODO.md` 并将本指令保存至 `docs/prompts/STEP4A_PROMPT.md`。

---

## 🚨 零容忍红线

1. **既有功能 100% 绿灯**：隐藏口令 `***REMOVED***`、全局唯一索书号（`uniqueCallNumbers === 36`）、`/` 与 `>` 命令面板、待编目匣、活字秘卷、暗月/考场模式、恒星时、白噪音、黄铜工具尺、月相编年史、穹顶引力星图及 5 断点零横向溢出绝不可退化！
2. **快捷键冲突规避**：注意 `index.html` 中在**非输入状态**下按 `?` 键会唤出「快捷键漫游指南 (`#shortcuts-modal`)」。因此，D1 守馆人 AI 的 `?` 与 `!` 触发条件必须严格限定为：**当焦点位于搜索框 `#archive-search-input` 内且输入内容以 `?` 或 `!` 开头时触发**（同时支持命令 `/ask`、`/exec` 及司天监设置命令 `/ai-config`）。
3. **免 Key 确定性兜底（Zero-Key & Offline Resilience）**：用户未配置 API Key 或处于离线/Playwright 测试环境时，`?` 与 `!` 模式必须通过内置的**本地确定性检索引擎与预设沙盒响应**完整走通流式羊皮纸 UI 与卡片推荐闭环，严禁因网络或未填 Key 报错阻塞！

---

## 🛠️ Phase 4A 具体实现清单（新建 `js/librarian.js` 与 `js/telemetry.js`）

### 1. [D1] 「守馆人 AI · 司天监」：索书框 Agent 终端（`js/librarian.js`）
- **搜索框前缀路由与羊皮纸浮层（`.librarian-parchment-folio`）**：
  - 在 `.archive-search-section` 下方挂载一张古典双线边框的「司天监羊皮纸批注浮层（`#librarian-folio`）」。
  - **模式一：`?` 前缀 · 懂全馆藏书的 RAG 顾问**（如输入 `? 帮我挑个适合处理切图或代码的工具`）：
    - 实时或按回车后，在羊皮纸浮层中以打字机流式效果输出馆长荐书批注，并从当前馆藏（**含正式馆藏 + `uncatalogued` 待编目匣**）中精准抽出最匹配的 1~3 张卡片，在浮层下方渲染为可直接点击调阅或一键转正的微缩藏书票推荐条！
    - **双擎驱动**：若用户已配置 LLM API，则将精简版全馆目录 JSON 作为 System Prompt 发送给 LLM 进行智能推荐；若未配置 API Key，则自动使用**本地多维加权检索引擎（匹配 title / desc / tags / whySaved / notes）**生成古风克制的司天监荐书批注。
  - **模式二：`!` 前缀 · 就地处决轻任务（In-Place Execution）**：
    - 按回车后，不跳转任何外部网页，直接在原地羊皮纸浮层中流式吐出解答或代码块。
    - 浮层底部提供 **`[ 📋 复制结果 (Enter) ]`**、**`[ 📜 存入活字秘卷匣 ]`**（直接联动 `snippets.js` 将优秀回答存为秘卷！）与 **`[ ✕ 收卷 (Esc) ]`** 按钮。
    - 若未配置 API Key，内置常用极客指令速查库（如端口转发、Git 撤销、正则、Docker 常用命令等确定性模板）给出即时响应，并温和提示可通过 `[ ⚙️ 司天监密钥 ]` 接入实时 DeepSeek / OpenAI 兼容接口。
- **「司天监密钥」本地安全配置抽屉/弹窗**：
  - 支持填写：`API Base URL`（默认 `https://api.deepseek.com/v1`，支持自定义 OpenRouter / 自建反代地址）、`API Key`（仅保存在本机 `MYNAV_LEDGER_V2.aiConfig`，绝不上传第三方）、`Model Name`（默认 `deepseek-chat`）。

### 2. [A5] 「星轨联通探针」：微光恒星状态灯（`js/telemetry.js` 第一部分）
- **卡片微光状态点（`.card-star-probe`）**：每张正式馆藏卡片注入一枚 `5px` 星轨联通星点。
- **按需与静默巡检**：提供手动触发（命令 `/ping` 或遥测栏 `[ 📡 巡检星轨 ]` 按钮）及首屏轻量探测能力（使用 `AbortController` 限制 `2000ms` 超时，支持并发控制防卡顿）。
- **天文视觉表达（拒绝俗气红绿灯）**：
  - **未巡检（Idle）**：静默黄铜微点（`opacity: 0.35`）。
  - **在线（Online）**：恒星暖白微光呼吸灯（`#F4E7C5` + 柔和光晕），Hover 显示天文学响应耗时如 `星轨畅通 · Δt 42ms`。
  - **离线/受阻（Offline/Unreachable）**：暗红残星（`#A64030`），Hover 显示 `星轨受阻 / 离线`。
- 暴露 `NavApp.Telemetry.probeAll({ mock: true })` 接口供自动化测试确定性验证在线/离线状态渲染与延迟角标。

### 3. [C4] 「星轨遥测与机关台」：私人基建遥控器（`js/telemetry.js` 第二部分）
- **嵌入式微型遥测栏 / 仪器卡（`.telemetry-deck`）**：默认包含 3 枚可自定义配置的微型古典仪器表盘（数据持久化于 `MYNAV_LEDGER_V2.telemetryConfig`）：
  1. **算力余量表（API Quota Ledger）**：展示核心 API 账户备忘/余额与预警线。
  2. **星槎负载仪（VPS / Node Status）**：展示自建节点状态摘要与主域名续航倒计时。
  3. **「黄铜扳手」Webhook 机关拨片（Brass Trigger）**：点击扳手按钮时，拨片产生机械拨动动画，发送请求并在状态栏反馈 `[ ⚙️ 机关已触发 · HTTP 200 (Δt XXms) ]`（离线或未配置真实 URL 时支持沙盒模拟触发演练）。

---

## ✅ 验收与自动化测试要求（Playwright & Node）

1. 在 `index.html` 底部合适位置挂载 `js/librarian.js` 与 `js/telemetry.js`，更新 `TODO.md` 将 Phase 4 拆分为 4A / 4B 并将 D1、A5、C4 打勾 `[x]`。
2. 编写并运行 `artifacts/visual-qa/phase04a/acceptance.js` 与 `shots.js`：
   - **全量回归**：确保 Phase 1 / 2 / 3A / 3B 核心断言（`***REMOVED***` 口令、`uniqueCallNumbers === 36`、非输入态按 `?` 依然正常打开快捷键指南、待编目匣、活字秘卷、暗月/考场、白噪音、工具尺、月相编年史、穹顶星图及 5 断点零横向溢出）100% 通过。
   - **D1 守馆人 AI 验证**：`? 地图切瓦片` 推荐批注与推荐条、`! 端口转发 443 到 8080` 代码输出 + `saveToCodex()` 秘卷 `+1`、司天监密钥配置持久化。
   - **A5 & C4 探针与遥测机关验证**：`probeAll({ mock: true })` 的在线呼吸态与 `Δt` 读数、黄铜扳手 Webhook 回执，全程 Console 零 Error。
3. 生成 `artifacts/visual-qa/phase04a/acceptance-report.json` 与高清验收截图。

---

## 📦 实际交付结果

- **实现文件**：`js/librarian.js`（D1，1341+ 行）、`js/telemetry.js`（A5 + C4，805 行）、`js/ledger.js`（`aiConfig` / `telemetryConfig` 与兼容合并）、`js/commands.js`（`/ask`、`/exec`、`/ai-config`、`/ping`）、`app.js`（前缀分流与模块装配）、`index.html`（浮层 / 机关台 / 密钥弹窗 DOM 与脚本挂载）、`styles.css`（Phase 4A 样式尾段）、`ARCHITECTURE_2.0.md`、`TODO.md`。
- **验收产物**：
  - `artifacts/visual-qa/phase04a/acceptance.js` → `acceptance-report.json`（全量回归 + D1 + A5/C4 + 响应式 + 命令，`errors: []`）
  - `artifacts/visual-qa/phase04a/shots.js` → `shots-report.json` + 12 张 DPR2 高清截图（深色 / 浅色 / 移动端）
- **关键回归数据**：`cards=36`、`uniqueCallNumbers=36`、`overflow=0`（1440 / 899 / 768 / 390 / 375）；RAG 推荐 2 卷（含待编目匣 `tmp-tile-gis`）、`!` 生成 4 个代码块、秘卷 `0 → 1`；探针 `online=23 / offline=14 / idle=0`、`Δt` 读数正常；黄铜扳手 `HTTP 200 (Δt 24ms)`。

### 执行期发现并修复的真实缺陷（供 4B 复用经验）

1. **浮层透底**：`.librarian-parchment-folio` 的纸底原为 `color-mix(..., 98%, transparent)`，压在实卡之上会透出卡片文字；已改为不透明 `var(--bg-surface)` 实底 + 半透明洗色与横线层。`.telemetry-deck` 同样改为 `var(--bg-page)` 实底。
2. **行动作栏被裁**：flex 列若未给批注区 `min-height: 0` 与 `flex: 1 1 auto`，`max-height` 不生效，底部动作栏会被推出版面；已为头部 / 动作栏加 `flex-shrink: 0`。
3. **移动端浮层塌缩**：`<= 900px` 时 `.archive-search-section` 与移动端按钮同网格行，宽度仅约 221px；已将其改为 `position: static`，把浮层改挂到吸顶索书条。
4. **批注与推荐条视觉重叠**：推荐条保留固有行高、批注区被压缩溢出所致（并非真正的层叠覆盖）；已让批注区 `overflow-y: auto`、推荐条 `flex: 0 1 auto` 并自带滚动。
5. **黄铜扳手 is-pulled 丢失**：`updateInstrument()` 会重渲染机关台从而替换拨片节点；`triggerHook()` 现在在配置写入后重新 `animateLever()`。
6. **真实网络巡检污染 Console**：`/ping` 无参时会对全部馆藏发起 36 路 `no-cors` 真实探测，浏览器必然记录跨域拒绝错误；新增 `/ping sandbox` 供自动化走确定性演练，命令补全亦改为按首个 token 过滤。
7. **【严重】`root is not defined` 致命错误（仅真实浏览器触发）**：`js/telemetry.js` 的 `scheduleAutoProbe()` 引用了 UMD 包装里存在、但工厂函数并未接收的 `root`。该异常在 `init()` 抛出，直接中断 `app.js` 整个初始化 → **0 张卡、刊头「载入中… · -- 卷」、书架与随机开卷全部无响应**。已改为 `window.__MYNAV_DISABLE_AUTOPROBE__`。
8. **测试盲区修复**：上述 bug 之所以被「全绿」掩盖，是因为 Playwright 无头模式把 `navigator.webdriver` 置为 `true`，`scheduleAutoProbe()` 在触达 `root` 之前就提前 `return` 了。现已新增 `assertHeadedBoot()` —— 用 `headless: false` 的真实渲染管线验证首屏 36 卡 / 5 分节 / 刊头 / `NavApp` 挂载 / 书架切换 / 随机开卷，作为验收的第一道守卫。
9. **初始化隔离开关**：`app.js` 新增 `safeInit(name, fn)`，附加模块（`NavLibrarian` / `NavTelemetry`）的 `init()` 异常被捕获并 `console.warn`，绝不中断主画布渲染与事件绑定。
10. **缓存版本戳**：凡改动被 `index.html` 引用的文件，必须同步升级 `?v=` 戳。`app.js` / `js/commands.js` / `js/ledger.js` / `styles.css` 已统一升到 `4.0.0`；`file://` 下旧缓存会导致「新 HTML + 旧 JS」错配而白屏。
11. **有头窗口溢出度量**：`innerWidth` 含原生滚动条宽度，`scrollWidth - innerWidth` 会得到负数假象；有头断言应改用 `scrollWidth - documentElement.clientWidth`。
