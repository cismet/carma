import { configureStore } from '@reduxjs/toolkit';
import aevSlice from './slices/aenderungsverfahren';
import hauptnutzungenSlice from './slices/hauptnutzungen';
import mappingSlice from './slices/mapping';
import { createLogger } from 'redux-logger';
import { persistReducer } from 'redux-persist';
import { APP_KEY, STORAGE_PREFIX } from '../constants/fnp';
import localForage from 'localforage';

console.log('store initializing ....');

const devToolsEnabled =
  new URLSearchParams(window.location.search).get('devToolsEnabled') === 'true';
console.log('devToolsEnabled:', devToolsEnabled);
const stateLoggingEnabledFromSearch = new URLSearchParams(
  window.location.search
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
  stateLoggingEnabled
);
const logger = createLogger({
  collapsed: true,
});

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (getDefaultMiddleware: any) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware: any) =>
    getDefaultMiddleware({
      serializableCheck: false,
    });
}

const aevConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.aev',
  storage: localForage,
  whitelist: ['data'],
};

const hauptnutzungenConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.hauptnutzungen',
  storage: localForage,
  whitelist: ['data'],
};

const mappingConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.mapping',
  storage: localForage,
  whitelist: [],
};

export default configureStore({
  reducer: {
    aev: persistReducer(aevConfig, aevSlice.reducer),
    hauptnutzungen: persistReducer(
      hauptnutzungenConfig,
      hauptnutzungenSlice.reducer
    ),
    mapping: persistReducer(mappingConfig, mappingSlice.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
