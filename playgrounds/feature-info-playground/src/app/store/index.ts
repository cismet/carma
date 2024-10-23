import { configureStore } from '@reduxjs/toolkit';
import type {
  ActionCreatorInvariantMiddlewareOptions,
  ImmutableStateInvariantMiddlewareOptions,
  Middleware,
  SerializableStateInvariantMiddlewareOptions,
} from '@reduxjs/toolkit';

import mappingSlice from './slices/mapping';

import { createLogger } from 'redux-logger';
import { persistReducer } from 'redux-persist';
import localForage from 'localforage';
import { APP_KEY, STORAGE_PREFIX } from '../helper/constants';

console.log('store initializing ....');

interface ThunkOptions<E = any> {
  extraArgument: E;
}

interface GetDefaultMiddlewareOptions {
  thunk?: boolean | ThunkOptions;
  immutableCheck?: boolean | ImmutableStateInvariantMiddlewareOptions;
  serializableCheck?: boolean | SerializableStateInvariantMiddlewareOptions;
  actionCreatorCheck?: boolean | ActionCreatorInvariantMiddlewareOptions;
}

const customAppKey = new URLSearchParams(window.location.hash).get('appKey');

const devToolsEnabled =
  new URLSearchParams(window.location.search).get('devToolsEnabled') === 'true';
console.log('devToolsEnabled:', devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search,
).get('stateLoggingEnabled');

const inProduction = process.env.NODE_ENV === 'production';

console.log('in Production Mode:', inProduction);
const stateLoggingEnabled =
  (stateLoggingEnabledFromSearch !== null &&
    stateLoggingEnabledFromSearch !== 'false') ||
  !inProduction;

console.log(
  'stateLoggingEnabled:',
  stateLoggingEnabledFromSearch,
  'x',
  stateLoggingEnabled,
);
const logger = createLogger({
  collapsed: true,
});

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (
    getDefaultMiddleware: (
      options: GetDefaultMiddlewareOptions,
    ) => Middleware[],
  ) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(logger);
} else {
  middleware = (
    getDefaultMiddleware: (
      options: GetDefaultMiddlewareOptions,
    ) => Middleware[],
  ) =>
    getDefaultMiddleware({
      serializableCheck: false,
    });
}

const mappingConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.mapping',
  storage: localForage,
  whitelist: ['layers'],
};

const store = configureStore({
  reducer: {
    mapping: persistReducer(mappingConfig, mappingSlice.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
export default store;

export type AppStore = typeof store;

export type RootState = ReturnType<AppStore['getState']>;

export type AppDispatch = AppStore['dispatch'];
