/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** the map-relay the remote writes to; set per deployment */
  readonly VITE_RELAY_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
