// ─── Divorce Ledger Service Worker ───────────────────────────────────────────
// Strategy:
//   • Navigation requests (HTML)  → NEVER intercepted → browser handles natively
//     (This prevents the "refresh loop" bug where stale HTML is served from cache)
//   • GET /api/mobile/*           → Network-first, cache fallback (offline data)
//   • Static assets (JS/CSS/img)  → Network-first, cache fallback
//   • POST/PATCH/DELETE           → Not intercepted (client queues mutations offline)

const ASSET_CACHE = 'divorce-ledger-assets-v2';
const API_CACHE = 'divorce-ledger-api-v2';
const DOCUMENT_CACHE = 'divorce-ledger-documents-v1';

const MOBILE_API_PREFIXES = [
  '/api/mobile/documents',
  '/api/mobile/violations',
  '/api/mobile/reimbursements',
  '/api/mobile/w2-records',
  '/api/mobile/financial-summary',
  '/api/mobile/assets',
  '/api/mobile/debts',
  '/api/mobile/incomes',
  '/api/mobile/expenses',
  '/api/mobile/child-support',
  '/api/mobile/document-categories',
  '/api/documents',
  '/api/violations',
];

// ── Install ────────────────────────────────────────────────────────────────
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

// ── Activate ───────────────────────────────────────────────────────────────
self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      // Delete old cache versions (v1 etc.)
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter(
                (k) =>
                  k.startsWith('divorce-ledger-') &&
                  k !== ASSET_CACHE &&
                  k !== API_CACHE &&
                  k !== DOCUMENT_CACHE
              )
              .map((k) => caches.delete(k))
          )
        ),
      self.clients.claim(),
    ])
  );
});

// ── Background Sync ────────────────────────────────────────────────────────
// Triggered when device comes back online or periodically
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-offline-data') {
    event.waitUntil(syncOfflineData());
  }
});

async function syncOfflineData() {
  try {
    // Notify all clients to start sync
    const clients = await self.clients.matchAll({ type: 'window' });
    clients.forEach((client) =>
      client.postMessage({
        type: 'BACKGROUND_SYNC_START',
      })
    );

    console.log('[SW] Background sync triggered');
  } catch (error) {
    console.error('[SW] Background sync failed:', error);
  }
}

// ── Fetch ──────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // RULE 1 — Never intercept navigation (HTML page) requests.
  // Returning without calling event.respondWith lets the browser handle it
  // natively, so the server always serves the latest HTML.
  // This is the fix for the old "refresh loop" bug.
  if (request.mode === 'navigate') {
    return;
  }

  // RULE 2 — Only handle same-origin requests
  if (url.origin !== self.location.origin) {
    return;
  }

  // RULE 3 — Mobile API GET requests: network-first with offline cache fallback
  const isMobileApiGet =
    request.method === 'GET' &&
    MOBILE_API_PREFIXES.some(
      (prefix) => url.pathname === prefix || url.pathname.startsWith(prefix + '/')
    );

  if (isMobileApiGet) {
    event.respondWith(handleApiGet(request));
    return;
  }

  // RULE 4 — Non-GET methods: do not intercept.
  // The client-side sync queue (offline-db.ts) handles offline mutation queuing.
  if (request.method !== 'GET') {
    return;
  }

  // RULE 5 — Static assets: network-first with cache fallback
  const isStaticAsset =
    url.pathname.startsWith('/assets/') ||
    /\.(js|css|png|svg|ico|woff2?|ttf|webp|jpg|jpeg|gif)(\?.*)?$/.test(url.pathname);

  if (isStaticAsset) {
    event.respondWith(handleStaticAsset(request));
    return;
  }

  // RULE 6 — Everything else (other /api/* routes, etc.) — do not intercept
});

// ── Handler: Mobile API GET (network-first, cache fallback) ────────────────
async function handleApiGet(request) {
  const cache = await caches.open(API_CACHE);

  try {
    const networkResponse = await fetch(request.clone());

    if (networkResponse.ok) {
      // Store fresh response in cache
      cache.put(request, networkResponse.clone());

      // Notify all open tabs that fresh data arrived
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) =>
        client.postMessage({
          type: 'API_CACHE_UPDATED',
          pathname: new URL(request.url).pathname,
        })
      );
    }

    return networkResponse;
  } catch {
    // Network unavailable — serve from cache if we have it
    const cached = await cache.match(request);
    if (cached) return cached;

    // No cache at all — return a structured "offline" response the app can detect
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Offline — no cached data available',
        offline: true,
      }),
      {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}

// ── Handler: Static assets (network-first, cache fallback) ─────────────────
async function handleStaticAsset(request) {
  const cache = await caches.open(ASSET_CACHE);

  try {
    const networkResponse = await fetch(request.clone());
    if (networkResponse.ok) {
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    return new Response('Asset unavailable offline', { status: 503 });
  }
}
