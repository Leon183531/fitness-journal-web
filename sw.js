const cacheName = 'fitness-journal-shell-v8';
const shell = ['./index.html', './app.js', './diary.mjs', './photos.mjs', './backup.mjs', './manifest.webmanifest', './icon.png', './icon-512.png'];

self.addEventListener('install', event => {
  event.waitUntil(caches.open(cacheName)
    .then(cache => cache.addAll(shell.map(url => new Request(url, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(
    keys.filter(key => key.startsWith('fitness-journal-shell-') && key !== cacheName).map(key => caches.delete(key))
  )).then(() => self.clients.claim()));
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('./index.html')));
  } else {
    event.respondWith(fetch(request).catch(() => caches.match(request)));
  }
});
