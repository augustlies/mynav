# Task: mynav 2.0 第二阶段工程（Phase 2：策展深度、待编目匣、活字秘卷与双生结界）

请在现有 Phase 0 / Phase 1 基座上实现 `TODO.md` 的 Phase 2 五个模块：**A3、B1-B4、C1、C3、D2**。开工前完整阅读：

- `TODO.md`
- `ARCHITECTURE_2.0.md`
- `docs/FEATURE_IDEAS.md` 中 A3、B、C1、C3、D2 的完整段落
- 现有 `js/schema.js`、`js/ledger.js`、`js/commands.js`、`app.js`、`index.html`、`styles.css`

本阶段以“模块化 JS + 原生静态站”为约束，不引入构建链与第三方运行时依赖。不得重写既有 CRUD、收藏、排序、主题、书架或检索核心；应以新增模块、集中渲染分支和事件委托的方式接入。

---

## 零容忍红线

1. **Phase 0 / Phase 1 全部回归通过**：`XXXXXXX` 隐藏口令、`NavApp.openSite()` 统一记账、36 张卡片索书号唯一、1440/899/768/390/375 各断点无横向溢出。
2. **口令顺序不可变**：搜索 Enter 路由必须先判 `XXXXXXX`，再判 `/shadow`、`/focus` 等 Phase 2 命令。任何新模块不得在捕获阶段抢先吞掉隐藏口令。
3. **访问记账只有一个入口**：卡片、子路由、待编目链接、秘卷 AI 携卷、星群预设和随机开卷都必须经 `NavApp.openSite()`；不得在业务模块里平行维护第二套访问计数。
4. **正式/候选分流不可泄漏**：`getRawSites()` 只返回 `status === "catalogued"` 且 `visibility !== "shadow"` 的条目；待编目候选绝不混入默认「全部藏目」流。
5. **移动端无横向溢出**：抽屉 `<=640px` 使用 `100vw`，桌面保持 `420px`；任何新增浮层、星座扣、工具按钮都不能撑破视口。
6. **尘封判定补强**：在 `js/ledger.js` 为无访问记录的卡片持久化 `firstSeenAt`；使用 `(lastVisited || firstSeenAt)` 与当前时间比较，严格超过 **60 个自然日**才标记 `.card--dusty`。只初始化首见时间，不得伪造访问次数。

---

## 实现清单

### 1. [A3] 藏书票背光 / 批注面（`js/marginalia.js`）

- 点击卡片右下角 `藏书票 № XX` / `№ XX` 印鉴，或 `Alt+点击` 卡片，切换 `.is-flipped`，阻止外链跳转。
- 点击卡片正文、标题 stretched link、跳转箭头仍走 `NavApp.openSite()`；翻转层打开时不得触发外链。
- 背面结构：
  - `馆主批注`：账本 `marginalia[itemId]`，支持铅笔按钮与双击原地编辑，保存进 `MYNAV_LEDGER_V2`。
  - `快捷子路由`：最多 4 个胶囊 `{ label, url }`，点击走 `NavApp.openSite(itemId, subUrl, "sublink")`；DeepSeek 开放平台预置 API Keys / Usage 账单 / Docs。
  - `借阅印记`：`累计调阅 X 次 · 末次 YYYY.MM.DD`，无记录时显示尚未开卷。
- 编辑、取消、保存、关闭与 `Esc` 均需可键盘触达；背面面板需有 `aria-hidden` 状态同步。

### 2. [B1-B4] 待编目匣 · 暗星带（`js/uncatalogued.js`）

- 入口：左栏底部 `[ ⌘ 待编目匣 ]`、非输入态 `U`、命令 `/uncatalogued`。
- 右侧抽屉 `.uncatalogued-drawer`：桌面 `420px`，`<=640px` `100vw`，半透明古籍面板；遮罩点击 / `Esc` / 关闭按钮可退出。
- 顶部新增表单至少包含 URL、网站名称、必填 `whySaved`；提交后写入 overrides 层，`status: "uncatalogued"`，并初始化 `firstSeenAt`。
- 视觉：`1px dashed` 框、紧凑窄签、`TMP-01` 草稿编号、`[ 留卷待查 ]` 线框章、斜体 `收录动机`。
- 搜索穿透：主搜索命中待编目标题 / URL / whySaved 时，在主结果最底部追加 `⏳ 来自待编目匣的潜在匹配`，点击可打开抽屉并定位该卡。
- 一键加冕：`[ ✦ 授予藏书票 ]` 选择目标分类，改为 `catalogued`，回到主画布并分配唯一正式索书号。
- 90 天封存：`createdAt` 超 90 天且从未访问，显示 `⌛ 已封存三月`；随机开卷有 25% 概率优先抽取，并询问 `[ 正式入馆 ]` / `[ 销毁归档 ]`。测试钩子 `window.__MYNAV_FORCE_SEALED_RANDOM__ = true` 可强制该分支。

### 3. [C1] 活字秘卷匣（`js/snippets.js`）

- 入口：右栏顶部索书条右侧和 / 或左栏书脊 `[ 📜 活字秘卷 ]`；快捷键 `S`；命令 `/snippets`。
- 账本字段 `MYNAV_LEDGER_V2.snippets`；预置 3-4 条：架构重构 System Prompt、Linux 端口转发与探针脚本、中英学术润色指令、代码审查 Checklist。
- 用户可新增、编辑、删除秘卷；保存后即时更新列表。
- 点击秘卷：
  - 立即 `navigator.clipboard.writeText(content)`，失败时回退到 `textarea + execCommand`。
  - 原地展开 `[ 已复制！携卷前往：DeepSeek ↗ | ChatGPT ↗ | Gemini ↗ | Claude ↗ ]`。
  - 点击 AI 按钮经 `NavApp.openSite()` 打开并记账。

### 4. [C3] 星群连珠与群星会诊（`js/constellations.js`）

- 右栏搜索条下方提供克制的星群扣：默认 `科研星群`、`创作与AI`、`基建运维`，用户可新增绑定 2-4 个馆内站点 ID。
- Hover 星群扣时对应卡片加 `.constellation-highlight` 黄铜光晕；点击并发调用 `NavApp.openSite()`。
- 注意：`window.open(..., "noopener,noreferrer")` 常返回 `null`，不得用返回值判断是否被拦截；按已发起 URL 计入状态提示，若确实无法发起则提示用户允许弹窗。
- 搜索引擎选择器新增 `✦ 群星会诊`；`Ctrl/Cmd+Shift+Enter` 同样触发。将当前搜索词同时投射至 Google、GitHub、Bing（或等价 2-3 个引擎），不得与普通 `Shift+Enter` 单引擎分支重复执行。

### 5. [D2] 双生结界（`js/sanctum.js`）

- `/shadow` / 自定义暗语切换暗月密室，但必须完全保留 `XXXXXXX` 跳转。
- 激活：`<html data-sanctum="shadow">`，背景 `#07060E`，点缀冷银与 `#9E3B42`，星盘逆时针 `180deg`，左上馆名变为 `EX LIBRIS · 暗月卷宗`。
- 仅展示 `visibility: "shadow"` 私密卡片；默认预置 2 张 `example.com` 占位卷宗供验收。新建/编辑卡片需支持勾选 `仅暗月密室可见`。
- 再输一次 `/shadow` 返回表世界；`Esc` 也可退出暗月阅读态，不得影响原有隐藏口令。
- `/focus` 或顶栏开关切换 `[data-focus-lock="true"]`；`social` 等非核心生产力分类覆盖 `[ 司天监封条 · 沉浸研习中 ]`，封条外区域不可点击，点击封条可解除；左栏底部显示专注计时器。

---

## 数据与状态约定

`normalizeItemSchema(item, index)` 保留原有字段并补齐：

```javascript
{
  status: "catalogued",   // catalogued | uncatalogued
  whySaved: "",
  notes: "",
  subLinks: [],           // 最多 4 个 { label, url }
  visibility: "public",   // public | shadow
  snapshotUrl: "",
  telemetry: null,
  callNumber: "01",
  createdAt: 0,
  firstSeenAt: 0
}
```

`MYNAV_LEDGER_V2` 统一保存：

```javascript
{
  accessLog: {},
  marginalia: {},
  snippets: [],
  constellations: [],
  almanac: {},
  modeState: { shadowMoon: false, focusLock: false, ambientSound: false },
  firstSeenAt: {},
  dustResetAt: 0,
  migratedLegacyVisitsAt: 0
}
```

约束：

- `firstSeenAt` 每个站点只写入一次；渲染不得增加 `accessLog.count`。
- `accessLog` 与 `firstSeenAt` 必须一起通过公开 API 读写，不允许业务模块直接摸 `localStorage` 的这个 key。
- 迁移旧 `mynav_arch_visits` 后删除旧 key，留下 `migratedLegacyVisitsAt` 一次性标记。

---

## 验收与自动化

完成后扩展 Playwright 脚本（Node + `playwright-core`）：

1. 点击 `藏书票 № 01` / `.card-monograph-number` 后卡片 `.is-flipped`，无 `popup`；点击 DeepSeek 子路由打开 `https://platform.deepseek.com/api_keys`，站点 key 为 `ai-deepseek-platform`。
2. `U` 打开抽屉，新增 `TMP-01`（含 `whySaved`）；主画布仍为 36 张；搜索 `whySaved` 关键词出现潜在匹配区块；点击 `授予藏书票`（mock `prompt("1")`）后清空搜索，主画布 37 张且正式索书号无重复。
3. 点击秘卷复制内容（mock `clipboard.writeText`）并显示 DeepSeek / ChatGPT / Gemini / Claude 菜单；点击 AI 按钮经 `NavApp.openSite()` 发起 URL。
4. `/shadow` 往返切换：`data-sanctum`、馆名与恰好 2 张 shadow 卡片正确；`/focus` 往返切换：`data-focus-lock`、5 张社交封条与计时器正确。
5. `XXXXXXX` 仍打开 `http://203.0.113.10:8008/#/`。
6. 1440px 与 390px 均为横向溢出 0；桌面抽屉 420px、移动抽屉 100vw。
7. 尘封：只写 `ledger.firstSeenAt["ai-claude"] = 61 天前`、清空该站点 access entry、`dustResetAt = 0`，重载后 `.card--dusty` 存在。
8. 可选用 `window.__MYNAV_FORCE_SEALED_RANDOM__ = true` 验证 90 天封存随机分支。

最终运行顺序：

```powershell
node validate.js
node artifacts/visual-qa/phase02/smoke.js
node artifacts/visual-qa/phase02/acceptance.js
node artifacts/visual-qa/phase02/shots.js
node artifacts/visual-qa/phase01/run_acceptance.js
```

## 交付物

- 更新 `TODO.md`，将 Phase 2 的 A3、B1-B4、C1、C3、D2 全部改为 `[x]`。
- 同步更新 `README.md` 与 `ARCHITECTURE_2.0.md` 的模块、命令、快捷键、抽屉尺寸、60/90 天规则。
- 写入本文件 `docs/prompts/STEP2_PROMPT.md`。
- 生成 `artifacts/visual-qa/phase02/acceptance-report.json` 与 8 张验收截图：
  `phase02-1440.png`、`phase02-marginalia.png`、`phase02-drawer.png`、`phase02-snippets.png`、`phase02-shadow.png`、`phase02-focus.png`、`phase02-390.png`、`phase02-390-drawer.png`。
