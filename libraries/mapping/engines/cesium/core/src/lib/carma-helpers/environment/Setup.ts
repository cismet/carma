const CESIUM_PATHNAME = "__cesium__";

const getAppBaseUrl = (): string => {
  if (typeof document !== "undefined" && typeof document.baseURI === "string") {
    try {
      return new URL(".", document.baseURI).pathname;
    } catch {
      return "/";
    }
  }

  return "/";
};

const getDefaultBaseUrl = () => `${getAppBaseUrl()}${CESIUM_PATHNAME}`;

export type CesiumBaseUrlInput = { baseUrl: string } | string | undefined;

export const setupCesiumEnvironment = (input?: CesiumBaseUrlInput) => {
  const baseUrl =
    typeof input === "string"
      ? input
      : input && typeof input === "object" && "baseUrl" in input
      ? input.baseUrl
      : getDefaultBaseUrl();

  (
    window as Window & {
      CESIUM_BASE_URL?: string;
    }
  ).CESIUM_BASE_URL = baseUrl;
};
