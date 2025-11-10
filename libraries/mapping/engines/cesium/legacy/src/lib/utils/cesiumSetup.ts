import { Viewer } from "cesium";
import type { CesiumConfig } from "./../..";

const CESIUM_PATHNAME = "__cesium__";

const getAppBaseUrl = (): string => {
  const meta = import.meta as unknown as { env?: Record<string, unknown> };
  const v = meta?.env?.BASE_URL;
  return typeof v === "string" && v.length > 0 ? v : "/";
};

const getDefaultBaseUrl = () => `${getAppBaseUrl()}${CESIUM_PATHNAME}`;

type CesiumBaseUrlInput =
  | CesiumConfig
  | { baseUrl: string }
  | string
  | undefined;

export const setupCesiumEnvironment = (input?: CesiumBaseUrlInput) => {
  const baseUrl =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "baseUrl" in input
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input as any).baseUrl
      : getDefaultBaseUrl();
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
