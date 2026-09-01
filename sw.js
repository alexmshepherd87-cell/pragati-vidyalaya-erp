/* Pragati Vidyalaya ERP - Service Worker
 * Caches the app shell so the PWA loads offline. Bump CACHE_VERSION on each release.
 */
var CACHE_VERSION = 'pragati-v19-1';
var APP_SHELL = [
  './',
  './index.html',
  './pragati_v19.html',
  './manifest.json',
  './icon-192.png',
  './icon-512.png'
];

// Install: pre-cache the app shell.
self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(APP_SHELL).catch(function () {
        // If any single asset fails (e.g. not deployed yet), don't block install.
        return Promise.resolve();
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

// Activate: drop old caches.
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (k) {
        if (k !== CACHE_VERSION) return caches.delete(k);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

// Fetch strategy:
//  - Never touch cross-origin requests (Firebase, Google Fonts, gstatic) -> let the network handle them.
//  - Navigation requests: network-first, fall back to cached shell when offline.
//  - Same-origin assets: cache-first, then network, and refresh the cache in the background.
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return; // Firebase / fonts / CDNs bypass the SW.

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req).then(function (res) {
        var copy = res.clone();
        caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        return res;
      }).catch(function () {
        return caches.match(req).then(function (hit) {
          return hit || caches.match('./index.html') || caches.match('./pragati_v19.html');
        });
      })
    );
    return;
  }

  event.respondWith(
    caches.match(req).then(function (hit) {
      var fetchPromise = fetch(req).then(function (res) {
        if (res && res.status === 200) {
          var copy = res.clone();
          caches.open(CACHE_VERSION).then(function (c) { c.put(req, copy); });
        }
        return res;
      }).catch(function () { return hit; });
      return hit || fetchPromise;
    })
  );
});
