# Phase 5 · Batch 2 变更记录（减法 + 启动提速）

> 分支已合入 main（7fb220e → d026c9a）。原则：不改 data.js、DOM ID、`NavApp` 钩子、快捷键与口令。

## 主题与离线
- **首帧预置主题**：`<head>` 内同步脚本先读 `mynav_arch_theme` 设好 `data-theme`，加载期禁用颜色过渡，消除「先白后黑」闪烁。
- **Service Worker 离线开馆**：`sw.js` + `scripts/build-sw.js` 生成离线清单（读 `js/lazy.js` 懒加载表补全）。断网也能打开馆藏。
- **`_headers`**：入口页 / `sw.js` / `data.js` 每次回源校验；带 `?v=` 的脚本、样式、图标一年 `immutable`；`/css/*` 同步。

## 减法
- **馆务抽屉 `#hall-drawer`**：顶栏「⌘ 馆务」或按 `.` 开合，分「找书 / 收书 / 馆务」三组（由 `commands.js` 注册表生成）；方向键、焦点陷阱、Esc、遮罩、焦点回位；≤640px 变底部抽屉。页尾平铺区与移动端/书脊重复入口删除；同步与备份并入飞鸽弹窗。
- **下线四项**：白噪音（soundscape）、观星晨报（ephemeris）、寻星镜（federation）、遥测机关台面板。源码与样式归档到 `archive/retired-batch2/`。探针单独拆为 `js/probe.js`，保留 `NavTelemetry` / `NavApp.Telemetry` 别名。

## 提速
- **12 个按需模块**（`js/lazy.js`）：司天监、星图、右键菜单、飞鸽、琥珀、工具尺、编年、秘卷、手记、云同步、藏书票、今日开卷——首次使用才载入，首击/按键/右键/长按不落空；`?ingest=` 首屏立即载入飞鸽。粒子背景首屏后空闲载入，减弱动效/省流量时不启动。
- **CSS 拆分**：11 个按需模块的样式拆到 `css/<模块>.css`，随模块并行载入；首屏阻塞 CSS 265.6KB → 167KB。

## 修复
- 星图里点左侧分类回到书本目录；星图标题栏加「返回目录」；SW 版本变化时不再先回放旧文件。
