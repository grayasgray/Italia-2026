<<<<<<< HEAD
const CACHE = 'italia2026-v6';
=======
const CACHE = 'italia2026-v5';
>>>>>>> f7631870812752f0a070c5ded3630f7928728965
const ASSETS = [
  './',
  './index.html',
  './css/app.css',
  './js/app.js',
  './js/ics-parser.js',
  './js/claude.js',
  './js/store.js',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=DM+Sans:wght@300;400;500&display=swap'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // Network first for ICS calendar data, cache first for everything else
  if (e.request.url.includes('webcal') || e.request.url.includes('.ics')) {
    e.respondWith(
      fetch(e.request).catch(() => caches.match(e.request))
    );
    return;
  }
  // Claude API — always network
  if (e.request.url.includes('anthropic.com')) {
    e.respondWith(fetch(e.request));
    return;
  }
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
