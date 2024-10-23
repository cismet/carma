//kjdfh

import { configureStore } from '@reduxjs/toolkit';
import localForage from 'localforage';
import { createLogger } from 'redux-logger';
import { persistReducer } from 'redux-persist';

import { appKey, storagePostfix } from '../../Keys';
import appStateSlice from './slices/app';
import authSlice from './slices/auth';
import backgroundSlice from './slices/background';
import cacheControlSlice from './slices/cacheControl';
import dexieSlice from './slices/dexie';
import featureCollectionSlice from './slices/featureCollection';
import gazetteerDataSlice from './slices/gazetteerData';
import keytablesSlice from './slices/keytables';
import mapSlice from './slices/map';
import mapInfoSlice from './slices/mapInfo';
import offlineActionDb from './slices/offlineActionDb';
import paleModeSlice from './slices/paleMode';
import searchSlice from './slices/search';
import spatialIndexSlice from './slices/spatialIndex';
import teamSlice from './slices/team';
import zoomSlice from './slices/zoom';
import healthSlice from './slices/health';

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
// const middleware = [...getDefaultMiddleware({ immutableCheck: false, serializableCheck: false })];
// if (stateLoggingEnabled === true) {
//   middleware.push(logger);
// }

let middleware;
if (stateLoggingEnabled === true) {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
      thunk: true,
    }).concat(logger);
} else {
  middleware = (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
      immutableCheck: false,
      thunk: true,
    });
}

const appStateConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.state',
  storage: localForage,
  whitelist: ['connectionMode'],
};
const authConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.auth',
  storage: localForage,
  whitelist: ['jwt', 'login'],
};

const featureCollectionConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.featureCollection',
  storage: localForage,
  whitelist: ['filter', 'inFocusMode'],
};

const searchConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.search',
  storage: localForage,
  whitelist: ['active', 'wished'],
};

const backgroundConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.background',
  storage: localForage,
  whitelist: ['layer'],
};

const offlineActionDbConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.offlineActionDb',
  storage: localForage,
  whitelist: ['intermediateResults'],
};

const paleModeConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.paleMode',
  storage: localForage,
  whitelist: ['mode'],
};

const cacheControlConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.cacheControl.v2',
  storage: localForage,
};

const teamConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.app.team',
  storage: localForage,
  whitelist: ['selectedTeam'],
};

const keyTablesConfig = {
  key: '@' + appKey + '.' + storagePostfix + '.keytables',
  storage: localForage,
  whitelist: [
    'teams',
    'leuchtmittel',
    'rundsteuerempfaenger',
    'tkey_leuchtentyp',
  ],
};
const store = configureStore({
  reducer: {
    app: persistReducer(appStateConfig, appStateSlice.reducer),
    auth: persistReducer(authConfig, authSlice.reducer),
    spatialIndex: spatialIndexSlice.reducer,
    featureCollection: persistReducer(
      featureCollectionConfig,
      featureCollectionSlice.reducer
    ),
    search: persistReducer(searchConfig, searchSlice.reducer),
    zoom: zoomSlice.reducer,
    background: persistReducer(backgroundConfig, backgroundSlice.reducer),
    paleMode: persistReducer(paleModeConfig, paleModeSlice.reducer),
    cacheControl: persistReducer(cacheControlConfig, cacheControlSlice.reducer),
    // uiMessage: uiMessageSlice.reducer,
    gazetteerData: gazetteerDataSlice.reducer,
    team: persistReducer(teamConfig, teamSlice.reducer),
    offlineActionDb: persistReducer(
      offlineActionDbConfig,
      offlineActionDb.reducer
    ),
    //photoLightbox: photoLightboxSlice.reducer,
    dexie: dexieSlice.reducer,
    mapInfo: mapInfoSlice.reducer,
    map: mapSlice.reducer,
    keytables: keytablesSlice.reducer,
    health: healthSlice.reducer,
  },
  devTools: devToolsEnabled === true && inProduction === false,
  middleware,
});

export default store;
