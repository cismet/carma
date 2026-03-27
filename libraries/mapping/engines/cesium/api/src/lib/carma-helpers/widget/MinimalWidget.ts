import { CesiumWidget } from "../../cesium";

/**
 * Minimal widget defaults with no default imagery/globe and request-render mode.
 */
const MINIMAL_WIDGET_OPTIONS = {
  scene3DOnly: true,
  baseLayer: false,
  requestRenderMode: true,
  useBrowserRecommendedResolution: false,
  // We handle attribution externally in apps and avoid default Ion assets.
  creditContainer: document.createElement("div"),
  contextOptions: {
    webgl: {
      alpha: true,
      antialias: true,
    },
  },
};

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

  const mergedOptions = {
    ...MINIMAL_WIDGET_OPTIONS,
    ...options,
    contextOptions: {
      ...MINIMAL_WIDGET_OPTIONS.contextOptions,
      ...(contextOptions || {}),
      webgl: {
        ...MINIMAL_WIDGET_OPTIONS.contextOptions.webgl,
        ...(webglOptions || {}),
      },
    },
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new CesiumWidget(container, mergedOptions as any);
};
