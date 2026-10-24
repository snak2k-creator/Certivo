// Certivo service worker: app shell cached on install, cert packs refreshed in the background.
const VERSION = "certivo-v1";
const SHELL = ["./", "index.html", "manifest.webmanifest", "certs/index.json", "certs/ai-103.json", "icons/icon.svg", "icons/icon-192.png", "icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.pathname.includes("/api/")) return; // AI tutor always goes to the network
  // Stale-while-revalidate for same-origin files and Google Fonts.
  if (url.origin === location.origin || url.hostname.endsWith("fonts.googleapis.com") || url.hostname.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSION).then(async (cache) => {
      const hit = await cache.match(req, { ignoreSearch: url.origin === location.origin });
      const net = fetch(req).then((res) => { if (res.ok || res.type === "opaque") cache.put(req, res.clone()); return res; }).catch(() => null);
      if (hit) { e.waitUntil(net); return hit; }
      const res = await net;
      if (res) return res;
      if (req.mode === "navigate") return cache.match("index.html");
      return new Response("", { status: 504 });
    }));
  }
});
