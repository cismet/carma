import { StopWords } from '../types';

const preps: StopWords = [
  'am',
  'an',
  'anstatt',
  'auf',
  'aus',
  'außerhalb',
  'bei',
  'bis',
  'durch',
  'für',
  'gegen',
  'hinter',
  'in',
  'innerhalb',
  'mit',
  'nach',
  'neben',
  'ohne',
  'seit',
  'über',
  'um',
  'unter',
  'von',
  'vor',
  'zu',
  'zwischen',
];

const articles: StopWords = ['der', 'die', 'das', 'den', 'dem', 'des'];

export const stopwords: StopWords = [...preps, ...articles];
