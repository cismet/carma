import { configureStore } from '@reduxjs/toolkit';
import mappingSlice from './slices/mapping';
import layersSlice from './slices/layers';
import uiSlice from './slices/ui';
import { createLogger } from 'redux-logger';
import { persistReducer } from 'redux-persist';
import localForage from 'localforage';
import { APP_KEY, STORAGE_PREFIX } from '../helper/constants';

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
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.config',
  storage: localForage,
  whitelist: [],
};

const mappingConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.mapping',
  storage: localForage,
  whitelist: [],
};

const layersConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.layers',
  storage: localForage,
  whitelist: ['thumbnails'],
};

export default configureStore({
  reducer: {
    mapping: persistReducer(mappingConfig, mappingSlice.reducer),
    ui: persistReducer(uiConfig, uiSlice.reducer),
    layers: persistReducer(layersConfig, layersSlice.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
