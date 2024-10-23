import { configureStore } from "@reduxjs/toolkit";
import authSlice from "./slices/auth";
import lagisSlice from "./slices/lagis";
import landParcels from "./slices/landParcels";
import mappingSlice from "./slices/mapping";
import gazDataSlice from "./slices/gazData";
import permissionsSlice from "./slices/permissions";
import uiSlice from "./slices/ui";
import searchSlice from "./slices/search";
import {
  persistReducer,
  FLUSH,
  REHYDRATE,
  PAUSE,
  PERSIST,
  PURGE,
  REGISTER,
} from "redux-persist";
import localForage from "localforage";
import { createLogger } from "redux-logger";

// console.log("store initializing ....");

const devToolsEnabled =
  new URLSearchParams(window.location.search).get("devToolsEnabled") === "true";
// console.log("devToolsEnabled:", devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search
).get("stateLoggingEnabled");

const inProduction = process.env.NODE_ENV === "production";

// console.log("in Production Mode:", inProduction);
const stateLoggingEnabled =
  (stateLoggingEnabledFromSearch !== null &&
    stateLoggingEnabledFromSearch !== "false") ||
  !inProduction;

// console.log(
//   "stateLoggingEnabled:",
//   stateLoggingEnabledFromSearch,
//   "x",
//   stateLoggingEnabled
// );

const logger = createLogger({
  collapsed: true,
  // predicate, // if specified this function will be called before each action is processed with this middleware.
  // collapsed, // takes a Boolean or optionally a Function that receives `getState` function for accessing current store state and `action` object as parameters. Returns `true` if the log group should be collapsed, `false` otherwise.
  // duration = false: Boolean, // print the duration of each action?
  // timestamp = true: Boolean, // print the timestamp with each action?

  // level = 'log': 'log' | 'console' | 'warn' | 'error' | 'info', // console's level
  // colors: ColorsObject, // colors for title, prev state, action and next state: https://github.com/LogRocket/redux-logger/blob/master/src/defaults.js#L12-L18
  // titleFormatter, // Format the title used when logging actions.

  // stateTransformer, // Transform state before print. Eg. convert Immutable object to plain JSON.
  // actionTransformer, // Transform action before print. Eg. convert Immutable object to plain JSON.
  // errorTransformer, // Transform error before print. Eg. convert Immutable object to plain JSON.

  // logger = console: LoggerObject, // implementation of the `console` API.
  // logErrors = true: Boolean, // should the logger catch, log, and re-throw errors?

  // diff = false: Boolean, // (alpha) show diff between states?
  // diffPredicate // (alpha) filter function for showing states diff, similar to `predicate`
});
const defaultMiddleware = (getDefaultMiddleware) =>
  getDefaultMiddleware({
    serializableCheck: {
      ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
    },
  });

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (getDefaultMiddleware) =>
    defaultMiddleware(getDefaultMiddleware).concat(logger);
} else {
  middleware = defaultMiddleware;
}

const persistAuthSliceConfig = {
  key: "@lagis-desktop.1.app.auth",
  storage: localForage,
  whitelist: ["jwt", "login"],
};

const persistParcelsConfig = {
  key: "@lagis-desktop.1.app.landparcels",
  storage: localForage,
  whitelist: ["landParcels", "landmarks"],
};

const persistLagisSliceConfig = {
  key: "@lagis-desktop.1.app.lagis",
  storage: localForage,
  whitelist: ["lagisLandparcel", "geometry"],
};

const persisUIConfig = {
  key: "@lagis-desktop.1.app.ui",
  storage: localForage,
  whitelist: [
    "syncLandparcel",
    "activeBackgroundLayer",
    "backgroundLayerOpacities",
    "activeAdditionalLayers",
    "additionalLayerOpacities",
  ],
};

const persisMappingConfig = {
  key: "@lagis-desktop.1.app.mapping",
  storage: localForage,
  whitelist: ["showInspectMode"],
};

// const persis

// const persistlagisLandparcelConfig = {
//   key: "@lagis-desktop.1.app.lagisLandparcel",
//   storage: localForage,
//   whitelist: ["lagisLandparcel", "alkisLandparcel"],
// };

export default configureStore({
  reducer: {
    auth: persistReducer(persistAuthSliceConfig, authSlice.reducer),
    lagis: persistReducer(persistLagisSliceConfig, lagisSlice.reducer),
    landParcels: persistReducer(persistParcelsConfig, landParcels.reducer),
    permissions: permissionsSlice.reducer,
    mapping: persistReducer(persisMappingConfig, mappingSlice.reducer),
    ui: persistReducer(persisUIConfig, uiSlice.reducer),
    gazetteerData: gazDataSlice.reducer,
    search: searchSlice.reducer,
  },
  middleware,
});
