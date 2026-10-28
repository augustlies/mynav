# Batch 3 变更记录

> 分支 `hark/batch3`（预览 https://hark-batch3.mynav-8ct.pages.dev），未合入 main。零新依赖；data.js、DOM ID、`NavApp` 钩子、快捷键、口令均未改。

## 提速与离线（前一轮）
- **入口页缓存优先**（20117e1）：HTML 与 data.js 先出缓存、后台回源；新版补齐后左下角小签「已更新 · 下次打开生效」；保留上一版缓存一代；洗掉 CF 308 重定向响应；断网显示「离线模式」。
- **懒 DOM**（ad81046）：10 个低频弹窗/抽屉放进 `<template data-lazy-dom>`，`getElementById` 落空时自动取出（`NavDom.ensure`），ID 与钩子不变；首帧不画满屏底纹；首屏外分类卷 `content-visibility:auto`。
- **常驻案头按点击排序**（d9b0cd0）：近 7 天 → 总次数 → 最近调阅，复用 `MYNAV_LEDGER_V2.accessLog`。
- **飞鸽弹窗底部残留虚线修复**（746afa6）。

## 检索
- **撤回打开即聚焦**（3285a0a，撤 a8f8a82）：自动聚焦会吞掉 v/G/s/T 等单字母快捷键。聚焦仍用 `Ctrl/⌘+K` 或 `/`。
- **加 Bing**（576f445）：排在 Google 后，参与 Tab 循环与占位提示；存储 key `mynav_search_engine_v2` 不变。
- **无结果外搜 + 最近检索**（103c691）：馆内无结果时出现「用 <当前引擎> 搜「…」」按钮，回车同样跳转（站内模式按钮走 Google，回车仍不跳外网）；Tab 换引擎按钮即时改名。最近 8 条检索词存本机 `mynav_recent_searches_v1`，索书框聚焦且为空时以小签浮出，可「清除」；口令、`/` 命令、`?`/`!` 前缀不记录。

## 疑似失效标记（7727ef0）
- 只用 `probe.js` 已有巡检结果，零额外请求。离线卡片的星点变朱砂小点，悬停「可能已失效，考虑替换」，卡片带 `data-link-suspect`。
- 沙盒演练、本机断网、离线占比 > 60%（多半是网络问题）时不标。

## 视觉降噪二批（6ce6a7a）
- 卡片四角角标常态隐去，悬停/聚焦淡显；卡脚重复的「№」去掉一枚（主卷 >640px 只留右侧大印鉴）。
- 撤下书脊「ARCHIVE SECTIONS」与刊头「PRIVATE INDEX · MMXXVI」，刊头英文缩短为「VOL. 2026 · PRIVATE COLLECTION」。
- 刊头/书脊/卡脚统一表格数字，刊头小字 10px；卡脚编号 12px。
- ≤640px：窄条卡最小 64px 高，收藏键 44×44 触点。
- 截图：`shots/batch3/before_*` 与 `after_*`（1440 / 390，深 / 浅）。

## 验证
- 离线当主页：装好 SW 后断网，新开 `/`、`/index.html`、`/?from=pwa` 均 36 张卡片，无报错（无需修改）。
- `node validate.js`、主题首帧、离线（含滚动）、视图切换、`b3/full.py`（9 档宽度零溢出、馆务抽屉、懒模块首用、飞鸽、零页面错误）全绿。
