import { stopwords } from './stopwords.de-de';
import { ENDPOINT, SourcesConfig } from '../types';

export { stopwords };

export const host = 'https://wupp-topicmaps-data.cismet.de';
const proj = '3857';

const createUrl = (endpoint: ENDPOINT) =>
  `${host}/data/${proj}/${endpoint}.json`;

export const gazDataPrefix = 'GazDataForStories';

export const sourcesConfig: SourcesConfig = {
  adressen: createUrl('adressen'),
  bezirke: createUrl('bezirke'),
  quartiere: createUrl('quartiere'),
  pois: createUrl('pois'),
  kitas: createUrl('kitas'),
};

export const titleMapConfig: Record<ENDPOINT, string>
 = {
    pois: 'POIS',
    bpklimastandorte: 'Klimastandorte',
    kitas: 'Kitas',
    bezirke: 'Bezirke',
    quartiere: 'Quartiere',
    adressen: 'Adressen',
  };
  