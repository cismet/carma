import { CesiumWidget } from "../../cesium";

/**
 * Minimal widget defaults with no default imagery/globe and request-render mode.
 */
const MINIMAL_WIDGET_OPTIONS = {
  scene3DOnly: true,
  baseLayer: false,
  requestRenderMode: true,
  useBrowserRecommendedResolution: false,
  contextOptions: {
    webgl: {
      alpha: true,
      antialias: true,
    },
  },
};

const createRuntimeMinimalWidgetOptions = () => ({
  ...MINIMAL_WIDGET_OPTIONS,
  // We handle attribution externally in apps and avoid default Ion assets.
  ...(typeof document === "undefined"
    ? {}
    : { creditContainer: document.createElement("div") }),
});

/**
 * Create CesiumWidget with minimal defaults and deep-merge of contextOptions.webgl.
 */
export const createMinimalCesiumWidget = (
  container: HTMLElement | string,
  options?: Record<string, unknown>
): CesiumWidget => {
  const contextOptions = options?.["contextOptions"] as
    | Record<string, unknown>
    | undefined;
  const webglOptions = contextOptions?.["webgl"] as
    | Record<string, unknown>
    | undefined;
  const runtimeDefaults = createRuntimeMinimalWidgetOptions();

  const mergedOptions = {
    ...runtimeDefaults,
    ...options,
    contextOptions: {
      ...runtimeDefaults.contextOptions,
      ...(contextOptions || {}),
      webgl: {
        ...runtimeDefaults.contextOptions.webgl,
        ...(webglOptions || {}),
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CesiumWidget(container, mergedOptions as any);
};
