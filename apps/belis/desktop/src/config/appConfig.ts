/**
 * Application Configuration for Belis Desktop
 *
 * Backend service URLs are centralized in `constants/belis.ts` (single source
 * of truth, env-overridable). This file only assembles the consumer-facing
 * config objects that reuse them.
 */

import { SYNC_HTTP_URL, SYNC_WS_URL } from "../constants/belis";

export const APP_CONFIG = {
  // RxDB Sync Configuration (URLs sourced from constants/belis.ts)
  sync: {
    httpUrl: SYNC_HTTP_URL,
    wsUrl: SYNC_WS_URL,
    appId: "belis-desktop",
    dbVersion: "v2",
  },
};

/**
 * Environment Variables (optional overrides, defined in constants/belis.ts):
 *
 * VITE_REST_SERVICE                - REST API URL (default: https://belis-cloud-api.cismet.de)
 * VITE_BELIS_DESKTOP_SYNC_HTTP_URL - Sync HTTP endpoint
 * VITE_BELIS_DESKTOP_SYNC_WS_URL   - Sync WebSocket endpoint
 * VITE_BELIS_DESKTOP_SECRES_URL    - Secure document store base URL
 */
