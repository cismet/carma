import { configureStore } from "@reduxjs/toolkit";
import { createLogger } from "redux-logger";
import { persistReducer } from "redux-persist";
import localForage from "localforage";

import authSlice from "./slices/auth";
import mappingSlice from "./slices/mapping";
import applicationSlice from "./slices/application";
import { APP_KEY, STORAGE_PREFIX } from "../constants/vkz";

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
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.auth",
  storage: localForage,
  whitelist: ["jwt", "login"],
};

const applicationConfig = {
  key: "@" + APP_KEY + "." + STORAGE_PREFIX + ".app.application",
  storage: localForage,
  whitelist: ["selectedApplications", "allApplications"],
};

export default configureStore({
  reducer: {
    auth: persistReducer(authConfig, authSlice.reducer),
    mapping: mappingSlice.reducer,
    application: persistReducer(applicationConfig, applicationSlice.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
