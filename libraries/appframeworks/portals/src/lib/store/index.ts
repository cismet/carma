import { configureStore } from "@reduxjs/toolkit";
import type { EnhancedStore } from "@reduxjs/toolkit";
import mappingSlice from "./slices/mapping";
import layersSlice from "./slices/layers";
import uiSlice from "./slices/ui";
import measurementsSlice from "./slices/measurements";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";
import type { LayerMap } from "../types";

console.log("store initializing ....");

const customAppKey = new URLSearchParams(window.location.hash).get("appKey");

const devToolsEnabled =
  new URLSearchParams(window.location.search).get("devToolsEnabled") === "true";
console.log("devToolsEnabled:", devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search,
).get("stateLoggingEnabled");

const inProduction = process.env.NODE_ENV === "production";

console.log("in Production Mode:", inProduction);
const stateLoggingEnabled =
  (stateLoggingEnabledFromSearch !== null &&
    stateLoggingEnabledFromSearch !== "false") ||
  !inProduction;

console.log(
  "stateLoggingEnabled:",
  stateLoggingEnabledFromSearch,
  "x",
  stateLoggingEnabled,
);
const logger = createLogger({
  collapsed: true,
});

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    });
}

interface PortalStoreConfig {
  APP_KEY?: string;
  STORAGE_PREFIX?: string;
  layerMap: LayerMap;
}

export const configurePortalStore = ({
  APP_KEY = "geoportal",
  STORAGE_PREFIX = "1",
  layerMap = {},
}: PortalStoreConfig) => {
  const uiConfig = {
    key: "@" + (customAppKey || APP_KEY) + "." + STORAGE_PREFIX + ".app.config",
    storage: localForage,
    whitelist: [
      "allowUiChanges",
      "showLayerHideButtons",
      "showLayerButtons",
      "showInfo",
      "showInfoText",
    ],
  };

  const mappingConfig = {
    key:
      "@" + (customAppKey || APP_KEY) + "." + STORAGE_PREFIX + ".app.mapping",
    storage: localForage,
    whitelist: [
      "layers",
      "savedLayerConfigs",
      "selectedMapLayer",
      "backgroundLayer",
      "showFullscreenButton",
      "showLocatorButton",
      "showMeasurementButton",
      "showHamburgerMenu",
    ],
  };

  const layersConfig = {
    key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.layers",
    storage: localForage,
    whitelist: ["thumbnails"],
  };
  const measurementsConfig = {
    key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.measurements",
    storage: localForage,
    whitelist: ["shapes"],
  };

  return configureStore({
    reducer: {
      mapping: persistReducer(mappingConfig, mappingSlice.reducer),
      ui: persistReducer(uiConfig, uiSlice.reducer),
      layers: persistReducer(layersConfig, layersSlice.reducer),
      measurements: persistReducer(
        measurementsConfig,
        measurementsSlice.reducer,
      ),
    },
    devTools: devToolsEnabled === true && inProduction === false,
    middleware,
  });
};

export default configurePortalStore;

export type AppStore = EnhancedStore;

export type RootState = ReturnType<AppStore["getState"]>;

export type AppDispatch = AppStore["dispatch"];
