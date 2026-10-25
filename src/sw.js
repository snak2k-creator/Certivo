// ZAN service worker. The build fills in VERSION and PRECACHE (vite.config.ts).
const VERSION = '__VERSION__';
const PRECACHE = __PRECACHE__;

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k.startsWith('zan-')).map((k) => caches.delete(k))))
      .then(() => caches.keys())
      // the old Certivo caches are no longer used
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('certivo-')).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

async function networkFirst(req) {
  const cache = await caches.open(VERSION);
  try {
    const res = await fetch(req);
    if (res.ok) cache.put('./', res.clone());
    return res;
  } catch {
    return (await cache.match('./')) || new Response('offline', { status: 503 });
  }
}

async function cacheFirst(req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req);
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

async function staleWhileRevalidate(e, req) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(req, { ignoreSearch: true });
  const net = fetch(req).then((res) => { if (res.ok || res.type === 'opaque') cache.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || new Response('', { status: 504 });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin === location.origin) {
    if (url.pathname.startsWith('/api/')) return;
    if (req.mode === 'navigate') { e.respondWith(networkFirst(req)); return; }
    if (url.pathname.startsWith('/assets/')) { e.respondWith(cacheFirst(req)); return; }
    e.respondWith(staleWhileRevalidate(e, req));
    return;
  }
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') e.respondWith(staleWhileRevalidate(e, req));
});
