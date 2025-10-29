import { starkregenConstants } from "@cismet-dev/react-cismap-envirometrics-maps/constants";
import {
  type MapStyleConfig,
  type PortalConfig,
  defaultHashCodecs,
  MapStyleKeys,
} from "@carma-appframeworks/portals";
import { WUPPERTAL, defaultGazDataConfig } from "@carma/resources";
import { Altitude, type Degrees } from "@carma/geo/types";
import type { MapView } from "@carma/mapping/engines/leaflet";
import type { TransitionConfig } from "@carma/mapping/map-transition-2d-3d";
// eslint-disable-next-line carma/no-direct-cesium
import { CameraStateHeadingPitchRoll } from "@carma/mapping/engines/cesium/api";

import topoBG from "../assets/map-bg/topo.png";
import citymapBG from "../assets/map-bg/citymap.png";
import mixedBG from "../assets/map-bg/mixed.png";

import {
  CESIUM_CONFIG,
  CONSTRUCTOR_OPTIONS,
} from "./cesium/cesium.config";

const overridingBaseLayerConf = {};

// Envirometrics-specific configuration (keep as is)
const envirometricsConfig = {
  hinweisDataUrl:
    import.meta.env.VITE_WUPP_ASSET_BASEURL + "/data/flooding_hinweise.json",
  animationSwitch: false,
  toggleSwitch: true,
  toggleTitle: "HW-Schutz",
  toggleEnabledText: "an",
  toggleDisabledText: "aus",
  possibleModes: [starkregenConstants.SHOW_HEIGHTS],
  upperleftX: 772081.984, //take a depth3857.tif and run gdalinfo on it get the pixelsize and upperleftcorner info from there
  upperleftY: 6691265.701,
  columnOrder: ["S", "T", "M"],
  pixelsize: 1.596954261858703,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: "https://rain-rasterfari-wuppertal.cismet.de",
  modelWMS:
    "https://hochwasser-wuppertal.cismet.de/geoserver/wms?version=1.1.1",

  simulations: [
    {
      getFeatureInfoLayer: (state) => {
        const hochwasserschutz = state.customInfoBoxToggleState;
        if (hochwasserschutz) {
          return "wupp:HQ10-50_3857";
        } else {
          return "wupp:HQ10-50_3857,wupp:HQ10-50_noHWS_3857";
        }
      },
      depthLayer: "wupp:HQ10-50_3857",
      depthStyle: "wupp:depth",
      gefaehrdungsLayer: "wupp:HQ10-50_noHWS_3857",
      name: "häufig",
      title: "häufiges Hochwasser (HQhäufig)",
      icon: "bar-chart",
      subtitle:
        "Simulierte Wassertiefen für Überschwemmungsgebiete beim häufigen, ca. 20-jährlichen Hochwasser mit / ohne Berücksichtigung tech. Hochwasserschutzeinrichtungen (HW-Schutz)",
    },

    {
      getFeatureInfoLayer: (state) => {
        const hochwasserschutz = state.customInfoBoxToggleState;
        if (hochwasserschutz) {
          return "wupp:HQ100_3857";
        } else {
          return "wupp:HQ100_3857,wupp:HQ100_noHWS_3857";
        }
      },
      depthLayer: "wupp:HQ100_3857",
      gefaehrdungsLayer: "wupp:HQ100_noHWS_3857",
      depthStyle: "wupp:depth",
      name: "100-jährlich",
      title: "100-jährliches Hochwasser (HQ100)",
      icon: "bar-chart",
      subtitle:
        "Simulierte Wassertiefen für Überschwemmungsgebiete beim 100-jährlichen Hochwasser mit / ohne Berücksichtigung tech. Hochwasserschutzeinrichtungen (HW-Schutz)",
    },
    {
      getLayer: (state) => "wupp:HQ500_3857",
      depthLayer: "wupp:HQ500_3857",
      depthStyle: "wupp:depth",
      name: "extrem",
      title: "Extremhochwasser (HQextrem)",
      icon: "bar-chart",
      subtitle:
        "Simulierte Wassertiefen für Überschwemmungsgebiete bei einem Extremhochwasser mit Versagen der tech. Hochwasserschutzeinrichtungen (HW-Schutz)",
    },
  ],
  backgrounds: [
    {
      layerkey: "wupp-plan-live@40",
      src: citymapBG,
      title: "Stadtplan",
    },
    {
      layerkey: "hillshade|bplan_abkg@30|rvrGrundriss@20",
      src: topoBG,
      title: "Top. Karte",
    },
    {
      layerkey: "rvrGrundriss@100|trueOrtho2024@75|rvrSchriftNT@100",
      src: mixedBG,
      title: "Luftbildkarte",
    },
  ],
  heightsLegend: [
    { title: "20 cm", lt: 0.1, bg: "#AFCFF9" },
    { title: "40 cm", lt: 0.3, bg: "#FED27B" },
    { title: "75 cm", lt: 0.5, bg: "#E9B279" },
    { title: "100 cm", lt: 1.0, bg: "#DD8C7B" },
  ],
  getRoundedDepthValueStringForValue: (featureValue) => {
    if (featureValue > 1.5) {
      return `> 150 cm`;
    } else if (featureValue < 0) {
      return `keine Daten`;
    } else if (featureValue < 0.1) {
      return `< 10 cm`;
    } else {
      return `ca. ${Math.round(featureValue * 10.0) * 10.0} cm`;
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
  animationEnabled: false,
};

// Minimal portal configuration for floodingmap
const portalConfig: PortalConfig = {
  hashConfig: [
    { hashParamKey: "lat", codec: defaultHashCodecs.lat },
    { hashParamKey: "lng", codec: defaultHashCodecs.lng },
    { hashParamKey: "zoom", codec: defaultHashCodecs.zoom },
  ],
  styleConfig: {
    defaultStyle: MapStyleKeys.TOPO,
    availableStyles: [MapStyleKeys.TOPO] as const,
  },
  mapStyleMappings: {
    cesium: {
      [MapStyleKeys.TOPO]: "lod2",
      [MapStyleKeys.AERIAL]: "lod2", // Use same style for aerial
    },
  },
  defaultView: {
    center: {
      lat: WUPPERTAL.position.latitude as Degrees,
      lng: WUPPERTAL.position.longitude as Degrees,
    },
    zoom: 15,
  },
  defaultCamera: {
    latitude: WUPPERTAL.position.latitude,
    longitude: WUPPERTAL.position.longitude,
    altitude: (WUPPERTAL.position.altitude + 10000) as Altitude.EllipsoidalWGS84Meters,
    heading: 0 as Degrees,
    pitch: -90 as Degrees,
    roll: 0 as Degrees,
  },
  homeView: {
    center: {
      lat: WUPPERTAL.position.latitude as Degrees,
      lng: WUPPERTAL.position.longitude as Degrees,
    },
    zoom: 18,
  },
  homeCamera: {
    latitude: (WUPPERTAL.position.latitude - 0.08) as Degrees,
    longitude: WUPPERTAL.position.longitude,
    altitude: (WUPPERTAL.position.altitude + 700) as Altitude.EllipsoidalWGS84Meters,
    heading: 0 as Degrees,
    pitch: -45 as Degrees,
    roll: 0 as Degrees,
  },
  cesium: CESIUM_CONFIG,
  leaflet: {
    zoomSnap: 0.5,
    zoomDelta: 0.5,
  },
  gazData: defaultGazDataConfig,
  overlay: {
    transparency: 0.8,
    color: "#ffffff",
  },
  transitions: {
    modeTo3d: {
      step4_fallbackGroundElevationM: 400,
      step1_prepare2dViewMaxZoom: 20,
      step1_zoomOutDurationMs: 700,
      step2_initialRenderTimeoutMs: 500,
      step3_resourceWaitTimeoutMs: 2000,
      step5_cssFadeInDurationMs: 1000,
      step6_cameraAnimationDurationMs: 2000,
    },
    modeTo2d: {
      step2_cameraTiltDurationFactorDeviationMs: 1500,
      step2_cameraTiltDurationFactorZoomMs: 500,
      step2_cameraTiltMaxDurationMs: 2000,
      step3_cssFadeOutDurationMs: 1000,
    },
  },
  topicMap: {
    infoBoxPixelWidth: 350,
  },
  appBasePath: import.meta.env.BASE_URL,
  iconPrefix: "https://www.wuppertal.de/geoportal/geoportal_icon_legends/",
  configBaseUrl: "https://ceepr.cismet.de/config/wuppertal/_dev_geoportal/",
  minMobileWidth: 600,
};

// Merge envirometrics config with portal config  
const config = {
  ...envirometricsConfig,
  ...portalConfig,
  // Add missing properties for backwards compatibility
  initialState,
  config: envirometricsConfig,
};

export default config;
