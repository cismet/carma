import { configureStore } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";
import authSlice from "./slices/auth";
import mapSettings from "./slices/mapSettings";

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
  whitelist: ["jwt", "login"],
};

const mapSettingsConfig = {
  key: "@belis-desktop.1.app.ui",
  storage: localForage,
  whitelist: ["activeBackgroundLayer", "backgroundLayerOpacities"],
};

export default configureStore({
  reducer: {
    auth: persistReducer(authConfig, authSlice.reducer),
    mapSettings: persistReducer(mapSettingsConfig, mapSettings.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
