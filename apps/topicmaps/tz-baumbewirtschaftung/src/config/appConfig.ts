/**
 * Application Configuration for TZ Baumbewirtschaftung
 *
 * All configuration values have sensible defaults.
 * Environment variables can override defaults if needed.
 *
 * No .env files required - env files are gitignored in the apps directory
 */

export const APP_CONFIG = {
  // REST Service URL
  restService:
    import.meta.env.VITE_TZ_BAUMBEWIRTSCHAFTUNG_REST_SERVICE ||
    "https://wunda-cloud-api.cismet.de/",

  // Auth Domain
  domain: import.meta.env.VITE_TZ_BAUMBEWIRTSCHAFTUNG_DOMAIN || "WUNDA_BLAU",

  // GraphQL Endpoint (computed from restService + domain)
  get endpoint() {
    const base = this.restService.endsWith("/")
      ? this.restService
      : this.restService + "/";
    return `${base}graphql/${this.domain}/execute`;
  },

  // Offline Actions Route
  offlineActionsRoute:
    import.meta.env.VITE_TZ_BAUMBEWIRTSCHAFTUNG_OFFLINE_ACTIONS_ROUTE ||
    "/api/offline-actions",

  // Database Version
  dbVersion: import.meta.env.VITE_TZ_BAUMBEWIRTSCHAFTUNG_DB_VERSION || "v1",

  // Playground Mode (enables dev features)
  playground: import.meta.env.VITE_TZ_BAUMBEWIRTSCHAFTUNG_PLAYGROUND === "true",

  // JWT Settings
  jwtStorageKey: "tz-baumbewirtschaftung-jwt",

  // DAQ (Data Acquisition) Keys
  daqKeys: {
    trees: "tzbBaumbewirtschaftungTrees",
    treeActions: "tzbBaumbewirtschaftungTreeActions",
    actions: "tzbBaumbewirtschaftungActions",
    legacy: "tzbBaumbewirtschaftung", // Full dataset (all-in-one)
  },
};

/**
 * Environment Variables (optional overrides):
 *
 * VITE_TZ_BAUMBEWIRTSCHAFTUNG_REST_SERVICE - REST API URL (default: http://wunda-cloud-api.cismet.de/)
 * VITE_TZ_BAUMBEWIRTSCHAFTUNG_DOMAIN - Auth domain (default: WUNDA_BLAU)
 * VITE_TZ_BAUMBEWIRTSCHAFTUNG_OFFLINE_ACTIONS_ROUTE - Offline actions endpoint
 * VITE_TZ_BAUMBEWIRTSCHAFTUNG_DB_VERSION - Database version identifier
 * VITE_TZ_BAUMBEWIRTSCHAFTUNG_PLAYGROUND - Enable playground mode (true/false)
 *
 * Computed values:
 * - endpoint: Automatically built from restService + domain (e.g., http://wunda-cloud-api.cismet.de/graphql/WUNDA_BLAU/execute)
 */
