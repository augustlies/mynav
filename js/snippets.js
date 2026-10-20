/**
 * Module: C1 Codex snippets / prompt ammunition.
 *
 * Snippets live in MYNAV_LEDGER_V2.snippets. A click copies the body and
 * expands the local AI hand-off menu; opening an AI always goes through
 * NavApp.openSite() so the same access ledger remains authoritative.
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavSnippets = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const BUILTIN_SNIPPETS = [
    {
      id: "snippet-architecture",
      title: "架构重构 System Prompt",
      content: "你是一位严谨的软件架构师。请先识别现有模块边界、数据流与隐含耦合，再给出最小可行的重构路径。必须列出风险、回归测试点与可回滚步骤，禁止一次性重写。"
    },
    {
      id: "snippet-port-forward",
      title: "Linux 端口转发与探针脚本",
      content: "请给出一个 Linux 端口转发与健康探针脚本，包含 systemd 服务、失败重试、日志轮转与防火墙检查。先解释每一步的作用，再输出可直接执行的命令。"
    },
    {
      id: "snippet-academic-polish",
      title: "中英学术润色指令",
      content: "请在不改变事实、论证结构与术语含义的前提下润色以下中英学术文本。保留引用与数字，标出所有实质性改写，并给出更自然的中英对照版本。"
    },
    {
      id: "snippet-review",
      title: "代码审查 Checklist",
      content: "请按严重程度审查这份改动，优先找出行为回归、边界条件、安全与数据一致性问题。每个发现给出文件与行号、复现路径和建议测试；没有发现时明确说明残余风险。"
    }
  ];

  const AI_TARGETS = [
    { id: "ai-deepseek", name: "DeepSeek" },
    { id: "ai-chatgpt", name: "ChatGPT" },
    { id: "ai-gemini", name: "Gemini" },
    { id: "ai-claude", name: "Claude" }
  ];

  let bound = false;
  let activeSnippetId = null;
  let expanded = false;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function toast(title, subtitle, icon) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle || "", icon || "📜");
    }
  }

  function getSnippets() {
    const stored = window.NavLedger && typeof window.NavLedger.getSnippets === "function"
      ? window.NavLedger.getSnippets()
      : [];
    if (Array.isArray(stored) && stored.length > 0) {
      return stored.map(function (item) {
        return {
          id: String(item.id || "snippet-" + Date.now()),
          title: String(item.title || item.name || "未命名秘卷"),
          content: String(item.content || "")
        };
      });
    }
    return BUILTIN_SNIPPETS.slice();
  }

  function saveSnippets(snippets) {
    if (window.NavLedger && typeof window.NavLedger.setSnippets === "function") {
      window.NavLedger.setSnippets(snippets);
    }
  }

  function renderMenu() {
    const menu = document.getElementById("snippets-copy-menu");
    if (!menu) return;
    if (!expanded || !activeSnippetId) {
      menu.hidden = true;
      menu.innerHTML = "";
      return;
    }
    const snippet = getSnippets().find(function (item) { return item.id === activeSnippetId; });
    if (!snippet) {
      menu.hidden = true;
      return;
    }
    menu.innerHTML = [
      '<span class="snippets-copy-label">已复制！携卷前往：</span>',
      AI_TARGETS.map(function (target) {
        return '<button type="button" class="snippet-ai-link" data-snippet-ai="' + escapeHtml(target.id) + '">' +
          escapeHtml(target.name) + ' ↗</button>';
      }).join("")
    ].join("");
    menu.hidden = false;
  }

  function renderList() {
    const list = document.getElementById("snippets-list");
    if (!list) return;
    const snippets = getSnippets();
    list.innerHTML = snippets.map(function (snippet) {
      return [
        '<article class="snippet-card" data-snippet-id="', escapeHtml(snippet.id), '">',
        '<header><h3>', escapeHtml(snippet.title), '</h3>',
        '<div class="snippet-actions">',
        '<button type="button" data-snippet-edit="', escapeHtml(snippet.id), '" aria-label="编辑秘卷">✎</button>',
        '<button type="button" data-snippet-delete="', escapeHtml(snippet.id), '" aria-label="删除秘卷">✕</button>',
        '</div></header>',
        '<p class="snippet-preview">', escapeHtml(snippet.content), '</p>',
        '<button type="button" class="snippet-copy" data-snippet-copy="', escapeHtml(snippet.id), '">复制秘卷并携卷前往 ↗</button>',
        '</article>'
      ].join("");
    }).join("");
  }

  function open() {
    const modal = document.getElementById("snippets-modal");
    if (!modal) return;
    activeSnippetId = null;
    expanded = false;
    renderList();
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
    const closeBtn = document.getElementById("btn-close-snippets");
    if (closeBtn) closeBtn.focus();
  }

  function toggle() {
    const modal = document.getElementById("snippets-modal");
    if (!modal) return;
    if (modal.style.display !== "none" && modal.style.display !== "") close();
    else open();
  }

  function close() {
    const modal = document.getElementById("snippets-modal");
    if (!modal) return;
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    activeSnippetId = null;
    expanded = false;
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () {
        fallbackCopy(text);
      });
    }
    fallbackCopy(text);
    return Promise.resolve();
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

  function copySnippet(siteId) {
    const snippet = getSnippets().find(function (item) { return item.id === siteId; });
    if (!snippet) return;
    activeSnippetId = snippet.id;
    expanded = true;
    // Show the hand-off menu immediately. The clipboard write remains async
    // and its failure is already handled by the textarea fallback.
    renderMenu();
    copyText(snippet.content);
    toast("已复制秘卷", snippet.title, "📜");
  }

  function openAI(siteId) {
    const target = AI_TARGETS.find(function (item) { return item.id === siteId; });
    if (!target) return;
    const site = window.NavApp && typeof window.NavApp.getSiteById === "function"
      ? window.NavApp.getSiteById(target.id)
      : null;
    if (site && window.NavApp && typeof window.NavApp.openSite === "function") {
      window.NavApp.openSite(site.id);
    } else if (site) {
      window.open(site.url, "_blank", "noopener,noreferrer");
    }
    toast("已携卷前往 " + target.name, "秘卷正文已复制", "↗");
  }

  function addOrEdit(siteId) {
    const all = getSnippets();
    const existing = siteId ? all.find(function (item) { return item.id === siteId; }) : null;
    const title = prompt("秘卷标题", existing ? existing.title : "");
    if (!title) return;
    const content = prompt("秘卷正文", existing ? existing.content : "");
    if (!content) return;
    const next = existing
      ? all.map(function (item) {
        return item.id === existing.id ? { id: item.id, title: title.trim(), content: content.trim() } : item;
      })
      : all.concat([{
        id: "snippet-" + Date.now().toString(36),
        title: title.trim(),
        content: content.trim()
      }]);
    saveSnippets(next);
    renderList();
  }

  function remove(siteId) {
    const all = getSnippets();
    const target = all.find(function (item) { return item.id === siteId; });
    if (!target || !confirm("确定删除秘卷 “" + target.title + "” 吗？")) return;
    saveSnippets(all.filter(function (item) { return item.id !== siteId; }));
    renderList();
  }

  function bindEvents() {
    if (bound) return;
    bound = true;
    const modal = document.getElementById("snippets-modal");
    const list = document.getElementById("snippets-list");
    const menu = document.getElementById("snippets-copy-menu");
    const entry = document.getElementById("btn-snippets-entry");
    const spineEntry = document.getElementById("btn-snippets-spine-entry");
    const closeBtn = document.getElementById("btn-close-snippets");
    const addBtn = document.getElementById("btn-add-snippet");
    if (entry) entry.addEventListener("click", open);
    if (spineEntry) spineEntry.addEventListener("click", open);
    if (closeBtn) closeBtn.addEventListener("click", close);
    if (addBtn) addBtn.addEventListener("click", function () { addOrEdit(null); });
    if (modal) {
      modal.addEventListener("click", function (event) {
        if (event.target === modal) close();
      });
    }
    if (list) {
      list.addEventListener("click", function (event) {
        const copyBtn = event.target.closest("[data-snippet-copy]");
        if (copyBtn) {
          copySnippet(copyBtn.getAttribute("data-snippet-copy"));
          return;
        }
        const editBtn = event.target.closest("[data-snippet-edit]");
        if (editBtn) {
          addOrEdit(editBtn.getAttribute("data-snippet-edit"));
          return;
        }
        const deleteBtn = event.target.closest("[data-snippet-delete]");
        if (deleteBtn) remove(deleteBtn.getAttribute("data-snippet-delete"));
      });
    }
    if (menu) {
      menu.addEventListener("click", function (event) {
        const aiBtn = event.target.closest("[data-snippet-ai]");
        if (aiBtn) openAI(aiBtn.getAttribute("data-snippet-ai"));
      });
    }
    document.addEventListener("keydown", function (event) {
      const target = event.target;
      const tag = target && target.tagName ? target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) return;
      if (event.key === "s" || event.key === "S") {
        if (event.ctrlKey || event.metaKey || event.altKey) return;
        event.preventDefault();
        toggle();
      }
    });
  }

  function init() {
    bindEvents();
    if (!getSnippets().length) saveSnippets(BUILTIN_SNIPPETS.slice());
  }

  return {
    init,
    open,
    toggle,
    close,
    getSnippets,
    BUILTIN_SNIPPETS
  };
});
