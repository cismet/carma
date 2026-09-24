import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";
import citymapGrey from "./assets/images/rain-hazard-map-bg/citymapGrey.png";
import citymapBg from "./assets/images/rain-hazard-map-bg/citymap.png";
import orthoBg from "./assets/images/rain-hazard-map-bg/ortho.png";

const overridingBaseLayerConf = {
  namedStyles: {
    default: { opacity: 0.6 },
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
      tiled: "true",
      maxZoom: 22,
      opacity: 0.6,
      version: "1.1.1",
      pane: "backgroundLayers",
    },
  },
  namedLayers: {
    rvr: {
      type: "wms",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      tiled: "false",
      version: "1.3.0",
    },
    nrwDOP: {
      type: "wms",
      url: "https://geodaten.metropoleruhr.de/dop/dop",
      layers: "DOP",
      tiled: "false",
      version: "1.1.1",
    },
    cismetLight: {
      type: "vector",
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
      style: "https://omt-germany.cismet.de/styles/cismet-light/style.json",
    },
  },
};

const config = {
  upperleftX: 784177.562,
  upperleftY: 6768564.74,
  pixelsize: 1.613669350976827,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: "https://rasterfari-haltern.cismet.de",
  modelWMS: "https://starkregen-haltern.cismet.de/geoserver/wms?SERVICE=WMS",

  simulations: [
    {
      depthLayer: "starkregen:S22_T50_depth",
      velocityLayer: "starkregen:S22_T50_velocity",
      directionsLayer: "starkregen:S22_T50_direction",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animation: "22_T50/",
      name: "Stärke 6",
      title: "Starkregen SRI 6 (38,4 l/m² in 1h)",
      icon: "bar-chart",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 38,4 Liter/m² Niederschlag (Starkregenindex SRI 6) in ganz Haltern am See, statistische Wiederkehrzeit 50 Jahre",
    },

    {
      depthLayer: "starkregen:S22_Extrem_depth",
      velocityLayer: "starkregen:S22_Extrem_velocity",
      directionsLayer: "starkregen:S22_Extrem_direction",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animation: "22_Extrem/",
      name: "Extremereignis",
      icon: "bar-chart",
      title: "extremer Starkregen (SRI 10)",
      subtitle:
        "Simulation eines dreistündigen Starkregens anhand gemessener Niederschlagshöhen in Lippramsdorf (Starkregenindex SRI 10) für ganz Haltern am See",
    },
  ],
  backgrounds: [
    {
      layerkey: "cismetLight@100",
      src: citymapGrey,
      title: "Stadtplan (grau)",
    },
    {
      layerkey: "nrwDOP@60|rvr@30",
      src: orthoBg,
      title: "Luftbildkarte",
    },
    {
      layerkey: "rvr@50",
      src: citymapBg,
      title: "Stadtplan (bunt)",
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
  valueMode: starkregenConstants.SHOW_MAXVALUES,

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

const conf = { config, overridingBaseLayerConf, initialState };

export default conf;
