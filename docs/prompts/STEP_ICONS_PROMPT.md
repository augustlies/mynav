# 图标体系加固 Prompt（2026-10-21）

> 原始指令由用户提供，记录于 `C:\Users\ASUS\.codex\attachments\b1afbc50-4cc6-4918-ae2f-c56a44cf9b50\已粘贴的文本.txt`。
> 参考实现见 `artifacts/visual-qa/icons-2026-10-21/`。

## Role & Task

当前项目为个人数字收藏馆 `mynav 2.0`。彻底解决「卡片图标缺失、外链 403/CORS 控制台报错、未来新增网站自动带出官方 Logo、三级卡片密度与深浅色下的图标视觉适配」。

## 编码与环境铁律

1. 非二进制文本一律以 UTF-8 读写。
2. **保留官方品牌 Logo**，不得手绘抽象几何图案替代知名网站官方图标。
3. 先检阅 `validate.js`、`data.js`、`app.js` 现有图标字段与 DOM 类名，再动手。

## 第一步：补齐存量缺失图标

1. 复用 `validate.js` 的检查逻辑，找出缺失 / 损坏的本地图标。
2. 多源高清瀑布流（4000ms 超时 + User-Agent）：Icon.Horse → DuckDuckGo → Google S2 → Unavatar。
3. **二进制文件头校验**：拒绝 HTML 404 页与小于 100 字节的空文件；PNG 直接写入 PNG 路径，绝不把二进制裸存成 `.svg`。
4. `node validate.js` 必须 36 / 36、0 warnings。

## 第二步：`js/schema.js` 统一解析引擎

暴露 `resolveIcon(site)` / `iconAttributes(site)` / `handleIconError(img)` / `bindIconFallbacks(root)` / `waitForIcon(img, timeout)` / `isPrivateOrIpHost(host)` / `buildMonogramDataUri(text)`。

| 级别 | 条件 | 结果 |
| :--- | :--- | :--- |
| A | 显式 `icons/...` | 本地路径 |
| B | 命中 36 个内置 ID | `icons/<id>.png` |
| C | 显式 HTTP favicon | 该外链 |
| D | 空主机 / localhost / `.local` / 任意 IPv4 / IPv6 | 内联 SVG，**零网络** |
| E | 公网域名 | DDG → Icon.Horse → Google S2 → 内联 SVG |

- 降级链写入 `data-fallback-1` / `data-fallback-2` / `data-icon-fallback`，以 `data-icon-probe-step` 推进；落到 `data:image/` 时立刻 `onerror = null` 并加锁，**不允许死循环**。
- 收口模块：`app.js`、`js/uncatalogued.js`、`js/librarian.js`、`js/federation.js`、`js/serendipity.js`、`js/star-map.js`。移除所有向 `https://${domain}/favicon.ico` 的裸请求。

## 第三步：Bookmarklet 源头捕获

`js/courier.js` 自动读取目标页 `<link rel="apple-touch-icon">` / `rel="icon">` 的绝对地址，以 `&icon=` 回传并持久化为 `favicon`；Notion 导出新增 `Icon` 列。

## 第四步：三级尺寸与主题护盾

- `.card--monograph` 40px（padding 6px）、`.card--archive/.card--full` 34px（padding 5px）、`.card--slip` 24px（padding 3px）。
- 容器 `inline-flex` + `object-fit: contain`，禁止拉伸、裁切与 baseline 空隙。
- 浅色 `rgba(28,29,25,.035)` + `rgba(140,90,50,.18)`；深色 `rgba(244,231,197,.08)` + `rgba(200,169,126,.24)` + `drop-shadow(0 0 1px rgba(255,255,255,.35))`；暗月 `rgba(158,59,66,.10)` + `rgba(158,59,66,.28)`。

## 自动化验收

1. `node validate.js`：36 / 36、0 warnings。
2. 冷启动：Console errors = 0、Page errors = 0、失败图标请求 = 0。
3. 36 张卡图标 `complete && naturalWidth > 0`，三档底座精确 40 / 34 / 24px。
4. 新增公网站点自动挂载多级 favicon 链；新增内网地址直接渲染内联 Data URI 且零外发；DOM 级降级必须在有限步内终止于内联 SVG。
5. 9 断点（1440 / 1280 / 1024 / 900 / 899 / 768 / 640 / 390 / 375）横向溢出全部为 0。

## 验收结果（2026-10-21）

`artifacts/visual-qa/icons-2026-10-21/acceptance-report.json` 全绿；`phase01` / `phase02` / `phase03a` / `phase03b` / `phase05-perf` 回归全绿。
