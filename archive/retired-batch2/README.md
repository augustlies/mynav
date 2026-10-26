# archive/retired-batch2 · Phase 5 Batch 2 下线模块

下线 ≠ 删除。这里保存 Batch 2 下线的模块源码与它们的 CSS 片段，随时可以恢复。
`MYNAV_LEDGER_V2` 中这些模块用过的字段（如 `telemetryConfig`）**仍保留在 Schema 里**，导出 / 导入照常透传。

| 文件 | 原功能 | 原来挂在哪 | 下线原因 |
|---|---|---|---|
| `soundscape.js` + `soundscape.css` | D6 白噪音天文台 | 页尾馆务索引 `#btn-soundscape-toggle`；`/sound` 命令；`app.js` Stage 2 `NavSoundscape.init()` | 与导航无关，纯氛围 |
| `ephemeris.js` + `ephemeris.css` | C2 观星晨报 | 页尾 `#btn-ephemeris-entry`、移动端 `#btn-ephemeris-mobile`；`#ephemeris-modal` / `#ephemeris-backdrop`；`M` 键；`/morning` `/ephemeris` | 12 条内置固定简报，没接真实 RSS |
| `federation.js` + `federation.css` | D7 联邦寻星镜 | 页尾 `#btn-federation-entry`、移动端 `#btn-federation-mobile`；`#federation-modal` / `#federation-backdrop`；`/telescope` `/federation` | 两个邻馆都是沙盒假数据 |
| `public-collection.json`、`build-public-collection.js` | D7 的本馆公开清单与生成脚本 | 根目录 / `scripts/` | 只服务于寻星镜 |
| `telemetry.js` + `telemetry-deck.css` | A5 探针 + C4 遥测机关台（算力余量 / 负载仪 / Webhook 扳手） | 页尾 `#telemetry-deck`（`#btn-telemetry-probe` `#btn-telemetry-toggle` `#telemetry-deck-body`） | 仪表与扳手没接真实端点 |
| `footer-utility.css` | Batch 1A 页尾馆务索引平铺区 + 5 个移动端重复按钮 | `.footer-utility-rack` 内 `.footer-utility-actions` / `.footer-utility-filters` / `.mobile-phase3-actions` / `.mobile-phase4b-actions` | 入口统一收进顶栏「⌘ 馆务」抽屉 `#hall-drawer` |

**A5 星轨联通探针没有下线**：它已从 `telemetry.js` 拆成 `js/probe.js`（`window.NavProbe`），
`window.NavTelemetry` 与 `NavApp.Telemetry` 都是指向它的别名，`probeAll()` 照常可用，
`mynav-probe-updated` 事件照常广播（琥珀死链兜底依赖它）。机关台相关方法（`openDeck` 等）保留为空操作。

## 去重删除的入口 ID（retired in Batch 2）

`btn-soundscape-toggle`、`btn-ephemeris-entry`、`btn-ephemeris-mobile`、`btn-federation-entry`、`btn-federation-mobile`、
`btn-telemetry-probe`、`btn-telemetry-toggle`、`telemetry-deck`、`telemetry-deck-body`、
`btn-uncatalogued-mobile`、`btn-brass-tools-mobile`、`btn-courier-mobile`（移动端重复按钮）、
`btn-snippets-spine-entry`（书脊重复入口，与 `btn-snippets-entry` 重复）。
其余保留功能的按钮 ID 原样搬进了 `#hall-drawer`。

## 怎么恢复某个模块

1. `git mv archive/retired-batch2/<module>.js js/`；
2. 在 `index.html` 里 `app.js` 之前加回 `<script src="js/<module>.js?v=..." defer></script>`，并加回它的入口按钮 / 弹窗 DOM（可从 `git show f7def46:index.html` 里拷）；
3. 把 `<module>.css` 的内容追加回 `styles.css`；
4. 在 `app.js` 的 `runStage2()` 里加回 `NavXxx.init()`，在 `js/commands.js` 的注册表里加回对应命令（可选：加 `drawer` 字段让它出现在馆务抽屉）；
5. 运行 `node scripts/build-sw.js` 刷新离线清单。

恢复遥测机关台时：把 `js/probe.js` 的 `<script>` 换回 `telemetry.js`（它自带探针），并加回 `#telemetry-deck` DOM。
