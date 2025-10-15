import type { CesiumWidget } from "cesium";
import type { CesiumConfig } from "@carma/types";

const CESIUM_PATHNAME = "__cesium__";

const getAppBaseUrl = (): string => {
  const meta = import.meta as unknown as { env?: Record<string, unknown> };
  const v = meta?.env?.["BASE_URL"];
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

export const getIsWidgetReadyAsync = async (
  widget: CesiumWidget,
  onReady: () => void
): Promise<void> => {
  // checking for widget readiness by waiting for the first postRender event
  // which indicates the scene is initialized and ready to render
  await new Promise<void>((resolve) => {
    const removeEvent = widget.scene.postRender.addEventListener(() => {
      console.log("Widget is ready");
      removeEvent();
      onReady();
      resolve();
    });
  });
};
