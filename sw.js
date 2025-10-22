const CACHE = 'o-jogo-v1';
const FILES = ['/', '/index.html', '/styles.css', '/app.js', '/manifest.json'];

self.addEventListener('install', evt => {
  evt.waitUntil(caches.open(CACHE).then(cache => cache.addAll(FILES)));
  self.skipWaiting();
});
self.addEventListener('fetch', evt => {
  evt.respondWith(caches.match(evt.request).then(resp => resp || fetch(evt.request)));
});
