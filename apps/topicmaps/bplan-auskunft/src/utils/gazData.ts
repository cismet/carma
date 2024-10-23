import { md5FetchJSON, md5FetchText } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

import { host } from '../constants/bplaene';

export type ENDPOINT =
  | "adressen"
  | "aenderungsv"
  | "bezirke"
  | "bpklimastandorte"
  | "bplaene"
  | "ebikes"
  | "emob"
  | "geps"
  | "geps_reverse"
  | "kitas"
  | "prbr"
  | "no2"
  | "quartiere"
  | "pois";

export const getGazData = async (setGazData) => {
  const prefix = 'GazData';
  const sources: Partial<Record<ENDPOINT, string>> = {};

  sources.adressen = await md5FetchText(prefix, host + '/data/adressen.json');
  sources.bezirke = await md5FetchText(prefix, host + '/data/bezirke.json');
  sources.quartiere = await md5FetchText(prefix, host + '/data/quartiere.json');
  sources.pois = await md5FetchText(prefix, host + '/data/pois.json');
  sources.kitas = await md5FetchText(prefix, host + '/data/kitas.json');
  sources.bplaene = await md5FetchText(prefix, host + '/data/bplaene.json');

  const gazData = getGazDataForTopicIds(sources, [
    'pois',
    'kitas',
    'bezirke',
    'quartiere',
    'adressen',
    'bplaene',
  ]);

  setGazData(gazData);
};
