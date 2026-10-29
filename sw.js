// Holdfast service worker — network-first so new versions always arrive; cache is the offline fallback.
const VERSION = 'holdfast-2';
const CACHE = 'holdfast-cache-' + VERSION;
const CORE = [
  './', 'index.html', 'manifest.webmanifest', 'version.json',
  'js/main.js', 'js/config.js', 'js/engine.js', 'js/render.js', 'js/screens.js', 'js/ui.js', 'js/save.js', 'js/progress.js', 'js/audio.js', 'js/tutorial.js',
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png',
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith('holdfast-cache-') && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== location.origin) return;
  e.respondWith((async () => {
    try {
      const fresh = await fetch(req, { cache: 'no-store' });
      if (fresh && fresh.ok && !req.url.includes('version.json')) {
        const c = await caches.open(CACHE); c.put(req, fresh.clone());
      }
      return fresh;
    } catch (err) {
      if (req.url.includes('version.json')) return Response.error();
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return (await caches.match('index.html')) || Response.error();
      return Response.error();
    }
  })());
});
