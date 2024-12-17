import { configureStore, Reducer, UnknownAction } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import { PersistPartial } from "redux-persist/lib/persistReducer";

import {
  getCesiumConfig,
  cesiumReducer,
  CesiumState,
} from "@carma-mapping/cesium-engine";

import { defaultCesiumState } from "../config/cesium/store.config";
import { APP_KEY, STORAGE_PREFIX } from "../config/app.config";

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
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    });
}

const store = configureStore({
  reducer: {
    cesium: persistReducer(
      getCesiumConfig({ appKey: APP_KEY, storagePrefix: STORAGE_PREFIX }),
      cesiumReducer
    ) as Reducer<CesiumState & PersistPartial, UnknownAction, CesiumState>,
  },
  preloadedState: {
    cesium: defaultCesiumState,
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export default store;
