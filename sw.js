/**
 * 离线开馆 Service Worker（Batch 3 · 秒开）
 * - 入口页（/、/index.html，含 ?ingest= 等查询串）：缓存优先，立即用本地副本开馆；
 *   后台静默回源比对，有新版时先把新页面引用的脚本/样式补进缓存，再替换本地副本，
 *   下一次打开生效（不强制刷新），并给页面发一条 mynav-updated 消息。
 * - data.js：缓存优先，后台回源；馆主直接替换 data.js（不改版本号）也会在下次打开时生效。
 * - 其余样式 / 脚本 / 图标：缓存优先，后台静默更新。
 * - 首次访问（尚无缓存）照常走网络；/api/ 与跨站请求一律不经手。
 * 清单由 `node scripts/build-sw.js` 生成，请勿手改 PRECACHE。
 */
const CACHE_VERSION = "f973384cc8";
const PRECACHE = [
  "./",
  "./index.html",
  "./404.html",
  "./styles.css?v=20261030a",
  "./favicon.svg",
  "./data.js?v=1.8.0",
  "./js/lazy.js?v=b3.9",
  "./js/storage.js?v=2.0.0",
  "./js/schema.js?v=b3.9",
  "./js/ledger.js?v=4.1.0",
  "./js/overrides.js?v=4.2.0",
  "./js/theme.js?v=1.7.0",
  "./js/favorites.js?v=1.7.0",
  "./js/visits.js?v=2.0.0",
  "./js/search.js?v=1.7.0",
  "./js/engine.js?v=b3.9",
  "./js/motion.js?v=1.7.0",
  "./js/sortable.js?v=1.7.0",
  "./js/shortcuts.js?v=b3.9",
  "./js/commands.js?v=b3.9",
  "./js/hall.js?v=b3.9",
  "./js/folio-keys.js?v=2.0.0",
  "./js/marginalia.js?v=2.0.0",
  "./js/constellations.js?v=2.0.0",
  "./js/sanctum.js?v=2.0.0",
  "./app.js?v=20261030a",
  "./js/librarian.js?v=4.2.0",
  "./css/librarian.css?v=5.0.0",
  "./js/star-map.js?v=4.2.1",
  "./css/starmap.css?v=5.0.0",
  "./js/contextmenu.js?v=1.7.0",
  "./css/contextmenu.css?v=5.0.0",
  "./js/courier.js?v=5.0.0",
  "./css/courier.css?v=b3.9",
  "./js/amber.js?v=4.1.0",
  "./css/amber.css?v=5.0.0",
  "./js/brass-tools.js?v=3.0.0",
  "./css/brass.css?v=5.0.0",
  "./js/almanac.js?v=3.1.0",
  "./css/almanac.css?v=5.0.0",
  "./js/snippets.js?v=2.0.0",
  "./css/snippets.css?v=5.0.0",
  "./js/lore.js?v=b3.9",
  "./css/lore.css?v=5.0.0",
  "./js/cloud-sync.js?v=1.7.0",
  "./js/exlibris.js?v=1.7.0",
  "./css/exlibris.css?v=5.0.0",
  "./js/serendipity.js?v=4.2.0",
  "./css/serendipity.css?v=5.0.0",
  "./js/particles-bg.js?v=5.0.0",
  "./js/probe.js?v=b3.9",
  "./js/astronomy.js?v=3.0.0",
  "./js/uncatalogued.js?v=b3.9",
  "./icons/ai-chatgpt.png",
  "./icons/ai-claude.png",
  "./icons/ai-deepseek-platform.png",
  "./icons/ai-deepseek.png",
  "./icons/ai-gemini.png",
  "./icons/ai-hark.png",
  "./icons/ai-muse.png",
  "./icons/dev-caniuse.png",
  "./icons/dev-cloudflare.png",
  "./icons/dev-dujing.png",
  "./icons/dev-gcp-console.png",
  "./icons/dev-github.png",
  "./icons/dev-mdn.png",
  "./icons/dev-qinglong.png",
  "./icons/dev-stackoverflow.png",
  "./icons/dev-termius.png",
  "./icons/dev-vercel.png",
  "./icons/learn-bilibili.png",
  "./icons/learn-cnki.png",
  "./icons/learn-ecut-atrust.png",
  "./icons/learn-ecut-ehall.png",
  "./icons/learn-ecut.png",
  "./icons/learn-juejin.png",
  "./icons/learn-runoob.png",
  "./icons/learn-scholar.png",
  "./icons/learn-sspai.png",
  "./icons/learn-youtube.png",
  "./icons/mail-163.png",
  "./icons/mail-gmail.png",
  "./icons/social-discord.png",
  "./icons/social-telegram.png",
  "./icons/social-x.png",
  "./icons/tool-cobalt.png",
  "./icons/tool-icon-icons.png",
  "./icons/tool-notion.png",
  "./icons/tool-processon.png",
  "./icons/tool-tinypng.png",
  "./icons/tool-yuque.png"
];
const CACHE_PREFIX = "mynav-";
const CACHE_NAME = CACHE_PREFIX + CACHE_VERSION;
const SHELL_KEYS = ["./", "./index.html"];

// Cloudflare Pages 会把 /index.html 308 到 /；带 redirected 标记的响应不能直接回给导航请求，这里统一洗掉。
async function clean(response) {
  if (!response || !response.redirected) return response;
  const body = await response.blob();
  return new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
}

function scopeUrl(path) {
  return new URL(path, self.registration.scope).href;
}

function isShellRequest(url) {
  const scopePath = new URL(self.registration.scope).pathname;
  return url.pathname === scopePath || url.pathname === scopePath + "index.html";
}

function isDataRequest(url) {
  return url.pathname === new URL(self.registration.scope).pathname + "data.js";
}

async function broadcast(message) {
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: "window" });
  list.forEach((client) => client.postMessage(message));
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        fetch(new Request(url, { cache: "reload" }))
          .then(clean)
          .then((response) => (response && response.ok ? cache.put(url, response) : null))
          .catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  // 保留上一版缓存一代：仍开着的旧页面按需载入旧 ?v= 模块时不会落空；更早的版本清掉。
  event.waitUntil(
    caches.keys()
      .then((keys) => {
        const old = keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME);
        return Promise.all(old.slice(0, Math.max(0, old.length - 1)).map((k) => caches.delete(k)));
      })
      .then(() => self.clients.claim())
  );
});

async function matchShell() {
  const cache = await caches.open(CACHE_NAME);
  for (const key of SHELL_KEYS) {
    const hit = await cache.match(key);
    if (hit) return hit;
  }
  for (const key of SHELL_KEYS) {
    const hit = await caches.match(key);
    if (hit) return hit;
  }
  return null;
}

let shellRevalidating = null;
function revalidateShell() {
  if (!shellRevalidating) {
    shellRevalidating = doRevalidateShell().catch(() => null).then(() => { shellRevalidating = null; });
  }
  return shellRevalidating;
}

async function doRevalidateShell() {
  const response = await clean(await fetch(new Request(scopeUrl("./"), { cache: "no-cache", credentials: "same-origin" })));
  if (!response || !response.ok) return;
  const text = await response.clone().text();
  const cache = await caches.open(CACHE_NAME);
  const current = await matchShell();
  if (current && (await current.clone().text()) === text) return;
  // 新页面引用的本地脚本 / 样式先补进缓存，补齐了才替换入口页，保证下一次（哪怕断网）开馆版本一致。
  const refs = new Set();
  for (const m of text.matchAll(/<(?:script|link)[^>]+(?:src|href)="([^"]+)"/g)) {
    const ref = m[1];
    if (/^(https?:)?\/\//.test(ref) || ref.startsWith("data:") || ref.startsWith("#")) continue;
    refs.add(scopeUrl(ref));
  }
  let complete = true;
  for (const ref of refs) {
    if (await caches.match(ref)) continue;
    try {
      const fresh = await clean(await fetch(new Request(ref, { cache: "no-cache" })));
      if (fresh && fresh.ok) await cache.put(ref, fresh);
      else complete = false;
    } catch (err) {
      complete = false;
    }
  }
  self.registration.update().catch(() => null);
  if (!complete) return;
  await Promise.all(SHELL_KEYS.map((key) => cache.put(key, new Response(text, {
    status: 200,
    headers: { "Content-Type": response.headers.get("Content-Type") || "text/html; charset=utf-8" }
  }))));
  if (current) broadcast({ type: "mynav-updated", what: "shell" });
}

async function serveShell(request, event) {
  const cached = await matchShell();
  if (cached) {
    event.waitUntil(revalidateShell());
    return cached;
  }
  try {
    const response = await clean(await fetch(request));
    if (response && response.ok) {
      const cache = await caches.open(CACHE_NAME);
      const copy = await response.clone().text();
      await Promise.all(SHELL_KEYS.map((key) => cache.put(key, new Response(copy, { status: 200, headers: response.headers }))));
    }
    return response;
  } catch (err) {
    return (await caches.match("./404.html")) || Response.error();
  }
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

// 其他页面（如 404.html）：网络优先，3 秒没回应或断网时退回缓存。
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await clean(await Promise.race([fetch(request), timeout(3000)]));
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return (await caches.match(request, { ignoreSearch: true }))
      || (await matchShell())
      || Response.error();
  }
}

async function staleWhileRevalidate(request, event, watchChanges) {
  const cache = await caches.open(CACHE_NAME);
  // 先认完全相同的地址（含 ?v=）；版本号一变就走网络拿新文件；断网时才退回旧版本兜底。
  const cached = (await cache.match(request)) || (await caches.match(request));
  const refresh = fetch(request, watchChanges ? { cache: "no-cache" } : undefined).then(async (response) => {
    const fresh = await clean(response);
    if (fresh && fresh.ok) {
      if (watchChanges && cached) {
        const [a, b] = await Promise.all([cached.clone().text(), fresh.clone().text()]);
        await cache.put(request, fresh.clone());
        if (a !== b) broadcast({ type: "mynav-updated", what: "data" });
      } else {
        await cache.put(request, fresh.clone());
      }
    }
    return fresh;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || (await caches.match(request, { ignoreSearch: true })) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(isShellRequest(url) ? serveShell(request, event) : networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, event, isDataRequest(url)));
});
