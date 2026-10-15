/**
 * 个人数字收藏馆 · 网站与分类数据源 (data.js)
 *
 * ⚠️ 本文件由 notion-sync.js 从 Notion「馆藏 CMS」自动生成，请勿手改。
 *    改法：在 Notion 里编辑「馆藏站点 / 馆藏专栏」数据库后重新运行同步。
 *
 * 🏛 架构原则：
 * 1. 内容与展示彻底分离：页面结构不硬编码任何具体网站或分类。
 * 2. 稳定标识：每个分类与网站使用全局唯一且稳定的 id，收藏与点击统计基于此 ID 绑定。
 * 3. 极简维护：在 Notion 里新增一行即可，无需碰代码。
 */

const NAV_DATA = {
  // 藏馆分类定义列表
  categories: [
    {
      id: "ai",
      name: "AI 思考与生成",
      desc: "前沿大语言模型、深度推理与多模态创作工坊",
      code: "AI",
    },
    {
      id: "dev",
      name: "开发与代码工坊",
      desc: "开源托管、Web 标准规范与现代工程基础设施",
      code: "DEV",
    },
    {
      id: "knowledge",
      name: "知识与研习",
      desc: "深度技术专栏、独立思考媒体与系统化学习资源",
      code: "LIB",
    },
    {
      id: "tools",
      name: "案头效率工具",
      desc: "知识沉淀库、架构图解与高频轻量实用工具",
      code: "EFF",
    },
  ],

  // 馆藏网站条目列表 (共 27 卷)
  sites: [

    // --- AI 思考与生成 (7 卷) ---
    {
      id: "ai-hark",
      name: "Hark",
      url: "https://hark.com",
      description: "生活操作系统式 AI 助手，能替你订餐、管邮件、做网页与定时任务",
      category: "ai",
      tags: ["ai", "hark", "助理", "效率", "任务"],
      icon: "HK",
    },
    {
      id: "ai-muse",
      name: "Muse",
      url: "https://muse.ai",
      description: "主动式 AI 个人助手，记住你的偏好并替你处理日常事务",
      category: "ai",
      tags: ["ai", "muse", "助手", "智能", "日常"],
      icon: "MU",
    },
    {
      id: "ai-chatgpt",
      name: "ChatGPT",
      url: "https://chatgpt.com",
      description: "OpenAI 旗下通用智能对话与深度推理助手，支持多模态创作与分析",
      category: "ai",
      tags: ["ai", "openai", "chatgpt", "大模型", "写作", "推理", "gpt"],
      icon: "GPT",
    },
    {
      id: "ai-deepseek-platform",
      name: "DeepSeek 开放平台",
      url: "https://platform.deepseek.com",
      description: "DeepSeek 官方 API 平台，管理 API Key、充值与用量",
      category: "ai",
      tags: ["ai", "deepseek", "api", "开放平台", "密钥", "用量"],
      icon: "DP",
    },
    {
      id: "ai-deepseek",
      name: "DeepSeek",
      url: "https://www.deepseek.com",
      description: "深度求索开源与高性价比大模型平台，专注高阶推理与严谨代码生成",
      category: "ai",
      tags: ["ai", "deepseek", "深度求索", "开源", "代码", "推理"],
      icon: "DS",
    },
    {
      id: "ai-gemini",
      name: "Gemini",
      url: "https://gemini.google.com",
      description: "Google 多模态大模型助手，深度整合搜索与云端文档",
      category: "ai",
      tags: ["ai", "gemini", "谷歌", "大模型", "多模态"],
      icon: "GM",
    },
    {
      id: "ai-claude",
      name: "Claude",
      url: "https://claude.ai",
      description: "Anthropic 推出的高质量语言模型，擅长长文深度研读与编程代码实现",
      category: "ai",
      tags: ["ai", "claude", "anthropic", "代码", "长文", "分析", "克劳德"],
      icon: "CL",
    },

    // --- 开发与代码工坊 (6 卷) ---
    {
      id: "dev-vercel",
      name: "Vercel",
      url: "https://vercel.com",
      description: "现代前端自动化部署与静态托管基础设施，支持一键上线生产级 Web 项目",
      category: "dev",
      tags: ["部署", "托管", "前端", "静态网站", "云服务"],
      icon: "▲",
    },
    {
      id: "dev-caniuse",
      name: "Can I use",
      url: "https://caniuse.com",
      description: "权威的前端 Web 标准与主流浏览器特性兼容性一览与即时检索平台",
      category: "dev",
      tags: ["前端", "兼容性", "浏览器", "css", "html5", "标准"],
      icon: "USE",
    },
    {
      id: "dev-github",
      name: "GitHub",
      url: "https://github.com",
      description: "全球领先的代码托管平台与开源协作网络，汇聚全球优秀工程师与开源典范",
      category: "dev",
      tags: ["开发", "代码", "开源", "git", "github", "版本控制"],
      icon: "GH",
    },
    {
      id: "dev-mdn",
      name: "MDN Web Docs",
      url: "https://developer.mozilla.org/zh-CN/",
      description: "Mozilla 维护的权威 Web 技术标准参考，全面涵盖 HTML、CSS 与 JavaScript",
      category: "dev",
      tags: ["前端", "文档", "html", "css", "javascript", "mdn", "标准"],
      icon: "MDN",
    },
    {
      id: "dev-cloudflare",
      name: "Cloudflare",
      url: "https://dash.cloudflare.com",
      description: "域名解析、CDN 加速与 Pages / Workers 静态部署控制台",
      category: "dev",
      tags: ["cloudflare", "dns", "域名", "cdn", "pages", "workers", "部署"],
      icon: "CF",
    },
    {
      id: "dev-stackoverflow",
      name: "Stack Overflow",
      url: "https://stackoverflow.com",
      description: "全球著名的软件开发技术问答社区，解决代码报错、系统架构与疑难杂症",
      category: "dev",
      tags: ["开发", "问答", "报错", "社区", "代码", "调试"],
      icon: "SO",
    },

    // --- 知识与研习 (8 卷) ---
    {
      id: "learn-juejin",
      name: "稀土掘金",
      url: "https://juejin.cn",
      description: "面向开发者的中文技术写作与交流社区，沉淀大量高质量工程实战文章",
      category: "knowledge",
      tags: ["社区", "博客", "前端", "后端", "实战", "经验"],
      icon: "掘",
    },
    {
      id: "learn-ecut-ehall",
      name: "网上办事服务大厅",
      url: "https://ehall.ecut.edu.cn/new/index.html",
      description: "东华理工大学教务、成绩、课表与各类校园事务办理",
      category: "knowledge",
      tags: ["ecut", "ehall", "办事大厅", "教务", "成绩", "课表"],
      icon: "办",
    },
    {
      id: "learn-runoob",
      name: "菜鸟教程",
      url: "https://www.runoob.com",
      description: "通俗易懂的基础编程语言与 Web 标准入门教程，提供丰富的交互示例",
      category: "knowledge",
      tags: ["教程", "入门", "语法", "速查", "初学者", "手册"],
      icon: "鸟",
    },
    {
      id: "learn-bilibili",
      name: "哔哩哔哩",
      url: "https://www.bilibili.com",
      description: "优质长视频研习与弹幕社区，涵盖计算机科学、工业设计与通识学术讲座",
      category: "knowledge",
      tags: ["视频", "课程", "教程", "b站", "公开课", "学习"],
      icon: "哔",
    },
    {
      id: "learn-sspai",
      name: "少数派",
      url: "https://sspai.com",
      description: "高效数字生活指南，专注于优质软件测评、个人生产力与工作流思考",
      category: "knowledge",
      tags: ["效率", "数字生活", "工具", "文章", "生产力", "工作流"],
      icon: "派",
    },
    {
      id: "learn-cnki",
      name: "中国知网",
      url: "https://www.cnki.net/",
      description: "中文学术期刊、学位论文与会议文献检索",
      category: "knowledge",
      tags: ["cnki", "知网", "论文", "文献", "学术", "期刊"],
      icon: "知",
    },
    {
      id: "learn-ecut-atrust",
      name: "aTrust 校园 VPN",
      url: "https://atrust1.ecut.edu.cn/portal/#/app_center",
      description: "东华理工大学校外访问门户，在校外登录后使用校内系统与数据库",
      category: "knowledge",
      tags: ["ecut", "atrust", "vpn", "校外访问", "校园网", "应用中心"],
      icon: "VP",
    },
    {
      id: "learn-ecut",
      name: "东华理工大学",
      url: "https://www.ecut.edu.cn/main.htm",
      description: "东华理工大学官网，学校新闻、通知公告与各类入口",
      category: "knowledge",
      tags: ["ecut", "东华理工", "学校", "官网", "通知"],
      icon: "东",
    },

    // --- 案头效率工具 (6 卷) ---
    {
      id: "tool-cobalt",
      name: "cobalt",
      url: "https://cobalt.tools/",
      description: "无广告、无追踪的在线视频与音频下载工具，粘贴链接即可",
      category: "tools",
      tags: ["cobalt", "视频下载", "音频", "解析", "去水印"],
      icon: "CO",
    },
    {
      id: "tool-yuque",
      name: "语雀",
      url: "https://www.yuque.com",
      description: "优雅结构化知识库系统，适合个人体系化文献笔记管理与深度内容创作",
      category: "tools",
      tags: ["笔记", "文档", "知识库", "写作", "归档"],
      icon: "雀",
    },
    {
      id: "tool-icon-icons",
      name: "icon-icons",
      url: "https://icon-icons.com/zh/",
      description: "免费 SVG、PNG、ICO 图标素材库，支持中文搜索",
      category: "tools",
      tags: ["图标", "icon", "svg", "png", "素材", "设计"],
      icon: "IC",
    },
    {
      id: "tool-notion",
      name: "Notion",
      url: "https://www.notion.so",
      description: "集文档写作、表格知识库与项目排期于一体的模块化全能数字工作台",
      category: "tools",
      tags: ["笔记", "知识库", "任务", "文档", "效率", "协同"],
      icon: "NO",
    },
    {
      id: "tool-tinypng",
      name: "TinyPNG",
      url: "https://tinypng.com",
      description: "优秀的 WebP、PNG 及 JPEG 图片智能在线无损压缩与视觉保真优化工具",
      category: "tools",
      tags: ["图片", "压缩", "优化", "轻量化", "格式", "工具"],
      icon: "PNG",
    },
    {
      id: "tool-processon",
      name: "ProcessOn",
      url: "https://www.processon.com",
      description: "专业在线图形协作平台，支持架构流程图、思维导图与原型蓝图绘制",
      category: "tools",
      tags: ["流程图", "思维导图", "画图", "架构", "设计"],
      icon: "PO",
    },
  ],
};

// 挂载到全局，供静态网页无构建直接运行
if (typeof window !== "undefined") {
  window.NAV_DATA = NAV_DATA;
}

// 供 Node.js 验证脚本与测试用例直接引用
if (typeof module !== "undefined" && module.exports) {
  module.exports = NAV_DATA;
}
