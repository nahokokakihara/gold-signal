const CACHE_NAME = 'gold-signal-v1';
const urlsToCache = [
    './',
    './index.html',
    './style.css',
    './app.js',
    './indicators.js',
    './manifest.json'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Opened cache');
                return cache.addAll(urlsToCache);
            })
    );
    self.skipWaiting();
});

self.addEventListener('fetch', event => {
    if (event.request.url.includes('api.twelvedata.com') || 
        event.request.url.includes('notify-api.line.me')) {
        event.respondWith(fetch(event.request));
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }

                return fetch(event.request).then(response => {
                    if (!response || response.status !== 200 || response.type !== 'basic') {
                        return response;
                    }

                    const responseToCache = response.clone();

                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });

                    return response;
                });
            })
    );
});

self.addEventListener('activate', event => {
    const cacheWhitelist = [CACHE_NAME];

    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheWhitelist.indexOf(cacheName) === -1) {
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

self.addEventListener('push', event => {
    const options = {
        body: event.data ? event.data.text() : 'シグナルが発生しました',
        icon: '🥇',
        badge: '🥇',
        vibrate: [200, 100, 200],
        tag: 'gold-signal'
    };

    event.waitUntil(
        self.registration.showNotification('GOLD シグナル', options)
    );
});

self.addEventListener('notificationclick', event => {
    event.notification.close();

    event.waitUntil(
        clients.openWindow('./')
    );
});
