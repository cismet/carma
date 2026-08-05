import { configureStore } from "@reduxjs/toolkit";

import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";

import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

import { APP_KEY, STORAGE_PREFIX } from "../config";
import { allFachzwillingRoutes } from "../constants/fachzwillinge/routes";
import mappingReducer from "./slices/mapping";
import layersReducer from "./slices/layers";
import measurementsReducer from "./slices/measurements";
import uiReducer, { initialUIState, UIMode } from "./slices/ui";
import featuresReducer from "./slices/features";
import printReducer from "./slices/print";
import { resolveGeoportalCustomHashState } from "../helper/geoportal-custom-hash-state";

console.info("store initializing ....");

export const geoportalInitialHashState = resolveGeoportalCustomHashState();
const initialUIMode =
  geoportalInitialHashState.measurementModeRequested &&
  geoportalInitialHashState.launchMode === HASH_LAUNCH_MODE.THREE_D
    ? UIMode.MEASUREMENT
    : initialUIState.mode;

/** the route the app is starting on; the router is not mounted yet */
const initialRoutePath = window.location.hash.replace(/^#/, "").split("?")[0];

/** a route may ask for a storage namespace of its own, see its `appKey` */
const routeAppKey = allFachzwillingRoutes.find(
  (route) => initialRoutePath === `/${route.path}`
)?.appKey;

// Parsed off the part behind the "?": URLSearchParams strips a leading "?" but
// not a leading "#", so feeding it the whole hash makes the first parameter's
// name come out as "#/outlet?appKey" and the lookup miss.
const initialHashQuery = window.location.hash.split("?").slice(1).join("?");

// an explicit ?appKey= overrides what the route asks for
const customAppKey =
  new URLSearchParams(initialHashQuery).get("appKey") ?? routeAppKey;

const devToolsEnabled =
  new URLSearchParams(window.location.search).get("devToolsEnabled") === "true";
console.debug("devToolsEnabled:", devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search
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
  stateLoggingEnabled
);
const logger = createLogger({
  collapsed: true,
});

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
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
    "focusMode",
    "savedLayerConfigs",
    "selectedMapLayer",
    "paleOpacityValue",
    "backgroundLayer",
    "selectedLuftbildLayer",
    "showFullscreenButton",
    "showLocatorButton",
    "showMeasurementButton",
    "showHamburgerMenu",
  ],
};

const layersConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.layers",
  storage: localForage,
  // "favorites" is dormant legacy data: kept in the record so the
  // LayerCatalogProvider one-time import (legacyFavoritesKey in App.tsx)
  // still finds it, no matter when redux-persist rewrites the record
  whitelist: ["thumbnails", "favorites"],
};

const measurementsConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.measurements",
  storage: localForage,
  whitelist: ["measurements"],
};

const featuresConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.features",
  storage: localForage,
  whitelist: [],
};

const printConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.print",
  storage: localForage,
  whitelist: ["orientation", "dpi", "scale"],
};

const store = configureStore({
  reducer: {
    mapping: persistReducer(mappingConfig, mappingReducer),
    ui: persistReducer(uiConfig, uiReducer),
    layers: persistReducer(layersConfig, layersReducer),
    measurements: persistReducer(measurementsConfig, measurementsReducer),
    features: persistReducer(featuresConfig, featuresReducer),
    print: persistReducer(printConfig, printReducer),
  },
  preloadedState: {
    ui: {
      ...initialUIState,
      mode: initialUIMode,
    },
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export default store;
