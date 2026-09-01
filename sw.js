/* ==========================================================================
   Cashora — Service Worker
   Cache-first for static shell assets; network-first for HTML navigations.
   Does NOT cache Supabase API responses (auth + personal finance data stay live).
   ========================================================================== */

const CACHE_VERSION = 'cashora-v6';
const SHELL = [
  '/',
  '/index.html',
  '/auth.html',
  '/landing.html',
  '/reset-password.html',
  '/manifest.json',
  '/css/main.css',
  '/css/reset.css',
  '/css/tokens.css',
  '/css/layout.css',
  '/css/components.css',
  '/css/dashboard.css',
  '/css/motion.css',
  '/css/responsive.css',
  '/js/app.js',
  '/js/router.js',
  '/js/state.js',
  '/js/utils.js',
  '/js/icons.js',
  '/js/charts.js',
  '/js/transactions.js',
  '/js/config.js',
  '/js/supabaseClient.js',
  // Phase 8 se saare screens alag files hain (js/views/) — router.js inhe on-demand
  // import karta hai. Pehle sirf networth.js precache mein tha; baaki 7 views yahan
  // nahi the, isliye offline pe (agar wo tab kabhi online visit nahi hua tha) load
  // nahi hote the. Ab sab yahan hain taaki install ke turant baad har tab offline
  // kaam kare, sirf pehle-visit-kiya-hua tab nahi.
  '/js/views/dashboard.js',
  '/js/views/transactions.js',
  '/js/views/budget.js',
  '/js/views/goals.js',
  '/js/views/insights.js',
  '/js/views/analytics.js',
  '/js/views/networth.js',
  '/js/views/settings.js',
  '/assets/icons/icon-192.webp',
  '/assets/icons/icon-512.webp',
  '/assets/icons/apple-touch-icon.webp',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(SHELL).catch(() => undefined))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isApiRequest(url) {
  return url.hostname.includes('supabase.co') || url.pathname.startsWith('/rest/') || url.pathname.startsWith('/auth/');
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Never cache API / auth traffic
  if (isApiRequest(url)) return;

  // Cross-origin (fonts, CDN modules): network only
  if (url.origin !== self.location.origin) return;

  // HTML navigations: network-first so deploys show up quickly
  if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
    event.respondWith(
      fetch(request)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
          return res;
        })
        .catch(() => caches.match(request).then((r) => r || caches.match('/index.html')))
    );
    return;
  }

  // Static assets: cache-first
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((c) => c.put(request, copy));
        }
        return res;
      });
    })
  );
});
