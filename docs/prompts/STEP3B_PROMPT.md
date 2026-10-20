# mynav 2.0 · Phase 3B 执行指令

> 本文件保存 Phase 3B（D4 星轨编年史月相热力图 + C6 穹顶引力关系星图）的原始实施要求，作为后续 Phase 4 与回归验收的上下文锚点。

## Role & Context

你是一位严谨的高级前端架构师。当前项目为个人数字收藏馆（EX LIBRIS 风格的 mynav）。
项目已圆满完成 Phase 0、Phase 1、Phase 2 与 Phase 3A（天文日晷 `js/astronomy.js`、Web Audio 白噪音 `js/soundscape.js`、黄铜工具尺 `js/brass-tools.js`），所有测试在 `artifacts/visual-qa/phase03a/acceptance.js` 中均已 100% 通过。

现在请在不破坏任何既有功能的前提下，专注执行 **Phase 3B（时空可视化双雄：D4 星轨编年史月相热力图 + C6 穹顶引力关系星图）**，同步更新 `TODO.md` 并将本指令保存至 `docs/prompts/STEP3B_PROMPT.md`。

---

## 🚨 零容忍红线
1. **全量回归 100% 绿灯**：隐藏口令 `***REMOVED***`、全局唯一索书号（`uniqueCallNumbers === 36`）、待编目匣、活字秘卷、暗月结界、考场封条、天文日晷、白噪音与黄铜工具尺，以及 5 个断点零横向溢出绝不可退化！
2. **Canvas 算力守恒**：穹顶引力星图（C6）的 `requestAnimationFrame` 循环**仅在星图视图激活时运行**；一旦切回「书本目录」视图或页面隐藏，必须立即停止动画循环，保证零后台 CPU 占用。

---

## 🛠️ Phase 3B 具体实现清单（新建 2 个核心可视化模块）

### 1. [D4] 「星轨编年史 · 数字足迹热力图与时光回溯滑块」（`js/almanac.js`）
- **数据记账闭环**：
  - 在 `js/ledger.js` 的 `NavApp.openSite(siteId)` 触发时，同步更新 `MYNAV_LEDGER_V2.almanac[YYYY-MM-DD]`（记录当日总调阅次数 `count` 及涉及的站点 ID 列表 `sites: []`）。
  - 提供 `NavApp.Almanac.seedMockHistory()` 测试辅助方法，支持在验收测试时注入过去 28 天的模拟活跃数据。
- **UI 形态与位置**：
  - 在右栏主画布底部（所有分类章节下方，或通过右栏顶部的 `[ 🗓️ 星轨编年 ]` 按钮快速滚动/展开）构建一个古典仪器风格的 **「星轨编年史面板（`.almanac-chronicle`）」**。
- **古典月相星历格（28-Day Lunar Grid）**：
  - 展示最近 **28 天** 的观测矩阵（每天一格，带日期简写与星期提示）。
  - **视觉分级（拒绝现代绿方块）**：根据当日调阅次数 `count` 渲染不同盈亏与亮度的 **内联 SVG 月相/星芒图形**：
    - `0 次`：微弱暗星点（`opacity: 0.25`）
    - `1 ~ 2 次`：蛾眉月 SVG（`🌒` 细铜线弧）
    - `3 ~ 5 次`：上弦月 SVG（`🌓` 半满黄铜色）
    - `6+ 次`：满月辉光 SVG（`🌕` 实心黄铜圆盘 + 外圈星芒刻度）
  - **交互**：Hover 或点击某一天时，底部浮现古籍批注式摘要：`[ YYYY.MM.DD · 调阅 X 卷 · 核心轨迹：DeepSeek, GitHub... ]`，并高亮当天访问过的卡片。
- **日晷时光回溯滑块（Time-Lapse Filter）**：
  - 在编年史面板右侧（及右栏搜索条下方状态栏）提供 4 档时间窗口拨片/滑块：
    - `✦ 全部纪元 (All)`（默认）
    - `🌒 近 7 日活跃 (7D)`
    - `🌓 近 30 日轨迹 (30D)`
    - `⌛ 尘封往昔 (>60D 未访)`
  - 切换时间窗口时，主画布（及穹顶星图）中符合该时间段活跃条件的卡片保持清晰高亮，其余卡片平滑降低透明度至 `0.25`（`.is-time-dimmed`），直观呈现个人技术栈与兴趣重心随时间的迁移。

### 2. [C6] 「穹顶星图 · Knowledge Graph」：2D 引力关系星图视图（`js/star-map.js`）
- **视图切换拨片**：
  - 在右栏顶部索书条右侧（或眉批导航栏）新增视图切换器：**`[ 📖 书本目录 | 🌌 穹顶星图 ]`**（非输入态快捷键 `G` 或命令 `/graph`）。
- **画布与布局架构**：
  - 切换到「🌌 穹顶星图」时，平滑隐藏 `.cards-asymmetric-grid` 列表，原地展开 `.star-map-container`（含高分屏 `devicePixelRatio` 适配的 Canvas 画布，桌面端高度 `min-height: 640px`，移动端 `min-height: 480px`，支持暗月模式与浅色日晷模式双套配色）。
  - 画布左上角展示图例与统计铭文：`[ 恒星分类: 5 · 入轨藏品: 36 · 共振星链: XX ]`，右上角提供 `[ ⌖ 归位重置 ]` 与分类筛选小按钮。
- **双层星体节点与阻尼弹簧算法（Radial Force-Directed Graph）**：
  - **恒星节点（5 个主分类 Category Hubs）**：以画布中心为原点，按五边形星轨均匀分布，绘制双环黄铜/青铜同心圆与分类名称。
  - **行星节点（36+ 张正式馆藏卡片，暗月模式下额外包含 shadow 卡片）**：
    - 围绕各自所属的分类恒星分布，节点半径 `r` 根据该卡片在 `ledger.js` 中的访问热度动态映射（`5px ~ 11px`），旁侧绘制精简版 `№ XX 标题`。
  - **双层连线系统**：
    1. **主星从属轨（实线）**：行星与所属分类恒星之间的细线（`1px` 半透明黄铜线）。
    2. **跨界 `#tag` 与「星群连珠」共振链（虚线）**：若两张不同分类的卡片共享核心标签（或同属一个 `constellations.js` 预设星群），在它们之间绘制微弱的黄金/朱砂细虚线。
- **丝滑物理交互**：
  - **拖拽牵引（Drag & Spring）**：鼠标/触摸按住任意一颗星体拖拽时，节点跟随指针移动，相连节点通过胡克定律弹簧力产生平滑牵引；松手后带阻尼系数（`damping = 0.85`）平稳收敛静止，绝不鬼畜乱抖。
  - **Hover 聚焦（Constellation Spotlight）**：鼠标悬停在某颗行星或恒星上时，高亮该节点及其一阶相连的所有星体与连线，其余无关节点压暗；画布角落浮现该卡片的**微型藏书票预览卡**（含标题、索书号、简介、标签与 `[ 立即调阅 ↗ ]` 按钮）。
  - **点击与双击调阅**：单击节点锁定预览卡；双击节点（或点击预览卡上的 `[ 立即调阅 ↗ ]`）直接调用 `NavApp.openSite(siteId)` 打开目标网站并记账！

---

## ✅ 验收与自动化测试要求（Playwright & Node）
1. 更新 `TODO.md`，将 Phase 3B 的 D4 与 C6 打勾 `[x]`（至此 Phase 0 ~ Phase 3 全部完成！）。
2. 编写并运行 `artifacts/visual-qa/phase03b/acceptance.js` 与 `shots.js`：
   - **全量回归**：确保 Phase 1 / Phase 2 / Phase 3A 核心断言（`***REMOVED***` 口令、`uniqueCallNumbers === 36`、待编目匣、活字秘卷、暗月/考场模式、恒星时、白噪音、黄铜工具尺、5 断点零横向溢出）100% 通过。
   - **D4 编年史验证**：
     - 断言 `.almanac-chronicle` 包含 28 个日期月相格（内含 SVG）。
     - 调用 `NavApp.openSite()` 后，断言今日格子的调阅计数增加且月相等级更新。
     - 切换时光回溯滑块（`7D` / `30D` / `>60D` / `All`），断言卡片列表的 `.is-time-dimmed` 过滤数量随之正确变化，切回 `All` 后恢复全部清晰。
   - **C6 穹顶星图验证**：
     - 点击 `[ 🌌 穹顶星图 ]`（或按 `G` 键），断言星图容器可见、Canvas 宽高 `> 0`。
     - 通过 `NavApp.StarMap.getGraphStats()` 接口断言：恒星分类节点数 `=== 5`（或当前分类数）、行星卡片节点数 `=== 36`（暗月模式下为 `38`）、跨分类共振连线数 `> 0`。
     - 测试通过 `NavApp.StarMap.selectNode('ai-hark')`（或模拟点击节点）能弹出预览卡并成功触发 `NavApp.openSite()` 打开站点。
     - 切回 `[ 📖 书本目录 ]` 后，断言星图动画循环已停止（`NavApp.StarMap.isRunning() === false`），且原三级密度卡片网格 100% 完好恢复。
3. 生成 `artifacts/visual-qa/phase03b/acceptance-report.json` 与截图集（必须包含星图视图在深色观星台、浅色日晷模式下的高清截图，以及月相编年史面板截图）。

---

## 📦 本次交付结果

- **实现文件**：`js/almanac.js`（D4）、`js/star-map.js`（C6）、`js/ledger.js`（`almanac` 记账闭环与 `seedAlmanacHistory`）、`app.js`（视图切换与 `G` / `/graph`）、`styles.css`、`ARCHITECTURE_2.0.md`、`index.html`。
- **验收产物**：
  - `artifacts/visual-qa/phase03b/acceptance.js` → `acceptance-report.json`（全量回归 + D4 + C6 + 响应式 + 命令，`errors: []`）
  - `artifacts/visual-qa/phase03b/shots.js` → `shots-report.json` + `phase03b-star-map-dark.png` / `phase03b-star-map-light.png` / `phase03b-almanac.png` / `phase03b-star-map-mobile.png`（均为 `deviceScaleFactor: 2`）
- **关键回归数据**：`cards=36`、`uniqueCallNumbers=36`、`overflow=0`（1440 / 899 / 768 / 390 / 375）；星图 `hubCount=5`、`planetCount=36`（暗月 `38`）、`resonanceCount=12`；时间窗口压暗数 `7D=33`、`30D=32`、`>60D=4`、`All=0`；切回目录后 `StarMap.isRunning() === false`。

