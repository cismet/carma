import { starkregenConstants } from '@cismet-dev/react-cismap-envirometrics-maps/constants';

import citymapGrey from './assets/images/rain-hazard-map-bg/citymapGrey.png';
import dtk from './assets/images/rain-hazard-map-bg/dtk.png';
import ortho from './assets/images/rain-hazard-map-bg/ortho.png';
import citymap from './assets/images/rain-hazard-map-bg/citymap.png';
const year = new Date().getFullYear();

const overridingBaseLayerConf = {
  namedStyles: {
    default: { opacity: 0.6 },
    night: {
      opacity: 0.9,
      'css-filter': 'filter:grayscale(0.9)brightness(0.9)invert(1)',
    },
    blue: {
      opacity: 1.0,
      'css-filter':
        'filter:sepia(0.5) hue-rotate(155deg) contrast(0.9) opacity(0.9) invert(0)',
    },
  },
  defaults: {
    wms: {
      format: 'image/png',
      tiled: true,
      maxZoom: 22,
      opacity: 0.6,
      version: '1.1.1',
    },
  },
  namedLayers: {
    rvr: {
      type: 'wms',
      url: 'https://geodaten.metropoleruhr.de/spw2/service',
      layers: 'spw2_light',
      tiled: false,
      version: '1.3.0',
      pane: 'backgroundLayers',
    },
    dtk: {
      type: 'wms',
      url: 'https://www.wms.nrw.de/geobasis/wms_nw_dtk',
      layers: 'nw_dtk_col',
      tiled: false,
      version: '1.3.0',
      pane: 'backgroundLayers',
    },
    nrwDOP: {
      type: 'wms',
      url: 'https://www.wms.nrw.de/geobasis/wms_nw_dop',
      layers: 'nw_dop_rgb',
      tiled: false,
      version: '1.1.1',
      pane: 'backgroundLayers',
    },
    cismetLight: {
      type: 'vector',
      attribution:
        'Hintergrundkarte basierend auf &copy; <a href="https://openmaptiles.org/">OpenMapTiles</a> Vektorkarte',
      style: 'https://omt-germany.cismet.de/styles/cismet-light/style.json',
      // style: "https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json",
      opacity: 0.2,
      pane: 'backgroundvectorLayers',
    },
    basemap_grey: {
      type: 'vector',
      style:
        'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_gry.json',
      attribution: '© basemap.de / BKG ' + year,
    },
    basemap_color: {
      type: 'vector',
      style:
        'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_col.json',
      attribution: '© basemap.de / BKG ' + year,
    },
    basemap_relief: {
      type: 'vector',
      style:
        'https://sgx.geodatenzentrum.de/gdz_basemapde_vektor/styles/bm_web_top.json',
      attribution: '© basemap.de / BKG ' + year,
    },
  },
};

const config = {
  upperleftX: 721056.999954317114316, //take a depth3857.tif and run gdalinfo on it get the pixelsize and upperleftcorner info from there
  upperleftY: 6662620.642159298062325,
  pixelsize: 1.594196651186911,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: 'https://rasterfari-korschenbroich.cismet.de',
  modelWMS:
    'https://starkregen-korschenbroich.cismet.de/geoserver/wms?SERVICE=WMS',
  timeSeriesAvailable: false,
  simulations: [
    {
      depthLayer: 'starkregen:L_SRI7_depth3857',
      velocityLayer: 'starkregen:L_SRI7_velocity3857',
      directionsLayer: 'starkregen:L_SRI7_direction3857',
      depthStyle: 'starkregen:depth-blue',
      velocityStyle: 'starkregen:velocity',
      directionStyle: 'starkregen:direction',

      animation: 'SRI7/',
      name: 'Stärke 7',
      title: 'Starkregen SRI 7 (37,2 - 38,2 l/m² in 1 h)',
      icon: 'bitbucket',
      subtitle:
        'Simulation eines einstündigen Starkregens einer Belastung zwischen 37,2 und 38,2 Liter/m² Niederschlag (Starkregenindex SRI 7) für das hydrologische Einzugsgebiet der Stadt Korschenbroich',
    },
    {
      depthLayer: 'starkregen:L_SRI11_depth3857',
      velocityLayer: 'starkregen:L_SRI11_velocity3857',
      directionsLayer: 'starkregen:L_SRI11_direction3857',
      depthStyle: 'starkregen:depth-blue',
      velocityStyle: 'starkregen:velocity',
      directionStyle: 'starkregen:direction',

      animation: 'SRI11/',
      name: 'Stärke 11',
      title: 'Starkregen SRI 11 (90 l/m² in 1 h)',
      icon: 'bitbucket',
      subtitle:
        'Simulation eines einstündigen Starkregens mit 90 Liter/m² Niederschlag (Starkregenindex SRI 11) für das hydrologische Einzugsgebiet der Stadt Korschenbroich',
    },
  ],
  backgrounds: [

    {
      layerkey: 'nrwDOP@60|rvr@30',
      src: ortho,
      title: 'Luftbildkarte',
    },
    {
      layerkey: 'dtk@100',
      src: dtk,
      title: 'DTK (bunt)',
    },
    {
      layerkey: 'basemap_color@70',
      src: citymap,
      title: 'Basiskarte (bunt)',
    },
  ],
  heightsLegend: [
    { title: '10 cm', lt: 0.05, bg: '#88B2EA' },
    { title: '30 cm', lt: 0.2, bg: '#508CE0' },
    { title: '50 cm', lt: 0.4, bg: '#3266B4' },
    { title: '100 cm', lt: 1.0, bg: '#5018B3' },
  ],
  velocityLegend: [
    { title: '0.3 m/s', lt: 0.18, bg: '#BEC356' },
    { title: '0.5 m/s', lt: 0.4, bg: '#DA723E' },
    { title: '1,3 m/s', lt: 0.75, bg: '#D64733' },
    { title: '2 m/s', lt: 1.5, bg: '#8F251B' },
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
    if (featureValue > 2) {
      return `> 2 m/s`;
    } else if (featureValue < 0.2) {
      return `< 0,2 m/s`;
    } else {
      return `ca. ${(Math.round(featureValue * 10) / 10)
        .toString()
        .replace('.', ',')} m/s`;
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
