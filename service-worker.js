/**
 * Resseltrafiken Service Worker
 * Caches application assets for offline functionality
 * 
 * Version History:
 * 2.4.0 (2025-03-22) - Uppdaterad version med stöd för talsyntes
 * 2.0.0 (2025-01-16) - Original service worker
 */

const CACHE_NAME = 'resseltrafiken-v2.4.0';

// Files to cache
const FILES_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/timehandler.js',
  './js/renderer.js',
  './data/ressel-sjo.json',
  './data/ressel-city.json',
  './data/ressel-city-spring-2025.json',
  './icons/boat.png',
  './manifest.json'
];

// Install event - cache assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(FILES_TO_CACHE);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// Fetch event - serve from cache or network
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }
        
        // Clone the request
        const fetchRequest = event.request.clone();
        
        return fetch(fetchRequest)
          .then((response) => {
            // Check if valid response
            if (!response || response.status !== 200 || response.type !== 'basic') {
              return response;
            }
            
            // Clone the response
            const responseToCache = response.clone();
            
            caches.open(CACHE_NAME)
              .then((cache) => {
                // Don't cache API requests
                if (!event.request.url.includes('/api/')) {
                  cache.put(event.request, responseToCache);
                }
              });
              
            return response;
          })
          .catch(() => {
            // If fetch fails (e.g., offline), try to return a cached fallback
            if (event.request.url.includes('json')) {
              return caches.match('./index.html');
            }
          });
      })
  );
});