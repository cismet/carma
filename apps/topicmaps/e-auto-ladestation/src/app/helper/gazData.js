import { md5FetchText } from 'react-cismap/tools/fetching';
import { getGazDataForTopicIds } from 'react-cismap/tools/gazetteerHelper';
import { host } from './constants';

export const getGazData = async (setGazData) => {
  const prefix = 'GazData';
  const sources = {};

  sources.adressen = await md5FetchText(prefix, host + '/data/adressen.json');
  sources.bezirke = await md5FetchText(prefix, host + '/data/bezirke.json');
  sources.quartiere = await md5FetchText(prefix, host + '/data/quartiere.json');
  sources.pois = await md5FetchText(prefix, host + '/data/pois.json');
  sources.emob = await md5FetchText(prefix, host + '/data/emob.json');

  const gazData = getGazDataForTopicIds(sources, [
    'emob',
    'pois',
    'bezirke',
    'quartiere',
    'adressen',
  ]);

  setGazData(gazData);
};
