// Ambient global Window augmentations for Cesium integration and dev helpers.
// Importing this file will add the globals to the Window type in the current scope.
// so usually @carma-commons/types should be imported where needed should do in app.tsx

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
    CARMA_DEBUG_VIEWER?: unknown;
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
