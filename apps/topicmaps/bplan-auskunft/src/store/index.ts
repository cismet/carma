import { configureStore } from '@reduxjs/toolkit';
import bplaeneSlice from './slices/bplaene';
import { createLogger } from 'redux-logger';
import { persistReducer } from 'redux-persist';
import { APP_KEY, STORAGE_PREFIX } from '../constants/bplaene';
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

const bplaeneConfig = {
  key: '@' + APP_KEY + '.' + STORAGE_PREFIX + '.app.bplaene',
  storage: localForage,
  whitelist: ['data'],
};

export default configureStore({
  reducer: {
    bplaene: persistReducer(bplaeneConfig, bplaeneSlice.reducer),
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});
