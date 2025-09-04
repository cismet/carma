import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";
import citymapGrey from "./assets/images/rain-hazard-map-bg/citymapGrey.png";
import dtkBg from "./assets/images/rain-hazard-map-bg/dtk.png";
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
    },
  },
  namedLayers: {
    dtk: {
      type: "wms",
      url: "https://www.wms.nrw.de/geobasis/wms_nw_dtk",
      layers: "nw_dtk_col",
      tiled: "false",
      version: "1.3.0",
    },
    nrwDOP: {
      type: "wms",
      url: "https://www.wms.nrw.de/geobasis/wms_nw_dop",
      layers: "nw_dop_rgb",
      tiled: "false",
      version: "1.1.1",
    },
    cismetLight: {
      type: "vector",
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
      style: "https://omt-germany.cismet.de/styles/cismet-light/style.json",
      // style: "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
    },
  },
};

const config = {
  hideMeasurements: true,

  upperleftX: 701360.974, //take a depth3857.tif and run gdalinfo on it get the pixelsize and upperleftcorner info from there
  upperleftY: 6584392.595,
  pixelsize: 1.57325053811999,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: "https://rasterfari-euskirchen-v11.cismet.de",
  modelWMS:
    "https://starkregen-euskirchen-v11.cismet.de/geoserver/wms?SERVICE=WMS",
  timeSeriesAvailable: false,
  simulations: [
    {
      depthLayer: "starkregen:L_T100_v1.1_depth3857",
      velocityLayer: "starkregen:L_T100_v1.1_velocity3857",
      directionsLayer: "starkregen:L_T100_v1.1_direction3857",
      depthStyle: "starkregen:depth",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",

      animation: "T100_v1.1/",
      name: "Stärke 7",
      title: "Starkregen SRI 7 (40,8 - 44,8 l/m² in 1h)	",
      icon: "bar-chart",
      subtitle:
        "Simulation eines einstündigen Starkregens einer Belastung zwischen 40,8 und 44,8 Liter/m² Niederschlag (Starkregenindex SRI 7) für das hydrologische Einzugsgebiet des Kreises Euskirchens, statistische Wiederkehrzeit 100 Jahre",
    },
    {
      depthLayer: "starkregen:L_90mm_v1.1_depth3857",
      velocityLayer: "starkregen:L_90mm_v1.1_velocity3857",
      directionsLayer: "starkregen:L_90mmv1.1__direction3857",
      depthStyle: "starkregen:depth",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",

      animation: "90mm_v1.1/",
      name: "Stärke 9/10",
      title: "Starkregen SRI 9/10 (90 l/m² in 1h)	",
      icon: "bar-chart",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 90 Liter/m² Niederschlag (Starkregenindex SRI 9 bzw. 10) für das hydrologische Einzugsgebiet des Kreises Euskirchens",
    },
    {
      depthLayer: "starkregen:L_N2021_v1.1_depth3857",
      velocityLayer: "starkregen:L_N2021_v1.1_velocity3857",
      directionsLayer: "starkregen:L_N2021_v1.1_direction3857",
      depthStyle: "starkregen:depth",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",

      animation: "N2021_v1.1/",
      name: "14.7.2021",
      title: "Niederschlag 14.07.2021",
      icon: "bar-chart",
      subtitle:
        "Simulation der maßgeblichen Niederschlagsbelastung vom 14.07.2021 für das hydrologische Einzugsgebiet des Kreises Euskirchens",
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
      layerkey: "dtk@40",
      src: dtkBg,
      title: "DTK (bunt)",
    },
  ],
  heightsLegend: [
    { title: "20 cm", lt: 0.1, bg: "#AFCFF9" },
    { title: "40 cm", lt: 0.3, bg: "#FED27B" },
    { title: "75 cm", lt: 0.5, bg: "#E9B279" },
    { title: "100 cm", lt: 1.0, bg: "#DD8C7B" },
  ],
  velocityLegend: [
    { title: "0.5 m/s", lt: 0.1, bg: "#BEC356" },
    { title: "1 m/s", lt: 0.75, bg: "#DA723E" },
    { title: "2 m/s", lt: 1.5, bg: "#D64733" },
    { title: "4 m/s", lt: 3, bg: "#8F251B" },
  ],
  // heightsLegendBlue: [
  //   { title: "20 cm", lt: 0.05, bg: "#88B2EA" },
  //   { title: "40 cm", lt: 0.3, bg: "#508CE0" },
  //   { title: "75 cm", lt: 0.5, bg: "#3266B4" },
  //   { title: "100 cm", lt: 1.0, bg: "#5018B3" },
  // ],
  // velocityLegendOld: [
  //   { title: "0.1 m/s", lt: 0.05, bg: "#BEC356" },
  //   { title: "0,3 m/s", lt: 0.15, bg: "#DA723E" },
  //   { title: "0,5 m/s", lt: 0.4, bg: "#D64733" },
  //   { title: ">1 m/s", lt: 0.755, bg: "#8F251B" },
  // ],
  // getRoundedDepthValueStringForValue muss noch bzgl. Thhreshhold angepasst werden
  getRoundedDepthValueStringForValue: (featureValue) => {
    if (featureValue > 1.5) {
      return `> 150 cm`;
    } else if (featureValue < 0.1) {
      return `< 10 cm`;
    } else {
      return `ca. ${Math.round(featureValue * 10.0) * 10.0} cm`;
    }
  },
  // getRoundedVelocityValueStringForValue muss noch bzgl. Thhreshhold angepasst werden
  getRoundedVelocityValueStringForValue: (featureValue) => {
    if (featureValue > 6) {
      return `> 1 m/s`;
    } else if (featureValue < 0.2) {
      return `< 0,1 m/s`;
    } else {
      return `ca. ${(Math.round(featureValue * 10) / 10)
        .toString()
        .replace(".", ",")} m/s`;
    }
  },
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
