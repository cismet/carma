import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";
import citymapGrey from "./assets/images/rain-hazard-map-bg/citymapGrey.18b.png";
import orthoBg from "./assets/images/rain-hazard-map-bg/ortho.18.png";
import citymapBg from "./assets/images/rain-hazard-map-bg/citymap.18.png";

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
    rvr: {
      type: "wms",
      url: "https://geodaten.metropoleruhr.de/spw2/service",
      layers: "spw2_light",
      tiled: "false",
      version: "1.3.0",
    },
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
    },
  },
};

const config = {
  upperleftX: 961346.308,
  upperleftY: 6764262.003,
  pixelsize: 1.613622359521981,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  timeSeriesAvailable: true,
  rasterfariURL: "https://rasterfari-paderborn.cismet.de",
  modelWMS: "https://starkregen-paderborn.cismet.de/geoserver/wms?SERVICE=WMS",
  hideMeasurements: false,
  simulations: [
    {
      depthLayer: "starkregen:ST100_depth3857_max",
      depthTimeDimensionLayers: [
        "starkregen:ST100_depth3857_5",
        "starkregen:ST100_depth3857_10",
        "starkregen:ST100_depth3857_15",
        "starkregen:ST100_depth3857_20",
        "starkregen:ST100_depth3857_25",
        "starkregen:ST100_depth3857_30",
        "starkregen:ST100_depth3857_35",
        "starkregen:ST100_depth3857_40",
        "starkregen:ST100_depth3857_45",
        "starkregen:ST100_depth3857_50",
        "starkregen:ST100_depth3857_55",
        "starkregen:ST100_depth3857_60",
        "starkregen:ST100_depth3857_65",
        "starkregen:ST100_depth3857_70",
        "starkregen:ST100_depth3857_75",
        "starkregen:ST100_depth3857_80",
        "starkregen:ST100_depth3857_85",
        "starkregen:ST100_depth3857_90",
        "starkregen:ST100_depth3857_95",
        "starkregen:ST100_depth3857_100",
        "starkregen:ST100_depth3857_105",
        "starkregen:ST100_depth3857_110",
        "starkregen:ST100_depth3857_115",
        "starkregen:ST100_depth3857_120",
      ],
      depthTimeDimensionLayerDescriptions: [
        "00h 05m",
        "00h 10m",
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
      ],
      timeDimensionLayerX: [
        5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
        95, 100, 105, 110, 115, 120,
      ],

      velocityLayer: "starkregen:ST100_velocity3857_max",
      velocityTimeDimensionLayers: [
        "starkregen:ST100_velocity3857_5",
        "starkregen:ST100_velocity3857_10",
        "starkregen:ST100_velocity3857_15",
        "starkregen:ST100_velocity3857_20",
        "starkregen:ST100_velocity3857_25",
        "starkregen:ST100_velocity3857_30",
        "starkregen:ST100_velocity3857_35",
        "starkregen:ST100_velocity3857_40",
        "starkregen:ST100_velocity3857_45",
        "starkregen:ST100_velocity3857_50",
        "starkregen:ST100_velocity3857_55",
        "starkregen:ST100_velocity3857_60",
        "starkregen:ST100_velocity3857_65",
        "starkregen:ST100_velocity3857_70",
        "starkregen:ST100_velocity3857_75",
        "starkregen:ST100_velocity3857_80",
        "starkregen:ST100_velocity3857_85",
        "starkregen:ST100_velocity3857_90",
        "starkregen:ST100_velocity3857_95",
        "starkregen:ST100_velocity3857_100",
        "starkregen:ST100_velocity3857_105",
        "starkregen:ST100_velocity3857_110",
        "starkregen:ST100_velocity3857_115",
        "starkregen:ST100_velocity3857_120",
      ],
      velocityTimeDimensionLayerDescriptions: [
        "00h 05m",
        "00h 10m",
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
      ],
      directionsLayer: "starkregen:ST100_direction3857_max",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animationPrefix: "T100/",
      animationPostfix: "_max",

      name: "Stärke 7",
      icon: "bitbucket",
      title: "Starkregen SRI 7 (54,1 l/m² in 1h)",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 54,1 Liter/m² Niederschlag (Starkregenindex SRI 7) für das hydrologische Einzugsgebiet Paderborns, statistische Wiederkehrzeit 100 Jahre",
    },
    {
      depthLayer: "starkregen:S90mm_depth3857_max",
      depthTimeDimensionLayers: [
        "starkregen:S90mm_depth3857_5",
        "starkregen:S90mm_depth3857_10",
        "starkregen:S90mm_depth3857_15",
        "starkregen:S90mm_depth3857_20",
        "starkregen:S90mm_depth3857_25",
        "starkregen:S90mm_depth3857_30",
        "starkregen:S90mm_depth3857_35",
        "starkregen:S90mm_depth3857_40",
        "starkregen:S90mm_depth3857_45",
        "starkregen:S90mm_depth3857_50",
        "starkregen:S90mm_depth3857_55",
        "starkregen:S90mm_depth3857_60",
        "starkregen:S90mm_depth3857_65",
        "starkregen:S90mm_depth3857_70",
        "starkregen:S90mm_depth3857_75",
        "starkregen:S90mm_depth3857_80",
        "starkregen:S90mm_depth3857_85",
        "starkregen:S90mm_depth3857_90",
        "starkregen:S90mm_depth3857_95",
        "starkregen:S90mm_depth3857_100",
        "starkregen:S90mm_depth3857_105",
        "starkregen:S90mm_depth3857_110",
        "starkregen:S90mm_depth3857_115",
        "starkregen:S90mm_depth3857_120",
      ],
      depthTimeDimensionLayerDescriptions: [
        "00h 05m",
        "00h 10m",
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
      ],
      timeDimensionLayerX: [
        5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90,
        95, 100, 105, 110, 115, 120,
      ],

      velocityLayer: "starkregen:S90mm_velocity3857_max",
      velocityTimeDimensionLayers: [
        "starkregen:S90mm_velocity3857_5",
        "starkregen:S90mm_velocity3857_10",
        "starkregen:S90mm_velocity3857_15",
        "starkregen:S90mm_velocity3857_20",
        "starkregen:S90mm_velocity3857_25",
        "starkregen:S90mm_velocity3857_30",
        "starkregen:S90mm_velocity3857_35",
        "starkregen:S90mm_velocity3857_40",
        "starkregen:S90mm_velocity3857_45",
        "starkregen:S90mm_velocity3857_50",
        "starkregen:S90mm_velocity3857_55",
        "starkregen:S90mm_velocity3857_60",
        "starkregen:S90mm_velocity3857_65",
        "starkregen:S90mm_velocity3857_70",
        "starkregen:S90mm_velocity3857_75",
        "starkregen:S90mm_velocity3857_80",
        "starkregen:S90mm_velocity3857_85",
        "starkregen:S90mm_velocity3857_90",
        "starkregen:S90mm_velocity3857_95",
        "starkregen:S90mm_velocity3857_100",
        "starkregen:S90mm_velocity3857_105",
        "starkregen:S90mm_velocity3857_110",
        "starkregen:S90mm_velocity3857_115",
        "starkregen:S90mm_velocity3857_120",
      ],
      velocityTimeDimensionLayerDescriptions: [
        "00h 05m",
        "00h 10m",
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
      ],
      directionsLayer: "starkregen:S90mm_direction3857_max",
      depthStyle: "starkregen:depth-blue",
      velocityStyle: "starkregen:velocity",
      directionStyle: "starkregen:direction",
      animationPrefix: "90mm/",
      animationPostfix: "_max",
      name: "Stärke 10",
      icon: "bitbucket",
      title: "Starkregen SRI 10 (90 l/m² in 1h)",
      subtitle:
        "Simulation eines einstündigen Starkregens mit 90 Liter/m² Niederschlag (Starkregenindex SRI 10) für das hydrologische Einzugsgebiet Paderborns",
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
      layerkey_: "rvr@60",
      src: orthoBg,
      title: "Luftbildkarte",
    },
    {
      layerkey: "dtk@40",
      src: citymapBg,
      title: "DTK (bunt)",
    },
  ],
  heightsLegend: [
    { title: "20 cm", lt: 0.05, bg: "#88B2EA" },
    { title: "40 cm", lt: 0.3, bg: "#508CE0" },
    { title: "75 cm", lt: 0.5, bg: "#3266B4" },
    { title: "100 cm", lt: 1.0, bg: "#5018B3" },
  ],
  velocityLegend: [
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
  timeseriesInitialIndex: 0,
  timeseriesIntermediateValuesCount: 50,
  timeseriesAninationNumerator: 20,
};

const conf = { config, overridingBaseLayerConf, initialState };

export default conf;
