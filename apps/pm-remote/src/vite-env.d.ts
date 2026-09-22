/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** the map-relay the remote writes to; set per deployment */
  readonly VITE_RELAY_BASE_URL?: string;
  /** where shows are read from; unset, the pm-show folder in ceepr.cismet.de */
  readonly VITE_SHOW_READ_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
