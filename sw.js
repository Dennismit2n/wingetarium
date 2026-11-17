/*
 * Wingetarium: Service Worker. Hält App und letzten Datenstand für den Start ohne Netz bereit.
 * App-Dateien: sofort aus dem Speicher, im Hintergrund erneuert (stale-while-revalidate).
 * Daten (./data/*.json): zuerst das Netz, damit der Stand vom Morgen sofort da ist; ohne Netz der letzte.
 */
'use strict';

// Bei jedem Deploy, der index.html, style.css, app.js oder die Sprachdateien ändert, um 1 erhöhen.
const CACHE = 'wingetarium-v2';
const DATEN = 'wingetarium-daten';
const SPRACHEN = ['de', 'en', 'es', 'fr', 'it', 'nl', 'pl', 'pt', 'tr', 'ru', 'hi', 'zh', 'ja', 'ko'];
const SHELL = [
  './', './index.html', './style.css?v=2026-11-17', './app.js?v=2026-11-17', './fonts/plex.css?v=2026-11-12b',
  './manifest.webmanifest', './favicon.svg', './icon-192.png', './icon-512.png', './icon-maskable.png',
  ...SPRACHEN.map(l => './i18n/' + l + '.json')
];

function fillShell(cache) {
  return cache.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })));
}
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(fillShell).then(() => self.skipWaiting()));
});
// Nur eigene alte Caches löschen: Cache Storage gehört dem ganzen Origin dennismit2n.github.io.
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k.startsWith('wingetarium-') && k !== CACHE && k !== DATEN).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

async function netzZuerst(e) {
  const cache = await caches.open(DATEN);
  try {
    const r = await fetch(e.request, { cache: 'no-cache' });
    if (r.ok) e.waitUntil(cache.put(e.request, r.clone()));
    return r;
  } catch (err) {
    const hit = await cache.match(e.request);
    if (hit) return hit;
    throw err;
  }
}

async function speicherZuerst(e) {
  const req = e.request, isNav = req.mode === 'navigate';
  const cache = await caches.open(CACHE);
  const hit = await cache.match(req, { ignoreSearch: isNav });
  const net = fetch(req, isNav ? { cache: 'no-cache' } : undefined).then(r => {
    if (r.ok) {
      let key = req;
      if (isNav) { const u = new URL(req.url); u.search = ''; u.hash = ''; key = u.href; }
      e.waitUntil(cache.put(key, r.clone()).catch(() => {}));
    }
    return r;
  });
  e.waitUntil(net.catch(() => null));
  if (hit) return hit;
  try { return await net; } catch (err) {
    if (isNav) { const index = await cache.match('./index.html'); if (index) return index; }
    throw err;
  }
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const u = new URL(req.url);
  if (u.origin !== self.location.origin) return;
  const basis = new URL('./', self.location).pathname;
  if (!u.pathname.startsWith(basis)) return;
  if (u.pathname.startsWith(basis + 'data/')) e.respondWith(netzZuerst(e));
  else e.respondWith(speicherZuerst(e));
});
