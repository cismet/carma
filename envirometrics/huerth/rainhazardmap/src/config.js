import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";
import citymapGrey from "./assets/images/rain-hazard-map-bg/citymapGrey.png";
import citymapBg from "./assets/images/rain-hazard-map-bg/citymap.png";
import orthoBg from "./assets/images/rain-hazard-map-bg/ortho.png";

const animationSettingsLookup = {
  17: { pathCorrection: 0.6, velocityScale: 1 / 200, fade: 90 / 100, age: 50 },
  18: { pathCorrection: 0.8, velocityScale: 1 / 400, fade: 90 / 100, age: 80 },
  19: { pathCorrection: 1, velocityScale: 1 / 800, fade: 95 / 100, age: 130 },
  20: {
    pathCorrection: 1.4,
    velocityScale: 1 / 1600,
    fade: 96 / 100,
    age: 160,
  },
  21: {
    pathCorrection: 1.8,
    velocityScale: 1 / 3200,
    fade: 96 / 100,
    age: 200,
  },
  22: { pathCorrection: 2, velocityScale: 1 / 4000, fade: 96 / 100, age: 200 },
};
const animationSettings = (zoom, paths) => {
  const rzoom = Math.round(zoom);
  return {
    paths: paths * animationSettingsLookup[rzoom].pathCorrection, //-- default 800
    fade: animationSettingsLookup[rzoom].fade, // 0 to 1 -- default 0.96
    velocityScale: animationSettingsLookup[rzoom].velocityScale, // -- default 1/ 5000
    maxAge: animationSettingsLookup[rzoom].age, // number of maximum frames per path  -- default 200
    width: 2, // number | function widthFor(value)  -- default 1.0
    duration: 20, // milliseconds per 'frame'  -- default 20,
    color: "#326C88", // html-color | function colorFor(value) [e.g. chromajs.scale]   -- default white
    //   color: "green", // html-color | function colorFor(value) [e.g. chromajs.scale]   -- default white
    uvCorrection: { u: -1, v: -1 },
  };
};

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
      opacity: 0.2,
    },
    basemap_grey: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
    },
    basemap_color: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json",
    },
    basemap_relief: {
      type: "vector",
      style:
        "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json",
    },
  },
};

const config = {
  upperleftX: 754053.508, //take a depth3857.tif and run gdalinfo on it get the pixelsize and upperleftcorner info from there
  upperleftY: 6605930.327,
  pixelsize: 1.58325705119869,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  // rasterfariURL: "https://starkregen-rasterfari-wuppertal.cismet.de",
  // modelWMS: "https://starkregen-maps-wuppertal.cismet.de/geoserver/wms?SERVICE=WMS",
  rasterfariURL: "https://rasterfari-huerth.cismet.de",
  modelWMS: "https://starkregen-huerth.cismet.de/geoserver/wms?SERVICE=WMS",
  timeSeriesAvailable: true,
  simulations: [
    {
      depthLayer: "starkregen:L_SRI7_depth3857",

      velocityLayer: "starkregen:L_SRI7_velocity3857",
      directionsLayer: "starkregen:L_SRI7_direction3857",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animationSettings,
      animation: "SRI7/",
      name: "Stärke 7",
      title: "Starkregen SRI 7 (47,3 l/m² in 1h)",
      icon: "bar-chart",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 47,3 Liter/m² Niederschlag (Starkregenindex SRI 7) für das Stadtgebiet Hürth, statistische Wiederkehrzeit 100 Jahre",
      depthTimeDimensionLayers: [
        "starkregen:L_SRI7_steps_depth3857_15",
        "starkregen:L_SRI7_steps_depth3857_20",
        "starkregen:L_SRI7_steps_depth3857_25",
        "starkregen:L_SRI7_steps_depth3857_30",
        "starkregen:L_SRI7_steps_depth3857_35",
        "starkregen:L_SRI7_steps_depth3857_40",
        "starkregen:L_SRI7_steps_depth3857_45",
        "starkregen:L_SRI7_steps_depth3857_50",
        "starkregen:L_SRI7_steps_depth3857_55",
        "starkregen:L_SRI7_steps_depth3857_60",
        "starkregen:L_SRI7_steps_depth3857_65",
        "starkregen:L_SRI7_steps_depth3857_70",
        "starkregen:L_SRI7_steps_depth3857_75",
        "starkregen:L_SRI7_steps_depth3857_80",
        "starkregen:L_SRI7_steps_depth3857_85",
        "starkregen:L_SRI7_steps_depth3857_90",
        "starkregen:L_SRI7_steps_depth3857_95",
        "starkregen:L_SRI7_steps_depth3857_100",
        "starkregen:L_SRI7_steps_depth3857_105",
        "starkregen:L_SRI7_steps_depth3857_110",
        "starkregen:L_SRI7_steps_depth3857_115",
        "starkregen:L_SRI7_steps_depth3857_120",
        "starkregen:L_SRI7_steps_depth3857_125",
        "starkregen:L_SRI7_steps_depth3857_130",
      ],
      depthTimeDimensionLayerDescriptions: [
        "00h 15m",
        "00h 20m",
        "00h 25m",
        "00h 30m",
        "00h 35m",
        "00h 40m",
        "00h 45m",
        "00h 50m",
        "00h 55m",
        "01h 00m",
        "01h 05m",
        "01h 09m",
        "01h 15m",
        "01h 20m",
        "01h 24m",
        "01h 30m",
        "01h 35m",
        "01h 40m",
        "01h 44m",
        "01h 50m",
        "01h 55m",
        "02h 00m",
        "02h 05m",
        "02h 10m",
      ],
      timeDimensionLayerX: [
        15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
        105, 110, 115, 120, 125, 130,
      ],
      velocityTimeDimensionLayers: [
        "starkregen:L_SRI7_steps_velocity3857_15",
        "starkregen:L_SRI7_steps_velocity3857_20",
        "starkregen:L_SRI7_steps_velocity3857_25",
        "starkregen:L_SRI7_steps_velocity3857_30",
        "starkregen:L_SRI7_steps_velocity3857_35",
        "starkregen:L_SRI7_steps_velocity3857_40",
        "starkregen:L_SRI7_steps_velocity3857_45",
        "starkregen:L_SRI7_steps_velocity3857_50",
        "starkregen:L_SRI7_steps_velocity3857_55",
        "starkregen:L_SRI7_steps_velocity3857_60",
        "starkregen:L_SRI7_steps_velocity3857_65",
        "starkregen:L_SRI7_steps_velocity3857_70",
        "starkregen:L_SRI7_steps_velocity3857_75",
        "starkregen:L_SRI7_steps_velocity3857_80",
        "starkregen:L_SRI7_steps_velocity3857_85",
        "starkregen:L_SRI7_steps_velocity3857_90",
        "starkregen:L_SRI7_steps_velocity3857_95",
        "starkregen:L_SRI7_steps_velocity3857_100",
        "starkregen:L_SRI7_steps_velocity3857_105",
        "starkregen:L_SRI7_steps_velocity3857_110",
        "starkregen:L_SRI7_steps_velocity3857_115",
        "starkregen:L_SRI7_steps_velocity3857_120",
        "starkregen:L_SRI7_steps_velocity3857_125",
        "starkregen:L_SRI7_steps_velocity3857_130",
      ],
      velocityTimeDimensionLayerDescriptions: [
        "00h 15m",
        "00h 20m",
        "00h 25m",
        "00h 30m",
        "00h 35m",
        "00h 40m",
        "00h 45m",
        "00h 50m",
        "00h 55m",
        "01h 00m",
        "01h 05m",
        "01h 09m",
        "01h 15m",
        "01h 20m",
        "01h 24m",
        "01h 30m",
        "01h 35m",
        "01h 40m",
        "01h 44m",
        "01h 50m",
        "01h 55m",
        "02h 00m",
        "02h 05m",
        "02h 10m",
      ],
    },
    {
      depthLayer: "starkregen:L_SRI10_depth3857",

      velocityLayer: "starkregen:L_SRI10_velocity3857",
      directionsLayer: "starkregen:L_SRI10_direction3857",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animationSettings,
      animation: "SRI10/",
      name: "Stärke 10",
      title: "Starkregen SRI 10 (90 l/m² in 1h)",
      icon: "bitbucket",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 90 Liter/m² Niederschlag (Starkregenindex SRI 10) für das Stadtgebiet Hürth",
      depthTimeDimensionLayers: [
        "starkregen:L_SRI10_steps_depth3857_15",
        "	starkregen:L_SRI10_steps_depth3857_20",
        "starkregen:L_SRI10_steps_depth3857_25",
        "starkregen:L_SRI10_steps_depth3857_30",
        "starkregen:L_SRI10_steps_depth3857_35",
        "starkregen:L_SRI10_steps_depth3857_40",
        "starkregen:L_SRI10_steps_depth3857_45",
        "starkregen:L_SRI10_steps_depth3857_50",
        "starkregen:L_SRI10_steps_depth3857_55",
        "starkregen:L_SRI10_steps_depth3857_60",
        "starkregen:L_SRI10_steps_depth3857_65",
        "starkregen:L_SRI10_steps_depth3857_70",
        "starkregen:L_SRI10_steps_depth3857_75",
        "starkregen:L_SRI10_steps_depth3857_80",
        "starkregen:L_SRI10_steps_depth3857_85",
        "starkregen:L_SRI10_steps_depth3857_90",
        "starkregen:L_SRI10_steps_depth3857_95",
        "starkregen:L_SRI10_steps_depth3857_100",
        "starkregen:L_SRI10_steps_depth3857_105",
        "starkregen:L_SRI10_steps_depth3857_110",
        "starkregen:L_SRI10_steps_depth3857_115",
        "starkregen:L_SRI10_steps_depth3857_120",
        "starkregen:L_SRI10_steps_depth3857_125",
        "starkregen:L_SRI10_steps_depth3857_130",
      ],
      depthTimeDimensionLayerDescriptions: [
        "00h 15m",
        "00h 20m",
        "00h 25m",
        "00h 30m",
        "00h 35m",
        "00h 40m",
        "00h 45m",
        "00h 50m",
        "00h 55m",
        "01h 00m",
        "01h 05m",
        "01h 09m",
        "01h 15m",
        "01h 20m",
        "01h 24m",
        "01h 30m",
        "01h 35m",
        "01h 40m",
        "01h 44m",
        "01h 50m",
        "01h 55m",
        "02h 00m",
        "02h 05m",
        "02h 10m",
      ],
      timeDimensionLayerX: [
        15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100,
        105, 110, 115, 120, 125, 130,
      ],
      velocityTimeDimensionLayers: [
        "starkregen:L_SRI10_steps_velocity3857_15",
        "starkregen:L_SRI10_steps_velocity3857_20",
        "starkregen:L_SRI10_steps_velocity3857_25",
        "starkregen:L_SRI10_steps_velocity3857_30",
        "starkregen:L_SRI10_steps_velocity3857_35",
        "starkregen:L_SRI10_steps_velocity3857_40",
        "starkregen:L_SRI10_steps_velocity3857_45",
        "starkregen:L_SRI10_steps_velocity3857_50",
        "starkregen:L_SRI10_steps_velocity3857_55",
        "starkregen:L_SRI10_steps_velocity3857_60",
        "starkregen:L_SRI10_steps_velocity3857_65",
        "starkregen:L_SRI10_steps_velocity3857_70",
        "starkregen:L_SRI10_steps_velocity3857_75",
        "starkregen:L_SRI10_steps_velocity3857_80",
        "starkregen:L_SRI10_steps_velocity3857_85",
        "starkregen:L_SRI10_steps_velocity3857_90",
        "starkregen:L_SRI10_steps_velocity3857_95",
        "starkregen:L_SRI10_steps_velocity3857_100",
        "starkregen:L_SRI10_steps_velocity3857_105",
        "starkregen:L_SRI10_steps_velocity3857_110",
        "starkregen:L_SRI10_steps_velocity3857_115",
        "starkregen:L_SRI10_steps_velocity3857_120",
        "starkregen:L_SRI10_steps_velocity3857_125",
        "starkregen:L_SRI10_steps_velocity3857_130",
      ],
      velocityTimeDimensionLayerDescriptions: [
        "00h 15m",
        "00h 20m",
        "00h 25m",
        "00h 30m",
        "00h 35m",
        "00h 40m",
        "00h 45m",
        "00h 50m",
        "00h 55m",
        "01h 00m",
        "01h 05m",
        "01h 09m",
        "01h 15m",
        "01h 20m",
        "01h 24m",
        "01h 30m",
        "01h 35m",
        "01h 40m",
        "01h 44m",
        "01h 50m",
        "01h 55m",
        "02h 00m",
        "02h 05m",
        "02h 10m",
      ],
    },
  ],
  backgrounds: [
    {
      layerkey: "basemap_grey@20",
      src: citymapGrey,
      title: "Stadtplan (grau)",
    },
    {
      layerkey: "nrwDOP@60|basemap_grey@100",
      src: orthoBg,
      title: "Luftbildkarte",
    },
    {
      layerkey: "basemap_relief@30",
      src: citymapBg,
      title: "Stadtplan (bunt)",
    },
  ],
  heightsLegend: [
    { title: "20 cm", lt: 0.0, bg: "#88B2EA" },
    { title: "40 cm", lt: 0.3, bg: "#508CE0" },
    { title: "75 cm", lt: 0.575, bg: "#3266B4" },
    { title: "100 cm", lt: 0.875, bg: "#5018B3" },
  ],
  velocityLegend: [
    { title: "0.5 m/s", lt: 0.0, bg: "#BEC356" },
    { title: "1 m/s", lt: 0.75, bg: "#DA723E" },
    { title: "2 m/s", lt: 1.5, bg: "#D64733" },
    { title: "3 m/s", lt: 2.5, bg: "#8F251B" },
  ],
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
  timeseriesIntermediateValuesCount: 50,
  timeseriesAninationNumerator: 20,
};

export default { config, overridingBaseLayerConf, initialState };
