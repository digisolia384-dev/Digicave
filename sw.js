// ════════════════════════════════════════════════════════════════
//  CaveManager Pro — Service Worker
//  Stratégie : Cache First pour assets CDN/statiques
//              Network First pour index.html (mise à jour auto)
//              Background Sync pour Firebase (offline-first)
// ════════════════════════════════════════════════════════════════

const SW_VERSION  = 'v1.0.0';
const CACHE_STATIC = `cave-static-${SW_VERSION}`;
const CACHE_CDN    = `cave-cdn-${SW_VERSION}`;
const CACHE_PAGES  = `cave-pages-${SW_VERSION}`;

// Assets locaux à précacher à l'installation
const STATIC_ASSETS = [
  './index.html',
  './manifest.json',
];

// Domaines CDN à mettre en cache (Cache First)
const CDN_HOSTS = [
  'fonts.googleapis.com',
  'fonts.gstatic.com',
  'cdnjs.cloudflare.com',
  'cdn.jsdelivr.net',
];

// Domaines Firebase — toujours Network First, jamais interceptés
const FIREBASE_HOSTS = [
  'firebaseio.com',
  'firestore.googleapis.com',
  'firebase.googleapis.com',
  'identitytoolkit.googleapis.com',
  'securetoken.googleapis.com',
];

// ─── INSTALL ─────────────────────────────────────────────────
self.addEventListener('install', event => {
  console.log(`[SW ${SW_VERSION}] Installation`);
  event.waitUntil(
    caches.open(CACHE_STATIC)
      .then(cache => cache.addAll(STATIC_ASSETS))
      .then(() => self.skipWaiting())   // Active immédiatement
      .catch(err => console.warn('[SW] Précache partiel:', err))
  );
});

// ─── ACTIVATE ────────────────────────────────────────────────
self.addEventListener('activate', event => {
  console.log(`[SW ${SW_VERSION}] Activation`);
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(k => k !== CACHE_STATIC && k !== CACHE_CDN && k !== CACHE_PAGES)
          .map(k => { console.log('[SW] Suppression ancien cache:', k); return caches.delete(k); })
      )
    ).then(() => self.clients.claim())  // Prend le contrôle immédiat
  );
});

// ─── FETCH ───────────────────────────────────────────────────
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // 1. Ignorer les requêtes non-GET
  if (request.method !== 'GET') return;

  // 2. Firebase → toujours réseau, jamais intercepté
  if (FIREBASE_HOSTS.some(h => url.hostname.includes(h))) return;

  // 3. CDN (Google Fonts, etc.) → Cache First avec fallback réseau
  if (CDN_HOSTS.some(h => url.hostname.includes(h))) {
    event.respondWith(cacheFirst(request, CACHE_CDN));
    return;
  }

  // 4. index.html / pages locales → Network First (mise à jour garantie)
  if (url.hostname === self.location.hostname || url.protocol === 'file:') {
    if (request.destination === 'document' || url.pathname.endsWith('.html')) {
      event.respondWith(networkFirst(request, CACHE_PAGES));
      return;
    }
    // Autres assets locaux (images, icônes, sw.js lui-même) → Cache First
    event.respondWith(cacheFirst(request, CACHE_STATIC));
    return;
  }
});

// ─── STRATÉGIES ──────────────────────────────────────────────

/**
 * Cache First : retourne le cache si disponible, sinon réseau + mise en cache
 */
async function cacheFirst(request, cacheName) {
  const cache  = await caches.open(cacheName);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Offline et pas en cache : retourner page offline si dispo
    const fallback = await caches.match('./index.html');
    return fallback || new Response('Hors ligne — CaveManager Pro', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  }
}

/**
 * Network First : essaie le réseau d'abord, fallback cache si offline
 */
async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    // Offline → retourner depuis le cache
    const cached = await cache.match(request);
    if (cached) {
      console.log('[SW] Hors ligne — servi depuis le cache:', request.url);
      return cached;
    }
    // Dernier recours : index.html (SPA fallback)
    const spa = await caches.match('./index.html');
    return spa || new Response(offlinePage(), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' }
    });
  }
}

// ─── PAGE OFFLINE EMBARQUÉE ───────────────────────────────────
function offlinePage() {
  return `<!DOCTYPE html>
<html lang="fr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#0D0A14"/>
<title>CaveManager Pro — Hors ligne</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0;}
  body{background:#0D0A14;color:#F0EAF5;font-family:'DM Sans',sans-serif;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;}
  .icon{font-size:4rem;filter:drop-shadow(0 0 20px rgba(139,26,26,.8));}
  h1{font-size:1.6rem;color:#C9A84C;}
  p{color:#9B8FB0;font-size:.9rem;max-width:300px;line-height:1.6;}
  .badge{background:rgba(231,76,60,.15);border:1px solid rgba(231,76,60,.4);color:#FF8080;padding:8px 20px;border-radius:20px;font-size:.82rem;margin-top:8px;}
  .btn{background:linear-gradient(135deg,#8B1A1A,#B22222);color:#fff;border:none;padding:12px 28px;border-radius:8px;font-size:.92rem;font-weight:600;cursor:pointer;margin-top:12px;}
  .info{font-size:.78rem;color:#6B5F80;margin-top:8px;}
</style>
</head>
<body>
  <div class="icon">🍷</div>
  <h1>CaveManager Pro</h1>
  <div class="badge">🔴 Hors connexion</div>
  <p>Vous êtes actuellement hors ligne. L'application nécessite une connexion pour démarrer.</p>
  <p class="info">Si vous aviez déjà chargé l'app, rechargez la page.</p>
  <button class="btn" onclick="location.reload()">🔄 Réessayer</button>
  <p class="info" style="margin-top:16px">CaveManager Pro · Burkina Faso<br>Données locales sécurisées sur cet appareil</p>
</body>
</html>`;
}

// ─── BACKGROUND SYNC (optionnel — Firebase offline queue) ────
self.addEventListener('sync', event => {
  if (event.tag === 'cave-sync-sales') {
    console.log('[SW] Background sync: cave-sync-sales');
    // Point d'extension : envoyer les ventes en attente à Firebase
    // event.waitUntil(syncPendingSales());
  }
});

// ─── PUSH NOTIFICATIONS ──────────────────────────────────────
self.addEventListener('push', event => {
  if (!event.data) return;
  let data = {};
  try { data = event.data.json(); } catch { data = { title: 'CaveManager', body: event.data.text() }; }

  const options = {
    body:    data.body    || 'Nouvelle notification',
    icon:    data.icon    || './icons/icon-192.png',
    badge:   data.badge   || './icons/icon-96.png',
    vibrate: [200, 100, 200],
    tag:     data.tag     || 'cave-notif',
    renotify: true,
    data: { url: data.url || './' },
    actions: [
      { action: 'open',    title: 'Ouvrir' },
      { action: 'dismiss', title: 'Ignorer' },
    ]
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'CaveManager Pro', options)
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  if (event.action === 'dismiss') return;
  const url = event.notification.data?.url || './';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(wins => {
      for (const win of wins) {
        if (win.url.includes(self.location.origin) && 'focus' in win) return win.focus();
      }
      if (clients.openWindow) return clients.openWindow(url);
    })
  );
});

// ─── MESSAGE (communication app ↔ SW) ───────────────────────
self.addEventListener('message', event => {
  const { type } = event.data || {};

  if (type === 'SKIP_WAITING') {
    // Forcer activation immédiate quand l'app le demande
    self.skipWaiting();
    return;
  }

  if (type === 'GET_VERSION') {
    event.source?.postMessage({ type: 'SW_VERSION', version: SW_VERSION });
    return;
  }

  if (type === 'CLEAR_CACHE') {
    caches.keys()
      .then(keys => Promise.all(keys.map(k => caches.delete(k))))
      .then(() => event.source?.postMessage({ type: 'CACHE_CLEARED' }));
    return;
  }
});

console.log(`[SW] CaveManager Pro ${SW_VERSION} chargé`);
