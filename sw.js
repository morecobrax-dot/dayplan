/* Service worker — offline support for the application shell.
 *
 * CACHE_NAME is DERIVED, not chosen. It is written here by
 * `npm run config:sync` from APP_CONFIG.id and the newest APP_UPDATES entry
 * in index.html, and `npm run config:verify` fails if the two ever drift.
 * Never hand-edit it: the cache name is what separates this app from every
 * other app deployed on the same origin, and a stale one serves old code.
 *
 * Publishing a new version means adding an APP_UPDATES entry and running
 * config:sync. That bumps the version, the cache name changes, and phones
 * pick up the new code.
 *
 * This only ever caches application CODE. Everything a person creates lives
 * in localStorage under the app's own namespace and is never touched here —
 * clearing these caches cannot lose a single record.
 */

/* APP-CACHE-BEGIN */
const CACHE_NAME = 'dayplan-v0.3.0-rc.1';
/* APP-CACHE-END */

const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
      /* A failed precache must not block activation — the app still works
         online, and the fetch handler will fill the cache as it goes. */
      .catch(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        /* Only this app's own older caches. A cache belonging to another app
           on the same origin is left completely alone — deleting by anything
           looser than this prefix is how one deployment wipes another. */
        keys.filter(k => k !== CACHE_NAME && k.indexOf(cachePrefix()) === 0)
            .map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

function cachePrefix(){
  const cut = CACHE_NAME.lastIndexOf('-v');
  return cut === -1 ? CACHE_NAME : CACHE_NAME.slice(0, cut + 2);
}

/* Network-first for the shell, so a freshly deployed update is picked up as
 * soon as there is a connection, with the cache as the offline fallback. */
self.addEventListener('fetch', event => {
  const req = event.request;
  if(req.method !== 'GET') return;
  if(new URL(req.url).origin !== location.origin) return;

  event.respondWith(
    fetch(req)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE_NAME).then(c => c.put(req, copy)).catch(() => {});
        return res;
      })
      .catch(() => caches.match(req).then(hit => hit || caches.match('./index.html')))
  );
});

/* =========================================================
   NOTIFICATIONS
   ---------------------------------------------------------
   The client half of real push, built and inert.

   These handlers are complete and correct. What does not exist is
   the service that would SEND a push: that needs a VAPID key pair
   whose private half lives on a server, and there is no server.
   Until there is, nothing ever dispatches a 'push' event here and
   the app says so in those words — see reminderCapabilityLine().

   Notifications shown while the app is open go through
   registration.showNotification() from the page, and land in the
   click handler below like any other.
   ========================================================= */

self.addEventListener('push', event => {
  /* A push with no readable payload still deserves to be shown: swallowing it
     would mean a reminder the server believes it delivered and the person
     never saw. The generic wording is the honest fallback. */
  let payload = {};
  try{ payload = event.data ? event.data.json() : {}; }
  catch(e){ payload = {}; }

  const title = payload.title || 'Dayplan';
  const options = {
    body: payload.body || 'Something on your plan is starting soon.',
    tag: payload.tag || 'dayplan-reminder',
    icon: './icon-192.png',
    badge: './icon-192.png',
    /* Carried through to the click handler so the tap opens the right day. */
    data: { date: payload.date || null, itemId: payload.itemId || null }
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
      /* Focus a window this app already owns rather than opening a second
         copy: two instances of a local-first app both writing the same
         storage is how a person loses an edit. */
      for(const client of list){
        if(client.url.indexOf(self.registration.scope) === 0 && 'focus' in client){
          client.postMessage({ type: 'open-item', date: data.date, itemId: data.itemId });
          return client.focus();
        }
      }
      if(self.clients.openWindow) return self.clients.openWindow('./index.html');
      return undefined;
    })
  );
});
