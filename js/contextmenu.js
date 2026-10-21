/**
 * 模块：卡片右键菜单、全局空白菜单与数据导入导出交互控制器 (js/contextmenu.js)
 * 职责：
 * 1. 监听卡片与空白处右键事件 (contextmenu) 及触屏长按 (500ms)
 * 2. 动态装配卡片级操作菜单（新标签页打开、复制链接、编辑、移动分类、收藏、隐藏、恢复默认、删除）
 * 3. 动态装配全局级操作菜单（新建卡片、显示隐藏卡片、导出 data.js、导出备份、导入备份、重置全部）
 * 4. 视口边界自动碰撞翻转检测，防止超出屏幕
 * 5. 全键盘无障碍导航（上下键漫游、右键进二级分类菜单、左键返回、回车执行、Esc 关闭）
 * 6. 编辑/新建卡片弹窗与已隐藏卡片管理弹窗
 */

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavContextMenu = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  let menuEl = null;
  let fileInputEl = null;
  let editModalEl = null;
  let hiddenModalEl = null;
  let currentTarget = null; // { type: 'card'|'blank', siteId: string|null, site: object|null }
  let focusedIndex = -1;
  let isMenuOpen = false;

  // 移动端长按支持
  let longPressTimer = null;
  let touchStartX = 0;
  let touchStartY = 0;
  let suppressNextClick = false;

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function getOverrides() {
    return window.NavOverrides || null;
  }

  function getCategories() {
    if (window.NAV_DATA && Array.isArray(window.NAV_DATA.categories)) {
      return window.NAV_DATA.categories;
    }
    return [];
  }

  // 复制文本到剪贴板
  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast("已复制链接", text, "📋");
      }).catch(() => {
        fallbackCopy(text);
      });
    } else {
      fallbackCopy(text);
    }
  }

  function fallbackCopy(text) {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      showToast("已复制链接", text, "📋");
    } catch (e) {
      showToast("复制失败", "请手动复制网址", "⚠");
    }
    document.body.removeChild(ta);
  }

  function showToast(title, subtitle = "", icon = "✦") {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast(title, subtitle, icon);
    }
  }

  // ==========================================================================
  // DOM 容器装配 (Initialization)
  // ==========================================================================

  function ensureDOMElements() {
    // 1. 上下文菜单容器
    if (!menuEl) {
      menuEl = document.getElementById("nav-context-menu");
      if (!menuEl) {
        menuEl = document.createElement("div");
        menuEl.id = "nav-context-menu";
        menuEl.className = "nav-context-menu";
        menuEl.style.display = "none";
        menuEl.setAttribute("role", "menu");
        menuEl.setAttribute("aria-label", "快捷操作菜单");
        document.body.appendChild(menuEl);
      }
    }

    // 2. 隐藏的文件导入 input
    if (!fileInputEl) {
      fileInputEl = document.getElementById("nav-backup-file-input");
      if (!fileInputEl) {
        fileInputEl = document.createElement("input");
        fileInputEl.type = "file";
        fileInputEl.id = "nav-backup-file-input";
        fileInputEl.accept = ".json";
        fileInputEl.style.display = "none";
        document.body.appendChild(fileInputEl);

        fileInputEl.addEventListener("change", handleFileImport);
      }
    }

    // 3. 卡片编辑/新建弹窗
    if (!editModalEl) {
      editModalEl = document.getElementById("card-edit-modal");
      if (!editModalEl) {
        editModalEl = document.createElement("div");
        editModalEl.id = "card-edit-modal";
        editModalEl.className = "editorial-modal-backdrop";
        editModalEl.style.display = "none";
        editModalEl.setAttribute("role", "dialog");
        editModalEl.setAttribute("aria-modal", "true");
        editModalEl.setAttribute("aria-labelledby", "card-edit-modal-title");

        editModalEl.innerHTML = `
          <div class="editorial-modal-window card-edit-modal-window">
            <header class="editorial-modal-header">
              <div class="modal-badge-row">
                <span class="modal-folio-badge">EX LIBRIS</span>
                <span class="modal-folio-tag" id="card-edit-modal-tag">书目典藏编辑</span>
              </div>
              <h2 id="card-edit-modal-title" class="modal-headline">编辑藏书卡片</h2>
              <p class="modal-subtitle">精细校正书目档案元数据，修改将保存在您设备本地。</p>
            </header>

            <form id="card-edit-form" class="card-edit-form" onsubmit="return false;">
              <div class="form-group" id="form-group-category">
                <label for="edit-card-category" class="form-label">所属分类专栏</label>
                <select id="edit-card-category" class="form-select" required></select>
              </div>

              <div class="form-group">
                <label for="edit-card-name" class="form-label">书目名称 <span class="required-star">*</span></label>
                <input type="text" id="edit-card-name" class="form-input" placeholder="例如：Claude" required autocomplete="off">
              </div>

              <div class="form-group">
                <label for="edit-card-url" class="form-label">典藏网址 <span class="required-star">*</span></label>
                <input type="text" id="edit-card-url" class="form-input" placeholder="https://..." required autocomplete="off">
                <div id="edit-url-error" class="form-error-tip" style="display: none;">网址必须以 http:// 或 https:// 开头</div>
              </div>

              <div class="form-group">
                <label for="edit-card-desc" class="form-label">简明简介</label>
                <textarea id="edit-card-desc" class="form-textarea" rows="2" placeholder="清晰克制的书目概述..."></textarea>
              </div>

              <div class="form-row-2col">
                <div class="form-group">
                  <label for="edit-card-tags" class="form-label">检索标签 (逗号分隔)</label>
                  <input type="text" id="edit-card-tags" class="form-input" placeholder="例如：ai, 助手, 大模型">
                </div>

                <div class="form-group">
                  <label for="edit-card-icon" class="form-label">徽标文字 (1~4字)</label>
                  <input type="text" id="edit-card-icon" class="form-input form-input-short" maxlength="4" placeholder="例如：CL">
                </div>
              </div>

              <div class="form-row-2col phase2-meta-row">
                <div class="form-group">
                  <label for="edit-card-visibility" class="form-label">可见结界</label>
                  <select id="edit-card-visibility" class="form-select">
                    <option value="public">表世界 · 公开馆藏</option>
                    <option value="shadow">暗月密室 · 仅里世界可见</option>
                  </select>
                </div>
                <div class="form-group">
                  <label class="form-label form-check-label">
                    <input type="checkbox" id="edit-card-uncatalogued">
                    暂存待编目匣
                  </label>
                </div>
              </div>

              <footer class="editorial-modal-footer form-actions-footer">
                <button type="button" id="btn-cancel-card-edit" class="btn-modal-cancel">取消 (Esc)</button>
                <button type="button" id="btn-save-card-edit" class="btn-modal-primary">保存修改</button>
              </footer>
            </form>
          </div>
        `;
        document.body.appendChild(editModalEl);
        bindEditModalEvents();
      }
    }

    // 4. 显示已隐藏卡片弹窗
    if (!hiddenModalEl) {
      hiddenModalEl = document.getElementById("hidden-cards-modal");
      if (!hiddenModalEl) {
        hiddenModalEl = document.createElement("div");
        hiddenModalEl.id = "hidden-cards-modal";
        hiddenModalEl.className = "editorial-modal-backdrop";
        hiddenModalEl.style.display = "none";
        hiddenModalEl.setAttribute("role", "dialog");
        hiddenModalEl.setAttribute("aria-modal", "true");
        hiddenModalEl.setAttribute("aria-labelledby", "hidden-cards-modal-title");

        hiddenModalEl.innerHTML = `
          <div class="editorial-modal-window hidden-cards-modal-window">
            <header class="editorial-modal-header">
              <div class="modal-badge-row">
                <span class="modal-folio-badge">HIDDEN FOLIOS</span>
                <span class="modal-folio-tag">隐退书目名册</span>
              </div>
              <h2 id="hidden-cards-modal-title" class="modal-headline">已隐藏的藏书卡片</h2>
              <p class="modal-subtitle">以下卡片当前已从日常展示中隐去，您可以随时逐一恢复展示。</p>
            </header>

            <div id="hidden-cards-list" class="hidden-cards-list"></div>

            <footer class="editorial-modal-footer hidden-modal-footer">
              <button type="button" id="btn-unhide-all-cards" class="btn-modal-subtle">全部恢复显示</button>
              <button type="button" id="btn-close-hidden-modal" class="btn-modal-primary">完成关闭 (Esc)</button>
            </footer>
          </div>
        `;
        document.body.appendChild(hiddenModalEl);
        bindHiddenModalEvents();
      }
    }

    // 5. 绑定页脚“导出”快捷入口按钮
    const footerExportBtn = document.getElementById("btn-footer-export");
    if (footerExportBtn && !footerExportBtn.dataset.bound) {
      footerExportBtn.dataset.bound = "1";
      footerExportBtn.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        const rect = footerExportBtn.getBoundingClientRect();
        openBlankMenu(rect.left, rect.top - 8, true);
      });
    }
  }

  // ==========================================================================
  // 菜单构建与渲染 (Menu Builders)
  // ==========================================================================

  // 生成卡片右键菜单 HTML
  function buildCardMenuHtml(site) {
    const ov = getOverrides();
    const isBookmarked = window.NavFavorites ? window.NavFavorites.has(site.id) : false;
    const hasMod = ov ? ov.hasModifications(site.id) : false;
    const categories = getCategories();

    // 二级分类菜单 HTML
    const subCategoriesHtml = categories.map(cat => {
      const isCurrent = (cat.id === site.category);
      return `
        <div class="ctx-item ctx-subitem" data-action="move-cat" data-target-cat="${escapeHtml(cat.id)}" role="menuitem">
          <span class="ctx-label">${escapeHtml(cat.name)}</span>
          ${isCurrent ? '<span class="ctx-check" aria-hidden="true">✓</span>' : ''}
        </div>
      `;
    }).join("");

    return `
      <div class="ctx-item" data-action="open-tab" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">↗</span>
        <span class="ctx-label">在新标签页打开</span>
      </div>
      <div class="ctx-item" data-action="copy-link" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">📋</span>
        <span class="ctx-label">复制链接</span>
      </div>
      <div class="ctx-item" data-action="edit-card" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">✏️</span>
        <span class="ctx-label">编辑卡片…</span>
      </div>
      <div class="ctx-item" data-action="show-marginalia" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">✎</span>
        <span class="ctx-label">翻开批注面</span>
      </div>
      <div class="ctx-item has-submenu" data-action="submenu-cat" role="menuitem" aria-haspopup="true">
        <span class="ctx-icon" aria-hidden="true">📁</span>
        <span class="ctx-label">移动到分类</span>
        <span class="ctx-arrow" aria-hidden="true">▸</span>
        <div class="ctx-submenu" role="menu">
          ${subCategoriesHtml}
        </div>
      </div>
      <div class="ctx-item" data-action="arrange-order" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">🔀</span>
        <span class="ctx-label">整理顺序</span>
      </div>

      <div class="ctx-divider"></div>

      <div class="ctx-item" data-action="toggle-fav" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">${isBookmarked ? "★" : "☆"}</span>
        <span class="ctx-label">${isBookmarked ? "移出私人典藏" : "加入私人典藏"}</span>
      </div>
      <div class="ctx-item" data-action="hide-card" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">👁️‍🗨️</span>
        <span class="ctx-label">隐藏这张卡片</span>
      </div>

      ${hasMod ? `
        <div class="ctx-item" data-action="reset-card" role="menuitem">
          <span class="ctx-icon" aria-hidden="true">↺</span>
          <span class="ctx-label">恢复默认</span>
        </div>
      ` : ""}

      <div class="ctx-divider"></div>

      <div class="ctx-item ctx-danger" data-action="delete-card" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">🗑️</span>
        <span class="ctx-label">删除</span>
      </div>
    `;
  }

  // 生成空白处全局菜单 HTML
  function buildBlankMenuHtml() {
    const isParticles = window.NavParticlesBg ? window.NavParticlesBg.isEnabled() : true;
    const isNierBg = (window.NavTheme && typeof window.NavTheme.isNierBg === "function")
      ? window.NavTheme.isNierBg()
      : (typeof document !== "undefined" && document.documentElement.getAttribute("data-nier-bg") === "true");

    return `
      <div class="ctx-item" data-action="new-card" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">➕</span>
        <span class="ctx-label">新建卡片…</span>
      </div>
      <div class="ctx-item" data-action="arrange-order" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">🔀</span>
        <span class="ctx-label">整理书架顺序</span>
      </div>
      <div class="ctx-item" data-action="show-hidden" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">👁️</span>
        <span class="ctx-label">显示已隐藏的卡片</span>
      </div>

      <div class="ctx-divider"></div>

      <div class="ctx-item" data-action="toggle-particles" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">${isParticles ? "✨" : "💤"}</span>
        <span class="ctx-label">背景动效：${isParticles ? "开" : "关"}</span>
      </div>
      <div class="ctx-item" data-action="toggle-nier-bg" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">${isNierBg ? "📜" : "📄"}</span>
        <span class="ctx-label">尼尔底色：${isNierBg ? "开" : "关"}</span>
      </div>

      <div class="ctx-divider"></div>

      <div class="ctx-item" data-action="export-datajs" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">📄</span>
        <span class="ctx-label">导出 data.js</span>
      </div>
      <div class="ctx-item" data-action="export-backup" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">💾</span>
        <span class="ctx-label">导出备份 (JSON)</span>
      </div>
      <div class="ctx-item" data-action="import-backup" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">📥</span>
        <span class="ctx-label">导入备份 (JSON)</span>
      </div>

      <div class="ctx-divider"></div>

      <div class="ctx-item ctx-danger" data-action="reset-all" role="menuitem">
        <span class="ctx-icon" aria-hidden="true">⚠️</span>
        <span class="ctx-label">重置全部修改</span>
      </div>
    `;
  }

  // 打开卡片菜单
  function openCardMenu(x, y, siteId) {
    const ov = getOverrides();
    const site = ov ? ov.getSiteById(siteId) : null;
    if (!site) return;

    currentTarget = { type: "card", siteId, site };
    menuEl.innerHTML = buildCardMenuHtml(site);
    showMenuAt(x, y);
  }

  // 打开空白处全局菜单
  function openBlankMenu(x, y, fromFooter = false) {
    currentTarget = { type: "blank", siteId: null, site: null };
    menuEl.innerHTML = buildBlankMenuHtml();
    showMenuAt(x, y, fromFooter);
  }

  // 定位与边缘自动碰撞翻转
  function showMenuAt(x, y, alignBottom = false) {
    menuEl.style.display = "block";
    menuEl.style.visibility = "hidden";
    menuEl.classList.remove("flip-x", "flip-y");

    const menuWidth = menuEl.offsetWidth;
    const menuHeight = menuEl.offsetHeight;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    let posX = x;
    let posY = y;

    // 页脚按钮点击时向上展开
    if (alignBottom) {
      posY = y - menuHeight;
    }

    // 右边缘碰撞检测
    if (posX + menuWidth > winWidth - 8) {
      posX = Math.max(8, winWidth - menuWidth - 8);
      menuEl.classList.add("flip-x");
    }

    // 下边缘碰撞检测
    if (posY + menuHeight > winHeight - 8) {
      posY = Math.max(8, winHeight - menuHeight - 8);
      menuEl.classList.add("flip-y");
    }

    if (posX < 8) posX = 8;
    if (posY < 8) posY = 8;

    menuEl.style.left = `${posX}px`;
    menuEl.style.top = `${posY}px`;
    menuEl.style.visibility = "visible";
    isMenuOpen = true;
    focusedIndex = -1;
  }

  function closeMenu() {
    if (!isMenuOpen) return;
    if (menuEl) {
      menuEl.style.display = "none";
      menuEl.innerHTML = "";
    }
    isMenuOpen = false;
    focusedIndex = -1;
    currentTarget = null;
  }

  // ==========================================================================
  // 菜单交互点击与键盘导航 (Event Handlers)
  // ==========================================================================

  function handleMenuAction(action, targetCat = null) {
    const ov = getOverrides();
    const site = currentTarget && currentTarget.site;

    closeMenu();

    switch (action) {
      case "open-tab":
        if (site && site.url) {
          if (site.id && window.NavApp && typeof window.NavApp.openSite === "function") {
            window.NavApp.openSite(site.id);
          } else {
            window.open(site.url, "_blank", "noopener,noreferrer");
            if (window.NavVisits && typeof window.NavVisits.record === "function") {
              window.NavVisits.record(site.id);
            }
          }
        }
        break;

      case "copy-link":
        if (site && site.url) {
          copyText(site.url);
        }
        break;

      case "edit-card":
        if (site) {
          openEditModal(site);
        }
        break;

      case "show-marginalia":
        if (site && window.NavMarginalia) {
          window.NavMarginalia.flip(site.id, true);
        }
        break;

      case "move-cat":
        if (site && targetCat && ov) {
          const categories = getCategories();
          const targetCatObj = categories.find(c => c.id === targetCat);
          const catName = targetCatObj ? targetCatObj.name : targetCat;
          ov.moveCategory(site.id, targetCat);
          showToast(`已移动至「${catName}」`, site.name, "📁");
        }
        break;

      case "arrange-order":
        if (window.NavSortable) {
          // Phase 5：3D 书架视图已移除。整理模式只作用于卡片网格，
          // 若正停在穹顶星图则先回到书本目录。
          const curView = window.NavStorage ? window.NavStorage.get("mynav_arch_view", "grid") : "grid";
          if (curView === "star-map" && window.NavApp && typeof window.NavApp.setArchiveView === "function") {
            window.NavApp.setArchiveView("grid");
          }
          window.NavSortable.setArrangeMode(true);
          showToast("已开启书架整理", "拖动卡片调整顺序，按顶部「完成」保存", "🔀");
        }
        break;

      case "toggle-fav":
        if (site && window.NavFavorites) {
          window.NavFavorites.toggle(site.id);
          if (window.NavApp && typeof window.NavApp.refresh === "function") {
            window.NavApp.refresh();
          }
          const isNowFav = window.NavFavorites.has(site.id);
          showToast(isNowFav ? "已收入私人典藏" : "已移出私人典藏", site.name, isNowFav ? "★" : "☆");
        }
        break;

      case "hide-card":
        if (site && ov) {
          ov.hideSite(site.id);
          showToast("已隐藏藏书卡片", `“${site.name}” 可在空白处右键恢复`, "👁️‍🗨️");
        }
        break;

      case "reset-card":
        if (site && ov) {
          ov.resetSite(site.id);
          showToast("已恢复默认设置", site.name, "↺");
        }
        break;

      case "delete-card":
        if (site && ov) {
          if (confirm(`确定要删除藏书卡片 “${site.name}” 吗？\n（系统预设卡片随时可从空白处菜单“重置全部修改”中恢复）`)) {
            ov.deleteSite(site.id);
            showToast("已删除卡片", site.name, "🗑️");
          }
        }
        break;

      case "new-card":
        openCreateModal();
        break;

      case "show-hidden":
        openHiddenModal();
        break;

      case "toggle-particles":
        if (window.NavParticlesBg) {
          const nextState = window.NavParticlesBg.toggle();
          showToast(
            nextState ? "背景动效已开启" : "背景动效已关闭",
            nextState ? "满屏方块微粒子漂移与鼠标引力连线" : "已暂停背景粒子渲染以节省系统资源",
            nextState ? "✨" : "💤"
          );
        }
        break;

      case "toggle-nier-bg":
        if (window.NavTheme && typeof window.NavTheme.toggleNierBg === "function") {
          const nextNier = window.NavTheme.toggleNierBg();
          showToast(
            nextNier ? "已开启尼尔底色" : "已恢复经典纸张底色",
            nextNier ? "浅色主题应用 #CFCAB5 工业工程米灰色调" : "恢复为暖象牙白原生纸张质感",
            nextNier ? "📜" : "📄"
          );
        }
        break;

      case "export-datajs":
        if (ov) {
          showToast("正在导出 data.js", "合并当前修改与完整馆藏", "📄");
          ov.downloadDataJs();
        }
        break;

      case "export-backup":
        if (ov) {
          showToast("正在导出备份文件", "nav-backup-*.json", "💾");
          ov.downloadBackupJson();
        }
        break;

      case "import-backup":
        if (fileInputEl) {
          fileInputEl.value = "";
          fileInputEl.click();
        }
        break;

      case "reset-all":
        if (ov) {
          if (confirm("确定要重置并清除全部本地修改吗？\n此操作将清除所有自定义卡片修改与新增记录，恢复至纯净馆藏。")) {
            ov.resetAll();
            showToast("已重置全部修改", "恢复至预设书目", "↺");
          }
        }
        break;
    }
  }

  // 文件导入回调
  function handleFileImport(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      const text = evt.target.result;
      const ov = getOverrides();
      if (!ov) return;

      if (confirm(`准备导入备份文件 “${file.name}”，确定要覆盖当前设备上的书目修改与偏好设置吗？`)) {
        const res = ov.importBackupJson(text);
        if (res.success) {
          showToast("备份恢复成功", "已完整还原全部修改与偏好", "✔");
        } else {
          alert("导入失败: " + res.message);
        }
      }
    };
    reader.readAsText(file);
  }

  // ==========================================================================
  // 编辑/新建卡片弹窗控制 (Card Edit Modal)
  // ==========================================================================

  let currentEditingSiteId = null;

  function bindEditModalEvents() {
    const cancelBtn = document.getElementById("btn-cancel-card-edit");
    const saveBtn = document.getElementById("btn-save-card-edit");
    const urlInput = document.getElementById("edit-card-url");
    const errorTip = document.getElementById("edit-url-error");

    if (cancelBtn) cancelBtn.addEventListener("click", closeEditModal);
    if (saveBtn) saveBtn.addEventListener("click", submitCardEdit);

    if (urlInput) {
      urlInput.addEventListener("input", function () {
        if (errorTip) errorTip.style.display = "none";
      });
    }

    if (editModalEl) {
      editModalEl.addEventListener("click", function (e) {
        if (e.target === editModalEl) closeEditModal();
      });
    }
  }

  function populateCategoriesSelect(selectedCatId) {
    const sel = document.getElementById("edit-card-category");
    if (!sel) return;
    const categories = getCategories();
    sel.innerHTML = categories.map(c => `
      <option value="${escapeHtml(c.id)}" ${c.id === selectedCatId ? "selected" : ""}>
        ${escapeHtml(c.name)} (${escapeHtml(c.code)})
      </option>
    `).join("");
  }

  function openEditModal(site) {
    ensureDOMElements();
    currentEditingSiteId = site.id;

    document.getElementById("card-edit-modal-title").textContent = "编辑藏书卡片";
    document.getElementById("card-edit-modal-tag").textContent = "书目典藏编辑";
    populateCategoriesSelect(site.category);

    document.getElementById("edit-card-name").value = site.name || "";
    document.getElementById("edit-card-url").value = site.url || "";
    document.getElementById("edit-card-desc").value = site.description || "";
    document.getElementById("edit-card-tags").value = Array.isArray(site.tags) ? site.tags.join(", ") : "";
    document.getElementById("edit-card-icon").value = site.icon || site.name.slice(0, 2);
    const visibilityInput = document.getElementById("edit-card-visibility");
    const uncataloguedInput = document.getElementById("edit-card-uncatalogued");
    if (visibilityInput) visibilityInput.value = site.visibility === "shadow" ? "shadow" : "public";
    if (uncataloguedInput) uncataloguedInput.checked = site.status === "uncatalogued";

    const errorTip = document.getElementById("edit-url-error");
    if (errorTip) errorTip.style.display = "none";

    editModalEl.style.display = "flex";
    document.body.classList.add("modal-open");
    setTimeout(() => {
      document.getElementById("edit-card-name").focus();
    }, 60);
  }

  function openCreateModal() {
    ensureDOMElements();
    currentEditingSiteId = null;

    document.getElementById("card-edit-modal-title").textContent = "典藏新书目";
    document.getElementById("card-edit-modal-tag").textContent = "新建书目录入";
    populateCategoriesSelect("ai");

    document.getElementById("edit-card-name").value = "";
    document.getElementById("edit-card-url").value = "";
    document.getElementById("edit-card-desc").value = "";
    document.getElementById("edit-card-tags").value = "";
    document.getElementById("edit-card-icon").value = "";
    const visibilityInput = document.getElementById("edit-card-visibility");
    const uncataloguedInput = document.getElementById("edit-card-uncatalogued");
    if (visibilityInput) visibilityInput.value = "public";
    if (uncataloguedInput) uncataloguedInput.checked = false;

    const errorTip = document.getElementById("edit-url-error");
    if (errorTip) errorTip.style.display = "none";

    editModalEl.style.display = "flex";
    document.body.classList.add("modal-open");
    setTimeout(() => {
      document.getElementById("edit-card-name").focus();
    }, 60);
  }

  function closeEditModal() {
    if (editModalEl) editModalEl.style.display = "none";
    document.body.classList.remove("modal-open");
    currentEditingSiteId = null;
  }

  function submitCardEdit() {
    const nameInput = document.getElementById("edit-card-name");
    const urlInput = document.getElementById("edit-card-url");
    const descInput = document.getElementById("edit-card-desc");
    const tagsInput = document.getElementById("edit-card-tags");
    const iconInput = document.getElementById("edit-card-icon");
    const catInput = document.getElementById("edit-card-category");
    const errorTip = document.getElementById("edit-url-error");

    const name = nameInput.value.trim();
    const url = urlInput.value.trim();

    if (!name) {
      nameInput.focus();
      return;
    }

    // 网址合规性严格检查：必须以 http:// 或 https:// 开头
    if (!/^https?:\/\/.+/i.test(url)) {
      if (errorTip) {
        errorTip.textContent = "网址格式不合法，必须以 http:// 或 https:// 开头";
        errorTip.style.display = "block";
      }
      urlInput.focus();
      return;
    }

    const desc = descInput.value.trim();
    const rawTags = tagsInput.value.trim();
    const tags = rawTags
      ? rawTags.split(/[,，]/).map(t => t.trim()).filter(Boolean)
      : [];
    const icon = iconInput.value.trim().toUpperCase() || name.slice(0, 2);
    const category = catInput.value;
    const visibilityInput = document.getElementById("edit-card-visibility");
    const uncataloguedInput = document.getElementById("edit-card-uncatalogued");
    const visibility = visibilityInput && visibilityInput.value === "shadow" ? "shadow" : "public";
    const status = uncataloguedInput && uncataloguedInput.checked ? "uncatalogued" : "catalogued";

    const ov = getOverrides();
    if (!ov) return;

    if (currentEditingSiteId) {
      // 修改现有卡片
      ov.updateSite(currentEditingSiteId, {
        name,
        url,
        description: desc,
        tags,
        icon,
        category,
        visibility,
        status
      });
      showToast("已保存卡片修改", name, "✏️");
    } else {
      // 新建卡片
      ov.addSite({
        name,
        url,
        description: desc,
        tags,
        icon,
        category,
        visibility,
        status,
        createdAt: Date.now()
      });
      showToast("已录入新卡片", name, "➕");
    }

    closeEditModal();
  }

  // ==========================================================================
  // 显示已隐藏卡片弹窗控制 (Hidden Cards Modal)
  // ==========================================================================

  function bindHiddenModalEvents() {
    const closeBtn = document.getElementById("btn-close-hidden-modal");
    const unhideAllBtn = document.getElementById("btn-unhide-all-cards");
    const listEl = document.getElementById("hidden-cards-list");

    if (closeBtn) closeBtn.addEventListener("click", closeHiddenModal);
    if (unhideAllBtn) {
      unhideAllBtn.addEventListener("click", function () {
        const ov = getOverrides();
        if (ov) {
          ov.unhideAll();
          showToast("已恢复全部隐藏卡片", "", "👁️");
          renderHiddenCardsList();
        }
      });
    }

    if (listEl) {
      listEl.addEventListener("click", function (e) {
        const btn = e.target.closest("[data-unhide-id]");
        if (btn) {
          const id = btn.getAttribute("data-unhide-id");
          const ov = getOverrides();
          if (ov && id) {
            ov.unhideSite(id);
            showToast("已恢复卡片展示", "", "👁️");
            renderHiddenCardsList();
          }
        }
      });
    }

    if (hiddenModalEl) {
      hiddenModalEl.addEventListener("click", function (e) {
        if (e.target === hiddenModalEl) closeHiddenModal();
      });
    }
  }

  function renderHiddenCardsList() {
    const listEl = document.getElementById("hidden-cards-list");
    if (!listEl) return;

    const ov = getOverrides();
    const hiddenSites = ov ? ov.getHiddenSites() : [];
    const categories = getCategories();
    const catMap = new Map();
    categories.forEach(c => catMap.set(c.id, c.name));

    if (hiddenSites.length === 0) {
      listEl.innerHTML = `
        <div class="hidden-cards-empty">
          <span class="empty-leaf-icon" aria-hidden="true">🍃</span>
          <p>当前没有处于隐藏状态的藏书卡片。</p>
        </div>
      `;
      const unhideAllBtn = document.getElementById("btn-unhide-all-cards");
      if (unhideAllBtn) unhideAllBtn.style.display = "none";
      return;
    }

    const unhideAllBtn = document.getElementById("btn-unhide-all-cards");
    if (unhideAllBtn) unhideAllBtn.style.display = "inline-flex";

    listEl.innerHTML = hiddenSites.map(site => {
      const catName = catMap.get(site.category) || site.category;
      return `
        <div class="hidden-card-row">
          <div class="hidden-card-info">
            <span class="hidden-emblem">${escapeHtml(site.icon || site.name.slice(0, 2))}</span>
            <div class="hidden-texts">
              <strong class="hidden-name">${escapeHtml(site.name)}</strong>
              <div class="hidden-meta">
                <span class="hidden-cat-badge">${escapeHtml(catName)}</span>
                <span class="hidden-url">${escapeHtml(site.url)}</span>
              </div>
            </div>
          </div>
          <button type="button" class="btn-unhide-action" data-unhide-id="${escapeHtml(site.id)}" title="恢复展示">
            恢复显示
          </button>
        </div>
      `;
    }).join("");
  }

  function openHiddenModal() {
    ensureDOMElements();
    renderHiddenCardsList();
    hiddenModalEl.style.display = "flex";
    document.body.classList.add("modal-open");
  }

  function closeHiddenModal() {
    if (hiddenModalEl) hiddenModalEl.style.display = "none";
    document.body.classList.remove("modal-open");
  }

  // ==========================================================================
  // 全局事件监听装配 (Global Listeners)
  // ==========================================================================

  function init() {
    ensureDOMElements();

    // 1. 右键菜单拦截
    document.addEventListener("contextmenu", function (e) {
      // 处于整理模式时，全权由拖拽引擎控制，不弹出上下文菜单
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        return;
      }

      // 忽略在输入框与文本域内的原生右键菜单（让用户能正常黏贴复制）
      const tagName = e.target.tagName;
      if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
        return;
      }
      if (e.target.closest("#card-edit-modal") || e.target.closest("#hidden-cards-modal")) {
        return;
      }

      e.preventDefault();

      const card = e.target.closest(".entry-card");
      if (card) {
        const siteId = card.getAttribute("data-site-id");
        if (siteId) {
          openCardMenu(e.clientX, e.clientY, siteId);
          return;
        }
      }

      // 卡片以外的空白区域
      openBlankMenu(e.clientX, e.clientY);
    });

    // 2. 点击外部关闭菜单
    document.addEventListener("pointerdown", function (e) {
      if (!isMenuOpen) return;
      if (menuEl && !menuEl.contains(e.target)) {
        closeMenu();
      }
    });

    // 3. 菜单项点击代理
    if (menuEl) {
      menuEl.addEventListener("click", function (e) {
        const item = e.target.closest(".ctx-item");
        if (!item) return;

        // 若点击的是具有二级子菜单的父级条目，在移动端切换展开折叠
        if (item.classList.contains("has-submenu") && !e.target.closest(".ctx-subitem")) {
          item.classList.toggle("is-expanded");
          return;
        }

        const action = item.getAttribute("data-action");
        const targetCat = item.getAttribute("data-target-cat");
        if (action) {
          handleMenuAction(action, targetCat);
        }
      });
    }

    // 4. 滚轮与视口调整关闭菜单
    window.addEventListener("scroll", function () {
      if (isMenuOpen) closeMenu();
    }, { passive: true });

    window.addEventListener("resize", function () {
      if (isMenuOpen) closeMenu();
    }, { passive: true });

    // 5. 键盘事件监听 (上下键漫游、右键展开分类、左键返回、Enter 执行、Esc 退出)
    document.addEventListener("keydown", function (e) {
      // 弹窗按 Esc 退出
      if (e.key === "Escape") {
        if (isMenuOpen) {
          e.preventDefault();
          closeMenu();
          return;
        }
        if (editModalEl && editModalEl.style.display !== "none") {
          e.preventDefault();
          closeEditModal();
          return;
        }
        if (hiddenModalEl && hiddenModalEl.style.display !== "none") {
          e.preventDefault();
          closeHiddenModal();
          return;
        }
        const snippetsModal = document.getElementById("snippets-modal");
        if (snippetsModal && snippetsModal.style.display !== "none" && window.NavSnippets) {
          e.preventDefault();
          window.NavSnippets.close();
          return;
        }
      }

      if (!isMenuOpen) return;

      const items = Array.from(menuEl.querySelectorAll(".ctx-item:not(.ctx-disabled)"));
      if (items.length === 0) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        focusedIndex = (focusedIndex + 1) % items.length;
        focusMenuItem(items, focusedIndex);
        return;
      }

      if (e.key === "ArrowUp") {
        e.preventDefault();
        focusedIndex = (focusedIndex - 1 + items.length) % items.length;
        focusMenuItem(items, focusedIndex);
        return;
      }

      if (e.key === "ArrowRight") {
        const curItem = items[focusedIndex];
        if (curItem && curItem.classList.contains("has-submenu")) {
          e.preventDefault();
          const subItem = curItem.querySelector(".ctx-subitem");
          if (subItem) subItem.focus();
        }
        return;
      }

      if (e.key === "Enter") {
        const curItem = items[focusedIndex];
        if (curItem) {
          e.preventDefault();
          curItem.click();
        }
      }
    });

    // 6. 移动端触摸长按 (约 500ms) 触发右键菜单
    document.addEventListener("touchstart", function (e) {
      // 处于整理模式时，触控全权交由拖拽引擎控制，不启动长按菜单计时
      if (window.NavSortable && window.NavSortable.isArrangeMode()) {
        return;
      }
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartX = touch.clientX;
      touchStartY = touch.clientY;

      const target = e.target;
      const card = target.closest(".entry-card");

      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => {
        suppressNextClick = true;
        if (navigator.vibrate) {
          try { navigator.vibrate(35); } catch (err) {}
        }

        if (card) {
          const siteId = card.getAttribute("data-site-id");
          if (siteId) {
            openCardMenu(touchStartX, touchStartY, siteId);
            return;
          }
        }
        openBlankMenu(touchStartX, touchStartY);
      }, 500);
    }, { passive: true });

    document.addEventListener("touchmove", function (e) {
      if (e.touches.length !== 1) {
        clearTimeout(longPressTimer);
        return;
      }
      const touch = e.touches[0];
      const dx = Math.abs(touch.clientX - touchStartX);
      const dy = Math.abs(touch.clientY - touchStartY);
      // 滑动距离大于 8px 时取消长按计时
      if (dx > 8 || dy > 8) {
        clearTimeout(longPressTimer);
      }
    }, { passive: true });

    document.addEventListener("touchend", function () {
      clearTimeout(longPressTimer);
      setTimeout(() => {
        suppressNextClick = false;
      }, 350);
    });

    document.addEventListener("touchcancel", function () {
      clearTimeout(longPressTimer);
      suppressNextClick = false;
    });

    // 捕获阶段拦截长按触发后的误跳转
    document.addEventListener("click", function (e) {
      if (suppressNextClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClick = false;
      }
    }, true);
  }

  function focusMenuItem(items, idx) {
    items.forEach((it, i) => {
      it.classList.toggle("ctx-focused", i === idx);
    });
    if (items[idx]) {
      items[idx].scrollIntoView({ block: "nearest" });
    }
  }

  // 页面自启动
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", init);
    } else {
      init();
    }
  }

  return {
    init,
    openCardMenu,
    openBlankMenu,
    closeMenu,
    openEditModal,
    openCreateModal,
    openHiddenModal
  };
});
