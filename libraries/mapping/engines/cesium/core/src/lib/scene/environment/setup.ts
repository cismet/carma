import type { CesiumWidget } from "@carma/cesium";
import type { CesiumConfig } from "../../types";

// Monorepo convention: Cesium assets always served at /cesium
const DEFAULT_CESIUM_BASE_URL = "/cesium";

type CesiumBaseUrlInput =
  | CesiumConfig
  | { baseUrl: string }
  | string
  | undefined;

export const setupCesiumEnvironment = (input?: CesiumBaseUrlInput) => {
  // Use explicit config or fall back to monorepo convention
  const baseUrl =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "baseUrl" in input
      ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (input as any).baseUrl
      : DEFAULT_CESIUM_BASE_URL;

  window.CESIUM_BASE_URL = baseUrl;
  console.debug(`[CESIUM|SETUP] Base URL set to: ${baseUrl}`);
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
