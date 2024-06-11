export const host = 'https://wupp-topicmaps-data.cismet.de';
export const APP_KEY = 'geoportal';
export const STORAGE_PREFIX = '1';

export let POI_COLORS = {
  'Freizeit, Sport': '#194761',
  Mobilität: '#6BB6D7',
  'Erholung, Religion': '#094409',
  Gesellschaft: '#B0CBEC',
  Religion: '#0D0D0D',
  Gesundheit: '#CB0D0D',
  'Erholung, Freizeit': '#638555',
  Sport: '#0141CF',
  'Freizeit, Kultur': '#B27A08',
  'Gesellschaft, Kultur': '#E26B0A',
  'öffentliche Dienstleistungen': '#417DD4',
  Orientierung: '#BFBFBF',
  Bildung: '#FFC000',
  Stadtbild: '#695656',
  'Gesellschaft, öffentliche Dienstleistungen': '#569AD6',
  'Dienstleistungen, Freizeit': '#26978F',
  Dienstleistungen: '#538DD5',
  'Bildung, Freizeit': '#BBAA1E',
  Kinderbetreuung: '#00A0B0',
};

export const namedStyles = {
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
};
