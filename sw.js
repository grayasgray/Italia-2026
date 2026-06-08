/**
 * Service Worker — Network-first strategy for app files
 * This ensures GitHub updates are always picked up immediately.
 *
 * Strategy: Always try network first for app files.
 * If offline, fall back to cache. This is the opposite of the old
 * cache-first approach which caused stale versions to stick around.
 */

const CACHE = 'italia2026-v31';

// Files to pre-cache on install
const PRECACHE_ASSETS = [
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/ics-parser.js',
  './js/claude.js',
  './js/store.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png'
];

// ── Install: pre-cache core assets ──────────────────────────────
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(PRECACHE_ASSETS))
      // skipWaiting means new SW activates immediately without waiting
      // for old tabs to close — critical for getting updates fast
      .then(() => self.skipWaiting())
  );
});

// ── Activate: delete all old caches ─────────────────────────────
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      // clients.claim() takes control of all open tabs immediately
      .then(() => self.clients.claim())
  );
});

// ── Fetch: network-first for app files, passthrough for API ─────
self.addEventListener('fetch', e => {
  const url = e.request.url;

  // Always go direct to network — never cache
  if (url.includes('anthropic.com') ||
      url.includes('corsproxy.io')  ||
      url.includes('webcal')        ||
      url.includes('.ics')          ||
      url.includes('fonts.googleapis.com') ||
      url.includes('fonts.gstatic.com')) {
    e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
    return;
  }

  // App shell files — network first, cache as fallback
  // This means every load checks GitHub for updates.
  // If network fails (offline), the cached version is used.
  e.respondWith(
    fetch(e.request)
      .then(networkResponse => {
        // Got a fresh response — update the cache silently
        if (networkResponse && networkResponse.status === 200) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE).then(c => c.put(e.request, responseClone));
        }
        return networkResponse;
      })
      .catch(() => {
        // Network failed — serve from cache
        return caches.match(e.request);
      })
  );
});

// ── Message: force update from app ──────────────────────────────
// Called by app.js to trigger immediate update check
self.addEventListener('message', e => {
  if (e.data === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
