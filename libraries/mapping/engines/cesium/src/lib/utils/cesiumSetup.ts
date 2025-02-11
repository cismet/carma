import { Viewer } from "cesium";
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

export const getIsViewerReadyAsync = async (
  viewer: Viewer,
  setIsViewerReady: (value: boolean) => void
) => {
  // checking for viewer readyness
  // https://github.com/CesiumGS/cesium/issues/4422#issuecomment-1668233567
  await new Promise<void>((resolve) => {
    const removeEvent = viewer.scene.postRender.addEventListener(() => {
      if (viewer.clockViewModel.canAnimate) {
        console.log("Viewer is ready");
        removeEvent();
        setIsViewerReady(true);
        resolve();
      }
    });
  });
};
