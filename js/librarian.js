/**
 * Module: D1 「守馆人 AI · 司天监」索书框 Agent 终端 (js/librarian.js)
 *
 * 职责：
 * 1. `?` 前缀 · 懂全馆藏书的 RAG 顾问（含正式馆藏 + 待编目匣），羊皮纸浮层流式批注 + 微缩藏书票推荐条。
 * 2. `!` 前缀 · 就地处决轻任务，原地羊皮纸浮层流式吐出解答 / 代码块，可复制、可存入活字秘卷匣。
 * 3. 「司天监密钥」本地安全配置（API Base URL / Key / Model），持久化于 MYNAV_LEDGER_V2.aiConfig。
 *
 * 免 Key 确定性兜底：未配置 API Key、离线或 Playwright 测试环境下，
 * 自动降级为本地多维加权检索引擎 + 预设极客指令沙盒，永不因网络或未填 Key 阻塞。
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavLibrarian = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MODE_RAG = "?";
  const MODE_EXEC = "!";
  const MAX_CARDS = 3;
  const DEFAULT_AI_CONFIG = {
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    model: "deepseek-chat"
  };

  // --------------------------------------------------------------------------
  // 语义簇：把口语化提问扩散到馆藏可命中的检索词，纯本地、确定性、零依赖。
  // --------------------------------------------------------------------------
  const SEMANTIC_CLUSTERS = [
    {
      id: "map",
      keys: ["切图", "瓦片", "地图", "地圖", "地理", "坐标", "gis", "map", "tile", "leaflet", "maplibre", "mbtiles", "geojson", "图层", "测绘", "可视化"],
      terms: ["地图", "切图", "瓦片", "gis", "map", "tile", "地理", "坐标", "可视化", "图层"]
    },
    {
      id: "code",
      keys: ["代码", "编程", "开发", "仓库", "开源", "部署", "调试", "脚本", "正则", "前端", "后端", "api", "git", "github", "docker", "linux", "服务器"],
      terms: ["代码", "开发", "开源", "仓库", "部署", "调试", "脚本", "git", "github", "api", "前端", "标准", "规范"]
    },
    {
      id: "ai",
      keys: ["ai", "模型", "大模型", "对话", "写作", "生成", "提示词", "prompt", "llm", "助手", "智能"],
      terms: ["ai", "模型", "对话", "生成", "写作", "助手", "智能", "prompt"]
    },
    {
      id: "design",
      keys: ["设计", "配色", "图片", "图像", "压缩", "图标", "svg", "png", "ui", "素材"],
      terms: ["设计", "配色", "图片", "图像", "压缩", "图标", "svg", "png", "ui"]
    },
    {
      id: "study",
      keys: ["学习", "教程", "课程", "文档", "论文", "检索", "考试", "校园", "题库", "研习", "文献"],
      terms: ["学习", "教程", "课程", "文档", "论文", "检索", "校园", "学术"]
    },
    {
      id: "efficiency",
      keys: ["效率", "笔记", "知识库", "待办", "协作", "表格", "流程图", "整理", "收藏", "备忘"],
      terms: ["效率", "笔记", "知识库", "文档", "协作", "流程", "整理"]
    },
    {
      id: "network",
      keys: ["网络", "节点", "代理", "vps", "服务器", "域名", "dns", "隧道", "转发", "探针", "连通"],
      terms: ["网络", "节点", "代理", "服务器", "域名", "dns", "转发", "探针", "部署", "云"]
    },
    {
      id: "media",
      keys: ["视频", "下载", "音乐", "音频", "字幕", "录屏", "剪辑"],
      terms: ["视频", "下载", "音频", "字幕", "媒体"]
    }
  ];

  // --------------------------------------------------------------------------
  // 预设极客指令沙盒：未配置 Key 时的确定性速查库（端口转发 / Git / 正则 / Docker 等）。
  // --------------------------------------------------------------------------
  const EXEC_RECIPES = [
    {
      id: "port-forward",
      title: "端口转发",
      keywords: ["端口转发", "端口", "转发", "forward", "iptables", "nat", "443", "8080", "socat", "listen"],
      build: function (query) {
        const ports = String(query || "").match(/\d{2,5}/g) || [];
        const src = ports[0] || "443";
        const dst = ports[1] || "8080";
        return [
          "轻任务就地处决 · 端口转发 " + src + " → " + dst,
          "",
          "方案一 · iptables NAT（内核态，零额外进程，重启后需 iptables-persistent 固化）",
          "```bash",
          "sudo sysctl -w net.ipv4.ip_forward=1",
          "echo 'net.ipv4.ip_forward=1' | sudo tee /etc/sysctl.d/99-mynav-forward.conf",
          "",
          "sudo iptables -t nat -A PREROUTING -p tcp --dport " + src + " -j DNAT --to-destination 127.0.0.1:" + dst,
          "sudo iptables -t nat -A OUTPUT -p tcp -o lo --dport " + src + " -j DNAT --to-destination 127.0.0.1:" + dst,
          "```",
          "",
          "方案二 · socat（用户态，临时演练最省心）",
          "```bash",
          "sudo apt-get install -y socat",
          "socat TCP-LISTEN:" + src + ",fork,reuseaddr TCP:127.0.0.1:" + dst,
          "```",
          "",
          "方案三 · nginx stream（长期驻留，便于日志与限流）",
          "```nginx",
          "stream {",
          "    server {",
          "        listen " + src + ";",
          "        proxy_pass 127.0.0.1:" + dst + ";",
          "        proxy_timeout 10m;",
          "    }",
          "}",
          "```",
          "",
          "校验",
          "```bash",
          "ss -lntp | grep -E ':(" + src + "|" + dst + ")'",
          "curl -I http://127.0.0.1:" + dst,
          "```"
        ].join("\n");
      }
    },
    {
      id: "git-undo",
      title: "Git 撤销",
      keywords: ["git", "撤销", "回退", "回滚", "reset", "revert", "提交", "commit", "rebase"],
      build: function () {
        return [
          "轻任务就地处决 · Git 撤销与回退速查",
          "",
          "1) 撤销工作区未暂存的改动（不可恢复，请先确认）",
          "```bash",
          "git restore <file>          # 单个文件",
          "git restore .               # 全部工作区",
          "```",
          "",
          "2) 撤销已 git add 的暂存",
          "```bash",
          "git restore --staged <file>",
          "```",
          "",
          "3) 撤销最近一次提交但保留改动",
          "```bash",
          "git reset --soft HEAD~1",
          "```",
          "",
          "4) 已推送的提交要安全回退（生成反向提交，不改写历史）",
          "```bash",
          "git revert <sha>",
          "```",
          "",
          "5) 误删分支 / 误 reset 后的救援",
          "```bash",
          "git reflog                  # 找到目标 sha",
          "git branch rescue <sha>",
          "```"
        ].join("\n");
      }
    },
    {
      id: "docker",
      title: "Docker 常用命令",
      keywords: ["docker", "容器", "镜像", "compose", "k8s", "kubernetes", "编排"],
      build: function () {
        return [
          "轻任务就地处决 · Docker 常用命令速查",
          "",
          "```bash",
          "docker ps -a                      # 含已停止容器",
          "docker logs -f --tail 100 <name>  # 跟踪日志",
          "docker exec -it <name> sh         # 进入容器",
          "docker stats --no-stream          # 一次性资源快照",
          "docker system df                  # 磁盘占用总览",
          "docker system prune -a --volumes  # 深度清理（谨慎）",
          "```",
          "",
          "compose 编排要点",
          "```bash",
          "docker compose up -d --build",
          "docker compose logs -f --tail 80",
          "docker compose down --remove-orphans",
          "```",
          "",
          "排查思路：先看 `docker compose config` 展开后的最终配置，再看容器内 DNS 与网络别名。"
        ].join("\n");
      }
    },
    {
      id: "regex",
      title: "正则速查",
      keywords: ["正则", "regex", "regexp", "匹配", "pattern", "表达式"],
      build: function () {
        return [
          "轻任务就地处决 · 正则速查与调试",
          "",
          "```text",
          "^\\d{4}-\\d{2}-\\d{2}$          # 严格 ISO 日期",
          "[\\u4e00-\\u9fa5]+               # 连续中文",
          "(?<=№\\s)\\d{2}                 # 断言：索书号两位数字",
          "https?:\\/\\/[^\\s]+            # URL",
          "```",
          "",
          "JavaScript 中使用",
          "```javascript",
          "const re = /(?<year>\\d{4})-(?<month>\\d{2})-(?<day>\\d{2})/g;",
          "const hits = [...text.matchAll(re)].map(m => m.groups);",
          "```",
          "",
          "提示：正则引擎差异集中在回溯与 `\\b` 的 Unicode 语义，跨语言移植前先用小样本回归。"
        ].join("\n");
      }
    },
    {
      id: "http",
      title: "HTTP 请求调试",
      keywords: ["curl", "http", "请求", "接口", "api", "状态码", "header", "post"],
      build: function () {
        return [
          "轻任务就地处决 · HTTP 请求调试",
          "",
          "```bash",
          "curl -sS -D - -o /dev/null https://example.com        # 只看响应头",
          "curl -sS -X POST https://api.example.com/v1/items \\",
          "  -H 'Content-Type: application/json' \\",
          "  -H 'Authorization: Bearer $TOKEN' \\",
          "  -d '{\"name\":\"mynav\"}'",
          "curl -sS --retry 3 --retry-delay 1 --max-time 10 <url>",
          "```",
          "",
          "排障顺序：DNS → TCP 握手 → TLS → 状态码 → 响应体。`curl -v` 的输出顺序就是这个链路。"
        ].join("\n");
      }
    },
    {
      id: "nginx",
      title: "Nginx 反向代理",
      keywords: ["nginx", "反向代理", "proxy", "证书", "ssl", "tls", "证书", "重定向"],
      build: function () {
        return [
          "轻任务就地处决 · Nginx 反向代理模板",
          "",
          "```nginx",
          "server {",
          "    listen 443 ssl http2;",
          "    server_name example.com;",
          "",
          "    ssl_certificate     /etc/letsencrypt/live/example.com/fullchain.pem;",
          "    ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;",
          "",
          "    location / {",
          "        proxy_pass http://127.0.0.1:8080;",
          "        proxy_set_header Host $host;",
          "        proxy_set_header X-Real-IP $remote_addr;",
          "        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;",
          "        proxy_set_header X-Forwarded-Proto $scheme;",
          "    }",
          "}",
          "```",
          "",
          "改动后固定动作：`nginx -t && nginx -s reload`。"
        ].join("\n");
      }
    },
    {
      id: "systemd",
      title: "systemd 常驻服务",
      keywords: ["systemd", "服务", "常驻", "守护", "开机自启", "service", "daemon"],
      build: function () {
        return [
          "轻任务就地处决 · systemd 常驻服务模板",
          "",
          "```ini",
          "[Unit]",
          "Description=mynav relay",
          "After=network-online.target",
          "",
          "[Service]",
          "Type=simple",
          "ExecStart=/usr/local/bin/relay --port 8080",
          "Restart=always",
          "RestartSec=3",
          "StandardOutput=journal",
          "StandardError=journal",
          "",
          "[Install]",
          "WantedBy=multi-user.target",
          "```",
          "",
          "```bash",
          "sudo systemctl daemon-reload",
          "sudo systemctl enable --now relay.service",
          "journalctl -u relay.service -f --since '10 min ago'",
          "```"
        ].join("\n");
      }
    },
    {
      id: "kill-port",
      title: "端口占用排查",
      keywords: ["占用", "端口被占", "kill", "lsof", "netstat", "ss", "pid", "进程"],
      build: function (query) {
        const ports = String(query || "").match(/\d{2,5}/g) || [];
        const port = ports[0] || "8080";
        return [
          "轻任务就地处决 · 端口 " + port + " 占用排查",
          "",
          "```bash",
          "ss -lntp | grep ':" + port + "'",
          "lsof -iTCP:" + port + " -sTCP:LISTEN -n -P",
          "fuser -n tcp " + port,
          "```",
          "",
          "确认后按 PID 收束（优先 TERM，再 KILL）",
          "```bash",
          "kill -TERM <pid>",
          "kill -KILL <pid>",
          "```",
          "",
          "Windows 等价：`netstat -ano | findstr :" + port + "` 后 `taskkill /PID <pid> /F`。"
        ].join("\n");
      }
    },
    {
      id: "cron",
      title: "定时任务",
      keywords: ["cron", "定时", "计划任务", "schedule", "每天", "周期"],
      build: function () {
        return [
          "轻任务就地处决 · 定时任务速查",
          "",
          "```bash",
          "crontab -e",
          "```",
          "",
          "```text",
          "# 分 时 日 月 周",
          "*/15 * * * *   /usr/local/bin/healthcheck.sh >> /var/log/healthcheck.log 2>&1",
          "0 4 * * *      /usr/local/bin/backup.sh",
          "30 9 * * 1-5   /usr/local/bin/report.sh",
          "```",
          "",
          "要点：cron 环境变量极简，脚本内请写绝对路径，并把 stderr 重定向到日志，否则失败会静默。"
        ].join("\n");
      }
    },
    {
      id: "ssh",
      title: "SSH 与密钥",
      keywords: ["ssh", "密钥", "key", "免密", "隧道", "tunnel", "端口映射"],
      build: function () {
        return [
          "轻任务就地处决 · SSH 密钥与隧道",
          "",
          "```bash",
          "ssh-keygen -t ed25519 -C 'mynav@local' -f ~/.ssh/id_ed25519_mynav",
          "ssh-copy-id -i ~/.ssh/id_ed25519_mynav.pub user@host",
          "ssh -o BatchMode=yes -o ConnectTimeout=6 user@host 'uptime'",
          "```",
          "",
          "本地转发（把远端 8080 拉到本机 18080）",
          "```bash",
          "ssh -N -L 18080:127.0.0.1:8080 user@host",
          "```",
          "",
          "长连接保活建议写入 `~/.ssh/config`：`ServerAliveInterval 30` 与 `ServerAliveCountMax 3`。"
        ].join("\n");
      }
    },
    {
      id: "base64",
      title: "编码与摘要",
      keywords: ["base64", "编码", "解码", "摘要", "hash", "sha256", "md5", "url编码"],
      build: function () {
        return [
          "轻任务就地处决 · 编码与摘要",
          "",
          "```bash",
          "printf '%s' '中文 Base64 hello' | base64",
          "printf '%s' '5Lit5paHIEJhc2U2NCBoZWxsbw==' | base64 -d",
          "printf '%s' 'Mynav 中文' | sha256sum",
          "python3 -c \"import urllib.parse,sys;print(urllib.parse.quote(sys.argv[1]))\" '中文 参数'",
          "```",
          "",
          "浏览器侧无需外站，本馆「黄铜工具尺 · 译码转盘」已内置 UTF-8 安全的 Base64 / URL / JSON / JWT 与 Web Crypto SHA-256。"
        ].join("\n");
      }
    },
    {
      id: "json",
      title: "JSON 处理",
      keywords: ["json", "格式化", "解析", "jq", "压缩"],
      build: function () {
        return [
          "轻任务就地处决 · JSON 处理",
          "",
          "```bash",
          "jq . payload.json                       # 美化",
          "jq -c . payload.json                    # 压缩",
          "jq '.items[] | select(.status==\"ok\")' payload.json",
          "jq -r '.items | length' payload.json",
          "```",
          "",
          "JavaScript 侧安全解析",
          "```javascript",
          "try { const data = JSON.parse(text); } catch (error) { console.warn('JSON 解析失败', error.message); }",
          "```"
        ].join("\n");
      }
    },
    {
      id: "sql",
      title: "SQL 速查",
      keywords: ["sql", "查询", "数据库", "索引", "join", "select"],
      build: function () {
        return [
          "轻任务就地处决 · SQL 速查",
          "",
          "```sql",
          "-- 按分组取最近一条（窗口函数）",
          "SELECT * FROM (",
          "  SELECT *, ROW_NUMBER() OVER (PARTITION BY site_id ORDER BY visited_at DESC) AS rn",
          "  FROM visits",
          ") t WHERE t.rn = 1;",
          "",
          "-- 慢查询定位",
          "EXPLAIN ANALYZE SELECT ... ;",
          "```",
          "",
          "索引经验：等值列在前、范围列在后；高基数列优先建索引。"
        ].join("\n");
      }
    }
  ];

  // --------------------------------------------------------------------------
  // 内部状态
  // --------------------------------------------------------------------------
  let folio = null;
  let input = null;
  let outputEl = null;
  let cardsEl = null;
  let statusEl = null;
  let modeBadge = null;
  let bound = false;
  let opened = false;

  let streamTimer = null;
  let streamSpeedMs = 14;
  let streamState = { active: false, full: "", index: 0, resolvers: [] };

  let currentMode = MODE_RAG;
  let currentRaw = "";
  let lastResult = "";
  let lastCards = [];
  let lastSource = "local";
  let busy = false;

  // --------------------------------------------------------------------------
  // 工具函数
  // --------------------------------------------------------------------------
  function escapeHtml(value) {
    return String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function notify(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "🔭");
    }
  }

  function getAiConfig() {
    if (window.NavLedger && typeof window.NavLedger.getAiConfig === "function") {
      const cfg = window.NavLedger.getAiConfig();
      return {
        baseUrl: String(cfg.baseUrl || DEFAULT_AI_CONFIG.baseUrl),
        apiKey: String(cfg.apiKey || ""),
        model: String(cfg.model || DEFAULT_AI_CONFIG.model)
      };
    }
    return Object.assign({}, DEFAULT_AI_CONFIG);
  }

  function setAiConfig(patch) {
    if (window.NavLedger && typeof window.NavLedger.setAiConfig === "function") {
      return window.NavLedger.setAiConfig(patch || {});
    }
    return getAiConfig();
  }

  function hasApiKey() {
    return getAiConfig().apiKey.trim().length > 0;
  }

  function siteName(site) {
    return String((site && (site.name || site.title || site.id)) || "未命名馆藏");
  }

  function siteDesc(site) {
    return String((site && (site.description || site.desc || "")) || "");
  }

  function siteTags(site) {
    return Array.isArray(site && site.tags) ? site.tags.map(String) : [];
  }

  function siteHost(site) {
    try {
      return new URL(site.url).hostname.replace(/^www\./, "");
    } catch (error) {
      return String((site && site.url) || "");
    }
  }

  function categoryName(site) {
    const categories = window.NavApp && typeof window.NavApp.getCategories === "function"
      ? window.NavApp.getCategories()
      : [];
    const hit = categories.find(function (cat) { return cat.id === site.category; });
    return hit ? hit.name : String(site.category || "未分类");
  }

  // --------------------------------------------------------------------------
  // 前缀判定
  // --------------------------------------------------------------------------
  function isLibrarianQuery(value) {
    const raw = String(value || "").trimStart();
    return raw.charAt(0) === MODE_RAG || raw.charAt(0) === MODE_EXEC;
  }

  function modeOf(value) {
    const raw = String(value || "").trimStart();
    return raw.charAt(0) === MODE_EXEC ? MODE_EXEC : MODE_RAG;
  }

  function payloadOf(value) {
    return String(value || "").trimStart().slice(1).trim();
  }

  // --------------------------------------------------------------------------
  // 本地多维加权检索引擎（title / desc / tags / whySaved / notes 全字段）
  // --------------------------------------------------------------------------
  function collectCorpus() {
    const catalogued = window.NavApp && typeof window.NavApp.getAllSites === "function"
      ? window.NavApp.getAllSites()
      : [];
    const uncatalogued = window.NavApp && typeof window.NavApp.getUncataloguedSites === "function"
      ? window.NavApp.getUncataloguedSites()
      : [];
    const seen = new Set();
    const list = [];
    catalogued.forEach(function (site) {
      if (!site || seen.has(site.id)) return;
      seen.add(site.id);
      list.push({ site: site, status: "catalogued" });
    });
    uncatalogued.forEach(function (site) {
      if (!site || seen.has(site.id)) return;
      seen.add(site.id);
      list.push({ site: site, status: "uncatalogued" });
    });
    return list;
  }

  function activeClusters(query) {
    const q = String(query || "").toLowerCase();
    return SEMANTIC_CLUSTERS.filter(function (cluster) {
      return cluster.keys.some(function (key) { return q.indexOf(key.toLowerCase()) >= 0; });
    });
  }

  function fieldWeight(entry, term) {
    const site = entry.site;
    const q = String(term || "").toLowerCase();
    if (!q) return 0;
    let score = 0;
    const name = siteName(site).toLowerCase();
    const desc = siteDesc(site).toLowerCase();
    const tags = siteTags(site).map(function (tag) { return tag.toLowerCase(); });
    const why = String(site.whySaved || "").toLowerCase();
    const notes = String(site.notes || "").toLowerCase();
    const host = siteHost(site).toLowerCase();

    if (name === q) score += 240;
    else if (name.indexOf(q) >= 0) score += 130;
    if (tags.indexOf(q) >= 0) score += 90;
    else if (tags.some(function (tag) { return tag.indexOf(q) >= 0; })) score += 55;
    if (desc.indexOf(q) >= 0) score += 34;
    if (host.indexOf(q) >= 0) score += 40;
    if (why.indexOf(q) >= 0) score += 26;
    if (notes.indexOf(q) >= 0) score += 16;
    return score;
  }

  function scoreEntry(entry, query) {
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    if (words.length === 0) return 0;
    let score = 0;
    let matched = 0;
    words.forEach(function (word) {
      const direct = fieldWeight(entry, word);
      if (direct > 0) matched += 1;
      score += direct;
    });
    // 语义簇扩散：口语提问（如「切图」「瓦片」）映射到馆藏真实标签与简介。
    activeClusters(query).forEach(function (cluster) {
      cluster.terms.forEach(function (term) {
        const s = fieldWeight(entry, term);
        if (s > 0) {
          matched += 0.5;
          score += Math.round(s * 0.42);
        }
      });
    });
    // 待编目匣的「收录动机」本身就是意图声明，命中时额外加权。
    if (entry.status === "uncatalogued") {
      const why = String(entry.site.whySaved || "").toLowerCase();
      words.forEach(function (word) {
        if (word && why.indexOf(word) >= 0) score += 30;
      });
    }
    entry.matched = matched;
    return score;
  }

  function recommend(query, limit) {
    const corpus = collectCorpus();
    const scored = corpus
      .map(function (entry) {
        return { entry: entry, score: scoreEntry(entry, query) };
      })
      .filter(function (item) { return item.score > 0; })
      .sort(function (a, b) {
        if (b.score !== a.score) return b.score - a.score;
        return String(a.entry.site.id).localeCompare(String(b.entry.site.id));
      });
    return scored.slice(0, Math.max(1, Number(limit) || MAX_CARDS));
  }

  function reasonFor(entry, query) {
    const site = entry.site;
    const words = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
    const tags = siteTags(site);
    const desc = siteDesc(site);
    const why = String(site.whySaved || "");

    const tagHit = tags.find(function (tag) {
      const t = tag.toLowerCase();
      return words.some(function (word) { return word && (t.indexOf(word) >= 0 || word.indexOf(t) >= 0); });
    });
    if (tagHit) return "标签 #" + tagHit + " 与所问切近，可直接上案头。";

    const descHit = words.find(function (word) { return word && desc.toLowerCase().indexOf(word) >= 0; });
    if (descHit) {
      const snippet = desc.length > 34 ? desc.slice(0, 34) + "…" : desc;
      return "简介提及「" + snippet + "」，正合馆主所询。";
    }
    if (why) {
      const short = why.length > 30 ? why.slice(0, 30) + "…" : why;
      return "收录动机：「" + short + "」";
    }
    const clusterHit = activeClusters(query)[0];
    if (clusterHit) return "语义簇「" + clusterHit.id + "」同轨，可作备选参详。";
    return "馆藏目录中与所问同轨，可作备选。";
  }

  // --------------------------------------------------------------------------
  // 批注与解答生成
  // --------------------------------------------------------------------------
  function buildLocalRagAnswer(query, picks) {
    const lines = [];
    lines.push("【司天监 · 馆长荐书批注】");
    lines.push("馆主垂询：" + query);
    lines.push("");
    if (picks.length === 0) {
      lines.push("按馆藏目录逐卷比勘，暂无与所问完全同轨之卷。");
      lines.push("谨荐改以更具体的用途描述相询，例如「地图切瓦片」「端口转发」「学术检索」等。");
      lines.push("");
      lines.push("※ 本批注由本地确定性检索引擎生成（未配置密钥），仅供案头参详。");
      return lines.join("\n");
    }
    const numerals = ["一", "二", "三"];
    lines.push("按馆藏目录逐卷比勘，得契合之器 " + picks.length + " 卷 ——");
    lines.push("");
    picks.forEach(function (item, index) {
      const site = item.entry.site;
      const badge = item.entry.status === "uncatalogued" ? "待编目匣 · " + (window.NavUncatalogued && typeof window.NavUncatalogued.getTmpNumber === "function"
        ? window.NavUncatalogued.getTmpNumber(site)
        : "TMP") : categoryName(site);
      lines.push(numerals[index] + "、《" + siteName(site) + "》（" + badge + " · " + siteHost(site) + "）");
      lines.push("    批注：" + reasonFor(item.entry, query));
      lines.push("");
    });
    lines.push("※ 本批注由本地确定性检索引擎生成（未配置密钥），仅供案头参详；接入密钥后可由司天监实时推演。");
    return lines.join("\n");
  }

  function pickRecipe(query) {
    let best = null;
    let bestScore = 0;
    const q = String(query || "").toLowerCase();
    EXEC_RECIPES.forEach(function (recipe) {
      let hits = 0;
      recipe.keywords.forEach(function (keyword) {
        if (q.indexOf(String(keyword).toLowerCase()) >= 0) hits += 1;
      });
      if (hits > bestScore) {
        bestScore = hits;
        best = recipe;
      }
    });
    return bestScore > 0 ? best : null;
  }

  function buildLocalExecAnswer(query) {
    const recipe = pickRecipe(query);
    const lines = [];
    if (recipe) {
      lines.push(recipe.build(query));
    } else {
      lines.push("轻任务就地处决 · " + query);
      lines.push("");
      lines.push("司天监本地沙盒未能确定最贴切的预设模板，谨呈当前可即时作答的速查门类：");
      lines.push("");
      EXEC_RECIPES.forEach(function (item, index) {
        lines.push(String(index + 1).padStart(2, "0") + ". " + item.title + " —— 关键词：" + item.keywords.slice(0, 4).join(" / "));
      });
      lines.push("");
      lines.push("改写提问时带上「端口转发 / git 撤销 / 正则 / docker / nginx / systemd」等门类词，即可直达对应模板。");
    }
    lines.push("");
    lines.push("※ 本条由本地确定性沙盒生成。如需实时推演，可点 [ ⚙️ 司天监密钥 ] 接入 DeepSeek / OpenAI 兼容接口。");
    return lines.join("\n");
  }

  function buildCatalogPrompt(picks, query) {
    const corpus = collectCorpus().slice(0, 80).map(function (entry) {
      return {
        id: entry.site.id,
        name: siteName(entry.site),
        url: entry.site.url,
        category: categoryName(entry.site),
        status: entry.status,
        desc: siteDesc(entry.site).slice(0, 90),
        tags: siteTags(entry.site).slice(0, 6),
        whySaved: String(entry.site.whySaved || "").slice(0, 60)
      };
    });
    return [
      "你是「守馆人 · 司天监」，一座私人数字收藏馆的馆长。语气古雅克制，不说空话。",
      "馆主会以自然语言询问该用哪个工具。你必须只从下面的馆藏目录中推荐，禁止编造不存在的条目。",
      "输出格式：先一段不超过 120 字的荐书批注，再逐条列出被选中的馆藏 id（每行一个，形如 `PICK: <id>`）。",
      "最多推荐 3 条，且必须包含至少 1 条。",
      "",
      "馆主所问：" + query,
      "",
      "馆藏目录 JSON：",
      JSON.stringify(corpus)
    ].join("\n");
  }

  function parsePickIds(text) {
    const ids = [];
    String(text || "").replace(/PICK:\s*([^\s`]+)/g, function (match, id) {
      ids.push(String(id).replace(/[`"'，。]/g, "").trim());
      return match;
    });
    return ids;
  }

  async function callLlm(messages) {
    const config = getAiConfig();
    if (!config.apiKey) return null;
    const endpoint = config.baseUrl.replace(/\/+$/, "") + "/chat/completions";
    const controller = new AbortController();
    const timer = setTimeout(function () { controller.abort(); }, 12000);
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer " + config.apiKey
        },
        body: JSON.stringify({
          model: config.model,
          messages: messages,
          stream: false,
          temperature: 0.4
        }),
        signal: controller.signal
      });
      if (!response || !response.ok) return null;
      const data = await response.json();
      const content = data && data.choices && data.choices[0] &&
        data.choices[0].message && data.choices[0].message.content;
      return content ? String(content) : null;
    } catch (error) {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  // --------------------------------------------------------------------------
  // 流式羊皮纸渲染
  // --------------------------------------------------------------------------
  function finishStream() {
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    streamState.active = false;
    if (outputEl && streamState.full) {
      outputEl.innerHTML = renderRich(streamState.full);
    }
    const resolvers = streamState.resolvers.splice(0, streamState.resolvers.length);
    resolvers.forEach(function (resolve) { resolve(true); });
  }

  function streamInto(element, text) {
    const target = element;
    const full = String(text || "");
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    streamState.active = true;
    streamState.full = full;
    streamState.index = 0;
    target.textContent = "";
    return new Promise(function (resolve) {
      streamState.resolvers.push(resolve);
      if (streamSpeedMs <= 0 || full.length === 0) {
        target.textContent = full;
        finishStream();
        return;
      }
      const step = Math.max(1, Math.ceil(full.length / 90));
      streamTimer = setInterval(function () {
        streamState.index = Math.min(full.length, streamState.index + step);
        target.textContent = full.slice(0, streamState.index);
        if (streamState.index >= full.length) finishStream();
      }, streamSpeedMs);
    });
  }

  function renderRich(text) {
    const raw = String(text || "");
    const blocks = raw.split(/```/);
    let html = "";
    blocks.forEach(function (block, index) {
      if (index % 2 === 1) {
        const lines = block.replace(/^[a-zA-Z]*\n/, "");
        html += '<pre class="librarian-code"><code>' + escapeHtml(lines.replace(/\n$/, "")) + "</code></pre>";
      } else {
        const paragraphs = block.split(/\n{2,}/);
        paragraphs.forEach(function (paragraph) {
          const trimmed = paragraph.replace(/\n+$/, "");
          if (!trimmed.trim()) return;
          html += '<p class="librarian-para">' + escapeHtml(trimmed).replace(/\n/g, "<br>") + "</p>";
        });
      }
    });
    return html || '<p class="librarian-para"></p>';
  }

  function whenSettled() {
    if (!streamState.active) return Promise.resolve(true);
    return new Promise(function (resolve) {
      streamState.resolvers.push(resolve);
    });
  }

  function isStreaming() {
    return streamState.active;
  }

  function setStreamSpeed(ms) {
    const next = Number(ms);
    streamSpeedMs = Number.isFinite(next) && next >= 0 ? next : 14;
    return streamSpeedMs;
  }

  // --------------------------------------------------------------------------
  // 浮层与推荐条
  // --------------------------------------------------------------------------
  function setStatus(text) {
    if (statusEl) statusEl.textContent = String(text || "");
  }

  function renderCards(picks) {
    if (!cardsEl) return;
    if (!picks || picks.length === 0) {
      cardsEl.innerHTML = "";
      cardsEl.hidden = true;
      return;
    }
    cardsEl.hidden = false;
    cardsEl.innerHTML = picks.map(function (item) {
      const site = item.entry.site;
      const status = item.entry.status;
      const iconAttributes = window.NavSchema && typeof window.NavSchema.iconAttributes === "function"
        ? window.NavSchema.iconAttributes(site)
        : "";
      const iconHtml = iconAttributes
        ? '<img class="archive-icon-img" ' + iconAttributes + ' alt="" loading="lazy" width="24" height="24">'
        : "";
      const callNumber = site.callNumber
        ? String(site.callNumber)
        : (window.NavUncatalogued && status === "uncatalogued" && typeof window.NavUncatalogued.getTmpNumber === "function"
          ? window.NavUncatalogued.getTmpNumber(site)
          : String(site.id));
      const stamp = status === "uncatalogued" ? "留卷待查" : categoryName(site);
      return [
        '<article class="librarian-card-slip" data-librarian-card="', escapeHtml(site.id),
        '" data-librarian-status="', escapeHtml(status), '">',
        '<span class="librarian-card-stamp">', escapeHtml(stamp), '</span>',
        '<button type="button" class="librarian-card-open" data-librarian-open="', escapeHtml(site.id), '" title="立即调阅 ',
        escapeHtml(siteName(site)), '">',
        '<span class="archive-icon-box librarian-card-icon" aria-hidden="true">', iconHtml, '</span>',
        '<span class="librarian-card-number">№ ', escapeHtml(callNumber), '</span>',
        '<span class="librarian-card-title">', escapeHtml(siteName(site)), '</span>',
        '<span class="librarian-card-host">', escapeHtml(siteHost(site)), '</span>',
        '<span class="librarian-card-arrow" aria-hidden="true">↗</span>',
        '</button>',
        '<p class="librarian-card-reason">', escapeHtml(reasonFor(item.entry, currentRaw)), '</p>',
        status === "uncatalogued"
          ? '<button type="button" class="librarian-card-crown" data-librarian-crown="' + escapeHtml(site.id) + '">✦ 授予藏书票</button>'
          : "",
        '</article>'
      ].join("");
    }).join("");
    if (window.NavSchema && typeof window.NavSchema.bindIconFallbacks === "function") {
      window.NavSchema.bindIconFallbacks(cardsEl);
    }
  }

  // The folio unfurls downward from the sticky search bar. When the bar sits low
  // in the viewport, a downward sheet would push its badge and action rail below
  // the fold, so flip it above the bar instead.
  function positionFolio() {
    if (!folio || folio.hidden) return;
    folio.classList.remove("is-flip-up");
    const anchor = document.querySelector(".folio-search-bar") || folio.offsetParent;
    const anchorBottom = anchor ? anchor.getBoundingClientRect().bottom : 0;
    // Publish the anchor offset so responsive CSS can cap the sheet to the room
    // that actually remains below the sticky search bar.
    document.documentElement.style.setProperty(
      "--librarian-folio-top",
      Math.round(anchorBottom) + "px"
    );
    const available = window.innerHeight - anchorBottom;
    const needed = Math.min(folio.scrollHeight || 0, window.innerHeight * 0.62);
    if (available < needed + 16) folio.classList.add("is-flip-up");
  }

  function open() {
    if (!folio) return;
    folio.hidden = false;
    opened = true;
    document.documentElement.setAttribute("data-librarian", "open");
    positionFolio();
  }

  function close() {
    if (!folio) return;
    if (streamTimer) {
      clearInterval(streamTimer);
      streamTimer = null;
    }
    streamState.active = false;
    const resolvers = streamState.resolvers.splice(0, streamState.resolvers.length);
    resolvers.forEach(function (resolve) { resolve(false); });
    folio.hidden = true;
    opened = false;
    currentRaw = "";
    currentMode = MODE_RAG;
    document.documentElement.removeAttribute("data-librarian");
    setStatus("");
  }

  function isOpen() {
    return opened;
  }

  function showHint(mode, payload) {
    if (!folio) return;
    open();
    currentMode = mode;
    currentRaw = "";
    lastResult = "";
    lastCards = [];
    if (modeBadge) {
      modeBadge.textContent = mode === MODE_EXEC ? "! 就地处决" : "? 荐书顾问";
      modeBadge.dataset.librarianMode = mode;
    }
    if (outputEl) {
      outputEl.innerHTML = '<p class="librarian-para librarian-para--hint">' +
        (mode === MODE_EXEC
          ? "司天监待命：按 Enter 就地作答，不跳转任何外部网页。"
          : "司天监待命：按 Enter 由馆长批阅全馆目录（含待编目匣）。") +
        "</p>";
    }
    if (cardsEl) {
      cardsEl.hidden = true;
      cardsEl.innerHTML = "";
    }
    setStatus(payload ? "待批阅 · " + payload : "待批阅");
  }

  // --------------------------------------------------------------------------
  // 主流程
  // --------------------------------------------------------------------------
  async function run(mode, payload) {
    if (busy) return false;
    busy = true;
    currentMode = mode;
    currentRaw = payload;
    open();
    if (modeBadge) {
      modeBadge.textContent = mode === MODE_EXEC ? "! 就地处决" : "? 荐书顾问";
      modeBadge.dataset.librarianMode = mode;
    }
    if (cardsEl) {
      cardsEl.hidden = true;
      cardsEl.innerHTML = "";
    }
    setStatus(hasApiKey() ? "司天监推演中…" : "本地确定性引擎推演中…");

    let picks = [];
    let answer = "";
    let source = "local";

    if (!payload) {
      answer = mode === MODE_EXEC
        ? "请在 `!` 之后写下需要就地作答的轻任务，例如 `! 端口转发 443 到 8080`。"
        : "请在 `?` 之后写下馆主的疑问，例如 `? 帮我挑个适合处理切图或代码的工具`。";
      await streamInto(outputEl, answer);
      lastResult = answer;
      lastSource = "local";
      setStatus("待补充提问");
      busy = false;
      return true;
    }

    if (mode === MODE_RAG) {
      picks = recommend(payload, MAX_CARDS);
      const remote = hasApiKey() ? await callLlm([{ role: "user", content: buildCatalogPrompt(picks, payload) }]) : null;
      if (remote) {
        const remoteIds = parsePickIds(remote);
        if (remoteIds.length > 0) {
          const corpusMap = new Map();
          collectCorpus().forEach(function (entry) { corpusMap.set(entry.site.id, entry); });
          const remotePicks = remoteIds
            .map(function (id) { return corpusMap.get(id); })
            .filter(Boolean)
            .slice(0, MAX_CARDS)
            .map(function (entry) { return { entry: entry, score: 999 }; });
          if (remotePicks.length > 0) picks = remotePicks;
        }
        answer = String(remote).replace(/^.*PICK:.*$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
        if (!answer) answer = buildLocalRagAnswer(payload, picks);
        source = "llm";
      } else {
        answer = buildLocalRagAnswer(payload, picks);
      }
    } else {
      const remote = hasApiKey() ? await callLlm([
        {
          role: "user",
          content: "你是「守馆人 · 司天监」，古雅克制、直接给可执行答案。" +
            "若涉及命令或代码，请用 ``` 围栏代码块输出。馆主所问：" + payload
        }
      ]) : null;
      if (remote) {
        answer = String(remote).trim();
        source = "llm";
      } else {
        answer = buildLocalExecAnswer(payload);
      }
    }

    lastResult = answer;
    lastSource = source;
    lastCards = picks;
    await streamInto(outputEl, answer);
    renderCards(picks);
    positionFolio();
    setStatus(
      (source === "llm" ? "司天监实时推演完成" : "本地确定性引擎完成") +
      (picks.length ? " · 荐书 " + picks.length + " 卷" : "")
    );
    busy = false;
    return true;
  }

  function handleInput(value) {
    if (!isLibrarianQuery(value)) {
      if (opened && !streamState.active) close();
      return false;
    }
    const mode = modeOf(value);
    const payload = payloadOf(value);
    if (streamState.active) return true;
    if (opened && currentMode === mode && currentRaw === payload && lastResult) return true;
    showHint(mode, payload);
    return true;
  }

  function handleEnter(event) {
    if (!input) return false;
    const value = input.value;
    if (!isLibrarianQuery(value)) return false;
    if (event) {
      event.preventDefault();
      if (event.stopImmediatePropagation) event.stopImmediatePropagation();
      if (event.stopPropagation) event.stopPropagation();
    }
    const mode = modeOf(value);
    const payload = payloadOf(value);

    // 同一提问二次回车 = 复制结果（羊皮纸浮层底部的 [ 📋 复制结果 (Enter) ] 语义）。
    if (opened && !streamState.active && lastResult &&
      currentMode === mode && currentRaw === payload) {
      copyResult();
      return true;
    }
    run(mode, payload);
    return true;
  }

  function copyResult() {
    if (!lastResult) {
      notify("尚无结果可复制", "请先以 ? 或 ! 向司天监提问", "ℹ");
      return false;
    }
    const text = lastResult;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(function () { fallbackCopy(text); });
    } else {
      fallbackCopy(text);
    }
    setStatus("已复制 · " + text.length + " 字");
    notify("已复制司天监结果", text.slice(0, 28) + "…", "📋");
    return true;
  }

  function fallbackCopy(text) {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (error) {}
    area.remove();
  }

  // 「📜 存入活字秘卷匣」：直接联动 snippets.js / ledger.js 的秘卷账本。
  function saveToCodex() {
    if (!lastResult) {
      notify("尚无结果可存", "请先以 ! 向司天监提问", "ℹ");
      return false;
    }
    const existing = window.NavLedger && typeof window.NavLedger.getSnippets === "function"
      ? window.NavLedger.getSnippets()
      : [];
    const title = (currentMode === MODE_EXEC ? "司天监就地处决 · " : "司天监荐书批注 · ") +
      (currentRaw ? currentRaw.slice(0, 24) : "未命名");
    const entry = {
      id: "snippet-" + Date.now().toString(36),
      title: title,
      content: lastResult
    };
    const next = existing.concat([entry]);
    if (window.NavLedger && typeof window.NavLedger.setSnippets === "function") {
      window.NavLedger.setSnippets(next);
    }
    setStatus("已存入活字秘卷匣 · 共 " + next.length + " 卷");
    notify("已存入活字秘卷匣", title, "📜");
    return true;
  }

  // --------------------------------------------------------------------------
  // 司天监密钥配置
  // --------------------------------------------------------------------------
  function openConfig() {
    const modal = document.getElementById("librarian-config-modal");
    if (!modal) return;
    const config = getAiConfig();
    const baseUrl = document.getElementById("librarian-config-base-url");
    const apiKey = document.getElementById("librarian-config-api-key");
    const model = document.getElementById("librarian-config-model");
    if (baseUrl) baseUrl.value = config.baseUrl;
    if (apiKey) apiKey.value = config.apiKey;
    if (model) model.value = config.model;
    const status = document.getElementById("librarian-config-status");
    if (status) {
      status.textContent = config.apiKey
        ? "当前已接入实时推演 · " + config.model
        : "当前使用本地确定性引擎（免 Key 兜底）";
    }
    modal.style.display = "flex";
  }

  function closeConfig() {
    const modal = document.getElementById("librarian-config-modal");
    if (modal) modal.style.display = "none";
  }

  function saveConfig() {
    const baseUrl = document.getElementById("librarian-config-base-url");
    const apiKey = document.getElementById("librarian-config-api-key");
    const model = document.getElementById("librarian-config-model");
    const next = setAiConfig({
      baseUrl: baseUrl ? baseUrl.value.trim() || DEFAULT_AI_CONFIG.baseUrl : DEFAULT_AI_CONFIG.baseUrl,
      apiKey: apiKey ? apiKey.value.trim() : "",
      model: model ? model.value.trim() || DEFAULT_AI_CONFIG.model : DEFAULT_AI_CONFIG.model
    });
    const status = document.getElementById("librarian-config-status");
    if (status) {
      status.textContent = next.apiKey
        ? "已保存 · 密钥仅存本机 · " + next.model
        : "已保存 · 仍使用本地确定性引擎";
    }
    notify("司天监配置已保存", "仅保存在本机 MYNAV_LEDGER_V2.aiConfig", "⚙️");
    return next;
  }

  function crown(siteId) {
    if (!window.NavOverrides || typeof window.NavOverrides.updateSite !== "function") return false;
    const categories = window.NavApp && typeof window.NavApp.getCategories === "function"
      ? window.NavApp.getCategories()
      : [];
    const target = categories[0];
    if (!target) return false;
    const sites = typeof window.NavOverrides.getAllMergedSites === "function"
      ? window.NavOverrides.getAllMergedSites(true)
      : [];
    const site = sites.find(function (item) { return item.id === siteId; });
    window.NavOverrides.updateSite(siteId, {
      status: "catalogued",
      category: target.id,
      description: (site && (site.description || site.whySaved)) || ""
    });
    if (window.NavLedger && typeof window.NavLedger.ensureFirstSeen === "function") {
      window.NavLedger.ensureFirstSeen(siteId, (site && site.createdAt) || Date.now());
    }
    if (window.NavApp && typeof window.NavApp.refresh === "function") window.NavApp.refresh();
    notify("已授予藏书票", (site && (site.name || site.id)) || siteId, "✦");
    return true;
  }

  // --------------------------------------------------------------------------
  // 事件绑定
  // --------------------------------------------------------------------------
  function bindEvents() {
    if (bound) return;
    bound = true;
    input = document.getElementById("archive-search-input");
    folio = document.getElementById("librarian-folio");
    outputEl = document.getElementById("librarian-folio-output");
    cardsEl = document.getElementById("librarian-folio-cards");
    statusEl = document.getElementById("librarian-folio-status");
    modeBadge = document.getElementById("librarian-mode-badge");
    if (!folio) return;

    const closeBtn = document.getElementById("btn-close-librarian-folio");
    const dismissBtn = document.getElementById("btn-librarian-dismiss");
    const copyBtn = document.getElementById("btn-librarian-copy");
    const snippetBtn = document.getElementById("btn-librarian-snippet");
    const configBtn = document.getElementById("btn-librarian-config");
    const configClose = document.getElementById("btn-close-librarian-config");
    const configDismiss = document.getElementById("btn-dismiss-librarian-config");
    const configSave = document.getElementById("btn-save-librarian-config");
    const configModal = document.getElementById("librarian-config-modal");

    if (closeBtn) closeBtn.addEventListener("click", close);
    if (dismissBtn) dismissBtn.addEventListener("click", close);
    if (copyBtn) copyBtn.addEventListener("click", copyResult);
    if (snippetBtn) snippetBtn.addEventListener("click", saveToCodex);
    if (configBtn) configBtn.addEventListener("click", openConfig);
    if (configClose) configClose.addEventListener("click", closeConfig);
    if (configDismiss) configDismiss.addEventListener("click", closeConfig);
    if (configSave) configSave.addEventListener("click", saveConfig);
    if (configModal) {
      configModal.addEventListener("click", function (event) {
        if (event.target === configModal) closeConfig();
      });
    }

    if (cardsEl) {
      cardsEl.addEventListener("click", function (event) {
        const openBtn = event.target.closest("[data-librarian-open]");
        if (openBtn) {
          event.preventDefault();
          const siteId = openBtn.getAttribute("data-librarian-open");
          if (window.NavApp && typeof window.NavApp.openSite === "function") {
            window.NavApp.openSite(siteId);
          }
          return;
        }
        const crownBtn = event.target.closest("[data-librarian-crown]");
        if (crownBtn) {
          event.preventDefault();
          crown(crownBtn.getAttribute("data-librarian-crown"));
        }
      });
    }

    if (input) {
      input.addEventListener("keydown", function (event) {
        if (event.key === "Escape" && opened) {
          close();
          input.value = "";
          input.dispatchEvent(new Event("input", { bubbles: true }));
        }
      }, true);
    }

    document.addEventListener("pointerdown", function (event) {
      if (!opened) return;
      if (folio.contains(event.target)) return;
      const section = document.querySelector(".archive-search-section");
      if (section && section.contains(event.target)) return;
      const modal = document.getElementById("librarian-config-modal");
      if (modal && modal.contains(event.target)) return;
      close();
    }, true);
  }

  function init() {
    bindEvents();
  }

  function getState() {
    return {
      open: opened,
      mode: currentMode,
      streaming: streamState.active,
      query: currentRaw,
      source: lastSource,
      resultLength: lastResult.length,
      cards: lastCards.map(function (item) { return item.entry.site.id; }),
      hasApiKey: hasApiKey(),
      streamSpeedMs: streamSpeedMs
    };
  }

  return {
    init,
    open,
    close,
    isOpen,
    isLibrarianQuery,
    modeOf,
    payloadOf,
    handleInput,
    handleEnter,
    run,
    whenSettled,
    isStreaming,
    setStreamSpeed,
    getState,
    getAiConfig,
    setAiConfig,
    openConfig,
    closeConfig,
    saveConfig,
    copyResult,
    saveToCodex,
    recommend,
    buildLocalRagAnswer,
    buildLocalExecAnswer,
    pickRecipe,
    renderRich,
    EXEC_RECIPES,
    SEMANTIC_CLUSTERS,
    DEFAULT_AI_CONFIG
  };
});
