export const REST_SERVICE =
  window.BELIS_ONLINE_ENV_CONFIG?.REST_SERVICE ||
  'https://belis-cloud-api.cismet.de';
export const DOMAIN = window.BELIS_ONLINE_ENV_CONFIG?.DOMAIN || 'BELIS2';
const OFFLINE_ACTIONS_ROUTE =
  window.BELIS_ONLINE_ENV_CONFIG?.OFFLINE_ACTIONS_ROUTE ||
  'offline-actions-belis-cloud.cismet.de/v1/graphql';
export const DB_VERSION =
  window.BELIS_ONLINE_ENV_CONFIG?.DB_VERSION || 'belis-online-cloud-db-1.0';
export const PLAYGROUND = window.BELIS_ONLINE_ENV_CONFIG?.PLAYGROUND ?? true;

export const OFFLINE_ACTIONS_SYNC_URL = 'https://' + OFFLINE_ACTIONS_ROUTE;
export const OFFLINE_ACTIONS_ENDPOINT_URL = 'wss://' + OFFLINE_ACTIONS_ROUTE;

export const IMAGEUPLOAD_MAXSIDE = 1200;
export const IMAGEUPLOAD_QUALITY = 0.3;

export const backgrounds = {
  stadtplan: 'vectorCityMap',
  lbk: 'lbk',
  nightplan: 'darkMatter',
  pale_stadtplan: 'vectorCityMapPale',
  pale_lbk: 'lbkPale',
  pale_nightplan: 'darkMatterPale',
};

export const offlineConfig = {
  rules: [
    {
      origin: 'https://omt.map-hosting.de/fonts/Metropolis Medium Italic,Noto',
      cachePath: 'fonts/Open',
    },
    {
      origin: 'https://omt.map-hosting.de/fonts/Klokantech Noto',
      cachePath: 'fonts/Open',
    },
    {
      origin: 'https://omt.map-hosting.de/fonts',
      cachePath: 'fonts',
    },
    {
      origin: 'https://omt.map-hosting.de/styles',
      cachePath: 'styles',
    },

    {
      origin: 'https://omt.map-hosting.de/data/v3',
      cachePath: 'tiles',
    },

    {
      origin: 'https://omt.map-hosting.de/data/gewaesser',
      cachePath: 'tiles.gewaesser',
    },

    {
      origin: 'https://omt.map-hosting.de/data/kanal',
      cachePath: 'tiles.kanal',
    },

    {
      origin: 'https://omt.map-hosting.de/data/brunnen',
      cachePath: 'tiles.brunnen',
      // realServerFallback: true, //this can override the globalsetting
    },
  ],
  dataStores: [
    {
      name: 'Vektorkarte für Wuppertal',
      key: 'wuppBasemap',
      url: 'https://offline-data.cismet.de/offline-data/wupp.zip',
    },

    {
      name: 'Gewässer, Kanal und Brunnendaten',
      key: 'umweltalarm',
      url: 'https://offline-data.cismet.de/offline-data/umweltalarm.zip',
    },
  ],
  offlineStyles: [
    'https://omt.map-hosting.de/styles/cismet-light/style.json',
    'https://omt.map-hosting.de/styles/osm-bright-grey/style.json',
    'https://omt.map-hosting.de/styles/dark-matter/style.json',
    'https://omt.map-hosting.de/styles/klokantech-basic/style.json',
    'https://omt.map-hosting.de/styles/brunnen/style.json',
    'https://omt.map-hosting.de/styles/kanal/style.json',
    'https://omt.map-hosting.de/styles/gewaesser/style.json',
  ],
  realServerFallback: true, //should be true in production
  consoleDebug: false && process.env.NODE_ENV !== 'production',
  optional: true,
  initialActive: false, //todo set to true in production
};

// export const REST_SERVICE = "http://bender:8890";

export const getWebDavUrl = (jwt, doc) => {
  if (doc.intermediate === true) {
    return doc.url;
  } else if (doc.doc.startsWith('dev')) {
    return `${REST_SERVICE}/secres/${jwt}/belisdev/${doc.doc}`;
  } else {
    return `${REST_SERVICE}/secres/${jwt}/beliswebdav/${doc.doc}`;
  }
};

export const backgroundConfigurations = {
  lbk: {
    layerkey: 'rvrGrundriss@100|trueOrtho2022@75|rvrSchriftNT@100',
    src: '/images/rain-hazard-map-bg/ortho.png',
    title: 'Luftbildkarte',
  },
  ortho: {
    layerkey: 'trueOrtho2022@95',
    src: '/images/rain-hazard-map-bg/ortho.png',
    title: 'Luftbild',
  },
  vectorCityMap: {
    layerkey: 'osmBrightOffline',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
  stadtplan: {
    layerkey: 'osmBrightOffline',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
  darkMatter: {
    layerkey: 'dark_matter',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan (dunkel)',
  },
  darkMatterPale: {
    layerkey: 'dark_matter_pale',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan (dunkel)',
  },
  // vectorCityMap2: {
  //   layerkey: "cismetLight",
  //   src: "/images/rain-hazard-map-bg/citymap.png",
  //   title: "Stadtplan",
  // },

  // abkg: {
  //   layerkey: "bplan_abkg@70",
  //   src: "/images/rain-hazard-map-bg/citymap.png",
  //   title: "Amtliche Basiskarte",
  // },
  // stadtplan: {
  //   layerkey: "wupp-plan-live@90",
  //   src: "/images/rain-hazard-map-bg/citymap.png",
  //   title: "Stadtplan",
  // },
  nix: {
    layerkey: 'empty',
    src: '/images/rain-hazard-map-bg/citymap.png',
    title: 'Stadtplan',
  },
};

export const backgroundModes = [
  {
    title: 'Stadtplan (bunt)',
    mode: 'default',
    layerKey: 'stadtplan',
    offlineDataStoreKey: 'wuppBasemap',
  },

  { title: 'Luftbildkarte', mode: 'default', layerKey: 'lbk' },
  { title: 'Luftbild', mode: 'default', layerKey: 'ortho' },
];
