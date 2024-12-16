import type { CesiumConfig } from "./../..";

declare global {
  interface Window {
    CESIUM_BASE_URL: string;
  }
}

const getDefaultBaseUrl = () => {
  const CESIUM_PATHNAME = "__cesium__";
  const APP_BASE_PATH = import.meta.env.BASE_URL;
  return `${APP_BASE_PATH}${CESIUM_PATHNAME}`;
};

export const setupCesiumEnvironment = (config?: CesiumConfig) => {
  const baseUrl = config?.baseUrl ? config.baseUrl : getDefaultBaseUrl();
  window.CESIUM_BASE_URL = baseUrl;
};
