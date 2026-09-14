import { configureStore } from "@reduxjs/toolkit";

import { createLogger } from "redux-logger";
import { createMigrate, createTransform, persistReducer } from "redux-persist";
import type { PersistedState } from "redux-persist";
import localForage from "localforage";

import { HASH_LAUNCH_MODE } from "@carma-commons/utils";

import { APP_KEY, STORAGE_PREFIX } from "../config";
import { STORE_APP_KEY } from "./app-key";
import {
  dropUnrestorableRows,
  stripInteractionButtons,
  type PersistedLayer,
} from "./persisted-layer-stack";
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

/** the namespace the persisted records live in, see `app-key` */
const customAppKey = STORE_APP_KEY;

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

/**
 * Keeps the persisted layer stack serializable on the way in, and drops what
 * cannot come back on the way out; see `persisted-layer-stack` for the rules,
 * which the share config follows as well.
 */
const dropModeRows = createTransform<PersistedLayer[], PersistedLayer[]>(
  (inbound) =>
    Array.isArray(inbound) ? stripInteractionButtons(inbound) : inbound,
  (outbound) =>
    Array.isArray(outbound) ? dropUnrestorableRows(outbound) : outbound,
  { whitelist: ["layers"] }
);

/**
 * A stored mapping slice as it looked before the per-category selection: one
 * field per background category. Only the migration reads it.
 */
type LegacyMappingPersistedState = PersistedState & {
  selectedMapLayer?: unknown;
  selectedLuftbildLayer?: unknown;
  selectedByCategory?: Record<string, unknown>;
};

const mappingMigrations = {
  // selectedMapLayer / selectedLuftbildLayer -> selectedByCategory
  1: (state: PersistedState): PersistedState => {
    const { selectedMapLayer, selectedLuftbildLayer, ...rest } =
      state as LegacyMappingPersistedState;
    const migrated: Record<string, unknown> = {};
    if (selectedMapLayer) {
      migrated.karte = selectedMapLayer;
    }
    if (selectedLuftbildLayer) {
      migrated.luftbild = selectedLuftbildLayer;
    }
    return {
      ...rest,
      selectedByCategory: { ...rest.selectedByCategory, ...migrated },
    } as PersistedState;
  },
};

const mappingConfig = {
  key: "@" + (customAppKey || APP_KEY) + "." + STORAGE_PREFIX + ".app.mapping",
  storage: localForage,
  version: 1,
  migrate: createMigrate(mappingMigrations),
  transforms: [dropModeRows],
  whitelist: [
    "layers",
    // the rows themselves are rebuilt from config on every boot, only the
    // visitor's choice to hide one survives
    "hiddenPermanentLayers",
    "focusMode",
    "savedLayerConfigs",
    "selectedByCategory",
    "paleOpacityValue",
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
