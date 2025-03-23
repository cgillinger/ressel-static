/**
 * Resseltrafiken Service Worker
 * Caches application assets for offline functionality
 * 
 * Version History:
 * 4.0.0 (2025-03-28) - Förbättrad felhantering i fetch-event, fixad headers-kontroll
 * 3.0.0 (2025-03-26) - Uppdaterad för att stödja "Endast avstigning" funktionalitet
 *                     - Förbättrad cachehantering för JSON-filer för att alltid visa aktuella tider
 * 2.4.0 (2025-03-22) - Uppdaterad version med stöd för talsyntes
 * 2.0.0 (2025-01-16) - Original service worker
 */

const CACHE_NAME = 'resseltrafiken-v4.0.0';
const JSON_CACHE_NAME = 'resseltrafiken-json-v4.0.0';

// Statiska filer att cacha för offline-användning
const STATIC_FILES_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/app.js',
  './js/timehandler.js',
  './js/renderer.js',
  './icons/boat.png',
  './manifest.json'
];

// JSON-filer som behöver hanteras med "network-first" strategi
const JSON_FILES = [
  './data/ressel-sjo-config.json',
  './data/ressel-city-config.json',
  './data/ressel-sjo-2024-2025-weekday.json',
  './data/ressel-sjo-2024-2025-weekend.json',
  './data/ressel-city-winter-2024-2025-weekday.json',
  './data/ressel-city-winter-2024-2025-saturday.json',
  './data/ressel-city-winter-2024-2025-sunday.json',
  './data/ressel-city-spring-2025-weekday.json',
  './data/ressel-city-spring-2025-saturday.json',
  './data/ressel-city-spring-2025-sunday.json'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static files');
        return cache.addAll(STATIC_FILES_TO_CACHE);
      })
      .then(() => {
        // Pre-cache JSON files as fallback
        return caches.open(JSON_CACHE_NAME)
          .then((jsonCache) => {
            console.log('Pre-caching JSON files for offline use');
            return jsonCache.addAll(JSON_FILES);
          });
      })
      .catch(error => {
        console.error('Fel vid cacheinstallation:', error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME, JSON_CACHE_NAME];
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
    .catch(error => {
      console.error('Fel vid cachaktivering:', error);
    })
  );
});

// Fetch event - network-first for JSON, cache-first for static assets
self.addEventListener('fetch', (event) => {
  try {
    const url = new URL(event.request.url);
    
    // Använd network-first strategi för JSON-filer för att alltid visa aktuella tider
    if (url.pathname.endsWith('.json')) {
      event.respondWith(
        fetch(event.request)
          .then(response => {
            // Cacha en kopia av svaret för offline-användning
            const clonedResponse = response.clone();
            caches.open(JSON_CACHE_NAME)
              .then(cache => cache.put(event.request, clonedResponse))
              .catch(err => console.warn('Kunde inte cacha JSON-svar:', err));
            
            return response;
          })
          .catch(() => {
            // Fallback till cache om nätverket inte är tillgängligt
            return caches.match(event.request)
              .catch(err => {
                console.warn('Kunde inte hämta från JSON-cache:', err);
                // Om vi inte kan hämta från cache heller, returnera ett tomt svar
                return new Response(JSON.stringify({error: 'Offline och ingen cachedata tillgänglig'}), {
                  headers: {'Content-Type': 'application/json'}
                });
              });
          })
      );
      return;
    }
    
    // För alla andra resurser, använd cache-first strategi
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
              if (!response || response.status !== 200) {
                return response;
              }
              
              // Säker kontroll för "basic" typ - vissa browsers kan hantera detta annorlunda
              const responseToCache = response.clone();
              
              caches.open(CACHE_NAME)
                .then((cache) => {
                  // Don't cache API requests
                  if (!event.request.url.includes('/api/')) {
                    cache.put(event.request, responseToCache)
                      .catch(err => console.warn('Kunde inte cacha:', err));
                  }
                })
                .catch(err => console.warn('Kunde inte öppna cache:', err));
                
              return response;
            })
            .catch((error) => {
              console.warn('Fetch misslyckades:', error);
              
              // Provide fallback for HTML pages
              if (event.request.headers && event.request.headers.get('accept') && 
                  event.request.headers.get('accept').includes('text/html')) {
                return caches.match('./index.html');
              }
              
              // Annars returnera ett passande felsvar
              return new Response('Offline och ingen cachedata tillgänglig', {
                status: 503,
                statusText: 'Service Unavailable',
                headers: new Headers({
                  'Content-Type': 'text/plain'
                })
              });
            });
        })
        .catch(err => {
          console.error('Fel i cache.match:', err);
          return new Response('Ett fel inträffade', {
            status: 500,
            headers: new Headers({
              'Content-Type': 'text/plain'
            })
          });
        })
    );
  } catch (error) {
    console.error('Fel i fetch-händelse:', error);
    
    // Om något går riktigt fel, ge ett generiskt svar
    event.respondWith(
      new Response('Ett allvarligt fel inträffade', {
        status: 500,
        headers: new Headers({
          'Content-Type': 'text/plain'
        })
      })
    );
  }
});

// Extra händelselyssnare för att hantera kommunikation med huvudtråden
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
