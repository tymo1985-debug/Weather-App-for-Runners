const V = 'rw-v2';
const SHELL = [
  './', './index.html', './css/styles.css',
  './js/app.js', './js/engine.js', './js/icons.js',
  './js/i18n.js', './manifest.webmanifest',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Тайлы карты и радара — только из сети, без кеша.
  if (/tilecache\.rainviewer|basemaps\.cartocdn/.test(url.host)) return;

  // Погодные API — сеть вперёд, кеш как запасной вариант.
  if (/open-meteo\.com|bigdatacloud\.net/.test(url.host)) {
    e.respondWith(
      fetch(req).then(r => {
        const copy = r.clone();
        caches.open(V).then(c => c.put(req, copy));
        return r;
      }).catch(() => caches.match(req))
    );
    return;
  }

  // Оболочка приложения — кеш вперёд.
  e.respondWith(
    caches.match(req).then(hit => hit || fetch(req).then(r => {
      if (r.ok && url.origin === location.origin) {
        const copy = r.clone();
        caches.open(V).then(c => c.put(req, copy));
      }
      return r;
    }).catch(() => caches.match('./index.html')))
  );
});
