const CACHE_NAME = 'life-tracker-v1';

const OFFLINE_URL = '/offline';

const PRECACHE_ASSETS = [
    '/',
    '/offline',
    '/icons/icon-192.svg',
    '/icons/icon-512.svg',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_ASSETS))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        )
    );
    self.clients.claim();
});

self.addEventListener('fetch', (event) => {
    // Only handle same-origin GET requests — skip API calls
    if (
        event.request.method !== 'GET' ||
        event.request.url.includes('/api/') ||
        event.request.url.includes('/timetable') && event.request.url.includes('http') && !event.request.url.includes(self.location.origin)
    ) {
        return;
    }

    // Network-first for navigation (pages), cache-first for static assets
    const isNavigation = event.request.mode === 'navigate';

    if (isNavigation) {
        event.respondWith(
            fetch(event.request)
                .then((res) => {
                    const clone = res.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    return res;
                })
                .catch(() =>
                    caches.match(event.request).then((cached) => cached || caches.match(OFFLINE_URL))
                )
        );
    } else {
        event.respondWith(
            caches.match(event.request).then(
                (cached) => cached || fetch(event.request).then((res) => {
                    if (res.ok && event.request.url.startsWith(self.location.origin)) {
                        const clone = res.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
                    }
                    return res;
                })
            )
        );
    }
});
