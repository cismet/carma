// Ambient window globals used in the Cesium engine
// Keep these minimal and avoid changing global ImportMeta types used by other libs

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    CARMA_CESIUM_SUPPRESS_ERROR_BOUNDARY?: boolean;
    CARMA_CESIUM_TRIGGER?: {
      renderError?: (err?: unknown) => void;
      showErrorPanel?: (
        title?: string,
        message?: string,
        err?: unknown
      ) => void;
    };
  }
}

export {};
