/* ConvertiTutto Service Worker
 * 1. Offline: app shell + runtime assets (network-first), FFmpeg core (cache-first, ~32MB, cached on first use).
 * 2. Cross-origin isolation: re-applies COOP/COEP headers to every same-origin response so
 *    SharedArrayBuffer (ffmpeg.wasm multi-thread) works even on static hosts (GitHub Pages / Vercel without config).
 */
const VERSION = "v1";
const SHELL_CACHE = `ct-shell-${VERSION}`;
const RUNTIME_CACHE = `ct-runtime-${VERSION}`;
const FFMPEG_CACHE = "ct-ffmpeg-0.12.10";
const KEEP = [SHELL_CACHE, RUNTIME_CACHE, FFMPEG_CACHE];
const SHELL_URLS = ["/", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL_URLS)).catch(() => undefined).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => !KEEP.includes(k)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function withIsolation(response) {
  if (!response || response.status === 0 || response.type === "opaque") return response;
  const headers = new Headers(response.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  headers.set("Cross-Origin-Resource-Policy", "same-origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

async function cacheFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const res = await fetch(request);
  if (res.ok) await cache.put(request, res.clone());
  return res;
}

async function networkFirst(request, cacheName, fallbackUrl) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res.ok) cache.put(request, res.clone()).catch(() => undefined);
    return res;
  } catch (err) {
    const hit = (await cache.match(request)) || (fallbackUrl && (await caches.match(fallbackUrl)));
    if (hit) return hit;
    throw err;
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  // Never touch the dev server internals / HMR / API
  if (/^\/(api|@vite|@id|@fs|@react-refresh|__)/.test(url.pathname) || request.headers.get("upgrade")) return;

  if (url.pathname.startsWith("/ffmpeg/")) {
    event.respondWith(cacheFirst(request, FFMPEG_CACHE).then(withIsolation));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(networkFirst(request, SHELL_CACHE, "/").then(withIsolation));
    return;
  }
  event.respondWith(networkFirst(request, RUNTIME_CACHE).then(withIsolation));
});
