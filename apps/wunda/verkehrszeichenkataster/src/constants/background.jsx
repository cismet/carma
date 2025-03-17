export const backgrounds = {
  stadtplan: "vectorCityMap",
  lbk: "lbk",
  nightplan: "darkMatter",
  pale_stadtplan: "vectorCityMapPale",
  pale_lbk: "lbkPale",
  pale_nightplan: "darkMatterPale",
};

export const offlineConfig = {
  rules: [
    {
      origin: "https://omt.map-hosting.de/fonts/Metropolis Medium Italic,Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts/Klokantech Noto",
      cachePath: "fonts/Open",
    },
    {
      origin: "https://omt.map-hosting.de/fonts",
      cachePath: "fonts",
    },
    {
      origin: "https://omt.map-hosting.de/styles",
      cachePath: "styles",
    },

    {
      origin: "https://omt.map-hosting.de/data/v3",
      cachePath: "tiles",
    },

    {
      origin: "https://omt.map-hosting.de/data/gewaesser",
      cachePath: "tiles.gewaesser",
    },

    {
      origin: "https://omt.map-hosting.de/data/kanal",
      cachePath: "tiles.kanal",
    },

    {
      origin: "https://omt.map-hosting.de/data/brunnen",
      cachePath: "tiles.brunnen",
      // realServerFallback: true, //this can override the globalsetting
    },
  ],
  dataStores: [
    {
      name: "Vektorkarte für Wuppertal",
      key: "wuppBasemap",
      url: "https://offline-data.cismet.de/offline-data/wupp.zip",
    },

    {
      name: "Gewässer, Kanal und Brunnendaten",
      key: "umweltalarm",
      url: "https://offline-data.cismet.de/offline-data/umweltalarm.zip",
    },
  ],
  offlineStyles: [
    "https://omt.map-hosting.de/styles/cismet-light/style.json",
    "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
    "https://omt.map-hosting.de/styles/dark-matter/style.json",
    "https://omt.map-hosting.de/styles/klokantech-basic/style.json",
    "https://omt.map-hosting.de/styles/brunnen/style.json",
    "https://omt.map-hosting.de/styles/kanal/style.json",
    "https://omt.map-hosting.de/styles/gewaesser/style.json",
  ],
  realServerFallback: true, //should be true in production
  consoleDebug: false && process.env.NODE_ENV !== "production",
  optional: true,
  initialActive: false, //todo set to true in production
};

export const backgroundConfigurations = {
  lbk: {
    layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  mix: {
    layerkey: "trueOrtho2022@70|cismetLight",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbildkarte",
  },
  ortho: {
    layerkey: "trueOrtho2022@95",
    src: "/images/rain-hazard-map-bg/ortho.png",
    title: "Luftbild",
  },
  vectorCityMap: {
    layerkey: "cismetLight",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  vectorCityMap2: {
    layerkey: "osmBrightOffline",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  stadtplan: {
    layerkey: "osmBrightOffline",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
  darkMatter: {
    layerkey: "dark_matter",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan (dunkel)",
  },
  darkMatterPale: {
    layerkey: "dark_matter_pale",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan (dunkel)",
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
    layerkey: "empty",
    src: "/images/rain-hazard-map-bg/citymap.png",
    title: "Stadtplan",
  },
};

export const additionalLayerConfiguration = {
  hillshade: {
    title: "Schummerung",
    initialActive: false,
    layerkey: "hillshade@20",
    pane: "additionalLayers1",
  },

  // opacity in props gets set inside Map.jsx
  nrwAlkisFstck: {
    title: <span>NRW ALKIS Flurstücke</span>,
    initialActive: false,
    props: {
      key: "nrwAlkisFstck",
      url: "https://www.wms.nrw.de/geobasis/wms_nw_alkis",
      layers: "adv_alkis_flurstuecke",
      format: "image/png",
      styles: "Farbe",
      tiled: "true",
      transparent: "true",
      pane: "additionalLayers0",
      maxZoom: 19,
    },
  },
  nrwAlkisGebaeude: {
    title: <span>NRW ALKIS Gebäude</span>,
    initialActive: false,
    props: {
      key: "nrwAlkisGebaeude",
      url: "https://www.wms.nrw.de/geobasis/wms_nw_alkis",
      layers: "adv_alkis_gebaeude",
      format: "image/png",
      styles: "Farbe",
      tiled: "true",
      transparent: "true",
      pane: "additionalLayers1",
      maxZoom: 19,
    },
  },
};

export const backgroundModes = [
  {
    title: "Stadtplan (bunt)",
    mode: "default",
    layerKey: "stadtplan",
    offlineDataStoreKey: "wuppBasemap",
  },

  { title: "Luftbildkarte", mode: "default", layerKey: "lbk" },
  { title: "Luftbild", mode: "default", layerKey: "ortho" },
  { title: "mix", mode: "default", layerKey: "mix" },
];

export const extendBaseLayerConf = (baseLayerConf) => {
  if (!baseLayerConf.namedLayers.cismetLight) {
    baseLayerConf.namedLayers.cismetLight = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/cismet-light/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    };
  }
  if (!baseLayerConf.namedLayers.osmBrightOffline) {
    baseLayerConf.namedLayers.osmBrightOffline = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    };
  }
  if (!baseLayerConf.namedLayers.osmBrightOffline_pale) {
    baseLayerConf.namedLayers.osmBrightOffline_pale = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/osm-bright-grey/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
      opacity: 0.3,
      iconOpacity: 0.6,
      textOpacity: 0.6,
    };
  }
  if (!baseLayerConf.namedLayers.klokantech_basic) {
    baseLayerConf.namedLayers.klokantech_basic = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/klokantech-basic/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    };
  }
  if (!baseLayerConf.namedLayers.dark_matter) {
    baseLayerConf.namedLayers.dark_matter = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/dark-matter/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
    };
  }
  if (!baseLayerConf.namedLayers.dark_matter_pale) {
    baseLayerConf.namedLayers.dark_matter_pale = {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/dark-matter/style.json",
      offlineAvailable: true,
      offlineDataStoreKey: "wuppBasemap",
      pane: "backgroundvectorLayers",
      opacity: 0.5,
      iconOpacity: 1,
      textOpacity: 1,
    };
  }

  return baseLayerConf;
};
