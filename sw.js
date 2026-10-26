/**
 * 离线开馆 Service Worker（Batch 2）
 * - 页面 HTML：网络优先，3 秒没回应或断网时用本地缓存，所以断网也能打开整座馆
 * - 样式 / 脚本 / 图标：缓存优先，后台静默更新
 * - /api/ 与跨站请求：一律不经手（云同步、探针、守馆人照常走网络）
 * 清单由 `node scripts/build-sw.js` 生成，请勿手改 PRECACHE。
 */
const CACHE_VERSION = "66f8986bc6";
const PRECACHE = [
  "./",
  "./index.html",
  "./404.html",
  "./styles.css?v=5.0.0-batch2",
  "./favicon.svg",
  "./data.js?v=1.8.0",
  "./js/lazy.js?v=5.0.0",
  "./js/storage.js?v=2.0.0",
  "./js/schema.js?v=4.2.0",
  "./js/ledger.js?v=4.1.0",
  "./js/overrides.js?v=4.2.0",
  "./js/theme.js?v=1.7.0",
  "./js/astronomy.js?v=3.0.0",
  "./js/favorites.js?v=1.7.0",
  "./js/visits.js?v=2.0.0",
  "./js/search.js?v=1.7.0",
  "./js/engine.js?v=2.0.0",
  "./js/motion.js?v=1.7.0",
  "./js/sortable.js?v=1.7.0",
  "./js/shortcuts.js?v=5.0.0",
  "./js/commands.js?v=5.0.0",
  "./js/hall.js?v=5.0.0",
  "./js/folio-keys.js?v=2.0.0",
  "./js/serendipity.js?v=4.2.0",
  "./js/marginalia.js?v=2.0.0",
  "./js/uncatalogued.js?v=4.2.0",
  "./js/constellations.js?v=2.0.0",
  "./js/sanctum.js?v=2.0.0",
  "./js/probe.js?v=5.0.0",
  "./app.js?v=5.0.0",
  "./js/librarian.js?v=4.2.0",
  "./js/star-map.js?v=4.2.0",
  "./js/contextmenu.js?v=1.7.0",
  "./js/courier.js?v=5.0.0",
  "./js/amber.js?v=4.1.0",
  "./js/brass-tools.js?v=3.0.0",
  "./js/almanac.js?v=3.1.0",
  "./js/snippets.js?v=2.0.0",
  "./js/lore.js?v=1.7.0",
  "./js/cloud-sync.js?v=1.7.0",
  "./js/exlibris.js?v=1.7.0",
  "./js/particles-bg.js?v=5.0.0",
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
const CACHE_NAME = "mynav-" + CACHE_VERSION;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(PRECACHE.map((url) =>
        cache.add(new Request(url, { cache: "reload" })).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("mynav-") && k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await Promise.race([fetch(request), timeout(3000)]);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    return (await cache.match(request, { ignoreSearch: true }))
      || (await cache.match("./index.html"))
      || Response.error();
  }
}

async function staleWhileRevalidate(request, event) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request) || await cache.match(request, { ignoreSearch: true });
  const refresh = fetch(request).then((response) => {
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  }).catch(() => null);
  if (cached) {
    event.waitUntil(refresh);
    return cached;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || request.destination === "document") {
    event.respondWith(networkFirst(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request, event));
});
