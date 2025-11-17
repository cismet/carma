import { configureStore } from "@reduxjs/toolkit";

import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";

import mappingReducer from "./slices/mapping";
import uiReducer from "./slices/ui";
// import measurementsReducer from "./slices/measurements";

console.info("store initializing ....");

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

const uiConfig = {
  key: "@vectorlayer-filtering-playground.app.config",
  storage: localForage,
  whitelist: [],
};

const mappingConfig = {
  key: "@vectorlayer-filtering-playground.app.mapping",
  storage: localForage,
  whitelist: [],
};

// const measurementsConfig = {
//   key: "@vectorlayer-filtering-playground.app.measurements",
//   storage: localForage,
//   whitelist: ["shapes"],
// };

const store = configureStore({
  reducer: {
    mapping: persistReducer(mappingConfig, mappingReducer),
    ui: persistReducer(uiConfig, uiReducer),
    // measurements: persistReducer(measurementsConfig, measurementsReducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export type AppStore = typeof store;
export type RootState = ReturnType<AppStore["getState"]>;
export type AppDispatch = AppStore["dispatch"];

export default store;
