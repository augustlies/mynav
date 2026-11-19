# Notion 卡片管理说明

这份文档给人和智能体共用。目标：只改一个 Notion 数据库，就能让所有设备上的卡片新增、改名、换链接、换图标、改分类、隐藏、排序，不用改 `data.js`，不用重新部署。

## 数据流

```text
Notion 数据库
  → Cloudflare Pages Function /api/cards（服务端拉取、校验、写 KV）
  → 浏览器空闲时 GET /api/cards
  → 本机 localStorage 缓存（mynav_cards_cache_v1）
  → 叠加到 data.js → 站内 overrides 按字段覆盖 → 个人拖拽排序
```

浏览器不会直接请求 Notion。国内网络只请求同域的 `/api/cards`，首屏始终先用本地缓存，不等接口。

## Notion 数据库字段

新建一个普通数据库，字段名和类型严格如下（大小写敏感）：

| 字段名 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `CardID` | Title（标题） | 是 | 稳定卡片 ID，对应 `data.js` 里的 `id`。只用小写字母、数字、`-`、`_`、`.`，例如 `ai-chatgpt` |
| `Name` | Text（文本） | 是 | 卡片显示名称 |
| `URL` | URL | 是 | 必须是 `http://` 或 `https://` |
| `Category` | Select（单选） | 是 | 只能是 `ai`、`dev`、`knowledge`、`tools`、`social` 五个值 |
| `Description` | Text（文本） | 否 | 卡片简介 |
| `Icon` | Text（文本） | 否 | 图标文字/字母，最多 8 个字符，例如 `AI`、`GH` |
| `Tags` | Text（文本） | 否 | 逗号分隔，例如 `AI, 写作, 免费` |
| `Sort` | Number（数字） | 否 | 同分类内升序；越小越靠前。不填按 Notion 返回顺序 |
| `Hidden` | Checkbox（复选框） | 否 | 勾选 = 在网站隐藏 |

`Category` 的五个选项必须手动建好。新增分类不在本项目支持范围内：页面分类底稿仍由 `data.js` 决定。

## 第一次配置（人工）

1. 在 Notion 里新建数据库，按上表建好 9 个字段。
2. 在 Notion 开发者页面创建 Internal Integration，能力至少包含读取内容。
3. 把这个数据库共享给该 Integration：数据库右上角 `···` → Connections / 连接 → 添加集成。
4. 复制 Integration Token（`ntn_...`）和数据库 ID（数据库链接里 32 位十六进制串）。
5. 在 Cloudflare Pages 项目 `mynav` → Settings → Environment variables 添加：

| 变量名 | 类型 | 用途 |
| --- | --- | --- |
| `NOTION_TOKEN` | Secret | Notion Integration Token，只给服务端 |
| `NOTION_DB_ID` | Text | 卡片数据库 ID |
| `MYNAV_CARDS_REFRESH_TOKEN` | Secret | 刷新口令，自己生成一段随机字符串 |
| `MYNAV_KV` | KV binding | 已有绑定，卡片缓存复用 |

Production 和 Preview 要分别配置；Preview 目前没有 `MYNAV_KV` 绑定，配好前预览环境的 `/api/cards` 会返回 500。

任何密钥都不要写进仓库、Issue、PR 描述或前端代码。仓库是公开的。

## 导入现有 36 张卡片

脚本只读 `data.js`，不会修改它。默认是演练，不连接 Notion：

```powershell
node scripts/notion-import.js
```

确认输出无误后再写入：

```powershell
$env:NOTION_TOKEN="ntn_xxx"
$env:NOTION_DB_ID="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
node scripts/notion-import.js --apply
```

说明：

- 按 `CardID` 去重，已存在的卡片默认跳过，不会覆盖你在 Notion 里的手改。
- 需要强制刷新已有行时加 `--update`，会覆盖这 9 个字段。
- 只处理前 N 张可加 `--limit N`。
- 导入脚本按分类内的 `data.js` 顺序写入 `Sort`（从 1 开始）。

## 改完怎么立即生效

Notion 保存后不会自动推送到网站。调用一次刷新接口：

```powershell
curl.exe -X POST "https://go.sueexin.dev/api/cards" `
  -H "x-mynav-refresh-token: $env:MYNAV_CARDS_REFRESH_TOKEN"
```

成功返回：

```json
{ "ok": true, "version": "v1-xxxxxxxx", "count": 36, "skippedCount": 0 }
```

刷新接口只接受 `POST`，口令只放在请求头，不放 URL。智能体有该口令时也可以直接调用；没有口令时只能改 Notion，不能发布。

部署后先调用一次带刷新口令的 `POST /api/cards` 发布初始缓存。公开的 `GET /api/cards` 只读 KV，缓存尚未发布时返回 `404 {"empty":true}`，不会代替管理员抓取或发布 Notion 数据。

普通访客的浏览器会在页面加载后的空闲时间请求 `/api/cards?v=<当前版本>`。版本没变时服务端只回 `{"unchanged":true}`，不传全量数据；版本变了才替换本地缓存并重绘卡片。

已打开的标签页切回前台时会在 1 分钟后补查一次，后台保持打开时每 10 分钟查一次。因此刷新后：新打开页面立即拿到新版，已打开的页面最迟约 10 分钟内自动更新；不用清缓存，也不用重新部署。

## 冲突规则（谁说了算）

从低到高：

1. `data.js`：底稿和断网兜底，永远不被 Notion 或站内编辑改写。
2. Notion：全局覆盖层，按 `CardID` 覆盖名称、链接、简介、图标、标签、分类、隐藏、排序。
3. 站内 `overrides`：本机手动编辑按字段优先。例如本机只改过图标，则 Notion 改名称仍然生效，但图标保持本机值。
4. 个人拖拽顺序：`mynav_arch_order` 最后应用，优先于 Notion `Sort`。
5. 云同步：只负责收藏、点击统计、主题等个人数据，不参与卡片内容。

删除 Notion 里的一行，不会让卡片从网站消失，只会回退到 `data.js` 底稿。要让卡片消失，请勾选 `Hidden`。新增卡片直接新建一行，`CardID` 不能与已有卡重复。

## 失败与坏数据处理

- 单行缺 `CardID` / `Name` / 非法 URL / 未知分类：跳过该行，其余行照常发布。
- 整库 0 张有效卡：刷新返回 422，保留上一版，不清空网站。
- Notion 超时、401、429、500：刷新返回 502，保留上一版。
- 浏览器接口失败、断网、返回坏数据：继续用 `localStorage` 上一版；没有缓存则用 `data.js`。
- 首屏不等待 `/api/cards`，接口再慢也不影响打开。

## 智能体操作清单

改一张卡：

1. 在 Notion 数据库按 `CardID` 找到目标行。
2. 只改需要改的字段；`CardID` 不要改，它是关联 `data.js` 和本机覆盖层的唯一键。
3. 改 `Category` 只能从五个固定值里选。
4. 保存后调用 `POST /api/cards` 刷新。
5. 用 `GET /api/cards?v=<旧版本>` 确认版本变化，或直接打开网站确认。

新增一张卡：

1. 新建一行，填合法 `CardID`、`Name`、`URL`、`Category`。
2. `Sort` 填目标分类里的位置，其他卡可保持原值，顺序按升序。
3. 刷新并确认 `count` 增加。

隐藏一张卡：勾选 `Hidden`，刷新。

排序：只改 `Sort` 数字，不改 `CardID`。用户本机拖过顺序时，本机顺序优先，Notion 的 `Sort` 不会覆盖它。

## 接口速查

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/cards` | 只读 KV 已发布版本；无缓存时返回 `404 {"empty":true}` |
| GET | `/api/cards?v=<version>` | 版本一致返回 `{"unchanged":true}` |
| POST | `/api/cards` | 校验 `x-mynav-refresh-token` 后拉 Notion、校验、写 KV |

KV 键：`cards:v1:published`。只存全站卡片，不存任何用户个人数据。

## 本地开发

纯静态服务（例如 `python -m http.server`）不会执行 `functions/`，`/api/cards` 会 404，前端静默回退到 `data.js`，这是预期行为。

要本地测接口：

```powershell
npx wrangler pages dev . --kv MYNAV_KV --binding NOTION_TOKEN=... --binding NOTION_DB_ID=... --binding MYNAV_CARDS_REFRESH_TOKEN=...
```

不要把带真实密钥的命令提交到仓库。
