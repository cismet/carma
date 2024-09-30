import { configureStore } from "@reduxjs/toolkit";
import mappingSlice from "./slices/mapping";
import layersSlice from "./slices/layers";
import uiSlice from "./slices/ui";
import measurementsSlice from "./slices/measurements";
import featuresSlice from "./slices/features";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";
import { APP_KEY, STORAGE_PREFIX } from "../config";
import { getCesiumConfig, sliceCesium } from "@carma-mapping/cesium-engine";
import { defaultCesiumState } from "../config/cesium/store.config";

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
  key: "@" + (customAppKey || APP_KEY) + "." + STORAGE_PREFIX + ".app.mapping",
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
  whitelist: ["thumbnails", "favorites"],
};
const measurementsConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.measurements",
  storage: localForage,
  whitelist: ["shapes"],
};

const featuresConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.features",
  storage: localForage,
  whitelist: [],
};

const store = configureStore({
  reducer: {
    mapping: persistReducer(mappingConfig, mappingSlice.reducer),
    ui: persistReducer(uiConfig, uiSlice.reducer),
    layers: persistReducer(layersConfig, layersSlice.reducer),
    measurements: persistReducer(measurementsConfig, measurementsSlice.reducer),
    features: persistReducer(featuresConfig, featuresSlice.reducer),
    cesium: persistReducer(
      getCesiumConfig({ appKey: APP_KEY, storagePrefix: STORAGE_PREFIX }),
      sliceCesium.reducer,
    ),
  },
  preloadedState: {
    cesium: defaultCesiumState,
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export default store;

export type AppStore = typeof store;

export type RootState = ReturnType<AppStore["getState"]>;

export type AppDispatch = AppStore["dispatch"];
