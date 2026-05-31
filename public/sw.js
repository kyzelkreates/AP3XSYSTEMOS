// AP3XVER5E Service Worker — v25
// Cache version must match app version to bust stale assets on deploy.
const CACHE   = 'ap3xver5e-v25';
const ASSETS  = [
  '/',
  '/index.html',
  '/app.js',
  '/styles.css',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
];

// On install: cache all app shell assets, then immediately activate
self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// On activate: delete ALL old caches, claim all clients immediately
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => {
          console.log('[SW] Deleting stale cache:', k);
          return caches.delete(k);
        })
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch strategy:
//   - External API calls (OpenAI, allorigins, corsproxy, fonts): network-only
//   - App shell assets: cache-first, network fallback
//   - Anything else: network-first, cache fallback
self.addEventListener('fetch', (e) => {
  const url = e.request.url;

  // Network-only for all external APIs — never cache these
  if (
    url.includes('openai.com') ||
    url.includes('allorigins') ||
    url.includes('corsproxy') ||
    url.includes('cors.sh') ||
    url.includes('fonts.googleapis') ||
    url.includes('fonts.gstatic')
  ) {
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for app shell assets
  e.respondWith(
    caches.match(e.request).then(cached => {
      if (cached) return cached;
      return fetch(e.request).then(res => {
        // Cache valid responses for app assets
        if (res && res.status === 200 && res.type !== 'opaque') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      }).catch(() => cached || new Response('Offline', { status: 503 }));
    })
  );
});
