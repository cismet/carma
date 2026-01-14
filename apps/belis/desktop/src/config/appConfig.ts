/**
 * Application Configuration for Belis Desktop
 *
 * All configuration values have sensible defaults.
 * Environment variables can override defaults if needed.
 */

export const APP_CONFIG = {
  // REST Service URL
  restService:
    import.meta.env.VITE_BELIS_DESKTOP_REST_SERVICE ||
    "https://belis-cloud-api.cismet.de",

  // Auth Domain
  domain: import.meta.env.VITE_BELIS_DESKTOP_DOMAIN || "BELIS2",

  // GraphQL Endpoint (computed from restService + domain)
  get endpoint() {
    const base = this.restService.endsWith("/")
      ? this.restService
      : this.restService + "/";
    return `${base}graphql/${this.domain}/execute`;
  },

  // RxDB Sync Configuration
  sync: {
    httpUrl:
      import.meta.env.VITE_BELIS_DESKTOP_SYNC_HTTP_URL ||
      "https://offline-actions-belis-cloud.cismet.de/v1/graphql",
    wsUrl:
      import.meta.env.VITE_BELIS_DESKTOP_SYNC_WS_URL ||
      "wss://offline-actions-belis-cloud.cismet.de/v1/graphql",
    appId: "belis-desktop",
    dbVersion: "v2",
  },
};

/**
 * Environment Variables (optional overrides):
 *
 * VITE_BELIS_DESKTOP_REST_SERVICE - REST API URL (default: https://belis-cloud-api.cismet.de)
 * VITE_BELIS_DESKTOP_DOMAIN - Auth domain (default: BELIS2)
 * VITE_BELIS_DESKTOP_SYNC_HTTP_URL - Sync HTTP endpoint
 * VITE_BELIS_DESKTOP_SYNC_WS_URL - Sync WebSocket endpoint
 *
 * Computed values:
 * - endpoint: Automatically built from restService + domain
 */
