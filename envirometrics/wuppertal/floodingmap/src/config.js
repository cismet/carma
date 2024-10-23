import { starkregenConstants } from '@cismet-dev/react-cismap-envirometrics-maps/constants';
import topoBG from './assets/map-bg/topo.png';
import citymapBG from './assets/map-bg/citymap.png';
import mixedBG from './assets/map-bg/mixed.png';
const overridingBaseLayerConf = {};

const config = {
  hinweisDataUrl:
    'https://wunda-geoportal.cismet.de/data/flooding_hinweise.json',
  animationSwitch: false,
  toggleSwitch: true,
  toggleTitle: 'HW-Schutz',
  simulationTitle: 'Hochwasser',
  toggleEnabledText: 'an',
  toggleDisabledText: 'aus',
  possibleModes: [starkregenConstants.SHOW_HEIGHTS],
  upperleftX: 772081.984, //take a depth3857.tif and run gdalinfo on it get the pixelsize and upperleftcorner info from there
  upperleftY: 6691265.701,
  columnOrder: ['S', 'T', 'M'],
  pixelsize: 1.596954261858703,
  minAnimationZoom: 17,
  minFeatureInfoZoom: 19,
  rasterfariURL: 'https://rain-rasterfari-wuppertal.cismet.de',
  modelWMS:
    'https://hochwasser-wuppertal.cismet.de/geoserver/wms?version=1.1.1',

  simulations: [
    {
      getFeatureInfoLayer: (state) => {
        const hochwasserschutz = state.customInfoBoxToggleState;
        if (hochwasserschutz) {
          return 'wupp:HQ10-50_3857';
        } else {
          return 'wupp:HQ10-50_3857,wupp:HQ10-50_noHWS_3857';
        }
      },
      depthLayer: 'wupp:HQ10-50_3857',
      depthStyle: 'wupp:depth',
      gefaehrdungsLayer: 'wupp:HQ10-50_noHWS_3857',
      name: 'häufig',
      title: 'häufiges Hochwasser (HQhäufig)',
      icon: 'bar-chart',
      subtitle:
        'Simulierte Wassertiefen für Überschwemmungsgebiete beim häufigen, ca. 20-jährlichen Hochwasser mit / ohne Berücksichtigung tech. Hochwasserschutzeinrichtungen (HW-Schutz)',
    },

    {
      getFeatureInfoLayer: (state) => {
        const hochwasserschutz = state.customInfoBoxToggleState;
        if (hochwasserschutz) {
          return 'wupp:HQ100_3857';
        } else {
          return 'wupp:HQ100_3857,wupp:HQ100_noHWS_3857';
        }
      },
      depthLayer: 'wupp:HQ100_3857',
      gefaehrdungsLayer: 'wupp:HQ100_noHWS_3857',
      depthStyle: 'wupp:depth',
      name: '100-jährlich',
      title: '100-jährliches Hochwasser (HQ100)',
      icon: 'bar-chart',
      subtitle:
        'Simulierte Wassertiefen für Überschwemmungsgebiete beim 100-jährlichen Hochwasser mit / ohne Berücksichtigung tech. Hochwasserschutzeinrichtungen (HW-Schutz)',
    },
    {
      getLayer: (state) => 'wupp:HQ500_3857',
      depthLayer: 'wupp:HQ500_3857',
      depthStyle: 'wupp:depth',
      name: 'extrem',
      title: 'Extremhochwasser (HQextrem)',
      icon: 'bar-chart',
      subtitle:
        'Simulierte Wassertiefen für Überschwemmungsgebiete bei einem Extremhochwasser mit Versagen der tech. Hochwasserschutzeinrichtungen (HW-Schutz)',
    },
  ],
  backgrounds: [
    {
      layerkey: 'wupp-plan-live@40',
      src: citymapBG,
      title: 'Stadtplan',
    },
    {
      layerkey: 'hillshade|bplan_abkg@30|rvrGrundriss@20',
      src: topoBG,
      title: 'Top. Karte',
    },
    {
      layerkey: 'rvrGrundriss@100|trueOrtho2022@75|rvrSchriftNT@100',
      src: mixedBG,
      title: 'Luftbildkarte',
    },


  ],
  heightsLegend: [
    { title: '20 cm', lt: 0.1, bg: '#AFCFF9' },
    { title: '40 cm', lt: 0.3, bg: '#FED27B' },
    { title: '75 cm', lt: 0.5, bg: '#E9B279' },
    { title: '100 cm', lt: 1.0, bg: '#DD8C7B' },
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

export default { config, overridingBaseLayerConf, initialState };
