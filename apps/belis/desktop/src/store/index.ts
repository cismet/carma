import { configureStore } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";
import authSlice from "./slices/auth";
import mapSettings from "./slices/mapSettings";
import ui from "./slices/ui";
import keyTables from "./slices/keyTables";
import arbeitsauftraege from "./slices/arbeitsauftraege";
import featureCollectionSlice from "./slices/featureCollection";
import featuresFormsSlice from "./slices/featuresForms";
import arbeitsauftraegeDraftsSlice from "./slices/arbeitsauftraegeDrafts";
import measurementsSlice from "./slices/measurements";
import creationDefaultsSlice from "./slices/creationDefaults";

console.log("store initializing ....");

const devToolsEnabled =
  new URLSearchParams(window.location.search).get("devToolsEnabled") === "true";
console.log("devToolsEnabled:", devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search
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
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    });
}

const authConfig = {
  key: "auth",
  storage: localForage,
  whitelist: ["jwt", "login", "permissions"],
};

const mapSettingsConfig = {
  key: "@belis-desktop.1.app.ui",
  storage: localForage,
  whitelist: [
    "activeBackgroundLayer",
    "backgroundLayerOpacities",
    "activeAdditionalLayers",
    "additionalLayerOpacities",
    "inPaleMode",
    "inSearchMode",
    "enabledLeitungstypen",
    "enabledCategoryFilters",
    "snappingEnabled",
    "dangerousDeleteMode",
  ],
};

const featureCollectionConfig = {
  key: "@app.featureCollection",
  storage: localForage,
  whitelist: ["inFocusMode"],
};

const featuresFormsConfig = {
  key: "@belis-desktop.featuresForms",
  storage: localForage,
  whitelist: [
    "drafts",
    "permanentlyHiddenOriginalIds",
    "deletedFeatureIds",
    "standortLeuchtenOverrides",
  ],
};

const arbeitsauftraegeConfig = {
  key: "@belis-desktop.arbeitsauftraege",
  storage: localForage,
  whitelist: ["selectedTeamId", "previousTeamId", "protokolleSort"],
};

const arbeitsauftraegeDraftsConfig = {
  key: "@belis-desktop.arbeitsauftraegeDrafts",
  storage: localForage,
  whitelist: ["aaDrafts", "apDrafts", "apDeletions"],
};

const creationDefaultsConfig = {
  key: "@belis-desktop.creationDefaults",
  storage: localForage,
  whitelist: ["defaults", "draftIdToType"],
};

const measurementsConfig = {
  key: "@belis-desktop.measurements",
  storage: localForage,
  whitelist: ["features"],
};

const store = configureStore({
  reducer: {
    auth: persistReducer(authConfig, authSlice.reducer),
    mapSettings: persistReducer(mapSettingsConfig, mapSettings.reducer),
    featureCollection: persistReducer(
      featureCollectionConfig,
      featureCollectionSlice.reducer
    ),
    ui: ui.reducer,
    keyTables: keyTables.reducer,
    arbeitsauftraege: persistReducer(
      arbeitsauftraegeConfig,
      arbeitsauftraege.reducer
    ),
    featuresForms: persistReducer(
      featuresFormsConfig,
      featuresFormsSlice.reducer
    ),
    arbeitsauftraegeDrafts: persistReducer(
      arbeitsauftraegeDraftsConfig,
      arbeitsauftraegeDraftsSlice.reducer
    ),
    creationDefaults: persistReducer(
      creationDefaultsConfig,
      creationDefaultsSlice.reducer
    ),
    measurements: persistReducer(
      measurementsConfig,
      measurementsSlice.reducer
    ),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];
export default store;
