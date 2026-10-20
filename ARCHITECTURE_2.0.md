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
  snapshotUrl: "",        // D5 网页琥珀离线拓片备份地址
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
| `?` | D1 守馆人 RAG | 调用 AI 检索全馆藏书并推荐工具，以古籍批注条流式输出 | Phase 4 |
| `!` | D1 守馆人轻执行 | 原地羊皮纸浮层流式输出结果，回车复制 | Phase 4 |

**命令清单**（按阶段逐步加入）：
- Phase 1：`/theme`（切换观星台 / 日晷）、`/random`（今日开卷）、`/export`（导出全馆 JSON + 借阅账本）、`/clear-dust`（重置蒙尘状态）
- Phase 2：`/uncatalogued`（打开待编目匣）、`/snippets`（活字秘卷匣）、`/shadow`（暗月密室）、`/focus`（考场结界）
- Phase 3A：`/sound`（白噪音天文台开关）、`/tools`（黄铜工具尺）
- Phase 3B：`/graph`（展开穹顶引力星图）
- 后续：`/sync`（云端同步，Phase 4）

## 5. 全局快捷键（仅在焦点不在 input / textarea 时生效）

| 键 | 功能 | 阶段 |
|---|---|---|
| 两位数字（450ms 内） | A2 索书号直达 | Phase 1 |
| `R` | A8 今日开卷 | Phase 1 |
| `U` | B 待编目匣 | Phase 2 |
| `S` | C1 活字秘卷匣 | Phase 2 |
| `T` | D3 黄铜工具尺（非输入态） | Phase 3A |
| `G` | C6 书本目录 / 穹顶星图切换（非输入态） | Phase 3B |
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
