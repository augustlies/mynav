# 个人数字收藏馆 · The Digital Archive

> 兼具独立杂志、私人图书馆与数字档案气质的个人专属网址典藏馆。  
> 纯原生无构建，100% 静态部署，数据与视图完全解耦。

---

## 🏛 核心特性

- **杂志排印美学**：暖象牙白（`#F6F4EE`）纸张底色与深沉墨黑字色，搭配衬线刊头排版与极细纸张纤维分隔线。
- **炭黑双色模式**：支持炭黑书封主题（`#171815`），文字柔和不刺眼，自适应系统时序或一键切换并本地持久化。
- **古籍对开卷骨架**：桌面端 290px 固定书脊目录 + 右侧档案画布，移动端坍缩为单列吸顶横向刻度；卡片刻度分为镇馆主卷、标准典藏与窄幅索书签。
- **3D 藏书馆书架**：支持期刊网格与 3D 立体书架双视图无缝切换，拟真书脊立体透视与抽书动效。
- **右键编辑与导出**：支持卡片右键/移动端长按快速编辑、专栏迁移、隐藏与删除；支持一键导出规范 `data.js` 与全量 JSON 备份。
- **星盘检字法**：普通输入实时过滤馆藏，`/` 或 `>` 展开 `/theme`、`/random`、`/export`、`/clear-dust` 命令面板；`Shift+Enter` 保留馆内筛选并调用当前外网引擎。
- **索书号与今日开卷**：非输入态 450ms 内连按两位编号（如 `01`）即可盲打开卷；`R` 从非置顶深层馆藏随机抽卡。
- **活体借阅账本**：点击卡片、索书号或今日开卷均静默记入 `MYNAV_LEDGER_V2`；近 7 天 Top 6 自动晋升常驻案头，超过 60 天未访问显示尘封。
- **藏书票背光批注（A3）**：点击卡面 `№ XX` 印鉴或 `Alt+点击` 展开背面，随手写馆主批注、管理最多 4 条快捷子路由，并查看累计调阅与末次日期；子路由通过 `NavApp.openSite()` 统一记账。
- **待编目匣 · 暗星带（B1-B4）**：按 `U`、点击左栏入口或输入 `/uncatalogued` 从右侧拉开 420px 抽屉；用 `TMP-XX`、虚线框和 `whySaved` 记录候选书卷，支持搜索穿透、一键授予藏书票、90 天封存沙漏及随机开卷提醒。
- **活字秘卷匣（C1）**：按 `S` 或输入 `/snippets` 管理 Prompt、脚本与配置模版；点击即复制正文，并在原地展开 DeepSeek / ChatGPT / Gemini / Claude 携卷菜单。
- **星群连珠与群星会诊（C3）**：右栏星群预设可悬停高亮关联卡片并一键并发开卷；搜索框新增 `✦ 群星会诊` 引擎，`Ctrl/Cmd+Shift+Enter` 可把关键词同时投射至 Google / GitHub / Bing。
- **双生结界（D2）**：输入 `/shadow` 往返暗月密室（暗紫黑底、冷银暗绯红与 2 张私密占位卷宗）；输入 `/focus` 展开考场封条，仅保留 AI、开发、知识与效率工具，并在左栏启动专注日晷。
- **私人典藏与案头**：无需登录，书签、借阅统计与自定义修改均保存在浏览器本地 `localStorage`，旧 `mynav_arch_visits` 数据会自动迁移。
- **尼尔机械纪元方块蛛网**：原生 Canvas 2D 满屏漂浮小方块与鼠标引力连线，支持右键菜单一键开关与无障碍防眩晕自适应。
- **可选尼尔工程底色**：右键菜单支持在浅色模式下切换 `#CFCAB5` 纸张底色与协调卡片体系，文字对比度严守 WCAG AA 规范。
- **零构建极简工程**：原生 HTML5 / CSS3 / ES6+ 原生 JavaScript，无构建与打包依赖，静态托管即开即用。

---

## 📁 目录结构

```text
MyNav/
├── index.html          # 主刊页面结构 (v2.0.0)
├── ARCHITECTURE_2.0.md # 2.0 数据模型、布局与分阶段架构
├── TODO.md             # 2.0 工程路线图与阶段验收项
├── styles.css          # 杂志设计系统、双色主题、尼尔底色与交互样式
├── data.js             # 默认馆藏数据源（分类与站点定义）
├── validate.js         # 数据格式与工程规范合规校验脚本
├── notion-sync.js      # Notion 馆藏 CMS 数据同步脚本
├── app.js              # 核心装配控制器与事件分发
├── js/                 # 模块化业务脚本 (UMD 规范)
│   ├── storage.js      # 本地持久化封装与自愈防崩机制
│   ├── schema.js       # Bookmark Schema v2 无损归一化
│   ├── ledger.js       # MYNAV_LEDGER_V2 状态中心与旧访问记录迁移
│   ├── overrides.js    # 用户修改层与数据导出引擎
│   ├── contextmenu.js  # 卡片与空白处右键菜单交互控制器
│   ├── particles-bg.js # 尼尔机械纪元方块蛛网背景粒子动效
│   ├── search.js       # 多维多词模糊检索引擎
│   ├── favorites.js    # 私人典藏管理
│   ├── visits.js       # 旧访问 API 兼容层（转发至 ledger.js）
│   ├── commands.js     # `/` 与 `>` 命令面板
│   ├── folio-keys.js   # 两位索书号与 R 随机开卷快捷键
│   ├── serendipity.js  # 今日开卷弹窗与旋转动效
│   ├── marginalia.js   # A3 藏书票翻转批注与子路由
│   ├── uncatalogued.js # B1-B4 待编目匣与 90 天封存
│   ├── snippets.js     # C1 活字秘卷与 AI 携卷跳转
│   ├── constellations.js # C3 星群连珠与群星会诊
│   ├── sanctum.js      # D2 暗月密室与考场结界
│   ├── bookshelf.js    # 3D 藏书馆立体书架
│   ├── sortable.js     # 拖拽排序与整理引擎
│   ├── theme.js        # 昼夜主题管理、时序检测与尼尔底色
│   ├── shortcuts.js    # 全局键盘漫游与无障碍
│   ├── exlibris.js     # 专属藏书票 (Ex Libris)
│   ├── lore.js         # 文化手记与印章
│   └── motion.js       # 微动效与光泽追踪
├── docs/
│   ├── FEATURE_IDEAS.md
│   └── prompts/
│       ├── STEP1_PROMPT.md
│       └── STEP2_PROMPT.md
├── icons/              # 本地高清图标库 (64x64 PNG)
├── functions/          # Cloudflare Pages Functions（云同步 API）
└── artifacts/          # 本地视觉验收产物（已忽略，不参与部署）
    └── visual-qa/      # 按日期归档的截图、布局快照与诊断数据
```

根目录只保留站点入口、核心数据、样式和构建工具；验证截图与布局 JSON 统一放入 `artifacts/`，不提交到版本库。

---

## 🚀 快速开始

### 本地预览
直接在项目根目录下运行轻量静态服务：
```bash
python -m http.server 8080
```
或直接在浏览器中打开 `index.html`。

### 数据校验
修改数据或导出后，随时运行校验脚本检查 ID 唯一性与合规性：
```bash
node validate.js
```

---

## 🖱️ 右键编辑与数据导出

支持纯静态在线书目管理与持久化固化，无需手写代码：

| 触发位置 | 支持操作 | 说明 |
| :--- | :--- | :--- |
| **卡片右键 / 长按 500ms** | 编辑卡片、移动分类、收藏、隐藏、删除、恢复默认 | 修改即时生效并保存在本机 `localStorage` |
| **空白处右键 / 页脚「导出」** | 新建卡片、显示已隐藏卡片、导出 `data.js`、备份导入导出、重置全部 | 导出 `data.js` 替换根目录文件即可永久固化 |

> 💡 **本地修改提示**：当本机有未导出的改动时，页脚会自动提示 *“有 N 处修改仅保存在本机，建议导出 data.js”*。

---

## ⌨️ 快捷键速查

| 快捷键 | 功能说明 |
| :---: | :--- |
| <kbd>/</kbd> | 快速聚焦检索框 |
| <kbd>/</kbd> 或 <kbd>&gt;</kbd>（输入框内） | 展开 `/theme`、`/random`、`/export`、`/clear-dust` 命令 |
| <kbd>Shift</kbd> + <kbd>Enter</kbd> | 馆内筛选保持不变，调用当前引擎搜索全网 |
| <kbd>Ctrl/Cmd</kbd> + <kbd>Shift</kbd> + <kbd>Enter</kbd> | 群星会诊：同一关键词并发投射 Google / GitHub / Bing |
| <kbd>01</kbd> ~ <kbd>36</kbd> | 非输入态 450ms 内连按两位索书号，直接开卷并记账 |
| <kbd>R</kbd> | 今日开卷：从非置顶深层馆藏随机抽一卷 |
| <kbd>U</kbd> | 拉开待编目匣 · 暗星带 |
| <kbd>S</kbd> | 打开活字秘卷匣 |
| <kbd>Alt</kbd> + 点击卡片 | 翻开藏书票批注面，不触发外链 |
| <kbd>Alt</kbd> + <kbd>1</kbd> ~ <kbd>7</kbd> | 直达分类专栏（裸数字留给索书号） |
| <kbd>Esc</kbd> | 清空检索 / 关闭当前弹窗或上下文菜单 |
| <kbd>j</kbd> / <kbd>k</kbd> | 在卡片列表间向前 / 向后移动光标聚焦 |
| <kbd>v</kbd> | 快速切换期刊网格 ⟷ 3D 藏书馆书架视图 |
| <kbd>t</kbd> | 循环切换主题（象牙白 / 炭黑 / 时序自适应） |
| <kbd>?</kbd> | 打开全站快捷键与交互指南画册 |

---

## 🧭 Phase 0 / Phase 1 / Phase 2

当前已落地 `TODO.md` 中的 Phase 0（双栏骨架、Schema 2.0、`MYNAV_LEDGER_V2`）、Phase 1（A1、A2、A4、A8）与 Phase 2（A3、B1-B4、C1、C3、D2）。

数据流保持原生静态：`data.js` + 本地修改层 → `NavSchema` 归一化 → `NavLedger` 动态状态 → `app.js` 渲染。旧的 `mynav_arch_visits` 会在首次加载时无损并入新账本，原有收藏、CRUD、排序、主题、星轨、`***REMOVED***` 隐藏口令与 `NavApp.openSite()` 统一记账均保留。

### Phase 2 命令与结界

| 命令 / 操作 | 行为 |
| :--- | :--- |
| `/uncatalogued` | 打开待编目匣抽屉；候选卡片不进入主画布，支持搜索底部穿透 |
| `/snippets` | 打开活字秘卷匣 |
| `/shadow` | 切换暗月密室；再输一次返回表世界 |
| `/focus` | 切换考场结界；非核心分类显示司天监封条与专注计时器 |
| `U` / `S` | 非输入态快捷键打开待编目匣 / 活字秘卷匣 |
| `Alt` + 点击卡片 | 翻转批注面；`№ XX` 印章也可单独触发 |

暗月卷宗只展示 `visibility: "shadow"` 的卡片；新建或编辑卡片时可在右键编辑层勾选「仅暗月密室可见」或「暂存待编目匣」。尘封以本地自然日计算，未访问卡片使用持久化的 `firstSeenAt` 作为 60 天判定锚点。

---

## ☁️ 部署指南 (Cloudflare Pages)

1. 推送代码至 GitHub 仓库。
2. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/) -> **Workers & Pages** -> **Create application** -> **Pages** -> 连接 GitHub 仓库。
3. **构建配置**：
   - **Framework preset**：`None`
   - **Build command**：留空
   - **Build output directory**：`/`
4. 点击 **Save and Deploy**，十几秒后即可完成全球 CDN 部署并支持绑定独立域名。

---

## 📜 许可证

本项目采用 [MIT](LICENSE) 许可证。
