/**
 * 个人数字收藏馆 · 网站与分类数据源 (data.js)
 *
 * 🏛 架构原则：
 * 1. 内容与展示彻底分离：页面结构不硬编码任何具体网站或分类。
 * 2. 稳定标识：每个分类与网站使用全局唯一且稳定的 id，收藏与点击统计基于此 ID 绑定。
 * 3. 极简维护：新增网站直接在 sites 数组追加；新增分类直接在 categories 追加。
 */

const NAV_DATA = {
  // 藏馆分类定义列表
  categories: [
    {
      id: "api",
      name: "模型 API 与调试",
      desc: "试模型、调提示词、管理 API 接入、开发者计费与兑换码。",
      code: "API"
    },
    {
      id: "cloud",
      name: "云服务与部署",
      desc: "云主机、云电脑、SSH 远程管理，以及网站部署、域名 DNS 和生产环境。",
      code: "CLOUD"
    },
    {
      id: "mail",
      name: "邮箱与号码",
      desc: "个人邮箱、聚合收件箱、智能体邮箱，以及 eSIM 电话线路和短信接码。",
      code: "MAIL"
    },
    {
      id: "social",
      name: "社区与内容",
      desc: "聊天群组、技术论坛、社交动态，以及视频、教程和数字生活文章。",
      code: "FEED"
    },
    {
      id: "knowledge",
      name: "学习与资源",
      desc: "论文检索、学习辅导、校园服务，以及图标、图片和媒体等实用资源。",
      code: "LEARN"
    },
    {
      id: "tools",
      name: "笔记与绘图",
      desc: "整理文档和知识库、协作记录、绘制流程图与思维导图。",
      code: "NOTE"
    },
    {
      id: "dev",
      name: "代码与开发文档",
      desc: "找开源项目、管理代码、查 Web 文档与浏览器兼容性、检索编程问题。",
      code: "CODE"
    },
    {
      id: "ai",
      name: "AI 与自动化",
      desc: "AI 对话、写作和个人助手，智能体电脑操作，以及脚本定时任务。",
      code: "AI"
    }
  ],

  // 馆藏网站条目列表 (共 47 卷)
  sites: [
    // --- 1. 模型 API 与调试 (6 卷) ---
    {
      id: "user-google-ai-studio",
      name: "Google AI Studio · 模型调试",
      url: "https://aistudio.google.com/u/2/prompts/new_chat?pli=1",
      description: "在 Playground 调试 Gemini 提示词、模型参数和工具调用，并获取接入代码。",
      category: "api",
      tags: ["Google AI Studio","Gemini API","Playground","提示词调试","模型参数","Get code"],
      icon: "GO",
      notes: "实际页面可见 Run settings、Get code、系统提示词和工具配置，属于开发者试验台；与普通 Gemini 聊天分开。保留 /u/2/ 路径，Google 可能按会话调整账号。依据：https://aistudio.google.com/；2026-11-21。"
    },
    {
      id: "ai-deepseek-platform",
      name: "DeepSeek 开放平台",
      url: "https://platform.deepseek.com",
      description: "DeepSeek 的开发者 API 平台，用于接入模型、管理密钥并查看用量和账单。",
      category: "api",
      tags: ["DeepSeek API","开发者","API密钥","用量","账单","接口文档"],
      icon: "DP",
      notes: "入口类型：开发者控制台，与 DeepSeek 日常聊天分开。保留 API Keys、Usage 和文档三个快捷入口。依据：https://platform.deepseek.com/、https://api-docs.deepseek.com/；本次只核对登录页与公开说明，2026-11-21。",
      subLinks: [{"label":"API Keys","url":"https://platform.deepseek.com/api_keys"},{"label":"Usage 账单","url":"https://platform.deepseek.com/usage"},{"label":"Docs","url":"https://api-docs.deepseek.com/"}]
    },
    {
      id: "ai-mw7xg0uw",
      name: "Mistral · 订阅与账单",
      url: "https://admin.mistral.ai/subscription",
      description: "Mistral Admin 的订阅管理入口，用于管理组织订阅与开发者平台计费。",
      category: "api",
      tags: ["Mistral","Admin","订阅","账单","组织管理","模型API"],
      icon: "MI",
      notes: "入口类型：Mistral Admin 的 subscription 页面，不是日常 AI 聊天页。官方文档将 Admin 定义为组织、账单和访问策略控制台；本次跳转登录页，未核实账号套餐。依据：https://docs.mistral.ai/；2026-11-21。"
    },
    {
      id: "user-xingchi",
      name: "星驰 API 公益站",
      url: "https://xingchiapi.com/dashboard",
      description: "星驰 API 公益站的仪表盘入口，登录后进入个人 API 服务后台。",
      category: "api",
      tags: ["星驰API","API公益站","API后台","模型接口","LinuxDO登录"],
      icon: "星驰",
      notes: "实际登录页标题为“星驰API公益站”，支持邮箱及 Linux.do 登录。未进入后台，不推断具体模型、额度、价格或可用性。依据：https://xingchiapi.com/dashboard；2026-11-21。"
    },
    {
      id: "user-apikey-casa",
      name: "APIKey Casa · 福利站兑换",
      url: "https://apikey.casa/redeem",
      description: "福利站的兑换码入口；页面标注“订阅转 API”，兑换内容以登录后展示为准。",
      category: "api",
      tags: ["APIKey Casa","福利站","兑换码","订阅转API","模型接口"],
      icon: "AP",
      notes: "实际页眉为“福利站 / Subscription to API Conversion Platform”，redeem 链接会先要求登录。已确认产品定位与兑换路径，未验证兑换码的具体商品或额度，不承诺可兑换任何模型。依据：https://apikey.casa/redeem；2026-11-21。"
    },
    {
      id: "api-mwrmbimq",
      name: "烨",
      url: "https://elysiver.h-e.top/profile",
      description: "",
      category: "api",
      tags: [],
      icon: "烨",
      createdAt: 1795338720530
    },

    // --- 2. 云服务与部署 (10 卷) ---
    {
      id: "dev-cloudflare",
      name: "Cloudflare",
      url: "https://dash.cloudflare.com",
      description: "Cloudflare 控制台，用于管理域名 DNS、网络加速与安全，以及 Workers 和 Pages 部署。",
      category: "cloud",
      tags: ["Cloudflare","DNS","域名","CDN","Workers","Pages","部署"],
      icon: "CF",
      notes: "入口类型：Cloudflare 账号后台。域名解析、CDN 和应用发布都从这里进入；它不是传统 VPS 的 SSH 管理面板。依据：https://www.cloudflare.com/；未更改账号资源，2026-11-21。"
    },
    {
      id: "dev-gcp-console",
      name: "Google Cloud Console",
      url: "https://console.cloud.google.com/home/dashboard?project=project-f423a41b-e415-4102-adc",
      description: "指定 Google Cloud 项目的控制台，集中管理云资源、访问权限、API 服务与账单。",
      category: "cloud",
      tags: ["Google Cloud","GCP","项目控制台","云资源","IAM","账单"],
      icon: "GCP",
      notes: "入口类型：带 project 参数的 GCP 项目仪表盘，保留原项目地址。找虚拟机、IAM 或云服务配置时使用；不同于面向模型调试的 AI Studio。依据：https://docs.cloud.google.com/docs/overview；未核查项目内资源状态，2026-11-21。"
    },
    {
      id: "user-raksmart",
      name: "RAKsmart · 客户中心",
      url: "https://billing.raksmart.com/whmcs/clientarea.php?language=chinese-cn",
      description: "RAKsmart 主机服务账号入口，用于管理已购服务器、服务账单和支持工单。",
      category: "cloud",
      tags: ["RAKsmart","主机商","云服务器","客户中心","账单","工单"],
      icon: "RA",
      notes: "入口类型：主机商客户中心。原 billing 链接当前会跳转至 RAKsmart 新登录页，原始收藏地址已保留；产品范围由官网说明核实，未登录查看购买记录。依据：https://www.raksmart.com/、https://www.raksmart.com/login/index.html；2026-11-21。"
    },
    {
      id: "user-simular-box",
      name: "Simular Box · 智能体云桌面",
      url: "https://box.simular.ai/box/",
      description: "给 AI 智能体使用的云端电脑，让智能体通过桌面和浏览器操作完成任务。",
      category: "cloud",
      tags: ["Simular","Box","智能体电脑","云桌面","Computer Use","浏览器操作"],
      icon: "SI",
      notes: "实际登录页标题为“box by Simular | Give your agents a computer”，介绍自己的云桌面和 Simular API key。重点是智能体的电脑操作环境；未登录核查个人 Box 状态。依据：https://box.simular.ai/box/；2026-11-21。"
    },
    {
      id: "user-weeny-cloud",
      name: "Weeny Cloud · Linux 服务器",
      url: "https://weeny.cloud/dashboard",
      description: "面向编程智能体的 Linux 服务器平台，以 root 权限运行应用并提供 HTTPS 访问入口。",
      category: "cloud",
      tags: ["Weeny Cloud","Linux服务器","root","SSH","应用运行","HTTPS"],
      icon: "WE",
      notes: "官网明确提供真实 Linux 服务器、SSH、应用进程管理和暴露端口功能，不是模型 API 服务。当前 dashboard 会跳转邮箱验证码登录，未核实个人服务器状态。依据：https://weeny.cloud/；2026-11-21。"
    },
    {
      id: "dev-dujing",
      name: "独角鲸 · Narwhal Cloud",
      url: "https://dash.fuckip.me/",
      description: "Narwhal Cloud 云服务账号入口，用于进入云资源后台；原收藏名称为“独角鲸”。",
      category: "cloud",
      tags: ["独角鲸","Narwhal Cloud","云服务","云主机","控制台"],
      icon: "鲸",
      notes: "实际登录页标题为 Narwhal Cloud，标注云服务并支持 Google、GitHub、通行密钥和邮箱登录。未登录核查具体套餐或实例，已删除“价格实惠”等无依据评价。依据：https://dash.fuckip.me/；2026-11-21。"
    },
    {
      id: "dev-termius",
      name: "Termius",
      url: "https://termius.com/",
      description: "SSH 与 SFTP 客户端官网，用于下载终端、管理远程主机和跨设备同步连接配置。",
      category: "cloud",
      tags: ["Termius","SSH","SFTP","远程终端","主机管理","端口转发"],
      icon: "TM",
      notes: "入口类型：Termius 产品官网，不是某台服务器的网页终端。SSH 连接、文件传输、端口转发和主机配置在客户端中使用。依据：https://termius.com/；2026-11-21。"
    },
    {
      id: "user-altare-cloud",
      name: "Altare 云服务",
      url: "https://console.altare.gg/",
      description: "Altare 云服务控制台，用于管理云端应用与运行沙箱，并进入存储、域名等服务入口。",
      category: "cloud",
      tags: ["Altare","云服务","云端应用","沙箱","部署","存储","域名"],
      icon: "AL",
      notes: "入口类型：Altare 云服务控制台。公开页面提供 Apps、Storage、Domains 等服务入口，并提示部署、沙箱及控制台可能因高负载而变慢或暂时不可用。依据：https://console.altare.gg/；2026-11-21。"
    },
    {
      id: "dev-vercel",
      name: "Vercel",
      url: "https://vercel.com",
      description: "网站、Web 应用与智能体的部署平台，用于发布项目并管理托管运行环境。",
      category: "cloud",
      tags: ["Vercel","应用部署","网站托管","Web","生产环境"],
      icon: "▲",
      notes: "入口类型：Vercel 官网，登录后进入项目管理。用途是部署和运行应用；代码仓库本身在 GitHub 管理。当前官网已不只强调静态托管，故移除原说明中的范围限制。依据：https://vercel.com/；2026-11-21。"
    },
    {
      id: "user-cloady",
      name: "Cloady · production 环境",
      url: "https://cloady.com/w/august-lies/jpn1/production",
      description: "Cloady 工作区内 jpn1 / production 环境的直达链接，用于返回已有项目环境。",
      category: "cloud",
      tags: ["Cloady","工作区","production","项目环境","待核实"],
      icon: "CL",
      notes: "URL 明确包含工作区及 production 环境路径；此次打开触发站点安全校验，未进入控制台，具体项目类型、部署能力和运行状态待核实。按生产环境入口归档，未杜撰支持的技术栈。依据：本卡片原始 URL；2026-11-21。"
    },

    // --- 3. 邮箱与号码 (7 卷) ---
    {
      id: "user-guiyi",
      name: "归一 · Unifold 邮箱",
      url: "https://guiyi.sueexin.dev/",
      description: "多个邮箱的统一收件箱，集中收发和搜索邮件，管理邮箱账号、文件夹与待审批操作。",
      category: "mail",
      tags: ["归一","Unifold","聚合邮箱","统一收件箱","多账号","邮件搜索","审批"],
      icon: "归一",
      notes: "已实际核对页面标题“归一 Unifold”，可见 All inboxes、Email accounts、Drafts、Smart folders 和 Approvals。它是多邮箱聚合客户端，不是 AI 聊天页，原分类和介绍已纠正。依据：https://guiyi.sueexin.dev/；2026-11-21。"
    },
    {
      id: "mail-gmail",
      name: "Gmail",
      url: "https://mail.google.com/",
      description: "Google 邮箱的网页入口，用于收发邮件、搜索历史邮件并管理标签和附件。",
      category: "mail",
      tags: ["Gmail","Google邮箱","邮件","收件箱","标签","附件"],
      icon: "邮",
      notes: "入口类型：个人邮箱应用。单独处理 Gmail 邮件时从此进入；跨多个邮箱统一收件和搜索使用“归一 · Unifold 邮箱”。依据：https://workspace.google.com/gmail/；2026-11-21。"
    },
    {
      id: "mail-163",
      name: "163邮箱",
      url: "https://mail.163.com/",
      description: "网易 163 邮箱的网页入口，用于登录邮箱、收发邮件和管理个人通信。",
      category: "mail",
      tags: ["163邮箱","网易邮箱","邮件","收件箱","网页邮箱"],
      icon: "163",
      notes: "入口类型：163 邮箱原生网页，不是“邮箱大师”多账号客户端。需要处理此邮箱的账号或原生设置时使用；聚合收件可另用归一。依据：https://mail.163.com/；2026-11-21。"
    },
    {
      id: "user-flame-mail",
      name: "Flame · Cloud Mail 邮箱",
      url: "https://mail.flame.edu.kg/inbox",
      description: "flame.edu.kg 域名的 Cloud Mail 网页邮箱，此链接进入收件箱并支持邮件收发。",
      category: "mail",
      tags: ["Flame","Cloud Mail","网页邮箱","域名邮箱","收件箱","邮件收发"],
      icon: "FL",
      notes: "实际登录页标题为 Cloud Mail，元信息说明它是支持发信、可部署在 Cloudflare 的 Serverless 邮箱。本次跳转登录页，未验证账号或收件状态；域名带 edu 不等于已核实学校身份。依据：https://mail.flame.edu.kg/login；2026-11-21。"
    },
    {
      id: "user-qq-agent",
      name: "QQ Agent Mail · 智能体邮箱",
      url: "https://agent.qq.com/page/list?alias_id=alias_lqNNiBpW-cM23Z1n588qj3gtquUDqnx-",
      description: "QQ 邮箱团队为 AI 智能体提供的专属邮箱服务，让智能体接入并收发邮件。",
      category: "mail",
      tags: ["QQ邮箱","Agent Mail","智能体邮箱","邮件收发","Agent接入","腾讯"],
      icon: "QQ",
      notes: "实际页面标题为 Agent Mail，并明确说明“与个人邮箱隔离，原生适配 Agent”。原先写成“QQ 智能体列表”是错误理解，已更正名称、说明和分类。保留原 alias_id 深链接。依据：https://agent.qq.com/；2026-11-21。"
    },
    {
      id: "user-esim-gg",
      name: "eSIM.gg · 爱沙尼亚线路",
      url: "https://esim.gg/lines/ee/37254143017",
      description: "已收藏的爱沙尼亚 eSIM 电话线路入口，用于返回号码线路与通信服务管理。",
      category: "mail",
      tags: ["eSIM.gg","爱沙尼亚eSIM","电话线路","手机号","移动数据","短信","通话"],
      icon: "ES",
      notes: "官网说明其产品是带爱沙尼亚 +372 号码的预付费 eSIM，支持移动数据、短信和通话；与一次性接码号码分开。此链接指向具体线路，不在卡片文字中展开私人号码；未核实该线路余额和状态。依据：https://esim.gg/；2026-11-21。"
    },
    {
      id: "user-tiger-sms",
      name: "Tiger SMS · 临时号码接码",
      url: "https://tiger-sms.com/cn/cabinet/sms",
      description: "按国家和目标服务获取临时电话号码，用于在线接收短信验证码并查看接码记录。",
      category: "mail",
      tags: ["Tiger SMS","老虎接码","临时号码","短信验证码","接码记录"],
      icon: "TI",
      notes: "入口类型：Tiger SMS 接码控制台。官网将号码定义为一次激活使用的临时号码，不等同于长期持有的个人手机卡或 eSIM 线路；未购买号码或核查账号余额。依据：https://tiger-sms.com/cn；2026-11-21。"
    },

    // --- 4. 社区与内容 (6 卷) ---
    {
      id: "learn-bilibili",
      name: "哔哩哔哩",
      url: "https://www.bilibili.com",
      description: "观看 UP 主视频、教程、番剧和娱乐内容，并通过弹幕、评论与社区互动。",
      category: "social",
      tags: ["哔哩哔哩","B站","bilibili","视频","弹幕","教程","娱乐"],
      icon: "哔",
      notes: "入口类型：哔哩哔哩综合视频平台，内容不只包含公开课或学术讲座。保留原中文首页链接；本站访问地区可能导致页面显示其他语言。依据：https://www.bilibili.com/；2026-11-21。"
    },
    {
      id: "learn-youtube",
      name: "YouTube",
      url: "https://www.youtube.com/",
      description: "观看和搜索视频、音乐、教程与创作者频道，也可上传自己的视频内容。",
      category: "social",
      tags: ["YouTube","视频","频道","教程","音乐","创作者"],
      icon: "YT",
      notes: "入口类型：YouTube 视频平台首页。内容同时包含学习、娱乐与创作，因此归入视频与阅读，不把整个平台限定为课程站。依据：https://www.youtube.com/；2026-11-21。"
    },
    {
      id: "social-mwrkkhqa",
      name: "LinuxDo",
      url: "https://linux.do/",
      description: "",
      category: "social",
      tags: [],
      icon: "LI",
      createdAt: 1795335780034
    },
    {
      id: "social-telegram",
      name: "Telegram",
      url: "https://web.telegram.org/",
      description: "Telegram 网页版，在浏览器中收发私聊消息、参与群组并阅读频道内容。",
      category: "social",
      tags: ["Telegram","电报","网页聊天","私聊","群组","频道"],
      icon: "TG",
      notes: "入口类型：Telegram Web 聊天应用。此收藏直接进入网页版，而不是下载页或机器人开发文档。依据：https://web.telegram.org/、https://telegram.org/；2026-11-21。"
    },
    {
      id: "social-x",
      name: "X",
      url: "https://x.com/",
      description: "浏览和发布公开动态，关注账号与话题，参与实时资讯和社区讨论。",
      category: "social",
      tags: ["X","Twitter","推特","公开动态","话题","社交网络"],
      icon: "X",
      notes: "入口类型：X 社交平台首页，原称 Twitter。用于追踪公开动态和讨论，不是技术文档或即时通讯收件箱。依据：https://about.x.com/；2026-11-21。"
    },
    {
      id: "social-discord",
      name: "Discord",
      url: "https://discord.com/",
      description: "围绕服务器和频道组织的聊天社群平台，支持文字、语音、视频与屏幕分享。",
      category: "social",
      tags: ["Discord","社群","频道","文字聊天","语音","屏幕分享"],
      icon: "DC",
      notes: "入口类型：Discord 官网，可打开网页版或下载客户端。适合加入项目社群、参与讨论和语音沟通；不归入电子邮箱。依据：https://discord.com/；2026-11-21。"
    },

    // --- 5. 学习与资源 (9 卷) ---
    {
      id: "learn-scholar",
      name: "谷歌学术",
      url: "https://scholar.google.com/",
      description: "跨出版社和学科检索论文、图书等学术文献，并查看引用、相关研究与作者资料。",
      category: "knowledge",
      tags: ["谷歌学术","Google Scholar","学术搜索","论文","引用","作者"],
      icon: "GS",
      notes: "入口类型：学术搜索引擎，适合发现文献与追踪引用。搜索结果不代表所有论文都可直接免费下载，全文获取取决于原站或学校权限。依据：https://scholar.google.com/；2026-11-21。"
    },
    {
      id: "learn-ecut-atrust",
      name: "东华理工 · aTrust 校园 VPN",
      url: "https://atrust1.ecut.edu.cn/portal/#/app_center",
      description: "东华理工大学的校外访问入口，登录校园身份后访问学校授权开放的内网资源。",
      category: "knowledge",
      tags: ["东华理工大学","ECUT","aTrust","校园VPN","校外访问","CAS"],
      icon: "VP",
      notes: "入口类型：校园 aTrust 访问门户，学校官网提供 VPN 登录入口。此链接会跳转至校园 CAS 身份认证；具体可访问系统和数据库由学校授权决定，未登录验证。依据：https://www.ecut.edu.cn/main.htm、https://atrust1.ecut.edu.cn/；2026-11-21。"
    },
    {
      id: "learn-ecut-ehall",
      name: "东华理工 · 网上办事大厅",
      url: "https://ehall.ecut.edu.cn/new/index.html",
      description: "东华理工大学师生在线办事门户，按学生办事、教师办事等入口查找校园服务。",
      category: "knowledge",
      tags: ["东华理工大学","ECUT","网上办事大厅","学生办事","教师办事","校园服务"],
      icon: "办",
      notes: "实际页面显示学生办事、教师办事和游客浏览，具体可办事项需校园账号登录后查看。因此不再未经验证地承诺能直接查成绩或课表。依据：https://ehall.ecut.edu.cn/new/index.html；2026-11-21。"
    },
    {
      id: "learn-cnki",
      name: "中国知网",
      url: "https://www.cnki.net/",
      description: "检索中文期刊、学位论文、会议论文等学术资源，查摘要并按权限获取全文。",
      category: "knowledge",
      tags: ["中国知网","CNKI","中文论文","期刊","学位论文","文献检索"],
      icon: "知",
      notes: "入口类型：CNKI 学术数据库。找中文文献时使用，全文权限取决于账号、机构订阅或单篇授权。本次 www.cnki.net 按访问地区跳到海外站，未改收藏地址。依据：https://www.cnki.net/；2026-11-21。"
    },
    {
      id: "learn-ecut",
      name: "东华理工大学",
      url: "https://www.ecut.edu.cn/main.htm",
      description: "东华理工大学官方网站，查学校公告、院系机构、教学科研和校园服务入口。",
      category: "knowledge",
      tags: ["东华理工大学","ECUT","学校官网","通知公告","院系","校园"],
      icon: "东",
      notes: "入口类型：学校门户。官网上可见网上办事大厅、VPN 登录等入口；校园事务办理和校外访问另设独立收藏，方便直接进入。依据：https://www.ecut.edu.cn/main.htm；2026-11-21。"
    },
    {
      id: "user-sci-hub",
      name: "Sci-Hub · 论文全文",
      url: "https://www.sci-hub.ru/",
      description: "通过论文标识或链接查找学术论文全文的入口，侧重获取文献而非引用统计。",
      category: "knowledge",
      tags: ["Sci-Hub","论文全文","DOI","学术文献","文献获取"],
      icon: "SC",
      notes: "入口类型：Sci-Hub 文献全文站。与 Google 学术的广泛检索、引用追踪区别归类；能否取得某篇论文取决于其收录。依据：https://www.sci-hub.ru/；2026-11-21。"
    },
    {
      id: "user-tutor-chat",
      name: "DeepTutor · 学习辅导",
      url: "https://tutor.sueexin.dev/chat?dt_workspace=",
      description: "自建 DeepTutor 学习辅导工作区，围绕学习资料开展问答、讲解和知识整理。",
      category: "knowledge",
      tags: ["DeepTutor","学习辅导","资料问答","知识整理","自建学习助手"],
      icon: "TU",
      notes: "实际站点标题为 DeepTutor，描述为 Agent-native intelligent learning companion；官方项目定位为个性化学习辅导。本次进入登录页，未确认此部署启用了哪些模块；dt_workspace 参数当前为空，不代表指定了某个工作区。依据：https://tutor.sueexin.dev/、https://github.com/HKUDS/DeepTutor；2026-11-21。"
    },
    {
      id: "tool-tinypng",
      name: "TinyPNG",
      url: "https://tinypng.com",
      description: "在线压缩和转换图片，减小 PNG、JPEG、WebP、AVIF 等文件的体积。",
      category: "knowledge",
      tags: ["TinyPNG","Tinify","图片压缩","智能有损","PNG","JPEG","WebP","AVIF"],
      icon: "PNG",
      notes: "入口类型：图片优化工具。官网明确使用 smart lossy compression，即智能有损压缩；视觉差异可很小，但不等于数学意义的无损，已纠正旧注释。依据：https://tinypng.com/；2026-11-21。"
    },
    {
      id: "tool-cobalt",
      name: "cobalt",
      url: "https://cobalt.tools/",
      description: "粘贴受支持平台的媒体链接，保存视频或音频，并按需选择音频或静音输出。",
      category: "knowledge",
      tags: ["cobalt","媒体下载","视频下载","音频下载","链接解析"],
      icon: "CO",
      notes: "入口类型：媒体下载工具，不是视频内容社区。页面提供 auto、audio、mute 等选项；能否下载取决于平台支持和内容可访问性，不再泛称能“去水印”。依据：https://cobalt.tools/；2026-11-21。"
    },

    // --- 6. 笔记与绘图 (1 卷) ---
    {
      id: "tool-notion",
      name: "Notion",
      url: "https://www.notion.so",
      description: "用页面和数据库整理笔记、知识资料、任务与项目，并与他人协作。",
      category: "tools",
      tags: ["Notion","笔记","页面","数据库","知识管理","项目协作"],
      icon: "NO",
      notes: "入口类型：Notion 工作区入口，登录后进入个人或团队页面。这里用于编辑和组织资料，不是论文搜索引擎。依据：https://www.notion.so/；2026-11-21。"
    },

    // --- 7. 代码与开发文档 (1 卷) ---
    {
      id: "dev-github",
      name: "GitHub",
      url: "https://github.com",
      description: "查找和托管代码仓库，跟踪提交、Issue、Pull Request 与自动化工作流。",
      category: "dev",
      tags: ["GitHub","代码仓库","Git","开源","Issue","Pull Request","Actions"],
      icon: "GH",
      notes: "入口类型：GitHub 首页，登录后可进入个人工作台。用于找开源项目、读源码和协作开发；与应用正式部署入口分开。依据：https://github.com/；2026-11-21。"
    },

    // --- 8. AI 与自动化 (7 卷) ---
    {
      id: "ai-muse",
      name: "Muse",
      url: "https://muse.ai",
      description: "Meta 的个人 AI 智能体，在独立云电脑中执行任务，并可连接邮箱、日历等应用。",
      category: "ai",
      tags: ["Muse","Meta","AI智能体","云电脑","个人助手","应用连接"],
      icon: "MU",
      notes: "已实际打开 muse.ai，当前官网标题为 Muse — Your Personal AI Agent from Meta，并介绍 Secure VM 和操作审批。按当前页面用途归类，不沿用该域名过去的其他产品印象。依据：https://muse.ai/；2026-11-21。"
    },
    {
      id: "ai-gemini",
      name: "Gemini",
      url: "https://gemini.google.com/u/2/",
      description: "Google 多模态大模型助手，深度整合搜索与云端文档",
      category: "ai",
      tags: ["ai","gemini","谷歌","大模型","多模态"],
      icon: "GM",
      notes: "入口类型：Gemini 网页应用，与面向开发者的 Google AI Studio 分开。保留收藏中的 /u/2/ 账户路径；Google 可能按当前登录状态重新选择账号。依据：https://gemini.google.com/；2026-11-21。"
    },
    {
      id: "ai-hark",
      name: "Hark",
      url: "https://hark.com",
      description: "具备记忆和浏览器操作能力的 AI 助手，可执行调研、网页制作和日常事务。",
      category: "ai",
      tags: ["Hark","AI智能体","电脑操作","浏览器任务","Handoff","个人助手"],
      icon: "HK",
      notes: "入口类型：Hark 产品首页。官网介绍 Handoff 独立电脑、Projects 和自定义 Panels；重点是让智能体执行任务，不只是问答。具体连接账号和执行动作仍需进入应用。依据：https://hark.com/；2026-11-21。"
    },
    {
      id: "ai-chatgpt",
      name: "ChatGPT",
      url: "https://chatgpt.com",
      description: "OpenAI 的对话工作台，用于提问、写作、编程，以及分析文件和图片。",
      category: "ai",
      tags: ["ChatGPT","OpenAI","AI聊天","写作","编程","文件分析"],
      icon: "GPT",
      notes: "入口类型：网页对话应用。适合直接向 AI 提交问题和材料；模型 API 的密钥、计费与接入不在此管理。依据：https://chatgpt.com/；核对日期：2026-11-21。"
    },
    {
      id: "ai-deepseek",
      name: "DeepSeek",
      url: "https://www.deepseek.com",
      description: "DeepSeek 官方首页，用于了解模型并寻找网页对话、应用下载和开放平台入口。",
      category: "ai",
      tags: ["DeepSeek","深度求索","官方首页","模型","AI聊天入口"],
      icon: "DS",
      notes: "当前收藏的是 www.deepseek.com 官网，不是 platform.deepseek.com 开发者后台。本次官网出现客户端加载错误；API 平台登录页已核实。保留原始链接，未擅自替换成聊天地址。依据：https://www.deepseek.com/、https://platform.deepseek.com/；2026-11-21。"
    },
    {
      id: "ai-claude",
      name: "Claude",
      url: "https://claude.ai",
      description: "Anthropic 的 AI 助手，用于文档阅读、写作、代码分析和生成可继续编辑的内容。",
      category: "ai",
      tags: ["Claude","Anthropic","AI聊天","文档阅读","写作","代码"],
      icon: "CL",
      notes: "入口类型：Claude 网页应用。功能依据官方产品说明核实；claude.ai 本次触发安全校验，未进入个人会话或确认账号方案。依据：https://claude.com/product/overview；2026-11-21。"
    },
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
