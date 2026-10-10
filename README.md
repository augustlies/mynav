# 个人数字收藏馆 · The Digital Archive

> **“博学之，审问之，慎思之，明辨之，笃行之。”**  
> 一个兼具独立杂志、私人图书馆与数字档案气质的个人专属网址典藏馆。

---

## 🏛 项目定位与设计哲学

这不是常见的 SaaS 后台，也不是粗糙堆砌圆角卡片的网址导航模板。它被设计为一本优雅、克制、耐看的**私人数字出版物**：

- **Editorial 排印美学**：采用温暖的暖象牙白（`#F6F4EE`）纸张底色与深沉墨黑字色，搭配衬线刊头排版与极细纸张纤维分隔线。
- **炭黑双色模式**：支持炭黑书封主题（`#171815`），非机械反色，文字柔和不刺眼，默认自适应系统外观偏好，支持一键切换并本地持久化。
- **纯原生无构建**：100% 原生 HTML5、CSS3 与原生 JavaScript，无需 Node.js 编译，无需 Webpack/Vite，静态托管即开即用。
- **模块化解耦架构**：内容与展示彻底分离。存储、主题、书签收藏、案头常用、多维搜索各自独立为高内聚子模块，业务逻辑不堆积。
- **隐私与安全第一**：无需登录、无任何第三方追踪/广告/Cookie，所有书签和访问统计均安全存放在浏览器本地 `localStorage`。
- **外部链接安全规范**：所有外链均强制使用 `target="_blank" rel="noopener noreferrer"` 防范反向劫持。

---

## 📁 项目目录与模块划分

```text
MyNav/
├── index.html          # 典藏馆主刊页面结构（刊头、检索框、导览轨与网格）
├── styles.css          # 杂志设计系统（双色 CSS 变量、排印尺度与响应式网格）
├── data.js             # 独立数据源（分类定义与 20 卷精选初始馆藏）
├── validate.js         # 数据格式合规性与规范校验工具
├── app.js              # 核心装配控制器（协调子模块、处理刊期时间与事件分发）
├── js/                 # 独立业务子模块目录
│   ├── storage.js      # 统一 localStorage 本地存储与防崩溃封装
│   ├── theme.js        # 浅色/深色主题检测、切换与持久化
│   ├── favorites.js    # 私人典藏（书签）增删查统计管理
│   ├── visits.js       # 常用案头访问频次与最近访问时间排序
│   ├── search.js       # 多维多字段模糊多词检索引擎
│   └── motion.js       # 错峰渐入、书签微弹性与卡片微动效增强器
├── README.md           # 维护说明、预览方法与部署指南
└── .gitignore          # Git 忽略文件规则
```

---

## 🚀 本地预览方法

本项目为**纯静态网站**，支持以下多种零门槛预览方式：

### 方法一：使用 Python 静态服务器（最推荐）
在项目根目录下打开终端或 PowerShell，运行系统自带的轻量 HTTP 服务：
```bash
python -m http.server 8080
```
然后在浏览器中访问：**`http://localhost:8080`** 即可。

### 方法二：使用 VS Code Live Server 插件
在 VS Code 中打开本项目文件夹，右键 `index.html`，选择 **Open with Live Server**。

### 方法三：直接双击打开
在电脑文件管理器中进入 `MyNav` 目录，直接双击 **`index.html`** 即可在默认浏览器中直接打开。

---

## ✍️ 数据维护与扩充指南

所有数据完全存放在 **`data.js`** 中。增删条目时，**无需修改任何 HTML 结构或 JavaScript 业务代码**。

### 1. 新增一个网站条目模板
在 `data.js` 的 `sites` 数组中复制并追加以下模板：

```javascript
{
  id: "tools-figma",                         // 稳定且唯一的 ID（英文小写与连字符）
  name: "Figma",                             // 网站名称
  url: "https://www.figma.com",              // 完整网址（必须以 http:// 或 https:// 开头）
  description: "新一代协作式界面设计与交互原型制作工具", // 精炼的一句话介绍
  category: "tools",                         // 所属分类 ID（必须存在于 categories 中）
  tags: ["设计", "原型", "ui", "协作"],       // 检索标签关键词
  icon: "FG"                                 // 典藏印记徽标（1~3 个字母或汉字）
},
```

### 2. 新增一个专栏分类模板
在 `data.js` 的 `categories` 数组中追加新分类：

```javascript
{
  id: "design",                              // 稳定分类 ID
  name: "视觉与灵感设计",                    // 分类全称
  desc: "优质设计社区、配色灵感与排版参考档案", // 分类副标题简述
  code: "DSN"                                // 2~3 个字母的印刷编号简码
},
```
> 保存后，页面将**自动生成分类导航入口、计算收录数量并渲染对应专栏**。

### 3. 运行数据校验工具
为了防止手写数据时出现拼写错误或重复 ID，可在项目目录下随时运行：
```bash
node validate.js
```
校验器会自动检查：
- 是否存在重复的网站或分类 ID
- 是否有无效的 URL
- 是否存在未在 `categories` 中定义的孤立分类
- 是否缺少必要字段

---

## ☁️ GitHub 仓库管理与 Cloudflare Pages 免费部署指南

通过 GitHub 与 Cloudflare Pages，你可以实现**修改代码提交后自动全球部署**，并免费绑定个人域名。

### 第一步：在 GitHub 上创建仓库并推送代码
1. 登录 [GitHub](https://github.com/)，点击右上角的 **New repository**。
2. 填写仓库名称（例如 `my-digital-nav`），选择 **Public** 或 **Private**，点击 **Create repository**。
3. 在本地 `MyNav` 目录中打开终端，执行以下命令推送到 GitHub：
   ```bash
   git init
   git add .
   git commit -m "feat: 发布个人数字收藏馆初版"
   git branch -M main
   git remote add origin https://github.com/<你的GitHub用户名>/my-digital-nav.git
   git push -u origin main
   ```

### 第二步：连接 Cloudflare Pages 自动部署
1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com/)。
2. 在左侧导航栏中点击 **Workers & Pages** -> 点击 **Create application** -> 选择 **Pages** 选项卡。
3. 点击 **Connect to Git**，授权并选择刚才创建的 `my-digital-nav` 仓库。
4. **构建设置（极简配置，无需构建）：**
   - **Framework preset（框架预设）**：选择 **None**。
   - **Build command（构建命令）**：**完全留空**（不需要任何命令）。
   - **Build output directory（输出目录）**：留空或填写 `/`。
   - **Root directory（根目录）**：留空或填写 `/`。
5. 点击 **Save and Deploy**。
6. 等待约 15 秒，页面即可成功部署，获得一个免费的专属域名（如 `https://my-digital-nav.pages.dev`）。

### 第三步：绑定你自己的独立域名
1. 在刚创建的 Pages 项目页面，进入 **Custom domains**（自定义域）选项卡。
2. 点击 **Set up a custom domain**。
3. 输入你的自定义域名（例如 `nav.yourdomain.com`），根据 Cloudflare 的自动提示添加 CNAME 解析记录。
4. 解析生效后，即可通过自己的域名享受全球 CDN 加速与免费 SSL 证书。

### 第四步：今后如何更新网站
以后每次你在 `data.js` 中新增或修改了网站，只需运行：
```bash
git add .
git commit -m "update: 新增一批精选网站"
git push
```
Cloudflare Pages 会自动检测到更新并在十几秒内重新完成全球部署。

---

## ⌨️ 快捷键速查

- <kbd>/</kbd> ：随时按下，快速聚焦并选中文本检索框。
- <kbd>Esc</kbd> ：清空当前检索内容，或退出检索聚焦状态。

---

## 📜 许可证与鸣谢

本项目采用 MIT 许可证。纯静态构建，静水流深，敬请品鉴。
