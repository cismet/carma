/* eslint-disable no-restricted-globals */

// This service worker can be customized!
// See https://developers.google.com/web/tools/workbox/modules
// for the list of available Workbox modules, or add any other
// code you'd like.
// You can also remove this file if you'd prefer not to use a
// service worker, and the Workbox build step will be skipped.

import { clientsClaim } from "workbox-core";
import { ExpirationPlugin } from "workbox-expiration";
import { precacheAndRoute, createHandlerBoundToURL } from "workbox-precaching";
import { registerRoute } from "workbox-routing";
import { StaleWhileRevalidate } from "workbox-strategies";
import Dexie from "dexie";

const DBVERSION = 1;
const DBNAME = "carma";
const OBJECTSTORE = "vectorTilesCache";

const CONSOLEDEBUG = false;

export const db = new Dexie(DBNAME);
db.version(DBVERSION).stores({
  vectorTilesCache: "key",
});

clientsClaim();

// Precache all of the assets generated by your build process.
// Their URLs are injected into the manifest variable below.
// This variable must be present somewhere in your service worker file,
// even if you decide not to use precaching. See https://cra.link/PWA
precacheAndRoute(self.__WB_MANIFEST);

// Set up App Shell-style routing, so that all navigation requests
// are fulfilled with your index.html shell. Learn more at
// https://developers.google.com/web/fundamentals/architecture/app-shell
const fileExtensionRegexp = new RegExp("/[^/?]+\\.[^/]+$");
registerRoute(
  // Return false to exempt requests from being fulfilled by index.html.
  ({ request, url }) => {
    // If this isn't a navigation, skip.
    if (request.mode !== "navigate") {
      return false;
    } // If this is a URL that starts with /_, skip.

    if (url.pathname.startsWith("/_")) {
      return false;
    } // If this looks like a URL for a resource, because it contains // a file extension, skip.

    if (url.pathname.match(fileExtensionRegexp)) {
      return false;
    } // Return true to signal that we want to use the handler.

    return true;
  },
  createHandlerBoundToURL(process.env.PUBLIC_URL + "/index.html"),
);

// An example runtime caching route for requests that aren't handled by the
// precache, in this case same-origin .png requests like those from in public/
registerRoute(
  // Add in any other file extensions or routing criteria as needed.
  ({ url }) =>
    url.origin === self.location.origin && url.pathname.endsWith(".png"), // Customize this strategy as needed, e.g., by changing to CacheFirst.
  new StaleWhileRevalidate({
    cacheName: "images",
    plugins: [
      // Ensure that once this runtime cache reaches a maximum size the
      // least-recently used images are removed.
      new ExpirationPlugin({ maxEntries: 50 }),
    ],
  }),
);

// This allows the web app to trigger skipWaiting via
// registration.waiting.postMessage({type: 'SKIP_WAITING'})
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// Any other custom service worker logic can go here.

self.addEventListener("activate", (evt) => {
  if (CONSOLEDEBUG) console.log("zzz service worker has been activated");
});

// self.addEventListener("fetch", (fetchEvent) => {
//   if (CONSOLEDEBUG) console.log("zzz fetchEvent.request", fetchEvent.request);

//   fetchEvent.respondWith(fetch(fetchEvent.request));
// });

let config, offline;

self.addEventListener("message", (event) => {
  if (CONSOLEDEBUG) console.log("offlineVTSW messageEvent", event);

  if (event.data && event.data.type === "SETCARMAOFFLINECONFIG") {
    config = event.data.config;
    offline = event.data.offline;
  }
});

const cachedFetch = async (req) => {
  if (CONSOLEDEBUG) console.log("offlineVTSW:: offline=" + offline);

  try {
    if (CONSOLEDEBUG) console.log("offlineVTSW:: intercept " + req.url);

    if (offline === true) {
      if (CONSOLEDEBUG) console.log("offlineVTSW:: intercept " + req.url);

      for (const type of Object.keys(config)) {
        if (CONSOLEDEBUG) console.log("offlineVTSW:: check for " + type);
        if (req.url.startsWith(config[type].origin)) {
          if (config[type].block === true) {
            if (CONSOLEDEBUG) console.log("offlineVTSW:: blocked request");

            return new Response();
          } else {
            const path = decodeURIComponent(
              config[type].cachePath + req.url.replace(config[type].origin, ""),
            );
            if (CONSOLEDEBUG)
              console.log("offlineVTSW:: detected a " + type + " request.");
            const hit = await db[OBJECTSTORE].get(path);
            if (hit) {
              if (CONSOLEDEBUG)
                console.log(
                  "offlineVTSW:: found a " +
                    type +
                    " cache entry for " +
                    path +
                    ".",
                );
              return new Response(hit.value);
            } else {
              if (CONSOLEDEBUG)
                console.log(
                  "offlineVTSW:: missed a " +
                    type +
                    " cache entry for " +
                    path +
                    " (" +
                    req.url +
                    ").",
                );
              //return await fetch(req);
              return new Response();
            }
          }
        }
      }
      return await fetch(req);
    } else {
      if (CONSOLEDEBUG)
        console.log("(online) offlineVTSW:: no intercept " + req.url);
      return await fetch(req);
    }
  } catch (e) {
    if (CONSOLEDEBUG) console.log("Error in cachedFetch", e);
  }
};

self.addEventListener("fetch", (fetchEvent) => {
  fetchEvent.respondWith(cachedFetch(fetchEvent.request));
});
