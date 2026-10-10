/**
 * 个人数字收藏馆 · 网站与分类数据源 (data.js)
 * 
 * 🏛 架构原则：
 * 1. 内容与展示彻底分离：页面结构不硬编码任何具体网站或分类。
 * 2. 稳定标识：每个分类与网站使用全局唯一且稳定的 id，收藏与点击统计基于此 ID 绑定。
 * 3. 极简维护：新增网站直接在 sites 数组末尾追加；新增分类直接在 categories 追加。
 */

const NAV_DATA = {
  // 藏馆分类定义列表
  categories: [
    {
      id: "ai",
      name: "AI 思考与生成",
      desc: "前沿大语言模型、深度推理与多模态创作工坊",
      code: "AI"
    },
    {
      id: "dev",
      name: "开发与代码工坊",
      desc: "开源托管、Web 标准规范与现代工程基础设施",
      code: "DEV"
    },
    {
      id: "knowledge",
      name: "知识与研习",
      desc: "深度技术专栏、独立思考媒体与系统化学习资源",
      code: "LIB"
    },
    {
      id: "search",
      name: "探索与搜索引擎",
      desc: "全网信息检索、学术文献与高纯度探索入口",
      code: "SRC"
    },
    {
      id: "tools",
      name: "案头效率工具",
      desc: "知识沉淀库、架构图解与高频轻量实用工具",
      code: "EFF"
    }
  ],

  // 馆藏网站条目列表
  sites: [
    // --- 1. AI 思考与生成 ---
    {
      id: "ai-chatgpt",
      name: "ChatGPT",
      url: "https://chatgpt.com",
      description: "OpenAI 旗下通用智能对话与深度推理助手，支持多模态创作与分析",
      category: "ai",
      tags: ["ai", "openai", "chatgpt", "大模型", "写作", "推理"],
      icon: "GPT"
    },
    {
      id: "ai-claude",
      name: "Claude",
      url: "https://claude.ai",
      description: "Anthropic 推出的高质量语言模型，擅长长文深度研读与编程代码实现",
      category: "ai",
      tags: ["ai", "claude", "anthropic", "代码", "长文", "分析"],
      icon: "CL"
    },
    {
      id: "ai-kimi",
      name: "Kimi 智能助手",
      url: "https://kimi.moonshot.cn",
      description: "月之暗面长文本对话助手，支持海量文献研读、网页实时检索与资料汇总",
      category: "ai",
      tags: ["ai", "kimi", "月之暗面", "长文本", "文献", "搜索"],
      icon: "KM"
    },
    {
      id: "ai-deepseek",
      name: "DeepSeek",
      url: "https://www.deepseek.com",
      description: "深度求索开源与高性价比大模型平台，专注高阶推理与严谨代码生成",
      category: "ai",
      tags: ["ai", "deepseek", "深度求索", "开源", "代码", "推理"],
      icon: "DS"
    },

    // --- 2. 开发与代码工坊 ---
    {
      id: "dev-github",
      name: "GitHub",
      url: "https://github.com",
      description: "全球领先的代码托管平台与开源协作网络，汇聚全球优秀工程师与开源典范",
      category: "dev",
      tags: ["开发", "代码", "开源", "git", "github", "版本控制"],
      icon: "GH"
    },
    {
      id: "dev-mdn",
      name: "MDN Web Docs",
      url: "https://developer.mozilla.org/zh-CN/",
      description: "Mozilla 维护的权威 Web 技术标准参考，全面涵盖 HTML、CSS 与 JavaScript",
      category: "dev",
      tags: ["前端", "文档", "html", "css", "javascript", "mdn", "标准"],
      icon: "MDN"
    },
    {
      id: "dev-caniuse",
      name: "Can I use",
      url: "https://caniuse.com",
      description: "权威的前端 Web 标准与主流浏览器特性兼容性一览与即时检索平台",
      category: "dev",
      tags: ["前端", "兼容性", "浏览器", "css", "html5", "标准"],
      icon: "USE"
    },
    {
      id: "dev-stackoverflow",
      name: "Stack Overflow",
      url: "https://stackoverflow.com",
      description: "全球著名的软件开发技术问答社区，解决代码报错、系统架构与疑难杂症",
      category: "dev",
      tags: ["开发", "问答", "报错", "社区", "代码", "调试"],
      icon: "SO"
    },
    {
      id: "dev-vercel",
      name: "Vercel",
      url: "https://vercel.com",
      description: "现代前端自动化部署与静态托管基础设施，支持一键上线生产级 Web 项目",
      category: "dev",
      tags: ["部署", "托管", "前端", "静态网站", "云服务"],
      icon: "▲"
    },

    // --- 3. 知识与研习 ---
    {
      id: "learn-juejin",
      name: "稀土掘金",
      url: "https://juejin.cn",
      description: "面向开发者的中文技术写作与交流社区，沉淀大量高质量工程实战文章",
      category: "knowledge",
      tags: ["社区", "博客", "前端", "后端", "实战", "经验"],
      icon: "掘"
    },
    {
      id: "learn-sspai",
      name: "少数派",
      url: "https://sspai.com",
      description: "高效数字生活指南，专注于优质软件测评、个人生产力与工作流思考",
      category: "knowledge",
      tags: ["效率", "数字生活", "工具", "文章", "生产力", "工作流"],
      icon: "派"
    },
    {
      id: "learn-runoob",
      name: "菜鸟教程",
      url: "https://www.runoob.com",
      description: "通俗易懂的基础编程语言与 Web 标准入门教程，提供丰富的交互示例",
      category: "knowledge",
      tags: ["教程", "入门", "语法", "速查", "初学者", "手册"],
      icon: "鸟"
    },
    {
      id: "learn-bilibili",
      name: "哔哩哔哩",
      url: "https://www.bilibili.com",
      description: "优质长视频研习与弹幕社区，涵盖计算机科学、工业设计与通识学术讲座",
      category: "knowledge",
      tags: ["视频", "课程", "教程", "b站", "公开课", "学习"],
      icon: "哔"
    },

    // --- 4. 探索与搜索引擎 ---
    {
      id: "search-bing",
      name: "必应 Bing",
      url: "https://cn.bing.com",
      description: "微软旗下全球化搜索引擎，提供纯净的网页检索、学术论文与每日典雅壁纸",
      category: "search",
      tags: ["搜索", "微软", "bing", "必应", "壁纸", "学术"],
      icon: "BG"
    },
    {
      id: "search-google",
      name: "Google",
      url: "https://www.google.com",
      description: "全球知名的多语言搜索引擎，检索海量互联网知识档案与全球开放信息",
      category: "search",
      tags: ["搜索", "谷歌", "google", "外文", "检索"],
      icon: "GG"
    },
    {
      id: "search-baidu",
      name: "百度",
      url: "https://www.baidu.com",
      description: "全球领先的中文搜索引擎，支持中文网页、即时资讯与百科全书检索",
      category: "search",
      tags: ["搜索", "中文", "百度", "baidu", "资讯"],
      icon: "度"
    },

    // --- 5. 案头效率工具 ---
    {
      id: "tool-notion",
      name: "Notion",
      url: "https://www.notion.so",
      description: "集文档写作、表格知识库与项目排期于一体的模块化全能数字工作台",
      category: "tools",
      tags: ["笔记", "知识库", "任务", "文档", "效率", "协同"],
      icon: "NO"
    },
    {
      id: "tool-yuque",
      name: "语雀",
      url: "https://www.yuque.com",
      description: "优雅结构化知识库系统，适合个人体系化文献笔记管理与深度内容创作",
      category: "tools",
      tags: ["笔记", "文档", "知识库", "写作", "归档"],
      icon: "雀"
    },
    {
      id: "tool-processon",
      name: "ProcessOn",
      url: "https://www.processon.com",
      description: "专业在线图形协作平台，支持架构流程图、思维导图与原型蓝图绘制",
      category: "tools",
      tags: ["流程图", "思维导图", "画图", "架构", "设计"],
      icon: "PO"
    },
    {
      id: "tool-tinypng",
      name: "TinyPNG",
      url: "https://tinypng.com",
      description: "优秀的 WebP、PNG 及 JPEG 图片智能在线无损压缩与视觉保真优化工具",
      category: "tools",
      tags: ["图片", "压缩", "优化", "轻量化", "格式", "工具"],
      icon: "PNG"
    }
  ]
};

// 挂载到全局，供静态网页无构建直接运行
if (typeof window !== "undefined") {
  window.NAV_DATA = NAV_DATA;
}

// 供 Node.js 验证脚本与测试用例直接引用
if (typeof module !== "undefined" && module.exports) {
  module.exports = NAV_DATA;
}
