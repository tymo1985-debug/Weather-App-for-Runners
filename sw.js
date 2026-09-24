const PREFIX = 'weather-runner-';
const SHELL_CACHE = `${PREFIX}shell-v39`;
const API_CACHE = `${PREFIX}api-v6`;
const API_TTL_MS = 5 * 60 * 1000;
const API_MAX_ENTRIES = 20;
const SHELL = [
  './', './css/styles.css',
  './js/app.js', './js/home-ui.js', './js/run-plan.js', './js/weather-watch.js', './js/background-watch.js', './js/route-plan.js', './js/route-weather.js', './js/run-history.js', './js/engine.js', './js/icons.js',
  './js/i18n.js', './js/version.js', './manifest.webmanifest', './assets/prague-weather-hero.svg',
  './icons/icon-192.png', './icons/icon-512.png',
  './vendor/leaflet/leaflet.js', './vendor/leaflet/leaflet.css'
];

const isApi = host => host === 'api.rainviewer.com' ||
  host === 'api.open-meteo.com' || host === 'air-quality-api.open-meteo.com' ||
  host === 'geocoding-api.open-meteo.com' || host === 'api.bigdatacloud.net';

async function trimApi(cache) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - API_MAX_ENTRIES))) {
    await cache.delete(key);
  }
}

async function apiResponse(req) {
  const cache = await caches.open(API_CACHE);
  try {
    const response = await fetch(req);
    if (response.ok) {
      const headers = new Headers(response.headers);
      headers.set('x-weather-runner-cached-at', String(Date.now()));
      const stored = new Response(await response.clone().blob(), {
        status: response.status, statusText: response.statusText, headers
      });
      await cache.delete(req); // Move updated entries to the end for deterministic eviction.
      await cache.put(req, stored);
      await trimApi(cache);
    }
    return response;
  } catch (error) {
    const hit = await cache.match(req);
    const savedAt = Number(hit?.headers.get('x-weather-runner-cached-at'));
    if (hit && savedAt > 0 && Date.now() - savedAt >= 0 && Date.now() - savedAt <= API_TTL_MS) {
      return hit;
    }
    if (hit) await cache.delete(req);
    throw error;
  }
}

self.addEventListener('install', e => {
  // An upgrade must not seed the new cache from an old HTTP-cached app shell.
  e.waitUntil(caches.open(SHELL_CACHE)
    .then(c => c.addAll(SHELL.map(path => new Request(path, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k === 'rw-v4' || k === 'rw-v5' ||
        (k.startsWith(PREFIX) && k !== SHELL_CACHE && k !== API_CACHE))
        .map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Map tiles are network only; the radar metadata API has its own short cache.
  if (url.host === 'tilecache.rainviewer.com' || url.host === 'tile.openstreetmap.org') return;
  if (isApi(url.host)) {
    e.respondWith(apiResponse(req));
    return;
  }
  if (url.origin !== location.origin) return;
  if (/\/api\/watch(?:\/|$)/.test(url.pathname)) return;

  e.respondWith(
    caches.open(SHELL_CACHE).then(async cache => {
      const hit = await cache.match(req);
      if (hit) return hit;
      try {
        const response = await fetch(req);
        if (response.ok) await cache.put(req, response.clone());
        return response;
      } catch (error) {
        if (req.mode === 'navigate') {
          const index = await cache.match('./');
          if (index) return index;
        }
        throw error;
      }
    })
  );
});


self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data?.json?.() || {}; } catch {}
  const title = payload.title || 'Run Weather';
  const icon = new URL('icons/icon-192.png', self.registration.scope).href;
  const badge = new URL('icons/icon-192.png', self.registration.scope).href;
  const url = new URL(payload.url || './', self.registration.scope).href;
  event.waitUntil(self.registration.showNotification(title, {
    body: payload.body || '',
    icon,
    badge,
    tag: 'run-weather-watch',
    renotify: true,
    data: { ...(payload.data || {}), url }
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = event.notification.data?.url ||
    new URL('./', self.registration.scope).href;
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const client of list) {
      if (client.url === target && 'focus' in client) return client.focus();
    }
    return clients.openWindow ? clients.openWindow(target) : undefined;
  }));
});
