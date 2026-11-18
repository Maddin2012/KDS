/* Service Worker: App-Dateien zwischenspeichern, damit die Serviceliste
   auch ohne Netz startet. Die Daten selbst puffert Firestore (IndexedDB). */
const VERSION = 'kds-v1';
const CORE = [
  './', 'index.html', 'styles.css', 'app.js', 'data.js', 'store-local.js', 'store-firebase.js',
  'config.js', 'manifest.webmanifest',
  'vendor/firebase/firebase-app.js', 'vendor/firebase/firebase-auth.js', 'vendor/firebase/firebase-firestore.js',
  'icons/favicon.svg', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Schriften von Google: einmal laden, dann aus dem Speicher
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(caches.open(VERSION).then(async c => {
      const hit = await c.match(req);
      if (hit) return hit;
      try { const res = await fetch(req); if (res.ok || res.type === 'opaque') c.put(req, res.clone()); return res; }
      catch (err) { return new Response('', { status: 504 }); }
    }));
    return;
  }
  if (url.origin !== self.location.origin) return;

  // Eigene Dateien: erst Netz (damit Updates sofort ankommen), sonst Speicher.
  // cache: 'no-cache' → Browser fragt beim Server nach, statt eine bis zu
  // 10 Minuten alte Kopie aus dem HTTP-Zwischenspeicher von GitHub Pages zu nehmen.
  e.respondWith((async () => {
    try {
      // Seitenaufrufe (mode: navigate) dürfen nicht mit Optionen kopiert werden → per URL laden
      const res = req.mode === 'navigate'
        ? await fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
        : await fetch(req, { cache: 'no-cache' });
      if (res.ok) { const c = await caches.open(VERSION); c.put(req, res.clone()); }
      return res;
    } catch (err) {
      const hit = await caches.match(req, { ignoreSearch: true });
      if (hit) return hit;
      if (req.mode === 'navigate') return caches.match('index.html');
      throw err;
    }
  })());
});
