import { configureStore } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import { persistReducer, persistStore } from "redux-persist";

import localForage from "localforage";

import { getCesiumConfig, cesiumReducer } from "@carma-mapping/cesium-engine";

import featuresReducer from "./slices/features";
import mappingReducer from "./slices/mapping";
import layersReducer from "./slices/layers";
import measurementsReducer from "./slices/measurements";
import topicMapReducer from "./slices/topicmap";
import uiReducer from "./slices/ui";

import { defaultCesiumState } from "../config/cesium/store.config";
import { APP_KEY, STORAGE_PREFIX } from "../config";
import { DEBUG_UI_STATE } from "../config/app.config";

console.info("store initializing ....");

const customAppKey = new URLSearchParams(window.location.hash).get("appKey");

const devToolsEnabled =
  new URLSearchParams(window.location.search).get("devToolsEnabled") === "true";
console.log("devToolsEnabled:", devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search,
).get("stateLoggingEnabled");

const inProduction = process.env.NODE_ENV === "production";

console.info("in Production Mode:", inProduction);
const stateLoggingEnabled =
  (stateLoggingEnabledFromSearch !== null &&
    stateLoggingEnabledFromSearch !== "false") ||
  !inProduction;

console.info(
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
    mapping: persistReducer(mappingConfig, mappingReducer),
    ui: persistReducer(uiConfig, uiReducer),
    layers: persistReducer(layersConfig, layersReducer),
    measurements: persistReducer(measurementsConfig, measurementsReducer),
    features: persistReducer(featuresConfig, featuresReducer),
    cesium: persistReducer(
      getCesiumConfig({ appKey: APP_KEY, storagePrefix: STORAGE_PREFIX }),
      cesiumReducer,
    ),
    topicmap: topicMapReducer,
  },
  preloadedState: {
    // needs to be complete state otherwise has untested behavior
    cesium: defaultCesiumState,
    ui: DEBUG_UI_STATE,
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

const persistor = persistStore(store);

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export default { store, persistor };
