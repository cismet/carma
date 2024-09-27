import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";

const year = new Date().getFullYear();
const overridingBaseLayerConf = {
  namedStyles: {
    default: { opacity: 1.0 },
    night: {
      opacity: 0.9,
      "css-filter": "filter:grayscale(0.9)brightness(0.9)invert(1)",
    },
    blue: {
      opacity: 1.0,
      "css-filter":
        "filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)",
    },
  },
  defaults: {
    wms: {
      format: "image/png",
      tiled: true,
      maxZoom: 22,
      opacity: 0.6,
      version: "1.1.1",
    },
  },
  namedLayers: {
    rvr: {
      type: "wms",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      tiled: false,
      version: "1.3.0",
    },

    slDOPcismet: {
      type: "wms",
      url: "https://lvgl-saar-ortho.cismet.de/geoserver/ows?&version=1.1.1",
      transparent: "true",
      layers: "ortho:sls_ortho",
      styles: "ortho:rgb",
      tiled: "false",
      version: "1.1.1",
      pane: "backgroundLayers",
      attribution: "Luftbild: &copy; LVGL Saarland",
    },
    slDOPcismet2: {
      type: "wms",
      url: "https://lvgl-saar-ortho.cismet.de/geoserver/ows?&version=1.1.1",
      transparent: "true",
      layers: "ortho:sls_ortho_pyramid",
      styles: "ortho:rgb",
      tiled: "false",
      version: "1.1.1",
      pane: "backgroundLayers",
      attribution: "Luftbild: &copy; LVGL Saarland",
    },

    cismetLight: {
      type: "vector",
      opacity: 1,
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
      style: "https://omt-germany.cismet.de/styles/cismet-light/style.json",
      pane: "backgroundvectorLayers",
    },
    cismetText: {
      type: "vector",
      style: "https://omt.map-hosting.de/styles/cismet-text/style.json",
      pane: "backgroundlayerTooltips",
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
    },
    cismetBasic: {
      type: "vector",
      opacity: 1,
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
      style: "https://omt.map-hosting.de/styles/cismet-basic/style.json",
      pane: "backgroundvectorLayers",
    },
    basemap_de: {
      type: "vector",
      opacity: 1,
      attribution:
        'Hintergrundkarte &copy; <a href="https://basemap.de/web-vektor/">basemap.de</a> Vektorkarte',
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json",
      pane: "backgroundvectorLayers",
    },
    basemap_de_relief: {
      type: "vector",
      opacity: 1,
      attribution:
        'Hintergrundkarte &copy; <a href="https://basemap.de/web-vektor/">basemap.de</a> Vektorkarte',
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
      pane: "backgroundvectorLayers",
    },
    basemap_de_grau: {
      type: "vector",
      opacity: 1,
      attribution:
        'Hintergrundkarte &copy; <a href="https://basemap.de/web-vektor/">basemap.de</a> Vektorkarte',
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
      pane: "backgroundvectorLayers",
    },

    dir: {
      type: "wms",
      opacity: 1,
      transparent: true,
      url: "https://starkregen-tholey.cismet.de/geoserver/wms?SERVICE=WMS",
      layers: "starkregen:sri7_direction",
      tiled: false,

      version: "1.1.1",
    },
    basemap_grey: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
      attribution: "© basemap.de / BKG " + year,
    },
    basemap_color: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json",
      attribution: "© basemap.de / BKG " + year,
    },
    basemap_relief: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
      attribution: "© basemap.de / BKG " + year,
    },
  },
};

const config = {
  upperleftX: 741542.528,
  upperleftY: 6341681.543,
  pixelsize: 1.533870784428618,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: "https://rasterfari-saarlouis.cismet.de",
  modelWMS:
    "https://starkregenwms-saarlouis.cismet.de/geoserver/wms?SERVICE=WMS",

  simulations: [
    {
      depthLayer: "starkregen:L_HQ50_depth3857",
      velocityLayer: "starkregen:L_HQ50_velocity3857",
      directionsLayer: "starkregen:L_HQ50_direction3857",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animation: "HQ50/",
      name: "Stärke 6",
      title: "Starkregen SRI 6 (38,5 l/m² in 2h)",
      icon: "bar-chart",
      subtitle:
        "Simulation eines zweistündigen Starkregens mit 38,5 Liter/m² Niederschlag (Starkregenindex SRI 6) in ganz Saarlouis, statistische Wiederkehrzeit 50 Jahre",
    },
    {
      depthLayer: "starkregen:L_HQ100_depth3857",
      velocityLayer: "starkregen:L_HQ100_velocity3857",
      directionsLayer: "starkregen:L_HQ100_direction3857",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animation: "HQ100/",
      name: "Stärke 7",
      icon: "bar-chart",
      title: "Starkregen SRI 7 (42 l/m² in 2h)",
      subtitle:
        "Simulation eines zweistündigen Starkregens mit 42 Liter/m² Niederschlag (Starkregenindex SRI 7) in ganz Saarlouis, statistische Wiederkehrzeit 100 Jahre",
    },
    {
      depthLayer: "starkregen:L_HQex_depth3857",
      velocityLayer: "starkregen:L_HQex_velocity3857",
      directionsLayer: "starkregen:L_HQex_direction3857",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      name: "Stärke 10",
      icon: "bitbucket",
      animation: "HQex/",
      title: "Starkregen SRI 10 (90 l/m² in 1h)",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 90 Liter/m² Niederschlag (Starkregenindex SRI 10) in ganz Saarlouis",
    },
  ],
  backgrounds: [
    // {
    //   layerkey: "cismetLight@100",
    //   src: "/images/rain-hazard-map-bg/citymapGrey.png",
    //   title: "Basiskarte (grau)",
    // },

    // {
    //   layerkey: "cismetBasic@40",
    //   src: "/images/rain-hazard-map-bg/citymap.png",
    //   title: "Basiskarte (bunt)",
    // },
    // {
    //   layerkey: "slDOP@80|cismetBasic",
    //   src: "/images/rain-hazard-map-bg/ortho.png",
    //   title: "Luftbildkarte",
    // },

    {
      layerkey: "basemap_grey@15",
      src: "/images/rain-hazard-map-bg/citymapGrey.png",
      title: "Basiskarte (grau)",
    },

    // {
    //   layerkey: "basemap_color@20",
    //   src: "/images/rain-hazard-map-bg/citymap.png",
    //   title: "Basiskarte (bunt)",
    // },
    {
      layerkey: "basemap_relief@20",
      src: "/images/rain-hazard-map-bg/citymap.png",
      title: "Basiskarte (bunt)",
    },
    {
      layerkey: "slDOPcismet2|basemap_de_grau@20",
      src: "/images/rain-hazard-map-bg/ortho.png",
      title: "Luftbildkarte",
    },
  ],
  heightsLegend: [
    { title: "10 cm", lt: 0.1, bg: "#88B2EA" },
    { title: "30 cm", lt: 0.3, bg: "#508CE0" },
    { title: "50 cm", lt: 0.5, bg: "#3266B4" },
    { title: "100 cm", lt: 1.0, bg: "#5018B3" },
  ],
  velocityLegend: [
    { title: "0.5 m/s", lt: 0.1, bg: "#BEC356" },
    { title: "1 m/s", lt: 1, bg: "#DA723E" },
    { title: "2 m/s", lt: 3, bg: "#D64733" },
    { title: "4 m/s", lt: 5, bg: "#8F251B" },
  ],
  heightsLegendAlt: [
    { title: "20 cm", lt: 0.1, bg: "#AFCFF9" },
    { title: "40 cm", lt: 0.3, bg: "#FED27B" },
    { title: "75 cm", lt: 0.5, bg: "#E9B279" },
    { title: "100 cm", lt: 1.0, bg: "#DD8C7B" },
  ],
  velocityLegendAlt: [
    { title: "0.5 m/s", lt: 0.1, bg: "#BEC356" },
    { title: "2 m/s", lt: 1, bg: "#DA723E" },
    { title: "4 m/s", lt: 3, bg: "#D64733" },
    { title: "6 m/s", lt: 5, bg: "#8F251B" },
  ],
};

const initialState = {
  displayMode: starkregenConstants.SHOW_HEIGHTS,
  modelLayerProblem: false,
  featureInfoModeActivated: false,
  currentFeatureInfoValue: undefined,
  currentFeatureInfoSelectedSimulation: undefined,
  currentFeatureInfoPosition: undefined,
  minifiedInfoBox: false,
  selectedSimulation: 0,
  backgroundLayer: undefined,
  selectedBackground: 0,
  animationEnabled: true,
};

export default { config, overridingBaseLayerConf, initialState };
