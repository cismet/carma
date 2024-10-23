import { md5FetchText } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';

import { host } from '../constants/fnp';

export const getGazData = async (setGazData) => {
  const prefix = 'GazData';
  const sources: any = {};

  sources.adressen = await md5FetchText(prefix, host + '/data/adressen.json');
  sources.bezirke = await md5FetchText(prefix, host + '/data/bezirke.json');
  sources.quartiere = await md5FetchText(prefix, host + '/data/quartiere.json');
  sources.pois = await md5FetchText(prefix, host + '/data/pois.json');
  sources.kitas = await md5FetchText(prefix, host + '/data/kitas.json');
  sources.bplaene = await md5FetchText(prefix, host + '/data/bplaene.json');
  sources.aenderungsv = await md5FetchText(
    prefix,
    host + '/data/aenderungsv.json'
  );

  const gazData = getGazDataForTopicIds(sources, [
    'pois',
    'kitas',
    'bezirke',
    'quartiere',
    'adressen',
    'bplaene',
    'aenderungsv',
  ]);

  setGazData(gazData);
};
