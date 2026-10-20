# mynav 2.0 · Phase 3A 执行指令

> 本文件保存 Phase 3A（A7、D6、D3 与移动端入口补齐）的原始实施要求，作为后续 Phase 3B 与回归验收的上下文锚点。

## Role & Context

你是严谨的高级前端架构师。当前项目为个人数字收藏馆（EX LIBRIS 风格 mynav）。

项目已落地 Phase 0（古籍对开双栏布局）、Phase 1（纯前端键盘流与索书号）与 Phase 2（藏书票批注、待编目匣、活字秘卷、双生结界）。相关规范位于根目录 `TODO.md` 与 `ARCHITECTURE_2.0.md`，上一阶段验证报告位于 `artifacts/visual-qa/phase02/acceptance-report.json`。

Phase 3 拆分为：

- **Phase 3A（本次）**：天文声光与极客仪器室，包含 A7、D6、D3 与移动端入口。
- **Phase 3B（后续）**：月相编年史与穹顶引力星图，包含 D4、C6。

## 零容忍红线

1. 保持 Phase 0 / 1 / 2 全部测试 100% 绿灯：隐藏口令 `***REMOVED***`、36+ 卡片全局唯一索书号、待编目匣转正、活字秘卷、暗月结界、考场封条、5 个断点零横向溢出均不可退化。
2. 修复移动端 `< 900px` 抽屉入口缺失：顶部眉批栏或搜索框旁必须提供紧凑可见的 `[ ⌘ 待编目 ]` 与 `[ 📐 工具尺 ]`，可点击打开对应抽屉且不产生横向溢出。

## A7 · 真·天文日晷与实时恒星时

实现文件：`js/astronomy.js`

- 每秒计算本地恒星时，升级 `.spine-colophon`，显示：
  - `LST 18h 42m 09s · DEC +38°47′`
  - 当前月相符号与中文名称，如 `🌕 望月` / `🌒 蛾眉月`
- 浅色模式下按当前小时与分钟将 `06:00–18:00` 映射为 `-45deg–+45deg`：
  - 写入 `:root` 的 `--sundial-angle`
  - 写入 `--sundial-length` 驱动日影斜线与卡片微弱投影
- 深色模式星轨 Canvas 增加稀有流星。
- 暴露测试钩子：
  - `NavApp.Astronomy.setMockTime(hour)`
  - `NavApp.Astronomy.resetMockTime()`
  - `NavApp.Astronomy.triggerMeteor()`

## D6 · 白噪音天文台

实现文件：`js/soundscape.js`

- 眉批栏新增 `[ 𝄞 寂静 ]`；开启后为 `[ 𝄞 听风 · 鸣 ]`，带微弱黄铜呼吸灯。
- 支持 `/sound` 命令切换。
- 状态写入 `MYNAV_LEDGER_V2.modeState.ambientSound`。
- 禁止在页面 `load` 时实例化 `AudioContext`；必须在点击音叉或执行 `/sound` 后懒创建。
- 历史状态为 `true` 但页面刷新时，按钮显示 `[ 𝄞 听风 · 待唤醒 ]`，首次点击页面任意位置平滑恢复。
- 零外部音频文件，全部使用 Web Audio API：
  - 深色：100–160Hz Lowpass 布朗噪声 + 微弱正弦星际脉冲 + 每秒轻柔高频 Tick。
  - 浅色：Bandpass 500Hz 粉红噪声 + 每 2 秒温润低频钟摆泛音。
- 主题切换时使用 `GainNode.gain.linearRampToValueAtTime` 在 0.5s 内平滑过渡。

## D3 · 黄铜工具尺

实现文件：`js/brass-tools.js`

- 左栏书脊下部与移动端搜索框旁提供 `[ 📐 黄铜工具尺 ]` 入口。
- 非输入态快捷键 `T` 与命令 `/tools` 可打开右侧 `.brass-workbench`。
- 三个零延迟纯前端仪器：
  1. **星象罗盘**：境内链路与 Δt、出口 IP / 归属、DNS / 在线状态；点击“重新测绘”。
     - 所有外部请求使用 `AbortController`，2000ms 超时。
     - 离线、受阻或自动化环境中静默回退为 `LOCAL SANDBOX · 127.0.0.1 (Δt 1ms)`。
     - 不抛 console error，不阻塞测试。
  2. **译码转盘**：UTF-8 安全 Base64 编解码、URL 编解码、JSON 格式化 / 压缩（含错误行提示）、JWT Payload 免密解码；提供复制与清空。
  3. **历法刻漏**：实时 Unix 秒 / 毫秒、时间戳与 `YYYY-MM-DD HH:mm:ss` 双向转换、原生 Web Crypto SHA-256。

## 验收要求

- 更新 `TODO.md`：拆分 Phase 3A / 3B，A7、D6、D3 与移动端入口打勾。
- 编写并运行：
  - `artifacts/visual-qa/phase03a/acceptance.js`
  - `artifacts/visual-qa/phase03a/shots.js`
- 生成：
  - `artifacts/visual-qa/phase03a/acceptance-report.json`
  - Phase 3A 截图集
- 回归 Phase 1 / Phase 2 核心指标与 5 个断点零横向溢出。
