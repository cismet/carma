/** Bump when normalized catalog schema or pose/calibration semantics change; not per app bundle. */
export const OBLIQUE_CATALOG_CACHE_VERSION = "oblique-catalog-v3";
export const OBLIQUE_CATALOG_FRESHNESS_MS = 60000;
const VERSION_KEY = "carma.oblique.parsed-catalog.version";

/** Only this short marker belongs in localStorage; catalogs stay in IndexedDB. */
export const syncObliqueCatalogCacheVersion = (): void => {
  try {
    if (
      typeof localStorage !== "undefined" &&
      localStorage.getItem(VERSION_KEY) !== OBLIQUE_CATALOG_CACHE_VERSION
    )
      localStorage.setItem(VERSION_KEY, OBLIQUE_CATALOG_CACHE_VERSION);
  } catch {
    /* Private browsing/storage policy does not block viewing. */
  }
};
