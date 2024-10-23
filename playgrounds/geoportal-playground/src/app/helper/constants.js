export const host = 'https://wupp-topicmaps-data.cismet.de';
export const APP_KEY = 'geoportal';
export const STORAGE_PREFIX = '1';

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
