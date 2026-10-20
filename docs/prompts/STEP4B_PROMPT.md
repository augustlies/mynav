# Phase 4B · 收官指令存档

> 本文件为 Phase 4B 的执行指令原文与执行记录，供后续接手者复现。

---

## 一、任务目标

执行 mynav 2.0 的最终收官阶段 **Phase 4B**，实现四个提案群：

1. **[C2] 观星简报台 · Daily Ephemeris**
2. **[D5] 网页琥珀 · 离线快照与防失联保险箱**
3. **[A6 & C5] 飞鸽传书 · 跨端入馆通道与 Notion 典藏同步桥**
4. **[D7] 馆际互借 · 联邦星图寻星镜**

完成后宣布 Phase 0 ~ Phase 4B 全部 **22 项提案 100% 达成**。

---

## 二、零容忍红线（原文）

1. **保持 Phase 0 ~ Phase 4A 全部断言 100% 绿灯**：`assertHeadedBoot`（真实有头模式启动）、`***REMOVED***` 口令、`uniqueCallNumbers === 36`、非输入态 `?` 唤出快捷键指南、输入态 `?`/`!` 触发司天监 AI、探针与黄铜扳手、待编目匣、活字秘卷、暗月/考场、恒星时、白噪音、黄铜工具尺、月相编年史、穹顶星图及 5 断点零横向溢出绝不可退化！
2. **启动安全隔离**：所有新增模块必须通过 `app.js` 的 `safeInit(name, fn)` 注册初始化，且同步升级 `index.html` 中对应脚本与 `styles.css` 的版本戳（升至 `?v=4.1.0`）。
3. **暗月密室隐私红线**：在生成或导出 `public-collection.json`（D7 联邦星图）时，必须严格过滤掉所有 `visibility === "shadow"` 的暗月私密卡片！

---

## 三、实现清单（原文摘要）

### 1. [C2]「观星简报台 · Daily Ephemeris」：古典双栏铅字《观星台晨报》（`js/ephemeris.js`）

- **入口**：在右栏搜索区快捷钩子或顶栏新增 **`[ 🗞️ 观星晨报 ]`** 按钮（非输入态快捷键 `M` 或命令 `/morning`、`/ephemeris`），展开古典双栏铅字报纸版式的《观星台晨报》视图/抽屉（`#ephemeris-modal` 或内嵌双栏版面）。
- **信源与确定性离线刊期**：
  - 支持配置自定义 JSON/RSS 聚合源（带 `2000ms` `AbortController` 超时），并内置一套精选确定性《司天监晨间星历简报》（涵盖 AI 前沿、开源工坊、数字古籍与极客工具共 12 条高价值简报，支持按「AI 思考 / 工程工坊 / 深度研习」分栏阅读）。
- **一键捕获闭环（联动 B 待编目匣）**：
  - 每条晨报条目旁提供 **`[ ✦ 收入待编目匣 ]`** 按钮；点击后直接调用 `NavApp.Uncatalogued` 接口将其存入待编目匣（自动将该条晨报摘要填入 `whySaved` 收录动机），按钮状态变为 `[ ✓ 已封存 TMP-XX ]`！

### 2. [D5]「网页琥珀 · 离线快照与防失联保险箱」（`js/amber.js`）

- **琥珀封存库（`MYNAV_LEDGER_V2.amberVault`）**：
  - 为馆藏卡片（尤其是 `★ 私人典藏`）自动或手动生成一份本地「琥珀拓片（Amber Rubbing）」（包含抓取或提炼的核心功能摘要、关键路由备忘、封存时间戳，以及自动拼装的 `https://web.archive.org/web/*/{url}` Wayback Machine 历史镜像锚点）。
- **死链触发机制（联动 Phase 4A `telemetry.js`）**：
  - 当某张卡片被 `NavApp.Telemetry` 标记为离线（`data-probe-status="offline"` 或 `.is-offline`），或者用户在卡片背面/菜单点击 **`[ 📜 调阅拓片 ]`** 时：
  - 离线卡片右下角自动浮现醒目的琥珀金徽章 **`[ 📜 调阅拓片 ]`**（点击该徽章时不跳转死链外网，而是原地打开古典碑拓风格的 `#amber-modal` 琥珀拓片阅览室，展示本地封存的 Markdown/文本拓片内容、馆主批注与互联网档案馆时光机入口）。
  - 暴露 `NavApp.Amber.sealSite(siteId, customSnapshot)` 与 `NavApp.Amber.openRubbing(siteId)` 供测试与命令 `/amber` 调用。

### 3. [A6 & C5]「飞鸽传书 · 跨端入馆通道与 Notion 典藏同步桥」（`js/courier.js`）

- **入口**：通过命令 `/ingest`、`/notion` 或待编目匣顶部的 **`[ 🕊️ 飞鸽传书 / 盖章小书签 ]`** 按钮打开「飞鸽传书与 Notion 同步台（`#courier-modal`）」。
- **C5 浏览器「加盖藏书票」Bookmarklet 生成器与 URL 接收器**：
  - **URL 参数自动接收入馆**：当页面 URL 带有 `?ingest=1&url=...&title=...&why=...` 参数打开时，`courier.js` 自动拦截并唤醒「盖章入馆确认匣」，一键存入「待编目匣」或「正式馆藏」，随后使用 `history.replaceState` 清理地址栏参数。
  - **Bookmarklet 拖拽台**：在弹窗中提供一枚可拖拽至浏览器书签栏的黄铜印章按钮 **`[ ✦ 盖章入馆 · EX LIBRIS ]`**（内含自动提取当前浏览网页 `location.href`、`document.title` 与 `window.getSelection()` 选中文本并跳回本馆 `?ingest=1` 的 `javascript:(function(){...})()` 脚本）及一键复制小书签代码按钮。
- **A6 Notion 数据库无头同步桥**：
  - 提供符合 Notion Database 结构的 **CSV / JSON 双向导入导出器**（字段严格对齐：`Title, URL, Category, Description, CallNumber, Status, WhySaved, Tags, Notes`），并支持配置可选的 Cloudflare Worker Notion 同步端点（离线时走本地文件/剪贴板零损耗同步）。

### 4. [D7]「馆际互借 · 联邦星图寻星镜」（`js/federation.js` + 根目录 `public-collection.json`）

- **生成标准公开馆藏清单（`public-collection.json`）**：
  - 在项目根目录生成一份标准的 `public-collection.json`（包含馆名、卷号、恒星时签名，以及全部 36 张 `visibility: "public"` 的公开馆藏卡片，**严禁包含任何 `shadow` 暗月私密卡片**），同时提供 `NavApp.Federation.buildPublicManifest()` 动态生成接口。
- **「邻近星系 · 寻星镜」面板（Telescope Drawer/Modal）**：
  - 通过命令 `/telescope`、`/federation` 或顶栏/页脚 **`[ 🔭 寻星镜 · 馆际互借 ]`** 按钮唤起。
  - 预设 2 个邻近星系联邦节点（如 `星系 α · 极客工坊典藏`、`星系 β · 数字人文与古籍馆`，内置确定性沙盒数据并支持拉取外部 `/public-collection.json` 地址）。
  - 浏览友馆藏书时，点击任意卡片旁的 **`[ ✦ 拓印入馆 ]`**，即可一键将该工具抄入自己的「待编目匣」（自动标记来源如 `拓印自：星系 α`），实现跨馆珍本互借！

---

## 四、验收要求（原文）

1. 更新 `TODO.md`（将 Phase 4B 的 C2、D5、A6、C5、D7 全部打勾 `[x]`，宣告 22 项提案 100% 全部达成！）、更新 `ARCHITECTURE_2.0.md`，保存 `docs/prompts/STEP4B_PROMPT.md` 与 `CHANGELOG_PHASE4B.md`。
2. 编写并运行 `artifacts/visual-qa/phase04b/acceptance.js` 与 `shots.js`：
   - **第一道守卫**：继续执行 `assertHeadedBoot()`（真实有头模式启动，36 张卡片渲染、0 报错、0 溢出）。
   - **全量回归**：Phase 1 ~ Phase 4A 全部核心指标 100% 通过。
   - **C2 观星晨报验证**：按 `M` 键（或 `/morning`）打开《观星台晨报》，断言双栏铅字简报渲染正常；点击第一条简报的 `[ ✦ 收入待编目匣 ]`，断言待编目匣卡片数 `+1` 且包含该简报的收录动机。
   - **D5 网页琥珀验证**：调用 `NavApp.Telemetry.probeAll({ mock: true })` 后，断言处于 `.is-offline` 的卡片浮现 `[ 📜 调阅拓片 ]` 琥珀徽章；点击该徽章打开 `#amber-modal` 琥珀拓片阅览室，断言快照摘要与 Wayback 链接正常显示且未触发死链外跳。
   - **A6 & C5 飞鸽传书验证**：测试通过 `?ingest=1&url=https%3A%2F%2Fexample.com&title=IngestTest&why=BookmarkletTest` 参数访问（或调用 `NavApp.Courier.ingestFromParams()`）能成功捕获并入库；验证 Bookmarklet 脚本包含 `ingest=1` 且 Notion CSV/JSON 导出字段完整。
   - **D7 联邦星图验证**：验证根目录 `public-collection.json` 存在、合法且包含 36 张公开卡、**0 张 `shadow` 私密卡**；打开「寻星镜」面板切换邻近星系，点击 `[ ✦ 拓印入馆 ]` 断言成功抄入待编目匣。
3. 产出 `artifacts/visual-qa/phase04b/acceptance-report.json` 与高清验收截图集。

---

## 五、执行记录

### 落地顺序

1. 检阅 `CHANGELOG_PHASE4A.md`、`TODO.md`、`index.html` 尾部、`app.js` 的 `safeInit` 与 `NavApp` 暴露、`js/ledger.js` 的 `normalizeLedger`、`js/uncatalogued.js` 的 `addSite` 契约、`js/telemetry.js` 的探针注入与 `probeAll`、`js/shortcuts.js` 的 `isAnyModalOpen`、`js/commands.js` 的命令注册表。
2. 新建 `js/ephemeris.js` / `js/amber.js` / `js/courier.js` / `js/federation.js`（四个 UMD 工厂，零依赖）。
3. `js/ledger.js`：新增 `amberVault` 字段 + `getAmberVault` / `setAmberRubbing` / `removeAmberRubbing`。
4. `index.html`：四个浮层骨架 + 顶栏三入口 + 移动端三入口 + 待编目匣飞鸽入口 + 脚本标签 + 版本戳升至 `4.1.0`。
5. `styles.css`：追加 4B.1 ~ 4B.6 六节样式（约 1700 行）。
6. `app.js`：`safeInit` ×4 + `NavApp` 暴露 ×4。
7. `js/commands.js`：七个新命令。
8. `js/telemetry.js`：`probeAll` / `resetProbes` 后广播 `mynav-probe-updated`。
9. `js/shortcuts.js`：`isAnyModalOpen` 纳入四个新浮层。
10. `scripts/build-public-collection.js` → 生成根目录 `public-collection.json`（36 卷 / 0 暗月）。
11. 写 `acceptance.js` + `shots.js`，逐轮修复缺陷至全绿。

### 执行期发现并修复的缺陷

详见 `CHANGELOG_PHASE4B.md` 第十节，共 9 项。最关键的三个：

- `#amber-body` 缺 id → 碑拓阅览室静默空白
- `customSnapshot.summary` 未传入快照正文
- 离线判定被自身镜像污染 → 徽章无法收起

### 最终结果

```
acceptance.js  exit 0   errors: []
shots.js       exit 0   21 张 DPR2 截图
5 断点（1440/899/768/390/375）零横向溢出，四个浮层全部 0 溢出且留在视口内
public-collection.json: total=36, shadow=0, uniqueIds=36, uniqueCallNumbers=36
```

---

## 六、复现方式

```bash
# 1. 启动静态服务
python -m http.server 8080

# 2. 重新生成公开馆藏清单（改动 data.js 后需要）
node scripts/build-public-collection.js

# 3. 全量验收（含有头守卫，约 3~4 分钟）
node artifacts/visual-qa/phase04b/acceptance.js

# 4. 高清截图（21 张 DPR2）
node artifacts/visual-qa/phase04b/shots.js
```
