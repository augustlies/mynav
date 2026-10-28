/**
 * Module: Batch 2 · 按需加载 (js/lazy.js)
 *
 * 首屏用不到的模块不再随 index.html 一起下载，第一次用到时才插入 <script>：
 *   librarian   索书框输入 ? / ! 前缀、/ask /exec /ai-config
 *   starmap     切到穹顶星图（按钮 / v / /graph / 上次停在星图）
 *   contextmenu 第一次右键 / 长按
 *   courier     盖章小书签 / 同步与备份 / /ingest /notion；带 ?ingest= 打开时首屏立即加载
 *   amber       第一张卡片被探针判为离线时、/amber
 *   brass       黄铜工具尺（按钮 / T / /tools）
 *   almanac     星轨编年
 *   snippets    活字秘卷（按钮 / S / /snippets）
 *   lore        馆长手记（刊头 / c）、首次输入检索词（彩蛋）、空闲时补渲染刊头印章
 *   cloudsync   云同步按钮；本机已登录（存有口令）时空闲加载以保持后台同步
 *   exlibris    藏书票（卡片按钮 / e）
 *   serendipity 今日开卷转盘（按钮 / R / /random）
 *   particles   背景粒子：首屏渲染完成后空闲加载；减弱动效 / 省流量时不加载
 *   probe       星轨联通探针（Batch 3）：首屏装配完立即载入，不再压在首屏脚本链上
 *   astronomy   恒星时 / 月相（Batch 3）：同上
 *   uncatalogued 待编目匣（Batch 3）：同上；载入前按 U / 点入口也不落空
 *
 * 契约：触发前只有这里注册的轻量壳；第一次点击 / 按键不会被吞掉 ——
 * 拦下这次事件、显示加载态（aria-busy），模块就绪后原样重放一次。
 * 必须在 app.js 之前执行；模块的 init() 由这里负责（app.js Stage 2 不再初始化它们）。
 * 各模块的样式在 css/<name>.css，随脚本并行载入（不再压在首屏的 styles.css 里）。
 * 新增懒加载模块后请运行 `node scripts/build-sw.js`，它会读取下面的 src / css 列表写入离线预缓存。
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.NavLazy = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const MODULES = {
    librarian: { src: "js/librarian.js?v=4.2.0", css: "css/librarian.css?v=5.0.0", global: "NavLibrarian", ref: "Librarian", init: true },
    starmap: { src: "js/star-map.js?v=4.2.1", css: "css/starmap.css?v=5.0.0", global: "NavStarMap", ref: "StarMap" },
    contextmenu: { src: "js/contextmenu.js?v=1.7.0", css: "css/contextmenu.css?v=5.0.0", global: "NavContextMenu", ref: "ContextMenu" },
    courier: { src: "js/courier.js?v=5.0.0", css: "css/courier.css?v=b3.8", global: "NavCourier", ref: "Courier", init: true },
    amber: { src: "js/amber.js?v=4.1.0", css: "css/amber.css?v=5.0.0", global: "NavAmber", ref: "Amber", init: true, after: "syncCards" },
    brass: { src: "js/brass-tools.js?v=3.0.0", css: "css/brass.css?v=5.0.0", global: "NavBrassTools", ref: "BrassTools", init: true },
    almanac: { src: "js/almanac.js?v=3.1.0", css: "css/almanac.css?v=5.0.0", global: "NavAlmanac", ref: "Almanac", init: true, after: "refresh" },
    snippets: { src: "js/snippets.js?v=2.0.0", css: "css/snippets.css?v=5.0.0", global: "NavSnippets", ref: "Snippets", init: true },
    lore: { src: "js/lore.js?v=b3.8", css: "css/lore.css?v=5.0.0", global: "NavLore", ref: "Lore", init: true },
    cloudsync: { src: "js/cloud-sync.js?v=1.7.0", global: "NavCloudSync", ref: "CloudSync" },
    exlibris: { src: "js/exlibris.js?v=1.7.0", css: "css/exlibris.css?v=5.0.0", global: "NavExLibris", ref: "ExLibris", init: true },
    serendipity: { src: "js/serendipity.js?v=4.2.0", css: "css/serendipity.css?v=5.0.0", global: "NavSerendipity", ref: "Serendipity", init: true },
    particles: { src: "js/particles-bg.js?v=5.0.0", global: "NavParticlesBg", ref: "ParticlesBg" },
    // Batch 3：首屏后立即载入（不等空闲），init 由 app.js Stage 2 负责（boot: true = 不冲刷 Stage 2、不在这里 init）。
    probe: { src: "js/probe.js?v=b3.8", global: "NavProbe", ref: "Probe", boot: true },
    astronomy: { src: "js/astronomy.js?v=3.0.0", global: "NavAstronomy", ref: "Astronomy", boot: true },
    uncatalogued: { src: "js/uncatalogued.js?v=b3.8", global: "NavUncatalogued", ref: "Uncatalogued", boot: true, init: true }
  };

  // 点击触发：首次点击被拦下 → 加载 → 重放。
  const CLICK_TRIGGERS = [
    ["#btn-courier-entry", "courier"],
    ["#btn-snippets-entry", "snippets"],
    ["#btn-librarian-snippet", "snippets"],
    ["#btn-brass-tools-entry", "brass"],
    ["#btn-cloud-sync", "cloudsync"],
    ["#btn-colophon-mark", "lore"],
    ["[data-bookplate-id]", "exlibris"],
    ["#btn-uncatalogued-entry", "uncatalogued"],
    ["#btn-uncatalogued-mobile", "uncatalogued"],
    ["[data-uncatalogued-open-drawer]", "uncatalogued"]
  ];

  // 按键触发（非输入态、无修饰键）。
  const KEY_TRIGGERS = { s: "snippets", S: "snippets", T: "brass", c: "lore", C: "lore", u: "uncatalogued", U: "uncatalogued" };

  const pending = {};
  const ready = {};

  function isLoaded(name) {
    return Boolean(ready[name]);
  }

  function whenApp() {
    if (window.NavApp) return Promise.resolve();
    return new Promise(function (resolve) {
      if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", function () { resolve(); }, { once: true });
      } else {
        // defer 脚本尚未全部执行：等 app.js 完成首屏装配。
        const timer = setInterval(function () {
          if (window.NavApp || document.readyState === "complete") { clearInterval(timer); resolve(); }
        }, 16);
      }
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = function () { resolve(); };
      el.onerror = function () {
        el.remove();
        reject(new Error("lazy-load failed: " + src));
      };
      document.head.appendChild(el);
    });
  }

  // 模块自带的样式（从 styles.css 拆出，减轻首屏阻塞渲染的 CSS）：与脚本并行载入。
  function loadStyle(href) {
    return new Promise(function (resolve) {
      if (document.querySelector("link[data-lazy-css=\"" + href + "\"]")) { resolve(); return; }
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.setAttribute("data-lazy-css", href);
      link.onload = function () { resolve(); };
      link.onerror = function () { resolve(); }; // 样式缺失不阻断功能
      document.head.appendChild(link);
    });
  }

  function notifyFail(name) {
    if (window.NavShortcuts && typeof window.NavShortcuts.showToast === "function") {
      window.NavShortcuts.showToast("模块载入失败", "网络不可用且本机尚无缓存：" + name, "⚠");
    }
  }

  function ensure(name) {
    const spec = MODULES[name];
    if (!spec) return Promise.reject(new Error("unknown lazy module: " + name));
    if (pending[name]) return pending[name];
    const already = Boolean(window[spec.global]);
    pending[name] = Promise.all([
      already ? Promise.resolve() : loadScript(spec.src),
      spec.css ? loadStyle(spec.css) : Promise.resolve()
    ])
      .then(whenApp)
      .then(function () {
        const mod = window[spec.global];
        if (!mod) throw new Error("lazy module missing global: " + spec.global);
        if (!spec.boot && window.NavApp && typeof window.NavApp.flushIdleBoot === "function") window.NavApp.flushIdleBoot();
        if (spec.init && typeof mod.init === "function") {
          try { mod.init(); } catch (error) {
            if (window.console) console.error("[NavLazy] " + name + " init failed:", error);
          }
        }
        if (window.NavApp && spec.ref) window.NavApp[spec.ref] = mod;
        if (spec.after && typeof mod[spec.after] === "function") {
          try { mod[spec.after](); } catch (error) {}
        }
        ready[name] = true;
        window.dispatchEvent(new CustomEvent("mynav-lazy-ready", { detail: { name: name } }));
        return mod;
      })
      .catch(function (error) {
        delete pending[name];
        notifyFail(name);
        throw error;
      });
    return pending[name];
  }

  // 以模块为前提执行一个动作（命令表 / app.js 使用）。
  function run(name, fn) {
    return ensure(name).then(function (mod) {
      return typeof fn === "function" ? fn(mod) : mod;
    }).catch(function () { return null; });
  }

  function idle(fn, timeout) {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(fn, { timeout: timeout || 3000 });
    } else {
      setTimeout(fn, 1200);
    }
  }

  function isEditable(target) {
    if (!target) return false;
    const tag = target.tagName ? target.tagName.toLowerCase() : "";
    return tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable === true;
  }

  // ------------------------------------------------------------------------
  // 壳：首次交互拦截 + 重放
  // ------------------------------------------------------------------------
  function onClickCapture(event) {
    if (event.__navLazyReplay) return;
    for (let i = 0; i < CLICK_TRIGGERS.length; i += 1) {
      const el = event.target.closest ? event.target.closest(CLICK_TRIGGERS[i][0]) : null;
      if (!el) continue;
      const name = CLICK_TRIGGERS[i][1];
      if (isLoaded(name)) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      if (el.getAttribute("aria-busy") === "true") return;
      el.setAttribute("aria-busy", "true");
      ensure(name).then(function () {
        el.removeAttribute("aria-busy");
        el.click();
      }, function () {
        el.removeAttribute("aria-busy");
      });
      return;
    }
  }

  function anyModalOpen() {
    return document.body.classList.contains("modal-open") ||
      Boolean(document.querySelector(".uncatalogued-drawer:not([hidden]), .brass-workbench:not([hidden]), .courier-modal:not([hidden]), .amber-modal:not([hidden])"));
  }

  function onKeyCapture(event) {
    const name = KEY_TRIGGERS[event.key];
    if (!name || isLoaded(name)) return;
    if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    if (isEditable(event.target) || anyModalOpen()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    // 馆务抽屉开着时按抽屉里标注的快捷键：先收起抽屉，再执行。
    if (window.NavHall && window.NavHall.isOpen && window.NavHall.isOpen()) window.NavHall.close({ returnFocus: false });
    const key = event.key;
    const code = event.code;
    const shiftKey = event.shiftKey;
    ensure(name).then(function () {
      const target = document.activeElement && document.activeElement !== document.documentElement
        ? document.activeElement
        : document.body;
      target.dispatchEvent(new KeyboardEvent("keydown", {
        key: key, code: code, shiftKey: shiftKey, bubbles: true, cancelable: true
      }));
    }, function () {});
  }

  function onContextMenuCapture(event) {
    if (isLoaded("contextmenu") || event.__navLazyReplay) return;
    if (isEditable(event.target)) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const target = event.target;
    const init = { bubbles: true, cancelable: true, clientX: event.clientX, clientY: event.clientY, button: 2 };
    ensure("contextmenu").then(function () {
      target.dispatchEvent(new MouseEvent("contextmenu", init));
    }, function () {});
  }

  // 触屏长按：首次触摸就预取右键菜单；若这次就是长按，模块就绪后补开菜单。
  let touch = null;
  function onTouchStart(event) {
    if (isLoaded("contextmenu") || !event.touches || event.touches.length !== 1) return;
    const t = event.touches[0];
    const card = event.target.closest ? event.target.closest(".entry-card[data-site-id]") : null;
    if (!card && !(event.target.closest && event.target.closest("#archive-content-area"))) return;
    touch = { x: t.clientX, y: t.clientY, siteId: card ? card.getAttribute("data-site-id") : null, alive: true };
    const current = touch;
    ensure("contextmenu").catch(function () {});
    setTimeout(function () {
      if (!current.alive || touch !== current) return;
      ensure("contextmenu").then(function (menu) {
        if (!current.alive || !menu) return;
        if (current.siteId && typeof menu.openCardMenu === "function") menu.openCardMenu(current.x, current.y, current.siteId);
        else if (typeof menu.openBlankMenu === "function") menu.openBlankMenu(current.x, current.y);
        // 长按后紧随的 click 不应把书打开。
        const swallow = function (e) { e.preventDefault(); e.stopPropagation(); };
        document.addEventListener("click", swallow, { capture: true, once: true });
        setTimeout(function () { document.removeEventListener("click", swallow, true); }, 700);
      }, function () {});
    }, 560);
  }
  function onTouchEnd(event) {
    if (!touch) return;
    if (event.type === "touchmove" && event.touches && event.touches[0]) {
      const t = event.touches[0];
      if (Math.abs(t.clientX - touch.x) < 10 && Math.abs(t.clientY - touch.y) < 10) return;
    }
    touch.alive = false;
    touch = null;
  }

  function onProbeUpdated(event) {
    const detail = event && event.detail;
    if (isLoaded("amber") || !detail || !(detail.offline > 0)) return;
    ensure("amber").catch(function () {});
  }

  function hasSyncToken() {
    try { return Boolean(window.localStorage.getItem("mynav_arch_sync_token")); } catch (e) { return false; }
  }

  function saveData() {
    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    return Boolean(conn && conn.saveData);
  }

  function reducedMotion() {
    return Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  }

  function hasIngestParam() {
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("ingest") !== null;
    } catch (e) { return false; }
  }

  function afterFirstPaint() {
    // 首屏落定之后的空闲时段：粒子背景、刊头印章（lore）、已登录时的云同步。
    idle(function () {
      if (!reducedMotion() && !saveData()) ensure("particles").catch(function () {});
    }, 2500);
    idle(function () { ensure("lore").catch(function () {}); }, 4000);
    if (hasSyncToken()) idle(function () { ensure("cloudsync").catch(function () {}); }, 3000);
  }

  function install() {
    document.addEventListener("click", onClickCapture, true);
    window.addEventListener("keydown", onKeyCapture, true);
    window.addEventListener("contextmenu", onContextMenuCapture, true);
    document.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
    document.addEventListener("touchmove", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchend", onTouchEnd, { capture: true, passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { capture: true, passive: true });
    window.addEventListener("mynav-probe-updated", onProbeUpdated);

    // 带 ?ingest= 打开（盖章小书签回传）：首屏立即加载飞鸽，确认匣马上弹出。
    if (hasIngestParam()) ensure("courier").catch(function () {});

    if (document.readyState === "complete") afterFirstPaint();
    else window.addEventListener("load", afterFirstPaint, { once: true });
  }

  if (typeof document !== "undefined") install();

  return {
    ensure,
    run,
    isLoaded,
    MODULES
  };
});
